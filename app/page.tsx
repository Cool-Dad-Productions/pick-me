import React from "react"
import Link from "next/link"
import { BookOpen, Search, Upload, Star } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center px-4 pb-20 pt-16 text-center md:pt-24">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4 text-primary" />
          Your personal book rating predictor
        </div>
        <h1 className="max-w-3xl font-serif text-4xl font-bold leading-tight tracking-tight text-foreground md:text-6xl md:leading-tight">
          <span className="text-balance">
            Know how much you{"'"}ll love a book before you read it
          </span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          <span className="text-pretty">
            Pick Me analyzes your reading history to predict your personal rating
            for any book. No more guessing -- just smarter reading choices.
          </span>
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button size="lg" asChild>
            <Link href="/search" className="gap-2">
              <Search className="h-5 w-5" />
              Search Books
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login" className="gap-2">
              Get Started
            </Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-card px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center font-serif text-2xl font-semibold text-foreground md:text-3xl">
            How it works
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            <FeatureCard
              icon={<Upload className="h-6 w-6" />}
              title="Import Your History"
              description="Upload a CSV of your past ratings. We use your preferences to build a taste profile unique to you."
            />
            <FeatureCard
              icon={<Search className="h-6 w-6" />}
              title="Search Any Book"
              description="Find books by title, author, or ISBN. Our database has millions of titles waiting for your discovery."
            />
            <FeatureCard
              icon={<Star className="h-6 w-6" />}
              title="Get Your Prediction"
              description="See a personalized rating prediction with confidence scores and explanations before you commit."
            />
          </div>
        </div>
      </section>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border bg-background p-8 text-center transition-shadow hover:shadow-md">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mb-2 font-serif text-lg font-semibold text-foreground">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  )
}
