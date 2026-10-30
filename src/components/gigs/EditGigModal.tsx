import React from 'react';
import { Trash2 } from 'lucide-react';
import { Gig, Category } from '../../types';
import { BaseModal } from '../ui/BaseModal';

interface EditGigModalProps {
  editingGig: Gig | null;
  categories: Category[];
  onClose: () => void;
  onSave: (e: React.FormEvent) => void;
  onDelete: (id: string) => void;
}

export const EditGigModal: React.FC<EditGigModalProps> = ({
  editingGig,
  categories,
  onClose,
  onSave,
  onDelete
}) => {
  if (!editingGig) return null;

  return (
    <BaseModal 
      isOpen={!!editingGig}
      onClose={onClose}
      title={`Edit Service — ${editingGig.title}`}
      maxWidth="max-w-xl"
    >
      <form onSubmit={onSave} className="space-y-4 text-xs">
        <div>
          <label className="block text-fiverr-dark font-bold uppercase mb-1">Gig Title</label>
          <input 
            type="text" 
            name="title"
            defaultValue={editingGig.title}
            required
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-fiverr-dark focus:outline-none focus:bg-white focus:border-emerald-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-fiverr-dark font-bold uppercase mb-1">Category</label>
            <select 
              name="category"
              defaultValue={editingGig.category}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-fiverr-dark focus:outline-none focus:bg-white focus:border-emerald-500"
            >
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-fiverr-dark font-bold uppercase mb-1">Subcategory</label>
            <input 
              type="text" 
              name="subcategory"
              defaultValue={editingGig.subcategory || ''}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-fiverr-dark focus:outline-none focus:bg-white focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-fiverr-dark font-bold uppercase mb-1">Starting Price ($)</label>
            <input 
              type="number" 
              name="price"
              defaultValue={editingGig.price}
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-fiverr-dark focus:outline-none focus:bg-white focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-fiverr-dark font-bold uppercase mb-1">Delivery Time (Days)</label>
            <input 
              type="number" 
              name="deliveryDays"
              defaultValue={editingGig.deliveryDays}
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-fiverr-dark focus:outline-none focus:bg-white focus:border-emerald-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-fiverr-dark font-bold uppercase mb-1">Description</label>
          <textarea 
            rows={4}
            name="description"
            defaultValue={editingGig.description}
            required
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-fiverr-dark focus:outline-none focus:bg-white focus:border-emerald-500"
          />
        </div>

        <div className="pt-2">
          <label className="flex items-center gap-2 cursor-pointer font-bold text-fiverr-dark">
            <input 
              type="checkbox" 
              name="featured"
              defaultChecked={editingGig.featured}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
            />
            <span>Feature Gig on Homepage & Listings</span>
          </label>
        </div>

        <div className="pt-4 flex items-center justify-between border-t border-slate-100">
          <button 
            type="button"
            onClick={() => onDelete(editingGig.id)}
            className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 font-bold rounded-xl flex items-center gap-1.5 text-xs transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Service</span>
          </button>
          <div className="flex items-center gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 text-fiverr-dark font-bold rounded-xl hover:bg-slate-200 text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 text-xs shadow-xs cursor-pointer"
            >
              Save Gig Details
            </button>
          </div>
        </div>
      </form>
    </BaseModal>
  );
};
