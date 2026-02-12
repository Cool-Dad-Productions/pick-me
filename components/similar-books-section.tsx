"use client"

import { SimilarBookCard, type SimilarBook } from "@/components/similar-book-card"
import { cn } from "@/lib/utils"

interface SimilarBooksSectionProps {
  similarBooks: SimilarBook[]
  isLowConfidence?: boolean
  className?: string
}

export function SimilarBooksSection({
  similarBooks,
  isLowConfidence = false,
  className,
}: SimilarBooksSectionProps) {
  if (similarBooks.length === 0) {
    return null
  }

  return (
    <div className={cn("mt-6", className)}>
      <h3 className="mb-3 text-sm font-medium text-foreground">
        {isLowConfidence
          ? "Based on what we found:"
          : "Based on similar books you've rated:"}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {similarBooks.map((book) => (
          <SimilarBookCard
            key={book.id}
            book={book}
            isLowConfidence={isLowConfidence}
          />
        ))}
      </div>
    </div>
  )
}
