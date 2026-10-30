import React from 'react';
import { 
  ShieldCheck, Calendar, DollarSign, User, CheckCircle2, 
  Star, Briefcase, ExternalLink, Clock, Lock, ArrowUpRight
} from 'lucide-react';
import { WorkstreamItem } from './types';
import { UserAccount } from '../../types';
import { DEFAULT_AVATAR } from '../../constants';

interface WorkstreamSummaryCardProps {
  order: WorkstreamItem;
  partner?: UserAccount;
  currentUser?: UserAccount | null;
  escrowRemaining?: number;
  totalReleased?: number;
  currencySymbol?: string;
  onViewPartnerProfile?: (user: UserAccount) => void;
}

export const WorkstreamSummaryCard: React.FC<WorkstreamSummaryCardProps> = ({
  order,
  partner,
  currentUser,
  escrowRemaining,
  totalReleased,
  currencySymbol = '$',
  onViewPartnerProfile
}) => {
  const isBuyer = currentUser?.id === order.buyerId;
  const activeEscrow = escrowRemaining !== undefined ? escrowRemaining : ((order as any).escrowRemaining ?? (order.status === 'completed' ? 0 : Number(order.amount || 0)));
  const releasedAmt = totalReleased !== undefined ? totalReleased : ((order as any).totalReleased ?? (order.status === 'completed' ? Number(order.amount || 0) : 0));

  return (
    <div className="space-y-8 forced-13-17">
      {/* Financial Metrics */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Escrow Vault</h4>
            <p className="text-[15px] leading-[23px] text-slate-500">WorkPerHour Protection</p>
          </div>
        </div>
        
        <div className="!font-sans !text-[19px] !leading-[28.5px] font-extrabold text-slate-950 tabular-nums tracking-tight">
          {currencySymbol}{Number(activeEscrow || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        
        <div className="flex justify-between text-xs text-slate-600">
           <span>Total: {currencySymbol}{Number(order.amount || 0).toLocaleString()}</span>
           <span className="text-emerald-700 font-bold">Paid: {currencySymbol}{Number(releasedAmt || 0).toLocaleString()}</span>
        </div>
      </div>

      {/* Collaborator */}
      {partner && (
        <div className="pt-6 border-t border-slate-100 flex items-center gap-3">
          <img src={partner.avatar || DEFAULT_AVATAR} alt={partner.name} className="w-10 h-10 rounded-full object-cover" />
          <div>
            <h4 className="text-sm font-bold text-slate-900">{partner.name}</h4>
            <p className="text-xs text-slate-500">{isBuyer ? 'Freelancer' : 'Client'}</p>
          </div>
          {onViewPartnerProfile && (
            <button 
              onClick={() => onViewPartnerProfile(partner)} 
              className="ml-auto text-slate-400 hover:text-emerald-600"
              aria-label={`View ${partner.name}'s profile`}
            >
              <ArrowUpRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
