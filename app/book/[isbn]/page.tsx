"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSession } from "next-auth/react"
import type { PredictionResult } from "@/types"
import { PredictionDisplay } from "@/components/prediction-display"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  BookX,
  AlertCircle,
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

      {/* Prediction Results */}
      {prediction && <PredictionDisplay prediction={prediction} className="mt-12" />}
    </div>
  )
}
