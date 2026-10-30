import React, { useState } from 'react';
import { Mail, Smartphone, CheckCircle2, Copy, Sparkles, Info, RefreshCw } from 'lucide-react';

interface VerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  verificationMode: 'email' | 'sms';
  setVerificationMode: (mode: 'email' | 'sms') => void;
  emailCodeInput: string;
  setEmailCodeInput: (val: string) => void;
  smsCodeInput: string;
  setSmsCodeInput: (val: string) => void;
  handleVerifyEmailSubmit: (e: React.FormEvent) => void;
  handleVerifySmsSubmit: (e: React.FormEvent) => void;
  handleResendEmailCode: () => void;
  handleResendSmsCode: () => void;
  verifyEmail?: string;
  verifyMobile?: string;
  mockEmailCodeDisplay?: string;
  mockSmsCodeDisplay?: string;
  onOpenEmailInbox?: () => void;
}

export const VerifyModal: React.FC<VerifyModalProps> = ({
  isOpen,
  onClose,
  verificationMode,
  setVerificationMode,
  emailCodeInput,
  setEmailCodeInput,
  smsCodeInput,
  setSmsCodeInput,
  handleVerifyEmailSubmit,
  handleVerifySmsSubmit,
  handleResendEmailCode,
  handleResendSmsCode,
  verifyEmail,
  verifyMobile,
  mockEmailCodeDisplay,
  mockSmsCodeDisplay,
  onOpenEmailInbox
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentMockCode = verificationMode === 'email' ? mockEmailCodeDisplay : mockSmsCodeDisplay;

  const handleAutoFill = () => {
    if (!currentMockCode) return;
    if (verificationMode === 'email') {
      setEmailCodeInput(currentMockCode);
    } else {
      setSmsCodeInput(currentMockCode);
    }
  };

  const handleCopyCode = () => {
    if (!currentMockCode) return;
    navigator.clipboard?.writeText(currentMockCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              {verificationMode === 'email' ? <Mail className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-tight">Verify Your Account</h2>
              <p className="text-xs text-slate-500">
                {verificationMode === 'email' 
                  ? (verifyEmail ? `Sent to ${verifyEmail}` : 'Enter your 6-digit email OTP')
                  : (verifyMobile ? `Sent to ${verifyMobile}` : 'Enter your 6-digit SMS OTP')}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer text-xs font-bold"
          >
            ✕ Close
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-slate-100 p-1 rounded-2xl mb-4">
          <button 
            type="button"
            onClick={() => setVerificationMode('email')} 
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              verificationMode === 'email' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email Code</span>
          </button>
          <button 
            type="button"
            onClick={() => setVerificationMode('sms')} 
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              verificationMode === 'sms' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>SMS Code</span>
          </button>
        </div>

        {/* Prominent Demo / Sandbox OTP Notice */}
        <div className="mb-5 p-3.5 bg-emerald-50/80 border border-emerald-200/90 rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Sandbox / Demo Verification Code</span>
            </span>
            {currentMockCode && (
              <button
                type="button"
                onClick={handleCopyCode}
                className="text-[11px] font-medium text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer transition"
              >
                {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>

          {currentMockCode ? (
            <div className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-emerald-200 shadow-xs">
              <span className="text-xl font-mono font-black tracking-widest text-emerald-700 select-all">
                {currentMockCode}
              </span>
              <button
                type="button"
                onClick={handleAutoFill}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer"
              >
                Auto-fill Code
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-emerald-800">
              <span>Code generated on server. Click resend if needed:</span>
              <button
                type="button"
                onClick={verificationMode === 'email' ? handleResendEmailCode : handleResendSmsCode}
                className="font-bold underline cursor-pointer text-emerald-900 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Generate Code</span>
              </button>
            </div>
          )}

          <div className="flex items-start gap-1.5 text-[11px] text-emerald-800/90 leading-relaxed pt-0.5">
            <Info className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              This preview environment runs in sandbox mode without an external SMTP mail server. Your verification code is provided directly above.
              {onOpenEmailInbox && (
                <button 
                  type="button" 
                  onClick={onOpenEmailInbox} 
                  className="font-bold underline ml-1 hover:text-emerald-950 cursor-pointer"
                >
                  View In-App Mailbox
                </button>
              )}
            </span>
          </div>
        </div>

        {/* Verification Form */}
        {verificationMode === 'email' ? (
          <form onSubmit={handleVerifyEmailSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-1.5">
                Enter 6-Digit Email Code
              </label>
              <input 
                type="text" 
                maxLength={6}
                placeholder="e.g. 123456" 
                value={emailCodeInput} 
                onChange={(e) => setEmailCodeInput(e.target.value.replace(/\D/g, ''))} 
                required 
                autoFocus
                className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-center text-xl font-mono font-bold tracking-widest bg-slate-50 focus:bg-white focus:outline-emerald-500 transition shadow-inner" 
              />
            </div>

            <button 
              type="submit" 
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-sm transition shadow-sm cursor-pointer"
            >
              Verify Email & Activate Account
            </button>

            <div className="flex items-center justify-between text-xs pt-1 text-slate-500">
              <span>Didn't get the code?</span>
              <button 
                type="button" 
                onClick={handleResendEmailCode} 
                className="font-bold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Resend Code</span>
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifySmsSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-1.5">
                Enter 6-Digit SMS Code
              </label>
              <input 
                type="text" 
                maxLength={6}
                placeholder="e.g. 123456" 
                value={smsCodeInput} 
                onChange={(e) => setSmsCodeInput(e.target.value.replace(/\D/g, ''))} 
                required 
                autoFocus
                className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-center text-xl font-mono font-bold tracking-widest bg-slate-50 focus:bg-white focus:outline-emerald-500 transition shadow-inner" 
              />
            </div>

            <button 
              type="submit" 
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-sm transition shadow-sm cursor-pointer"
            >
              Verify SMS & Activate Account
            </button>

            <div className="flex items-center justify-between text-xs pt-1 text-slate-500">
              <span>Didn't get the SMS?</span>
              <button 
                type="button" 
                onClick={handleResendSmsCode} 
                className="font-bold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Resend SMS</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
