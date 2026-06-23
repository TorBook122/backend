import { describe, expect, it } from 'vitest';
import { buildServiceUrl, normalizeServiceUrl } from './service-url.js';

describe('normalizeServiceUrl', () => {
  it('adds http:// to Render-style hostport values', () => {
    expect(normalizeServiceUrl('torbook-shared:3002')).toBe('http://torbook-shared:3002');
  });

  it('leaves full http URLs unchanged', () => {
    expect(normalizeServiceUrl('http://127.0.0.1:3002')).toBe('http://127.0.0.1:3002');
  });

  it('leaves full https URLs unchanged', () => {
    expect(normalizeServiceUrl('https://shared.example.com')).toBe('https://shared.example.com');
  });

  it('strips trailing slashes', () => {
    expect(normalizeServiceUrl('http://localhost:3002/')).toBe('http://localhost:3002');
  });
});

describe('buildServiceUrl', () => {
  it('joins hostport base and path', () => {
    expect(buildServiceUrl('torbook-db:3003', '/users/lookup')).toBe(
      'http://torbook-db:3003/users/lookup',
    );
  });
});
