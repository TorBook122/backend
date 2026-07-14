import { describe, expect, it } from 'vitest';
import { CommentSentiment } from '../types/enums.js';
import { analyzeCommentSentiment } from './comment-sentiment.js';

describe('analyzeCommentSentiment', () => {
  it('classifies clearly positive Hebrew comments', () => {
    expect(analyzeCommentSentiment('שירות מעולה, ממליץ בחום!')).toBe(CommentSentiment.POSITIVE);
  });

  it('classifies clearly negative Hebrew comments', () => {
    expect(analyzeCommentSentiment('שירות גרוע, לא ממליץ')).toBe(CommentSentiment.NEGATIVE);
  });

  it('classifies neutral comments without sentiment keywords', () => {
    expect(analyzeCommentSentiment('הגעתי בזמן')).toBe(CommentSentiment.NEUTRAL);
  });

  it('treats negated positive keywords as negative', () => {
    expect(analyzeCommentSentiment('לא מעולה')).toBe(CommentSentiment.NEGATIVE);
  });
});
