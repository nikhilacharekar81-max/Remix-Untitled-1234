-- PostgreSQL Schema Migration for WorkPerHour Store & Ledger
-- Run via migration runner or psql

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  username VARCHAR(128),
  email VARCHAR(255) UNIQUE NOT NULL,
  mobile VARCHAR(64),
  role VARCHAR(64) NOT NULL,
  avatar TEXT,
  title VARCHAR(255),
  rating NUMERIC(3,2) DEFAULT 5.0,
  reviews_count INT DEFAULT 0,
  hourly_rate NUMERIC(10,2) DEFAULT 0,
  earned NUMERIC(12,2) DEFAULT 0,
  completed_jobs INT DEFAULT 0,
  bio TEXT,
  skills TEXT[],
  status VARCHAR(32) DEFAULT 'active',
  verified BOOLEAN DEFAULT FALSE,
  email_verified BOOLEAN DEFAULT FALSE,
  mobile_verified BOOLEAN DEFAULT FALSE,
  wallet_balance NUMERIC(12,2) DEFAULT 0,
  created_at VARCHAR(32),
  is_flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  password TEXT,
  session_version INT DEFAULT 1,
  known_devices TEXT[],
  is_available_now BOOLEAN DEFAULT FALSE,
  notification_preferences JSONB
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
UPDATE users SET password_hash = password WHERE password_hash IS NULL AND password IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS gigs (
  id VARCHAR(64) PRIMARY KEY,
  freelancer_id VARCHAR(64) NOT NULL,
  freelancer_name VARCHAR(255) NOT NULL,
  freelancer_username VARCHAR(128),
  freelancer_avatar TEXT,
  freelancer_level VARCHAR(64),
  title TEXT NOT NULL,
  slug VARCHAR(255),
  category VARCHAR(128) NOT NULL,
  subcategory VARCHAR(128),
  description TEXT,
  price NUMERIC(12,2) NOT NULL,
  delivery_days INT NOT NULL,
  rating NUMERIC(3,2) DEFAULT 5.0,
  reviews_count INT DEFAULT 0,
  image TEXT,
  cover_image TEXT,
  gallery TEXT[],
  tags TEXT[],
  status VARCHAR(32) DEFAULT 'active',
  featured BOOLEAN DEFAULT FALSE,
  extras JSONB,
  moderation_status VARCHAR(32) DEFAULT 'approved',
  moderation_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Canonical gig statuses: active, paused, moderation, deleted
UPDATE gigs SET status = 'active' WHERE status = 'published';
UPDATE gigs SET status = 'moderation' WHERE status IN ('pending', 'draft') OR (status NOT IN ('active', 'paused', 'deleted') AND moderation_status IN ('pending', 'rejected', 'flagged'));
UPDATE gigs SET status = 'moderation' WHERE status NOT IN ('active', 'paused', 'moderation', 'deleted');
ALTER TABLE gigs ALTER COLUMN status SET DEFAULT 'active';

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(64) PRIMARY KEY,
  buyer_id VARCHAR(64) NOT NULL,
  buyer_name VARCHAR(255) NOT NULL,
  buyer_avatar TEXT,
  title TEXT NOT NULL,
  slug VARCHAR(255),
  category VARCHAR(128) NOT NULL,
  subcategory VARCHAR(128),
  description TEXT,
  budget_min NUMERIC(12,2) DEFAULT 0,
  budget_max NUMERIC(12,2) DEFAULT 0,
  deadline_days INT,
  proposals_count INT DEFAULT 0,
  created_at VARCHAR(32) NOT NULL,
  status VARCHAR(32) DEFAULT 'open',
  featured BOOLEAN DEFAULT FALSE,
  moderation_status VARCHAR(32) DEFAULT 'approved',
  moderation_notes TEXT,
  budget_type VARCHAR(32),
  budget NUMERIC(12,2),
  duration VARCHAR(64),
  skills TEXT[],
  max_hires INT DEFAULT 1,
  freelancers_needed INT DEFAULT 1
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS max_hires INT DEFAULT 1;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS freelancers_needed INT DEFAULT 1;

CREATE TABLE IF NOT EXISTS proposals (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  freelancer_id VARCHAR(64) NOT NULL,
  freelancer_name VARCHAR(255) NOT NULL,
  freelancer_avatar TEXT,
  freelancer_title VARCHAR(255),
  cover_letter TEXT,
  bid_amount NUMERIC(12,2) NOT NULL,
  delivery_days INT NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  status VARCHAR(32) DEFAULT 'pending',
  workstream_order_id VARCHAR(64),
  offer_id VARCHAR(64)
);

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS workstream_order_id VARCHAR(64);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS offer_id VARCHAR(64);

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY,
  title TEXT NOT NULL,
  buyer_id VARCHAR(64) NOT NULL,
  seller_id VARCHAR(64) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(64) NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  due_date VARCHAR(32) NOT NULL,
  completed_at VARCHAR(32),
  requirements TEXT,
  deliverables TEXT,
  deliverable_files JSONB,
  revisions JSONB,
  admin_notes TEXT,
  is_muted BOOLEAN DEFAULT FALSE,
  escrow_protection_start_date VARCHAR(32),
  escrow_protection_end_date VARCHAR(32),
  gig_id VARCHAR(64),
  project_id VARCHAR(64),
  service_url TEXT,
  gig_slug VARCHAR(128),
  seller_username VARCHAR(128),
  buyer_username VARCHAR(128),
  service_title TEXT,
  service_thumbnail TEXT,
  is_timer_paused BOOLEAN DEFAULT FALSE,
  fee_breakdown JSONB,
  delivery_history JSONB,
  delivery_notes TEXT,
  delivery_reference TEXT,
  accepted_version INT,
  review_window_days INT,
  review_window_expires_at VARCHAR(32),
  review JSONB,
  service_fee NUMERIC(10,2) DEFAULT 0,
  small_order_fee NUMERIC(10,2) DEFAULT 0,
  client_id VARCHAR(64),
  freelancer_id VARCHAR(64),
  selected_extras JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_fee NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS small_order_fee NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_id VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS freelancer_id VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS selected_extras JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64),
  workspace_id VARCHAR(64),
  sender_id VARCHAR(64) NOT NULL,
  sender_name VARCHAR(255) NOT NULL,
  text TEXT NOT NULL,
  timestamp VARCHAR(64) NOT NULL,
  type VARCHAR(32) DEFAULT 'message',
  file_info JSONB,
  metadata JSONB
);

