import { CommentSentiment } from '../types/enums.js';

const POSITIVE_KEYWORDS = [
  'מעולה',
  'ממליץ',
  'מומלץ',
  'נהדר',
  'מושלם',
  'מצוין',
  'מצוינת',
  'טוב',
  'טובה',
  'אהבתי',
  'אהבנו',
  'מרוצה',
  'מרוצה מאוד',
  'שירות מעולה',
  'שירות מצוין',
  'שירות אדיב',
  'אדיב',
  'מקצועי',
  'מקצועית',
  'אמין',
  'אמינה',
  'איכותי',
  'איכותית',
  'מהיר',
  'מהירה',
  'זריז',
  'זריזה',
  'נקי',
  'נקייה',
  'סבלני',
  'סבלנית',
  'יחס אישי',
  'חוויה טובה',
  'שווה',
  'מדהים',
  'מדהימה',
  'מקסים',
  'מקסימה',
  'יוצא מן הכלל',
  'אין מילים',
  'חזרתי שוב',
  'אחזור שוב',
  'שווה כל שקל',
  'מעל המצופה',
] as const;

const NEGATIVE_KEYWORDS = [
  'גרוע',
  'גרועה',
  'לא ממליץ',
  'לא מומלץ',
  'איטי',
  'איטית',
  'יקר',
  'יקרה',
  'מאוכזב',
  'מאוכזבת',
  'נורא',
  'זוועה',
  'על הפנים',
  'אכזבה',
  'מאכזב',
  'מאכזבת',
  'לא מקצועי',
  'לא מקצועית',
  'לא אדיב',
  'לא אדיבה',
  'לא אמין',
  'לא אמינה',
  'לא נקי',
  'לא נקייה',
  'לא שווה',
  'בזבוז כסף',
  'בזבוז זמן',
  'שירות גרוע',
  'שירות מזעזע',
  'יחס גרוע',
  'יחס מזלזל',
  'מזלזל',
  'מזלזלת',
  'לא אחזור',
  'לא אחזור שוב',
  'לא מרוצה',
  'לא מרוצה בכלל',
  'איחור',
  'מאחר',
  'מלוכלך',
  'מלוכלכת',
  'לא איכותי',
  'לא איכותית',
] as const;

const NEGATION_WORD = 'לא';

function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function countKeywordHits(words: string[], keywords: readonly string[]): number {
  let hits = 0;

  for (const keyword of keywords) {
    const keywordWords = keyword.split(/\s+/);
    const keywordLength = keywordWords.length;

    for (let index = 0; index <= words.length - keywordLength; index += 1) {
      const slice = words.slice(index, index + keywordLength);
      if (slice.join(' ') === keyword) {
        hits += 1;
      }
    }
  }

  return hits;
}

function countPositiveHits(words: string[]): number {
  let positiveHits = 0;
  let negativeHits = 0;

  for (const keyword of POSITIVE_KEYWORDS) {
    const keywordWords = keyword.split(/\s+/);
    const keywordLength = keywordWords.length;

    for (let index = 0; index <= words.length - keywordLength; index += 1) {
      const slice = words.slice(index, index + keywordLength);
      if (slice.join(' ') !== keyword) {
        continue;
      }

      let negated = false;
      for (let lookback = 1; lookback <= 2; lookback += 1) {
        const previousWord = words[index - lookback];
        if (previousWord === NEGATION_WORD) {
          negated = true;
          break;
        }
      }

      if (negated) {
        negativeHits += 1;
      } else {
        positiveHits += 1;
      }
    }
  }

  return positiveHits - negativeHits;
}

export function analyzeCommentSentiment(text: string): CommentSentiment {
  const words = normalizeText(text);
  const positiveHits = countPositiveHits(words);
  const negativeHits = countKeywordHits(words, NEGATIVE_KEYWORDS);

  if (positiveHits > negativeHits) {
    return CommentSentiment.POSITIVE;
  }

  if (negativeHits > positiveHits) {
    return CommentSentiment.NEGATIVE;
  }

  return CommentSentiment.NEUTRAL;
}
