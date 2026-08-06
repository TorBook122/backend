import { describe, expect, it } from 'vitest';
import {
  getMorningDevReturnTarget,
  morningDevReturnHtml,
} from '../routes/morning-dev-return.js';

describe('morning-dev-return', () => {
  it('accepts base64url localhost targets', () => {
    const target = 'http://localhost:3000/upgrade/success?from=setup';
    const encoded = Buffer.from(target).toString('base64url');
    expect(getMorningDevReturnTarget(encoded)).toBe(target);
  });

  it('rejects non-local hosts', () => {
    const encoded = Buffer.from('https://grow.business/').toString('base64url');
    expect(getMorningDevReturnTarget(encoded)).toBeNull();
  });

  it('renders redirect html for valid targets', () => {
    const page = morningDevReturnHtml('http://localhost:3000/upgrade/success');
    expect(page.status).toBe(200);
    expect(page.body).toContain('http://localhost:3000/upgrade/success');
    expect(page.body).toContain('location.replace');
  });
});
