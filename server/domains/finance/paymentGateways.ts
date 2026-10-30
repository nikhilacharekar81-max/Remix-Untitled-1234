import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { IS_PRODUCTION as INIT_IS_PRODUCTION, resolveIsProduction } from '../../initEnv.js';

export interface GatewayConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  webhookId: string;
  primary: boolean;
}

export interface EnvironmentGateways {
  paypal: GatewayConfig;
  stripe: GatewayConfig;
  razorpay: GatewayConfig;
}

export interface PaymentGatewaysState {
  production: EnvironmentGateways;
  sandbox: EnvironmentGateways;
}

const DEFAULT_GATEWAY: GatewayConfig = {
  enabled: false,
  clientId: '',
  clientSecret: '',
  webhookId: '',
  primary: false
};

const DEFAULT_ENV_GATEWAYS: EnvironmentGateways = {
  paypal: { ...DEFAULT_GATEWAY, primary: true },
  stripe: { ...DEFAULT_GATEWAY },
  razorpay: { ...DEFAULT_GATEWAY }
};

const DEFAULT_STATE: PaymentGatewaysState = {
  production: JSON.parse(JSON.stringify(DEFAULT_ENV_GATEWAYS)),
  sandbox: JSON.parse(JSON.stringify(DEFAULT_ENV_GATEWAYS))
};

const WEAK_GATEWAY_KEY_PLACEHOLDERS = new Set([
  'changeme',
  'secret',
  'default',
  'gateway_encryption_key',
  'your-gateway-encryption-key',
  'your_gateway_encryption_key',
  'dev_mode_fixed_gateway_encryption_key_12345',
  'replace-with-strong-secret',
  'password',
  '12345678',
  '1234567890123456',
  'admin',
  'administrator',
  'supersecret',
  'mysecretkey123456',
  'testsecretkey1234',
  'secretkey1234567890',
  'jwt_secret',
  'production_gateway_key'
]);

const EPHEMERAL_DEV_GATEWAY_KEY = crypto.randomBytes(32);

function hasLowEntropyKey(key: string): boolean {
  const trimmed = key.trim();
  const uniqueChars = new Set(trimmed).size;
  if (uniqueChars < 8) return true;

  for (let patternLen = 1; patternLen <= 8; patternLen++) {
    const pattern = trimmed.slice(0, patternLen);
    const repeated = pattern.repeat(Math.ceil(trimmed.length / patternLen)).slice(0, trimmed.length);
    if (trimmed === repeated) return true;
  }

  const alphaSeq = 'abcdefghijklmnopqrstuvwxyz0123456789';
  if (alphaSeq.includes(trimmed.toLowerCase())) return true;
  const numSeq = '0123456789012345678901234567890123456789';
  if (numSeq.includes(trimmed)) return true;

  return false;
}

export function isValidGatewayEncryptionKey(key: unknown, isProductionCheck = false): key is string {
  if (typeof key !== 'string') return false;
  const trimmed = key.trim();
  const minLen = isProductionCheck ? 32 : 16;
  if (trimmed.length < minLen) return false;

  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (WEAK_GATEWAY_KEY_PLACEHOLDERS.has(trimmed.toLowerCase()) || WEAK_GATEWAY_KEY_PLACEHOLDERS.has(normalized)) {
    return false;
  }

  if (hasLowEntropyKey(trimmed)) return false;

  return true;
}

export function assertProductionGatewayEncryptionKey(): string {
  const rawKey = process.env.GATEWAY_ENCRYPTION_KEY;
  if (!isValidGatewayEncryptionKey(rawKey, true)) {
    throw new Error(
      'FATAL: Production requires an explicit, high-entropy GATEWAY_ENCRYPTION_KEY environment variable (minimum 32 characters, independent of JWT_SECRET, non-placeholder, non-repetitive). Predictable fallback encryption keys are disabled in production.'
    );
  }
  const trimmedKey = rawKey.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (jwtSecret && trimmedKey.toLowerCase() === jwtSecret.toLowerCase()) {
    throw new Error(
      'FATAL: Production GATEWAY_ENCRYPTION_KEY must be independent of JWT_SECRET.'
    );
  }
  return trimmedKey;
}

if (INIT_IS_PRODUCTION || process.env.NODE_ENV === 'production' || resolveIsProduction(import.meta.url)) {
  assertProductionGatewayEncryptionKey();
}

