import React, { useState } from 'react';
import { X, RefreshCw, CheckCircle2, Shield, Users } from 'lucide-react';
import { UserAccount } from '../../types';
import { setAuthToken, requestDemoSession } from '../../utils/authToken';
import { DEFAULT_AVATAR } from '../../constants';

interface UserSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  usersList: UserAccount[];
  currentUser?: UserAccount | null;
  setCurrentUser: (user: UserAccount) => void;
  setImpersonatedUser: (user: UserAccount | null) => void;
  refresh?: () => void;
}

export const UserSwitchModal: React.FC<UserSwitchModalProps> = ({
  isOpen,
  onClose,
  usersList = [],
  currentUser,
  setCurrentUser,
  setImpersonatedUser,
  refresh
}) => {
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSwitchUser = async (user: UserAccount) => {
    setSwitchingId(user.id);
    setErrorMessage(null);
    try {
      const session = await requestDemoSession(user.id);
      if (!session?.token) {
        setErrorMessage('Demo session could not be established for this account.');
        return;
      }
      setAuthToken(session.token);
      setCurrentUser(session.user || user);
      setImpersonatedUser(null);
      if (typeof window !== 'undefined') {
        localStorage.setItem('current_user', JSON.stringify(session.user || user));
        localStorage.removeItem('user');
      }
      if (refresh) refresh();
      onClose();
    } catch (e) {
      console.warn('Switch user error:', e);
      setErrorMessage('Failed to switch user account.');
    } finally {
      setSwitchingId(null);
    }
  };

  const currentId = currentUser?.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Switch Demo Account</h2>
              <p className="text-xs text-slate-500">Test client, seller, and workstream permissions</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition cursor-pointer text-xs font-bold"
          >
            ✕ Close
          </button>
        </div>

        <div className="p-4 max-h-[460px] overflow-y-auto space-y-2.5">
          {usersList.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              No users loaded yet.
            </div>
          ) : (
            usersList.map((user) => {
              const isActive = currentId === user.id;
              const isBusy = switchingId === user.id;

              return (
                <div
                  key={user.id}
                  className={`flex items-center justify-between rounded-2xl p-3.5 border transition-all ${
                    isActive 
                      ? 'bg-emerald-50/70 border-emerald-300 shadow-xs ring-1 ring-emerald-200' 
                      : 'bg-white border-slate-200 hover:border-emerald-300 hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img 
                      src={user.avatar || DEFAULT_AVATAR} 
                      alt={user.name} 
                      className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0" 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                      }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">{user.name}</span>
                        {isActive && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Current
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 uppercase font-mono block">
                        {user.role || 'client'} · {user.hourlyRate ? `$${user.hourlyRate}/hr` : user.email}
                      </span>
                    </div>
                  </div>

                  <button
                    disabled={isActive || isBusy}
                    onClick={() => handleSwitchUser(user)}
                    className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 shrink-0 ${
                      isActive
                        ? 'bg-emerald-200/50 text-emerald-800 cursor-default'
                        : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs cursor-pointer'
                    }`}
                  >
                    {isBusy && <RefreshCw className="w-3 h-3 animate-spin" />}
                    <span>{isActive ? 'Active' : isBusy ? 'Switching...' : 'Switch'}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
