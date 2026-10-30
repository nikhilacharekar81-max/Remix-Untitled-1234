import React, { useState, useEffect } from 'react';
import { UserAccount } from '../types';
import { Check, X, Shield, Lock, CreditCard, Bell, Eye, Calendar, Download, Sparkles } from 'lucide-react';
import { fetchWithRetry } from '../utils/fetchRetry';

interface SettingsPageProps {
  currentUser: UserAccount | null;
  updateCurrentUser: (u: UserAccount | null | ((prev: UserAccount | null) => UserAccount | null)) => void;
  navigate: (to: string, e?: React.MouseEvent) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  currentUser,
  updateCurrentUser,
  navigate
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'notifications' | 'payments' | 'privacy' | 'availability'>('general');

  // Editable row states
  const [editingField, setEditingField] = useState<string | null>(null);
  
  // Form values state
  const [personalUrl, setPersonalUrl] = useState(() => {
    if (currentUser?.username) return `workperhour.com/${currentUser.username}`;
    if (currentUser?.name) return `workperhour.com/${currentUser.name.toLowerCase().replace(/\s+/g, '.')}`;
    return 'workperhour.com/member';
  });
  const [email, setEmail] = useState(currentUser?.email || 'user@workperhour.com');
  const [password, setPassword] = useState('*******************');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState("Mother's birthplace");
  const [securityAnswer, setSecurityAnswer] = useState('Mumbai');
  const [primaryCategory, setPrimaryCategory] = useState('Marketing & SEO');
  const [proposalCredits, setProposalCredits] = useState(1);
  const [featuredProposalCredits, setFeaturedProposalCredits] = useState(0);

  // Notification states
  const [emailNotifs, setEmailNotifs] = useState(currentUser?.notificationPreferences?.emailNotifications || 'Instant alerts for all messages');
  const [smsNotifs, setSmsNotifs] = useState(() => {
    if (currentUser?.notificationPreferences?.smsNotifications) {
      return currentUser.notificationPreferences.smsNotifications;
    }
    return currentUser?.mobile ? `Enabled (${currentUser.mobile})` : 'Disabled';
  });
  const [marketingNotifs, setMarketingNotifs] = useState(currentUser?.notificationPreferences?.marketingNotifs || 'Subscribed');

