const PROFANITY_TERMS = [
  'זין',
  'זיין',
  'זיוני',
  'זונה',
  'זונות',
  'בן זונה',
  'בת זונה',
  'כוס',
  'כוסית',
  'כוס אמ',
  'כוס אמק',
  'כוסאמק',
  'כוס אמא',
  'מזדיין',
  'מזדיינת',
  'תזדיין',
  'תזדייני',
  'מניאק',
  'מניאקת',
  'מניאקים',
  'חרא',
  'שמוק',
  'שמוקים',
  'fuck',
  'fucking',
  'fucker',
  'shit',
  'bitch',
  'asshole',
  'dick',
  'pussy',
  'cunt',
  'motherfucker',
] as const;

export const COMMENT_PROFANITY_ERROR =
  'התגובה מכילה שפה בלתי הולמת ולא ניתן לפרסמה';

function normalizeProfanityText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[0@]/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsProfanity(text: string): boolean {
  const normalized = normalizeProfanityText(text);
  if (!normalized) return false;

  const words = normalized.split(' ');
  const compact = normalized.replace(/\s/g, '');
  const padded = ` ${normalized} `;

  for (const term of PROFANITY_TERMS) {
    if (term.includes(' ')) {
      if (padded.includes(` ${term} `) || compact.includes(term.replace(/\s/g, ''))) {
        return true;
      }
      continue;
    }

    if (words.includes(term)) {
      return true;
    }

    if (term.length >= 5 && compact.includes(term)) {
      return true;
    }
  }

  return false;
}
