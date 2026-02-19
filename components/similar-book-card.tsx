"use client"

import Link from "next/link"
import { BookOpen, ExternalLink } from "lucide-react"
import { StarRating } from "@/components/star-rating"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface SimilarBook {
  id: string
  isbn13?: string | null
  title: string
  authors: string[]
  yourRating: number
  similarityPercent: number
  matchingTerms: string[]
}

interface SimilarBookCardProps {
  book: SimilarBook
  isLowConfidence?: boolean
  className?: string
}

/** Maximum matching terms to display before showing "+N more" */
const MAX_VISIBLE_TERMS = 3

/**
 * Format a matching term for display
 * Converts snake_case to Title Case
 */
function formatMatchingTerm(term: string): string {
  return term
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function SimilarBookCard({
  book,
  isLowConfidence = false,
  className,
}: SimilarBookCardProps) {
  const visibleTerms = book.matchingTerms.slice(0, MAX_VISIBLE_TERMS)
  const hiddenCount = book.matchingTerms.length - MAX_VISIBLE_TERMS
  const hasMatchingTerms = book.matchingTerms.length > 0
  const hasLink = !!book.isbn13

  const cardContent = (
    <>
      {/* Title row with icon, title, stars, and percentage */}
      <div className="flex items-start gap-3">
        <BookOpen
          className={cn(
            "mt-0.5 h-5 w-5 flex-shrink-0",
            isLowConfidence ? "text-warning" : "text-primary"
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          {/* Title - truncated with ellipsis */}
          <h4
            className={cn(
              "line-clamp-1 font-medium text-foreground",
              hasLink && "group-hover:text-primary"
            )}
            title={book.title}
          >
            {book.title}
            {hasLink && (
              <ExternalLink className="ml-1 inline h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </h4>

          {/* Rating and similarity */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-1.5">
              <StarRating rating={book.yourRating} size="sm" />
              <span className="text-sm tabular-nums text-muted-foreground">
                ({book.similarityPercent}% match)
              </span>
            </div>
          </div>

          {/* Matching terms as badges */}
          {hasMatchingTerms && (
            <div
              className="mt-2 flex flex-wrap gap-1.5"
              aria-label={`Matching subjects: ${book.matchingTerms.map(formatMatchingTerm).join(", ")}`}
            >
              {visibleTerms.map((term) => (
                <Badge
                  key={term}
                  variant="secondary"
                  className="text-xs font-normal"
                >
                  {formatMatchingTerm(term)}
                </Badge>
              ))}
              {hiddenCount > 0 && (
                <Badge variant="outline" className="text-xs font-normal">
                  +{hiddenCount} more
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )

  const cardClasses = cn(
    "rounded-lg border bg-card p-4 transition-colors",
    isLowConfidence
      ? "border-warning/30 bg-warning/5"
      : "border-border hover:border-primary/20",
    hasLink && "group cursor-pointer hover:shadow-sm",
    className
  )

  if (hasLink) {
    return (
      <Link href={`/book/${book.isbn13}`} className={cn(cardClasses, "block")}>
        {cardContent}
      </Link>
    )
  }

  return <div className={cardClasses}>{cardContent}</div>
}
