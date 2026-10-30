import React from 'react';
import { Trash2 } from 'lucide-react';
import { BaseModal } from '../ui/BaseModal';

interface DeleteGigModalProps {
  gigToDelete: { id: string; title?: string } | null;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteGigModal: React.FC<DeleteGigModalProps> = ({
  gigToDelete,
  onClose,
  onConfirm
}) => {
  if (!gigToDelete) return null;

  return (
    <BaseModal 
      isOpen={!!gigToDelete}
      onClose={onClose}
      title="Are you sure you want to delete this gig?"
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-red-100 border border-red-200 flex items-center justify-center shrink-0 text-red-600 shadow-xs">
            <Trash2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-fiverr-muted leading-relaxed">
              This action is permanent and cannot be undone. This service listing will be immediately removed from your profile and marketplace.
            </p>
            {gigToDelete.title && (
              <div className="mt-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 line-clamp-2">
                "{gigToDelete.title}"
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-fiverr-dark font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            <span>Yes, Delete Gig</span>
          </button>
        </div>
      </div>
    </BaseModal>
  );
};
