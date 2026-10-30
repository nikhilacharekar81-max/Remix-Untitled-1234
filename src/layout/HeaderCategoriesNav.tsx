import React, { useState, useRef } from 'react';
import { ChevronDown, ArrowRight, Layers } from 'lucide-react';

export interface CategoryHeaderNav {
  name: string;
  slug: string;
  subcategories: { name: string; slug: string }[];
}

export const PPH_CATEGORIES: CategoryHeaderNav[] = [
  {
    name: 'AI Services',
    slug: 'ai-services',
    subcategories: [
      { name: 'Generative AI', slug: 'generative-ai' },
      { name: 'AI Applications', slug: 'ai-applications' },
      { name: 'AI Agents', slug: 'ai-agents' },
      { name: 'Prompt Engineering', slug: 'prompt-engineering' },
      { name: 'Machine Learning & Data Science', slug: 'machine-learning-data-science' },
      { name: 'ChatGPT Integration', slug: 'chatgpt-integration' },
      { name: 'Midjourney & AI Art', slug: 'ai-art' }
    ]
  },
  {
    name: 'Technology & Programming',
    slug: 'technology-programming',
    subcategories: [
      { name: 'Web Development', slug: 'web-development' },
      { name: 'Mobile Apps', slug: 'mobile-apps' },
      { name: 'Software Development', slug: 'software-development' },
      { name: 'WordPress', slug: 'wordpress' },
      { name: 'E-commerce', slug: 'ecommerce' },
      { name: 'Databases', slug: 'databases' },
      { name: 'Game Development', slug: 'game-development' },
      { name: 'QA & Testing', slug: 'qa-testing' },
      { name: 'DevOps & Cloud', slug: 'devops-cloud' }
    ]
  },
  {
    name: 'Writing & Translation',
    slug: 'writing-translation',
    subcategories: [
      { name: 'Content Writing', slug: 'content-writing' },
      { name: 'Copywriting', slug: 'copywriting' },
      { name: 'Translation', slug: 'translation' },
      { name: 'Proofreading & Editing', slug: 'proofreading-editing' },
      { name: 'Technical Writing', slug: 'technical-writing' },
      { name: 'Blog Posts', slug: 'blog-posts' },
      { name: 'Ghostwriting', slug: 'ghostwriting' },
      { name: 'CV & Resume Writing', slug: 'resume-writing' }
    ]
  },
  {
    name: 'Design',
    slug: 'design',
    subcategories: [
      { name: 'Logo Design', slug: 'logo-design' },
      { name: 'Brand Identity', slug: 'brand-identity' },
      { name: 'Web & UI/UX Design', slug: 'web-ui-ux-design' },
      { name: 'Graphic Design', slug: 'graphic-design' },
      { name: 'Illustration', slug: 'illustration' },
      { name: 'Packaging Design', slug: 'packaging-design' },
      { name: '3D & CAD', slug: '3d-cad' },
      { name: 'Book Cover Design', slug: 'book-cover-design' }
    ]
  },
  {
    name: 'Digital Marketing',
    slug: 'digital-marketing',
    subcategories: [
      { name: 'Search Engine Optimization (SEO)', slug: 'seo' },
      { name: 'Social Media Marketing (SMM)', slug: 'smm' },
      { name: 'Pay Per Click (PPC)', slug: 'ppc' },
      { name: 'Content Marketing', slug: 'content-marketing' },
      { name: 'Email Marketing', slug: 'email-marketing' },
      { name: 'Affiliate Marketing', slug: 'affiliate-marketing' },
      { name: 'Lead Generation', slug: 'lead-generation' }
    ]
  },
  {
    name: 'Video, Photo & Image',
    slug: 'video-photo-image',
    subcategories: [
      { name: 'Video Editing', slug: 'video-editing' },
      { name: 'Animation & Motion Graphics', slug: 'animation-motion-graphics' },
      { name: 'Video Production', slug: 'video-production' },
      { name: 'Photo Editing', slug: 'photo-editing' },
      { name: 'Product Photography', slug: 'product-photography' },
      { name: 'Subtitles & Captions', slug: 'subtitles-captions' },
      { name: 'Spoken Person Videos', slug: 'spokesperson-videos' }
    ]
  },
  {
    name: 'Business',
    slug: 'business',
    subcategories: [
      { name: 'Business Plans', slug: 'business-plans' },
      { name: 'Financial Modeling', slug: 'financial-modeling' },
      { name: 'Virtual Assistant', slug: 'virtual-assistant' },
      { name: 'Market Research', slug: 'market-research' },
      { name: 'Legal Consulting', slug: 'legal-consulting' },
      { name: 'HR & Recruiting', slug: 'hr-recruiting' },
      { name: 'Project Management', slug: 'project-management' }
    ]
  },
  {
    name: 'Music & Audio',
    slug: 'music-audio',
    subcategories: [
      { name: 'Voice Over', slug: 'voice-over' },
      { name: 'Mixing & Mastering', slug: 'mixing-mastering' },
      { name: 'Music Production', slug: 'music-production' },
      { name: 'Podcast Editing', slug: 'podcast-editing' },
      { name: 'Sound Design', slug: 'sound-design' },
      { name: 'Audio Production', slug: 'audio-production' },
      { name: 'Jingles & Intros', slug: 'jingles-intros' }
    ]
  },
  {
    name: 'Marketing, Branding & Sales',
    slug: 'marketing-branding-sales',
    subcategories: [
      { name: 'Sales Strategy', slug: 'sales-strategy' },
      { name: 'Brand Strategy', slug: 'brand-strategy' },
      { name: 'Cold Calling', slug: 'cold-calling' },
      { name: 'Telemarketing', slug: 'telemarketing' },
      { name: 'PR & Press Releases', slug: 'pr-press-releases' },
      { name: 'Event Marketing', slug: 'event-marketing' },
      { name: 'Influencer Marketing', slug: 'influencer-marketing' }
    ]
  },
  {
    name: 'Social Media',
    slug: 'social-media',
    subcategories: [
      { name: 'Social Media Strategy', slug: 'social-media-strategy' },
      { name: 'Community Management', slug: 'community-management' },
      { name: 'TikTok Content', slug: 'tiktok-content' },
      { name: 'Instagram Growth', slug: 'instagram-growth' },
      { name: 'YouTube Optimization', slug: 'youtube-optimization' },
      { name: 'LinkedIn Marketing', slug: 'linkedin-marketing' }
    ]
  }
];

