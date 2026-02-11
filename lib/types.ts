export interface Book {
  isbn: string
  title: string
  authors: string[]
  coverUrl: string
  publishedDate?: string
  pageCount?: number
  description?: string
}

export interface Prediction {
  rating: number
  confidence: number
  rationale: string[]
}

export interface ImportStats {
  total: number
  imported: number
  skipped: number
  errors: number
}

export interface ColumnMapping {
  title: string
  author: string
  rating: string
  isbn?: string
  date?: string
}