function getEncryptionKey(): Buffer {
  const isProd = INIT_IS_PRODUCTION || process.env.NODE_ENV === 'production' || resolveIsProduction(import.meta.url);
  const rawKey = process.env.GATEWAY_ENCRYPTION_KEY;
  if (isValidGatewayEncryptionKey(rawKey, isProd)) {
    if (isProd && process.env.JWT_SECRET && rawKey.trim().toLowerCase() === process.env.JWT_SECRET.trim().toLowerCase()) {
      throw new Error(
        'FATAL: Production GATEWAY_ENCRYPTION_KEY must be independent of JWT_SECRET.'
      );
    }
    const trimmed = rawKey.trim();
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
    return crypto.createHash('sha256').update(trimmed).digest();
  }
  if (isProd) {
    assertProductionGatewayEncryptionKey();
  }
  return EPHEMERAL_DEV_GATEWAY_KEY;
}

const GATEWAY_FETCH_TIMEOUT_MS = 10_000;

export function encryptSecret(plaintext: string): string {
  if (!plaintext || plaintext.trim() === '') return '';
  if (plaintext.startsWith('enc:gcm:')) {
    // Validate that the existing GCM payload is authentic and decryptable before accepting
    decryptSecret(plaintext);
    return plaintext;
  }
  if (plaintext.includes('••••')) return '';
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `enc:gcm:${iv.toString('hex')}:${tag}:${encrypted}`;
  } catch (err) {
    console.error('[PaymentGateway] Encryption error (failing closed):', err);
    throw err;
  }
}

export function decryptSecret(ciphertext: string): string {
  if (!ciphertext || ciphertext.trim() === '') {
    return '';
  }
  if (!ciphertext.startsWith('enc:gcm:')) {
    throw new Error('Fail closed: Gateway credential must be GCM encrypted.');
  }
  try {
    const key = getEncryptionKey();
    const parts = ciphertext.split(':');
    if (parts.length !== 5) {
      throw new Error('Malformed GCM encrypted secret format.');
    }
    const iv = Buffer.from(parts[2], 'hex');
    const tag = Buffer.from(parts[3], 'hex');
    const encryptedText = parts[4];
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[PaymentGateway] Decryption authentication error:', err);
    throw new Error(`Failed to decrypt payment gateway secret: ${(err as Error).message}`);
  }
}

export class PaymentGatewayManager {
  private state: PaymentGatewaysState;

