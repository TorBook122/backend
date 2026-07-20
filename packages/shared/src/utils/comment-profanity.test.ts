import { describe, expect, it } from 'vitest';
import { containsProfanity } from './comment-profanity.js';

describe('containsProfanity', () => {
  it('detects common Hebrew profanity', () => {
    expect(containsProfanity('שירות גרוע, אתה מניאק')).toBe(true);
    expect(containsProfanity('זונה')).toBe(true);
  });

  it('detects common English profanity', () => {
    expect(containsProfanity('what the fuck')).toBe(true);
  });

  it('allows normal business feedback', () => {
    expect(containsProfanity('שירות מעולה, ממליץ בחום')).toBe(false);
    expect(containsProfanity('הגעתי בזמן, היה נחמד')).toBe(false);
  });

  it('detects obfuscated spacing in compact phrases', () => {
    expect(containsProfanity('כוסאמק')).toBe(true);
  });
});
