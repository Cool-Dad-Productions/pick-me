"use client"

import Link from "next/link"
import type { PredictionResult } from "@/types"
import { StarRating } from "@/components/star-rating"
import { ConfidenceIndicator } from "@/components/confidence-indicator"
import { SimilarBooksSection } from "@/components/similar-books-section"
import type { SimilarBook } from "@/components/similar-book-card"
import { Button } from "@/components/ui/button"
import {
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface PredictionDisplayProps {
  prediction: PredictionResult
  className?: string
}

/** Low confidence threshold matching the predictor logic */
const LOW_CONFIDENCE_THRESHOLD = 0.3

/**
 * Extract similar books from prediction rationale
 */
function extractSimilarBooks(prediction: PredictionResult): SimilarBook[] {
  const rationale = prediction.rationale.find(
    (r) => r.type === "similar_books" || r.type === "low_confidence"
  )

  if (!rationale?.data?.similarBooks) {
    return []
  }

  return rationale.data.similarBooks as SimilarBook[]
}

/**
 * Check if prediction has a specific rationale type
 */
function hasRationaleType(
  prediction: PredictionResult,
  type: string
): boolean {
  return prediction.rationale.some((r) => r.type === type)
}

export function PredictionDisplay({
  prediction,
  className,
}: PredictionDisplayProps) {
  const hasRating = prediction.predictedRating !== null
  const existingRating = hasRationaleType(prediction, "existing_rating")
  const insufficientData = hasRationaleType(prediction, "insufficient_data")
  const noSimilarBooks = hasRationaleType(prediction, "no_similar_books")
  const isLowConfidence =
    hasRationaleType(prediction, "low_confidence") ||
    (prediction.confidence !== null &&
      prediction.confidence < LOW_CONFIDENCE_THRESHOLD)

  const similarBooks = extractSimilarBooks(prediction)

  // Insufficient Data - special case with import CTA
  if (insufficientData) {
    const message =
      prediction.rationale.find((r) => r.type === "insufficient_data")
        ?.message ||
      "We need more reading history to make an accurate prediction."

    return (
      <div
        className={cn(
          "rounded-xl border border-warning/30 bg-warning/5 p-6 md:p-8",
          className
        )}
      >
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-warning" />
          <div>
            <h3 className="font-serif text-lg font-semibold text-foreground">
              Insufficient Data
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {message}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button size="sm" variant="outline" asChild>
                <Link href="/import">Import CSV</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // No Similar Books Found
  if (noSimilarBooks) {
    const message =
      prediction.rationale.find((r) => r.type === "no_similar_books")
        ?.message ||
      "Could not find similar books in your library to make a prediction."

    return (
      <div
        className={cn(
          "rounded-xl border border-border bg-muted/30 p-6 md:p-8",
          className
        )}
      >
        <div className="flex gap-3">
          <Info className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
          <div>
            <h3 className="font-serif text-lg font-semibold text-foreground">
              No Similar Books Found
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {message}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Try adding more books to your library, especially in similar
              genres.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Has a rating to display (existing or predicted)
  if (hasRating) {
    return (
      <div
        className={cn(
          "rounded-xl border bg-card p-6 shadow-sm md:p-8",
          isLowConfidence ? "border-warning/30" : "border-primary/20",
          className
        )}
      >
        {/* Header */}
        <div className="mb-6 flex items-center gap-2">
          {isLowConfidence ? (
            <AlertTriangle className="h-5 w-5 text-warning" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-primary" />
          )}
          <h2 className="font-serif text-xl font-semibold text-foreground">
            {existingRating ? "Your Rating" : "Your Predicted Rating"}
          </h2>
        </div>

        <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
          {/* Rating Display */}
          <div className="flex flex-col items-center gap-2 md:items-start">
            <div
              className={cn(
                "text-5xl font-bold tabular-nums",
                isLowConfidence ? "text-warning" : "text-foreground"
              )}
            >
              {prediction.predictedRating!.toFixed(1)}
            </div>
            <StarRating rating={prediction.predictedRating!} size="lg" />
            <span className="text-sm text-muted-foreground">out of 5</span>
          </div>

          {/* Confidence + Rationale */}
          <div className="flex-1">
            {/* Confidence Bar - only show for predictions, not existing ratings */}
            {prediction.confidence !== null && !existingRating && (
              <ConfidenceIndicator
                confidence={prediction.confidence}
                className="mb-6"
              />
            )}

            {/* Low confidence warning */}
            {isLowConfidence && !existingRating && (
              <div className="mb-4 flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-warning" />
                <p className="text-sm text-warning">
                  This prediction is based on loosely similar books. Take it
                  with a grain of salt!
                </p>
              </div>
            )}

            {/* Existing rating note */}
            {existingRating && (
              <p className="text-sm text-muted-foreground">
                You have already rated this book.
              </p>
            )}

            {/* Similar books section */}
            {!existingRating && similarBooks.length > 0 && (
              <SimilarBooksSection
                similarBooks={similarBooks}
                isLowConfidence={isLowConfidence}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  // Fallback - shouldn't normally reach here
  return null
}
