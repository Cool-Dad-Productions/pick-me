export { tokenize, bookToText } from './tokenizer';
export { TfIdfVectorizer, type TfIdfVector, type BookDocument } from './tfidf';
export {
  cosineSimilarity,
  findMostSimilar,
  getMatchingTerms,
  MIN_SIMILARITY_THRESHOLD,
  type SimilarityResult,
} from './similarity';
export {
  predictRating,
  roundToHalfStar,
  calculateConfidence,
  TOP_K_SIMILAR,
  MIN_BOOKS_FOR_HIGH_CONFIDENCE,
  LOW_CONFIDENCE_THRESHOLD,
  type RatedBook,
  type SimilarBook,
  type PredictionInput,
  type PredictionOutput,
} from './predictor';
