"use client"

import { use, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { getBookByIsbn, generatePrediction } from "@/lib/mock-data"
import type { Prediction } from "@/lib/types"
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
} from "lucide-react"

export default function BookDetailPage({
  params,
}: {
  params: Promise<{ isbn: string }>
}) {
  const { isbn } = use(params)
  const book = getBookByIsbn(isbn)
  const { data: session } = useSession()
  const user = session?.user
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [isPredicting, setIsPredicting] = useState(false)
  const [insufficientData, setInsufficientData] = useState(false)

  const handlePredict = async () => {
    if (!book) return

    setIsPredicting(true)
    // Simulate computation
    await new Promise((resolve) => setTimeout(resolve, 1500))

    if (!user) {
      setInsufficientData(true)
      setIsPredicting(false)
      return
    }

    setPrediction(generatePrediction(book))
    setIsPredicting(false)
  }

  if (!book) {
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
              ISBN: {book.isbn}
            </Badge>
            {book.publishedDate && (
              <Badge variant="outline" className="text-xs">
                {book.publishedDate}
              </Badge>
            )}
            {book.pageCount && (
              <Badge variant="outline" className="text-xs">
                {book.pageCount} pages
              </Badge>
            )}
          </div>

          {book.description && (
            <p className="mt-6 leading-relaxed text-muted-foreground">
              {book.description}
            </p>
          )}

          {/* Predict Button */}
          {!prediction && !insufficientData && (
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
        </div>
      </div>

      {/* Prediction Results */}
      {prediction && (
        <div className="mt-12 rounded-xl border border-primary/20 bg-card p-6 shadow-sm md:p-8">
          <div className="mb-6 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-xl font-semibold text-foreground">
              Your Predicted Rating
            </h2>
          </div>

          <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
            {/* Rating Display */}
            <div className="flex flex-col items-center gap-2 md:items-start">
              <div className="text-5xl font-bold tabular-nums text-foreground">
                {prediction.rating.toFixed(1)}
              </div>
              <StarRating rating={prediction.rating} size="lg" />
              <span className="text-sm text-muted-foreground">out of 5</span>
            </div>

            {/* Confidence + Rationale */}
            <div className="flex-1">
              {/* Confidence Bar */}
              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    Confidence
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-primary">
                    {prediction.confidence}%
                  </span>
                </div>
                <Progress value={prediction.confidence} className="h-2.5" />
              </div>

              {/* Rationale */}
              <div>
                <h3 className="mb-3 text-sm font-medium text-foreground">
                  Why this prediction?
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {prediction.rationale.map((reason, i) => (
                    <li key={i} className="flex gap-2.5 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed text-muted-foreground">
                        {reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Insufficient Data Warning */}
      {insufficientData && (
        <div className="mt-12 rounded-xl border border-warning/30 bg-warning/5 p-6 md:p-8">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-warning" />
            <div>
              <h3 className="font-serif text-lg font-semibold text-foreground">
                Insufficient Data
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                We need more reading history to make an accurate prediction.
                Please sign in and import your reading data first.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button size="sm" asChild>
                  <Link href="/login">Sign In</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/import">Import CSV</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
