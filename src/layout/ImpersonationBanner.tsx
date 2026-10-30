import React from 'react';
import { ShieldAlert } from 'lucide-react';
import type { UserAccount } from '../types';

interface ImpersonationBannerProps {
  impersonatedUser: UserAccount | null;
  onStop: () => void;
}

/** Sticky banner shown to a super admin while viewing the site as another user. */
export function ImpersonationBanner({ impersonatedUser, onStop }: ImpersonationBannerProps) {
  if (!impersonatedUser) return null;
  return (
    <div className="bg-indigo-600 text-white px-6 py-2.5 flex items-center justify-between text-xs font-bold shadow-md sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-300 animate-pulse" />
        <span>SUPER ADMIN IMPERSONATION ACTIVE: You are viewing WorkPerHour as {impersonatedUser.name} ({impersonatedUser.role})</span>
      </div>
      <button 
        onClick={onStop}
        className="px-3 py-1 bg-white text-indigo-900 rounded-md font-bold hover:bg-slate-100 transition-colors shadow-xs"
      >
        End Impersonation & Return to Admin
      </button>
    </div>
  );
}
