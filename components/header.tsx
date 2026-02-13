"use client"

import Link from "next/link"
import { useSession, signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { BookOpen, Search, Upload, Star, LogOut, Menu, X } from "lucide-react"
import { useState } from "react"

export function Header() {
  const { data: session } = useSession()
  const user = session?.user
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <BookOpen className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-serif text-xl font-bold tracking-tight text-foreground">
            Pick Me
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 md:flex">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/search" className="gap-2">
              <Search className="h-4 w-4" />
              Search
            </Link>
          </Button>
          {user && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/import" className="gap-2">
                  <Upload className="h-4 w-4" />
                  Import
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/ratings" className="gap-2">
                  <Star className="h-4 w-4" />
                  My Ratings
                </Link>
              </Button>
            </>
          )}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <span className="text-sm text-muted-foreground">
                {user.email}
              </span>
              <Button variant="ghost" size="sm" onClick={() => signOut()} className="gap-2">
                <LogOut className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only">Sign Out</span>
              </Button>
            </>
          ) : (
            <Button size="sm" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="border-t border-border bg-background px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col gap-1">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="justify-start"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Link href="/search" className="gap-2">
                <Search className="h-4 w-4" />
                Search
              </Link>
            </Button>
            {user && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="justify-start"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Link href="/import" className="gap-2">
                    <Upload className="h-4 w-4" />
                    Import
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="justify-start"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Link href="/ratings" className="gap-2">
                    <Star className="h-4 w-4" />
                    My Ratings
                  </Link>
                </Button>
              </>
            )}
          </nav>
          <div className="mt-3 border-t border-border pt-3">
            {user ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {user.email}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    signOut()
                    setMobileMenuOpen(false)
                  }}
                  className="gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            ) : (
              <Button size="sm" asChild className="w-full">
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
