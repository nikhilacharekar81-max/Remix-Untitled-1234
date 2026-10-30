import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Wallet,
  DollarSign,
  ShieldCheck,
  CreditCard,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Download,
  Building2,
  Plus,
  FileText,
  Calculator,
  Settings,
  CornerRightUp,
  Trash2,
  Star,
  Search,
  Eye,
  X,
  Info,
  Check
} from 'lucide-react';
import { Gig, Order, Project, Proposal, UserAccount, WorkstreamOffer } from '../types';
import { getAuthToken, setAuthToken, requestDemoSession } from '../utils/authToken';
import { getDeviceId } from '../utils/deviceId';

interface PaymentsModuleProps {
  gigs?: Gig[];
  orders?: Order[];
  offers?: WorkstreamOffer[];
  projects?: Project[];
  proposals?: Proposal[];
  users?: UserAccount[];
  currentUser?: UserAccount | null;
  platformFee?: number;
  clientServiceFee?: number;
  smallOrderFeeThreshold?: number;
  smallOrderFeeAmount?: number;
  escrowProtectionDays?: number;
  navigate?: (path: string, e?: React.MouseEvent) => void;
  onOpenWorkstream?: (order: Order) => void;
  onBalanceUpdate?: () => void;
}

type TopPaymentTab = 'my_money' | 'statements' | 'invoices' | 'transactions' | 'methods';
type MoneyBoxTab = 'account' | 'buyer_escrow' | 'freelancer_escrow';
type EscrowModalMode = 'buyer_deposit' | 'seller_request' | 'wallet_topup';

interface EnrichedOrderFinancialRow extends Order {
  buyerName?: string;
  sellerName?: string;
  inEscrow?: number;
  escrowFunded?: number;
  depositRequests?: WorkstreamOffer[];
  pendingInvoices?: WorkstreamOffer[];
  paidInvoiceAmount?: number;
  hasPaidInvoice?: boolean;
}

