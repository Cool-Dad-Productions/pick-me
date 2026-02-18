import 'server-only';
import { tokenize, bookToText } from './tokenizer';

export interface TfIdfVector {
  [term: string]: number;
}

export interface BookDocument {
  id: string;
  title: string;
  authors: string[];
  subjects: string[];
  genres: string[];
  pageCount: number | null;
  publicationYear: number | null;
}

/**
 * Compute term frequency for a document
 * TF(t, d) = count(t in d) / total_terms(d)
 */
function computeTf(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  const totalTerms = tokens.length;

  if (totalTerms === 0) return tf;

  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  // Normalize by document length
  for (const [term, count] of tf) {
    tf.set(term, count / totalTerms);
  }

  return tf;
}

/**
 * Compute inverse document frequency for corpus
 * IDF(t) = log((total_docs + 1) / (docs_containing(t) + 1)) + 1
 * Uses smoothing to avoid division by zero
 */
function computeIdf(documents: string[][]): Map<string, number> {
  const idf = new Map<string, number>();
  const totalDocs = documents.length;
  const docFreq = new Map<string, number>();

  // Count documents containing each term
  for (const tokens of documents) {
    const uniqueTerms = new Set(tokens);
    for (const term of uniqueTerms) {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }
  }

  // Compute IDF with smoothing
  for (const [term, freq] of docFreq) {
    idf.set(term, Math.log((totalDocs + 1) / (freq + 1)) + 1);
  }

  return idf;
}

/**
 * TF-IDF Vectorizer class
 * Fits on a corpus and transforms documents to vectors
 * Follows sklearn TfidfVectorizer API pattern
 */
export class TfIdfVectorizer {
  private idf: Map<string, number> = new Map();
  private vocabulary: Set<string> = new Set();
  private fitted = false;

  /**
   * Fit the vectorizer on a corpus of books
   * Builds vocabulary and computes IDF values
   */
  fit(books: BookDocument[]): void {
    const documents = books.map(book =>
      tokenize(bookToText(book))
    );

    // Build vocabulary
    for (const tokens of documents) {
      for (const token of tokens) {
        this.vocabulary.add(token);
      }
    }

    // Compute IDF
    this.idf = computeIdf(documents);
    this.fitted = true;
  }

  /**
   * Transform a book to a TF-IDF vector
   * Must call fit() first
   */
  transform(book: BookDocument): TfIdfVector {
    if (!this.fitted) {
      throw new Error('Vectorizer must be fitted before transform');
    }

    const tokens = tokenize(bookToText(book));
    const tf = computeTf(tokens);
    const vector: TfIdfVector = {};

    for (const [term, tfValue] of tf) {
      const idfValue = this.idf.get(term) || 0;
      if (idfValue > 0) {
        vector[term] = tfValue * idfValue;
      }
    }

    return vector;
  }

  /**
   * Fit and transform in one step
   * Returns a Map of book ID to TF-IDF vector
   */
  fitTransform(books: BookDocument[]): Map<string, TfIdfVector> {
    this.fit(books);

    const vectors = new Map<string, TfIdfVector>();
    for (const book of books) {
      vectors.set(book.id, this.transform(book));
    }

    return vectors;
  }

  /**
   * Get vocabulary size (for debugging/testing)
   */
  get vocabularySize(): number {
    return this.vocabulary.size;
  }

  /**
   * Check if vectorizer has been fitted
   */
  get isFitted(): boolean {
    return this.fitted;
  }
}
