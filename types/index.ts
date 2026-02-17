export interface BookCandidate {
  externalId: string;
  title: string;
  authors: string[];
  isbn13?: string;
  coverUrl?: string;
}

export interface NormalizedBook {
  isbn13?: string;
  title: string;
  authors: string[];
  subjects: string[];
  coverUrl?: string;
  metadata?: unknown;
  openLibraryWorkId?: string;
  pageCount?: number;
  publicationYear?: number;
  genres?: string[];
}

export interface PredictionResult {
  predictedRating: number | null;
  confidence: number | null;
  rationale: PredictionRationale[];
}

export interface PredictionRationale {
  type: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface ImportPreview {
  batchId: string;
  filename?: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export interface ColumnMapping {
  title: string;
  author: string;
  rating: string;
  isbn?: string;
  date?: string;
}

export interface ImportStats {
  total: number;
  imported: number;
  errors: number;
  skipped: number;
}
