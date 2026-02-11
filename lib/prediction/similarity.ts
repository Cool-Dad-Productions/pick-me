import 'server-only';
import type { TfIdfVector } from './tfidf';

/** Minimum similarity threshold - below this, books aren't considered similar */
export const MIN_SIMILARITY_THRESHOLD = 0.1;

/**
 * Compute cosine similarity between two TF-IDF vectors
 * Returns value between 0 (no similarity) and 1 (identical)
 *
 * Formula: cos(A, B) = (A · B) / (||A|| × ||B||)
 */
export function cosineSimilarity(vecA: TfIdfVector, vecB: TfIdfVector): number {
  const termsA = Object.keys(vecA);
  const termsB = new Set(Object.keys(vecB));

  if (termsA.length === 0 || termsB.size === 0) {
    return 0;
  }

  // Compute dot product
  let dotProduct = 0;
  for (const term of termsA) {
    if (termsB.has(term)) {
      dotProduct += vecA[term] * vecB[term];
    }
  }

  // Compute magnitudes
  const magA = Math.sqrt(
    Object.values(vecA).reduce((sum, val) => sum + val * val, 0)
  );
  const magB = Math.sqrt(
    Object.values(vecB).reduce((sum, val) => sum + val * val, 0)
  );

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dotProduct / (magA * magB);
}

export interface SimilarityResult {
  id: string;
  similarity: number;
}

/**
 * Find top-k most similar documents to a query document
 * Only includes results above MIN_SIMILARITY_THRESHOLD
 */
export function findMostSimilar(
  queryVector: TfIdfVector,
  corpus: Map<string, TfIdfVector>,
  k: number = 3,
  excludeIds: Set<string> = new Set()
): SimilarityResult[] {
  const similarities: SimilarityResult[] = [];

  for (const [id, vector] of corpus) {
    if (excludeIds.has(id)) continue;

    const similarity = cosineSimilarity(queryVector, vector);

    // Only include results above minimum threshold
    if (similarity >= MIN_SIMILARITY_THRESHOLD) {
      similarities.push({ id, similarity });
    }
  }

  // Sort by similarity descending, take top k
  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

/**
 * Get matching terms between two vectors (for explainability)
 * Returns the common terms sorted by combined weight
 */
export function getMatchingTerms(
  vecA: TfIdfVector,
  vecB: TfIdfVector,
  limit: number = 5
): string[] {
  const termsB = new Set(Object.keys(vecB));

  // Find common terms, sorted by combined weight
  const matches = Object.entries(vecA)
    .filter(([term]) => termsB.has(term))
    .map(([term, weight]) => ({
      term,
      combinedWeight: weight + vecB[term],
    }))
    .sort((a, b) => b.combinedWeight - a.combinedWeight)
    .slice(0, limit)
    .map(m => m.term);

  return matches;
}
