"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSession } from "next-auth/react"
import type { PredictionResult } from "@/types"
import { PredictionDisplay } from "@/components/prediction-display"
import { RatingInput } from "@/components/rating-input"
import { StarRating } from "@/components/star-rating"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  BookX,
  AlertCircle,
  Calendar,
  Pencil,
  Library,
  ChevronDown,
  Database,
  RefreshCw,
  ExternalLink,
  BookOpen,
  Tag,
  Hash,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

// API book type with all enriched fields
interface ApiBook {
  id: string
  isbn13: string
  title: string
  authors: string[]
  coverUrl?: string
  openLibraryWorkId?: string
  workId?: string // Included in API response
  // Enriched data fields
  googleBooksVolumeId?: string
  subjects?: string[]
  genres?: string[]
  tags?: string[]
  pageCount?: number
  publicationYear?: number
  lastEnrichedAt?: string
}

// User rating type (from API response after saving)
interface UserRatingData {
  id: string
  workId: string
  rating: number
  ratedAt: string
  source: string
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

  // Rating state
  const [userRating, setUserRating] = useState<UserRatingData | null>(null)
  const [isEditingRating, setIsEditingRating] = useState(false)
  const [isSavingRating, setIsSavingRating] = useState(false)
  const [ratingError, setRatingError] = useState<string | null>(null)

  // Enrichment state
  const [isEnrichmentOpen, setIsEnrichmentOpen] = useState(false)
  const [isRefreshingEnrichment, setIsRefreshingEnrichment] = useState(false)

  // Tags state
  const [tags, setTags] = useState<string[]>([])
  const [isEditingTags, setIsEditingTags] = useState(false)
  const [tagsInput, setTagsInput] = useState("")
  const [isSavingTags, setIsSavingTags] = useState(false)
  const [tagsError, setTagsError] = useState<string | null>(null)

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

        const { book: bookData, userRating: existingRating } = (await res.json()) as {
          book: ApiBook
          userRating: number | null
        }
        setBook(bookData)
        setTags(bookData.tags ?? [])

        // Set user's work-level rating if exists (returned from API)
        if (existingRating !== null) {
          setUserRating({
            id: "existing", // Will be updated on next save
            workId: bookData.workId ?? bookData.openLibraryWorkId ?? "",
            rating: existingRating,
            ratedAt: new Date().toISOString(), // Approximate, exact date not returned
            source: "existing",
          })
        }
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

