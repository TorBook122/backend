import { test, expect } from '../fixtures/business.fixture.js';
import { createPendingPlusCheckout, getBusinessIsPro } from '../helpers/db-reset.js';

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001';

test.describe('Plus subscription webhook', () => {
  test('mock Morning webhook activates Plus and sets subscription tier', async ({ seedBusiness }) => {
    const { business } = await seedBusiness({ completeOnboarding: true });
    const checkoutRef = `e2e-checkout-${Date.now()}`;

    await createPendingPlusCheckout(business.id, checkoutRef, 9900);

    const webhookResponse = await fetch(`${API_BASE}/api/v1/subscriptions/plus/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        custom: checkoutRef,
        amount: '99',
      }),
    });

    expect(webhookResponse.status).toBe(200);
    expect(await getBusinessIsPro(business.id)).toBe(true);
  });
});