function formatUsd(amount: number | undefined | null): string {
  const num = Number(amount || 0);
  if (!Number.isFinite(num)) return '$0.00';
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompactUsd(amount: number | undefined | null): string {
  const num = Number(amount || 0);
  if (!Number.isFinite(num)) return '$0.00';
  if (num >= 10000) {
    return `$${(num / 1000).toFixed(1)}K`;
  }
  return formatUsd(num);
}

export const PaymentsModule: React.FC<PaymentsModuleProps> = ({
  gigs = [],
  orders = [],
  offers = [],
  projects = [],
  proposals = [],
  users = [],
  currentUser,
  platformFee = 20,
  clientServiceFee = 1,
  smallOrderFeeThreshold = 200,
  smallOrderFeeAmount = 1,
  escrowProtectionDays = 14,
  navigate,
  onOpenWorkstream,
  onBalanceUpdate
}) => {
  // Primary navigation tabs matching the screenshots
  const [activeTab, setActiveTab] = useState<TopPaymentTab>('my_money');
  // 3-card selection inside "My Money"
  const [selectedMoneyBox, setSelectedMoneyBox] = useState<MoneyBoxTab>('account');

  // Toast feedback
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => {
      setToast(prev => (prev?.text === text ? null : prev));
    }, 4500);
  }, []);

  // Live financial snapshot & lists
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payoutsList, setPayoutsList] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [liveOffers, setLiveOffers] = useState<WorkstreamOffer[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Withdrawal states
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [withdrawMethod, setWithdrawMethod] = useState<string>('Bank Transfer (USD)');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [codeRequired, setCodeRequired] = useState(true);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  // Escrow Deposit / Request Deposit / Wallet Deposit Modal
  const [showEscrowModal, setShowEscrowModal] = useState(false);
  const [escrowModalMode, setEscrowModalMode] = useState<EscrowModalMode>('wallet_topup');
  const [selectedEscrowOrderId, setSelectedEscrowOrderId] = useState<string>('');
  const [escrowDepositAmount, setEscrowDepositAmount] = useState<string>('');
  const [escrowDepositTitle, setEscrowDepositTitle] = useState<string>('');
  const [escrowDepositNote, setEscrowDepositNote] = useState<string>('');
  const [escrowFundSource, setEscrowFundSource] = useState<'wallet' | 'instant_deposit'>('wallet');
  const [isSubmittingEscrow, setIsSubmittingEscrow] = useState(false);
  const [escrowModalError, setEscrowModalError] = useState<string | null>(null);

  // Create Invoice Modal
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);
  const [invoiceMode, setInvoiceMode] = useState<'workstream' | 'custom'>('workstream');
  const [invoiceOrderId, setInvoiceOrderId] = useState<string>('');
  const [invoiceTitle, setInvoiceTitle] = useState<string>('');
  const [invoiceAmount, setInvoiceAmount] = useState<string>('');
  const [invoiceNote, setInvoiceNote] = useState<string>('');
  const [invoiceRecipientName, setInvoiceRecipientName] = useState<string>('');
  const [invoiceRecipientEmail, setInvoiceRecipientEmail] = useState<string>('');
  const [invoiceDueDate, setInvoiceDueDate] = useState<string>(() =>
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [createInvoiceError, setCreateInvoiceError] = useState<string | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<any | null>(null);

  // Earnings Calculator Modal
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [calcInputAmount, setCalcInputAmount] = useState<string>('100');
  const [calcMode, setCalcMode] = useState<'gross_to_net' | 'net_to_gross'>('gross_to_net');

  // Clearing Period Learn More Modal
  const [showLearnMoreModal, setShowLearnMoreModal] = useState(false);

  // Add Payment Method Modal
  const [showAddMethodModal, setShowAddMethodModal] = useState(false);
  const [newMethodType, setNewMethodType] = useState<'Bank Transfer' | 'PayPal' | 'Stripe' | 'Wire Transfer'>('Bank Transfer');
  const [newMethodName, setNewMethodName] = useState<string>('');
  const [newMethodAccountNumber, setNewMethodAccountNumber] = useState<string>('');
  const [newMethodRoutingNumber, setNewMethodRoutingNumber] = useState<string>('');
  const [newMethodEmail, setNewMethodEmail] = useState<string>('');
  const [newMethodDefault, setNewMethodDefault] = useState<boolean>(true);
  const [isSavingMethod, setIsSavingMethod] = useState<boolean>(false);
  const [methodError, setMethodError] = useState<string | null>(null);

  // Filters for Statements, Invoices, Transactions
  const [statementPeriod, setStatementPeriod] = useState<'current_month' | 'past_two_months' | 'ytd' | 'all_time'>('all_time');
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'received' | 'sent' | 'paid' | 'pending'>('all');
  const [txSearch, setTxSearch] = useState<string>('');
  const [txTypeFilter, setTxTypeFilter] = useState<string>('all');
  const [processingOfferId, setProcessingOfferId] = useState<string | null>(null);

  const ensureValidAuthHeaders = useCallback(async (forceRefresh = false): Promise<Record<string, string>> => {
    let token = getAuthToken();
    if (currentUser?.id) {
      let tokenUserId: string | null = null;
      let tokenUserRole: string | null = null;
      if (token) {
        try {
          const [b64] = token.split('.');
          if (b64 && typeof atob === 'function') {
            const payload = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/')));
            if (payload?.id) tokenUserId = String(payload.id);
            if (payload?.role) tokenUserRole = String(payload.role);
          }
        } catch {}
      }
      const isTokenAdmin = Boolean(tokenUserRole && ['admin', 'super_admin', 'support'].includes(tokenUserRole));
      const isPrivileged = ['admin', 'super_admin', 'support'].includes(currentUser.role || '');
      const needsSession = forceRefresh || !token || (!isTokenAdmin && tokenUserId !== currentUser.id);
      if (needsSession && !isPrivileged) {
        const session = await requestDemoSession(currentUser.id);
        if (session?.token) {
          token = session.token;
          setAuthToken(token);
        }
      }
    }
    return {
      'x-device-id': getDeviceId(),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }, [currentUser?.id, currentUser?.role]);

  const fetchData = useCallback(async () => {
    if (!currentUser?.id) return;
    setIsLoadingData(true);
    try {
      let headers = await ensureValidAuthHeaders(false);
      let snapRes = await fetch(`/api/payments/user/${currentUser.id}`, { headers });
      if (snapRes.status === 401 || snapRes.status === 403) {
        headers = await ensureValidAuthHeaders(true);
        snapRes = await fetch(`/api/payments/user/${currentUser.id}`, { headers });
      }

      const [txRes, invRes, payRes, methRes, offRes] = await Promise.all([
        fetch(`/api/payments/transactions/${currentUser.id}`, { headers }),
        fetch(`/api/payments/invoices/${currentUser.id}`, { headers }),
        fetch('/api/payouts', { headers }),
        fetch(`/api/payments/methods/${currentUser.id}`, { headers }),
        fetch('/api/offers', { headers })
      ]);

      if (snapRes.ok) {
        const snapData = await snapRes.json();
        setSnapshot(snapData);
        if (Array.isArray(snapData.paymentMethods)) {
          setPaymentMethods(snapData.paymentMethods);
        }
      }
      if (txRes.ok) {
        const txData = await txRes.json();
        if (Array.isArray(txData)) setTransactions(txData);
      }
      if (invRes.ok) {
        const invData = await invRes.json();
        if (Array.isArray(invData)) setInvoices(invData);
      }
      if (payRes.ok) {
        const payData = await payRes.json();
        if (Array.isArray(payData)) setPayoutsList(payData);
      }
      if (methRes.ok) {
        const methData = await methRes.json();
        if (Array.isArray(methData)) setPaymentMethods(methData);
      }
      if (offRes.ok) {
        const offData = await offRes.json();
        if (Array.isArray(offData)) setLiveOffers(offData);
      }
    } catch (e) {
      console.error('Error fetching financial data:', e);
    } finally {
      setIsLoadingData(false);
    }
  }, [currentUser?.id, ensureValidAuthHeaders]);

  const ordersActivitySignature = useMemo(() => {
    if (!currentUser?.id) return '';
    const relevantOrders = orders
      .filter(o => o.buyerId === currentUser.id || o.sellerId === currentUser.id)
      .map(o => `${o.id}:${o.status}:${o.amount}:${o.completedAt || ''}`)
      .sort()
      .join('|');
    const relevantOffers = offers
      .map(off => `${off.id}:${off.status}:${off.amount}`)
      .sort()
      .join('|');
    return `${currentUser.id}::${relevantOrders}::${relevantOffers}`;
  }, [currentUser?.id, orders, offers]);

  useEffect(() => {
    if (snapshot && snapshot.userId && snapshot.userId !== currentUser?.id) {
      setSnapshot(null);
    }
    fetchData();
  }, [fetchData, ordersActivitySignature, currentUser?.id]);

  // Merge offers from props and live /api/offers
  const allOffers = useMemo(() => {
    const byId = new Map<string, WorkstreamOffer>();
    for (const o of offers) {
      if (o?.id) byId.set(o.id, o);
    }
    for (const o of liveOffers) {
      if (o?.id) byId.set(o.id, o);
    }
    return Array.from(byId.values());
  }, [offers, liveOffers]);

  const userMap = useMemo(() => {
    return new Map(users.map(u => [u.id, u]));
  }, [users]);

  const activeEscrowStatuses = useMemo(
    () => new Set(['funded_in_escrow', 'in_progress', 'delivered', 'revision', 'disputed', 'draft_review', 'work_in_progress']),
    []
  );

  const activeSnapshot = useMemo(() => {
    if (snapshot && (!snapshot.userId || snapshot.userId === currentUser?.id)) {
      return snapshot;
    }
    return null;
  }, [snapshot, currentUser?.id]);

  // Build authoritative Buyer Orders list for "My Buyer Escrow"
  const buyerOrderRows = useMemo<EnrichedOrderFinancialRow[]>(() => {
    if (Array.isArray(activeSnapshot?.buyerOrdersSummary) && activeSnapshot.buyerOrdersSummary.length > 0) {
      return activeSnapshot.buyerOrdersSummary;
    }
    if (!currentUser?.id) return [];
    return orders
      .filter(o => o.buyerId === currentUser.id && o.status !== 'cancelled')
      .map(o => {
        const ordOffers = allOffers.filter(off => off.orderId === o.id);
        const seller = userMap.get(o.sellerId);
        const inEscrow = activeEscrowStatuses.has(o.status) ? Number(o.amount || 0) : 0;
        const depositRequests = ordOffers.filter(off => (off.kind === 'deposit' || off.kind === 'proposal') && off.status === 'pending');
        const pendingInvoices = ordOffers.filter(off => off.kind === 'invoice' && off.status === 'pending');
        const paidInvoices = ordOffers.filter(off => off.kind === 'invoice' && (off.status === 'paid' || off.status === 'accepted'));
        const paidInvoiceAmount = o.status === 'completed'
          ? Number(o.amount || 0)
          : paidInvoices.reduce((s, off) => s + Number(off.amount || 0), 0);
        return {
          ...o,
          sellerName: seller?.name || (o as any).sellerName || o.sellerUsername || 'Freelancer',
          buyerName: currentUser.name,
          inEscrow,
          escrowFunded: o.status !== 'payment_pending' ? Number(o.amount || 0) : 0,
          depositRequests,
          pendingInvoices,
          paidInvoiceAmount,
          hasPaidInvoice: o.status === 'completed' || paidInvoices.length > 0
        };
      });
  }, [activeSnapshot?.buyerOrdersSummary, currentUser, orders, allOffers, userMap, activeEscrowStatuses]);

  // Build authoritative Freelancer Orders list for "My Freelancer Escrow"
  const freelancerOrderRows = useMemo<EnrichedOrderFinancialRow[]>(() => {
    if (Array.isArray(activeSnapshot?.freelancerOrdersSummary) && activeSnapshot.freelancerOrdersSummary.length > 0) {
      return activeSnapshot.freelancerOrdersSummary;
    }
    if (!currentUser?.id) return [];
    return orders
      .filter(o => o.sellerId === currentUser.id && o.status !== 'cancelled')
      .map(o => {
        const ordOffers = allOffers.filter(off => off.orderId === o.id);
        const buyer = userMap.get(o.buyerId);
        const inEscrow = activeEscrowStatuses.has(o.status) ? Number(o.amount || 0) : 0;
        const depositRequests = ordOffers.filter(off => (off.kind === 'deposit' || off.kind === 'proposal') && off.status === 'pending');
        const pendingInvoices = ordOffers.filter(off => off.kind === 'invoice' && off.status === 'pending');
        const paidInvoices = ordOffers.filter(off => off.kind === 'invoice' && (off.status === 'paid' || off.status === 'accepted'));
        const paidInvoiceAmount = o.status === 'completed'
          ? Number(o.amount || 0)
          : paidInvoices.reduce((s, off) => s + Number(off.amount || 0), 0);
        return {
          ...o,
          buyerName: buyer?.name || (o as any).buyerName || o.buyerUsername || 'Buyer',
          sellerName: currentUser.name,
          inEscrow,
          escrowFunded: o.status !== 'payment_pending' ? Number(o.amount || 0) : 0,
          depositRequests,
          pendingInvoices,
          paidInvoiceAmount,
          hasPaidInvoice: o.status === 'completed' || paidInvoices.length > 0
        };
      });
  }, [activeSnapshot?.freelancerOrdersSummary, currentUser, orders, allOffers, userMap, activeEscrowStatuses]);

  const effectivePlatformFee = useMemo(() => {
    if (typeof activeSnapshot?.commissionPercent === 'number' && activeSnapshot.commissionPercent > 0) {
      return activeSnapshot.commissionPercent;
    }
    return platformFee > 0 ? platformFee : 20;
  }, [activeSnapshot?.commissionPercent, platformFee]);

  const effectiveClientServiceFee = useMemo(() => {
    if (typeof activeSnapshot?.buyerFeePercent === 'number' && activeSnapshot.buyerFeePercent >= 0) {
      return activeSnapshot.buyerFeePercent;
    }
    return clientServiceFee > 0 ? clientServiceFee : 1;
  }, [activeSnapshot?.buyerFeePercent, clientServiceFee]);

  const effectiveSmallOrderThreshold = useMemo(() => {
    if (typeof activeSnapshot?.smallOrderFeeThreshold === 'number' && activeSnapshot.smallOrderFeeThreshold >= 0) {
      return activeSnapshot.smallOrderFeeThreshold;
    }
    return smallOrderFeeThreshold > 0 ? smallOrderFeeThreshold : 200;
  }, [activeSnapshot?.smallOrderFeeThreshold, smallOrderFeeThreshold]);

  const effectiveSmallOrderFee = useMemo(() => {
    if (typeof activeSnapshot?.smallOrderFeeAmount === 'number' && activeSnapshot.smallOrderFeeAmount >= 0) {
      return activeSnapshot.smallOrderFeeAmount;
    }
    return smallOrderFeeAmount > 0 ? smallOrderFeeAmount : 1;
  }, [activeSnapshot?.smallOrderFeeAmount, smallOrderFeeAmount]);

  // Live balances & metrics (strictly $ USD)
  const availableBalance = useMemo(() => {
    if (typeof activeSnapshot?.availableBalance === 'number') return activeSnapshot.availableBalance;
    return Number(currentUser?.walletBalance ?? 0);
  }, [activeSnapshot?.availableBalance, currentUser?.walletBalance]);

  const buyerEscrowTotal = useMemo(() => {
    if (typeof activeSnapshot?.buyerEscrowAmount === 'number') return activeSnapshot.buyerEscrowAmount;
    return buyerOrderRows.reduce((sum, r) => sum + Number(r.inEscrow || 0), 0);
  }, [activeSnapshot?.buyerEscrowAmount, buyerOrderRows]);

  const freelancerEscrowTotal = useMemo(() => {
    if (typeof activeSnapshot?.freelancerEscrowAmount === 'number') return activeSnapshot.freelancerEscrowAmount;
    return freelancerOrderRows.reduce((sum, r) => sum + Number(r.inEscrow || 0), 0);
  }, [activeSnapshot?.freelancerEscrowAmount, freelancerOrderRows]);

  const paidThisMonth = useMemo(() => {
    if (typeof activeSnapshot?.paidThisMonth === 'number') return activeSnapshot.paidThisMonth;
    const ym = new Date().toISOString().slice(0, 7);
    return buyerOrderRows
      .filter(o => {
        const actMonth = String(o.completedAt || (o as any).updatedAt || o.createdAt || '').slice(0, 7);
        const crtMonth = String(o.createdAt || '').slice(0, 7);
        return (actMonth === ym || crtMonth === ym) && o.status !== 'payment_pending' && (o.status as string) !== 'pending';
      })
      .reduce((sum, o) => sum + Number(o.amount || 0), 0);
  }, [activeSnapshot?.paidThisMonth, buyerOrderRows]);

  const paidToDate = useMemo(() => {
    if (typeof activeSnapshot?.paidToDate === 'number') return activeSnapshot.paidToDate;
    return buyerOrderRows
      .filter(o => o.status !== 'payment_pending' && (o.status as string) !== 'pending')
      .reduce((sum, o) => sum + Number(o.amount || 0), 0);
  }, [activeSnapshot?.paidToDate, buyerOrderRows]);

  const resolveRowNetEarnings = useCallback(
    (o: EnrichedOrderFinancialRow) => {
      if (typeof (o as any).freelancerNetEarned === 'number' && (o as any).freelancerNetEarned > 0) {
        return (o as any).freelancerNetEarned;
      }
      if (typeof (o.feeBreakdown as any)?.freelancerNet === 'number') {
        return Number((o.feeBreakdown as any).freelancerNet);
      }
      const netRate = (100 - effectivePlatformFee) / 100;
      return Number((Number(o.amount || 0) * netRate).toFixed(2));
    },
    [effectivePlatformFee]
  );

  const earnedThisMonth = useMemo(() => {
    if (typeof activeSnapshot?.earnedThisMonth === 'number') return activeSnapshot.earnedThisMonth;
    const ym = new Date().toISOString().slice(0, 7);
    return freelancerOrderRows
      .filter(o => {
        if (o.status !== 'completed') return false;
        const compMonth = String(o.completedAt || (o as any).updatedAt || o.createdAt || '').slice(0, 7);
        const crtMonth = String(o.createdAt || '').slice(0, 7);
        return compMonth === ym || crtMonth === ym;
      })
      .reduce((sum, o) => sum + resolveRowNetEarnings(o), 0);
  }, [activeSnapshot?.earnedThisMonth, freelancerOrderRows, resolveRowNetEarnings]);

  const earnedToDate = useMemo(() => {
    if (typeof activeSnapshot?.earnedToDate === 'number') return activeSnapshot.earnedToDate;
    return freelancerOrderRows
      .filter(o => o.status === 'completed')
      .reduce((sum, o) => sum + resolveRowNetEarnings(o), 0);
  }, [activeSnapshot?.earnedToDate, freelancerOrderRows, resolveRowNetEarnings]);

  const earnedPastTwoMonths = useMemo(() => {
    if (typeof activeSnapshot?.earnedPastTwoMonths === 'number') return activeSnapshot.earnedPastTwoMonths;
    const twoMonthsAgoDate = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    return freelancerOrderRows
      .filter(o => o.status === 'completed' && String(o.completedAt || (o as any).updatedAt || o.createdAt || '').slice(0, 10) >= twoMonthsAgoDate)
      .reduce((sum, o) => sum + resolveRowNetEarnings(o), 0);
  }, [activeSnapshot?.earnedPastTwoMonths, freelancerOrderRows, resolveRowNetEarnings]);

  const clearingDays = useMemo(() => {
    return Number(activeSnapshot?.clearingPeriodDays || escrowProtectionDays || 14);
  }, [activeSnapshot?.clearingPeriodDays, escrowProtectionDays]);

  const handleOpenOrderWorkstream = (ord: Order) => {
    if (onOpenWorkstream) {
      onOpenWorkstream(ord);
    } else if (navigate) {
      navigate(`/messages/${ord.id}`);
    }
  };

  // Open Escrow Deposit Modal for Buyer Order, Seller Deposit Request, or Wallet Deposit
  const openEscrowDepositModal = (
    mode: EscrowModalMode,
    preselectedOrder?: EnrichedOrderFinancialRow
  ) => {
    setEscrowModalError(null);
    setEscrowModalMode(mode);
    if (preselectedOrder) {
      setSelectedEscrowOrderId(preselectedOrder.id);
      const pendingDep = preselectedOrder.depositRequests?.[0];
      if (mode === 'buyer_deposit') {
        const defaultAmt = pendingDep
          ? Number(pendingDep.amount)
          : preselectedOrder.inEscrow && preselectedOrder.inEscrow > 0
            ? Number(preselectedOrder.amount || 25)
            : Number(preselectedOrder.amount || 25);
        setEscrowDepositAmount(defaultAmt > 0 ? String(defaultAmt) : '25');
        setEscrowDepositTitle(pendingDep?.title || `Escrow deposit for ${preselectedOrder.title}`);
        setEscrowFundSource(availableBalance >= defaultAmt ? 'wallet' : 'instant_deposit');
      } else if (mode === 'seller_request') {
        const suggestedAmt = Number(preselectedOrder.amount || 25);
        setEscrowDepositAmount(suggestedAmt > 0 ? String(suggestedAmt) : '25');
        setEscrowDepositTitle(`Escrow deposit for ${preselectedOrder.title}`);
        setEscrowDepositNote('');
      }
    } else {
      if (mode === 'buyer_deposit' && buyerOrderRows.length > 0) {
        const first = buyerOrderRows[0];
        setSelectedEscrowOrderId(first.id);
        setEscrowDepositAmount(String(first.amount || 25));
        setEscrowDepositTitle(`Escrow deposit for ${first.title}`);
        setEscrowFundSource(availableBalance >= Number(first.amount || 25) ? 'wallet' : 'instant_deposit');
      } else if (mode === 'seller_request' && freelancerOrderRows.length > 0) {
        const first = freelancerOrderRows[0];
        setSelectedEscrowOrderId(first.id);
        setEscrowDepositAmount(String(first.amount || 25));
        setEscrowDepositTitle(`Escrow deposit for ${first.title}`);
        setEscrowDepositNote('');
      } else {
        setSelectedEscrowOrderId('');
        setEscrowDepositAmount('50');
        setEscrowDepositTitle('Wallet USD Deposit');
      }
    }
    setShowEscrowModal(true);
  };

  // Submit Escrow Deposit / Request Deposit / Wallet Deposit
  const handleSubmitEscrowModal = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(escrowDepositAmount);
    if (isNaN(amt) || amt <= 0) {
      setEscrowModalError('Please enter a valid USD amount greater than $0.00.');
      return;
    }

    setIsSubmittingEscrow(true);
    setEscrowModalError(null);

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await ensureValidAuthHeaders())
      };

      if (escrowModalMode === 'wallet_topup') {
        const res = await fetch('/api/payments/deposit', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            userId: currentUser?.id,
            amount: amt
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to deposit funds into wallet.');
        showToast(`Successfully deposited ${formatUsd(amt)} into your FivePA USD Account.`);
        setShowEscrowModal(false);
        if (onBalanceUpdate) onBalanceUpdate();
        await fetchData();
        return;
      }

      if (!selectedEscrowOrderId) {
        throw new Error('Please select an order workstream first.');
      }

      if (escrowModalMode === 'buyer_deposit') {
        const targetRow = buyerOrderRows.find(r => r.id === selectedEscrowOrderId);
        const pendingOffer = targetRow?.depositRequests?.[0];

        // If there is a pending deposit/proposal offer with matching amount and buyer wants to accept it
        if (pendingOffer && Math.abs(Number(pendingOffer.amount) - amt) < 0.01) {
          // Ensure buyer has sufficient wallet balance if instant_deposit is chosen
          if (escrowFundSource === 'instant_deposit' || availableBalance < amt) {
            const depRes = await fetch('/api/payments/deposit', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                userId: currentUser?.id,
                amount: Math.max(amt, Number((amt - availableBalance).toFixed(2)))
              })
            });
            if (!depRes.ok) {
              const depErr = await depRes.json().catch(() => ({}));
              throw new Error(depErr.error || 'Unable to top up wallet for deposit request.');
            }
          }
          const accRes = await fetch(`/api/offers/${pendingOffer.id}/accept`, {
            method: 'POST',
            headers,
            body: JSON.stringify({})
          });
          const accData = await accRes.json();
          if (!accRes.ok) throw new Error(accData.error || 'Failed to accept and fund deposit request.');
          showToast(`Escrow deposit of ${formatUsd(amt)} funded for "${targetRow?.title}".`);
        } else {
          // Direct buyer escrow deposit / top-up on order
          const res = await fetch('/api/payments/escrow/deposit', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              orderId: selectedEscrowOrderId,
              amount: amt,
              title: escrowDepositTitle.trim() || undefined,
              fundSource: escrowFundSource,
              autoDeposit: escrowFundSource === 'instant_deposit'
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to deposit funds into order escrow.');
          showToast(`Successfully deposited ${formatUsd(amt)} USD into Buyer Escrow.`);
        }

        setShowEscrowModal(false);
        if (onBalanceUpdate) onBalanceUpdate();
        await fetchData();
        return;
      }

      if (escrowModalMode === 'seller_request') {
        const cleanTitle = escrowDepositTitle.trim() || 'Escrow deposit';
        const res = await fetch(`/api/orders/${selectedEscrowOrderId}/offers`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            kind: 'deposit',
            title: cleanTitle,
            amount: amt,
            note: escrowDepositNote.trim() || undefined
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send deposit request.');
        showToast(`Deposit request (${formatUsd(amt)} USD) sent to buyer.`);
        setShowEscrowModal(false);
        if (onBalanceUpdate) onBalanceUpdate();
        await fetchData();
      }
    } catch (err: any) {
      setEscrowModalError(err.message || 'Operation failed.');
    } finally {
      setIsSubmittingEscrow(false);
    }
  };

  // Accept a pending deposit request or pending invoice directly from the My Buyer Escrow table
  const handleAcceptOrderOffer = async (offer: WorkstreamOffer, orderRow: EnrichedOrderFinancialRow) => {
    setProcessingOfferId(offer.id);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await ensureValidAuthHeaders())
      };
      const amt = Number(offer.amount || 0);
      const needed = offer.kind === 'invoice'
        ? Math.max(0, Number((amt - Number(orderRow.inEscrow || 0)).toFixed(2)))
        : amt;

      if (needed > availableBalance) {
        const shortfall = Number((needed - availableBalance).toFixed(2));
        const depRes = await fetch('/api/payments/deposit', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            userId: currentUser?.id,
            amount: shortfall
          })
        });
        if (!depRes.ok) {
          const depErr = await depRes.json().catch(() => ({}));
          throw new Error(depErr.error || `Insufficient wallet balance (${formatUsd(availableBalance)}). Please deposit ${formatUsd(shortfall)} first.`);
        }
      }

      const res = await fetch(`/api/offers/${offer.id}/accept`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to process ${offer.kind}.`);

      showToast(
        offer.kind === 'invoice'
          ? `Invoice ${offer.number} (${formatUsd(amt)}) paid and released to freelancer!`
          : `Deposit request ${offer.number} (${formatUsd(amt)}) funded into escrow!`
      );
      if (onBalanceUpdate) onBalanceUpdate();
      await fetchData();
    } catch (err: any) {
      showToast(err.message || 'Failed to complete payment.', 'error');
    } finally {
      setProcessingOfferId(null);
    }
  };

  // Open Create Invoice Modal
  const openCreateInvoiceModal = (preselectedOrder?: EnrichedOrderFinancialRow) => {
    setCreateInvoiceError(null);
    const targetOrder = preselectedOrder || freelancerOrderRows[0];
    if (targetOrder) {
      setInvoiceMode('workstream');
      setInvoiceOrderId(targetOrder.id);
      setInvoiceTitle(`Final Invoice for ${targetOrder.title}`);
      setInvoiceAmount(String(targetOrder.inEscrow && targetOrder.inEscrow > 0 ? targetOrder.inEscrow : targetOrder.amount || 50));
      setInvoiceRecipientName(targetOrder.buyerName || 'Client');
    } else {
      setInvoiceMode('custom');
      setInvoiceOrderId('');
      setInvoiceTitle('');
      setInvoiceAmount('100');
      setInvoiceRecipientName('');
      setInvoiceRecipientEmail('');
    }
    setInvoiceNote('');
    setShowCreateInvoiceModal(true);
  };

  const handleCreateInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(invoiceAmount);
    if (isNaN(amt) || amt <= 0) {
      setCreateInvoiceError('Please enter a valid invoice amount in USD.');
      return;
    }

    setIsCreatingInvoice(true);
    setCreateInvoiceError(null);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await ensureValidAuthHeaders())
      };

      const targetOrder = freelancerOrderRows.find(o => o.id === invoiceOrderId) || buyerOrderRows.find(o => o.id === invoiceOrderId);

      // If workstream invoice on a funded active order where current user is the seller, try workstream offer first, or create formal invoice record
      if (invoiceMode === 'workstream' && invoiceOrderId) {
        const isFundedSellerOrder =
          targetOrder &&
          targetOrder.sellerId === currentUser?.id &&
          Number(targetOrder.inEscrow || 0) > 0 &&
          amt >= Number(targetOrder.inEscrow || 0);

        if (isFundedSellerOrder) {
          const offerRes = await fetch(`/api/orders/${invoiceOrderId}/offers`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              kind: 'invoice',
              title: invoiceTitle.trim() || `Invoice for ${targetOrder.title}`,
              amount: amt,
              note: invoiceNote.trim() || undefined
            })
          });
          if (offerRes.ok) {
            showToast(`Workstream invoice (${formatUsd(amt)} USD) sent to buyer!`);
            setShowCreateInvoiceModal(false);
            if (onBalanceUpdate) onBalanceUpdate();
            await fetchData();
            return;
          }
        }

        // Create formal custom invoice linked to orderId via /api/payments/invoices
        const res = await fetch('/api/payments/invoices', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            orderId: invoiceOrderId,
            title: invoiceTitle.trim() || `Invoice for ${targetOrder?.title || 'Order'}`,
            dueDate: invoiceDueDate,
            notes: invoiceNote.trim() || 'FivePA USD Escrow Invoice',
            items: [
              {
                description: invoiceTitle.trim() || targetOrder?.title || 'Professional Services',
                quantity: 1,
                unitPrice: amt,
                amount: amt
              }
            ]
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create invoice.');
        showToast(`Invoice ${data.invoiceNumber} (${formatUsd(amt)} USD) created.`);
        setShowCreateInvoiceModal(false);
        setActiveTab('invoices');
        await fetchData();
        return;
      }

      // Custom invoice by counterparty email or order participant
      const fallbackOrder = freelancerOrderRows[0] || buyerOrderRows[0];
      const res = await fetch('/api/payments/invoices', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          orderId: invoiceOrderId || fallbackOrder?.id || undefined,
          recipientName: invoiceRecipientName.trim() || fallbackOrder?.buyerName || 'Client',
          recipientEmail: invoiceRecipientEmail.trim() || undefined,
          title: invoiceTitle.trim() || 'Professional Freelance Services',
          dueDate: invoiceDueDate,
          notes: invoiceNote.trim() || 'FivePA Standard USD Invoice',
          items: [
            {
              description: invoiceTitle.trim() || 'Professional Services',
              quantity: 1,
              unitPrice: amt,
              amount: amt
            }
          ]
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create invoice.');
      showToast(`Invoice ${data.invoiceNumber} (${formatUsd(amt)} USD) generated.`);
      setShowCreateInvoiceModal(false);
      setActiveTab('invoices');
      await fetchData();
    } catch (err: any) {
      setCreateInvoiceError(err.message || 'Failed to create invoice.');
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  // Withdrawal flow
  const handleInitiateWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt <= 0) {
      setWithdrawError('Please enter a valid withdrawal amount.');
      return;
    }
    if (amt > availableBalance) {
      setWithdrawError(`Withdrawal amount cannot exceed your available balance (${formatUsd(availableBalance)}).`);
      return;
    }

    setIsWithdrawing(true);
    setWithdrawError(null);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await ensureValidAuthHeaders())
      };
      const res = await fetch('/api/auth/withdrawal/request-code', {
        method: 'POST',
        headers
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.codeRequired === 'boolean') {
          setCodeRequired(data.codeRequired);
        }
        setShowWithdrawModal(false);
        setShowCodeModal(true);
        setVerificationCode('');
      } else {
        // Fallback to direct payout endpoint if verification code route isn't required for demo session
        const directRes = await fetch('/api/payments/withdraw', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            freelancerId: currentUser?.id,
            amount: amt,
            method: withdrawMethod
          })
        });
        const directData = await directRes.json();
        if (!directRes.ok) {
          throw new Error(directData.error || 'Failed to submit withdrawal request.');
        }
        setShowWithdrawModal(false);
        setWithdrawAmount('');
        showToast(`Withdrawal request of ${formatUsd(amt)} USD submitted!`);
        if (onBalanceUpdate) onBalanceUpdate();
        await fetchData();
      }
    } catch (err: any) {
      setWithdrawError(err.message || 'Error initiating withdrawal.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleVerifyAndWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (codeRequired && (!verificationCode || verificationCode.trim().length !== 6)) {
      setWithdrawError('Please enter the 6-digit verification code sent to your email.');
      return;
    }

    const amt = parseFloat(withdrawAmount);
    setIsWithdrawing(true);
    setWithdrawError(null);

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await ensureValidAuthHeaders())
      };
      const res = await fetch('/api/auth/withdrawal/verify-and-execute', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: amt,
          code: verificationCode.trim(),
          method: withdrawMethod
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Withdrawal verification failed.');
      }

      setShowCodeModal(false);
      setWithdrawAmount('');
      setVerificationCode('');
      showToast(`Withdrawal of ${formatUsd(amt)} USD authorized and scheduled for settlement.`);
      if (onBalanceUpdate) onBalanceUpdate();
      await fetchData();
    } catch (err: any) {
      setWithdrawError(err.message || 'Withdrawal execution failed.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Payment Methods CRUD
  const handleAddPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    setMethodError(null);
    if (!newMethodName.trim()) {
      setMethodError('Please provide a label or account holder name.');
      return;
    }

    const details: Record<string, string> = {};
    if (newMethodType === 'Bank Transfer' || newMethodType === 'Wire Transfer') {
      if (!newMethodAccountNumber.trim()) {
        setMethodError('Please enter a bank account number or IBAN.');
        return;
      }
      details.accountNumber = newMethodAccountNumber.trim();
      if (newMethodRoutingNumber.trim()) {
        details.routingNumber = newMethodRoutingNumber.trim();
      }
    } else {
      if (!newMethodEmail.trim() || !newMethodEmail.includes('@')) {
        setMethodError(`Please enter a valid ${newMethodType} email address.`);
        return;
      }
      details.email = newMethodEmail.trim();
    }

    setIsSavingMethod(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await ensureValidAuthHeaders())
      };
      const res = await fetch('/api/payments/methods', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: newMethodType,
          name: newMethodName.trim(),
          details,
          isDefault: newMethodDefault
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save payment method.');
      showToast(`Added ${newMethodType} (${newMethodName.trim()}) as a USD payment method.`);
      setShowAddMethodModal(false);
      setNewMethodName('');
      setNewMethodAccountNumber('');
      setNewMethodRoutingNumber('');
      setNewMethodEmail('');
      await fetchData();
    } catch (err: any) {
      setMethodError(err.message || 'Failed to add payment method.');
    } finally {
      setIsSavingMethod(false);
    }
  };

  const handleSetDefaultMethod = async (methodId: string) => {
    try {
      const headers = await ensureValidAuthHeaders();
      const res = await fetch(`/api/payments/methods/${methodId}/default`, {
        method: 'PATCH',
        headers
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to set default payment method.');
      }
      showToast('Default USD payment method updated.');
      await fetchData();
    } catch (err: any) {
      showToast(err.message || 'Could not update default method.', 'error');
    }
  };

  const handleDeleteMethod = async (methodId: string) => {
    try {
      const headers = await ensureValidAuthHeaders();
      const res = await fetch(`/api/payments/methods/${methodId}`, {
        method: 'DELETE',
        headers
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to remove payment method.');
      }
      showToast('Payment method removed.');
      await fetchData();
    } catch (err: any) {
      showToast(err.message || 'Could not remove payment method.', 'error');
    }
  };

  // Download helpers (no window.alert / window.open)
  const downloadFile = (filename: string, content: string, mimeType = 'text/csv;charset=utf-8;') => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadInvoice = (inv: any) => {
    const lines = [
      'FIVEPA MARKETPLACE - OFFICIAL USD INVOICE STATEMENT',
      '====================================================',
      `Invoice Number : ${inv.invoiceNumber || inv.id}`,
      `Status         : ${String(inv.status || 'in_escrow').toUpperCase()}`,
      `Issue Date     : ${inv.issueDate || '-'}`,
      `Due Date       : ${inv.dueDate || '-'}`,
      `Issuer         : ${inv.issuerName || currentUser?.name || 'Freelancer'}`,
      `Recipient      : ${inv.recipientName || 'Client'} (${inv.recipientEmail || ''})`,
      `Description    : ${inv.title || 'Order Services'}`,
      '----------------------------------------------------',
      `Subtotal (USD) : ${formatUsd(inv.subtotal ?? inv.total)}`,
      `Service Fee    : ${formatUsd(inv.serviceFee || 0)}`,
      `Total (USD)    : ${formatUsd(inv.total ?? inv.subtotal)}`,
      '----------------------------------------------------',
      `Notes          : ${inv.notes || 'Protected by FivePA USD Escrow.'}`
    ];
    downloadFile(`${inv.invoiceNumber || 'Invoice'}.txt`, lines.join('\n'), 'text/plain;charset=utf-8;');
    showToast(`Downloaded ${inv.invoiceNumber || 'Invoice'} ($ USD).`);
  };

  const handleExportTransactionsCsv = () => {
    const header = ['Transaction ID', 'Timestamp', 'Type', 'Description', 'Amount (USD)', 'Status'];
    const rows = filteredTransactions.map(tx => [
      `"${String(tx.id || '').replace(/"/g, '""')}"`,
      `"${String(tx.timestamp || '').replace(/"/g, '""')}"`,
      `"${String(tx.type || '').replace(/"/g, '""')}"`,
      `"${String(tx.description || '').replace(/"/g, '""')}"`,
      Number(tx.amount || 0).toFixed(2),
      `"${String(tx.status || 'completed')}"`
    ]);
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile(`FivePA_USD_Transactions_${new Date().toISOString().slice(0, 10)}.csv`, csv);
    showToast('Exported USD Transactions CSV.');
  };

  const handleDownloadStatementCsv = () => {
    const header = ['Metric', 'Currency', 'Amount (USD)'];
    const rows = [
      ['Available Account Balance', 'USD', availableBalance.toFixed(2)],
      ['Buyer Escrow Held', 'USD', buyerEscrowTotal.toFixed(2)],
      ['Freelancer Escrow Held', 'USD', freelancerEscrowTotal.toFixed(2)],
      ['Paid This Month', 'USD', paidThisMonth.toFixed(2)],
      ['Paid To Date', 'USD', paidToDate.toFixed(2)],
      ['Earned This Month', 'USD', earnedThisMonth.toFixed(2)],
      ['Earned Past Two Months', 'USD', earnedPastTwoMonths.toFixed(2)],
      ['Earned To Date', 'USD', earnedToDate.toFixed(2)]
    ];
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile(`FivePA_USD_Statement_${statementPeriod}_${new Date().toISOString().slice(0, 10)}.csv`, csv);
    showToast('Downloaded USD Financial Statement.');
  };

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (invoiceFilter === 'received') return inv.type === 'received';
      if (invoiceFilter === 'sent') return inv.type === 'sent';
      if (invoiceFilter === 'paid') return inv.status === 'paid';
      if (invoiceFilter === 'pending') return inv.status !== 'paid';
      return true;
    });
  }, [invoices, invoiceFilter]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (txTypeFilter !== 'all' && tx.type !== txTypeFilter) return false;
      if (txSearch.trim()) {
        const q = txSearch.toLowerCase();
        const matchId = String(tx.id || '').toLowerCase().includes(q);
        const matchDesc = String(tx.description || '').toLowerCase().includes(q);
        const matchType = String(tx.type || '').toLowerCase().includes(q);
        if (!matchId && !matchDesc && !matchType) return false;
      }
      return true;
    });
  }, [transactions, txTypeFilter, txSearch]);

  // Statement transactions filtered by period
  const statementTransactions = useMemo(() => {
    const now = Date.now();
    const ym = new Date().toISOString().slice(0, 7);
    const year = new Date().toISOString().slice(0, 4);
    const twoMonthsAgo = new Date(now - 60 * 86400000).toISOString().slice(0, 10);

    return transactions.filter(tx => {
      const ts = String(tx.timestamp || '');
      if (statementPeriod === 'current_month') return ts.startsWith(ym);
      if (statementPeriod === 'past_two_months') return ts >= twoMonthsAgo;
      if (statementPeriod === 'ytd') return ts.startsWith(year);
      return true;
    });
  }, [transactions, statementPeriod]);

  // Calculator breakdown
  const calculatorResult = useMemo(() => {
    const raw = parseFloat(calcInputAmount);
    const val = Number.isFinite(raw) && raw > 0 ? raw : 0;
    const commRate = Math.max(0, Math.min(100, effectivePlatformFee)) / 100;
    const gross = calcMode === 'gross_to_net' ? val : (1 - commRate > 0 ? val / (1 - commRate) : val);
    const commission = Number((gross * commRate).toFixed(2));
    const freelancerNet = Number((gross - commission).toFixed(2));
    const buyerFee = Number((gross * (effectiveClientServiceFee / 100)).toFixed(2));
    const smallFee = gross > 0 && gross < effectiveSmallOrderThreshold ? effectiveSmallOrderFee : 0;
    const buyerTotal = Number((gross + buyerFee + smallFee).toFixed(2));
    return {
      gross: Number(gross.toFixed(2)),
      commission,
      freelancerNet,
      buyerFee,
      smallFee,
      buyerTotal
    };
  }, [calcInputAmount, calcMode, effectivePlatformFee, effectiveClientServiceFee, effectiveSmallOrderThreshold, effectiveSmallOrderFee]);

  const topTabs: { id: TopPaymentTab; label: string }[] = [
    { id: 'my_money', label: 'My Money' },
    { id: 'statements', label: 'Statements' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'methods', label: 'Payment methods' }
  ];

  return (
    <div className="max-w-7xl mx-auto py-2 font-sans">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 border text-xs font-semibold transition-all ${
            toast.type === 'error'
              ? 'bg-rose-950 text-white border-rose-800'
              : 'bg-slate-900 text-white border-slate-800'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white ml-2 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main 2-Column Layout matching /freelance-activity theme & structure */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Main Content Container */}
        <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-xs">
          {/* Page Header */}
          <div className="flex items-center justify-between gap-4 mb-3">
            <h1 className="text-2xl sm:text-[28px] font-normal text-slate-800 tracking-tight leading-tight">
              Payments
            </h1>
            <button
              type="button"
              onClick={fetchData}
              disabled={isLoadingData}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
              title="Refresh USD balances and escrow records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Horizontal Sub-Navigation Bar matching /freelance-activity design */}
          <div className="border-b border-slate-200 px-1 flex flex-wrap items-center gap-6 mb-6">
            {topTabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 text-[13px] transition-colors border-b-2 -mb-px cursor-pointer ${
                    isActive
                      ? 'border-emerald-600 text-emerald-600 font-bold'
                      : 'border-transparent text-slate-500 hover:text-slate-800 font-medium'
                  }`}
                >
                  {tab.label}
                  {tab.id === 'invoices' && invoices.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                      {invoices.length}
                    </span>
                  )}
                  {tab.id === 'transactions' && transactions.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                      {transactions.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ========================================================= */}
          {/* TAB 1: MY MONEY (Proprietary Fivepa Design System)        */}
          {/* ========================================================= */}
          {activeTab === 'my_money' && (
            <div>
              {/* 3 Interactive Balance Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Card 1: Available Account Balance */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedMoneyBox('account')}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelectedMoneyBox('account')}
                  className={`rounded-2xl p-5 transition-all duration-200 cursor-pointer select-none border text-left flex flex-col justify-between ${
                    selectedMoneyBox === 'account'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/10'
                      : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:shadow-xs'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          selectedMoneyBox === 'account'
                            ? 'bg-white/10 text-emerald-400'
                            : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        }`}
                      >
                        <Wallet className="w-4 h-4" />
                      </div>
                      {selectedMoneyBox === 'account' ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                          Active View
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-400">
                          USD
                        </span>
                      )}
                    </div>

                    <div className={`text-[15px] font-bold leading-snug ${
                      selectedMoneyBox === 'account' ? 'text-white' : 'text-slate-900'
                    }`}>
                      My User Account
                    </div>
                    <div
                      className={`text-xs mt-0.5 mb-4 ${
                        selectedMoneyBox === 'account' ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      Available money
                    </div>
                  </div>

                  <div className={`pt-3 border-t ${
                    selectedMoneyBox === 'account' ? 'border-white/10' : 'border-slate-100'
                  }`}>
                    <div className="flex items-baseline justify-between">
                      <span className={`text-[11px] font-medium ${
                        selectedMoneyBox === 'account' ? 'text-slate-300' : 'text-slate-500'
                      }`}>
                        US dollar
                      </span>
                      <span className={`text-xl font-bold font-mono tabular-nums ${
                        selectedMoneyBox === 'account' ? 'text-white' : 'text-slate-900'
                      }`}>
                        {formatUsd(availableBalance)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 2: My Buyer Escrow */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedMoneyBox('buyer_escrow')}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelectedMoneyBox('buyer_escrow')}
                  className={`rounded-2xl p-5 transition-all duration-200 cursor-pointer select-none border text-left flex flex-col justify-between ${
                    selectedMoneyBox === 'buyer_escrow'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/10'
                      : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:shadow-xs'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          selectedMoneyBox === 'buyer_escrow'
                            ? 'bg-white/10 text-sky-400'
                            : 'bg-sky-50 text-sky-600 border border-sky-100'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      {selectedMoneyBox === 'buyer_escrow' ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 bg-sky-950/60 border border-sky-800/60 px-2 py-0.5 rounded-full">
                          Active View
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-400">
                          USD
                        </span>
                      )}
                    </div>

                    <div className={`text-[15px] font-bold leading-snug ${
                      selectedMoneyBox === 'buyer_escrow' ? 'text-white' : 'text-slate-900'
                    }`}>
                      My Buyer Escrow
                    </div>
                    <div
                      className={`text-xs mt-0.5 mb-4 ${
                        selectedMoneyBox === 'buyer_escrow' ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      Work others are doing for me
                    </div>
                  </div>

                  <div className={`pt-3 border-t ${
                    selectedMoneyBox === 'buyer_escrow' ? 'border-white/10' : 'border-slate-100'
                  }`}>
                    <div className="flex items-baseline justify-between">
                      <span className={`text-[11px] font-medium ${
                        selectedMoneyBox === 'buyer_escrow' ? 'text-slate-300' : 'text-slate-500'
                      }`}>
                        US dollar
                      </span>
                      <span className={`text-xl font-bold font-mono tabular-nums ${
                        selectedMoneyBox === 'buyer_escrow' ? 'text-white' : 'text-slate-900'
                      }`}>
                        {formatUsd(buyerEscrowTotal)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 3: My Freelancer Escrow */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedMoneyBox('freelancer_escrow')}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelectedMoneyBox('freelancer_escrow')}
                  className={`rounded-2xl p-5 transition-all duration-200 cursor-pointer select-none border text-left flex flex-col justify-between ${
                    selectedMoneyBox === 'freelancer_escrow'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/10'
                      : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:shadow-xs'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          selectedMoneyBox === 'freelancer_escrow'
                            ? 'bg-white/10 text-emerald-400'
                            : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        }`}
                      >
                        <Clock className="w-4 h-4" />
                      </div>
                      {selectedMoneyBox === 'freelancer_escrow' ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                          Active View
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-400">
                          USD
                        </span>
                      )}
                    </div>

                    <div className={`text-[15px] font-bold leading-snug ${
                      selectedMoneyBox === 'freelancer_escrow' ? 'text-white' : 'text-slate-900'
                    }`}>
                      My Freelancer Escrow
                    </div>
                    <div
                      className={`text-xs mt-0.5 mb-4 ${
                        selectedMoneyBox === 'freelancer_escrow' ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      Work I am doing for others
                    </div>
                  </div>

                  <div className={`pt-3 border-t ${
                    selectedMoneyBox === 'freelancer_escrow' ? 'border-white/10' : 'border-slate-100'
                  }`}>
                    <div className="flex items-baseline justify-between">
                      <span className={`text-[11px] font-medium ${
                        selectedMoneyBox === 'freelancer_escrow' ? 'text-slate-300' : 'text-slate-500'
                      }`}>
                        US dollar
                      </span>
                      <span className={`text-xl font-bold font-mono tabular-nums ${
                        selectedMoneyBox === 'freelancer_escrow' ? 'text-white' : 'text-slate-900'
                      }`}>
                        {formatUsd(freelancerEscrowTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ===================================================== */}
              {/* SUB-VIEW 1: MY USER ACCOUNT TABLE (Clean & Modern)    */}
              {/* ===================================================== */}
              {selectedMoneyBox === 'account' && (
                <div className="space-y-4">
                  <div className="bg-slate-100/80 text-slate-700 px-5 py-3 grid grid-cols-12 items-center text-xs font-semibold rounded-xl">
                    <div className="col-span-4">Currency</div>
                    <div className="col-span-4 text-center">Available Balance</div>
                    <div className="col-span-4 text-right">Available for Withdraw</div>
                  </div>

                  <div className="bg-white border border-slate-200/80 rounded-xl divide-y divide-slate-100">
                    <div className="px-5 py-4 grid grid-cols-12 items-center text-xs sm:text-[13px]">
                      <div className="col-span-4 font-bold text-slate-900 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                        <span>US Dollar ($ USD)</span>
                      </div>
                      <div className="col-span-4 text-center font-bold text-slate-900 font-mono tabular-nums text-sm">
                        {formatUsd(availableBalance)}
                      </div>
                      <div className="col-span-4 text-right font-bold text-emerald-600 font-mono tabular-nums text-sm">
                        {formatUsd(availableBalance)}
                      </div>
                    </div>
                  </div>

                  {/* Quick Wallet Actions Row */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5">
                    <div>
                      <div className="text-xs font-bold text-slate-900">Fivepa USD Wallet Controls</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Add funds for instant order escrow or initiate a verified USD payout to your linked bank account.
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => openEscrowDepositModal('wallet_topup')}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Funds ($ USD)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setWithdrawError(null);
                          setWithdrawAmount(availableBalance > 0 ? String(availableBalance.toFixed(2)) : '');
                          setShowWithdrawModal(true);
                        }}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Withdraw USD</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ===================================================== */}
              {/* SUB-VIEW 2: MY BUYER ESCROW TABLE (Clean & Modern)    */}
              {/* ===================================================== */}
              {selectedMoneyBox === 'buyer_escrow' && (
                <div className="space-y-2">
                  <div className="bg-slate-100/80 text-slate-700 px-4 py-3 grid grid-cols-12 items-center text-xs font-semibold rounded-xl gap-2">
                    <div className="col-span-5">Description</div>
                    <div className="col-span-2 text-center">In Escrow</div>
                    <div className="col-span-2 text-center">Deposit Requests</div>
                    <div className="col-span-1 text-center">Invoices</div>
                    <div className="col-span-2 text-right">Actions</div>
                  </div>

                  {buyerOrderRows.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500 bg-white border border-slate-200/80 rounded-xl">
                      No active or past buyer escrow workstreams found.
                    </div>
                  ) : (
                    <div className="bg-white border border-slate-200/80 rounded-xl divide-y divide-slate-100 overflow-hidden">
                      {buyerOrderRows.map(row => {
                        const pendingDep = row.depositRequests?.[0];
                        const pendingInv = row.pendingInvoices?.[0];
                        return (
                          <div
                            key={row.id}
                            className="px-4 py-3.5 grid grid-cols-12 items-center text-xs gap-2 hover:bg-slate-50/80 transition"
                          >
                            {/* Description */}
                            <div className="col-span-5 pr-2">
                              <button
                                type="button"
                                onClick={() => handleOpenOrderWorkstream(row)}
                                className="text-left text-slate-900 hover:text-emerald-600 font-semibold text-[13px] line-clamp-1 leading-snug cursor-pointer transition-colors"
                              >
                                {row.title || row.serviceTitle || `Order #${row.id}`}
                              </button>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                by {row.sellerName || 'Freelancer'}
                              </div>
                            </div>

                            {/* In Escrow */}
                            <div className="col-span-2 text-center font-bold text-slate-900 font-mono tabular-nums">
                              {formatUsd(row.inEscrow || 0)}
                            </div>

                            {/* Deposit Requests */}
                            <div className="col-span-2 text-center">
                              {pendingDep ? (
                                <div className="inline-flex flex-col items-center gap-1">
                                  <span className="font-bold text-amber-700 font-mono tabular-nums">
                                    {formatUsd(pendingDep.amount)}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={processingOfferId === pendingDep.id}
                                    onClick={() => handleAcceptOrderOffer(pendingDep, row)}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold cursor-pointer disabled:opacity-50 transition"
                                  >
                                    {processingOfferId === pendingDep.id ? 'Funding...' : 'Accept & Fund'}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </div>

                            {/* Invoices */}
                            <div className="col-span-1 text-center">
                              {pendingInv ? (
                                <div className="inline-flex flex-col items-center gap-1">
                                  <span className="font-bold text-slate-900 font-mono tabular-nums">
                                    {formatUsd(pendingInv.amount)}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={processingOfferId === pendingInv.id}
                                    onClick={() => handleAcceptOrderOffer(pendingInv, row)}
                                    className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-[10px] font-bold cursor-pointer disabled:opacity-50 transition"
                                  >
                                    {processingOfferId === pendingInv.id ? '...' : 'Pay'}
                                  </button>
                                </div>
                              ) : row.hasPaidInvoice || (row.paidInvoiceAmount && row.paidInvoiceAmount > 0) ? (
                                <span className="inline-flex items-center justify-center gap-1 text-slate-700 font-medium whitespace-nowrap text-[11px]">
                                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center shrink-0">
                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                  </span>
                                  <span className="font-mono tabular-nums">{formatUsd(row.paidInvoiceAmount || row.amount)}</span>
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="col-span-2 text-right">
                              <button
                                type="button"
                                onClick={() => openEscrowDepositModal('buyer_deposit', row)}
                                className="inline-flex items-center justify-end gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs transition cursor-pointer"
                              >
                                <CornerRightUp className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5] shrink-0" />
                                <span>Escrow Deposit</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ===================================================== */}
              {/* SUB-VIEW 3: MY FREELANCER ESCROW TABLE (Clean & Modern) */}
              {/* ===================================================== */}
              {selectedMoneyBox === 'freelancer_escrow' && (
                <div className="space-y-2">
                  <div className="bg-slate-100/80 text-slate-700 px-4 py-3 grid grid-cols-12 items-center text-xs font-semibold rounded-xl gap-2">
                    <div className="col-span-6">Description</div>
                    <div className="col-span-2 text-center">In Escrow</div>
                    <div className="col-span-2 text-center">Invoices</div>
                    <div className="col-span-2 text-right">Actions</div>
                  </div>

                  {freelancerOrderRows.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500 bg-white border border-slate-200/80 rounded-xl">
                      No active or past freelancer escrow workstreams found.
                    </div>
                  ) : (
                    <div className="bg-white border border-slate-200/80 rounded-xl divide-y divide-slate-100 overflow-hidden">
                      {freelancerOrderRows.map(row => {
                        const pendingInv = row.pendingInvoices?.[0];
                        return (
                          <div
                            key={row.id}
                            className="px-4 py-3.5 grid grid-cols-12 items-center text-xs gap-2 hover:bg-slate-50/80 transition"
                          >
                            {/* Description */}
                            <div className="col-span-6 pr-2">
                              <button
                                type="button"
                                onClick={() => handleOpenOrderWorkstream(row)}
                                className="text-left text-slate-900 hover:text-emerald-600 font-semibold text-[13px] line-clamp-1 leading-snug cursor-pointer transition-colors"
                              >
                                {row.title || row.serviceTitle || `Order #${row.id}`}
                              </button>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                for {row.buyerName || 'Client'}
                              </div>
                            </div>

                            {/* In Escrow */}
                            <div className="col-span-2 text-center font-bold text-slate-900 font-mono tabular-nums">
                              {formatUsd(row.inEscrow || 0)}
                            </div>

                            {/* Invoices */}
                            <div className="col-span-2 text-center">
                              {pendingInv ? (
                                <span className="inline-flex items-center gap-1 text-amber-700 font-semibold text-xs">
                                  <Clock className="w-3.5 h-3.5 shrink-0" />
                                  <span className="font-mono tabular-nums">{formatUsd(pendingInv.amount)}</span>
                                </span>
                              ) : row.hasPaidInvoice && (row.paidInvoiceAmount || 0) > 0 ? (
                                <span className="inline-flex items-center justify-center gap-1 text-slate-700 font-medium text-[11px]">
                                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center shrink-0">
                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                  </span>
                                  <span className="font-mono tabular-nums">{formatUsd(row.paidInvoiceAmount)}</span>
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="col-span-2 text-right">
                              <button
                                type="button"
                                onClick={() => openEscrowDepositModal('seller_request', row)}
                                className="inline-flex items-center justify-end gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs transition cursor-pointer"
                              >
                                <CornerRightUp className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5] shrink-0" />
                                <span>Request Deposit</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: STATEMENTS                                          */}
          {/* ========================================================= */}
          {activeTab === 'statements' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900">USD Financial Statements</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Summary of your USD earnings, buyer payments, escrow balances, and settled withdrawals.
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <select
                    value={statementPeriod}
                    onChange={e => setStatementPeriod(e.target.value as any)}
                    className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden"
                  >
                    <option value="current_month">Current Month</option>
                    <option value="past_two_months">Past 2 Months</option>
                    <option value="ytd">Year to Date ({new Date().getFullYear()})</option>
                    <option value="all_time">All Time</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleDownloadStatementCsv}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CSV</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Available USD</div>
                  <div className="text-lg font-bold text-slate-900 mt-1">{formatUsd(availableBalance)}</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Paid to Date</div>
                  <div className="text-lg font-bold text-slate-900 mt-1">{formatUsd(paidToDate)}</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Earned to Date</div>
                  <div className="text-lg font-bold text-emerald-600 mt-1">{formatUsd(earnedToDate)}</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Active in Escrow</div>
                  <div className="text-lg font-bold text-slate-900 mt-1">
                    {formatUsd(buyerEscrowTotal + freelancerEscrowTotal)}
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                <div className="bg-slate-50 border-b border-slate-200/80 px-5 py-3.5 text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>Statement Ledger Entries ({statementTransactions.length})</span>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Currency: $ USD</span>
                </div>
                {statementTransactions.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    No statement entries recorded for the selected period.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {statementTransactions.map(tx => (
                      <div key={tx.id} className="px-5 py-4 flex items-center justify-between text-xs hover:bg-slate-50/70 transition">
                        <div>
                          <div className="font-semibold text-slate-900">{tx.description}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {tx.timestamp} • Ref: {tx.id}
                          </div>
                        </div>
                        <div className="font-bold font-mono tabular-nums text-sm text-slate-900">
                          {Number(tx.amount) >= 0 ? `+${formatUsd(tx.amount)}` : `-${formatUsd(Math.abs(Number(tx.amount)))}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: INVOICES                                            */}
          {/* ========================================================= */}
          {activeTab === 'invoices' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  {(['all', 'received', 'sent', 'paid', 'pending'] as const).map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setInvoiceFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition cursor-pointer ${
                        invoiceFilter === f
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f === 'all' ? `All (${invoices.length})` : f}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => openCreateInvoiceModal()}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Invoice</span>
                </button>
              </div>

              {filteredInvoices.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-2 border border-dashed border-slate-200 rounded-xl">
                  <FileText className="w-7 h-7 text-slate-300 mx-auto" />
                  <div className="font-semibold text-slate-600">No USD Invoices Found</div>
                  <p>Invoices are automatically created for orders or can be issued via Create Invoice.</p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                  <div className="bg-slate-50 border-b border-slate-200/80 px-4 py-3.5 grid grid-cols-12 text-xs font-semibold text-slate-700 gap-2">
                    <div className="col-span-3">Invoice #</div>
                    <div className="col-span-4">Description</div>
                    <div className="col-span-2 text-center">Status</div>
                    <div className="col-span-1 text-right">Amount</div>
                    <div className="col-span-2 text-right">Actions</div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {filteredInvoices.map(inv => (
                      <div
                        key={inv.id}
                        className="px-4 py-3.5 grid grid-cols-12 items-center text-xs gap-2 hover:bg-slate-50 transition"
                      >
                        <div className="col-span-3">
                          <div className="font-bold text-slate-800">{inv.invoiceNumber || inv.id}</div>
                          <div className="text-[11px] text-slate-400">
                            {inv.issueDate} • {inv.type === 'received' ? 'Buyer' : 'Freelancer'}
                          </div>
                        </div>
                        <div className="col-span-4 pr-2">
                          <div className="font-medium text-slate-800 line-clamp-1">{inv.title}</div>
                          <div className="text-[11px] text-slate-400">
                            {inv.type === 'received'
                              ? `From: ${inv.issuerName || 'Freelancer'}`
                              : `To: ${inv.recipientName || 'Client'}`}
                          </div>
                        </div>
                        <div className="col-span-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              inv.status === 'paid'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : inv.status === 'refunded'
                                  ? 'bg-slate-100 text-slate-600'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {inv.status || 'in_escrow'}
                          </span>
                        </div>
                        <div className="col-span-1 text-right font-bold text-slate-900">
                          {formatUsd(inv.total ?? inv.subtotal)}
                        </div>
                        <div className="col-span-2 flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingInvoice(inv)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="View Invoice"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadInvoice(inv)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            <span>Download</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 4: TRANSACTIONS                                        */}
          {/* ========================================================= */}
          {activeTab === 'transactions' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search transactions..."
                    value={txSearch}
                    onChange={e => setTxSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:bg-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={txTypeFilter}
                    onChange={e => setTxTypeFilter(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:outline-hidden"
                  >
                    <option value="all">All Types ({transactions.length})</option>
                    <option value="deposit">Deposits</option>
                    <option value="escrow_fund">Escrow Funded</option>
                    <option value="escrow_release">Escrow Released</option>
                    <option value="escrow_refund">Escrow Refunds</option>
                    <option value="withdrawal">Withdrawals</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleExportTransactionsCsv}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                <div className="bg-slate-50 border-b border-slate-200/80 px-4 py-3.5 grid grid-cols-12 text-xs font-semibold text-slate-700 gap-2">
                  <div className="col-span-3">Reference & Date</div>
                  <div className="col-span-5">Description</div>
                  <div className="col-span-2 text-right">Amount ($ USD)</div>
                  <div className="col-span-2 text-right">Status</div>
                </div>
                {filteredTransactions.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    No USD transactions match your filter criteria.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredTransactions.map(tx => (
                      <div
                        key={tx.id}
                        className="px-4 py-3.5 grid grid-cols-12 items-center text-xs gap-2 hover:bg-slate-50 transition"
                      >
                        <div className="col-span-3">
                          <div className="font-mono font-semibold text-slate-800 truncate">{tx.id}</div>
                          <div className="text-[11px] text-slate-400">{tx.timestamp}</div>
                        </div>
                        <div className="col-span-5 pr-2">
                          <div className="font-medium text-slate-800">{tx.description}</div>
                          <div className="text-[11px] text-slate-400 capitalize">
                            {String(tx.type || 'transaction').replace(/_/g, ' ')}
                          </div>
                        </div>
                        <div className="col-span-2 text-right font-bold">
                          <span className={Number(tx.amount) > 0 ? 'text-emerald-600' : 'text-slate-900'}>
                            {Number(tx.amount) > 0
                              ? `+${formatUsd(tx.amount)}`
                              : `-${formatUsd(Math.abs(Number(tx.amount)))}`}
                          </span>
                        </div>
                        <div className="col-span-2 text-right">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                            {tx.status || 'completed'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {payoutsList.length > 0 && (
                <div className="pt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                    USD Withdrawal Payout Requests ({payoutsList.length})
                  </h3>
                  <div className="space-y-2">
                    {payoutsList.map((p: any) => (
                      <div
                        key={p.id}
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-900">
                            Payout #{p.id} • {formatUsd(p.amount)} USD
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Method: {p.method || 'Bank Transfer'} • {p.createdAt || 'Recent'}
                          </div>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                          {p.status || 'completed'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 5: PAYMENT METHODS (Payment Settings)                  */}
          {/* ========================================================= */}
          {activeTab === 'methods' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900">USD Payment & Withdrawal Methods</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Manage your verified USD payout accounts and billing preferences. All settlements are processed in $ USD.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMethodError(null);
                    setShowAddMethodModal(true);
                  }}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add USD Payment Method</span>
                </button>
              </div>

              {paymentMethods.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-300 rounded-xl space-y-3">
                  <CreditCard className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="text-sm font-bold text-slate-800">No Custom Payment Methods Added Yet</div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Add your USD Bank Transfer (ACH/IBAN), PayPal, or Stripe payout account to receive fast USD withdrawals.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAddMethodModal(true)}
                    className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition cursor-pointer"
                  >
                    + Link Bank or PayPal ($ USD)
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {paymentMethods.map((m: any) => (
                    <div
                      key={m.id}
                      className={`border rounded-xl p-4 flex flex-col justify-between gap-4 transition ${
                        m.isDefault ? 'border-emerald-500 bg-emerald-50/20' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                            {String(m.type).toLowerCase().includes('bank') ? (
                              <Building2 className="w-5 h-5" />
                            ) : (
                              <CreditCard className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                              <span>{m.name}</span>
                              {m.isDefault && (
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">
                                  Default USD
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {m.type} •{' '}
                              {m.details?.accountNumber
                                ? `Account •••• ${String(m.details.accountNumber).slice(-4)}`
                                : m.details?.email || 'Verified USD Account'}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <span className="text-[11px] text-slate-400">Currency: $ USD</span>
                        <div className="flex items-center gap-2">
                          {!m.isDefault && (
                            <button
                              type="button"
                              onClick={() => handleSetDefaultMethod(m.id)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Star className="w-3 h-3" />
                              <span>Set Default</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteMethod(m.id)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                            title="Remove payment method"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* Right Column: CONTROL PANEL Sidebar (Matches Screenshots)  */}
        {/* ========================================================= */}
        <div className="lg:col-span-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5 font-sans">
            {/* Control Panel Header matching /freelance-activity */}
            <div className="flex items-center gap-2.5 pb-3.5 border-b border-slate-100">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 ring-4 ring-emerald-50 inline-block shrink-0" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                CONTROL PANEL
              </h3>
            </div>

            {/* Section 1: Paid & Earned Metrics ($ USD) */}
            <div className="space-y-3 text-[13px]">
              <div className="flex items-center justify-between text-slate-600">
                <span>Paid this month</span>
                <span className="font-bold text-slate-900 font-mono tabular-nums">{formatUsd(paidThisMonth)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Paid to date</span>
                <span className="font-bold text-slate-900 font-mono tabular-nums">{formatUsd(paidToDate)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Earned this month</span>
                <span className="font-bold text-slate-900 font-mono tabular-nums">{formatUsd(earnedThisMonth)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Earned to date</span>
                <span className="font-bold text-emerald-600 font-mono tabular-nums" title={formatUsd(earnedToDate)}>
                  {formatUsd(earnedToDate)}
                </span>
              </div>
            </div>

            {/* Section 2: Past 2 Months & Clearing Period */}
            <div className="pt-4 border-t border-slate-100 space-y-3 text-[13px]">
              <div className="flex items-center justify-between text-slate-600">
                <span>Earned past two months ($)</span>
                <span className="font-bold text-slate-900 font-mono tabular-nums">{formatUsd(earnedPastTwoMonths)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Clearing period</span>
                <span className="font-bold text-slate-900 font-mono tabular-nums">{clearingDays} days</span>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setShowLearnMoreModal(true)}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold underline cursor-pointer inline-flex items-center gap-1"
                >
                  <Info className="w-3 h-3" />
                  <span>Learn more</span>
                </button>
              </div>
            </div>

            {/* Section 3: Service Fees* */}
            <div className="pt-4 border-t border-slate-100 space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Service Fees*</h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span>First $7,000 earned with a Buyer</span>
                  <span className="font-bold text-slate-900 font-mono tabular-nums">{effectivePlatformFee}%</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Over $7,000 earned with a Buyer</span>
                  <span className="font-bold text-slate-900 font-mono tabular-nums">3.5%</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed pt-0.5">
                  *All platform transactions and settlements are processed exclusively in $ USD.
                </p>
              </div>
            </div>

            {/* Section 4: Sidebar Action Inputs / Links */}
            <div className="pt-4 border-t border-slate-100 space-y-2 text-[13px]">
              <button
                type="button"
                onClick={() => {
                  if (selectedMoneyBox === 'freelancer_escrow' && freelancerOrderRows.length > 0) {
                    openEscrowDepositModal('seller_request', freelancerOrderRows[0]);
                  } else if (buyerOrderRows.length > 0) {
                    openEscrowDepositModal('buyer_deposit', buyerOrderRows[0]);
                  } else {
                    openEscrowDepositModal('wallet_topup');
                  }
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200/80 hover:border-emerald-300 hover:bg-emerald-50/40 text-slate-800 hover:text-emerald-900 font-medium transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-100">
                    <CornerRightUp className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                  <span className="text-xs font-semibold">Escrow Deposit</span>
                </div>
                <span className="text-[11px] font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  Open →
                </span>
              </button>

              <button
                type="button"
                onClick={() => openCreateInvoiceModal()}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200/80 hover:border-slate-300 hover:bg-slate-50 text-slate-800 hover:text-slate-900 font-medium transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 group-hover:bg-slate-200">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold">Create Invoice</span>
                </div>
                <span className="text-[11px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  Open →
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('methods')}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200/80 hover:border-slate-300 hover:bg-slate-50 text-slate-800 hover:text-slate-900 font-medium transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 group-hover:bg-slate-200">
                    <Settings className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold">Payment Settings</span>
                </div>
                <span className="text-[11px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  View →
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowCalculatorModal(true)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200/80 hover:border-slate-300 hover:bg-slate-50 text-slate-800 hover:text-slate-900 font-medium transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 group-hover:bg-slate-200">
                    <Calculator className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold">Earnings Calculator</span>
                </div>
                <span className="text-[11px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  Calculate →
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL 1: ESCROW DEPOSIT / REQUEST DEPOSIT / WALLET DEPOSIT */}
      {/* ========================================================= */}
      {showEscrowModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <CornerRightUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">USD Escrow & Account Deposit</h3>
                  <p className="text-[11px] text-slate-500">All amounts are processed strictly in $ USD</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEscrowModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setEscrowModalMode('buyer_deposit');
                  setEscrowModalError(null);
                  if (!selectedEscrowOrderId && buyerOrderRows.length > 0) {
                    setSelectedEscrowOrderId(buyerOrderRows[0].id);
                  }
                }}
                className={`py-2 px-2 rounded-lg transition cursor-pointer ${
                  escrowModalMode === 'buyer_deposit'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Buyer Escrow
              </button>
              <button
                type="button"
                onClick={() => {
                  setEscrowModalMode('seller_request');
                  setEscrowModalError(null);
                  if (!selectedEscrowOrderId && freelancerOrderRows.length > 0) {
                    setSelectedEscrowOrderId(freelancerOrderRows[0].id);
                  }
                }}
                className={`py-2 px-2 rounded-lg transition cursor-pointer ${
                  escrowModalMode === 'seller_request'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Request Deposit
              </button>
              <button
                type="button"
                onClick={() => {
                  setEscrowModalMode('wallet_topup');
                  setEscrowModalError(null);
                }}
                className={`py-2 px-2 rounded-lg transition cursor-pointer ${
                  escrowModalMode === 'wallet_topup'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Add Wallet USD
              </button>
            </div>

            <form onSubmit={handleSubmitEscrowModal} className="space-y-4">
              {escrowModalMode === 'buyer_deposit' && (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Select Buyer Workstream
                    </label>
                    {buyerOrderRows.length === 0 ? (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                        You do not have any buyer orders yet. Switch to "Add Wallet USD" to fund your account balance.
                      </div>
                    ) : (
                      <select
                        value={selectedEscrowOrderId}
                        onChange={e => {
                          const id = e.target.value;
                          setSelectedEscrowOrderId(id);
                          const ord = buyerOrderRows.find(r => r.id === id);
                          if (ord) {
                            setEscrowDepositAmount(String(ord.depositRequests?.[0]?.amount || ord.amount || 25));
                            setEscrowDepositTitle(`Escrow deposit for ${ord.title}`);
                          }
                        }}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                      >
                        {buyerOrderRows.map(ord => (
                          <option key={ord.id} value={ord.id}>
                            {ord.title} (by {ord.sellerName}) — In Escrow: {formatUsd(ord.inEscrow)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Funding Source ($ USD)
                    </label>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setEscrowFundSource('wallet')}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          escrowFundSource === 'wallet'
                            ? 'border-emerald-600 bg-emerald-50/50 font-bold text-slate-900'
                            : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        <div>Available Balance</div>
                        <div className="text-[11px] text-emerald-700">{formatUsd(availableBalance)} available</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEscrowFundSource('instant_deposit')}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          escrowFundSource === 'instant_deposit'
                            ? 'border-emerald-600 bg-emerald-50/50 font-bold text-slate-900'
                            : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        <div>Instant USD Deposit</div>
                        <div className="text-[11px] text-slate-500">Auto-top-up & fund escrow</div>
                      </button>
                    </div>
                  </div>
                </>
              )}

              {escrowModalMode === 'seller_request' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Select Freelancer Workstream (Request from Buyer)
                  </label>
                  {freelancerOrderRows.length === 0 ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                      You have no active freelancer workstreams to request an escrow deposit on.
                    </div>
                  ) : (
                    <select
                      value={selectedEscrowOrderId}
                      onChange={e => {
                        const id = e.target.value;
                        setSelectedEscrowOrderId(id);
                        const ord = freelancerOrderRows.find(r => r.id === id);
                        if (ord) {
                          setEscrowDepositAmount(String(ord.amount || 25));
                          setEscrowDepositTitle(`Escrow deposit for ${ord.title}`);
                        }
                      }}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                    >
                      {freelancerOrderRows.map(ord => (
                        <option key={ord.id} value={ord.id}>
                          {ord.title} (for {ord.buyerName}) — In Escrow: {formatUsd(ord.inEscrow)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {escrowModalMode !== 'wallet_topup' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Deposit Description / Milestone Title
                  </label>
                  <input
                    type="text"
                    value={escrowDepositTitle}
                    onChange={e => setEscrowDepositTitle(e.target.value)}
                    placeholder="e.g. Escrow deposit for project milestone"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:bg-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Amount ($ USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    min="1"
                    max="5000"
                    step="any"
                    value={escrowDepositAmount}
                    onChange={e => setEscrowDepositAmount(e.target.value)}
                    placeholder="e.g. 50.00"
                    className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-hidden focus:bg-white"
                  />
                </div>
              </div>

              {escrowModalMode === 'seller_request' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Note to Buyer (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={escrowDepositNote}
                    onChange={e => setEscrowDepositNote(e.target.value)}
                    placeholder="Add details about what this escrow deposit covers..."
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:bg-white"
                  />
                </div>
              )}

              {escrowModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{escrowModalError}</span>
                </div>
              )}

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEscrowModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmittingEscrow ||
                    (escrowModalMode === 'buyer_deposit' && buyerOrderRows.length === 0) ||
                    (escrowModalMode === 'seller_request' && freelancerOrderRows.length === 0)
                  }
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 disabled:opacity-40 cursor-pointer"
                >
                  {isSubmittingEscrow
                    ? 'Processing...'
                    : escrowModalMode === 'buyer_deposit'
                      ? 'Fund Escrow ($ USD)'
                      : escrowModalMode === 'seller_request'
                        ? 'Send Deposit Request'
                        : 'Confirm USD Deposit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: CREATE INVOICE MODAL                             */}
      {/* ========================================================= */}
      {showCreateInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Create USD Invoice</h3>
                  <p className="text-[11px] text-slate-500">Issue an official $ USD invoice for an order or client</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateInvoiceModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateInvoiceSubmit} className="space-y-4">
              {(freelancerOrderRows.length > 0 || buyerOrderRows.length > 0) && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Linked Order Workstream
                  </label>
                  <select
                    value={invoiceOrderId}
                    onChange={e => {
                      const id = e.target.value;
                      setInvoiceOrderId(id);
                      const ord =
                        freelancerOrderRows.find(r => r.id === id) ||
                        buyerOrderRows.find(r => r.id === id);
                      if (ord) {
                        setInvoiceTitle(`Invoice for ${ord.title}`);
                        setInvoiceAmount(String(ord.inEscrow && ord.inEscrow > 0 ? ord.inEscrow : ord.amount || 50));
                        setInvoiceRecipientName(ord.buyerName || 'Client');
                      }
                    }}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                  >
                    {[...freelancerOrderRows, ...buyerOrderRows].map(ord => (
                      <option key={ord.id} value={ord.id}>
                        {ord.title} ({ord.buyerName ? `Client: ${ord.buyerName}` : `Order #${ord.id}`}) — {formatUsd(ord.amount)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Invoice Description / Title
                </label>
                <input
                  type="text"
                  required
                  value={invoiceTitle}
                  onChange={e => setInvoiceTitle(e.target.value)}
                  placeholder="e.g. Full-Stack Web Application Milestone Delivery"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Invoice Amount ($ USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      required
                      value={invoiceAmount}
                      onChange={e => setInvoiceAmount(e.target.value)}
                      className="w-full pl-7 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={invoiceDueDate}
                    onChange={e => setInvoiceDueDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Invoice Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={invoiceNote}
                  onChange={e => setInvoiceNote(e.target.value)}
                  placeholder="Deliverable summary or payment notes..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900"
                />
              </div>

              {createInvoiceError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createInvoiceError}</span>
                </div>
              )}

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateInvoiceModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingInvoice}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  {isCreatingInvoice ? 'Creating...' : 'Issue USD Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: EARNINGS CALCULATOR ($ USD)                      */}
      {/* ========================================================= */}
      {showCalculatorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">USD Earnings & Fee Calculator</h3>
                  <p className="text-[11px] text-slate-500">Calculate exact net earnings and service fees in $ USD</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCalculatorModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setCalcMode('gross_to_net')}
                className={`py-2 rounded-lg transition cursor-pointer ${
                  calcMode === 'gross_to_net' ? 'bg-slate-900 text-white' : 'text-slate-600'
                }`}
              >
                From Order Price
              </button>
              <button
                type="button"
                onClick={() => setCalcMode('net_to_gross')}
                className={`py-2 rounded-lg transition cursor-pointer ${
                  calcMode === 'net_to_gross' ? 'bg-slate-900 text-white' : 'text-slate-600'
                }`}
              >
                Target Net Payout
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                {calcMode === 'gross_to_net' ? 'Invoice / Order Price ($ USD)' : 'Desired Net Earnings ($ USD)'}
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={calcInputAmount}
                  onChange={e => setCalcInputAmount(e.target.value)}
                  className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base font-bold text-slate-900"
                />
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Gross Order / Invoice Amount</span>
                <span className="font-bold text-slate-900">{formatUsd(calculatorResult.gross)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Service Fee ({effectivePlatformFee}%)</span>
                <span className="font-semibold text-rose-600">-{formatUsd(calculatorResult.commission)}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-sm">
                <span className="font-bold text-slate-900">Your Net USD Earnings</span>
                <span className="font-extrabold text-emerald-600">{formatUsd(calculatorResult.freelancerNet)}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                <span>Buyer Checkout Total (incl. processing fee)</span>
                <span className="font-semibold text-slate-700">{formatUsd(calculatorResult.buyerTotal)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowCalculatorModal(false)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: WITHDRAWAL REQUEST & EMAIL VERIFICATION          */}
      {/* ========================================================= */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Withdraw Available USD</h3>
                  <p className="text-[11px] text-slate-500">Available for withdrawal: {formatUsd(availableBalance)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWithdrawModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInitiateWithdraw} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Withdrawal Amount ($ USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    min="1"
                    max={availableBalance || 100000}
                    step="any"
                    required
                    value={withdrawAmount}
                    onChange={e => setWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Payout Destination
                </label>
                <select
                  value={withdrawMethod}
                  onChange={e => setWithdrawMethod(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                >
                  {paymentMethods.map((m: any) => (
                    <option key={m.id} value={`${m.type} (${m.name})`}>
                      {m.name} — {m.type} ($ USD)
                    </option>
                  ))}
                  <option value="Bank Transfer (USD)">Bank Transfer (ACH / Wire $ USD)</option>
                  <option value="PayPal (USD)">PayPal ($ USD)</option>
                </select>
              </div>

              {withdrawError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{withdrawError}</span>
                </div>
              )}

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isWithdrawing || availableBalance <= 0}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  {isWithdrawing ? 'Processing...' : 'Request USD Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Authorize USD Withdrawal</h4>
                  <p className="text-[11px] text-slate-500">
                    Amount: {formatUsd(parseFloat(withdrawAmount || '0'))} USD
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCodeModal(false);
                  setWithdrawError(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleVerifyAndWithdraw} className="space-y-4">
              {codeRequired ? (
                <div>
                  <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                    Enter the 6-digit security code dispatched to <strong>{currentUser?.email}</strong> to confirm this USD withdrawal.
                  </p>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="123456"
                    value={verificationCode}
                    onChange={e => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-center text-xl font-mono font-bold tracking-widest text-slate-900"
                    autoFocus
                  />
                </div>
              ) : (
                <p className="text-xs text-slate-600 leading-relaxed">
                  Confirm your USD withdrawal request of <strong>{formatUsd(parseFloat(withdrawAmount || '0'))}</strong> via {withdrawMethod}.
                </p>
              )}

              {withdrawError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{withdrawError}</span>
                </div>
              )}

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCodeModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isWithdrawing || (codeRequired && verificationCode.trim().length !== 6)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 disabled:opacity-40 cursor-pointer"
                >
                  {isWithdrawing ? 'Verifying...' : 'Confirm Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 5: ADD PAYMENT METHOD MODAL                         */}
      {/* ========================================================= */}
      {showAddMethodModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Add USD Payment Method</h3>
                  <p className="text-[11px] text-slate-500">Link a bank or digital wallet for $ USD payouts</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddMethodModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddPaymentMethod} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Method Type
                </label>
                <select
                  value={newMethodType}
                  onChange={e => setNewMethodType(e.target.value as any)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                >
                  <option value="Bank Transfer">Bank Transfer (ACH / Checking $ USD)</option>
                  <option value="Wire Transfer">International / Domestic USD Wire</option>
                  <option value="PayPal">PayPal ($ USD)</option>
                  <option value="Stripe">Stripe Express ($ USD)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Account Label / Holder Name
                </label>
                <input
                  type="text"
                  required
                  value={newMethodName}
                  onChange={e => setNewMethodName(e.target.value)}
                  placeholder="e.g. Primary USD Business Checking"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900"
                />
              </div>

              {newMethodType === 'Bank Transfer' || newMethodType === 'Wire Transfer' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Account Number / IBAN
                    </label>
                    <input
                      type="text"
                      required
                      value={newMethodAccountNumber}
                      onChange={e => setNewMethodAccountNumber(e.target.value)}
                      placeholder="•••• 4912"
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Routing / SWIFT
                    </label>
                    <input
                      type="text"
                      value={newMethodRoutingNumber}
                      onChange={e => setNewMethodRoutingNumber(e.target.value)}
                      placeholder="021000021"
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {newMethodType} Account Email
                  </label>
                  <input
                    type="email"
                    required
                    value={newMethodEmail}
                    onChange={e => setNewMethodEmail(e.target.value)}
                    placeholder={currentUser?.email || 'account@example.com'}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newMethodDefault}
                  onChange={e => setNewMethodDefault(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Set as default USD withdrawal method</span>
              </label>

              {methodError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{methodError}</span>
                </div>
              )}

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMethodModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingMethod}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 disabled:opacity-40 cursor-pointer"
                >
                  {isSavingMethod ? 'Saving...' : 'Save USD Method'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 6: VIEW INVOICE DETAIL MODAL                        */}
      {/* ========================================================= */}
      {viewingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Invoice {viewingInvoice.invoiceNumber || viewingInvoice.id}
                </h3>
                <p className="text-[11px] text-slate-500">Issued: {viewingInvoice.issueDate}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingInvoice(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Description</span>
                <span className="font-semibold text-slate-900">{viewingInvoice.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Recipient</span>
                <span className="font-semibold text-slate-900">{viewingInvoice.recipientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span className="font-bold uppercase text-emerald-700">{viewingInvoice.status}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm">
                <span className="font-bold text-slate-900">Total ($ USD)</span>
                <span className="font-extrabold text-slate-900">
                  {formatUsd(viewingInvoice.total ?? viewingInvoice.subtotal)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleDownloadInvoice(viewingInvoice)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Statement</span>
              </button>
              <button
                type="button"
                onClick={() => setViewingInvoice(null)}
                className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 7: CLEARING PERIOD & ESCROW LEARN MORE              */}
      {/* ========================================================= */}
      {showLearnMoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm">USD Escrow & Clearing Period</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLearnMoreModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                <strong className="text-slate-900">1. Buyer Escrow Protection:</strong> Funds deposited into escrow are held securely in $ USD until deliverables are submitted and approved.
              </p>
              <p>
                <strong className="text-slate-900">2. Freelancer Escrow & Invoices:</strong> Once work is completed and the buyer approves delivery or pays the final invoice, funds are released to your USD User Account.
              </p>
              <p>
                <strong className="text-slate-900">3. {clearingDays}-Day Clearing Security:</strong> Standard escrow protection and security clearing period is {clearingDays} days, ensuring safe USD settlement for both buyers and freelancers.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowLearnMoreModal(false)}
              className="w-full py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