  const handleRatingChange = useCallback(
    async (newRating: number) => {
      if (!book) return

      setIsSavingRating(true)
      setRatingError(null)

      // Optimistic update
      const previousRating = userRating
      setUserRating({
        id: userRating?.id ?? "temp",
        workId: userRating?.workId ?? book.workId ?? "temp",
        rating: newRating,
        ratedAt: new Date().toISOString(),
        source: "manual",
      })
      setIsEditingRating(false)

      try {
        const res = await fetch("/api/ratings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookId: book.id, rating: newRating }),
        })

        if (!res.ok) {
          throw new Error("Failed to save rating")
        }

        const { rating: savedRating } = await res.json()
        setUserRating(savedRating)

        // Clear prediction if showing, since we now have an actual rating
        if (prediction) {
          setPrediction(null)
        }
      } catch {
        // Revert on error
        setUserRating(previousRating)
        setRatingError("Failed to save rating. Please try again.")
      } finally {
        setIsSavingRating(false)
      }
    },
    [book, userRating, prediction]
  )

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

  const handleRefreshEnrichment = async () => {
    if (!book) return

    setIsRefreshingEnrichment(true)

    try {
      const res = await fetch("/api/books/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: book.id, force: true }),
      })

      if (!res.ok) {
        throw new Error("Failed to refresh enrichment")
      }

      // Re-fetch the book to get updated data
      const bookRes = await fetch(`/api/books/isbn/${encodeURIComponent(isbn)}`)
      if (bookRes.ok) {
        const { book: updatedBook } = await bookRes.json()
        setBook(updatedBook)
      }
    } catch {
      // Silently fail - user can try again
    } finally {
      setIsRefreshingEnrichment(false)
    }
  }

  const handleTagsSave = async () => {
    if (!book) return

    const parsed = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)

    setIsSavingTags(true)
    setTagsError(null)

    try {
      const res = await fetch(`/api/books/${book.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: parsed }),
      })

      if (!res.ok) {
        throw new Error("Failed to save tags")
      }

      const { tags: saved } = await res.json()
      setTags(saved)
      setIsEditingTags(false)

      // Clear prediction since tags now affect similarity scoring
      if (prediction) {
        setPrediction(null)
      }
    } catch {
      setTagsError("Failed to save tags. Please try again.")
    } finally {
      setIsSavingTags(false)
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
            {!!book.pageCount && (
              <Badge variant="outline" className="text-xs">
                {book.pageCount} pages
              </Badge>
            )}
            {book.publicationYear && (
              <Badge variant="outline" className="text-xs">
                {book.publicationYear}
              </Badge>
            )}
          </div>

          {/* Enriched Data Section */}
          <Collapsible
            open={isEnrichmentOpen}
            onOpenChange={setIsEnrichmentOpen}
            className="mt-4"
          >
            <div className="flex items-center gap-2">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  <Database className="h-4 w-4" />
                  Book Details
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${isEnrichmentOpen ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshEnrichment}
                disabled={isRefreshingEnrichment}
                className="gap-1.5 text-muted-foreground"
                title="Refresh enrichment data from external sources"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRefreshingEnrichment ? "animate-spin" : ""}`}
                />
                {isRefreshingEnrichment ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
            <CollapsibleContent className="mt-3">
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Open Library Work ID */}
                  {book.openLibraryWorkId && (
                    <div className="flex items-start gap-2">
                      <BookOpen className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-foreground">Open Library Work ID</p>
                        <a
                          href={`https://openlibrary.org/works/${book.openLibraryWorkId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {book.openLibraryWorkId}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Google Books Volume ID */}
                  {book.googleBooksVolumeId && (
                    <div className="flex items-start gap-2">
                      <Hash className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-foreground">Google Books Volume ID</p>
                        <a
                          href={`https://books.google.com/books?id=${book.googleBooksVolumeId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {book.googleBooksVolumeId}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  )}
                  {/* Page Count */}
                  {!!book.pageCount && (
                    <div className="flex items-start gap-2">
                      <BookOpen className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-foreground">Page Count</p>
                        <p className="text-muted-foreground">{book.pageCount} pages</p>
                        <p className="text-xs text-muted-foreground">Source: Google Books</p>
                      </div>
                    </div>
                  )}

                  {/* Publication Year */}
                  {book.publicationYear && (
                    <div className="flex items-start gap-2">
                      <Calendar className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-foreground">Publication Year</p>
                        <p className="text-muted-foreground">{book.publicationYear}</p>
                        <p className="text-xs text-muted-foreground">Source: Google Books</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Subjects */}
                {book.subjects && book.subjects.length > 0 && (
                  <div className="mt-4 border-t border-border pt-3">
                    <div className="flex items-start gap-2">
                      <Tag className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium text-foreground">Subjects</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {book.subjects.slice(0, 10).map((subject) => (
                            <Badge key={subject} variant="secondary" className="text-xs font-normal">
                              {subject}
                            </Badge>
                          ))}
                          {book.subjects.length > 10 && (
                            <Badge variant="outline" className="text-xs font-normal">
                              +{book.subjects.length - 10} more
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">Source: Open Library</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Genres */}
                {book.genres && book.genres.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="flex items-start gap-2">
                      <Tag className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium text-foreground">Genres</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {book.genres.map((genre) => (
                            <Badge key={genre} variant="secondary" className="text-xs font-normal">
                              {genre}
                            </Badge>
                          ))}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">Source: Google Books</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Last Enriched */}
                {book.lastEnrichedAt && (
                  <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                    Last updated:{" "}
                    {new Date(book.lastEnrichedAt).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* User Tags Section */}
          <div className="mt-6 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Community Tags</p>
              </div>
              {!isEditingTags && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTagsInput(tags.join(", "))
                    setIsEditingTags(true)
                  }}
                  className="gap-1.5"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              )}
            </div>

            {isEditingTags ? (
              <div className="mt-3 space-y-2">
                <Input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="slow burn, coming of age, unreliable narrator"
                  disabled={isSavingTags}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleTagsSave()
                    if (e.key === "Escape") setIsEditingTags(false)
                  }}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Separate tags with commas. Tags are shared across all editions of this work.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleTagsSave} disabled={isSavingTags}>
                    {isSavingTags ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsEditingTags(false)}
                    disabled={isSavingTags}
                  >
                    Cancel
                  </Button>
                </div>
                {tagsError && (
                  <p className="text-xs text-destructive">{tagsError}</p>
                )}
              </div>
            ) : tags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs font-normal">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No tags yet — click Edit to add some.
              </p>
            )}
          </div>

          {/* User Rating Section */}
          <div className="mt-8">
            {userRating && !isEditingRating ? (
              // Display existing rating
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Your Rating
                    </p>
                    <div className="mt-1 flex items-center gap-3">
                      <StarRating rating={userRating.rating} size="lg" showValue />
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      Rated on{" "}
                      {new Date(userRating.ratedAt).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {userRating.source === "import" && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Imported
                        </Badge>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingRating(true)}
                    className="gap-1.5"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                </div>
              </div>
            ) : (
              // Rating input (new or editing)
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm font-medium text-muted-foreground">
                  {userRating ? "Update your rating" : "Rate this book"}
                </p>
                <div className="mt-3 flex items-center gap-4">
                  <RatingInput
                    value={userRating?.rating ?? null}
                    onChange={handleRatingChange}
                    disabled={isSavingRating}
                    size="lg"
                  />
                  {isSavingRating && (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  )}
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Library className="h-3 w-3" />
                  This rating applies to all editions of this work
                </p>
                {isEditingRating && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingRating(false)}
                    className="mt-2"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            )}

            {/* Rating Error */}
            {ratingError && (
              <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm text-destructive">{ratingError}</p>
              </div>
            )}
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
