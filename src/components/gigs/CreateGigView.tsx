import React, { useRef } from 'react';
import { Sparkles, Trash2, Upload, Image as ImageIcon, CheckCircle, Link as LinkIcon } from 'lucide-react';
import { GigExtra } from '../../types';

interface CreateGigViewProps {
  newGigTitle: string;
  setNewGigTitle: (val: string) => void;
  newGigCat: string;
  setNewGigCat: (val: string) => void;
  newGigDesc: string;
  setNewGigDesc: (val: string) => void;
  newGigPrice: number;
  setNewGigPrice: (val: number) => void;
  newGigDays: number;
  setNewGigDays: (val: number) => void;
  newGigImage?: string;
  setNewGigImage?: (val: string) => void;
  isOptimizingGig: boolean;
  handleOptimizeGigWithAI: () => void;
  newGigExtras: GigExtra[];
  extraTitleInput: string;
  setExtraTitleInput: (val: string) => void;
  extraPriceInput: number;
  setExtraPriceInput: (val: number) => void;
  handleAddGigExtra: () => void;
  handleRemoveGigExtra: (id: string) => void;
  handlePublishGig: (e: React.FormEvent) => void;
}

const GIG_IMAGE_PRESETS = [
  { name: 'Web & Software Dev', url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&h=500&fit=crop' },
  { name: 'AI & Data Science', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&h=500&fit=crop' },
  { name: 'UI/UX & Branding', url: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&h=500&fit=crop' },
  { name: 'Mobile Application', url: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&h=500&fit=crop' },
  { name: 'Digital Marketing & SEO', url: 'https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?w=800&h=500&fit=crop' },
  { name: 'Video & Animation', url: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=800&h=500&fit=crop' }
];

export const CreateGigView: React.FC<CreateGigViewProps> = ({
  newGigTitle,
  setNewGigTitle,
  newGigCat,
  setNewGigCat,
  newGigDesc,
  setNewGigDesc,
  newGigPrice,
  setNewGigPrice,
  newGigDays,
  setNewGigDays,
  newGigImage = '',
  setNewGigImage = () => {},
  isOptimizingGig,
  handleOptimizeGigWithAI,
  newGigExtras,
  extraTitleInput,
  setExtraTitleInput,
  extraPriceInput,
  setExtraPriceInput,
  handleAddGigExtra,
  handleRemoveGigExtra,
  handlePublishGig
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, WEBP, or SVG).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      alert('File size exceeds 8MB limit. Please choose a smaller image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        setNewGigImage(result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-slate-200 p-8 shadow-xs">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-fiverr-dark">Create a New Service Gig</h1>
        <p className="text-sm text-fiverr-muted">Publish your freelance service and leverage automated tools to optimize conversion.</p>
      </div>

      <form onSubmit={handlePublishGig} className="space-y-6">
        <div>
          <label className="block text-xs font-bold text-fiverr-dark uppercase tracking-wider mb-2">Gig Title</label>
          <input 
            type="text" 
            placeholder="I will build a high-performance web app..."
            value={newGigTitle}
            onChange={(e) => setNewGigTitle(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-fiverr-dark uppercase tracking-wider mb-2">Category</label>
          <select 
            value={newGigCat}
            onChange={(e) => setNewGigCat(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white"
          >
            <option value="AI Services">AI Services</option>
            <option value="Technology & Programming">Technology & Programming</option>
            <option value="Writing & Translation">Writing & Translation</option>
            <option value="Design">Design</option>
            <option value="Digital Marketing">Digital Marketing</option>
            <option value="Video, Photo & Image">Video, Photo & Image</option>
            <option value="Business">Business</option>
            <option value="Music & Audio">Music & Audio</option>
          </select>
        </div>

        {/* Gig Cover Image Upload & Gallery */}
        <div className="pt-2 border-t border-slate-100">
          <label className="block text-xs font-bold text-fiverr-dark uppercase tracking-wider mb-2">
            Gig Cover Image
          </label>
          <p className="text-xs text-fiverr-muted mb-4">
            Upload your own custom image, paste a picture URL, or select from curated cover presets.
          </p>

          {/* Active Image Preview Canvas */}
          {newGigImage ? (
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-900 group aspect-video max-h-64 mb-4">
              <img 
                src={newGigImage} 
                alt="Gig Cover Preview" 
                className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
              />
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-slate-900/80 hover:bg-slate-900 backdrop-blur-md text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Change Image</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewGigImage('')}
                  className="px-3 py-1.5 bg-red-600/90 hover:bg-red-600 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
              <div className="absolute bottom-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-emerald-400 text-[11px] font-bold flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-emerald-400" />
                <span>Cover Image Attached</span>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-slate-800 bg-slate-50 hover:bg-slate-100/80 rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 mb-4"
            >
              <div className="w-12 h-12 bg-white border border-slate-200 rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs text-slate-700">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-800 mb-1">
                Click to upload a custom Gig image
              </p>
              <p className="text-[11px] text-slate-500">
                Supports PNG, JPG, WEBP or SVG up to 8MB
              </p>
            </div>
          )}

          {/* Hidden File Input */}
          <input 
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            className="hidden"
          />

          {/* Alternative URL & Presets */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-slate-400 shrink-0" />
              <input 
                type="url"
                placeholder="Or paste direct image URL (https://...)"
                value={newGigImage}
                onChange={(e) => setNewGigImage(e.target.value)}
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Or Choose a High-Quality Cover Preset:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {GIG_IMAGE_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setNewGigImage(preset.url)}
                    className={`p-2 rounded-xl border text-left flex items-center gap-2 transition cursor-pointer ${
                      newGigImage === preset.url 
                        ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20' 
                        : 'border-slate-200 hover:border-slate-400 bg-slate-50/50'
                    }`}
                  >
                    <img src={preset.url} alt={preset.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    <span className="text-[11px] font-semibold text-slate-700 line-clamp-2">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-bold text-fiverr-dark uppercase tracking-wider">Description</label>
            <button 
              type="button"
              onClick={handleOptimizeGigWithAI}
              disabled={isOptimizingGig}
              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition-colors border border-emerald-200"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isOptimizingGig ? 'Optimizing with Gemini...' : 'Optimize with Gemini AI'}</span>
            </button>
          </div>
          <textarea 
            rows={5}
            placeholder="Describe your service offering, deliverables, and tech stack..."
            value={newGigDesc}
            onChange={(e) => setNewGigDesc(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-fiverr-dark uppercase tracking-wider mb-2">Base Price ($)</label>
            <input 
              type="number" 
              value={newGigPrice}
              onChange={(e) => setNewGigPrice(Number(e.target.value))}
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-fiverr-dark uppercase tracking-wider mb-2">Delivery Time (Days)</label>
            <input 
              type="number" 
              value={newGigDays}
              onChange={(e) => setNewGigDays(Number(e.target.value))}
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>
        </div>

        {/* Optional Gig Extras Section */}
        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div>
            <label className="block text-xs font-bold text-fiverr-dark uppercase tracking-wider mb-1">
              Configure Optional Gig Extras (Add-ons)
            </label>
            <p className="text-xs text-fiverr-muted">Allow buyers to add extra fast delivery, source files, or commercial licenses to their order.</p>
          </div>

          {/* Existing configured extras */}
          {newGigExtras.length > 0 && (
            <div className="space-y-2">
              {newGigExtras.map(ext => (
                <div key={ext.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="font-semibold text-slate-800">{ext.title}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-fiverr-dark">+${ext.price}</span>
                    <button 
                      type="button"
                      onClick={() => handleRemoveGigExtra(ext.id)}
                      className="text-red-500 hover:text-red-700 font-bold"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add new extra input row */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <input 
              type="text" 
              placeholder="Extra title (e.g. Fast 24h Express Delivery)..." 
              value={extraTitleInput}
              onChange={(e) => setExtraTitleInput(e.target.value)}
              className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none"
            />
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-fiverr-muted">$</span>
              <input 
                type="number" 
                placeholder="50" 
                value={extraPriceInput}
                onChange={(e) => setExtraPriceInput(Number(e.target.value))}
                className="w-20 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none"
              />
              <button 
                type="button"
                onClick={handleAddGigExtra}
                className="px-3 py-2 bg-slate-900 text-white font-bold rounded-lg text-xs hover:bg-slate-800 whitespace-nowrap cursor-pointer"
              >
                + Add Extra
              </button>
            </div>
          </div>
        </div>

        <button type="submit" className="w-full py-3.5 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition-colors text-sm shadow-md cursor-pointer">
          Publish Gig to Marketplace
        </button>
      </form>
    </div>
  );
};