ALTER TABLE messages ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(64);

CREATE TABLE IF NOT EXISTS reviews (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64),
  reviewer_id VARCHAR(64),
  reviewer_name VARCHAR(255),
  reviewer_avatar TEXT,
  target_user_id VARCHAR(64),
  rating INT NOT NULL,
  comment TEXT,
  order_title TEXT,
  gig_id VARCHAR(64),
  project_id VARCHAR(64),
  created_at VARCHAR(32),
  updated_at VARCHAR(32),
  is_cancelled_order BOOLEAN DEFAULT FALSE,
  reply JSONB
);

CREATE TABLE IF NOT EXISTS uploads (
  filename VARCHAR(255) PRIMARY KEY,
  owner_id VARCHAR(64) NOT NULL,
  original_name VARCHAR(255),
  mime VARCHAR(128),
  size BIGINT,
  created_at VARCHAR(32) NOT NULL,
  sha256 VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS workspaces (
  workspace_id VARCHAR(64) PRIMARY KEY,
  buyer_id VARCHAR(64) NOT NULL,
  seller_id VARCHAR(64) NOT NULL,
  order_ids JSONB DEFAULT '[]'::jsonb,
  title TEXT NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  updated_at VARCHAR(32) NOT NULL,
  last_activity_at VARCHAR(32),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS workstream_offers (
  id VARCHAR(64) PRIMARY KEY,
  number VARCHAR(32),
  order_id VARCHAR(64) NOT NULL,
  workspace_id VARCHAR(64),
  kind VARCHAR(32) NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  delivery_days INT,
  status VARCHAR(32) NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  resolved_at VARCHAR(32),
  resolved_by VARCHAR(64),
  metadata JSONB
);

ALTER TABLE workstream_offers ALTER COLUMN order_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS custom_invoices (
  id VARCHAR(64) PRIMARY KEY,
  invoice_number VARCHAR(64) NOT NULL,
  buyer_id VARCHAR(64) NOT NULL,
  seller_id VARCHAR(64) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(32) NOT NULL,
  description TEXT,
  created_at VARCHAR(32) NOT NULL,
  paid_at VARCHAR(32),
  related_order_id VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS disputes (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  buyer_id VARCHAR(64),
  seller_id VARCHAR(64),
  raised_by VARCHAR(64) NOT NULL,
  reason TEXT NOT NULL,
  evidence TEXT,
  status VARCHAR(64) NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  resolution_notes TEXT,
  resolution_type VARCHAR(64),
  notes TEXT,
  assigned_to VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS refunds (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  buyer_id VARCHAR(64) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT,
  status VARCHAR(32) NOT NULL,
  created_at VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS payouts (
  id VARCHAR(64) PRIMARY KEY,
  freelancer_id VARCHAR(64) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  method VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  account_details TEXT,
  processed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  subject TEXT NOT NULL,
  priority VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  messages JSONB DEFAULT '[]'::jsonb,
  is_appeal BOOLEAN DEFAULT FALSE,
  category VARCHAR(64),
  appeal_context JSONB
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  actor VARCHAR(255) NOT NULL,
  role VARCHAR(64) NOT NULL,
  action VARCHAR(255) NOT NULL,
  target VARCHAR(255) NOT NULL,
  details TEXT,
  timestamp VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS user_emails (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  subject TEXT NOT NULL,
  snippet TEXT,
  body TEXT NOT NULL,
  type VARCHAR(64),
  sent_at VARCHAR(64),
  date VARCHAR(64),
  read BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS site_settings (
  key VARCHAR(64) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_gateways (
  key VARCHAR(64) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financial_ledger_state (
  key VARCHAR(64) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_metadata (
  key VARCHAR(64) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_order_id ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_target_user_id ON reviews(target_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_proposals_project_id ON proposals(project_id);
CREATE INDEX IF NOT EXISTS idx_offers_order_id ON workstream_offers(order_id);

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(64) NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at VARCHAR(64) NOT NULL,
  dedup_key VARCHAR(255) UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_review JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS previous_status VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(32);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gig_order_id VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS project_order_id VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS proposal_id VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_order_proposal_id
ON orders (proposal_id)
WHERE proposal_id IS NOT NULL AND status NOT IN ('cancelled', 'refunded');
ALTER TABLE orders ADD COLUMN IF NOT EXISTS extension_requests JSONB DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS free_extension_used BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_request JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_type VARCHAR(32);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_window_restarted_at VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS response_deadline VARCHAR(64);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS workstream_order_id VARCHAR(64);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(32);
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS order_id VARCHAR(64);
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_orders_workspace_id ON orders(workspace_id);

CREATE TABLE IF NOT EXISTS project_clarifications (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  user_avatar TEXT,
  text TEXT NOT NULL,
  timestamp VARCHAR(64) NOT NULL,
  replies JSONB DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_clarifications_project_id ON project_clarifications(project_id);

CREATE TABLE IF NOT EXISTS wallets (
  user_id VARCHAR(64) PRIMARY KEY,
  user_name VARCHAR(255) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  user_role VARCHAR(64) NOT NULL,
  available_balance NUMERIC(14,2) DEFAULT 0.00 NOT NULL,
  funds_on_hold NUMERIC(14,2) DEFAULT 0.00 NOT NULL,
  pending_withdrawals NUMERIC(14,2) DEFAULT 0.00 NOT NULL,
  status VARCHAR(32) DEFAULT 'active' NOT NULL,
  restriction_reason TEXT,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_movements (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  type VARCHAR(32) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger_accounts (
  code VARCHAR(32) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  type VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO ledger_accounts (code, name, type) VALUES
  ('1010', 'Operating Cash & Bank', 'ASSET'),
  ('1020', 'Payment Processor Clearing', 'ASSET'),
  ('2010', 'Buyer Wallets Payable', 'LIABILITY'),
  ('2020', 'Freelancer Wallets Payable', 'LIABILITY'),
  ('2030', 'Escrow Liability', 'LIABILITY'),
  ('2040', 'Pending Payout Liability', 'LIABILITY'),
  ('2050', 'Pending Seller Clearance', 'LIABILITY'),
  ('4010', 'Platform Commission Revenue', 'REVENUE'),
  ('4020', 'Buyer Service Fee Revenue', 'REVENUE'),
  ('4030', 'Small Order Fee Revenue', 'REVENUE'),
  ('4040', 'Other Platform Revenue', 'REVENUE'),
  ('5010', 'Payment Processing Expense', 'EXPENSE'),
  ('5020', 'Dispute Loss Expense', 'EXPENSE')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS ledger_journals (
  id VARCHAR(64) PRIMARY KEY,
  reference VARCHAR(128) NOT NULL,
  description TEXT,
  event_type VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(255) UNIQUE,
  actor VARCHAR(255),
  reversed_at TIMESTAMPTZ,
  reversed_by_journal_id VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ledger_journals ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE ledger_journals ADD COLUMN IF NOT EXISTS reversed_by_journal_id VARCHAR(64);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id VARCHAR(64) PRIMARY KEY,
  journal_id VARCHAR(64) NOT NULL,
  account_code VARCHAR(32) NOT NULL,
  debit NUMERIC(14,2) DEFAULT 0.00 NOT NULL,
  credit NUMERIC(14,2) DEFAULT 0.00 NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
  description TEXT,
  user_id VARCHAR(64),
  order_id VARCHAR(64),
  payout_id VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS escrows (
  order_id VARCHAR(64) PRIMARY KEY,
  order_title TEXT NOT NULL,
  buyer_id VARCHAR(64) NOT NULL,
  seller_id VARCHAR(64) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  remaining NUMERIC(14,2) NOT NULL,
  refunded_total NUMERIC(14,2) DEFAULT 0.00 NOT NULL,
  released_gross NUMERIC(14,2) DEFAULT 0.00 NOT NULL,
  refund_seq INT DEFAULT 0 NOT NULL,
  release_seq INT DEFAULT 0 NOT NULL,
  status VARCHAR(32) DEFAULT 'held' NOT NULL,
  funded_at TIMESTAMPTZ DEFAULT NOW(),
  commission_percent NUMERIC(5,2) DEFAULT 20.00 NOT NULL,
  service_fee NUMERIC(14,2) DEFAULT 0.00 NOT NULL,
  small_order_fee NUMERIC(14,2) DEFAULT 0.00 NOT NULL,
  fees_refunded BOOLEAN DEFAULT FALSE NOT NULL
);

CREATE TABLE IF NOT EXISTS earnings_clearing (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  seller_id VARCHAR(64) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  clearance_start TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  clearance_end TIMESTAMPTZ NOT NULL,
  status VARCHAR(32) DEFAULT 'clearing' NOT NULL,
  payout_eligible BOOLEAN DEFAULT FALSE NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_idempotency (
  key TEXT PRIMARY KEY,
  operation TEXT,
  status TEXT,
  result JSONB,
  request_fingerprint JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE financial_idempotency ADD COLUMN IF NOT EXISTS request_fingerprint JSONB;
ALTER TABLE financial_idempotency ALTER COLUMN request_fingerprint TYPE JSONB USING request_fingerprint::jsonb;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS account_details TEXT;
DROP INDEX IF EXISTS idx_unique_earnings_clearing_order;
CREATE INDEX IF NOT EXISTS idx_earnings_clearing_order ON earnings_clearing (order_id);

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS pending_balance NUMERIC(14,2) DEFAULT 0.00 NOT NULL;





CREATE TABLE IF NOT EXISTS runtime_diagnostic_logs (
  id VARCHAR(64) PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  severity VARCHAR(16) NOT NULL,
  service VARCHAR(64) NOT NULL,
  function_name VARCHAR(128) NOT NULL,
  implementation VARCHAR(64),
  operation VARCHAR(64) NOT NULL,
  request_id VARCHAR(64),
  outcome VARCHAR(32),
  error_message TEXT,
  details JSONB
);

CREATE INDEX IF NOT EXISTS idx_diagnostics_timestamp ON runtime_diagnostic_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_diagnostics_severity ON runtime_diagnostic_logs(severity);
CREATE INDEX IF NOT EXISTS idx_diagnostics_operation ON runtime_diagnostic_logs(operation);
CREATE INDEX IF NOT EXISTS idx_diagnostics_request_id ON runtime_diagnostic_logs(request_id);

CREATE TABLE IF NOT EXISTS payment_methods (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  is_default BOOLEAN DEFAULT FALSE,
  created_at VARCHAR(32) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);

CREATE TABLE IF NOT EXISTS clearing_earnings (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  seller_id VARCHAR(64) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  clears_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(32) DEFAULT 'clearing' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clearing_earnings_seller ON clearing_earnings(seller_id, clears_at);
CREATE INDEX IF NOT EXISTS idx_clearing_earnings_order ON clearing_earnings(order_id);

CREATE TABLE IF NOT EXISTS auth_verification_codes (
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'verify',
  attempts INT NOT NULL DEFAULT 0,
  last_resend_at BIGINT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (email, type)
);

DO $$ BEGIN
  ALTER TABLE auth_verification_codes DROP CONSTRAINT IF EXISTS auth_verification_codes_pkey;
  ALTER TABLE auth_verification_codes ADD PRIMARY KEY (email, type);
  ALTER TABLE auth_verification_codes ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
  ALTER TABLE auth_verification_codes ADD COLUMN IF NOT EXISTS last_resend_at BIGINT NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS payment_checkout_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64),
  gateway VARCHAR(32) NOT NULL,
  expected_amount NUMERIC(14,2) NOT NULL CHECK (expected_amount > 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  purpose VARCHAR(32) NOT NULL DEFAULT 'deposit',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  provider_tx_id VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_checkout_sessions_user ON payment_checkout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_checkout_sessions_status ON payment_checkout_sessions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_checkout_sessions_provider_tx_id ON payment_checkout_sessions (provider_tx_id) WHERE provider_tx_id IS NOT NULL AND status = 'completed';
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_order_reviewer ON reviews (order_id, reviewer_id) WHERE order_id IS NOT NULL AND reviewer_id IS NOT NULL;

-- Consolidated Schema Enhancements (Columns, Tables, Indexes)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_id VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS freelancer_id VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS selected_extras JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS featured_until VARCHAR(64);
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS reconciliation_exceptions (
  id VARCHAR(64) PRIMARY KEY,
  type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  amount NUMERIC(14,2) DEFAULT 0.00 NOT NULL,
  currency VARCHAR(8) DEFAULT 'USD' NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(32) DEFAULT 'open' NOT NULL,
  assigned_to VARCHAR(128),
  investigation_notes TEXT,
  resolved_by VARCHAR(255),
  resolved_at VARCHAR(64),
  detected_at VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id VARCHAR(64) PRIMARY KEY,
  event_type VARCHAR(128) NOT NULL,
  aggregate_type VARCHAR(64) NOT NULL,
  aggregate_id VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) DEFAULT 'pending' NOT NULL,
  retry_count INT DEFAULT 0 NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_exceptions_status ON reconciliation_exceptions(status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_exceptions_entity ON reconciliation_exceptions(entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_messages_client_msg_id ON messages (order_id, sender_id, (metadata->>'clientMessageId')) WHERE metadata->>'clientMessageId' IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_workstream_offers_number ON workstream_offers (number) WHERE number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_events_status ON outbox_events(status, created_at);
CREATE INDEX IF NOT EXISTS idx_gigs_freelancer_id ON gigs(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_gigs_status_moderation ON gigs(status, moderation_status);

-- Safe Slug Unique Resolution & Constraint
UPDATE gigs SET slug = slug || '-' || id
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at ASC) as rn
    FROM gigs WHERE slug IS NOT NULL AND slug != ''
  ) s WHERE rn > 1
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gigs_unique_slug ON gigs(slug) WHERE slug IS NOT NULL AND slug != '';

-- Authoritative Financial Database CHECK Constraints
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_wallets_available_balance') THEN
    ALTER TABLE wallets ADD CONSTRAINT check_wallets_available_balance CHECK (available_balance >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_wallets_funds_on_hold') THEN
    ALTER TABLE wallets ADD CONSTRAINT check_wallets_funds_on_hold CHECK (funds_on_hold >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_wallets_pending_withdrawals') THEN
    ALTER TABLE wallets ADD CONSTRAINT check_wallets_pending_withdrawals CHECK (pending_withdrawals >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_escrows_amount') THEN
    ALTER TABLE escrows ADD CONSTRAINT check_escrows_amount CHECK (amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_escrows_remaining') THEN
    ALTER TABLE escrows ADD CONSTRAINT check_escrows_remaining CHECK (remaining >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_payouts_amount') THEN
    ALTER TABLE payouts ADD CONSTRAINT check_payouts_amount CHECK (amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_refunds_amount') THEN
    ALTER TABLE refunds ADD CONSTRAINT check_refunds_amount CHECK (amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_earnings_clearing_amount') THEN
    ALTER TABLE earnings_clearing ADD CONSTRAINT check_earnings_clearing_amount CHECK (amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_ledger_entries_debit') THEN
    ALTER TABLE ledger_entries ADD CONSTRAINT check_ledger_entries_debit CHECK (debit >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_ledger_entries_credit') THEN
    ALTER TABLE ledger_entries ADD CONSTRAINT check_ledger_entries_credit CHECK (credit >= 0);
  END IF;
END $$;

-- Referential Integrity Foreign Key Constraints with Pre-Existing Orphan Logging

-- 1. Backfill orders.client_id and orders.freelancer_id
UPDATE orders SET client_id = buyer_id WHERE client_id IS NULL;
UPDATE orders SET freelancer_id = seller_id WHERE freelancer_id IS NULL;

-- 2. Log orphaned records to reconciliation_exceptions instead of fabricating parents or deleting children
-- Using stable, deterministic IDs (MD5 hash) to prevent VARCHAR(64) overflow while preserving collision safety
INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_OB_' || MD5(id), 'ORPHAN_RECORD', id, 
  'Order refers to non-existent buyer_id: ' || buyer_id, NOW()::text
FROM orders WHERE buyer_id IS NOT NULL AND buyer_id NOT IN (SELECT id FROM users)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_OS_' || MD5(id), 'ORPHAN_RECORD', id, 
  'Order refers to non-existent seller_id: ' || seller_id, NOW()::text
FROM orders WHERE seller_id IS NOT NULL AND seller_id NOT IN (SELECT id FROM users)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_PF_' || MD5(id), 'ORPHAN_RECORD', id, 
  'Proposal refers to non-existent freelancer_id: ' || freelancer_id, NOW()::text
FROM proposals WHERE freelancer_id NOT IN (SELECT id FROM users)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_EO_' || MD5(order_id), 'ORPHAN_RECORD', order_id, 
  'Escrow record refers to non-existent order_id: ' || order_id, NOW()::text
FROM escrows WHERE order_id NOT IN (SELECT id FROM orders)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_DO_' || MD5(id), 'ORPHAN_RECORD', id, 
  'Dispute refers to non-existent order_id: ' || order_id, NOW()::text
FROM disputes WHERE order_id NOT IN (SELECT id FROM orders)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_LJ_' || MD5(id), 'ORPHAN_RECORD', id, 
  'Ledger entry refers to non-existent journal_id: ' || journal_id, NOW()::text
FROM ledger_entries WHERE journal_id NOT IN (SELECT id FROM ledger_journals)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_OG_' || MD5(id), 'ORPHAN_RECORD', id, 
  'Order refers to non-existent gig_id: ' || gig_id, NOW()::text
FROM orders WHERE gig_id IS NOT NULL AND gig_id NOT IN (SELECT id FROM gigs)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_PO_' || MD5(id), 'ORPHAN_RECORD', id, 
  'Payout refers to non-existent freelancer_id: ' || freelancer_id, NOW()::text
FROM payouts WHERE freelancer_id NOT IN (SELECT id FROM users)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_RO_' || MD5(id), 'ORPHAN_RECORD', id, 
  'Refund refers to non-existent order_id: ' || order_id, NOW()::text
FROM refunds WHERE order_id NOT IN (SELECT id FROM orders)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_CO_' || MD5(id), 'ORPHAN_RECORD', id, 
  'Earnings clearing refers to non-existent order_id: ' || order_id, NOW()::text
FROM earnings_clearing WHERE order_id NOT IN (SELECT id FROM orders)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_WU_' || MD5(user_id), 'ORPHAN_RECORD', user_id, 
  'Wallet refers to non-existent user_id: ' || user_id, NOW()::text
FROM wallets WHERE user_id NOT IN (SELECT id FROM users)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_OW_' || MD5(id), 'ORPHAN_RECORD', id, 
  'Order refers to non-existent workspace_id: ' || workspace_id, NOW()::text
FROM orders WHERE workspace_id IS NOT NULL AND workspace_id NOT IN (SELECT workspace_id FROM workspaces)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_OP_' || MD5(id), 'ORPHAN_RECORD', id, 
  'Order refers to non-existent project_id: ' || project_id, NOW()::text
FROM orders WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM projects)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_MU_' || MD5(id), 'ORPHAN_RECORD', id, 
  'Message refers to non-existent sender_id: ' || sender_id, NOW()::text
FROM messages WHERE sender_id NOT IN (SELECT id FROM users)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_GF_' || MD5(id), 'ORPHAN_RECORD', id, 
  'Gig refers to non-existent freelancer_id: ' || freelancer_id, NOW()::text
FROM gigs WHERE freelancer_id NOT IN (SELECT id FROM users)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_PP_' || MD5(id), 'ORPHAN_RECORD', id, 
  'Proposal refers to non-existent project_id: ' || project_id, NOW()::text
FROM proposals WHERE project_id NOT IN (SELECT id FROM projects)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reconciliation_exceptions (id, type, entity_id, description, detected_at)
SELECT 
  'RE_MO_' || MD5(id), 'ORPHAN_RECORD', id, 
  'Message refers to non-existent order_id: ' || order_id, NOW()::text
FROM messages WHERE order_id NOT IN (SELECT id FROM orders)
ON CONFLICT (id) DO NOTHING;

-- 6. Apply Foreign Key Constraints
DO $$ 
DECLARE
  _r RECORD;
  _m RECORD;
BEGIN
  -- Macro-like logic for managed foreign keys. Ensures exactly one named constraint with correct definition exists.
  -- Drops duplicate FKs on the same column only if they are exactly equivalent relationships.
  -- Corrects same-named constraints if any part of the definition (columns, reference table, delete action) is wrong.
  
  FOR _m IN (
    SELECT * FROM (VALUES 
      ('orders', 'fk_orders_buyer', 'buyer_id', 'users', 'id', 'r', 'RESTRICT'),
      ('orders', 'fk_orders_seller', 'seller_id', 'users', 'id', 'r', 'RESTRICT'),
      ('orders', 'fk_orders_client', 'client_id', 'users', 'id', 'r', 'RESTRICT'),
      ('orders', 'fk_orders_freelancer', 'freelancer_id', 'users', 'id', 'r', 'RESTRICT'),
      ('orders', 'fk_orders_workspace', 'workspace_id', 'workspaces', 'workspace_id', 'r', 'RESTRICT'),
      ('orders', 'fk_orders_project', 'project_id', 'projects', 'id', 'r', 'RESTRICT'),
      ('messages', 'fk_messages_sender', 'sender_id', 'users', 'id', 'r', 'RESTRICT'),
      ('proposals', 'fk_proposals_freelancer', 'freelancer_id', 'users', 'id', 'r', 'RESTRICT'),
      ('gigs', 'fk_gigs_freelancer', 'freelancer_id', 'users', 'id', 'r', 'RESTRICT'),
      ('proposals', 'fk_proposals_project', 'project_id', 'projects', 'id', 'r', 'RESTRICT'),
      ('escrows', 'fk_escrows_order', 'order_id', 'orders', 'id', 'r', 'RESTRICT'),
      ('disputes', 'fk_disputes_order', 'order_id', 'orders', 'id', 'r', 'RESTRICT'),
      ('workstream_offers', 'fk_offers_order', 'order_id', 'orders', 'id', 'r', 'RESTRICT'),
      ('messages', 'fk_messages_order', 'order_id', 'orders', 'id', 'r', 'RESTRICT'),
      ('ledger_entries', 'fk_ledger_entries_journal', 'journal_id', 'ledger_journals', 'id', 'r', 'RESTRICT'),
      ('reviews', 'fk_reviews_reviewer', 'reviewer_id', 'users', 'id', 'n', 'SET NULL'),
      ('uploads', 'fk_uploads_order', 'order_id', 'orders', 'id', 'n', 'SET NULL'),
      ('orders', 'fk_orders_gig', 'gig_id', 'gigs', 'id', 'n', 'SET NULL'),
      ('projects', 'fk_projects_buyer', 'buyer_id', 'users', 'id', 'r', 'RESTRICT'),
      ('workspaces', 'fk_workspaces_buyer', 'buyer_id', 'users', 'id', 'r', 'RESTRICT'),
      ('workspaces', 'fk_workspaces_seller', 'seller_id', 'users', 'id', 'r', 'RESTRICT'),
      ('custom_invoices', 'fk_custom_invoices_buyer', 'buyer_id', 'users', 'id', 'r', 'RESTRICT'),
      ('custom_invoices', 'fk_custom_invoices_seller', 'seller_id', 'users', 'id', 'r', 'RESTRICT'),
      ('custom_invoices', 'fk_custom_invoices_order', 'related_order_id', 'orders', 'id', 'r', 'RESTRICT'),
      ('disputes', 'fk_disputes_buyer', 'buyer_id', 'users', 'id', 'r', 'RESTRICT'),
      ('disputes', 'fk_disputes_seller', 'seller_id', 'users', 'id', 'r', 'RESTRICT'),
      ('refunds', 'fk_refunds_order', 'order_id', 'orders', 'id', 'r', 'RESTRICT'),
      ('refunds', 'fk_refunds_buyer', 'buyer_id', 'users', 'id', 'r', 'RESTRICT'),
      ('payouts', 'fk_payouts_freelancer', 'freelancer_id', 'users', 'id', 'r', 'RESTRICT'),
      ('support_tickets', 'fk_support_tickets_user', 'user_id', 'users', 'id', 'r', 'RESTRICT'),
      ('notifications', 'fk_notifications_user', 'user_id', 'users', 'id', 'r', 'RESTRICT'),
      ('project_clarifications', 'fk_clarifications_project', 'project_id', 'projects', 'id', 'r', 'RESTRICT'),
      ('project_clarifications', 'fk_clarifications_user', 'user_id', 'users', 'id', 'r', 'RESTRICT'),
      ('wallet_movements', 'fk_wallet_movements_user', 'user_id', 'users', 'id', 'r', 'RESTRICT'),
      ('earnings_clearing', 'fk_earnings_clearing_order', 'order_id', 'orders', 'id', 'r', 'RESTRICT'),
      ('earnings_clearing', 'fk_earnings_clearing_seller', 'seller_id', 'users', 'id', 'r', 'RESTRICT'),
      ('clearing_earnings', 'fk_clearing_earnings_order', 'order_id', 'orders', 'id', 'r', 'RESTRICT'),
      ('clearing_earnings', 'fk_clearing_earnings_seller', 'seller_id', 'users', 'id', 'r', 'RESTRICT'),
      ('payment_checkout_sessions', 'fk_checkout_sessions_user', 'user_id', 'users', 'id', 'r', 'RESTRICT'),
      ('payment_checkout_sessions', 'fk_checkout_sessions_order', 'order_id', 'orders', 'id', 'r', 'RESTRICT'),
      ('wallets', 'fk_wallets_user', 'user_id', 'users', 'id', 'r', 'RESTRICT')
    ) AS t(tbl, con, col, ref, ref_col, del_code, del_str)
  ) LOOP
    -- 1. Drop redundant/equivalent constraints with DIFFERENT names
    -- Only drops if the relationship (child col, ref table, ref col) is exactly the same
    FOR _r IN (
      SELECT c.conname 
      FROM pg_catalog.pg_constraint c 
      JOIN pg_catalog.pg_class cl ON c.conrelid = cl.oid 
      JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_catalog.pg_class rcl ON c.confrelid = rcl.oid
      JOIN pg_catalog.pg_namespace rn ON rn.oid = rcl.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      JOIN pg_catalog.pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = ANY(c.confkey)
      WHERE n.nspname = current_schema() AND rn.nspname = current_schema()
        AND cl.relname = _m.tbl AND a.attname = _m.col AND c.contype = 'f' AND c.conname != _m.con
        AND rcl.relname = _m.ref AND ra.attname = _m.ref_col AND array_length(c.conkey, 1) = 1
    ) LOOP EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', _m.tbl, _r.conname); END LOOP;

    -- 2. Drop the intended named constraint if it is defined INCORRECTLY
    -- Checks constraint type, delete action, columns, and referenced table
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c 
      JOIN pg_catalog.pg_class cl ON c.conrelid = cl.oid 
      JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
      WHERE n.nspname = current_schema() AND cl.relname = _m.tbl AND c.conname = _m.con
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c 
      JOIN pg_catalog.pg_class cl ON c.conrelid = cl.oid 
      JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_catalog.pg_class rcl ON c.confrelid = rcl.oid
      JOIN pg_catalog.pg_namespace rn ON rn.oid = rcl.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      JOIN pg_catalog.pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = ANY(c.confkey)
      WHERE n.nspname = current_schema() AND rn.nspname = current_schema()
        AND cl.relname = _m.tbl AND c.conname = _m.con AND c.contype = 'f' AND c.confdeltype = _m.del_code
        AND a.attname = _m.col AND rcl.relname = _m.ref AND ra.attname = _m.ref_col AND array_length(c.conkey, 1) = 1
    ) THEN EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', _m.tbl, _m.con); END IF;

    -- 3. Add the intended constraint if it's missing
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c 
      JOIN pg_catalog.pg_class cl ON c.conrelid = cl.oid 
      JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
      WHERE n.nspname = current_schema() AND cl.relname = _m.tbl AND c.conname = _m.con
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(%I) ON DELETE %s NOT VALID', _m.tbl, _m.con, _m.col, _m.ref, _m.ref_col, _m.del_str);
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_workspaces_buyer ON workspaces (buyer_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_seller ON workspaces (seller_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_parties ON workspaces (buyer_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_updated ON workspaces (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_workspace_id ON orders (workspace_id);
CREATE INDEX IF NOT EXISTS idx_orders_workspace_updated ON orders (workspace_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_seller ON orders (buyer_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_workstream_offers_workspace ON workstream_offers (workspace_id);
CREATE INDEX IF NOT EXISTS idx_uploads_workspace_id ON uploads (workspace_id);
CREATE INDEX IF NOT EXISTS idx_uploads_order_id ON uploads (order_id);
DO $$
DECLARE
  _dup RECORD;
  _conflict_count INT;
  _unresolvable_diag TEXT := '';
BEGIN
  -- Inspect for conflicting existing records before enforcing uniqueness
  SELECT COUNT(*) INTO _conflict_count
  FROM (
    SELECT buyer_id, seller_id, (metadata->>'originType') AS o_type, (metadata->>'originId') AS o_id
    FROM workspaces
    WHERE (metadata->>'isInquiry') = 'true'
    GROUP BY buyer_id, seller_id, (metadata->>'originType'), (metadata->>'originId')
    HAVING COUNT(*) > 1
  ) dups;

  IF _conflict_count > 0 THEN
    FOR _dup IN (
      SELECT buyer_id, seller_id, (metadata->>'originType') AS o_type, (metadata->>'originId') AS o_id,
             array_agg(workspace_id ORDER BY updated_at DESC, created_at DESC) AS ws_ids,
             COUNT(*) AS cnt
      FROM workspaces
      WHERE (metadata->>'isInquiry') = 'true'
      GROUP BY buyer_id, seller_id, (metadata->>'originType'), (metadata->>'originId')
      HAVING COUNT(*) > 1
    ) LOOP
      DECLARE
        _primary_ws_id TEXT := _dup.ws_ids[1];
        _other_ws_id TEXT;
        _associated_order_ids TEXT[];
        _recorded_order_count INT := 0;
        _is_order_ids_malformed BOOLEAN := FALSE;
        _msg_count INT := 0;
        _ord_count INT := 0;
        _offer_count INT := 0;
        _upload_count INT := 0;
        _escrow_count INT := 0;
        _invoice_count INT := 0;
        _dispute_count INT := 0;
        _refund_count INT := 0;
        _review_count INT := 0;
        _ledger_entry_count INT := 0;
        _earnings_clearing_count INT := 0;
        _clearing_earnings_count INT := 0;
        _checkout_session_count INT := 0;
        _has_unresolvable BOOLEAN := FALSE;
        _conflict_reasons TEXT := '';
      BEGIN
        FOR i IN 2..array_length(_dup.ws_ids, 1) LOOP
          _other_ws_id := _dup.ws_ids[i];
          _conflict_reasons := '';

          -- Check if order_ids is non-null and not a JSON array
          SELECT 
            CASE 
              WHEN order_ids IS NULL THEN FALSE
              WHEN jsonb_typeof(order_ids) = 'array' THEN FALSE
              ELSE TRUE
            END INTO _is_order_ids_malformed
          FROM workspaces
          WHERE workspace_id = _other_ws_id;

          -- 1. Identify all direct and indirect Order associations for this workspace
          -- Accounts for:
          -- a) orders.workspace_id = _other_ws_id
          -- b) Order IDs recorded in workspaces.order_ids (only when order_ids is a valid JSON array)
          -- c) Order ID stored in workspaces.metadata->>'activeOrderId'
          SELECT ARRAY(
            SELECT DISTINCT ord_id
            FROM (
              SELECT id AS ord_id FROM orders WHERE workspace_id = _other_ws_id
              UNION
              SELECT elem AS ord_id
              FROM workspaces w,
                   jsonb_array_elements_text(w.order_ids) AS elem
              WHERE w.workspace_id = _other_ws_id 
                AND w.order_ids IS NOT NULL 
                AND jsonb_typeof(w.order_ids) = 'array'
                AND elem IS NOT NULL AND elem <> ''
              UNION
              SELECT (metadata->>'activeOrderId') AS ord_id
              FROM workspaces
              WHERE workspace_id = _other_ws_id 
                AND (metadata->>'activeOrderId') IS NOT NULL 
                AND (metadata->>'activeOrderId') <> ''
            ) sub
          ) INTO _associated_order_ids;

          -- Check recorded order IDs count in workspaces.order_ids JSON array
          SELECT COALESCE(
            CASE 
              WHEN order_ids IS NOT NULL AND jsonb_typeof(order_ids) = 'array' THEN jsonb_array_length(order_ids)
              ELSE 0
            END, 0
          ) INTO _recorded_order_count
          FROM workspaces
          WHERE workspace_id = _other_ws_id;

          -- 2. Count associated orders
          SELECT COUNT(*) INTO _ord_count
          FROM orders
          WHERE workspace_id = _other_ws_id
             OR (array_length(_associated_order_ids, 1) > 0 AND id = ANY(_associated_order_ids));

          -- 3. Count messages associated directly or indirectly through associated orders
          SELECT COUNT(*) INTO _msg_count
          FROM messages
          WHERE workspace_id = _other_ws_id
             OR metadata->>'workspaceId' = _other_ws_id
             OR order_id = _other_ws_id
             OR (array_length(_associated_order_ids, 1) > 0 AND (
                  order_id = ANY(_associated_order_ids)
                  OR metadata->>'orderId' = ANY(_associated_order_ids)
                  OR metadata->>'order_id' = ANY(_associated_order_ids)
                ));

          -- 4. Count workstream offers associated directly or indirectly through associated orders
          SELECT COUNT(*) INTO _offer_count
          FROM workstream_offers
          WHERE workspace_id = _other_ws_id
             OR metadata->>'workspaceId' = _other_ws_id
             OR order_id = _other_ws_id
             OR (array_length(_associated_order_ids, 1) > 0 AND (
                  order_id = ANY(_associated_order_ids)
                  OR metadata->>'originOrderId' = ANY(_associated_order_ids)
                  OR metadata->>'resultingOrderId' = ANY(_associated_order_ids)
                  OR metadata->>'orderId' = ANY(_associated_order_ids)
                ));

          -- 5. Count uploads associated directly or indirectly through associated orders
          SELECT COUNT(*) INTO _upload_count
          FROM uploads
          WHERE workspace_id = _other_ws_id
             OR order_id = _other_ws_id
             OR (array_length(_associated_order_ids, 1) > 0 AND order_id = ANY(_associated_order_ids));

          -- 6. Count escrows, custom invoices, disputes, refunds, reviews, ledger_entries, earnings_clearing, clearing_earnings, and payment_checkout_sessions
          IF array_length(_associated_order_ids, 1) > 0 THEN
            SELECT COUNT(*) INTO _escrow_count FROM escrows WHERE order_id = ANY(_associated_order_ids);
            SELECT COUNT(*) INTO _invoice_count FROM custom_invoices WHERE related_order_id = ANY(_associated_order_ids);
            SELECT COUNT(*) INTO _dispute_count FROM disputes WHERE order_id = ANY(_associated_order_ids);
            SELECT COUNT(*) INTO _refund_count FROM refunds WHERE order_id = ANY(_associated_order_ids);
            SELECT COUNT(*) INTO _review_count FROM reviews WHERE order_id = ANY(_associated_order_ids);
            SELECT COUNT(*) INTO _ledger_entry_count FROM ledger_entries WHERE order_id = ANY(_associated_order_ids);
            SELECT COUNT(*) INTO _earnings_clearing_count FROM earnings_clearing WHERE order_id = ANY(_associated_order_ids);
            SELECT COUNT(*) INTO _clearing_earnings_count FROM clearing_earnings WHERE order_id = ANY(_associated_order_ids);
            SELECT COUNT(*) INTO _checkout_session_count FROM payment_checkout_sessions WHERE order_id = ANY(_associated_order_ids);
          ELSE
            _escrow_count := 0;
            _invoice_count := 0;
            _dispute_count := 0;
            _refund_count := 0;
            _review_count := 0;
            _ledger_entry_count := 0;
            _earnings_clearing_count := 0;
            _clearing_earnings_count := 0;
            _checkout_session_count := 0;
          END IF;

          -- Non-destructive reconciliation ONLY when the duplicate workspace is proven to have NO direct or indirect historical associations AND order_ids is not malformed
          IF NOT _is_order_ids_malformed 
             AND _recorded_order_count = 0 
             AND _ord_count = 0 
             AND _msg_count = 0 
             AND _offer_count = 0 
             AND _upload_count = 0 
             AND _escrow_count = 0 
             AND _invoice_count = 0 
             AND _dispute_count = 0 
             AND _refund_count = 0 
             AND _review_count = 0 
             AND _ledger_entry_count = 0
             AND _earnings_clearing_count = 0
             AND _clearing_earnings_count = 0
             AND _checkout_session_count = 0
             AND COALESCE(array_length(_associated_order_ids, 1), 0) = 0 THEN
            UPDATE workspaces
            SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{isInquiry}', '"false"'::jsonb, true)
            WHERE workspace_id = _other_ws_id;
          ELSE
            _has_unresolvable := TRUE;
            _conflict_reasons := format(
              'orders=%s, recorded_order_ids=%s, malformed_order_ids=%s, msgs=%s, offers=%s, uploads=%s, escrows=%s, invoices=%s, disputes=%s, ledger_entries=%s, earnings_clearing=%s, clearing_earnings=%s, checkout_sessions=%s',
              _ord_count, _recorded_order_count, _is_order_ids_malformed, _msg_count, _offer_count, _upload_count, _escrow_count, _invoice_count, _dispute_count,
              _ledger_entry_count, _earnings_clearing_count, _clearing_earnings_count, _checkout_session_count
            );
            _unresolvable_diag := _unresolvable_diag || format(
              ' [Workspace %s: %s (buyer: %s, seller: %s, originType: %s, originId: %s)]',
              _other_ws_id, _conflict_reasons, _dup.buyer_id, _dup.seller_id, _dup.o_type, _dup.o_id
            );
          END IF;
        END LOOP;

        IF _has_unresolvable THEN
          _unresolvable_diag := _unresolvable_diag || format(
            ' [Duplicate group for Buyer: %s, Seller: %s, OriginType: %s, OriginId: %s, Workspaces: %s]',
            _dup.buyer_id, _dup.seller_id, _dup.o_type, _dup.o_id, array_to_string(_dup.ws_ids, ', ')
          );
        END IF;
      END;
    END LOOP;

    IF _unresolvable_diag <> '' THEN
      RAISE EXCEPTION 'Cannot safely enforce idx_workspaces_inquiry_unique: Duplicate active inquiry workspaces with existing direct or indirect historical associations exist:%', _unresolvable_diag;
    END IF;
  END IF;

  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_inquiry_unique ON workspaces (buyer_id, seller_id, ((metadata->>''originType'')), ((metadata->>''originId''))) WHERE (metadata->>''isInquiry'') = ''true''';
END $$;

-- Ensure no clamping trigger exists so check constraints enforce strict invariants
DROP TRIGGER IF EXISTS trg_clamp_wallet_fields_before ON wallets;
DROP FUNCTION IF EXISTS trg_clamp_wallet_fields();

-- Self-heal any existing wallets where funds_on_hold is out of sync with active escrows
UPDATE wallets w
SET funds_on_hold = COALESCE(e.escrow_hold, 0.00)
FROM (
  SELECT w2.user_id, COALESCE(SUM(esc.remaining), 0.00) AS escrow_hold
  FROM wallets w2
  LEFT JOIN escrows esc ON esc.buyer_id = w2.user_id AND esc.status IN ('held', 'split')
  GROUP BY w2.user_id
) e
WHERE w.user_id = e.user_id
  AND w.funds_on_hold IS DISTINCT FROM COALESCE(e.escrow_hold, 0.00);


