import React from 'react';
import { HelpCircle, Settings, ShieldCheck, Users } from 'lucide-react';

interface FooterProps {
  navigate: (to: string, e?: React.MouseEvent) => void;
}

/** Site footer with brand blurb and link columns. */
export function Footer({ navigate }: FooterProps) {
  return (
    <footer className="bg-white border-t border-slate-200/80 mt-16 py-14 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-10 mb-14">
        {/* Col 1: Brand */}
        <div>
          <a href="/gigs" onClick={(e) => navigate('/gigs', e)} className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-extrabold text-base ring-1 ring-slate-800 shadow-xs">
              W
            </div>
            <span className="text-base font-extrabold tracking-tight text-slate-900">WorkPerHour</span>
          </a>
          <p className="text-sm text-slate-500 leading-relaxed mb-6 font-normal">
            WorkPerHour is a secure freelance marketplace with 100% Escrow payment protection, real-time Workstream collaboration, and Gemini AI proposal generation.
          </p>
          <div className="flex items-center gap-2 text-sm text-emerald-600 font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>100% Escrow Protected</span>
          </div>
        </div>

        {/* Col 2: SEO Category Links */}
        <div>
          <h4 className="text-xs font-semibold text-fiverr-dark uppercase tracking-wider mb-5">Browse Categories</h4>
          <ul className="space-y-3 text-sm text-fiverr-dark">
            <li>
              <a href="/categories/technology-programming" onClick={(e) => navigate('/categories/technology-programming', e)} className="hover:text-fiverr-dark transition-colors">
                Development & IT
              </a>
            </li>
            <li>
              <a href="/categories/ai-services" onClick={(e) => navigate('/categories/ai-services', e)} className="hover:text-fiverr-dark transition-colors">
                AI & Data Science
              </a>
            </li>
            <li>
              <a href="/categories/design-creative" onClick={(e) => navigate('/categories/design-creative', e)} className="hover:text-fiverr-dark transition-colors">
                Design & Creative
              </a>
            </li>
            <li>
              <a href="/categories/mobile-apps" onClick={(e) => navigate('/categories/mobile-apps', e)} className="hover:text-fiverr-dark transition-colors">
                Mobile Apps
              </a>
            </li>
          </ul>
        </div>

        {/* Col 3: Platform Links */}
        <div>
          <h4 className="text-xs font-semibold text-fiverr-dark uppercase tracking-wider mb-5">Marketplace Navigation</h4>
          <ul className="space-y-3 text-sm text-fiverr-dark">
            <li>
              <a href="/gigs" onClick={(e) => navigate('/gigs', e)} className="hover:text-fiverr-dark transition-colors">
                Explore All Gigs
              </a>
            </li>
            <li>
              <a href="/projects" onClick={(e) => navigate('/projects', e)} className="hover:text-fiverr-dark transition-colors">
                Buyer Requests Board
              </a>
            </li>
            <li>
              <a href="/orders" onClick={(e) => navigate('/orders', e)} className="hover:text-fiverr-dark transition-colors">
                My Escrow Orders
              </a>
            </li>
            <li>
              <a href="/messages" onClick={(e) => navigate('/messages', e)} className="hover:text-fiverr-dark transition-colors">
                Active Workstreams
              </a>
            </li>
          </ul>
        </div>

        {/* Col 4: Platform Administration & Support */}
        <div>
          <h4 className="text-xs font-semibold text-fiverr-dark uppercase tracking-wider mb-5">Support & Administration</h4>
          <ul className="space-y-3 text-sm text-fiverr-dark">
            <li>
              <button 
                onClick={(e) => navigate('/support', e)}
                className="inline-flex items-center gap-1.5 font-semibold text-fiverr-dark hover:text-emerald-600 transition-colors cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>Contact Support Desk</span>
              </button>
            </li>
            <li>
              <a href="/admin" onClick={(e) => navigate('/admin', e)} className="inline-flex items-center gap-1.5 font-semibold text-fiverr-dark hover:text-emerald-600 transition-colors">
                <Settings className="w-3.5 h-3.5 text-emerald-600" />
                <span>Admin Panel Console</span>
              </a>
            </li>
            <li>
              <button onClick={(e) => navigate('/support', e)} className="text-slate-500 hover:text-emerald-600 transition-colors cursor-pointer text-left">
                Escrow Security Protocols
              </button>
            </li>
            <li>
              <button onClick={(e) => navigate('/support', e)} className="text-slate-500 hover:text-emerald-600 transition-colors cursor-pointer text-left">
                Gemini AI Engine
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto pt-8 border-t border-slate-200/60 flex flex-col sm:flex-row items-center justify-between text-xs text-fiverr-muted gap-4">
        <p className="mb-0">© 2026 WorkPerHour Marketplace Inc. All rights reserved.</p>
        <div className="flex items-center gap-6">
          <button 
            onClick={(e) => navigate('/support', e)}
            className="font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1 cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Contact Support</span>
          </button>
          <span>·</span>
          <button 
            onClick={(e) => navigate('/switch-user', e)}
            className="font-semibold text-fiverr-dark hover:text-emerald-600 inline-flex items-center gap-1 cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-emerald-600" />
            <span>Switch User</span>
          </button>
          <span>·</span>
          <a href="/admin" onClick={(e) => navigate('/admin', e)} className="font-semibold text-fiverr-dark hover:text-emerald-600">
            Admin Portal
          </a>
          <span>·</span>
          <button onClick={(e) => navigate('/support', e)} className="hover:text-emerald-600 cursor-pointer">
            Terms of Service
          </button>
          <span>·</span>
          <button onClick={(e) => navigate('/support', e)} className="hover:text-emerald-600 cursor-pointer">
            Privacy Policy
          </button>
        </div>
      </div>
    </footer>
  );
}
