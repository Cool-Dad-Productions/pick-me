"use client"

import React from "react"

import { useState, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { BookCard } from "@/components/book-card"
import type { Book } from "@/lib/types"
import { Search, Hash, Loader2, BookX, AlertCircle } from "lucide-react"

// API response types
interface BookCandidate {
  externalId: string
  title: string
  authors: string[]
  isbn13?: string
  coverUrl?: string
}

interface ApiBook {
  id: string
  isbn13: string
  title: string
  authors: string[]
  coverUrl?: string
}

export default function SearchPage() {
  const [mode, setMode] = useState<"title" | "isbn">("title")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Book[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!query.trim()) return

      setIsSearching(true)
      setHasSearched(true)
      setError(null)

      try {
        if (mode === "isbn") {
          const res = await fetch(`/api/books/isbn/${encodeURIComponent(query.trim())}`)

          if (res.status === 401) {
            setError("Please sign in to search for books")
            setResults([])
            return
          }

          if (res.status === 400) {
            setError("Invalid ISBN format. Please check and try again.")
            setResults([])
            return
          }

          if (res.status === 404) {
            setResults([])
            return
          }

          if (!res.ok) {
            setError("Something went wrong. Please try again.")
            setResults([])
            return
          }

          const { book } = await res.json() as { book: ApiBook }
          setResults([{
            isbn: book.isbn13,
            title: book.title,
            authors: book.authors,
            coverUrl: book.coverUrl || "",
          }])
        } else {
          const res = await fetch(`/api/books/search?q=${encodeURIComponent(query.trim())}`)

          if (res.status === 401) {
            setError("Please sign in to search for books")
            setResults([])
            return
          }

          if (!res.ok) {
            setError("Something went wrong. Please try again.")
            setResults([])
            return
          }

          const { results: candidates } = await res.json() as { results: BookCandidate[] }

          // Filter to only books with ISBN and transform to Book type
          const books: Book[] = candidates
            .filter((c) => c.isbn13)
            .map((c) => ({
              isbn: c.isbn13!,
              title: c.title,
              authors: c.authors,
              coverUrl: c.coverUrl || "",
            }))

          setResults(books)
        }
      } catch {
        setError("Network error. Please check your connection and try again.")
        setResults([])
      } finally {
        setIsSearching(false)
      }
    },
    [query, mode]
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
      <div className="mb-10 text-center">
        <h1 className="font-serif text-3xl font-bold text-foreground md:text-4xl">
          Find Your Next Read
        </h1>
        <p className="mt-3 text-muted-foreground">
          Search by title, author, or ISBN to discover your predicted rating
        </p>
      </div>

      <div className="mx-auto max-w-2xl">
        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as "title" | "isbn")
            setQuery("")
            setResults([])
            setHasSearched(false)
            setError(null)
          }}
        >
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="title" className="flex-1 gap-2">
              <Search className="h-4 w-4" />
              Title / Author
            </TabsTrigger>
            <TabsTrigger value="isbn" className="flex-1 gap-2">
              <Hash className="h-4 w-4" />
              ISBN
            </TabsTrigger>
          </TabsList>

          <TabsContent value="title">
            <form onSubmit={handleSearch} className="flex gap-3">
              <Input
                placeholder="Search by title or author..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={isSearching || !query.trim()}>
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="sr-only sm:not-sr-only sm:ml-2">Search</span>
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="isbn">
            <form onSubmit={handleSearch} className="flex gap-3">
              <Input
                placeholder="Enter ISBN-10 or ISBN-13..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 font-mono"
              />
              <Button type="submit" disabled={isSearching || !query.trim()}>
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="sr-only sm:not-sr-only sm:ml-2">Look Up</span>
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>

      {/* Results */}
      <div className="mt-12">
        {isSearching && (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p>Searching books...</p>
          </div>
        )}

        {!isSearching && error && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-foreground">
              Search Error
            </h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              {error}
            </p>
          </div>
        )}

        {!isSearching && !error && hasSearched && results.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <BookX className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-foreground">
              No books found
            </h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Try a different search term or check the ISBN format. We support
              both ISBN-10 and ISBN-13.
            </p>
          </div>
        )}

        {!isSearching && !error && results.length > 0 && (
          <>
            <p className="mb-6 text-sm text-muted-foreground">
              {results.length} {results.length === 1 ? "result" : "results"}{" "}
              found
            </p>
            <div className="grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {results.map((book) => (
                <BookCard key={book.isbn} book={book} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