  useEffect(() => {
    if (currentUser) {
      fetchWithRetry('/api/users/notification-preferences')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            if (data.emailNotifications) setEmailNotifs(data.emailNotifications);
            if (data.smsNotifications) setSmsNotifs(data.smsNotifications);
            if (data.marketingNotifs) setMarketingNotifs(data.marketingNotifs);
          }
        })
        .catch(err => console.error('Failed to load notification preferences:', err));
    }
  }, [currentUser?.id]);

  // Payments states
  const [currency, setCurrency] = useState('USD ($)');
  const [withdrawalMethod, setWithdrawalMethod] = useState('Bank Transfer (Chase *8821)');
  const [taxResidency, setTaxResidency] = useState('India');

  // Privacy states
  const [profileVisibility, setProfileVisibility] = useState('Public');
  const [searchIndexing, setSearchIndexing] = useState('Allowed');

  // Availability states
  const [availableStatus, setAvailableStatus] = useState(currentUser?.isAvailableNow ? 'Active' : 'Inactive');

  const [isVacationMode, setIsVacationMode] = useState<boolean>(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleSaveNotificationPref = async (key: string, value: string) => {
    setEditingField(null);
    try {
      const res = await fetchWithRetry('/api/users/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
      if (res.ok) {
        const data = await res.json();
        if (currentUser && data.notificationPreferences) {
          updateCurrentUser((prev) => prev ? {
            ...prev,
            notificationPreferences: {
              ...(prev.notificationPreferences || {}),
              ...data.notificationPreferences
            }
          } : null);
        }
        showToast('Notification preferences saved.');
      } else {
        showToast('Failed to save preferences.');
      }
    } catch (err) {
      console.error('Error saving notification preferences:', err);
      showToast('Network error saving preferences.');
    }
  };

  const handleSaveField = async (field: string) => {
    setEditingField(null);
    if (field === 'email' && currentUser) {
      try {
        const res = await fetchWithRetry('/api/users/email', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.user) updateCurrentUser(data.user);
          showToast('Email address updated successfully!');
        } else {
          const errData = await res.json().catch(() => ({}));
          showToast(errData.error || 'Failed to update email address.');
        }
      } catch (err) {
        console.error('Failed to update email:', err);
        showToast('Network error updating email address.');
      }
      return;
    }
    showToast(`Successfully updated ${field.replace(/_/g, ' ')}!`);
  };

  return (
    <div className="min-h-screen bg-[#f5f7fa] font-sans text-slate-800 py-8 px-4 sm:px-6 lg:px-8">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-2xl border border-slate-800 flex items-center gap-2 animate-in fade-in slide-in-from-top duration-200">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Main Title */}
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Settings</h1>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="bg-[#eef2f6] rounded-xl p-1 flex items-center gap-1 border border-slate-200/60 overflow-x-auto text-sm font-medium">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-6 py-2.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'general' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            General
          </button>

          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-6 py-2.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'notifications' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Notifications
          </button>

          <button
            onClick={() => setActiveTab('payments')}
            className={`px-6 py-2.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'payments' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Payments
          </button>

          <button
            onClick={() => setActiveTab('privacy')}
            className={`px-6 py-2.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'privacy' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Privacy
          </button>

          <button
            onClick={() => setActiveTab('availability')}
            className={`px-6 py-2.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'availability' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Availability
          </button>
        </div>

        {/* Tab Content Cards */}
        <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden divide-y divide-slate-100">
          
          {/* GENERAL TAB */}
          {activeTab === 'general' && (
            <>
              {/* Row 0: Public Profile Webpage */}
              <div className="p-5 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-emerald-50/40 hover:bg-emerald-50/70 transition-colors border-b border-slate-100">
                <div className="w-full sm:w-1/3 text-sm font-bold text-slate-800">
                  Public Profile Webpage
                </div>
                <div className="w-full sm:w-1/2 text-xs text-slate-600 font-normal">
                  Customize title, hourly rate, bio, portfolio items, languages, and skills on your dedicated edit profile webpage.
                </div>
                <div className="w-full sm:w-1/6 text-left sm:text-right">
                  <button 
                    type="button"
                    onClick={(e) => navigate('/edit-profile', e)} 
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
                  >
                    Edit Profile
                  </button>
                </div>
              </div>

              {/* Row 1: Personal URL */}
              <div className="p-5 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="w-full sm:w-1/3 text-sm font-semibold text-slate-800">
                  Personal URL
                </div>
                <div className="w-full sm:w-1/2 text-sm text-slate-600 font-normal">
                  {editingField === 'personal_url' ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        value={personalUrl} 
                        onChange={(e) => setPersonalUrl(e.target.value)} 
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full focus:outline-emerald-500"
                      />
                      <button onClick={() => handleSaveField('personal_url')} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 cursor-pointer">Save</button>
                      <button onClick={() => setEditingField(null)} className="p-1 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer">✕</button>
                    </div>
                  ) : (
                    <span>{personalUrl}</span>
                  )}
                </div>
                <div className="w-full sm:w-1/6 text-left sm:text-right">
                  {editingField !== 'personal_url' && (
                    <button onClick={() => setEditingField('personal_url')} className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer">
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: Email */}
              <div className="p-5 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="w-full sm:w-1/3 text-sm font-semibold text-slate-800">
                  Email
                </div>
                <div className="w-full sm:w-1/2 text-sm text-slate-600 font-normal">
                  {editingField === 'email' ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="email" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full focus:outline-emerald-500"
                      />
                      <button onClick={() => handleSaveField('email')} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 cursor-pointer">Save</button>
                      <button onClick={() => setEditingField(null)} className="p-1 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer">✕</button>
                    </div>
                  ) : (
                    <span>{email}</span>
                  )}
                </div>
                <div className="w-full sm:w-1/6 text-left sm:text-right">
                  {editingField !== 'email' && (
                    <button onClick={() => setEditingField('email')} className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer">
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Row 3: Password */}
              <div className="p-5 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="w-full sm:w-1/3 text-sm font-semibold text-slate-800">
                  Password
                </div>
                <div className="w-full sm:w-1/2 text-sm text-slate-600 font-normal">
                  {editingField === 'password' ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="password" 
                        placeholder="Enter new password"
                        value={newPasswordInput} 
                        onChange={(e) => setNewPasswordInput(e.target.value)} 
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full focus:outline-emerald-500"
                      />
                      <button onClick={() => { setPassword('*******************'); setNewPasswordInput(''); handleSaveField('password'); }} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 cursor-pointer">Save</button>
                      <button onClick={() => setEditingField(null)} className="p-1 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer">✕</button>
                    </div>
                  ) : (
                    <span className="tracking-widest">{password}</span>
                  )}
                </div>
                <div className="w-full sm:w-1/6 text-left sm:text-right">
                  {editingField !== 'password' && (
                    <button onClick={() => setEditingField('password')} className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer">
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Row 4: Account */}
              <div className="p-5 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="w-full sm:w-1/3 text-sm font-semibold text-slate-800">
                  Account
                </div>
                <div className="w-full sm:w-1/2 text-sm text-slate-600 font-normal">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Active
                  </span>
                </div>
                <div className="w-full sm:w-1/6 text-left sm:text-right">
                  <button onClick={() => showToast('Account status is currently active.')} className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer">
                    Edit
                  </button>
                </div>
              </div>

              {/* Row 5: Security Question */}
              <div className="p-5 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="w-full sm:w-1/3 text-sm font-semibold text-slate-800">
                  Security Question
                </div>
                <div className="w-full sm:w-1/2 text-sm text-slate-600 font-normal">
                  {editingField === 'security_question' ? (
                    <div className="space-y-2">
                      <select 
                        value={securityQuestion} 
                        onChange={(e) => setSecurityQuestion(e.target.value)} 
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full bg-white focus:outline-emerald-500"
                      >
                        <option>Mother's birthplace</option>
                        <option>First pet name</option>
                        <option>Favorite childhood teacher</option>
                        <option>First school name</option>
                      </select>
                      <input 
                        type="text" 
                        value={securityAnswer} 
                        onChange={(e) => setSecurityAnswer(e.target.value)} 
                        placeholder="Security answer"
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full focus:outline-emerald-500"
                      />
                      <div className="flex items-center gap-2 pt-1">
                        <button onClick={() => handleSaveField('security_question')} className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 cursor-pointer">Save</button>
                        <button onClick={() => setEditingField(null)} className="p-1 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <span>{securityQuestion}</span>
                  )}
                </div>
                <div className="w-full sm:w-1/6 text-left sm:text-right">
                  {editingField !== 'security_question' && (
                    <button onClick={() => setEditingField('security_question')} className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer">
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Row 6: Proposal Credits */}
              <div className="p-5 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="w-full sm:w-1/3 text-sm font-semibold text-slate-800">
                  Proposal Credits
                </div>
                <div className="w-full sm:w-1/2 text-sm text-slate-600 font-bold font-mono">
                  {proposalCredits}
                </div>
                <div className="w-full sm:w-1/6 text-left sm:text-right">
                  <button 
                    onClick={() => {
                      setProposalCredits(prev => prev + 10);
                      showToast('10 Proposal Credits added to your account ($15)!');
                    }} 
                    className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer"
                  >
                    Buy More
                  </button>
                </div>
              </div>

              {/* Row 7: Featured Proposal Credits */}
              <div className="p-5 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="w-full sm:w-1/3 text-sm font-semibold text-slate-800">
                  Featured Proposal Credits
                </div>
                <div className="w-full sm:w-1/2 text-sm text-slate-600 font-bold font-mono">
                  {featuredProposalCredits}
                </div>
                <div className="w-full sm:w-1/6 text-left sm:text-right">
                  <button 
                    onClick={() => {
                      setFeaturedProposalCredits(prev => prev + 5);
                      showToast('5 Featured Proposal Credits added ($25)!');
                    }} 
                    className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer"
                  >
                    Buy Now
                  </button>
                </div>
              </div>

              {/* Row 8: Primary Category */}
              <div className="p-5 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="w-full sm:w-1/3 text-sm font-semibold text-slate-800">
                  Primary category
                </div>
                <div className="w-full sm:w-1/2 text-sm text-slate-600 font-normal">
                  {editingField === 'primary_category' ? (
                    <div className="flex items-center gap-2">
                      <select 
                        value={primaryCategory} 
                        onChange={(e) => setPrimaryCategory(e.target.value)} 
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full bg-white focus:outline-emerald-500"
                      >
                        <option>Marketing & SEO</option>
                        <option>Technology & Programming</option>
                        <option>Writing & Translation</option>
                        <option>Design & Creative</option>
                        <option>Digital Marketing</option>
                        <option>Video, Photo & Image</option>
                        <option>Business & Finance</option>
                      </select>
                      <button onClick={() => handleSaveField('primary_category')} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 cursor-pointer">Save</button>
                      <button onClick={() => setEditingField(null)} className="p-1 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer">✕</button>
                    </div>
                  ) : (
                    <span>{primaryCategory}</span>
                  )}
                </div>
                <div className="w-full sm:w-1/6 text-left sm:text-right">
                  {editingField !== 'primary_category' && (
                    <button onClick={() => setEditingField('primary_category')} className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer">
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Row 9: Download My Data */}
              <div className="p-5 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="w-full sm:w-1/3 text-sm font-semibold text-slate-800">
                  Download My Data
                </div>
                <div className="w-full sm:w-1/2 text-xs text-slate-400">
                  Request a complete JSON copy of your profile, orders, and financial history.
                </div>
                <div className="w-full sm:w-1/6 text-left sm:text-right">
                  <button 
                    onClick={() => {
                      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentUser || { email, personalUrl }));
                      const downloadAnchor = document.createElement('a');
                      downloadAnchor.setAttribute("href", dataStr);
                      downloadAnchor.setAttribute("download", "workperhour_user_data.json");
                      document.body.appendChild(downloadAnchor);
                      downloadAnchor.click();
                      downloadAnchor.remove();
                      showToast('User data archive downloaded successfully!');
                    }} 
                    className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer"
                  >
                    Download
                  </button>
                </div>
              </div>
            </>
          )}

          {/* NOTIFICATIONS TAB */}
          {activeTab === 'notifications' && (
            <>
              <div className="p-5 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="w-full sm:w-1/3 text-sm font-semibold text-slate-800">Email Notifications</div>
                <div className="w-full sm:w-1/2 text-sm text-slate-600 font-normal">
                  {editingField === 'email_notifs' ? (
                    <div className="space-y-2">
                      <select 
                        value={emailNotifs} 
                        onChange={(e) => setEmailNotifs(e.target.value)} 
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full bg-white focus:outline-emerald-500"
                      >
                        <option>Instant alerts for all messages</option>
                        <option>Daily digest</option>
                        <option>Important updates only</option>
                        <option>Disabled</option>
                      </select>
                      <div className="flex items-center gap-2 pt-1">
                        <button onClick={() => handleSaveNotificationPref('emailNotifications', emailNotifs)} className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 cursor-pointer">Save</button>
                        <button onClick={() => setEditingField(null)} className="p-1 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <span>{emailNotifs}</span>
                  )}
                </div>
                <div className="w-full sm:w-1/6 text-left sm:text-right">
                  {editingField !== 'email_notifs' && (
                    <button onClick={() => setEditingField('email_notifs')} className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer">Edit</button>
                  )}
                </div>
              </div>

              <div className="p-5 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="w-full sm:w-1/3 text-sm font-semibold text-slate-800">SMS Alerts</div>
                <div className="w-full sm:w-1/2 text-sm text-slate-600 font-normal">
                  {editingField === 'sms_notifs' ? (
                    <div className="space-y-2">
                      <select 
                        value={smsNotifs} 
                        onChange={(e) => setSmsNotifs(e.target.value)} 
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full bg-white focus:outline-emerald-500"
                      >
                        {currentUser?.mobile && <option>Enabled ({currentUser.mobile})</option>}
                        <option>Enabled</option>
                        <option>Disabled</option>
                      </select>
                      <div className="flex items-center gap-2 pt-1">
                        <button onClick={() => handleSaveNotificationPref('smsNotifications', smsNotifs)} className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 cursor-pointer">Save</button>
                        <button onClick={() => setEditingField(null)} className="p-1 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <span>{smsNotifs}</span>
                  )}
                </div>
                <div className="w-full sm:w-1/6 text-left sm:text-right">
                  {editingField !== 'sms_notifs' && (
                    <button onClick={() => setEditingField('sms_notifs')} className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer">Edit</button>
                  )}
                </div>
              </div>

              <div className="p-5 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="w-full sm:w-1/3 text-sm font-semibold text-slate-800">Marketing & Newsletters</div>
                <div className="w-full sm:w-1/2 text-sm text-slate-600 font-normal">
                  {editingField === 'marketing_notifs' ? (
                    <div className="space-y-2">
                      <select 
                        value={marketingNotifs} 
                        onChange={(e) => setMarketingNotifs(e.target.value)} 
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full bg-white focus:outline-emerald-500"
                      >
                        <option>Subscribed</option>
                        <option>Unsubscribed</option>
                      </select>
                      <div className="flex items-center gap-2 pt-1">
                        <button onClick={() => handleSaveNotificationPref('marketingNotifs', marketingNotifs)} className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 cursor-pointer">Save</button>
                        <button onClick={() => setEditingField(null)} className="p-1 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <span>{marketingNotifs}</span>
                  )}
                </div>
                <div className="w-full sm:w-1/6 text-left sm:text-right">
                  {editingField !== 'marketing_notifs' && (
                    <button onClick={() => setEditingField('marketing_notifs')} className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer">Edit</button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* PAYMENTS TAB */}
          {activeTab === 'payments' && (
            <>
              <div className="p-5 sm:px-8 flex items-center justify-between">
                <div className="w-1/3 text-sm font-semibold text-slate-800">Primary Currency</div>
                <div className="w-1/2 text-sm text-slate-600">{currency}</div>
                <div className="w-1/6 text-right">
                  <button onClick={() => showToast('Currency settings updated.')} className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer">Edit</button>
                </div>
              </div>
              <div className="p-5 sm:px-8 flex items-center justify-between">
                <div className="w-1/3 text-sm font-semibold text-slate-800">Withdrawal Account</div>
                <div className="w-1/2 text-sm text-slate-600">{withdrawalMethod}</div>
                <div className="w-1/6 text-right">
                  <button onClick={() => navigate('/payments')} className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer">Manage</button>
                </div>
              </div>
              <div className="p-5 sm:px-8 flex items-center justify-between">
                <div className="w-1/3 text-sm font-semibold text-slate-800">Tax Residency</div>
                <div className="w-1/2 text-sm text-slate-600">{taxResidency}</div>
                <div className="w-1/6 text-right">
                  <button onClick={() => showToast('Tax residency updated.')} className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer">Edit</button>
                </div>
              </div>
            </>
          )}

          {/* PRIVACY TAB */}
          {activeTab === 'privacy' && (
            <>
              <div className="p-5 sm:px-8 flex items-center justify-between">
                <div className="w-1/3 text-sm font-semibold text-slate-800">Profile Visibility</div>
                <div className="w-1/2 text-sm text-slate-600">{profileVisibility}</div>
                <div className="w-1/6 text-right">
                  <button onClick={() => showToast('Profile visibility updated.')} className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer">Edit</button>
                </div>
              </div>
              <div className="p-5 sm:px-8 flex items-center justify-between">
                <div className="w-1/3 text-sm font-semibold text-slate-800">Search Engine Indexing</div>
                <div className="w-1/2 text-sm text-slate-600">{searchIndexing}</div>
                <div className="w-1/6 text-right">
                  <button onClick={() => showToast('Search indexing preference updated.')} className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer">Edit</button>
                </div>
              </div>
            </>
          )}

          {/* AVAILABILITY TAB */}
          {activeTab === 'availability' && (
            <div className="p-6 sm:p-8 space-y-8">
              
              {/* Row 1: Available Now Toggle Switch Slider */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                <div className="space-y-1 max-w-md">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">Available Now Status</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      currentUser?.isAvailableNow || availableStatus === 'Active'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                      {currentUser?.isAvailableNow || availableStatus === 'Active' ? '● Online & Available' : '○ Unavailable'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Display a bright green &ldquo;Available Now&rdquo; badge on your profile and search cards so clients can reach out instantly.
                  </p>
                </div>

                {/* Interactive Slider Switch */}
                <button
                  type="button"
                  onClick={async () => {
                    const isNowAvailable = !(currentUser?.isAvailableNow || availableStatus === 'Active');
                    setAvailableStatus(isNowAvailable ? 'Active' : 'Inactive');
                    if (currentUser) updateCurrentUser({ ...currentUser, isAvailableNow: isNowAvailable });
                    try {
                      const res = await fetchWithRetry('/api/users/availability', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ isAvailableNow: isNowAvailable })
                      });
                      if (res.ok) {
                        const data = await res.json();
                        if (data.user) updateCurrentUser(data.user);
                      }
                    } catch (err) {
                      console.error('Failed to toggle availability:', err);
                    }
                    showToast(isNowAvailable ? 'You are now marked as Available Now!' : 'Availability turned off');
                  }}
                  className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    currentUser?.isAvailableNow || availableStatus === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                  role="switch"
                  aria-checked={currentUser?.isAvailableNow || availableStatus === 'Active'}
                >
                  <span className="sr-only">Toggle Availability Status</span>
                  <span
                    className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      currentUser?.isAvailableNow || availableStatus === 'Active' ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Row 3: Vacation Mode Slider Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 max-w-md">
                  <span className="text-sm font-bold text-slate-800 block">Vacation / Pause Mode</span>
                  <p className="text-xs text-slate-500">
                    Temporarily pause incoming project proposals and set your profile status to on leave.
                  </p>
                </div>

                {/* Interactive Slider Switch */}
                <button
                  type="button"
                  onClick={() => {
                    const nextMode = !isVacationMode;
                    setIsVacationMode(nextMode);
                    showToast(nextMode ? 'Vacation Mode Enabled — Proposals paused.' : 'Vacation Mode Disabled — Open for work.');
                  }}
                  className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isVacationMode ? 'bg-amber-500' : 'bg-slate-300'
                  }`}
                  role="switch"
                  aria-checked={isVacationMode}
                >
                  <span className="sr-only">Toggle Vacation Mode</span>
                  <span
                    className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      isVacationMode ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
};
