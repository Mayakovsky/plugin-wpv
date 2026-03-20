// ════════════════════════════════════════════
// Text similarity utilities for fork detection.
// Pure functions — no side effects, no dependencies.
// ════════════════════════════════════════════

/**
 * Normalize text for comparison: lowercase, collapse whitespace, remove punctuation.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract word-level n-grams from text.
 */
export function extractNgrams(text: string, n: number): Set<string> {
  const words = normalizeText(text).split(' ').filter(Boolean);
  const ngrams = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.add(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Jaccard similarity between two sets: |A ∩ B| / |A ∪ B|
 * Returns 0–1 where 1 is identical.
 */
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Compute text similarity using word-level 3-gram Jaccard.
 */
export function textSimilarity(textA: string, textB: string): number {
  if (!textA || !textB) return 0;
  const ngramsA = extractNgrams(textA, 3);
  const ngramsB = extractNgrams(textB, 3);
  return jaccardSimilarity(ngramsA, ngramsB);
}
