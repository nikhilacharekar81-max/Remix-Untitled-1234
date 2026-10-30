import React from 'react';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export const BaseModal: React.FC<BaseModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-xl'
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className={`bg-white border border-slate-200 rounded-3xl p-6 ${maxWidth} w-full space-y-5 text-slate-800 shadow-2xl`}>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-fiverr-dark">{title}</h3>
          <button 
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-fiverr-dark text-xs font-bold cursor-pointer"
          >
            Cancel
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
