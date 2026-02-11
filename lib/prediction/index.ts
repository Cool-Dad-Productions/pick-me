export { tokenize, bookToText } from './tokenizer';
export { TfIdfVectorizer, type TfIdfVector, type BookDocument } from './tfidf';
export {
  cosineSimilarity,
  findMostSimilar,
  getMatchingTerms,
  MIN_SIMILARITY_THRESHOLD,
  type SimilarityResult,
} from './similarity';
