import { disconnectDatabase } from './helpers/db-reset.js';

export default async function globalTeardown(): Promise<void> {
  try {
    await disconnectDatabase();
  } catch {
    // Ignore teardown errors when the DB client is unavailable.
  }
}
