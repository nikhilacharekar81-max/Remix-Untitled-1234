import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { apiRouter } from '../server/routes/index.ts';
import { store, hydrateStoreFromPostgres } from '../server/store.ts';
import { postgresStore } from '../server/db/postgresStore.ts';
import { signToken } from '../server/middleware/auth.ts';
import { financialTransactionService } from '../server/domains/finance/financial.service.ts';

function createAuthHeaders(user: { id: string; role: string; email: string; sessionVersion?: number }, extraHeaders: Record<string, string> = {}) {
  const token = signToken({
    id: user.id,
    role: user.role,
    email: user.email,
    sessionVersion: user.sessionVersion || 1,
  });
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...extraHeaders,
  };
}

test('FivePA WorkStream & Workspace Architecture Repair Suite (Parts 15.A - 15.G)', async (t) => {
  await hydrateStoreFromPostgres();

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const buyerId = `USR-BUYER-${suffix}`;
  const sellerId = `USR-SELLER-${suffix}`;
  const seller2Id = `USR-SELLER2-${suffix}`;
  const outsiderId = `USR-OUTSIDER-${suffix}`;

  const buyerUser: any = {
    id: buyerId,
    name: 'Test Buyer',
    username: `buyer_${suffix}`,
    email: `buyer_${suffix}@example.com`,
    role: 'Employer',
    ActiveRole: 'buyer',
    avatar: '',
    title: 'Buyer',
    rating: 5,
    reviewsCount: 1,
    hourlyRate: 0,
    earned: 0,
    completedJobs: 0,
    bio: 'Buyer bio',
    skills: [],
    status: 'active',
    verified: true,
    emailVerified: true,
    sessionVersion: 1,
    activeSessionVersions: [1],
    walletBalance: 5000,
    createdAt: '2026-10-29',
  };

  const sellerUser: any = {
    id: sellerId,
    name: 'Test Seller',
    username: `seller_${suffix}`,
    email: `seller_${suffix}@example.com`,
    role: 'Freelancer',
    ActiveRole: 'seller',
    avatar: '',
    title: 'Senior Engineer',
    rating: 5,
    reviewsCount: 10,
    hourlyRate: 80,
    earned: 0,
    completedJobs: 5,
    bio: 'Seller bio',
    skills: ['React', 'Node.js'],
    status: 'active',
    verified: true,
    emailVerified: true,
    sessionVersion: 1,
    activeSessionVersions: [1],
    walletBalance: 500,
    createdAt: '2026-10-29',
  };

  const seller2User: any = {
    ...sellerUser,
    id: seller2Id,
    name: 'Second Seller',
    username: `seller2_${suffix}`,
    email: `seller2_${suffix}@example.com`,
  };

  const outsiderUser: any = {
    ...buyerUser,
    id: outsiderId,
    name: 'Outsider User',
    username: `outsider_${suffix}`,
    email: `outsider_${suffix}@example.com`,
  };

  await store.saveUser(buyerUser);
  await store.saveUser(sellerUser);
  await store.saveUser(seller2User);
  await store.saveUser(outsiderUser);

  await financialTransactionService.ensureWallet(buyerId);
  await financialTransactionService.ensureWallet(sellerId);
  await financialTransactionService.ensureWallet(seller2Id);
  await financialTransactionService.creditDeposit({
    userId: buyerId,
    amount: 5000,
    reference: `SEED-${suffix}`,
    idempotencyKey: `SEED-DEPOSIT-${suffix}`,
    actor: 'test_seed',
    source: 'webhook',
  });

  const gigAId = `GIG-A-${suffix}`;
  const gigBId = `GIG-B-${suffix}`;
  await store.saveGig({
    id: gigAId,
    sellerId,
    freelancerId: sellerId,
    freelancerName: sellerUser.name,
    freelancer: sellerUser.name,
    sellerAvatar: '',
    title: 'Full-Stack Web App Development',
    description: 'Build production web apps',
    category: 'Development',
    subcategory: 'Web',
    price: 100,
    deliveryDays: 5,
    deliveryTime: '5 Days',
    rating: 5,
    reviews: 10,
    image: '',
    tags: ['react'],
    packages: {
      basic: { name: 'Basic', price: 100, description: 'Basic package', deliveryDays: 5, revisions: 2, features: [] },
    },
    approvalStatus: 'approved',
    status: 'active',
  } as any);

  await store.saveGig({
    id: gigBId,
    sellerId,
    freelancerId: sellerId,
    freelancerName: sellerUser.name,
    freelancer: sellerUser.name,
    sellerAvatar: '',
    title: 'Database Performance Optimization',
    description: 'Optimize PostgreSQL queries',
    category: 'Development',
    subcategory: 'Database',
    price: 150,
    deliveryDays: 3,
    deliveryTime: '3 Days',
    rating: 5,
    reviews: 4,
    image: '',
    tags: ['postgres'],
    packages: {
      basic: { name: 'Basic', price: 150, description: 'Basic DB optimization', deliveryDays: 3, revisions: 1, features: [] },
    },
    approvalStatus: 'approved',
    status: 'active',
  } as any);

  const buyerHeaders = createAuthHeaders(buyerUser);
  const sellerHeaders = createAuthHeaders(sellerUser);
  const seller2Headers = createAuthHeaders(seller2User);
  const outsiderHeaders = createAuthHeaders(outsiderUser);

  try {
    let order1Id = '';
    let workspace1Id = '';
    let order2Id = '';
    let workspace2Id = '';
    let order3Id = '';
    let workspace3Id = '';
    let order4Id = '';
    let uploadedFilenameOrder1 = '';
    let uploadedFileUrlOrder1 = '';
    let uploadedFileUrlWorkspace2 = '';

    await t.test('15.A & 15.B & 15.D & 15.F: Workspace & Order Cardinality, Follow-on Offers, Retention, and Deterministic Routing', async () => {
      // 1. Buyer purchases Seller's Gig A -> Order 1, Workspace 1
      const res1 = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: createAuthHeaders(buyerUser, { 'Idempotency-Key': randomUUID() }),
        body: JSON.stringify({
          title: 'Gig A Purchase #1',
          buyerId,
          sellerId,
          amount: 100,
          gigId: gigAId,
          orderType: 'gig',
          requirements: 'Initial requirements for Order 1',
        }),
      });
      assert.strictEqual(res1.status, 201);
      const order1 = await res1.json();
      order1Id = order1.id;
      workspace1Id = order1.workspaceId;
      assert.ok(order1Id, 'Order 1 ID should exist');
      assert.ok(workspace1Id, 'Workspace 1 ID should exist');
      assert.strictEqual(order1.status, 'funded_in_escrow');

      // 2. Buyer purchases Seller's Gig A AGAIN directly -> Order 2, Workspace 2 (separate Workspace!)
      const res2 = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: createAuthHeaders(buyerUser, { 'Idempotency-Key': randomUUID() }),
        body: JSON.stringify({
          title: 'Gig A Purchase #2',
          buyerId,
          sellerId,
          amount: 100,
          gigId: gigAId,
          orderType: 'gig',
          requirements: 'Separate purchase of Gig A',
        }),
      });
      assert.strictEqual(res2.status, 201);
      const order2 = await res2.json();
      order2Id = order2.id;
      workspace2Id = order2.workspaceId;
      assert.notStrictEqual(order2Id, order1Id, 'Repeat Gig purchase must create a new Order');
      assert.notStrictEqual(workspace2Id, workspace1Id, 'Repeat direct Gig purchase must create a separate Workspace');

      // 3. Buyer purchases Seller's Gig B directly -> Order 3, Workspace 3
      const res3 = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: createAuthHeaders(buyerUser, { 'Idempotency-Key': randomUUID() }),
        body: JSON.stringify({
          title: 'Gig B Purchase #1',
          buyerId,
          sellerId,
          amount: 150,
          gigId: gigBId,
          orderType: 'gig',
        }),
      });
      assert.strictEqual(res3.status, 201);
      const order3 = await res3.json();
      order3Id = order3.id;
      workspace3Id = order3.workspaceId;
      assert.notStrictEqual(workspace3Id, workspace1Id);
      assert.notStrictEqual(workspace3Id, workspace2Id);

      // 4. Send chat message and upload a file in Order 1 (Workspace 1)
      const uploadRes1 = await fetch(`${baseUrl}/api/workstream/upload`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({
          name: 'architecture_spec.txt',
          type: 'text/plain',
          orderId: order1Id,
          workspaceId: workspace1Id,
          dataUrl: 'data:text/plain;base64,' + Buffer.from('Order 1 confidential specification').toString('base64'),
        }),
      });
      assert.strictEqual(uploadRes1.status, 200);
      const uploadData1 = await uploadRes1.json();
      assert.strictEqual(uploadData1.type, 'text/plain', 'JSON/base64 .txt upload must return text/plain MIME type, not application/json');
      assert.strictEqual(uploadData1.file.type, 'text/plain');
      uploadedFileUrlOrder1 = uploadData1.file.url;
      uploadedFilenameOrder1 = uploadedFileUrlOrder1.split('/').pop()!;
      assert.ok(uploadedFilenameOrder1);
      const storedRec1 = await store.getUploadRecord(uploadedFilenameOrder1);
      assert.ok(storedRec1, 'Upload record must be persisted in PostgreSQL');
      assert.strictEqual(storedRec1?.mime, 'text/plain', 'Stored upload record must persist text/plain MIME type, not application/json');

      // Verify PDF upload via JSON/base64 stores application/pdf and rejects mismatched MIME/content
      const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF', 'utf8');
      const pdfUploadRes = await fetch(`${baseUrl}/api/workstream/upload`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({
          name: 'contract.pdf',
          orderId: order1Id,
          workspaceId: workspace1Id,
          dataUrl: 'data:application/pdf;base64,' + pdfBytes.toString('base64'),
        }),
      });
      assert.strictEqual(pdfUploadRes.status, 200);
      const pdfUploadData = await pdfUploadRes.json();
      assert.strictEqual(pdfUploadData.file.type, 'application/pdf');
      const pdfFilename = pdfUploadData.file.url.split('/').pop()!;
      const pdfStoredRec = await store.getUploadRecord(pdfFilename);
      assert.strictEqual(pdfStoredRec?.mime, 'application/pdf');

      // Verify spoofed MIME metadata (claiming image/png for a .pdf file) is rejected
      const spoofedMimeRes = await fetch(`${baseUrl}/api/workstream/upload`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({
          name: 'spoofed.pdf',
          type: 'image/png',
          orderId: order1Id,
          workspaceId: workspace1Id,
          dataUrl: 'data:image/png;base64,' + pdfBytes.toString('base64'),
        }),
      });
      assert.strictEqual(spoofedMimeRes.status, 400, 'Upload with declared MIME type contradicting extension must be rejected');

      // Verify disguised binary content (PDF bytes uploaded with .txt extension) is rejected
      const disguisedBinaryRes = await fetch(`${baseUrl}/api/workstream/upload`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({
          name: 'disguised.txt',
          type: 'text/plain',
          orderId: order1Id,
          workspaceId: workspace1Id,
          dataUrl: 'data:text/plain;base64,' + pdfBytes.toString('base64'),
        }),
      });
      assert.strictEqual(disguisedBinaryRes.status, 400, 'Disguised PDF binary content with .txt extension must be rejected');

      const msgRes1 = await fetch(`${baseUrl}/api/messages`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({
          orderId: order1Id,
          text: 'Here is the specification for Order 1',
          type: 'file',
          fileInfo: uploadData1.file,
        }),
      });
      assert.strictEqual(msgRes1.status, 200);
      const savedMsg1 = await msgRes1.json();
      assert.strictEqual(savedMsg1.orderId, order1Id);

      // 5. Seller delivers Order 1 and Buyer releases escrow to complete Order 1
      const delivRes = await fetch(`${baseUrl}/api/orders/${order1Id}/deliverable`, {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          notes: 'Completed initial Order 1 deliverables with full documentation.',
          reference: 'https://example.com/delivery-1',
          files: [uploadData1.file],
        }),
      });
      assert.strictEqual(delivRes.status, 200);

      const completeRes = await fetch(`${baseUrl}/api/payments/escrow/release`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({ orderId: order1Id }),
      });
      assert.strictEqual(completeRes.status, 200);
      const completedData1 = await completeRes.json();
      assert.strictEqual(completedData1.order.status, 'completed');

      // 6. Seller sends a follow-on proposal in completed Order 1 (Workspace 1)
      const offerCreateRes = await fetch(`${baseUrl}/api/orders/${order1Id}/offers`, {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          kind: 'proposal',
          title: 'Phase 2 Follow-on Milestone',
          amount: 120,
          deliveryDays: 4,
          note: 'Continuing Phase 2 in the same Workspace',
        }),
      });
      assert.strictEqual(offerCreateRes.status, 201);
      const offerCreateData = await offerCreateRes.json();
      const createdOffer = offerCreateData.offer || offerCreateData;
      assert.strictEqual(createdOffer.orderId, order1Id);
      assert.strictEqual(createdOffer.originOrderId, order1Id);
      assert.strictEqual(createdOffer.workspaceId, workspace1Id);

      // 7. Buyer accepts the follow-on proposal via POST /api/offers/:id/accept
      const acceptRes = await fetch(`${baseUrl}/api/offers/${createdOffer.id}/accept`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({ paymentMethod: 'wallet' }),
      });
      assert.strictEqual(acceptRes.status, 200);
      const acceptData = await acceptRes.json();
      assert.ok(acceptData.newOrder, 'Accepting follow-on offer on completed Order must create a new Order');
      order4Id = acceptData.newOrder.id;
      assert.notStrictEqual(order4Id, order1Id);
      assert.strictEqual(acceptData.newOrder.workspaceId, workspace1Id, 'Follow-on Order must belong to the SAME Workspace');
      assert.strictEqual(acceptData.newOrder.status, 'funded_in_escrow', 'Follow-on Order must use canonical funded_in_escrow status');
      assert.strictEqual(acceptData.offer.originOrderId, order1Id, 'Offer must preserve originOrderId');
      assert.strictEqual(acceptData.offer.resultingOrderId, order4Id, 'Offer must record resultingOrderId');

      // 8. Send a message in follow-on Order 4
      const msgRes4 = await fetch(`${baseUrl}/api/messages`, {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          orderId: order4Id,
          text: 'Welcome to Phase 2 (Order 4)!',
        }),
      });
      assert.strictEqual(msgRes4.status, 200);

      // 9. Verify Workspace-wide message retention across Order 1 and Order 4
      const wsMsgsFromOrder4 = await fetch(`${baseUrl}/api/messages/${order4Id}`, {
        headers: buyerHeaders,
      });
      assert.strictEqual(wsMsgsFromOrder4.status, 200);
      const allWsMessages = await wsMsgsFromOrder4.json();
      const hasOrder1Msg = allWsMessages.some((m: any) => m.id === savedMsg1.id && m.orderId === order1Id);
      const hasOrder4Msg = allWsMessages.some((m: any) => m.orderId === order4Id && m.text === 'Welcome to Phase 2 (Order 4)!');
      assert.ok(hasOrder1Msg, 'Historical message from completed Order 1 must remain visible when viewing Order 4');
      assert.ok(hasOrder4Msg, 'Message from Order 4 must be visible');

      // 10. Verify Workspace-wide offers endpoint returns offers across both Order 1 and Order 4
      const offersRes = await fetch(`${baseUrl}/api/orders/${order4Id}/offers`, {
        headers: buyerHeaders,
      });
      assert.strictEqual(offersRes.status, 200);
      const offersData = await offersRes.json();
      const wsOffers = Array.isArray(offersData) ? offersData : offersData.offers;
      const foundFollowOnOffer = wsOffers.find((o: any) => o.id === createdOffer.id);
      assert.ok(foundFollowOnOffer, 'Follow-on offer created on Order 1 must be returned when querying Order 4 offers');
      assert.strictEqual(foundFollowOnOffer.originOrderId, order1Id);
      assert.strictEqual(foundFollowOnOffer.resultingOrderId, order4Id);

      // 11. Verify file from completed Order 1 remains accessible when active Order is Order 4
      const fileDownloadRes = await fetch(
        `${baseUrl}/api/workstream/files/${encodeURIComponent(uploadedFilenameOrder1)}?workspaceId=${encodeURIComponent(workspace1Id)}&orderId=${encodeURIComponent(order4Id)}`,
        { headers: buyerHeaders }
      );
      assert.strictEqual(fileDownloadRes.status, 200, 'Historical file from Order 1 must remain accessible in Order 4 within the same Workspace');
      const downloadedText = await fileDownloadRes.text();
      assert.strictEqual(downloadedText, 'Order 1 confidential specification');

      // 12. Verify deterministic routing (15.F):
      // - GET /api/orders/:order1Id returns exact Order 1
      // - GET /api/orders/:workspace1Id returns activeOrderId (Order 4)
      // - GET /api/workspaces/:workspace1Id returns activeOrder (Order 4) and chronological orderIds [order1Id, order4Id]
      const exactOrder1Res = await fetch(`${baseUrl}/api/orders/${order1Id}`, { headers: buyerHeaders });
      assert.strictEqual(exactOrder1Res.status, 200);
      const exactOrder1 = await exactOrder1Res.json();
      assert.strictEqual(exactOrder1.id, order1Id);

      const wsRouteRes = await fetch(`${baseUrl}/api/orders/${workspace1Id}`, { headers: buyerHeaders });
      assert.strictEqual(wsRouteRes.status, 200);
      const resolvedActiveOrder = await wsRouteRes.json();
      assert.strictEqual(resolvedActiveOrder.id, order4Id, 'Workspace ID lookup must deterministically resolve to activeOrderId (Order 4)');

      const wsDetailRes = await fetch(`${baseUrl}/api/workspaces/${workspace1Id}`, { headers: buyerHeaders });
      assert.strictEqual(wsDetailRes.status, 200);
      const wsDetail = await wsDetailRes.json();
      assert.strictEqual(wsDetail.activeOrderId, order4Id);
      assert.strictEqual(wsDetail.activeOrder.id, order4Id);
      assert.deepStrictEqual(
        wsDetail.orders.map((o: any) => o.id),
        [order1Id, order4Id],
        'Workspace orders must preserve chronological order [order1Id, order4Id]'
      );
    });

    await t.test('15.D (Part 2): Legacy accept-offer endpoint parity (/api/workstream/messages/:id/accept-offer)', async () => {
      // Deliver & complete Order 4 first, then create a second follow-on proposal and accept via /api/workstream/messages/:id/accept-offer
      const deliv4Res = await fetch(`${baseUrl}/api/orders/${order4Id}/deliverable`, {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          notes: 'Completed Order 4 Phase 2 deliverables.',
          reference: 'https://example.com/delivery-4',
        }),
      });
      assert.strictEqual(deliv4Res.status, 200);

      const release4Res = await fetch(`${baseUrl}/api/payments/escrow/release`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({ orderId: order4Id }),
      });
      assert.strictEqual(release4Res.status, 200);

      const offer2Res = await fetch(`${baseUrl}/api/orders/${order4Id}/offers`, {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          kind: 'proposal',
          title: 'Phase 3 Follow-on via Message Accept',
          amount: 80,
          deliveryDays: 3,
          note: 'Testing message-based offer acceptance parity',
        }),
      });
      assert.strictEqual(offer2Res.status, 201);
      const offer2Data = await offer2Res.json();
      const offer2 = offer2Data.offer || offer2Data;

      // Find the system message emitted for offer2
      const msgsRes = await fetch(`${baseUrl}/api/messages/${order4Id}`, { headers: buyerHeaders });
      const msgs = await msgsRes.json();
      const offerMsg = msgs.find((m: any) => m.metadata?.offerId === offer2.id);
      assert.ok(offerMsg, 'System message for offer2 must exist');

      const acceptViaMsgRes = await fetch(`${baseUrl}/api/workstream/messages/${offerMsg.id}/accept-offer`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({ paymentMethod: 'wallet' }),
      });
      assert.strictEqual(acceptViaMsgRes.status, 200);
      const acceptViaMsgData = await acceptViaMsgRes.json();
      assert.ok(acceptViaMsgData.newOrder);
      assert.strictEqual(acceptViaMsgData.newOrder.workspaceId, workspace1Id);
      assert.strictEqual(acceptViaMsgData.newOrder.status, 'funded_in_escrow', 'Legacy endpoint must also create Order with funded_in_escrow status');
      assert.strictEqual(acceptViaMsgData.offer.originOrderId, order4Id);
      assert.strictEqual(acceptViaMsgData.offer.resultingOrderId, acceptViaMsgData.newOrder.id);
    });

    await t.test('15.C: Pre-Purchase Gig "Contact Seller" & Profile Inquiry Flow', async () => {
      const walletBefore = (await store.getUser(buyerId))!.walletBalance;

      // 1. Buyer clicks "Contact Seller" on Gig B -> creates unfunded inquiry Order + Workspace
      const inqRes1 = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({
          title: 'Database Performance Optimization',
          serviceTitle: 'Database Performance Optimization',
          buyerId,
          sellerId,
          amount: 0,
          gigId: gigBId,
          orderType: 'gig',
          isInquiry: true,
        }),
      });
      assert.ok(inqRes1.status === 200 || inqRes1.status === 201);
      const inqOrder1 = await inqRes1.json();
      assert.strictEqual(inqOrder1.amount, 0);
      assert.ok(inqOrder1.status === 'in_progress' || inqOrder1.status === 'payment_pending');
      assert.strictEqual(inqOrder1.gigId, gigBId);
      assert.ok(inqOrder1.workspaceId);
      assert.notStrictEqual(inqOrder1.workspaceId, workspace3Id, 'Inquiry must not collide with an already-paid Gig B Workspace');

      const walletAfterInquiry = (await store.getUser(buyerId))!.walletBalance;
      assert.strictEqual(walletAfterInquiry, walletBefore, 'Pre-purchase inquiry must not deduct funds or create escrow');

      // 2. Clicking "Contact Seller" again on the same Gig B reuses the existing unfunded inquiry
      const inqRes2 = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({
          title: 'Database Performance Optimization',
          serviceTitle: 'Database Performance Optimization',
          buyerId,
          sellerId,
          amount: 0,
          gigId: gigBId,
          orderType: 'gig',
          isInquiry: true,
        }),
      });
      assert.strictEqual(inqRes2.status, 200);
      const inqOrder2 = await inqRes2.json();
      assert.strictEqual(inqOrder2.id, inqOrder1.id, 'Repeated Contact Seller on same Gig must reuse open unfunded inquiry Order');
      assert.strictEqual(inqOrder2.workspaceId, inqOrder1.workspaceId);

      // 3. Buyer and Seller exchange pre-purchase messages, then Seller sends a custom proposal in the inquiry
      const preMsgRes = await fetch(`${baseUrl}/api/messages`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({
          orderId: inqOrder1.id,
          text: 'Can you optimize our partitioned tables before Friday?',
        }),
      });
      assert.strictEqual(preMsgRes.status, 200);

      const inqOfferRes = await fetch(`${baseUrl}/api/orders/${inqOrder1.id}/offers`, {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          kind: 'proposal',
          title: 'Custom Partitioned Table Optimization',
          amount: 175,
          deliveryDays: 2,
          note: 'Includes index tuning and EXPLAIN ANALYZE report',
        }),
      });
      assert.strictEqual(inqOfferRes.status, 201);
      const inqOfferData = await inqOfferRes.json();
      const inqOffer = inqOfferData.offer || inqOfferData;

      // 4. Buyer accepts the custom proposal inside the inquiry -> inquiry Order becomes funded_in_escrow in the SAME Workspace
      const acceptInqRes = await fetch(`${baseUrl}/api/offers/${inqOffer.id}/accept`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({ paymentMethod: 'wallet' }),
      });
      assert.strictEqual(acceptInqRes.status, 200);
      const acceptInqData = await acceptInqRes.json();
      assert.strictEqual(acceptInqData.order.id, inqOrder1.id);
      assert.strictEqual(acceptInqData.order.status, 'funded_in_escrow');
      assert.strictEqual(acceptInqData.order.amount, 175);
      assert.strictEqual(acceptInqData.order.workspaceId, inqOrder1.workspaceId);
    });

    await t.test('15.E: Security, Cross-Workspace Isolation, and Non-Deletion Guarantees', async () => {
      // 1. Upload a file to Workspace 2 (Order 2)
      const uploadWs2Res = await fetch(`${baseUrl}/api/workstream/upload`, {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          name: 'workspace2_only.txt',
          type: 'text/plain',
          orderId: order2Id,
          workspaceId: workspace2Id,
          dataUrl: 'data:text/plain;base64,' + Buffer.from('Workspace 2 file content').toString('base64'),
        }),
      });
      assert.strictEqual(uploadWs2Res.status, 200);
      const uploadWs2Data = await uploadWs2Res.json();
      uploadedFileUrlWorkspace2 = uploadWs2Data.file.url;

      // 2. Reject upload with mismatched orderId (Order 1 in Workspace 1) + workspaceId (Workspace 2) even though buyer+seller are identical
      const mismatchedUploadRes = await fetch(`${baseUrl}/api/workstream/upload`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({
          name: 'mismatch.txt',
          type: 'text/plain',
          orderId: order1Id,
          workspaceId: workspace2Id,
          dataUrl: 'data:text/plain;base64,' + Buffer.from('Should be rejected').toString('base64'),
        }),
      });
      assert.strictEqual(
        mismatchedUploadRes.status,
        403,
        'POST /api/workstream/upload must reject mismatched (orderId, workspaceId) with 403 even for same buyer and seller'
      );

      // 3. Reject attaching Workspace 2's file to a message or deliverable in Workspace 1
      const crossWsMsgRes = await fetch(`${baseUrl}/api/messages`, {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          orderId: order1Id,
          text: 'Trying to attach Workspace 2 file in Workspace 1',
          type: 'file',
          fileInfo: uploadWs2Data.file,
        }),
      });
      assert.strictEqual(
        crossWsMsgRes.status,
        400,
        'Attaching a file from Workspace 2 to a message in Workspace 1 must be rejected'
      );

      // 4. Reject outsider access to Workspace 1 files and messages
      const outsiderFileRes = await fetch(
        `${baseUrl}/api/workstream/files/${encodeURIComponent(uploadedFilenameOrder1)}`,
        { headers: outsiderHeaders }
      );
      assert.strictEqual(outsiderFileRes.status, 403, 'Outsider must be denied file access with 403');

      const outsiderMsgsRes = await fetch(`${baseUrl}/api/messages/${order1Id}`, {
        headers: outsiderHeaders,
      });
      assert.strictEqual(outsiderMsgsRes.status, 403, 'Outsider must be denied message access with 403');

      // 5. Reject DELETE requests on WorkStream files and messages with 403
      const deleteFileRes = await fetch(
        `${baseUrl}/api/workstream/files/${encodeURIComponent(uploadedFilenameOrder1)}`,
        { method: 'DELETE', headers: buyerHeaders }
      );
      assert.strictEqual(deleteFileRes.status, 403, 'Deleting WorkStream files must be forbidden (403)');

      const deleteMsgRes = await fetch(`${baseUrl}/api/messages/MSG-ANY`, {
        method: 'DELETE',
        headers: buyerHeaders,
      });
      assert.strictEqual(deleteMsgRes.status, 403, 'Deleting WorkStream messages must be forbidden (403)');
    });

    await t.test('15.G: Project Multi-Hire Workspace Isolation', async () => {
      // Create a Project owned by buyerUser with maxHires: 2
      const projRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({
          title: 'Multi-Freelancer Enterprise Platform',
          description: 'Need two specialists in parallel',
          category: 'Development',
          subcategory: 'Web',
          budgetMin: 200,
          budgetMax: 300,
          maxHires: 2,
          deadline: '2026-12-01',
          skills: ['React', 'Node.js'],
        }),
      });
      assert.strictEqual(projRes.status, 200);
      const project = await projRes.json();

      // Seller 1 submits Proposal 1
      const prop1Res = await fetch(`${baseUrl}/api/proposals`, {
        method: 'POST',
        headers: sellerHeaders,
        body: JSON.stringify({
          projectId: project.id,
          bidAmount: 200,
          deliveryDays: 5,
          coverLetter: 'Seller 1 proposal for frontend',
        }),
      });
      assert.strictEqual(prop1Res.status, 200);
      const prop1 = await prop1Res.json();

      // Seller 2 submits Proposal 2
      const prop2Res = await fetch(`${baseUrl}/api/proposals`, {
        method: 'POST',
        headers: seller2Headers,
        body: JSON.stringify({
          projectId: project.id,
          bidAmount: 250,
          deliveryDays: 7,
          coverLetter: 'Seller 2 proposal for backend',
        }),
      });
      assert.strictEqual(prop2Res.status, 200);
      const prop2 = await prop2Res.json();

      // Buyer accepts Proposal 1 AND Proposal 2 (multi-hire on the same Project)
      const acceptProp1Res = await fetch(`${baseUrl}/api/proposals/${prop1.id}/accept`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({ paymentMethod: 'wallet' }),
      });
      assert.strictEqual(acceptProp1Res.status, 200);
      const hire1Data = await acceptProp1Res.json();

      const acceptProp2Res = await fetch(`${baseUrl}/api/proposals/${prop2.id}/accept`, {
        method: 'POST',
        headers: buyerHeaders,
        body: JSON.stringify({ paymentMethod: 'wallet' }),
      });
      assert.strictEqual(acceptProp2Res.status, 200);
      const hire2Data = await acceptProp2Res.json();

      assert.notStrictEqual(hire1Data.order.id, hire2Data.order.id, 'Each hired freelancer must get a separate Order');
      assert.notStrictEqual(
        hire1Data.order.workspaceId,
        hire2Data.order.workspaceId,
        'Each hired freelancer on a multi-hire Project must get an isolated Workspace'
      );

      // Seller 1 cannot read Seller 2's Project Workspace messages
      const crossHireReadRes = await fetch(`${baseUrl}/api/messages/${hire2Data.order.id}`, {
        headers: sellerHeaders,
      });
      assert.strictEqual(crossHireReadRes.status, 403, 'Freelancer 1 must not have access to Freelancer 2 Workspace messages');
    });
  } finally {
    try { (server as any).closeAllConnections?.(); } catch {}
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      await postgresStore.getPool().end();
    } catch {}
  }
});