  constructor() {
    this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  public loadFromState(parsed: any) {
    if (parsed && typeof parsed === 'object') {
      const decryptGw = (gw: any, defaultPrimary = false): GatewayConfig => {
        const conf: GatewayConfig = { ...DEFAULT_GATEWAY, primary: defaultPrimary, ...(gw || {}) };
        if (conf.clientSecret) {
          try {
            conf.clientSecret = decryptSecret(conf.clientSecret);
          } catch (err) {
            console.error('[PaymentGateway] Resetting unreadable gateway credential on load:', (err as Error).message);
            conf.clientSecret = '';
            conf.enabled = false;
          }
        }
        return conf;
      };
      this.state = {
        production: {
          paypal: decryptGw(parsed.production?.paypal, true),
          stripe: decryptGw(parsed.production?.stripe, false),
          razorpay: decryptGw(parsed.production?.razorpay, false)
        },
        sandbox: {
          paypal: decryptGw(parsed.sandbox?.paypal, true),
          stripe: decryptGw(parsed.sandbox?.stripe, false),
          razorpay: decryptGw(parsed.sandbox?.razorpay, false)
        }
      };
    }
  }

  public getState(): PaymentGatewaysState {
    return this.state;
  }

  public getGateway(gatewayName: 'paypal' | 'stripe' | 'razorpay', env: 'production' | 'sandbox' = 'sandbox'): GatewayConfig {
    return this.state[env]?.[gatewayName];
  }

  public getEncryptedState(): PaymentGatewaysState {
    return {
      production: {
        paypal: { ...this.state.production.paypal, clientSecret: encryptSecret(this.state.production.paypal.clientSecret) },
        stripe: { ...this.state.production.stripe, clientSecret: encryptSecret(this.state.production.stripe.clientSecret) },
        razorpay: { ...this.state.production.razorpay, clientSecret: encryptSecret(this.state.production.razorpay.clientSecret) }
      },
      sandbox: {
        paypal: { ...this.state.sandbox.paypal, clientSecret: encryptSecret(this.state.sandbox.paypal.clientSecret) },
        stripe: { ...this.state.sandbox.stripe, clientSecret: encryptSecret(this.state.sandbox.stripe.clientSecret) },
        razorpay: { ...this.state.sandbox.razorpay, clientSecret: encryptSecret(this.state.sandbox.razorpay.clientSecret) }
      }
    };
  }

  public async saveToDatabase(): Promise<void> {
    const secureState = this.getEncryptedState();
    const { postgresStore } = await import('../../db/postgresStore.js');
    await postgresStore.savePaymentGateways(secureState);
  }

  public saveToDisk() {
    this.saveToDatabase().catch(err => {
      console.error('[PaymentGatewayManager] Failed to save payment gateways in background:', err);
    });
  }

  public getMaskedState(): PaymentGatewaysState {
    const maskSecret = (secret: string) => {
      if (!secret || secret.trim() === '') return '';
      return '••••••••••••••••';
    };

    const maskEnv = (envGw: EnvironmentGateways): EnvironmentGateways => ({
      paypal: { ...envGw.paypal, clientSecret: maskSecret(envGw.paypal.clientSecret) },
      stripe: { ...envGw.stripe, clientSecret: maskSecret(envGw.stripe.clientSecret) },
      razorpay: { ...envGw.razorpay, clientSecret: maskSecret(envGw.razorpay.clientSecret) }
    });

    return {
      production: maskEnv(this.state.production),
      sandbox: maskEnv(this.state.sandbox)
    };
  }

  public async updateGateway(env: 'production' | 'sandbox', gatewayName: 'paypal' | 'stripe' | 'razorpay', updates: Partial<GatewayConfig>): Promise<EnvironmentGateways> {
    if (env !== 'production' && env !== 'sandbox') throw new Error('Invalid environment.');
    if (!['paypal', 'stripe', 'razorpay'].includes(gatewayName)) throw new Error('Invalid gateway.');

    const envState = this.state[env];
    const current = envState[gatewayName];

    let secret = current.clientSecret;
    if (updates.clientSecret !== undefined) {
      const trimmedSecret = String(updates.clientSecret ?? '').trim();
      if (trimmedSecret === '') {
        secret = '';
      } else if (!trimmedSecret.includes('••••')) {
        if (trimmedSecret.startsWith('enc:gcm:')) {
          secret = decryptSecret(trimmedSecret);
        } else {
          secret = trimmedSecret;
        }
      }
    }

    const nextPrimary = updates.primary !== undefined ? Boolean(updates.primary) : current.primary;

    if (nextPrimary) {
      envState.paypal.primary = gatewayName === 'paypal';
      envState.stripe.primary = gatewayName === 'stripe';
      envState.razorpay.primary = gatewayName === 'razorpay';
    }

    envState[gatewayName] = {
      enabled: updates.enabled !== undefined ? Boolean(updates.enabled) : current.enabled,
      clientId: updates.clientId !== undefined ? String(updates.clientId).trim() : current.clientId,
      clientSecret: secret,
      webhookId: updates.webhookId !== undefined ? String(updates.webhookId).trim() : current.webhookId,
      primary: nextPrimary
    };

    if (!envState.paypal.primary && !envState.stripe.primary && !envState.razorpay.primary) {
      const fallback = (['paypal', 'stripe', 'razorpay'] as const).find(k => envState[k].enabled) || 'paypal';
      envState[fallback].primary = true;
    }

    await this.saveToDatabase();
    return this.state[env];
  }

  public async verifyWebhookSignature(params: { gateway?: string; headers: Record<string, any>; rawBody: Buffer | string }): Promise<boolean> {
    const gateway = (params.gateway || 'stripe').toLowerCase();
    const env = process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
    const gw = this.getGateway(gateway as any, env);
    const webhookSecret = gw?.webhookId;

    const bodyStr = typeof params.rawBody === 'string' ? params.rawBody : params.rawBody.toString('utf8');

    if (gateway === 'stripe') {
      if (!webhookSecret) return false;
      const sigHeader = params.headers['stripe-signature'];
      if (!sigHeader) return false;

      let timestampStr = '';
      const v1Sigs: string[] = [];
      for (const item of String(sigHeader).split(',')) {
        const eqIdx = item.indexOf('=');
        if (eqIdx === -1) continue;
        const k = item.slice(0, eqIdx).trim();
        const v = item.slice(eqIdx + 1).trim();
        if (k === 't' && v) timestampStr = v;
        else if (k === 'v1' && v) v1Sigs.push(v);
      }

      if (!timestampStr || v1Sigs.length === 0) return false;

      const timestamp = Number(timestampStr);
      const nowSec = Math.floor(Date.now() / 1000);
      if (!Number.isFinite(timestamp) || Math.abs(nowSec - timestamp) > 300) {
        return false;
      }

      const signedPayload = `${timestampStr}.${bodyStr}`;
      const expectedSig = crypto.createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');
      const expBuf = Buffer.from(expectedSig, 'hex');

      for (const candidateSig of v1Sigs) {
        if (!/^[0-9a-fA-F]+$/.test(candidateSig) || candidateSig.length !== expectedSig.length) continue;
        const sigBuf = Buffer.from(candidateSig, 'hex');
        if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
          return true;
        }
      }
      return false;
    } else if (gateway === 'razorpay') {
      if (!webhookSecret) return false;
      const sig = String(params.headers['x-razorpay-signature'] || '').trim();
      if (!sig || !/^[0-9a-fA-F]+$/.test(sig)) return false;

      const rzpTsHeader = params.headers['x-razorpay-timestamp'];
      if (rzpTsHeader !== undefined && rzpTsHeader !== null && String(rzpTsHeader).trim() !== '') {
        const tsNum = Number(rzpTsHeader);
        const nowSec = Math.floor(Date.now() / 1000);
        if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > 300) {
          return false;
        }
      }

      const expectedSig = crypto.createHmac('sha256', webhookSecret).update(bodyStr).digest('hex');
      if (sig.length !== expectedSig.length) return false;
      const sigBuf = Buffer.from(sig, 'hex');
      const expBuf = Buffer.from(expectedSig, 'hex');
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } else if (gateway === 'paypal') {
      // Genuine PayPal REST API Webhook Signature Verification
      if (gw && gw.enabled && gw.clientId && gw.clientSecret && gw.webhookId) {
        try {
          const authAlgo = params.headers['paypal-auth-algo'];
          const certUrl = params.headers['paypal-cert-url'];
          const transmissionId = params.headers['paypal-transmission-id'];
          const transmissionSig = params.headers['paypal-transmission-sig'];
          const transmissionTime = params.headers['paypal-transmission-time'];

          if (!transmissionId || !transmissionSig || !certUrl || !authAlgo || !transmissionTime) {
            return false;
          }

          const parsedTransmissionMs = Date.parse(String(transmissionTime));
          if (!Number.isFinite(parsedTransmissionMs) || Math.abs(Date.now() - parsedTransmissionMs) > 5 * 60 * 1000) {
            return false;
          }

          let webhookEventObj: any;
          try {
            webhookEventObj = JSON.parse(bodyStr);
          } catch {
            return false;
          }

          const paypalHost = env === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
          const tokenRes = await fetch(`${paypalHost}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${Buffer.from(`${gw.clientId}:${gw.clientSecret}`).toString('base64')}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials',
            signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
          });

          if (!tokenRes.ok) return false;
          const tokenData: any = await tokenRes.json();

          const verifyRes = await fetch(`${paypalHost}/v1/notifications/verify-webhook-signature`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              auth_algo: authAlgo,
              cert_url: certUrl,
              transmission_id: transmissionId,
              transmission_sig: transmissionSig,
              transmission_time: transmissionTime,
              webhook_id: gw.webhookId,
              webhook_event: webhookEventObj
            }),
            signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
          });

          if (!verifyRes.ok) return false;
          const verifyData: any = await verifyRes.json();
          return verifyData.verification_status === 'SUCCESS';
        } catch (err) {
          console.error('[PaymentGateway] PayPal webhook signature verification API call failed:', err);
          return false;
        }
      }

      if (process.env.NODE_ENV === 'production') return false;
      const simAllowed = process.env.PAYMENT_SIMULATION_ENABLED === 'true';
      if (!simAllowed || !webhookSecret) return false;

      const sig = String(params.headers['x-webhook-signature'] || params.headers['paypal-transmission-sig'] || '').trim();
      if (!sig) return false;
      const expectedSig = crypto.createHmac('sha256', webhookSecret).update(bodyStr).digest('hex');
      const sigBuf = Buffer.from(sig.toLowerCase());
      const expBuf = Buffer.from(expectedSig.toLowerCase());
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    }
    return false;
  }

  public async verifyPaymentEvent(params: {
    gateway: 'stripe' | 'paypal' | 'razorpay' | string;
    sessionId?: string;
    transactionId?: string;
    expectedAmount: number;
    expectedCurrency: string;
  }): Promise<{ verified: boolean; error?: string }> {
    const isProd = process.env.NODE_ENV === 'production';
    const env = isProd ? 'production' : 'sandbox';
    const gwName = (params.gateway || 'stripe').toLowerCase() as 'stripe' | 'paypal' | 'razorpay';
    const gw = this.getGateway(gwName, env);
    const hasCredentials = gw && gw.enabled && gw.clientSecret;

    if (!hasCredentials) {
      if (isProd) {
        return { verified: false, error: `Payment gateway "${gwName}" credentials missing in production.` };
      }
      const simAllowed = process.env.PAYMENT_SIMULATION_ENABLED === 'true';
      if (simAllowed) {
        return { verified: true };
      }
      return { verified: false, error: `Gateway credentials missing and simulation disabled.` };
    }

    try {
      if (gwName === 'stripe') {
        const idToLookup = params.sessionId || params.transactionId;
        if (!idToLookup) return { verified: false, error: 'Missing session or transaction ID for Stripe verification.' };

        const url = idToLookup.startsWith('cs_')
          ? `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(idToLookup)}`
          : `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(idToLookup)}`;

        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${gw.clientSecret}` },
          signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
        });
        if (!res.ok) {
          return { verified: false, error: `Stripe API verification returned status ${res.status}` };
        }
        const data: any = await res.json();
        const paid = data.payment_status === 'paid' || data.status === 'succeeded';
        if (!paid) return { verified: false, error: `Stripe payment not completed (status: ${data.payment_status || data.status})` };

        const liveAmount = (data.amount_total ?? data.amount) / 100;
        const liveCurrency = (data.currency || '').toUpperCase();

        if (liveCurrency !== params.expectedCurrency.toUpperCase()) {
          return { verified: false, error: `Currency mismatch: expected ${params.expectedCurrency}, got ${liveCurrency}` };
        }
        if (Math.abs(liveAmount - params.expectedAmount) > 0.01) {
          return { verified: false, error: `Amount mismatch: expected ${params.expectedAmount}, got ${liveAmount}` };
        }
        return { verified: true };
      } else if (gwName === 'paypal') {
        const idToLookup = params.sessionId || params.transactionId;
        if (!idToLookup) return { verified: false, error: 'Missing order or transaction ID for PayPal verification.' };

        const paypalHost = env === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
        const tokenRes = await fetch(`${paypalHost}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${gw.clientId}:${gw.clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: 'grant_type=client_credentials',
          signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
        });
        if (!tokenRes.ok) return { verified: false, error: 'PayPal OAuth handshake failed.' };
        const tokenData: any = await tokenRes.json();

        const orderRes = await fetch(`${paypalHost}/v2/checkout/orders/${encodeURIComponent(idToLookup)}`, {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
          signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
        });
        if (!orderRes.ok) return { verified: false, error: `PayPal order lookup failed (${orderRes.status})` };
        let orderData: any = await orderRes.json();

        if (orderData.status === 'APPROVED') {
          const captureRes = await fetch(`${paypalHost}/v2/checkout/orders/${encodeURIComponent(idToLookup)}/capture`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
          });
          if (!captureRes.ok) {
            return { verified: false, error: `PayPal order capture failed (${captureRes.status})` };
          }
          orderData = await captureRes.json();
        }

        if (orderData.status !== 'COMPLETED') {
          return { verified: false, error: `PayPal order status is ${orderData.status}. Payment must be COMPLETED.` };
        }
        const unit = orderData.purchase_units?.[0]?.amount ||
          orderData.purchase_units?.[0]?.payments?.captures?.[0]?.amount;
        if (!unit) return { verified: false, error: 'PayPal purchase unit amount missing.' };

        if ((unit.currency_code || '').toUpperCase() !== params.expectedCurrency.toUpperCase()) {
          return { verified: false, error: `PayPal currency mismatch: ${unit.currency_code}` };
        }
        if (Math.abs(Number(unit.value) - params.expectedAmount) > 0.01) {
          return { verified: false, error: `PayPal amount mismatch: ${unit.value}` };
        }
        return { verified: true };
      } else if (gwName === 'razorpay') {
        const idToLookup = params.transactionId || params.sessionId;
        if (!idToLookup) return { verified: false, error: 'Missing transaction ID for Razorpay verification.' };

        const authHeader = `Basic ${Buffer.from(`${gw.clientId}:${gw.clientSecret}`).toString('base64')}`;
        const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(idToLookup)}`, {
          headers: { 'Authorization': authHeader },
          signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
        });
        if (!res.ok) return { verified: false, error: `Razorpay payment lookup failed (${res.status})` };
        const data: any = await res.json();

        if (data.status !== 'captured') {
          return { verified: false, error: `Razorpay payment status is ${data.status}. Payment must be captured.` };
        }
        const liveAmount = Number(data.amount) / 100;
        const liveCurrency = (data.currency || '').toUpperCase();

        if (liveCurrency !== params.expectedCurrency.toUpperCase()) {
          return { verified: false, error: `Razorpay currency mismatch: ${liveCurrency}` };
        }
        if (Math.abs(liveAmount - params.expectedAmount) > 0.01) {
          return { verified: false, error: `Razorpay amount mismatch: ${liveAmount}` };
        }
        return { verified: true };
      }
      return { verified: false, error: `Unsupported gateway: ${gwName}` };
    } catch (err: any) {
      return { verified: false, error: `Provider payment verification exception: ${err.message}` };
    }
  }

  public async verifyPayoutSettlement(params: { method: string; providerReference: string; amount: number; payoutId: string }): Promise<{ verified: boolean; providerTxId: string; status: string }> {
    const isProd = process.env.NODE_ENV === 'production';
    const env = isProd ? 'production' : 'sandbox';
    const ref = params.providerReference ? params.providerReference.trim() : '';

    let gwName: 'paypal' | 'stripe' | 'razorpay' | null = null;
    const lowerMethod = params.method.toLowerCase();
    if (lowerMethod.includes('paypal')) gwName = 'paypal';
    else if (lowerMethod.includes('stripe')) gwName = 'stripe';
    else if (lowerMethod.includes('razorpay') || lowerMethod.includes('upi')) gwName = 'razorpay';

    const gw = gwName ? this.getGateway(gwName, env) : null;
    const hasCredentials = gw && gw.enabled && gw.clientSecret;

    if (!hasCredentials) {
      if (isProd) {
        throw new Error(`Payout provider configuration missing or disabled for method "${params.method}" in production. Settlement verification fails closed.`);
      }
      const simAllowed = process.env.PAYMENT_SIMULATION_ENABLED === 'true';
      if (!simAllowed) {
        throw new Error(`Payout provider credentials missing for method "${params.method}". Enable provider credentials or configure PAYMENT_SIMULATION_ENABLED=true for explicit development simulation.`);
      }
      if (!ref || ref.startsWith('MOCK') || ref.startsWith('SYNTHETIC') || ref.startsWith('GW-SETTLE-SIM') || ref.startsWith('GW-SETTLE-')) {
        return {
          verified: true,
          providerTxId: ref || `SIM-TX-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
          status: 'settled'
        };
      }
    }

    if (!ref) {
      throw new Error('Provider transaction reference is required for payout settlement verification.');
    }

    try {
      if (gwName === 'stripe' && gw && gw.clientSecret) {
        const response = await fetch(`https://api.stripe.com/v1/transfers/${encodeURIComponent(ref)}`, {
          headers: { 'Authorization': `Bearer ${gw.clientSecret}` },
          signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
        });
        if (!response.ok) {
          throw new Error(`Stripe transfer lookup failed with status ${response.status}`);
        }
        const data: any = await response.json();
        if (data.reversed || (data.amount_reversed || 0) > 0) {
          throw new Error(`Stripe transfer ${ref} has been reversed.`);
        }
        if (data.currency?.toLowerCase() !== 'usd') {
          throw new Error('Payout currency mismatch: expected USD');
        }
        if (Math.abs(Number(data.amount) / 100 - params.amount) > 0.01) {
          throw new Error('Payout amount mismatch with provider record');
        }
        return { verified: true, providerTxId: data.id, status: 'settled' };
      } else if (gwName === 'paypal' && gw && gw.clientId && gw.clientSecret) {
        const paypalHost = env === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
        const tokenRes = await fetch(`${paypalHost}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${gw.clientId}:${gw.clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: 'grant_type=client_credentials',
          signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
        });
        if (!tokenRes.ok) throw new Error('PayPal auth handshake failed during payout verification.');
        const tokenData: any = await tokenRes.json();
        const payoutRes = await fetch(`${paypalHost}/v1/payments/payouts-item/${encodeURIComponent(ref)}`, {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
          signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
        });
        if (!payoutRes.ok) {
          throw new Error(`PayPal payout item lookup failed with status ${payoutRes.status}`);
        }
        const payoutData: any = await payoutRes.json();
        const pStatus = payoutData.payout_item?.transaction_status;
        if (pStatus !== 'SUCCESS') {
          throw new Error(`PayPal payout transaction status is "${pStatus}". Expected terminal status "SUCCESS".`);
        }
        const pVal = Number(payoutData.payout_item?.amount?.value || 0);
        const pCurr = payoutData.payout_item?.amount?.currency;
        if (pCurr !== 'USD') throw new Error('PayPal payout currency mismatch: expected USD.');
        if (Math.abs(pVal - params.amount) > 0.01) throw new Error('PayPal payout amount mismatch.');
        return { verified: true, providerTxId: payoutData.payout_item_id || ref, status: 'settled' };
      } else if (gwName === 'razorpay' && gw && gw.clientId && gw.clientSecret) {
        const authHeader = `Basic ${Buffer.from(`${gw.clientId}:${gw.clientSecret}`).toString('base64')}`;
        const razorRes = await fetch(`https://api.razorpay.com/v1/payouts/${encodeURIComponent(ref)}`, {
          headers: { 'Authorization': authHeader },
          signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
        });
        if (!razorRes.ok) {
          throw new Error(`Razorpay payout lookup failed with status ${razorRes.status}`);
        }
        const razorData: any = await razorRes.json();
        if (razorData.status !== 'processed') {
          throw new Error(`Razorpay payout status is "${razorData.status}". Expected terminal status "processed".`);
        }
        const rVal = Number(razorData.amount || 0) / 100;
        if (razorData.currency !== 'USD') throw new Error('Razorpay payout currency mismatch: expected USD.');
        if (Math.abs(rVal - params.amount) > 0.01) throw new Error('Razorpay payout amount mismatch.');
        return { verified: true, providerTxId: razorData.id || ref, status: 'settled' };
      } else {
        throw new Error(`Payout provider verification is not configured or supported for method "${params.method}".`);
      }
    } catch (err: any) {
      console.error(`[PaymentGateways] Provider settlement verification error for payout ${params.payoutId}:`, err.message);
      if (isProd) {
        throw new Error(`Provider payout settlement verification failed: ${err.message}`);
      }
      throw err;
    }
  }

  public async createCheckoutSession(params: {
    gateway: 'stripe' | 'paypal' | 'razorpay';
    amount: number;
    currency: string;
    userId: string;
    orderId?: string;
    purpose?: string;
    checkoutId: string;
  }): Promise<{ providerSessionId: string; checkoutUrl: string }> {
    const isProd = process.env.NODE_ENV === 'production';
    const env = isProd ? 'production' : 'sandbox';
    
    if (params.currency !== 'USD') {
      throw new Error('Only USD currency is supported for payment checkout sessions.');
    }
    if (params.amount < 1.00) {
      throw new Error('Minimum checkout amount is $1.00 USD.');
    }

    const gw = this.getGateway(params.gateway, env);
    const hasCredentials = gw && gw.enabled && gw.clientId && gw.clientSecret;

    if (!hasCredentials) {
      if (isProd) {
        throw new Error(`Payment gateway "${params.gateway.toUpperCase()}" is not enabled or configured in production environment. Checkout fails closed.`);
      }
      const simAllowed = process.env.PAYMENT_SIMULATION_ENABLED === 'true';
      if (!simAllowed) {
        throw new Error(`Payment gateway "${params.gateway.toUpperCase()}" credentials missing. Set gateway credentials or configure PAYMENT_SIMULATION_ENABLED=true for explicit development simulation.`);
      }
      const simProviderSessionId = `sess_sim_${params.gateway}_${crypto.randomBytes(12).toString('hex')}`;
      const checkoutUrl = `/checkout/pay?session_id=${params.checkoutId}&gateway=${params.gateway}&amount=${params.amount}&simulated=true`;
      return { providerSessionId: simProviderSessionId, checkoutUrl };
    }

    const baseAppUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

    try {
      if (params.gateway === 'stripe') {
        const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${gw.clientSecret}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            'mode': 'payment',
            'success_url': `${baseAppUrl}/checkout/success?session_id=${params.checkoutId}`,
            'cancel_url': `${baseAppUrl}/checkout/cancel?session_id=${params.checkoutId}`,
            'client_reference_id': params.checkoutId,
            'line_items[0][price_data][currency]': 'usd',
            'line_items[0][price_data][unit_amount]': String(Math.round(params.amount * 100)),
            'line_items[0][price_data][product_data][name]': `FivePA ${params.purpose || 'Deposit'}`,
            'line_items[0][quantity]': '1',
            'metadata[userId]': params.userId,
            'metadata[checkoutId]': params.checkoutId
          }).toString(),
          signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Stripe provider error (${response.status}): ${errText}`);
        }
        const data: any = await response.json();
        return {
          providerSessionId: data.id,
          checkoutUrl: data.url || `/checkout/pay?session_id=${params.checkoutId}`
        };
      } else if (params.gateway === 'paypal') {
        const paypalHost = env === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
        const tokenRes = await fetch(`${paypalHost}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${gw.clientId}:${gw.clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: 'grant_type=client_credentials',
          signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
        });
        if (!tokenRes.ok) throw new Error('PayPal auth handshake failed.');
        const tokenData: any = await tokenRes.json();
        const orderRes = await fetch(`${paypalHost}/v2/checkout/orders`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            intent: 'CAPTURE',
            purchase_units: [{
              reference_id: params.checkoutId,
              amount: { currency_code: 'USD', value: params.amount.toFixed(2) }
            }],
            application_context: {
              return_url: `${baseAppUrl}/checkout/success?session_id=${params.checkoutId}`,
              cancel_url: `${baseAppUrl}/checkout/cancel?session_id=${params.checkoutId}`
            }
          }),
          signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
        });
        if (!orderRes.ok) throw new Error('PayPal order creation failed.');
        const orderData: any = await orderRes.json();
        const approveLink = orderData.links?.find((l: any) => l.rel === 'approve')?.href;
        return {
          providerSessionId: orderData.id,
          checkoutUrl: approveLink || `/checkout/pay?session_id=${params.checkoutId}`
        };
      } else if (params.gateway === 'razorpay') {
        const authHeader = `Basic ${Buffer.from(`${gw.clientId}:${gw.clientSecret}`).toString('base64')}`;
        const response = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount: Math.round(params.amount * 100),
            currency: 'USD',
            receipt: params.checkoutId,
            notes: { userId: params.userId, checkoutId: params.checkoutId }
          }),
          signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Razorpay order creation error (${response.status}): ${errText}`);
        }
        const data: any = await response.json();
        return {
          providerSessionId: data.id,
          checkoutUrl: `/checkout/pay?session_id=${params.checkoutId}&razorpay_order_id=${data.id}`
        };
      } else {
        throw new Error(`Unsupported payment provider "${params.gateway}".`);
      }
    } catch (err: any) {
      console.error(`[PaymentGateways] Real provider checkout session creation failed for ${params.gateway}:`, err.message);
      if (isProd) {
        throw new Error(`Payment gateway provider error: ${err.message}`);
      }
      throw err;
    }
  }

  public async testConnection(env: 'production' | 'sandbox', gatewayName: 'paypal' | 'stripe' | 'razorpay'): Promise<{ success: boolean; message: string }> {
    const envState = this.state[env];
    const gw = envState[gatewayName];

    if (!gw.enabled) {
      return { success: false, message: `${gatewayName.toUpperCase()} (${env}) is currently disabled. Enable the gateway before testing connection.` };
    }
    if (!gw.clientId && gatewayName !== 'stripe') {
      return { success: false, message: `Missing Client ID for ${gatewayName.toUpperCase()} (${env}).` };
    }
    if (!gw.clientSecret) {
      return { success: false, message: `Missing Client Secret for ${gatewayName.toUpperCase()} (${env}).` };
    }

    try {
      if (gatewayName === 'stripe') {
        const res = await fetch('https://api.stripe.com/v1/balance', {
          headers: { 'Authorization': `Bearer ${gw.clientSecret}` },
          signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
        });
        if (!res.ok) {
          const errText = await res.text();
          return { success: false, message: `Stripe API handshake failed (${res.status}): ${errText}` };
        }
        return { success: true, message: `Stripe (${env}) connection verified successfully via live balance handshake.` };
      } else if (gatewayName === 'paypal') {
        const paypalHost = env === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
        const tokenRes = await fetch(`${paypalHost}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${gw.clientId}:${gw.clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: 'grant_type=client_credentials',
          signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
        });
        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          return { success: false, message: `PayPal API handshake failed (${tokenRes.status}): ${errText}` };
        }
        return { success: true, message: `PayPal (${env}) connection verified successfully via live OAuth handshake.` };
      } else if (gatewayName === 'razorpay') {
        const authHeader = `Basic ${Buffer.from(`${gw.clientId}:${gw.clientSecret}`).toString('base64')}`;
        const res = await fetch('https://api.razorpay.com/v1/payments?count=1', {
          headers: { 'Authorization': authHeader },
          signal: AbortSignal.timeout(GATEWAY_FETCH_TIMEOUT_MS)
        });
        if (!res.ok) {
          const errText = await res.text();
          return { success: false, message: `Razorpay API handshake failed (${res.status}): ${errText}` };
        }
        return { success: true, message: `Razorpay (${env}) connection verified successfully via live API handshake.` };
      }
      return { success: false, message: `Unsupported gateway: ${gatewayName}` };
    } catch (err: any) {
      return { success: false, message: `Live API handshake error for ${gatewayName.toUpperCase()}: ${err.message}` };
    }
  }
}

export const paymentGatewayManager = new PaymentGatewayManager();
