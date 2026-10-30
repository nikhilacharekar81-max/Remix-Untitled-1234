import React, { useState } from 'react';
import { 
  UserAccount 
} from '../../types';
import { 
  User, Pencil, Camera, MapPin, Plus, Trash2, Check, 
  Eye, ArrowLeft, Globe, Award, Image as ImageIcon,
  Briefcase, Save, Sparkles, X, Upload
} from 'lucide-react';
import { fetchWithRetry } from '../../utils/fetchRetry';
import { DEFAULT_AVATAR, DEFAULT_GIG_IMAGE, DEFAULT_PROJECT_IMAGE } from '../../constants';

interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  category: string;
  image: string;
  attachmentName?: string;
  attachmentUrl?: string;
}

interface LanguageItem {
  id: string;
  language: string;
  fluency: string;
}

interface EducationItem {
  id: string;
  title: string;
  institution: string;
  year: string;
}

interface EditProfilePageProps {
  currentUser: UserAccount | null;
  updateCurrentUser: (u: UserAccount | null | ((prev: UserAccount | null) => UserAccount | null)) => void;
  navigate: (to: string, e?: React.MouseEvent) => void;
}

export const EditProfilePage: React.FC<EditProfilePageProps> = ({
  currentUser,
  updateCurrentUser,
  navigate
}) => {
  // If no current user, default fallback user
  const user = currentUser || {
    id: 'user_1',
    name: 'Nikhil A',
    username: 'nikhil.a',
    email: 'nikhil@workperhour.com',
    role: 'user',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop',
    title: 'SEO Expert & High DA Authority Guest Post Publisher',
    rating: 4.9,
    reviewsCount: 142,
    hourlyRate: 25,
    earned: 48500,
    completedJobs: 1717,
    bio: 'I am a full-time SEO professional and guest blogger with access to high authority news media outlets and blogs.',
    skills: ['guest posts', 'link building', 'seo marketing', 'guest blogging', 'digital marketing', 'seo audit', 'backlinks', 'content writing'],
    status: 'active',
    verified: true,
    walletBalance: 1250,
    createdAt: 'Jan 2023',
    isAvailableNow: true
  };

  // State management
  const [name, setName] = useState(user.name);
  const [title, setTitle] = useState(user.title || '');
  const [hourlyRate, setHourlyRate] = useState<number>(user.hourlyRate || 25);
  const [location, setLocation] = useState('Mumbai, India');
  const [bio, setBio] = useState(user.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar);
  const [coverUrl, setCoverUrl] = useState('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&h=300&fit=crop');

  // Skills state
  const [skills, setSkills] = useState<string[]>(user.skills || ['SEO', 'Guest Posting', 'Backlinks']);
  const [newSkillInput, setNewSkillInput] = useState('');

  // Languages
  const [languages, setLanguages] = useState<LanguageItem[]>([
    { id: 'lang_1', language: 'English', fluency: 'Fluent' },
    { id: 'lang_2', language: 'Hindi', fluency: 'Native' }
  ]);
  const [newLangName, setNewLangName] = useState('');
  const [newLangFluency, setNewLangFluency] = useState('Fluent');

  // Education
  const [education, setEducation] = useState<EducationItem[]>([
    { id: 'edu_1', title: 'Bachelor of Science in Computer Science', institution: 'University of Technology', year: '2020' }
  ]);
  const [newEduTitle, setNewEduTitle] = useState('');
  const [newEduInst, setNewEduInst] = useState('');
  const [newEduYear, setNewEduYear] = useState('2021');

  // Portfolio items
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([
    {
      id: 'port_1',
      title: 'High DA Backlinks & SEO Audit Case Study',
      description: 'Increased organic search traffic by +340% for an e-commerce client in 90 days.',
      category: 'Digital Marketing & SEO',
      image: 'https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?w=400&h=250&fit=crop',
      attachmentName: 'SEO_Audit_Report_2026.pdf'
    }
  ]);

  // Modal / Add Portfolio form
  const [showAddPortfolio, setShowAddPortfolio] = useState(false);
  const [portTitle, setPortTitle] = useState('');
  const [portDesc, setPortDesc] = useState('');
  const [portCat, setPortCat] = useState('Technology & Programming');
  const [portImg, setPortImg] = useState('https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400&h=250&fit=crop');
  const [portAttachmentName, setPortAttachmentName] = useState('');

  // Availability & Preference
  const [weeklyHours, setWeeklyHours] = useState(35);
  const [isAvailableNow, setIsAvailableNow] = useState(user.isAvailableNow !== undefined ? user.isAvailableNow : true);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Add skill handler
  const handleAddSkill = () => {
    if (!newSkillInput.trim()) return;
    const trimmed = newSkillInput.trim();
    if (!skills.includes(trimmed)) {
      setSkills([...skills, trimmed]);
    }
    setNewSkillInput('');
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter(s => s !== skillToRemove));
  };

  // Add Language
  const handleAddLanguage = () => {
    if (!newLangName.trim()) return;
    setLanguages([...languages, {
      id: 'lang_' + Date.now(),
      language: newLangName.trim(),
      fluency: newLangFluency
    }]);
    setNewLangName('');
  };

  const handleRemoveLanguage = (id: string) => {
    setLanguages(languages.filter(l => l.id !== id));
  };

  // Add Education
  const handleAddEducation = () => {
    if (!newEduTitle.trim()) return;
    setEducation([...education, {
      id: 'edu_' + Date.now(),
      title: newEduTitle.trim(),
      institution: newEduInst.trim() || 'University',
      year: newEduYear
    }]);
    setNewEduTitle('');
    setNewEduInst('');
  };

  const handleRemoveEducation = (id: string) => {
    setEducation(education.filter(e => e.id !== id));
  };

  // Add Portfolio item
  const handleAddPortfolioItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!portTitle.trim()) return;
    const newItem: PortfolioItem = {
      id: 'port_' + Date.now(),
      title: portTitle.trim(),
      description: portDesc.trim(),
      category: portCat,
      image: portImg || 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400&h=250&fit=crop',
      attachmentName: portAttachmentName ? portAttachmentName : undefined
    };
    setPortfolioItems([...portfolioItems, newItem]);
    setShowAddPortfolio(false);
    setPortTitle('');
    setPortDesc('');
    setPortAttachmentName('');
    showToastMsg('Portfolio item added successfully!');
  };

  const handleRemovePortfolioItem = (id: string) => {
    setPortfolioItems(portfolioItems.filter(p => p.id !== id));
    showToastMsg('Portfolio item removed.');
  };

  // Save all profile changes
  const handleSaveAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const updatedUser: UserAccount = {
      ...user,
      name,
      title,
      hourlyRate,
      bio,
      avatar: avatarUrl,
      skills,
      isAvailableNow
    };

    updateCurrentUser(updatedUser);

    try {
      const res = await fetchWithRetry('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          title,
          hourlyRate,
          bio,
          avatar: avatarUrl,
          skills,
          isAvailableNow
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          updateCurrentUser(data.user);
        }
        showToastMsg('Your profile has been saved successfully!');
      } else {
        const errData = await res.json().catch(() => ({}));
        showToastMsg(errData.error || 'Failed to save profile changes to database.');
      }
    } catch (err) {
      console.error('Failed to persist profile:', err);
      showToastMsg('Saved locally, but network error persisting to server.');
    }
  };

  // View public profile
  const handleViewPublicProfile = (e: React.MouseEvent) => {
    const userSlug = (user.username || name.toLowerCase().replace(/\s+/g, '-'));
    navigate(`/profile/${userSlug}`, e);
  };

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-slate-800 font-sans pb-20">
      
      {/* Toast Banner */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2.5 animate-in fade-in slide-in-from-top duration-200">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Top Dark Navigation Breadcrumb Bar */}
      <div className="w-full bg-[#1b2129] border-b border-slate-800 py-5 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <button 
              onClick={(e) => navigate('/gigs', e)}
              className="text-slate-400 hover:text-white transition flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft size={13} />
              <span>Home</span>
            </button>
            <span className="text-slate-600">/</span>
            <button 
              onClick={(e) => navigate('/settings', e)}
              className="text-slate-400 hover:text-white transition cursor-pointer"
            >
              Settings
            </button>
            <span className="text-slate-600">/</span>
            <span className="text-emerald-400 font-semibold">Edit Profile</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleViewPublicProfile}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs border border-slate-700 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Eye size={13} className="text-emerald-400" />
              <span>View Public Profile</span>
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5 shadow-sm cursor-pointer border border-emerald-500"
            >
              <Save size={13} />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Form Container */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-6 space-y-6">

        {/* Page Header Title */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Edit Freelancer Profile</h1>
            <p className="text-xs text-slate-500 mt-1">
              Customize your public profile, title, hourly rate, portfolio items, and skills to win more buyer orders.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveAll} className="space-y-6">

          {/* ========================================================= */}
          {/* 1. COVER PHOTO & AVATAR SECTION */}
          {/* ========================================================= */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
            {/* Cover Banner */}
            <div className="relative h-44 w-full bg-slate-800">
              <img 
                src={coverUrl || DEFAULT_PROJECT_IMAGE} 
                alt="Profile Banner" 
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_PROJECT_IMAGE; }}
              />
              <div className="absolute inset-0 bg-black/20" />
              <label 
                className="absolute top-4 right-4 bg-white/90 hover:bg-white text-slate-800 text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-sm border border-slate-200 cursor-pointer flex items-center gap-1.5 transition"
              >
                <Camera size={13} className="text-slate-600" />
                <span>Change Cover Photo</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      const url = URL.createObjectURL(e.target.files[0]);
                      setCoverUrl(url);
                      showToastMsg('Cover banner updated!');
                    }
                  }}
                />
              </label>
            </div>

            {/* Avatar & Main Info Row */}
            <div className="px-6 pb-6 pt-0 relative flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 -mt-12">
              <div className="flex items-end gap-4">
                <div className="relative inline-block group">
                  <img 
                    src={avatarUrl || DEFAULT_AVATAR} 
                    alt={name} 
                    className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md ring-2 ring-slate-200 bg-slate-100"
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                  />
                  <label 
                    className="absolute bottom-0 right-0 p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full cursor-pointer shadow-md transition border-2 border-white"
                    title="Upload Profile Picture"
                  >
                    <Camera size={13} />
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const url = URL.createObjectURL(e.target.files[0]);
                          setAvatarUrl(url);
                          showToastMsg('Profile picture updated!');
                        }
                      }}
                    />
                  </label>
                </div>

                <div className="space-y-1 mb-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    CERT 5 Top Freelancer
                  </span>
                  <h2 className="text-xl font-bold text-slate-900">{name}</h2>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <MapPin size={12} className="text-slate-400" />
                    <span>{location}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-stretch sm:self-auto">
                <button
                  type="button"
                  onClick={handleViewPublicProfile}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Eye size={13} />
                  <span>Preview</span>
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Save size={13} />
                  <span>Save Profile</span>
                </button>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 2. BASIC PROFILE INFORMATION */}
          {/* ========================================================= */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <User size={16} className="text-emerald-600" />
              <span>Basic Information</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider text-[10px] mb-1">
                  Full Display Name *
                </label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:outline-none focus:bg-white focus:border-emerald-500 transition"
                  placeholder="e.g. Nikhil A"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider text-[10px] mb-1">
                  Hourly Rate ($ / hour) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold">$</span>
                  <input 
                    type="number" 
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(Number(e.target.value))}
                    required
                    min={5}
                    max={500}
                    className="w-full pl-8 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold focus:outline-none focus:bg-white focus:border-emerald-500 transition"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-bold uppercase tracking-wider text-[10px] mb-1">
                Professional Job Title / Headline *
              </label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:bg-white focus:border-emerald-500 transition text-xs"
                placeholder="e.g. Senior Full-Stack Engineer & SEO Specialist"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                A concise title (max 80 chars) that highlights your main core expertise to buyers.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider text-[10px] mb-1">
                  Location (City, Country)
                </label>
                <input 
                  type="text" 
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 transition"
                  placeholder="e.g. Mumbai, India"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider text-[10px] mb-1">
                  Availability Status
                </label>
                <select 
                  value={isAvailableNow ? 'active' : 'busy'}
                  onChange={(e) => setIsAvailableNow(e.target.value === 'active')}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:outline-none focus:bg-white focus:border-emerald-500 transition"
                >
                  <option value="active">🟢 Available for new projects now</option>
                  <option value="busy">🔴 Busy / Not taking new orders right now</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  About Me / Profile Summary *
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  {bio.length} chars
                </span>
              </div>
              <textarea 
                rows={5}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 leading-relaxed focus:outline-none focus:bg-white focus:border-emerald-500 transition text-xs"
                placeholder="Describe your background, years of industry experience, key achievements, and what sets your service apart..."
              />
            </div>
          </div>

          {/* ========================================================= */}
          {/* 3. SKILLS & EXPERTISE */}
          {/* ========================================================= */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles size={16} className="text-emerald-600" />
                <span>Skills & Expertise</span>
              </span>
              <span className="text-xs text-slate-400 font-normal">
                {skills.length} skills listed
              </span>
            </h3>

            {/* Current Skills Tags */}
            <div className="flex flex-wrap gap-2 pt-1">
              {skills.map((skill, index) => (
                <span 
                  key={index}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-xs font-semibold rounded-lg border border-slate-200/80 flex items-center gap-2 transition"
                >
                  <span>{skill}</span>
                  <button 
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    className="text-slate-400 hover:text-red-600 cursor-pointer transition"
                    title="Remove skill"
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>

            {/* Add New Skill Input */}
            <div className="flex items-center gap-2 pt-2 text-xs">
              <input 
                type="text" 
                value={newSkillInput}
                onChange={(e) => setNewSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSkill();
                  }
                }}
                placeholder="Add a new skill (e.g. React, SEO Audit, Backlinks)..."
                className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 transition"
              />
              <button 
                type="button"
                onClick={handleAddSkill}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <Plus size={14} />
                <span>Add Skill</span>
              </button>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 4. PORTFOLIO SHOWCASE */}
          {/* ========================================================= */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ImageIcon size={16} className="text-emerald-600" />
                  <span>Portfolio Showcase</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Showcase your best past work samples, case studies, and deliverables.
                </p>
              </div>

              <button 
                type="button"
                onClick={() => setShowAddPortfolio(true)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>Add Item</span>
              </button>
            </div>

            {/* Portfolio Grid */}
            {portfolioItems.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                {portfolioItems.map((item) => (
                  <div 
                    key={item.id} 
                    className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-3 relative group hover:border-emerald-400 transition"
                  >
                    <div className="relative h-32 rounded-lg overflow-hidden bg-slate-200 border border-slate-200/60">
                      <img 
                        src={item.image || DEFAULT_GIG_IMAGE} 
                        alt={item.title} 
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_GIG_IMAGE; }}
                      />
                      <button 
                        type="button"
                        onClick={() => handleRemovePortfolioItem(item.id)}
                        className="absolute top-2 right-2 p-1.5 bg-slate-900/80 hover:bg-red-600 text-white rounded-lg transition cursor-pointer"
                        title="Delete portfolio item"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div className="space-y-1 text-xs">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                        {item.category}
                      </span>
                      <h4 className="font-bold text-slate-900 line-clamp-1">{item.title}</h4>
                      <p className="text-slate-600 text-[11px] line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                      {item.attachmentName && (
                        <div className="pt-1 flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                          <Upload size={11} className="text-emerald-600" />
                          <span>Attachment: {item.attachmentName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-2">
                <ImageIcon size={28} className="text-slate-300 mx-auto" />
                <h4 className="font-bold text-slate-700 text-xs">No Portfolio Items</h4>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  Add images and work samples to prove your expertise to potential buyers.
                </p>
                <button 
                  type="button"
                  onClick={() => setShowAddPortfolio(true)}
                  className="px-4 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  Upload First Portfolio Item
                </button>
              </div>
            )}

            {/* Add Portfolio Modal / Form */}
            {showAddPortfolio && (
              <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
                <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h4 className="font-bold text-slate-900 text-sm">Add New Portfolio Project</h4>
                    <button 
                      type="button" 
                      onClick={() => setShowAddPortfolio(false)}
                      className="text-slate-400 hover:text-slate-900"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-700 font-bold uppercase tracking-wider text-[10px] mb-1">
                        Project Title *
                      </label>
                      <input 
                        type="text" 
                        value={portTitle}
                        onChange={(e) => setPortTitle(e.target.value)}
                        placeholder="e.g. E-Commerce Website Redesign Case Study"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold uppercase tracking-wider text-[10px] mb-1">
                        Category
                      </label>
                      <select 
                        value={portCat}
                        onChange={(e) => setPortCat(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-emerald-500"
                      >
                        <option value="Technology & Programming">Technology & Programming</option>
                        <option value="Digital Marketing & SEO">Digital Marketing & SEO</option>
                        <option value="Design & Creative">Design & Creative</option>
                        <option value="Writing & Translation">Writing & Translation</option>
                        <option value="Video & Photo">Video & Photo</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold uppercase tracking-wider text-[10px] mb-1">
                        Cover Image URL
                      </label>
                      <input 
                        type="text" 
                        value={portImg}
                        onChange={(e) => setPortImg(e.target.value)}
                        placeholder="Image URL"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold uppercase tracking-wider text-[10px] mb-1">
                        Project Description
                      </label>
                      <textarea 
                        rows={3}
                        value={portDesc}
                        onChange={(e) => setPortDesc(e.target.value)}
                        placeholder="Brief summary of project scope and results achieved..."
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold uppercase tracking-wider text-[10px] mb-1">
                        Attachment File Name (Optional)
                      </label>
                      <input 
                        type="text" 
                        value={portAttachmentName}
                        onChange={(e) => setPortAttachmentName(e.target.value)}
                        placeholder="e.g. Deliverable_Audit.pdf"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button 
                      type="button" 
                      onClick={() => setShowAddPortfolio(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                    >
                      Cancel
                    </button>
                    <button 
                      type="button" 
                      onClick={handleAddPortfolioItem}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs"
                    >
                      Add to Portfolio
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* 5. LANGUAGES & EDUCATION */}
          {/* ========================================================= */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Languages */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                <Globe size={16} className="text-emerald-600" />
                <span>Languages</span>
              </h3>

              <div className="space-y-2 text-xs">
                {languages.map((lang) => (
                  <div 
                    key={lang.id} 
                    className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200/60"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{lang.language}</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-emerald-700 font-semibold">{lang.fluency}</span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => handleRemoveLanguage(lang.id)}
                      className="text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2 text-xs">
                <input 
                  type="text" 
                  value={newLangName}
                  onChange={(e) => setNewLangName(e.target.value)}
                  placeholder="Language (e.g. French)"
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-500"
                />
                <select 
                  value={newLangFluency}
                  onChange={(e) => setNewLangFluency(e.target.value)}
                  className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium"
                >
                  <option value="Native">Native</option>
                  <option value="Fluent">Fluent</option>
                  <option value="Conversational">Conversational</option>
                </select>
                <button 
                  type="button"
                  onClick={handleAddLanguage}
                  className="px-3.5 py-2 bg-slate-900 text-white font-bold rounded-xl cursor-pointer"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Education */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                <Award size={16} className="text-emerald-600" />
                <span>Education & Credentials</span>
              </h3>

              <div className="space-y-2 text-xs">
                {education.map((edu) => (
                  <div 
                    key={edu.id} 
                    className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200/60"
                  >
                    <div>
                      <h4 className="font-bold text-slate-900">{edu.title}</h4>
                      <p className="text-[11px] text-slate-500">{edu.institution} ({edu.year})</p>
                    </div>
                    <button 
                      type="button"
                      onClick={() => handleRemoveEducation(edu.id)}
                      className="text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-2 text-xs">
                <input 
                  type="text" 
                  value={newEduTitle}
                  onChange={(e) => setNewEduTitle(e.target.value)}
                  placeholder="Degree or Certificate Title"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-500"
                />
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newEduInst}
                    onChange={(e) => setNewEduInst(e.target.value)}
                    placeholder="University or Institution"
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                  <input 
                    type="text" 
                    value={newEduYear}
                    onChange={(e) => setNewEduYear(e.target.value)}
                    placeholder="Year"
                    className="w-20 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-500 text-center"
                  />
                  <button 
                    type="button"
                    onClick={handleAddEducation}
                    className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl cursor-pointer"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* ========================================================= */}
          {/* 6. BOTTOM ACTION BAR */}
          {/* ========================================================= */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex items-center justify-between">
            <button
              type="button"
              onClick={(e) => navigate('/gigs', e)}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleViewPublicProfile}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5"
              >
                <Eye size={14} />
                <span>View Profile</span>
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-2"
              >
                <Save size={14} />
                <span>Save All Changes</span>
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
};
