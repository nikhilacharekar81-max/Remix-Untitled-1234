import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  handleSignupSubmit: (e: React.FormEvent) => void;
  signupName: string;
  setSignupName: (val: string) => void;
  signupEmail: string;
  setSignupEmail: (val: string) => void;
  signupMobile: string;
  setSignupMobile: (val: string) => void;
  signupPassword: string;
  setSignupPassword: (val: string) => void;
  signupConfirmPassword: string;
  setSignupConfirmPassword: (val: string) => void;
  signupError?: string | null;
  isSubmittingSignup?: boolean;
  onSwitchToLogin?: () => void;
}

export const SignupModal: React.FC<SignupModalProps> = ({
  isOpen,
  onClose,
  handleSignupSubmit,
  signupName,
  setSignupName,
  signupEmail,
  setSignupEmail,
  signupMobile,
  setSignupMobile,
  signupPassword,
  setSignupPassword,
  signupConfirmPassword,
  setSignupConfirmPassword,
  signupError,
  isSubmittingSignup,
  onSwitchToLogin
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 leading-tight">Register for WorkPerHour</h2>
            <p className="text-xs text-slate-500">Create your client or freelancer account</p>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer text-xs font-bold"
          >
            ✕ Close
          </button>
        </div>

        {signupError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-red-900">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{signupError}</span>
            </div>
            {signupError.toLowerCase().includes('already exists') && onSwitchToLogin && (
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="mt-1 text-xs font-bold text-red-900 underline hover:text-red-950 block cursor-pointer"
              >
                Log In with this email instead →
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSignupSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-700 font-bold uppercase mb-1">Full Name</label>
            <input 
              type="text" 
              placeholder="e.g. John Doe" 
              value={signupName} 
              onChange={(e) => setSignupName(e.target.value)} 
              required 
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden" 
            />
          </div>
          <div>
            <label className="block text-slate-700 font-bold uppercase mb-1">Email Address</label>
            <input 
              type="email" 
              placeholder="you@example.com" 
              value={signupEmail} 
              onChange={(e) => setSignupEmail(e.target.value)} 
              required 
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden" 
            />
          </div>
          <div>
            <label className="block text-slate-700 font-bold uppercase mb-1">Mobile Phone Number</label>
            <input 
              type="tel" 
              placeholder="+1 (555) 000-0000" 
              value={signupMobile} 
              onChange={(e) => setSignupMobile(e.target.value)} 
              required 
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden" 
            />
          </div>
          <div>
            <label className="block text-slate-700 font-bold uppercase mb-1">Password</label>
            <input 
              type="password" 
              minLength={6}
              placeholder="At least 6 characters" 
              value={signupPassword} 
              onChange={(e) => setSignupPassword(e.target.value)} 
              required 
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden" 
            />
          </div>
          <div>
            <label className="block text-slate-700 font-bold uppercase mb-1">Confirm Password</label>
            <input 
              type="password" 
              minLength={6}
              placeholder="Re-enter password" 
              value={signupConfirmPassword} 
              onChange={(e) => setSignupConfirmPassword(e.target.value)} 
              required 
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden" 
            />
          </div>

          <button 
            type="submit" 
            disabled={isSubmittingSignup}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 mt-2"
          >
            {isSubmittingSignup && <RefreshCw className="w-4 h-4 animate-spin" />}
            <span>{isSubmittingSignup ? 'Creating Account...' : 'Sign Up'}</span>
          </button>

          {onSwitchToLogin && (
            <div className="text-center pt-2">
              <button 
                type="button" 
                onClick={onSwitchToLogin} 
                className="text-emerald-700 font-semibold hover:underline cursor-pointer"
              >
                Already have an account? Log In
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
