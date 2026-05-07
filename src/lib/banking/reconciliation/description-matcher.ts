/**
 * Stage 6.P3.G — Description fuzzy-matching.
 *
 * Pure helpers — no I/O. Used by the auto-matcher to score how
 * similar two transaction descriptions are when amount + date are
 * not enough to disambiguate.
 *
 * The algorithm is intentionally simple:
 *   1. Normalize: lowercase, drop punctuation + common words.
 *   2. Tokenize on whitespace.
 *   3. Score = Jaccard similarity of token sets, with optional
 *      Levenshtein-based fuzzy match for near-misses.
 *
 * No external NLP dependency — bookkeeper descriptions are short and
 * well-formed, and Jaccard performs well enough for the
 * "this transaction matches this invoice" question.
 */

const COMMON_WORDS = new Set([
  // English
  "payment", "transfer", "deposit", "withdrawal", "the", "and", "for",
  "from", "to", "of", "by", "at", "in", "on", "via", "ref", "reference",
  "invoice", "inv", "no", "number",
  // Indonesian
  "ke", "dari", "untuk", "dengan", "no", "ref", "transfer",
  // Russian (transliterated)
  "perevod", "platezh",
]);

export function normalizeDescription(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\sÀ-ſ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeDescription(input: string): string[] {
  return normalizeDescription(input)
    .split(" ")
    .filter((t) => t.length >= 2 && !COMMON_WORDS.has(t));
}

/**
 * Jaccard similarity over significant tokens. Returns a value in
 * [0, 1] where 1 means every significant token in `a` also appears
 * in `b` (and vice versa).
 */
export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenizeDescription(a));
  const tokensB = new Set(tokenizeDescription(b));
  if (tokensA.size === 0 && tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) if (tokensB.has(t)) intersection++;
  const union = tokensA.size + tokensB.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

/**
 * Levenshtein distance — simple O(m·n) DP. Bound the input size so a
 * pathological pair doesn't OOM the cron sweep.
 */
export function levenshtein(a: string, b: string, maxLen = 200): number {
  const sa = a.slice(0, maxLen);
  const sb = b.slice(0, maxLen);
  const m = sa.length;
  const n = sb.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = sa[i - 1] === sb[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/**
 * Combined similarity score: Jaccard + Levenshtein backstop.
 * Returns [0, 1].
 */
export function descriptionSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const j = jaccardSimilarity(a, b);
  if (j > 0.5) return j;
  // Fall back to Levenshtein-derived ratio for cases where token
  // overlap is tiny but the strings are otherwise similar
  // ("INV-2026-001" vs "INV2026001").
  const na = normalizeDescription(a);
  const nb = normalizeDescription(b);
  if (!na || !nb) return j;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return j;
  const lev = 1 - dist / maxLen;
  // Take the better of the two signals — biased toward Jaccard since
  // it's more intent-aware.
  return Math.max(j, lev);
}