interface HeaderCategoriesNavProps {
  navigate: (to: string, e?: React.MouseEvent) => void;
  currentCategory?: string;
}

const DISABLED_DROPDOWN_CATEGORIES = new Set<string>();

export const HeaderCategoriesNav: React.FC<HeaderCategoriesNavProps> = ({
  navigate,
  currentCategory
}) => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);


  return (
    <nav className="relative z-40 bg-white/90 border-b border-slate-200/80 backdrop-blur-xs shadow-2xs text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between gap-1 overflow-x-auto lg:overflow-visible py-2 scrollbar-none">
          {PPH_CATEGORIES.map((cat, idx) => {
            const hasDropdown = !DISABLED_DROPDOWN_CATEGORIES.has(cat.name) && cat.subcategories.length > 0;
            const isOpen = hasDropdown && activeCategory === cat.slug;
            const isCurrent = currentCategory?.toLowerCase() === cat.name.toLowerCase();
            const isRightAligned = idx >= PPH_CATEGORIES.length - 3;

            return (
              <div 
                key={cat.slug} 
                className="relative shrink-0"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    if (hasDropdown) {
                      setActiveCategory(isOpen ? null : cat.slug);
                    } else {
                      navigate(`/categories/${cat.slug}`, e);
                    }
                  }}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all text-xs sm:text-sm font-semibold whitespace-nowrap cursor-pointer ${
                    isOpen || isCurrent
                      ? 'text-emerald-700 bg-emerald-50/90 ring-1 ring-emerald-600/20'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                  }`}
                >
                  <span>{cat.name}</span>
                  {hasDropdown && (
                    <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-600' : ''}`} />
                  )}
                </button>

                {/* Subcategories Flyout Auto Dropdown with Hover Bridge */}
                {isOpen && hasDropdown && (
                  <div 
                    className={`absolute top-full -mt-0.5 pt-2 w-72 max-w-[calc(100vw-2rem)] z-[100] animate-in fade-in slide-in-from-top-1 duration-150 ${
                      isRightAligned ? 'right-0' : 'left-0'
                    }`}
                  >
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 p-4">
                      <div className="px-2 pb-2.5 mb-3 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Layers className="w-3 h-3 text-emerald-600" />
                          {cat.name}
                        </span>
                        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
                          {cat.subcategories.length} Topics
                        </span>
                      </div>

                      <div className="max-h-80 overflow-y-auto space-y-1 px-0.5">
                        <a
                          href={`/categories/${cat.slug}`}
                          onClick={(e) => {
                            e.preventDefault();
                            setActiveCategory(null);
                            navigate(`/categories/${cat.slug}`, e);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl text-emerald-700 hover:bg-emerald-50 font-semibold text-sm transition-colors flex items-center justify-between cursor-pointer mb-2 border border-emerald-100/80 bg-emerald-50/40"
                        >
                          <span>Explore All {cat.name}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </a>

                        {cat.subcategories.map((sub) => (
                          <a
                            key={sub.slug}
                            href={`/categories/${sub.slug}`}
                            onClick={(e) => {
                              e.preventDefault();
                              setActiveCategory(null);
                              navigate(`/categories/${sub.slug}`, e);
                            }}
                            className="w-full text-left px-3 py-1.5 rounded-lg text-slate-700 hover:text-slate-950 hover:bg-slate-100 font-medium text-sm transition-colors cursor-pointer flex items-center justify-between group"
                          >
                            <span>{sub.name}</span>
                            <span className="text-slate-300 group-hover:text-emerald-600 text-xs transition-colors">→</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
