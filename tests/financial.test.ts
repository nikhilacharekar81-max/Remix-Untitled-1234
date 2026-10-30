import test from 'node:test';
import assert from 'node:assert';
import { calculateOrderFees, DEFAULT_FEE_CONFIG } from '../server/domains/finance/fees.ts';
import { assertValidMoneyAmount } from '../server/domains/finance/financial.service.ts';

test('Authoritative fee calculations match policy', () => {
  const fees = calculateOrderFees(100, DEFAULT_FEE_CONFIG);
  assert.strictEqual(fees.gigPrice, 100);
  assert.strictEqual(fees.platformCommission, 20);
  assert.strictEqual(fees.freelancerNet, 80);
  assert.strictEqual(fees.serviceFee, 1);
  assert.strictEqual(fees.smallOrderFee, 1);
  assert.strictEqual(fees.clientTotal, 102);
});

test('Money amount validation rejects negative and excess precision', () => {
  assert.strictEqual(assertValidMoneyAmount(50.50), 50.50);
  assert.throws(() => assertValidMoneyAmount(-10), /cannot be negative|must be greater than zero/);
  assert.throws(() => assertValidMoneyAmount(10.999), /excess decimal precision/);
});

test('Exact cents comparison matches expected checkout session amount', () => {
  const sessExpected = 100.05;
  const webhookActual = 100.05;
  assert.strictEqual(Math.round(sessExpected * 100), Math.round(webhookActual * 100));

  const webhookTampered = 100.06;
  assert.notStrictEqual(Math.round(sessExpected * 100), Math.round(webhookTampered * 100));
});

test('Fee policy calculations for small order (< $200) vs large order (>= $200)', () => {
  // Small order: $50 gig price -> 20% commission ($10), 1% buyer fee ($0.50), $1.00 small order fee -> clientTotal = $51.50
  const smallFees = calculateOrderFees(50, DEFAULT_FEE_CONFIG);
  assert.strictEqual(smallFees.gigPrice, 50);
  assert.strictEqual(smallFees.platformCommission, 10);
  assert.strictEqual(smallFees.freelancerNet, 40);
  assert.strictEqual(smallFees.serviceFee, 0.5);
  assert.strictEqual(smallFees.smallOrderFee, 1);
  assert.strictEqual(smallFees.clientTotal, 51.5);

  // Large order: $300 gig price -> 20% commission ($60), 1% buyer fee ($3), NO small order fee ($0) -> clientTotal = $303
  const largeFees = calculateOrderFees(300, DEFAULT_FEE_CONFIG);
  assert.strictEqual(largeFees.gigPrice, 300);
  assert.strictEqual(largeFees.platformCommission, 60);
  assert.strictEqual(largeFees.freelancerNet, 240);
  assert.strictEqual(largeFees.serviceFee, 3);
  assert.strictEqual(largeFees.smallOrderFee, 0);
  assert.strictEqual(largeFees.clientTotal, 303);
});

