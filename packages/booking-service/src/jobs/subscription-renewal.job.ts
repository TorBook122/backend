import { renewDueSubscriptions } from '../services/subscription.service.js';
import { RENEWAL_JOB_INTERVAL_MS } from '../config/morning.config.js';

let renewalTimer: NodeJS.Timeout | null = null;
let renewalRunning = false;

async function runRenewalJob(): Promise<void> {
  if (renewalRunning) {
    return;
  }
  renewalRunning = true;
  try {
    await renewDueSubscriptions();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[subscription-renewal] job failed', error);
  } finally {
    renewalRunning = false;
  }
}

export function startSubscriptionRenewalJob(): void {
  if (renewalTimer || process.env.NODE_ENV === 'test') {
    return;
  }

  void runRenewalJob();
  renewalTimer = setInterval(() => {
    void runRenewalJob();
  }, RENEWAL_JOB_INTERVAL_MS);

  if (typeof renewalTimer.unref === 'function') {
    renewalTimer.unref();
  }
}

export function stopSubscriptionRenewalJob(): void {
  if (renewalTimer) {
    clearInterval(renewalTimer);
    renewalTimer = null;
  }
}

export { runRenewalJob };
