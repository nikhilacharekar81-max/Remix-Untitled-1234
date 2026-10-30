import React, { useState, useEffect } from 'react';
import { Award, Users, Briefcase, CheckCircle2, AlertCircle, RefreshCw, Sliders, ShieldCheck } from 'lucide-react';
import { getAuthToken } from '../../utils/authToken';

export const AdminMembershipsQuotasModule: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Form State
  const [membershipsEnabled, setMembershipsEnabled] = useState(true);
  const [standardBids, setStandardBids] = useState(15);
  const [proPrice, setProPrice] = useState(29);
  const [proBids, setProBids] = useState(80);

  const [standardJobPosts, setStandardJobPosts] = useState(10);
  const [enterprisePrice, setEnterprisePrice] = useState(99);
  const [enterpriseJobPosts, setEnterpriseJobPosts] = useState(999);

  // Marketplace & Gigs Limits
  const [minGigPrice, setMinGigPrice] = useState(10);
  const [maxGigPrice, setMaxGigPrice] = useState(10000);
  const [minProjectBudget, setMinProjectBudget] = useState(20);
  const [maxActiveOrders, setMaxActiveOrders] = useState(0);
  const [gigModeration, setGigModeration] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const token = getAuthToken();
      const res = await fetch('/api/admin/memberships', {
        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.memberships) {
          setMembershipsEnabled(data.memberships.membershipsEnabled ?? true);
          const fPlans = data.memberships.freelancerPlans || [];
          const standard = fPlans.find((p: any) => p.id === 'plan_free');
          const pro = fPlans.find((p: any) => p.id === 'plan_pro');
          if (standard) setStandardBids(standard.bidsPerMonth ?? 15);
          if (pro) {
            setProPrice(pro.priceMonthly ?? 29);
            setProBids(pro.bidsPerMonth ?? 80);
          }

          const bPlans = data.memberships.buyerPlans || [];
          const stdBuyer = bPlans.find((p: any) => p.id === 'buyer_free');
          const entBuyer = bPlans.find((p: any) => p.id === 'buyer_enterprise');
          if (stdBuyer) setStandardJobPosts(stdBuyer.jobPostsPerMonth ?? 10);
          if (entBuyer) {
            setEnterprisePrice(entBuyer.priceMonthly ?? 99);
            setEnterpriseJobPosts(entBuyer.jobPostsPerMonth ?? 999);
          }
        }
        if (data.marketplace) {
          setMinGigPrice(data.marketplace.minimumGigPrice ?? 5);
          setMaxGigPrice(data.marketplace.maximumGigPrice ?? 10000);
          setMinProjectBudget(data.marketplace.minimumProjectBudget ?? 5);
          setMaxActiveOrders(data.marketplace.maxActiveOrdersPerFreelancer ?? 0);
          setGigModeration(data.marketplace.gigModerationRequired ?? false);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load membership settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const token = getAuthToken();
      const payload = {
        memberships: {
          membershipsEnabled,
          freelancerPlans: [
            { id: 'plan_free', name: 'Standard Freelancer', priceMonthly: 0, bidsPerMonth: Number(standardBids), commissionDiscountPercent: 0, featuredBadge: false, enabled: true },
            { id: 'plan_pro', name: 'WorkPerHour Pro Talent', priceMonthly: Number(proPrice), bidsPerMonth: Number(proBids), commissionDiscountPercent: 2, featuredBadge: true, enabled: true }
          ],
          buyerPlans: [
            { id: 'buyer_free', name: 'Standard Client', priceMonthly: 0, jobPostsPerMonth: Number(standardJobPosts), zeroBuyerFee: false, enabled: true },
            { id: 'buyer_enterprise', name: 'Enterprise Client', priceMonthly: Number(enterprisePrice), jobPostsPerMonth: Number(enterpriseJobPosts), zeroBuyerFee: true, enabled: true }
          ]
        },
        marketplace: {
          minimumGigPrice: Number(minGigPrice),
          maximumGigPrice: Number(maxGigPrice),
          minimumProjectBudget: Number(minProjectBudget),
          maxActiveOrdersPerFreelancer: Number(maxActiveOrders),
          gigModerationRequired: Boolean(gigModeration)
        }
      };

      const res = await fetch('/api/admin/memberships', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save membership & quota settings');

      setSuccessMsg('Memberships, proposal quotas, and gig limits updated successfully!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading Membership & Quota Settings...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Memberships, Proposal Quotas & Gigs</h2>
          <p className="text-sm text-slate-500">Configure freelancer bid limits, client job post quotas, and marketplace gig rules.</p>
        </div>
        <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-semibold flex items-center gap-1.5 shadow-2xs">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Server Enforcement Active</span>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center gap-2 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        {/* Memberships Toggle */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Enable Membership Tiers</h3>
            <p className="text-xs text-slate-500">Master switch to enforce proposal and job post quotas on free/paid accounts.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={membershipsEnabled} 
              onChange={(e) => setMembershipsEnabled(e.target.checked)} 
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        {/* Freelancer Proposal Quotas */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-slate-900 text-base">Freelancer Proposal & Bid Quotas</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Standard (Free) Tier</span>
                <h4 className="font-bold text-slate-800">Standard Freelancer</h4>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bids / Proposals per Month</label>
                <input 
                  type="number" 
                  min="1" 
                  max="1000"
                  value={standardBids} 
                  onChange={(e) => setStandardBids(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Pro Talent Tier</span>
                <h4 className="font-bold text-slate-800">WorkPerHour Pro Talent</h4>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Price ($/mo)</label>
                  <input 
                    type="number" 
                    min="0" 
                    value={proPrice} 
                    onChange={(e) => setProPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bids / Month</label>
                  <input 
                    type="number" 
                    min="1" 
                    value={proBids} 
                    onChange={(e) => setProBids(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Client Job Posting Quotas */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-slate-900 text-base">Client Job Posting Quotas</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Standard (Free) Tier</span>
                <h4 className="font-bold text-slate-800">Standard Client</h4>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Job Posts per Month</label>
                <input 
                  type="number" 
                  min="1" 
                  value={standardJobPosts} 
                  onChange={(e) => setStandardJobPosts(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Enterprise Tier</span>
                <h4 className="font-bold text-slate-800">Enterprise Client</h4>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Price ($/mo)</label>
                  <input 
                    type="number" 
                    min="0" 
                    value={enterprisePrice} 
                    onChange={(e) => setEnterprisePrice(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Job Posts / Month</label>
                  <input 
                    type="number" 
                    min="1" 
                    value={enterpriseJobPosts} 
                    onChange={(e) => setEnterpriseJobPosts(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Gigs & Marketplace Limits */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-slate-900 text-base">Gigs & Marketplace Limits</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Min Gig Price ($)</label>
              <input 
                type="number" 
                min="1" 
                value={minGigPrice} 
                onChange={(e) => setMinGigPrice(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Gig Price ($)</label>
              <input 
                type="number" 
                min="10" 
                value={maxGigPrice} 
                onChange={(e) => setMaxGigPrice(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Min Project Budget ($)</label>
              <input 
                type="number" 
                min="1" 
                value={minProjectBudget} 
                onChange={(e) => setMinProjectBudget(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Active Orders per Freelancer (0 = Unlimited)</label>
              <input 
                type="number" 
                min="0" 
                value={maxActiveOrders} 
                onChange={(e) => setMaxActiveOrders(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={gigModeration} 
                  onChange={(e) => setGigModeration(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <span className="text-xs font-semibold text-slate-700">Require Admin Approval for Gigs</span>
              </label>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button 
            type="submit" 
            disabled={saving}
            className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition disabled:opacity-60 text-sm flex items-center gap-2 cursor-pointer shadow-sm"
          >
            {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
            <span>{saving ? 'Saving Changes...' : 'Save Membership & Quota Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
