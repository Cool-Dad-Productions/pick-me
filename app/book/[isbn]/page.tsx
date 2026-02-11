"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSession } from "next-auth/react"
import type { PredictionResult } from "@/types"
import { StarRating } from "@/components/star-rating"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  BookX,
  CheckCircle2,
  AlertCircle,
  Info,
} from "lucide-react"

// API book type
interface ApiBook {
  id: string
  isbn13: string
  title: string
  authors: string[]
  coverUrl?: string
}

export default function BookDetailPage({
  params,
}: {
  params: { isbn: string }
}) {
  const { isbn } = params
  const { status } = useSession()

  const [book, setBook] = useState<ApiBook | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [prediction, setPrediction] = useState<PredictionResult | null>(null)
  const [isPredicting, setIsPredicting] = useState(false)
  const [predictionError, setPredictionError] = useState<string | null>(null)

  // Fetch book data on mount
  useEffect(() => {
    async function fetchBook() {
      setIsLoading(true)
      setError(null)
      setNotFound(false)

      try {
        const res = await fetch(`/api/books/isbn/${encodeURIComponent(isbn)}`)

        if (res.status === 401) {
          setError("Please sign in to view book details")
          return
        }

        if (res.status === 400) {
          setError("Invalid ISBN format")
          return
        }

        if (res.status === 404) {
          setNotFound(true)
          return
        }

        if (!res.ok) {
          setError("Failed to load book details")
          return
        }

        const { book: bookData } = (await res.json()) as { book: ApiBook }
        setBook(bookData)
      } catch {
        setError("Network error. Please try again.")
      } finally {
        setIsLoading(false)
      }
    }

    if (status !== "loading") {
      fetchBook()
    }
  }, [isbn, status])

  const handlePredict = async () => {
    if (!book) return

    setIsPredicting(true)
    setPredictionError(null)

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: book.id }),
      })

      if (res.status === 401) {
        setPredictionError("Please sign in to get predictions")
        return
      }

      if (!res.ok) {
        setPredictionError("Failed to generate prediction")
        return
      }

      const result = (await res.json()) as PredictionResult
      setPrediction(result)
    } catch {
      setPredictionError("Network error. Please try again.")
    } finally {
      setIsPredicting(false)
    }
  }

  // Loading state
  if (isLoading || status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-24">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading book details...</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-24 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Error</h1>
        <p className="max-w-md text-muted-foreground">{error}</p>
        <Button variant="outline" asChild>
          <Link href="/search" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Search
          </Link>
        </Button>
      </div>
    )
  }

  // Not found state
  if (notFound || !book) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-24 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <BookX className="h-10 w-10 text-muted-foreground" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-foreground">
          Book Not Found
        </h1>
        <p className="max-w-md text-muted-foreground">
          We couldn{"'"}t find a book with ISBN {isbn}. It may not be in our
          database yet.
        </p>
        <Button variant="outline" asChild>
          <Link href="/search" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Search
          </Link>
        </Button>
      </div>
    )
  }

  // Check prediction state
  const hasRating = prediction?.predictedRating !== null
  const insufficientData = prediction?.rationale.some(
    (r) => r.type === "insufficient_data"
  )
  const notImplemented = prediction?.rationale.some(
    (r) => r.type === "not_implemented"
  )
  const existingRating = prediction?.rationale.some(
    (r) => r.type === "existing_rating"
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <Button variant="ghost" size="sm" asChild className="mb-8">
        <Link href="/search" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Search
        </Link>
      </Button>

      {/* Hero Section */}
      <div className="flex flex-col gap-8 md:flex-row md:gap-12">
        {/* Cover */}
        <div className="mx-auto w-full max-w-[280px] flex-shrink-0 md:mx-0 md:max-w-[240px]">
          <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border shadow-lg">
            <Image
              src={book.coverUrl || "/placeholder.svg"}
              alt={`Cover of ${book.title}`}
              fill
              className="object-cover"
              sizes="280px"
              priority
            />
          </div>
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col">
          <h1 className="font-serif text-3xl font-bold leading-tight text-foreground md:text-4xl">
            {book.title}
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            {book.authors.join(", ")}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">
              ISBN: {book.isbn13}
            </Badge>
          </div>

          {/* Predict Button */}
          {!prediction && !predictionError && (
            <Button
              size="lg"
              onClick={handlePredict}
              disabled={isPredicting}
              className="mt-8 w-full gap-2 md:w-auto"
            >
              {isPredicting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Analyzing your taste...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  Predict My Rating
                </>
              )}
            </Button>
          )}

          {/* Prediction Error */}
          {predictionError && (
            <div className="mt-8 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{predictionError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Prediction Results - with actual rating */}
      {prediction && hasRating && (
        <div className="mt-12 rounded-xl border border-primary/20 bg-card p-6 shadow-sm md:p-8">
          <div className="mb-6 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-xl font-semibold text-foreground">
              {existingRating ? "Your Rating" : "Your Predicted Rating"}
            </h2>
          </div>

          <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
            {/* Rating Display */}
            <div className="flex flex-col items-center gap-2 md:items-start">
              <div className="text-5xl font-bold tabular-nums text-foreground">
                {prediction.predictedRating!.toFixed(1)}
              </div>
              <StarRating rating={prediction.predictedRating!} size="lg" />
              <span className="text-sm text-muted-foreground">out of 5</span>
            </div>

            {/* Confidence + Rationale */}
            <div className="flex-1">
              {/* Confidence Bar */}
              {prediction.confidence !== null && (
                <div className="mb-6">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      Confidence
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-primary">
                      {Math.round(prediction.confidence * 100)}%
                    </span>
                  </div>
                  <Progress
                    value={prediction.confidence * 100}
                    className="h-2.5"
                  />
                </div>
              )}

              {/* Rationale */}
              {prediction.rationale.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-medium text-foreground">
                    {existingRating ? "Note" : "Why this prediction?"}
                  </h3>
                  <ul className="flex flex-col gap-2.5">
                    {prediction.rationale.map((item, i) => (
                      <li key={i} className="flex gap-2.5 text-sm">
                        <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed text-muted-foreground">
                          {item.message || item.type}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Insufficient Data Warning */}
      {prediction && insufficientData && (
        <div className="mt-12 rounded-xl border border-warning/30 bg-warning/5 p-6 md:p-8">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-warning" />
            <div>
              <h3 className="font-serif text-lg font-semibold text-foreground">
                Insufficient Data
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {prediction.rationale.find((r) => r.type === "insufficient_data")
                  ?.message ||
                  "We need more reading history to make an accurate prediction."}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button size="sm" variant="outline" asChild>
                  <Link href="/import">Import CSV</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Not Implemented Info */}
      {prediction && notImplemented && (
        <div className="mt-12 rounded-xl border border-border bg-muted/30 p-6 md:p-8">
          <div className="flex gap-3">
            <Info className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            <div>
              <h3 className="font-serif text-lg font-semibold text-foreground">
                Coming Soon
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {prediction.rationale.find((r) => r.type === "not_implemented")
                  ?.message ||
                  "The prediction algorithm is still being developed."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
