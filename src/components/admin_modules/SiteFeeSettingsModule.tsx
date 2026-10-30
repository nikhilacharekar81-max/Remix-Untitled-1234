import React, { useState, useEffect } from 'react';
import { 
  Settings, DollarSign, Percent, ShieldCheck, Save, CheckCircle2, 
  HelpCircle, AlertCircle, RefreshCw, Layers, Sliders, Shield, Lock, Globe,
  Briefcase, ShoppingBag, Zap, Award, Sparkles, FileText
} from 'lucide-react';
import { UserAccount } from '../../types';

interface SiteFeeSettingsModuleProps {
  currentUser?: UserAccount | null;
  initialTakeRate?: number;
  initialClientServiceFee?: number;
  initialSmallOrderFeeThreshold?: number;
  initialSmallOrderFeeAmount?: number;
  initialEscrowHoldDays?: number;
  onSettingsSaved?: (newSettings?: any) => void;
}

import { DEFAULT_FEE_CONFIG } from '../../shared/fees';

export const SiteFeeSettingsModule: React.FC<SiteFeeSettingsModuleProps> = ({
  currentUser,
  initialTakeRate = DEFAULT_FEE_CONFIG.commissionPercent,
  initialClientServiceFee = DEFAULT_FEE_CONFIG.buyerFeePercent,
  initialSmallOrderFeeThreshold = DEFAULT_FEE_CONFIG.smallOrderThreshold,
  initialSmallOrderFeeAmount = DEFAULT_FEE_CONFIG.smallOrderFee,
  initialEscrowHoldDays = 14,
  onSettingsSaved
}) => {
  // Shared Platform Commission & Order Floor
  const [takeRate, setTakeRate] = useState<number>(initialTakeRate);
  const [clientServiceFee, setClientServiceFee] = useState<number>(initialClientServiceFee);
  const [smallOrderFeeAmount, setSmallOrderFeeAmount] = useState<number>(initialSmallOrderFeeAmount);
  const [smallOrderFeeThreshold, setSmallOrderFeeThreshold] = useState<number>(initialSmallOrderFeeThreshold);
  const [minOrder, setMinOrder] = useState<number>(0);
  const [minPayout, setMinPayout] = useState<number>(3);

  // Gigs Marketplace Specific Settings
  const [minGigPrice, setMinGigPrice] = useState<number>(5);
  const [maxGigPrice, setMaxGigPrice] = useState<number>(10000);
  const [featuredGigFee, setFeaturedGigFee] = useState<number>(10);
  const [gigModerationRequired, setGigModerationRequired] = useState<boolean>(false);

  // Projects / Job Board Specific Settings
  const [minProjectBudget, setMinProjectBudget] = useState<number>(5);
  const [maxProjectBudget, setMaxProjectBudget] = useState<number>(50000);
  const [urgentProjectFee, setUrgentProjectFee] = useState<number>(25);
  const [projectModerationRequired, setProjectModerationRequired] = useState<boolean>(false);

  // Escrow & Governance Rules
  const [escrowHoldDays, setEscrowHoldDays] = useState<number>(initialEscrowHoldDays);
  const [autoCompleteDays, setAutoCompleteDays] = useState<number>(3);
  const [autoCompleteEnabled, setAutoCompleteEnabled] = useState<boolean>(true);
  const [instantPayoutSurcharge, setInstantPayoutSurcharge] = useState<number>(1.5);

  // Operations & Brand Settings
  const [brandName, setBrandName] = useState('WorkPerHour');
  const [supportEmail, setSupportEmail] = useState('support@workperhour.com');
  const [currency, setCurrency] = useState('USD ($) - United States Dollar');
  const [maintenanceMode, setMaintenanceMode] = useState<boolean>(false);

  // Live Simulator State
  const [simOrderAmount, setSimOrderAmount] = useState<number>(500);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load existing settings on mount
  useEffect(() => {
    setIsLoading(true);
    fetch('/api/admin/settings')
      .then(res => res.json())
      .then(data => {
        if (data) {
          if (data.freelancerCommissionRate !== undefined) setTakeRate(data.freelancerCommissionRate);
          if (data.buyerProcessingFeeRate !== undefined) setClientServiceFee(data.buyerProcessingFeeRate);
          if (data.smallOrderFee !== undefined) setSmallOrderFeeAmount(data.smallOrderFee);
          if (data.smallOrderFeeThreshold !== undefined) setSmallOrderFeeThreshold(data.smallOrderFeeThreshold);
          if (data.escrowHoldDays !== undefined) setEscrowHoldDays(data.escrowHoldDays);
          if (data.autoCompleteDeliveredDays !== undefined) setAutoCompleteDays(data.autoCompleteDeliveredDays);
          if (data.autoCompleteDeliveredEnabled !== undefined) setAutoCompleteEnabled(data.autoCompleteDeliveredEnabled);
          if (data.minOrderAmount !== undefined) setMinOrder(data.minOrderAmount);
          if (data.minPayoutThreshold !== undefined) setMinPayout(data.minPayoutThreshold);
          if (data.featuredGigFee !== undefined) setFeaturedGigFee(data.featuredGigFee);
          if (data.urgentProjectFee !== undefined) setUrgentProjectFee(data.urgentProjectFee);
          if (data.minimumGigPrice !== undefined) setMinGigPrice(data.minimumGigPrice);
          if (data.maximumGigPrice !== undefined) setMaxGigPrice(data.maximumGigPrice);
          if (data.minimumProjectBudget !== undefined) setMinProjectBudget(data.minimumProjectBudget);
          if (data.maximumProjectBudget !== undefined) setMaxProjectBudget(data.maximumProjectBudget);
          if (data.gigModerationRequired !== undefined) setGigModerationRequired(Boolean(data.gigModerationRequired));
          if (data.projectModerationRequired !== undefined) setProjectModerationRequired(Boolean(data.projectModerationRequired));
          if (data.brandName) setBrandName(data.brandName);
          if (data.supportEmail) setSupportEmail(data.supportEmail);
          if (data.maintenanceMode !== undefined) setMaintenanceMode(Boolean(data.maintenanceMode));
        }
      })
      .catch(err => console.error('Failed to fetch admin settings:', err))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSavedSuccess(false);
    setSaveError(null);

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          freelancerCommissionRate: takeRate,
          clientServiceFee,
          smallOrderFeeThreshold,
          smallOrderFeeAmount,
          escrowHoldDays,
          autoCompleteDays,
          autoCompleteDeliveredDays: autoCompleteDays,
          autoCompleteDeliveredEnabled: autoCompleteEnabled,
          autoCompleteEnabled,
          minOrderAmount: minOrder,
          minimumOrderAmount: minOrder,
          minPayoutThreshold: minPayout,
          minimumWithdrawal: minPayout,
          featuredGigFee,
          urgentProjectFee,
          // Dedicated Gig & Project Settings
          minimumGigPrice: minGigPrice,
          maximumGigPrice: maxGigPrice,
          minimumProjectBudget: minProjectBudget,
          maximumProjectBudget: maxProjectBudget,
          gigModerationRequired,
          projectModerationRequired,
          brandName,
          supportEmail,
          currency,
          maintenanceMode
        })
      });

      if (!response.ok) {
        let errorMessage = `Server responded with ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (jsonErr) {}
        throw new Error(errorMessage);
      }

      if (onSettingsSaved) {
        try {
          await Promise.resolve(onSettingsSaved({ takeRate, clientServiceFee, escrowHoldDays }));
        } catch (cbErr) {
          console.warn('Settings saved successfully but background data refresh encountered an issue:', cbErr);
        }
      }

      setIsSaving(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err: any) {
      console.error('Save settings error:', err);
      setIsSaving(false);
      setSavedSuccess(false);
      setSaveError(err.message || 'Failed to save settings. Please try again.');
      setTimeout(() => setSaveError(null), 5000);
    }
  };

  const handleResetDefaults = () => {
    setTakeRate(20);
    setClientServiceFee(1);
    setSmallOrderFeeAmount(1);
    setSmallOrderFeeThreshold(200);
    setEscrowHoldDays(14);
    setAutoCompleteDays(3);
    setAutoCompleteEnabled(true);
    setMinOrder(10);
    setMinPayout(3);
    setMinGigPrice(5);
    setMaxGigPrice(10000);
    setFeaturedGigFee(10);
    setGigModerationRequired(false);
    setMinProjectBudget(5);
    setMaxProjectBudget(50000);
    setUrgentProjectFee(25);
    setProjectModerationRequired(false);
    setInstantPayoutSurcharge(1.5);
    setBrandName('WorkPerHour');
    setSupportEmail('support@workperhour.com');
    setMaintenanceMode(false);
    alert('Settings reset to default values.');
  };

  // Simulator calculations
  const orderGrossValue = simOrderAmount;
  const buyerServiceSurcharge = Number((orderGrossValue * (clientServiceFee / 100)).toFixed(2));
  const smallOrderFeeApplies = orderGrossValue < smallOrderFeeThreshold;
  const smallOrderFeeToApply = smallOrderFeeApplies ? smallOrderFeeAmount : 0;
  const buyerPaysAtCheckout = orderGrossValue + buyerServiceSurcharge + smallOrderFeeToApply;
  const platformTakeRateDeduction = Number((orderGrossValue * (takeRate / 100)).toFixed(2));
  const freelancerNetPayout = orderGrossValue - platformTakeRateDeduction;
  const totalPlatformMargin = buyerServiceSurcharge + platformTakeRateDeduction + smallOrderFeeToApply;
  const netMarginPercent = ((totalPlatformMargin / buyerPaysAtCheckout) * 100).toFixed(1);

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header Bar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider block mb-1">Super Administrator Suite</span>
          <h2 className="text-xl font-bold text-slate-900">Site & Fee Settings</h2>
          <p className="text-xs text-slate-500 mt-0.5">Configure distinct controls for Gigs & Catalog Services, Projects & Job Board Postings, platform commissions, escrow hold duration, and operational rules.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button 
            type="button" 
            onClick={handleResetDefaults}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Reset Defaults
          </button>
          <button 
            type="button" 
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {/* Top Summary Metric Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Take Rate</span>
          <div className="text-xl font-bold text-emerald-600 font-mono">{takeRate}%</div>
          <span className="text-[10px] text-slate-500 block">Freelancer Fee</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Buyer Fee</span>
          <div className="text-xl font-bold text-blue-600 font-mono">{clientServiceFee}%</div>
          <span className="text-[10px] text-slate-500 block">Checkout Surcharge</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Min Gig Price</span>
          <div className="text-xl font-bold text-slate-900 font-mono">${minGigPrice}</div>
          <span className="text-[10px] text-slate-500 block">Catalog Floor</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Min Project</span>
          <div className="text-xl font-bold text-indigo-600 font-mono">${minProjectBudget}</div>
          <span className="text-[10px] text-slate-500 block">Job Board Floor</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Escrow Hold</span>
          <div className="text-xl font-bold text-purple-600 font-mono">{escrowHoldDays} Days</div>
          <span className="text-[10px] text-slate-500 block">Vault Protection</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Min Payout</span>
          <div className="text-xl font-bold text-amber-600 font-mono">${minPayout}</div>
          <span className="text-[10px] text-slate-500 block">Withdrawal Floor</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* LEFT & CENTER (2 Cols): Sections */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* SECTION 1: GIG MARKETPLACE SETTINGS & FEES */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-emerald-600" />
                <span>1. Gig Marketplace Settings & Pricing Controls</span>
              </h3>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-full border border-emerald-200">
                Catalog & Gigs
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Min Gig Price ($)</label>
                  <input 
                    type="number" 
                    value={minGigPrice} 
                    onChange={(e) => setMinGigPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Minimum package price sellers can list.</span>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Max Gig Price ($)</label>
                  <input 
                    type="number" 
                    value={maxGigPrice} 
                    onChange={(e) => setMaxGigPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Upper limit for custom gig offers & packages.</span>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Featured Gig Promotion Fee ($)</label>
                  <input 
                    type="number" 
                    value={featuredGigFee} 
                    onChange={(e) => setFeaturedGigFee(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Fee charged to feature a gig on landing pages.</span>
                </div>
              </div>

              {/* Gig Moderation Controls */}
              <div className="pt-3 border-t border-slate-100">
                <label className="block text-slate-700 font-bold mb-1.5">Gig Catalog Publishing & Approval Policy</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setGigModerationRequired(false)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${!gigModerationRequired ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                  >
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Auto-Publish Gigs</span>
                    </div>
                    <div className="text-[10px] opacity-70 font-normal mt-0.5">Gigs are published immediately upon seller submit.</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGigModerationRequired(true)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${gigModerationRequired ? 'bg-amber-50 border-amber-300 text-amber-950 font-bold' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                  >
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-amber-600" />
                      <span>Require Admin Pre-Approval</span>
                    </div>
                    <div className="text-[10px] opacity-70 font-normal mt-0.5">Admin review required before gig goes live.</div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: PROJECT JOB BOARD SETTINGS & FEES */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-indigo-600" />
                <span>2. Project / Job Board Settings & Budget Controls</span>
              </h3>
              <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-full border border-indigo-200">
                Projects & Proposals
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Min Project Budget ($)</label>
                  <input 
                    type="number" 
                    value={minProjectBudget} 
                    onChange={(e) => setMinProjectBudget(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Minimum budget allowed when client posts a job.</span>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Max Project Budget ($)</label>
                  <input 
                    type="number" 
                    value={maxProjectBudget} 
                    onChange={(e) => setMaxProjectBudget(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Upper budget cap for project postings.</span>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Urgent Project Listing Fee ($)</label>
                  <input 
                    type="number" 
                    value={urgentProjectFee} 
                    onChange={(e) => setUrgentProjectFee(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Fee charged to client for Urgent / Expedited tag.</span>
                </div>
              </div>

              {/* Project Moderation Controls */}
              <div className="pt-3 border-t border-slate-100">
                <label className="block text-slate-700 font-bold mb-1.5">Project Postings Approval Policy</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setProjectModerationRequired(false)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${!projectModerationRequired ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-bold' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                  >
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Auto-Publish Job Posts</span>
                    </div>
                    <div className="text-[10px] opacity-70 font-normal mt-0.5">Projects are posted immediately to job board.</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProjectModerationRequired(true)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${projectModerationRequired ? 'bg-amber-50 border-amber-300 text-amber-950 font-bold' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                  >
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-amber-600" />
                      <span>Require Admin Pre-Approval</span>
                    </div>
                    <div className="text-[10px] opacity-70 font-normal mt-0.5">Admin review required before job post goes live.</div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: PLATFORM SHARED COMMISSIONS & FEES */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Percent className="w-4 h-4 text-emerald-600" />
                <span>3. Platform Shared Commissions & Order Floor</span>
              </h3>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-full border border-emerald-200">
                Active Monetization
              </span>
            </div>

            <div className="space-y-6 text-xs">
              {/* Freelancer Take Rate Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-slate-800">Freelancer Platform Take Rate (%)</span>
                  <span className="text-emerald-600 font-mono text-sm">{takeRate}%</span>
                </div>
                <p className="text-slate-500 text-[11px]">Deducted from freelancer escrow gross earnings upon order completion.</p>
                <div className="flex items-center gap-3">
                  <input 
                    type="range"
                    min="0"
                    max="35"
                    step="0.5"
                    value={takeRate}
                    onChange={(e) => setTakeRate(parseFloat(e.target.value))}
                    className="flex-1 accent-emerald-600 cursor-pointer"
                  />
                  <div className="flex gap-1.5">
                    {[5, 10, 15, 20].map(val => (
                      <button 
                        key={val}
                        type="button"
                        onClick={() => setTakeRate(val)}
                        className={`px-2.5 py-1 rounded-lg font-bold text-[10px] border cursor-pointer ${takeRate === val ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                      >
                        {val}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Client Service Fee */}
              <div className="space-y-2 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-slate-800">Client Service Fee (%)</span>
                  <span className="text-blue-600 font-mono text-sm">{clientServiceFee}%</span>
                </div>
                <input 
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  value={clientServiceFee}
                  onChange={(e) => setClientServiceFee(parseFloat(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              {/* Small Order Fee Section */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="font-bold text-slate-800">Additional Small-Order Fee</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">Threshold Amount ($)</label>
                    <input 
                      type="number"
                      value={smallOrderFeeThreshold}
                      onChange={(e) => setSmallOrderFeeThreshold(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">Fee Amount ($)</label>
                    <input 
                      type="number"
                      value={smallOrderFeeAmount}
                      onChange={(e) => setSmallOrderFeeAmount(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                    />
                  </div>
                </div>
                <p className="text-slate-500 text-[11px]">Applied to all checkout orders under the threshold amount.</p>
              </div>

              {/* Min Order Floor */}
              <div className="pt-4 border-t border-slate-100">
                <label className="block text-slate-700 font-bold mb-1">Min Order Checkout Floor ($)</label>
                <input 
                  type="number" 
                  value={minOrder} 
                  onChange={(e) => setMinOrder(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Hard floor threshold enforced by ledger engine.</span>
              </div>
            </div>
          </div>

          {/* SECTION 4: ESCROW PROTECTION & VAULT RULES */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-600" />
                <span>4. Escrow Protection & Vault Rules</span>
              </h3>
              <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-2.5 py-1 rounded-full border border-purple-200">
                Double-Entry Ledger
              </span>
            </div>

            <div className="space-y-5 text-xs">
              {/* Mandatory Escrow Vault Hold Duration */}
              <div className="space-y-2">
                <label className="block font-bold text-slate-800">Mandatory Escrow Vault Hold Duration</label>
                <p className="text-slate-500 text-[11px]">Holding duration before completed funds become eligible for external withdrawal disbursements.</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[3, 7, 14, 30].map(days => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setEscrowHoldDays(days)}
                      className={`py-2.5 px-3 rounded-xl border text-center font-bold text-xs transition-colors cursor-pointer ${
                        escrowHoldDays === days ? 'bg-purple-600 text-white border-purple-600 shadow-xs' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {days} Days {days === 14 ? '(Standard)' : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Delivered Order Auto-Approval Window */}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <label className="block font-bold text-slate-800">Delivered Order Auto-Approval Window</label>
                <p className="text-slate-500 text-[11px]">If buyer is unresponsive after work delivery, the order automatically approves and releases escrow.</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[1, 3, 5, 7].map(days => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setAutoCompleteDays(days)}
                      className={`py-2.5 px-3 rounded-xl border text-center font-bold text-xs transition-colors cursor-pointer ${
                        autoCompleteDays === days ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {days} Day{days > 1 ? 's' : ''} {days === 3 ? '(Standard)' : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Min Payout Floor & Instant Payout Surcharge */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Min Freelancer Payout Floor ($)</label>
                  <input 
                    type="number" 
                    value={minPayout} 
                    onChange={(e) => setMinPayout(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Instant Payout Surcharge (%)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={instantPayoutSurcharge} 
                    onChange={(e) => setInstantPayoutSurcharge(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 5: PLATFORM IDENTITY & OPERATIONS */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-600" />
                <span>5. Platform Identity & Operations</span>
              </h3>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Platform Brand Name</label>
                  <input 
                    type="text" 
                    value={brandName} 
                    onChange={(e) => setBrandName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Support Email Desk</label>
                  <input 
                    type="email" 
                    value={supportEmail} 
                    onChange={(e) => setSupportEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Maintenance Mode Switch</label>
                <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div>
                    <div className="text-xs font-bold text-slate-800">
                      {maintenanceMode ? 'Enabled (Read-Only Maintenance)' : 'Disabled (Live Operational)'}
                    </div>
                    <div className="text-[10px] text-slate-500">Put marketplace in read-only maintenance window</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMaintenanceMode(!maintenanceMode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      maintenanceMode ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {maintenanceMode ? 'Turn Off' : 'Enable'}
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN (1 Col): Live Fee Calculator & Simulator */}
        <div className="lg:col-span-1 sticky top-24 space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-600" />
                <span>Live Fee Calculator & Simulator</span>
              </h3>
              <span className="text-[9px] font-mono text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                INSTANT PREVIEW
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1.5">Enter Sample Order / Contract Price ($):</label>
                <input 
                  type="number"
                  value={simOrderAmount}
                  onChange={(e) => setSimOrderAmount(Math.max(1, parseFloat(e.target.value) || 0))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-sm text-slate-900"
                />
                <div className="flex gap-1.5 mt-2">
                  {[100, 250, 500, 1000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setSimOrderAmount(amt)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-mono font-bold text-slate-700 cursor-pointer"
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-100 font-mono text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Order Gross Value:</span>
                  <span className="font-bold text-slate-900">${orderGrossValue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-blue-600">
                  <span>Client Service Fee (+{clientServiceFee}%):</span>
                  <span className="font-bold">+${(orderGrossValue * (clientServiceFee / 100)).toFixed(2)}</span>
                </div>
                {smallOrderFeeApplies && (
                  <div className="flex justify-between text-amber-600">
                    <span>Small Order Fee:</span>
                    <span className="font-bold">+${smallOrderFeeAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-900 font-bold pt-1 border-t border-slate-100">
                  <span>Buyer Pays at Checkout:</span>
                  <span>${buyerPaysAtCheckout.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>Platform Take Rate (-{takeRate}%):</span>
                  <span className="font-bold">-${platformTakeRateDeduction.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-900 font-bold pt-1 border-t border-slate-100">
                  <span>Freelancer Net Payout:</span>
                  <span className="text-emerald-600">${freelancerNetPayout.toFixed(2)}</span>
                </div>
              </div>

              <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-1 mt-4">
                <div className="flex justify-between items-center text-xs font-bold text-emerald-900">
                  <span>TOTAL PLATFORM MARGIN:</span>
                  <span className="font-mono text-sm text-emerald-700">${totalPlatformMargin.toFixed(2)}</span>
                </div>
                <div className="text-[10px] text-emerald-700 font-medium text-right">
                  ({netMarginPercent}% Net Margin)
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {savedSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>Platform settings successfully saved and live across all marketplace instances!</span>
        </div>
      )}

      {saveError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>Error: {saveError}</span>
        </div>
      )}
    </div>
  );
};