test('Reconciliation exception resolution persists atomically in PostgreSQL with audit logs and concurrency protection', async () => {
  const { hydrateStoreFromPostgres, store } = await import('../server/store.ts');
  const { postgresStore } = await import('../server/db/postgresStore.ts');
  const { financialTransactionService, financialRepository } = await import('../server/domains/finance/financial.service.ts');
  const { financeLedger } = await import('../server/domains/finance/financeLedger.ts');

  await hydrateStoreFromPostgres();

  // 1. Legacy in-memory resolveException must be disabled
  assert.throws(
    () => financeLedger.resolveException('EXC-LEGACY', 'some notes', 'admin@fivepa.com'),
    /Legacy in-memory reconciliation exception resolution is disabled/
  );

  // 2. Non-existent exception returns 404 and performs no write
  await assert.rejects(
    async () => {
      await financialTransactionService.resolveReconciliationException({
        exceptionId: 'EXC-NON-EXISTENT-999',
        notes: 'Checked ledger',
        actor: 'admin@fivepa.com'
      });
    },
    (err: any) => {
      assert.strictEqual(err.statusCode, 404);
      assert.match(err.message, /not found/i);
      return true;
    }
  );

  // 3. Create an open reconciliation exception in PostgreSQL
  const excId = `EXC-TEST-${Date.now()}`;
  const created = await financialTransactionService.createReconciliationException({
    id: excId,
    type: 'wallet_mismatch',
    entityId: 'USR-TEST-1',
    amount: 25.50,
    description: 'Detected $25.50 variance during nightly check',
    status: 'open'
  });
  assert.strictEqual(created.id, excId);
  assert.strictEqual(created.status, 'open');

  // 4. Missing or whitespace-only notes returns 400 and leaves exception open
  await assert.rejects(
    async () => {
      await financialTransactionService.resolveReconciliationException({
        exceptionId: excId,
        notes: '   ',
        actor: 'admin@fivepa.com'
      });
    },
    (err: any) => {
      assert.strictEqual(err.statusCode, 400);
      assert.match(err.message, /Investigation notes.*required/i);
      return true;
    }
  );

  const stillOpen = await financialRepository.getReconciliationException(excId);
  assert.ok(stillOpen);
  assert.strictEqual(stillOpen.status, 'open');
  assert.strictEqual(stillOpen.resolvedAt, undefined);

  // 5. Resolve exception atomically in PostgreSQL
  const resolved = await financialTransactionService.resolveReconciliationException({
    exceptionId: excId,
    notes: 'Verified rounding adjustment on settlement batch #42',
    actor: 'auditor@fivepa.com',
    role: 'super_admin'
  });

  assert.strictEqual(resolved.id, excId);
  assert.strictEqual(resolved.status, 'resolved');
  assert.strictEqual(resolved.investigationNotes, 'Verified rounding adjustment on settlement batch #42');
  assert.strictEqual(resolved.resolvedBy, 'auditor@fivepa.com');
  assert.ok(resolved.resolvedAt);

  // 6. Subsequent reads from PostgreSQL return the updated resolution state
  const fetched = await financialRepository.getReconciliationException(excId);
  assert.ok(fetched);
  assert.strictEqual(fetched.status, 'resolved');
  assert.strictEqual(fetched.investigationNotes, 'Verified rounding adjustment on settlement batch #42');
  assert.strictEqual(fetched.resolvedBy, 'auditor@fivepa.com');
  assert.strictEqual(fetched.resolvedAt, resolved.resolvedAt);

  const summary = await financialRepository.getReconciliationSummary();
  assert.ok(Array.isArray(summary.exceptions));
  const inSummary = summary.exceptions.find((e: any) => e.id === excId);
  assert.ok(inSummary);
  assert.strictEqual(inSummary.status, 'resolved');

  // 7. Audit log was persisted in PostgreSQL audit_logs
  const auditLogs = await postgresStore.listAuditLogs();
  const matchingAudits = auditLogs.filter(
    (l: any) => l.action === 'RECONCILIATION_EXCEPTION_RESOLVED' && l.target === `Exception #${excId}`
  );
  assert.strictEqual(matchingAudits.length, 1);
  assert.strictEqual(matchingAudits[0].actor, 'auditor@fivepa.com');

  // 8. Repeat resolution request is rejected (409) without overwriting existing resolution or creating duplicate audit logs
  await assert.rejects(
    async () => {
      await financialTransactionService.resolveReconciliationException({
        exceptionId: excId,
        notes: 'Attempted overwrite notes',
        actor: 'other-admin@fivepa.com'
      });
    },
    (err: any) => {
      assert.strictEqual(err.statusCode, 409);
      assert.match(err.message, /already resolved/i);
      return true;
    }
  );

  const afterRepeat = await financialRepository.getReconciliationException(excId);
  assert.strictEqual(afterRepeat?.investigationNotes, 'Verified rounding adjustment on settlement batch #42');
  assert.strictEqual(afterRepeat?.resolvedBy, 'auditor@fivepa.com');

  const auditLogsAfterRepeat = await postgresStore.listAuditLogs();
  const matchingAuditsAfterRepeat = auditLogsAfterRepeat.filter(
    (l: any) => l.action === 'RECONCILIATION_EXCEPTION_RESOLVED' && l.target === `Exception #${excId}`
  );
  assert.strictEqual(matchingAuditsAfterRepeat.length, 1);

  // 9. Concurrent resolution requests: only one succeeds, the other fails with 409
  const concExcId = `EXC-CONCURRENT-${Date.now()}`;
  await financialTransactionService.createReconciliationException({
    id: concExcId,
    type: 'escrow_variance',
    entityId: 'ORD-CONC-2',
    amount: 100.00,
    description: 'Concurrent resolution test exception',
    status: 'open'
  });

  const results = await Promise.allSettled([
    financialTransactionService.resolveReconciliationException({
      exceptionId: concExcId,
      notes: 'Concurrent resolution A',
      actor: 'adminA@fivepa.com'
    }),
    financialTransactionService.resolveReconciliationException({
      exceptionId: concExcId,
      notes: 'Concurrent resolution B',
      actor: 'adminB@fivepa.com'
    })
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  assert.strictEqual(fulfilled.length, 1);
  assert.strictEqual(rejected.length, 1);
  assert.strictEqual((rejected[0].reason as any)?.statusCode, 409);
});

test('Legacy snapshot persistence and hydration cannot overwrite PostgreSQL financial state', async () => {
  const { hydrateStoreFromPostgres } = await import('../server/store.ts');
  const { postgresStore } = await import('../server/db/postgresStore.ts');
  const { financialTransactionService, financialRepository } = await import('../server/domains/finance/financial.service.ts');
  const { financeLedger } = await import('../server/domains/finance/financeLedger.ts');

  await hydrateStoreFromPostgres();

  const userId = `USR-SNAPSHOT-GUARD-${Date.now()}`;
  const pool = postgresStore.getPool();
  await pool.query(
    "INSERT INTO users (id, name, email, role, status) VALUES ($1, $2, $3, 'buyer', 'active') ON CONFLICT DO NOTHING",
    [userId, 'Snapshot Guard User', `${userId.toLowerCase()}@example.com`]
  );
  await financialTransactionService.ensureWallet(userId);
  await financialTransactionService.creditDeposit({
    userId,
    amount: 250.00,
    reference: `DEP-AUTH-${userId}`,
    idempotencyKey: `IDEMP-AUTH-${userId}`,
    actor: 'system',
    source: 'stripe'
  });

  const guardExcId = `EXC-GUARD-${Date.now()}`;
  await financialTransactionService.createReconciliationException({
    id: guardExcId,
    type: 'wallet_mismatch',
    entityId: userId,
    amount: 10.00,
    description: 'Snapshot guard test exception',
    status: 'open'
  });
  await financialTransactionService.resolveReconciliationException({
    exceptionId: guardExcId,
    notes: 'Authoritative PostgreSQL resolution',
    actor: 'auditor@fivepa.com'
  });

  const pgBalanceBefore = await financialRepository.getWalletBalance(userId);
  assert.strictEqual(pgBalanceBefore, 250.00);

  // Attempt to load stale/corrupt financial state into financeLedger and persist snapshot
  financeLedger.loadFromState({
    wallets: [[userId, { userId, availableBalance: 999999, pendingClearance: 0, heldInEscrow: 0 }]],
    exceptions: [[guardExcId, { id: guardExcId, status: 'open', investigationNotes: 'corrupted' }]],
    config: { platformCommissionRate: 20 }
  });
  await financeLedger.persistToPostgres();
  financeLedger.saveToDisk();
  await postgresStore.saveLedgerState({
    wallets: [[userId, { userId, availableBalance: 0 }]]
  });

  const loadedSnapshot = await postgresStore.loadLedgerState();
  assert.strictEqual(loadedSnapshot, null);

  // Re-run startup hydration and verify PostgreSQL authoritative state is untouched
  await hydrateStoreFromPostgres();

  const pgBalanceAfter = await financialRepository.getWalletBalance(userId);
  assert.strictEqual(pgBalanceAfter, 250.00);

  const excAfter = await financialRepository.getReconciliationException(guardExcId);
  assert.strictEqual(excAfter?.status, 'resolved');
  assert.strictEqual(excAfter?.investigationNotes, 'Authoritative PostgreSQL resolution');
});

test('Financial services fail closed when PostgreSQL is unavailable instead of falling back to financeLedger', async () => {
  const { postgresStore } = await import('../server/db/postgresStore.ts');
  const { financialTransactionService, financialRepository } = await import('../server/domains/finance/financial.service.ts');

  const originalEnabled = postgresStore.isEnabled;
  postgresStore.isEnabled = () => false;

  try {
    await assert.rejects(
      async () => {
        await financialRepository.getWallet('USR-SNAPSHOT-GUARD-1');
      },
      /PostgreSQL persistence is required for all financial operations/
    );

    await assert.rejects(
      async () => {
        await financialRepository.getReconciliationSummary();
      },
      /PostgreSQL persistence is required for all financial operations/
    );

    await assert.rejects(
      async () => {
        await financialTransactionService.creditDeposit({
          userId: 'USR-SNAPSHOT-GUARD-1',
          amount: 50,
          reference: 'FAIL-CLOSED-REF',
          idempotencyKey: 'FAIL-CLOSED-KEY',
          actor: 'system'
        });
      },
      /PostgreSQL persistence is required for all financial operations/
    );

    await assert.rejects(
      async () => {
        await financialTransactionService.resolveReconciliationException({
          exceptionId: 'EXC-TEST-001',
          notes: 'Should fail closed',
          actor: 'admin@fivepa.com'
        });
      },
      /PostgreSQL persistence is required for all financial operations/
    );
  } finally {
    postgresStore.isEnabled = originalEnabled;
    try {
      await postgresStore.getPool().end();
    } catch {}
  }
});


