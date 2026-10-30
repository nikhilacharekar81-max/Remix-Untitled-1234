import React, { useState, useEffect } from 'react';
import { CreditCard, CheckCircle2, AlertTriangle, RefreshCw, Key } from 'lucide-react';

interface GatewayConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  webhookId: string;
  primary: boolean;
}

interface EnvironmentGateways {
  paypal: GatewayConfig;
  stripe: GatewayConfig;
  razorpay: GatewayConfig;
}

interface PaymentGatewaysState {
  production: EnvironmentGateways;
  sandbox: EnvironmentGateways;
}

export const AdminPaymentGatewaysModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'production' | 'sandbox'>('sandbox');
  const [gateways, setGateways] = useState<PaymentGatewaysState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [editingGateway, setEditingGateway] = useState<'paypal' | 'stripe' | 'razorpay' | null>(null);
  const [editForm, setEditForm] = useState<GatewayConfig>({ enabled: false, clientId: '', clientSecret: '', webhookId: '', primary: false });
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchGateways = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/payment-gateways');
      const data = await res.json();
      if (data.success && data.gateways) {
        setGateways(data.gateways);
      }
    } catch (err) {
      console.error('Failed to load payment gateways:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGateways();
  }, []);

  const startEditing = (gwName: 'paypal' | 'stripe' | 'razorpay', config: GatewayConfig) => {
    setEditingGateway(gwName);
    setEditForm({ ...config });
    setTestResult(null);
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGateway) return;

    if (activeTab === 'production') {
      const confirmMsg = `DANGER: You are modifying PRODUCTION gateway settings for ${editingGateway.toUpperCase()}. Are you sure you want to proceed?`;
      if (!window.confirm(confirmMsg)) return;
    }

    try {
      setError(null);
      setSuccessMsg(null);
      const res = await fetch(`/api/admin/payment-gateways/${activeTab}/${editingGateway}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to update gateway configuration');
      }

      setGateways(prev => prev ? ({
        ...prev,
        [activeTab]: data.environmentGateways
      }) : prev);

      setSuccessMsg(`${editingGateway.toUpperCase()} (${activeTab}) updated successfully.`);
      setEditingGateway(null);
    } catch (err: any) {
      setError(err.message || 'Failed to update gateway.');
    }
  };

  const handleTestConnection = async (gwName: 'paypal' | 'stripe' | 'razorpay') => {
    try {
      setTesting(true);
      setTestResult(null);
      const res = await fetch(`/api/admin/payment-gateways/${activeTab}/${gwName}/test`, {
        method: 'POST'
      });
      const data = await res.json();
      setTestResult({ success: data.success, message: data.message });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Test connection failed.' });
    } finally {
      setTesting(false);
    }
  };

  if (loading && !gateways) {
    return (
      <div className="p-8 text-center text-slate-400 text-xs font-semibold">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
        Loading Payment Gateways configuration...
      </div>
    );
  }

  const envState = gateways ? gateways[activeTab] : null;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-emerald-600" />
            Payment Gateways
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure secure external payment provider integrations (PayPal, Stripe, Razorpay) with strict environment isolation.
          </p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button
            onClick={() => { setActiveTab('sandbox'); setEditingGateway(null); }}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              activeTab === 'sandbox' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Sandbox / Testing
          </button>
          <button
            onClick={() => { setActiveTab('production'); setEditingGateway(null); }}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              activeTab === 'production' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Production / Real
          </button>
        </div>
      </div>

      {activeTab === 'production' && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Production Environment Notice:</span> You are managing live payment credentials. Changes require administrative confirmation and affect real monetary transactions through the finance ledger escrow.
          </div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Gateways Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(['paypal', 'stripe', 'razorpay'] as const).map(gwKey => {
          const cfg = envState ? envState[gwKey] : null;
          const isConfigured = Boolean(cfg?.clientId && cfg?.clientSecret);

          return (
            <div key={gwKey} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 bg-slate-100 rounded-2xl text-slate-900 font-bold uppercase text-xs">
                      {gwKey.charAt(0).toUpperCase() + gwKey.slice(1)}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 capitalize">{gwKey}</h3>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${
                        cfg?.enabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {cfg?.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                  {cfg?.primary && (
                    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                      Primary
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Status:</span>
                    <span className={`font-bold ${isConfigured ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {isConfigured ? 'Configured' : 'Not Configured'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Client ID:</span>
                    <span className="font-mono text-[11px] text-slate-800 truncate max-w-[150px]">
                      {cfg?.clientId ? cfg.clientId : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Webhook:</span>
                    <span className={`font-bold ${cfg?.webhookId ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {cfg?.webhookId ? '✓ Configured' : '○ Not Configured'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEditing(gwKey, cfg || { enabled: false, clientId: '', clientSecret: '', webhookId: '', primary: false })}
                    className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition cursor-pointer text-center shadow-xs"
                  >
                    Configure
                  </button>
                  <button
                    onClick={() => handleTestConnection(gwKey)}
                    disabled={testing}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
                  >
                    Test
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {testResult && (
        <div className={`p-4 rounded-2xl border text-xs font-semibold flex items-center gap-2 ${
          testResult.success ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
        }`}>
          {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
          <span>{testResult.message}</span>
        </div>
      )}

      {/* Configuration Modal / Drawer */}
      {editingGateway && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-slate-900 text-white rounded-xl">
                  <Key className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 capitalize">Configure {editingGateway} ({activeTab})</h3>
                  <p className="text-[11px] text-slate-400">Secure server-side API credentials and webhook integration</p>
                </div>
              </div>
              <button
                onClick={() => setEditingGateway(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <div>
                  <span className="font-bold text-slate-900 block">Enable Gateway</span>
                  <span className="text-[11px] text-slate-500">Allow {editingGateway} payments in {activeTab}</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.enabled}
                    onChange={(e) => setEditForm({ ...editForm, enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <div>
                  <span className="font-bold text-slate-900 block">Primary Gateway</span>
                  <span className="text-[11px] text-slate-500">Designate as primary checkout provider for {activeTab}</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.primary}
                    onChange={(e) => setEditForm({ ...editForm, primary: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider text-[10px] mb-1.5">
                  Client ID / API Key
                </label>
                <input
                  type="text"
                  value={editForm.clientId}
                  onChange={(e) => setEditForm({ ...editForm, clientId: e.target.value })}
                  placeholder={`Enter ${editingGateway} client ID...`}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider text-[10px] mb-1.5 flex items-center justify-between">
                  <span>Client Secret</span>
                  <span className="text-[10px] text-slate-400 font-normal">Stored securely on server</span>
                </label>
                <input
                  type="password"
                  value={editForm.clientSecret}
                  onChange={(e) => setEditForm({ ...editForm, clientSecret: e.target.value })}
                  placeholder="•••••••••••••••• (Leave unchanged to keep existing secret)"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold uppercase tracking-wider text-[10px] mb-1.5">
                  Webhook ID (Optional)
                </label>
                <input
                  type="text"
                  value={editForm.webhookId}
                  onChange={(e) => setEditForm({ ...editForm, webhookId: e.target.value })}
                  placeholder="e.g. WH-8X921820..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingGateway(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer"
                >
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
