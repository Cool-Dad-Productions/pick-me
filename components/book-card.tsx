"use client"

import Link from "next/link"
import Image from "next/image"
import type { Book } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Star } from "lucide-react"

interface BookCardProps {
  book: Book
  userRating?: number | null
}

export function BookCard({ book, userRating }: BookCardProps) {
  return (
    <Link
      href={`/book/${book.isbn}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-lg"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        <Image
          src={book.coverUrl || "/placeholder.svg"}
          alt={`Cover of ${book.title}`}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />
        {/* Rated indicator badge */}
        {userRating != null && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-primary/90 px-2 py-1 text-xs font-medium text-primary-foreground shadow-md">
            <Star className="h-3 w-3 fill-current" />
            {userRating.toFixed(1)}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 font-serif text-base font-semibold leading-snug text-foreground group-hover:text-primary">
          {book.title}
        </h3>
        <p className="text-sm text-muted-foreground">
          {book.authors.join(", ")}
        </p>
        <div className="mt-auto pt-2">
          <Badge variant="secondary" className="text-xs font-mono">
            {book.isbn}
          </Badge>
        </div>
      </div>
    </Link>
  )
}
