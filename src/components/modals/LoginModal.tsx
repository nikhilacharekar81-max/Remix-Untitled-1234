import React from 'react';
import { ShieldCheck, AlertCircle, RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react';
import { UserAccount } from '../../types';
import { setAuthToken, requestDemoSession } from '../../utils/authToken';
import { DEFAULT_AVATAR } from '../../constants';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  loginRequiresCode: boolean;
  loginVerificationMessage: string;
  mockEmailCodeDisplay: string | null;
  loginEmail: string;
  setLoginEmail: (val: string) => void;
  loginPassword: string;
  setLoginPassword: (val: string) => void;
  loginCode: string;
  setLoginCode: (val: string) => void;
  handleLoginSubmit: any;
  setLoginRequiresCode: (val: boolean) => void;
  usersList: UserAccount[];
  updateCurrentUser: (u: UserAccount) => void;
  setImpersonatedUser: any;
  refresh: () => void;
  setIsForgotPasswordModalOpen: (val: boolean) => void;
  setMockEmailCodeDisplay: any;
  loginError?: string | null;
  isSubmittingLogin?: boolean;
  onSwitchToSignup?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  loginRequiresCode,
  loginVerificationMessage,
  mockEmailCodeDisplay,
  loginEmail,
  setLoginEmail,
  loginPassword,
  setLoginPassword,
  loginCode,
  setLoginCode,
  handleLoginSubmit,
  setLoginRequiresCode,
  usersList,
  updateCurrentUser,
  setImpersonatedUser,
  refresh,
  setIsForgotPasswordModalOpen,
  setMockEmailCodeDisplay,
  loginError,
  isSubmittingLogin,
  onSwitchToSignup
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 leading-tight">Login to WorkPerHour</h2>
            <p className="text-xs text-slate-500">Access your client or freelancer dashboard</p>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer text-xs font-bold"
          >
            ✕ Close
          </button>
        </div>

        {loginError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-red-900">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{loginError}</span>
            </div>
          </div>
        )}

        {loginRequiresCode ? (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleLoginSubmit(e); }}>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Device Verification Code Required</span>
              </div>
              <p>{loginVerificationMessage || `Enter the 6-digit verification code sent to ${loginEmail}.`}</p>
            </div>

            {mockEmailCodeDisplay && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1 text-[11px] uppercase tracking-wider text-emerald-900">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Demo 2FA OTP</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setLoginCode(mockEmailCodeDisplay)}
                    className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Auto-fill
                  </button>
                </div>
                <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-xl border border-emerald-200">
                  <span className="font-mono font-bold text-base tracking-widest text-emerald-700">{mockEmailCodeDisplay}</span>
                  <button
                    type="button"
                    onClick={() => setLoginCode(mockEmailCodeDisplay)}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] transition cursor-pointer"
                  >
                    Use Code
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Enter 6-Digit Email Code</label>
              <input 
                type="text" 
                maxLength={6} 
                placeholder="123456" 
                value={loginCode} 
                onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, ''))} 
                required 
                autoFocus
                className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-center text-xl font-mono font-bold tracking-widest bg-slate-50 focus:bg-white focus:outline-emerald-500 shadow-inner" 
              />
            </div>

            <button 
              type="submit" 
              disabled={isSubmittingLogin}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl transition cursor-pointer text-sm flex items-center justify-center gap-2 shadow-xs"
            >
              {isSubmittingLogin && <RefreshCw className="w-4 h-4 animate-spin" />}
              <span>{isSubmittingLogin ? 'Verifying...' : 'Verify Code & Complete Login'}</span>
            </button>

            <div className="flex items-center justify-between text-xs pt-1">
              <button 
                type="button" 
                onClick={async () => {
                  try {
                    const res = await fetch('/api/auth/resend-email-code', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email: loginEmail })
                    });
                    const data = await res.json();
                    if (res.ok && data.mockEmailCode) {
                      setMockEmailCodeDisplay(data.mockEmailCode);
                      setLoginCode(data.mockEmailCode);
                    }
                  } catch (e) {
                    console.warn(e);
                  }
                }} 
                className="text-emerald-700 font-semibold hover:underline cursor-pointer"
              >
                Resend Code
              </button>
              <button 
                type="button" 
                onClick={() => { setLoginRequiresCode(false); setLoginCode(''); }} 
                className="text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Back to Password
              </button>
            </div>
          </form>
        ) : (
          <form className="space-y-3.5 text-xs" onSubmit={(e) => { e.preventDefault(); handleLoginSubmit(e); }}>
            <div>
              <label className="block text-slate-700 font-bold uppercase mb-1">Email Address</label>
              <input 
                type="email" 
                placeholder="you@example.com" 
                value={loginEmail} 
                onChange={(e) => setLoginEmail(e.target.value)} 
                required 
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden" 
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold uppercase mb-1">Password</label>
              <input 
                type="password" 
                placeholder="Enter your password" 
                value={loginPassword} 
                onChange={(e) => setLoginPassword(e.target.value)} 
                required 
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden" 
              />
            </div>

            <button 
              type="submit" 
              disabled={isSubmittingLogin}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-xs"
            >
              {isSubmittingLogin && <RefreshCw className="w-4 h-4 animate-spin" />}
              <span>{isSubmittingLogin ? 'Signing In...' : 'Sign In'}</span>
            </button>

            <div className="flex items-center justify-between text-xs pt-1">
              <button 
                type="button" 
                onClick={(e) => { e.preventDefault(); onClose(); setIsForgotPasswordModalOpen(true); }} 
                className="text-emerald-700 hover:text-emerald-900 cursor-pointer underline font-medium"
              >
                Forgot Password?
              </button>
            </div>
          </form>
        )}

        {usersList.length > 0 && !loginRequiresCode && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2 text-center">
              1-Click Demo Account Login
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {usersList.filter(u => !['admin', 'super_admin', 'support'].includes(u.role || '')).slice(0, 4).map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={async () => {
                    const session = await requestDemoSession(u.id);
                    if (!session?.token) return;
                    setAuthToken(session.token);
                    updateCurrentUser(session.user);
                    setImpersonatedUser(null);
                    onClose();
                    refresh();
                  }}
                  className="p-2 border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 rounded-xl text-left transition-all cursor-pointer group flex items-center gap-2"
                >
                  <img 
                    src={u.avatar || DEFAULT_AVATAR} 
                    alt={u.name} 
                    className="w-6 h-6 rounded-full object-cover shrink-0" 
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                  />
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate group-hover:text-emerald-700">{u.name}</p>
                    <p className="text-[10px] text-slate-400 capitalize">{(u.role || 'freelancer').replace('_', ' ')}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {onSwitchToSignup && (
          <div className="mt-4 pt-3 border-t border-slate-100 text-center text-xs text-slate-500">
            Don't have an account?{' '}
            <button 
              type="button" 
              onClick={() => { onClose(); onSwitchToSignup(); }}
              className="text-emerald-600 font-bold hover:underline cursor-pointer"
            >
              Sign Up
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
