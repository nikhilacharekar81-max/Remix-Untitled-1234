import { useState, useCallback } from 'react';
import { UserAccount, Gig, Project, Proposal, Order, Dispute, Refund, Payout, Category, Review, SupportTicket, AuditLog, Message, WorkstreamOffer } from '../types';
import { getAuthToken, setAuthToken, requestDemoSession } from '../utils/authToken';
import { getDeviceId } from '../utils/deviceId';


export const useAppData = (initialData?: any) => {
  const [users, setUsers] = useState<UserAccount[]>(initialData?.users ?? []);
  const [gigs, setGigs] = useState<Gig[]>(initialData?.gigs ?? []);
  const [projects, setProjects] = useState<Project[]>(initialData?.projects ?? []);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [offers, setOffers] = useState<WorkstreamOffer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [categories, setCategories] = useState<Category[]>(initialData?.categories ?? []);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [userEmails, setUserEmails] = useState<string[]>([]);
  
  const [platformFee, setPlatformFee] = useState<number>(0);
  const [clientServiceFee, setClientServiceFee] = useState<number>(0);
  const [smallOrderFeeThreshold, setSmallOrderFeeThreshold] = useState<number>(0);
  const [smallOrderFeeAmount, setSmallOrderFeeAmount] = useState<number>(0);
  const [escrowProtectionDays, setEscrowProtectionDays] = useState<number>(0);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserEmails = async (userId: string) => {
    try {
      const res = await fetch(`/api/user-emails/${userId}`);
      if (res.ok) setUserEmails(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const safeJson = async (res: Response | null, fallback: any = []) => {
    if (!res || !res.ok) return fallback;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return fallback;
    try {
      return await res.json();
    } catch {
      return fallback;
    }
  };

  const fetchData = useCallback(async (currentUserId?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      let token = getAuthToken();
      let cachedUserId: string | null = currentUserId || null;
      let userRole: string | null = null;
      let tokenUserId: string | null = null;
      let tokenUserRole: string | null = null;
      try {
        if (typeof window !== 'undefined') {
          const cached = localStorage.getItem('current_user');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed?.id && !cachedUserId) cachedUserId = parsed.id;
            if (parsed?.role) userRole = parsed.role;
          }
        }
        if (token) {
          const parts = token.split('.');
          if (parts[1] && typeof atob === 'function') {
            let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4 !== 0) {
              b64 += '=';
            }
            const json = atob(b64);
            const payload = JSON.parse(json);
            if (payload?.role) {
              tokenUserRole = payload.role;
              if (!userRole) userRole = payload.role;
            }
            if (payload?.id) {
              tokenUserId = payload.id;
              if (!cachedUserId) cachedUserId = payload.id;
            }
          }
        }
      } catch {}

      const isAdminOrSupport = Boolean(userRole && ['admin', 'super_admin', 'support'].includes(userRole));
      const isTokenAdmin = Boolean(tokenUserRole && ['admin', 'super_admin', 'support'].includes(tokenUserRole));

      if ((!token || (!isTokenAdmin && cachedUserId && tokenUserId !== cachedUserId)) && cachedUserId && !isAdminOrSupport) {
        const recovered = await requestDemoSession(cachedUserId);
        if (recovered?.token) {
          token = recovered.token;
          setAuthToken(token);
        }
      }

      const buildReqOpt = (tok: string | null) => ({
        headers: {
          'x-device-id': getDeviceId(),
          ...(tok ? { 'Authorization': `Bearer ${tok}` } : {})
        }
      });

      let reqOpt = buildReqOpt(token);

      let [uRes, gRes, pRes, prRes, offRes, oRes, cRes, revRes] = await Promise.all([
        fetch('/api/users', reqOpt),
        fetch('/api/gigs', reqOpt),
        fetch('/api/projects', reqOpt),
        token ? fetch('/api/proposals', reqOpt) : Promise.resolve(null),
        token ? fetch('/api/offers', reqOpt) : Promise.resolve(null),
        token ? fetch('/api/orders', reqOpt) : Promise.resolve(null),
        fetch('/api/categories', reqOpt),
        fetch('/api/reviews', reqOpt)
      ]);

      if (oRes && oRes.status === 401 && cachedUserId && !isAdminOrSupport) {
        const recovered = await requestDemoSession(cachedUserId);
        if (recovered?.token) {
          token = recovered.token;
          setAuthToken(token);
          reqOpt = buildReqOpt(token);
          [prRes, offRes, oRes] = await Promise.all([
            fetch('/api/proposals', reqOpt),
            fetch('/api/offers', reqOpt),
            fetch('/api/orders', reqOpt)
          ]);
        }
      }

      const usersData = await safeJson(uRes, null);
      const gigsData = await safeJson(gRes, null);
      const projectsData = await safeJson(pRes, null);
      const proposalsData = await safeJson(prRes, null);
      const offersData = await safeJson(offRes, null);
      const ords = await safeJson(oRes, null);
      const categoriesData = await safeJson(cRes, null);
      const reviewsData = await safeJson(revRes, null);

      if (Array.isArray(usersData) && usersData.length > 0) setUsers(usersData);
      if (Array.isArray(gigsData) && gigsData.length > 0) setGigs(gigsData);
      if (Array.isArray(projectsData) && projectsData.length > 0) setProjects(projectsData);
      if (Array.isArray(proposalsData)) setProposals(proposalsData);
      if (Array.isArray(offersData)) setOffers(offersData);
      if (Array.isArray(ords)) setOrders(ords);
      if (Array.isArray(categoriesData) && categoriesData.length > 0) setCategories(categoriesData);
      if (Array.isArray(reviewsData)) setReviews(reviewsData);

      if (token && isAdminOrSupport) {
        const [dRes, rRes, payRes, sRes, aRes, setRes] = await Promise.all([
          fetch('/api/disputes', reqOpt),
          fetch('/api/refunds', reqOpt),
          fetch('/api/payouts', reqOpt),
          fetch('/api/support-tickets', reqOpt),
          fetch('/api/audit-logs', reqOpt),
          fetch('/api/admin/settings', reqOpt)
        ]);

        const disputesData = await safeJson(dRes, []);
        const refundsData = await safeJson(rRes, []);
        const payoutsData = await safeJson(payRes, []);
        const supportTicketsData = await safeJson(sRes, []);
        const auditLogsData = await safeJson(aRes, []);
        const settingsData = await safeJson(setRes, null);

        if (disputesData.length > 0) setDisputes(disputesData);
        if (refundsData.length > 0) setRefunds(refundsData);
        if (payoutsData.length > 0) setPayouts(payoutsData);
        if (supportTicketsData.length > 0) setSupportTickets(supportTicketsData);
        if (auditLogsData.length > 0) setAuditLogs(auditLogsData);

        if (settingsData) {
          if (settingsData.freelancerCommissionRate !== undefined) setPlatformFee(settingsData.freelancerCommissionRate);
          if (settingsData.clientServiceFee !== undefined) setClientServiceFee(settingsData.clientServiceFee);
          if (settingsData.smallOrderFeeThreshold !== undefined) setSmallOrderFeeThreshold(settingsData.smallOrderFeeThreshold);
          if (settingsData.smallOrderFeeAmount !== undefined) setSmallOrderFeeAmount(settingsData.smallOrderFeeAmount);
          if (settingsData.escrowHoldDays !== undefined) setEscrowProtectionDays(settingsData.escrowHoldDays);
        }
      }
    } catch (e) {
      setError('Failed to fetch data');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    users, setUsers,
    gigs, setGigs,
    projects, setProjects,
    proposals, setProposals,
    offers, setOffers,
    orders, setOrders,
    reviews, setReviews,
    messages, setMessages,
    disputes, setDisputes,
    refunds, setRefunds,
    payouts, setPayouts,
    categories, setCategories,
    supportTickets, setSupportTickets,
    auditLogs, setAuditLogs,
    userEmails, setUserEmails, fetchUserEmails,
    platformFee, setPlatformFee,
    clientServiceFee, setClientServiceFee,
    smallOrderFeeThreshold, setSmallOrderFeeThreshold,
    smallOrderFeeAmount, setSmallOrderFeeAmount,
    escrowProtectionDays, setEscrowProtectionDays,
    isLoading,
    error,
    refresh: fetchData
  };
};
