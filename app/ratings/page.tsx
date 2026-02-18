"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { useSession } from "next-auth/react"
import { StarRating } from "@/components/star-rating"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Loader2,
  Star,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Library,
} from "lucide-react"

interface RatingWithBook {
  id: string
  workId: string
  rating: number
  ratedAt: string
  source: string
  notes: string | null
  book: {
    id: string
    isbn13: string | null
    title: string
    authors: string[]
    coverUrl: string | null
  } | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

type SortOption = "ratedAt:desc" | "ratedAt:asc" | "rating:desc" | "rating:asc"

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "ratedAt:desc", label: "Most Recent" },
  { value: "ratedAt:asc", label: "Oldest First" },
  { value: "rating:desc", label: "Highest Rated" },
  { value: "rating:asc", label: "Lowest Rated" },
]

export default function RatingsPage() {
  const { status } = useSession()

  const [ratings, setRatings] = useState<RatingWithBook[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sort, setSort] = useState<SortOption>("ratedAt:desc")
  const [page, setPage] = useState(1)
  const limit = 20

  const [deleteTarget, setDeleteTarget] = useState<RatingWithBook | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchRatings = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sort,
      })

      const res = await fetch(`/api/ratings?${params}`)

      if (res.status === 401) {
        setError("Please sign in to view your ratings")
        return
      }

      if (!res.ok) {
        setError("Failed to load ratings")
        return
      }

      const data = await res.json()
      setRatings(data.ratings)
      setPagination(data.pagination)
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }, [page, sort])

  useEffect(() => {
    if (status !== "loading") {
      fetchRatings()
    }
  }, [status, fetchRatings])

  const handleDelete = async () => {
    if (!deleteTarget) return

    setIsDeleting(true)

    try {
      const res = await fetch(`/api/ratings/${deleteTarget.id}`, {
        method: "DELETE",
      })

      if (res.ok) {
        // Remove from local state
        setRatings((prev) => prev.filter((r) => r.id !== deleteTarget.id))
        // Update pagination total
        if (pagination) {
          setPagination({
            ...pagination,
            total: pagination.total - 1,
          })
        }
      }
    } catch {
      // Silent fail, could add toast notification
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
  }

  const handleSortChange = (value: SortOption) => {
    setSort(value)
    setPage(1) // Reset to first page on sort change
  }

  // Loading state
  if (isLoading && ratings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-24">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading your ratings...</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-24 text-center">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={fetchRatings}>
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">
            My Ratings
          </h1>
          {pagination && (
            <p className="mt-1 text-muted-foreground">
              {pagination.total} {pagination.total === 1 ? "work" : "works"} rated
            </p>
          )}
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Library className="h-3 w-3" />
            Ratings apply to all editions of each work
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={sort} onValueChange={handleSortChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Empty State */}
      {ratings.length === 0 && !isLoading && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <Star className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="font-serif text-xl font-semibold text-foreground">
            No ratings yet
          </h2>
          <p className="max-w-md text-muted-foreground">
            Start rating books to track your reading preferences and get better
            predictions.
          </p>
          <Button asChild>
            <Link href="/search">Find Books to Rate</Link>
          </Button>
        </div>
      )}

      {/* Ratings List */}
      {ratings.length > 0 && (
        <div className="space-y-4">
          {ratings.map((item) => {
            const book = item.book
            const bookUrl = book?.isbn13 ? `/book/${book.isbn13}` : book?.id ? `/book/${book.id}` : "#"
            const title = book?.title ?? "Unknown Book"
            const authors = book?.authors?.join(", ") ?? "Unknown Author"
            const coverUrl = book?.coverUrl || "/placeholder.svg"

            return (
              <div
                key={item.id}
                className="flex gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/5"
              >
                {/* Cover */}
                <Link
                  href={bookUrl}
                  className="relative h-24 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted"
                >
                  <Image
                    src={coverUrl}
                    alt={`Cover of ${title}`}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                </Link>

                {/* Info */}
                <div className="flex flex-1 flex-col">
                  <Link
                    href={bookUrl}
                    className="font-serif text-lg font-semibold text-foreground hover:text-primary"
                  >
                    {title}
                  </Link>
                  <p className="text-sm text-muted-foreground">{authors}</p>

                  <div className="mt-2 flex items-center gap-3">
                    <StarRating rating={item.rating} size="sm" showValue />
                  </div>

                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {new Date(item.ratedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-start">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(item)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete rating</span>
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <span className="px-4 text-sm text-muted-foreground">
            Page {page} of {pagination.totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages || isLoading}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rating</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete your rating for{" "}
              <span className="font-medium">{deleteTarget?.book?.title ?? "this book"}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
