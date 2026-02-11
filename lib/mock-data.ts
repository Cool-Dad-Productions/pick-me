import type { Book, Prediction } from "./types"

export const mockBooks: Book[] = [
  {
    isbn: "9780061120084",
    title: "To Kill a Mockingbird",
    authors: ["Harper Lee"],
    coverUrl:
      "https://covers.openlibrary.org/b/isbn/9780061120084-L.jpg",
    publishedDate: "1960",
    pageCount: 281,
    description:
      "The unforgettable novel of a childhood in a sleepy Southern town and the crisis of conscience that rocked it.",
  },
  {
    isbn: "9780451524935",
    title: "1984",
    authors: ["George Orwell"],
    coverUrl:
      "https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg",
    publishedDate: "1949",
    pageCount: 328,
    description:
      "A dystopian social science fiction novel and cautionary tale about the dangers of totalitarianism.",
  },
  {
    isbn: "9780743273565",
    title: "The Great Gatsby",
    authors: ["F. Scott Fitzgerald"],
    coverUrl:
      "https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg",
    publishedDate: "1925",
    pageCount: 180,
    description:
      "A novel about the American Dream, told through the story of Jay Gatsby and his pursuit of Daisy Buchanan.",
  },
  {
    isbn: "9780316769488",
    title: "The Catcher in the Rye",
    authors: ["J.D. Salinger"],
    coverUrl:
      "https://covers.openlibrary.org/b/isbn/9780316769488-L.jpg",
    publishedDate: "1951",
    pageCount: 234,
    description:
      "The story of Holden Caulfield and his experiences in New York City after being expelled from prep school.",
  },
  {
    isbn: "9780141439518",
    title: "Pride and Prejudice",
    authors: ["Jane Austen"],
    coverUrl:
      "https://covers.openlibrary.org/b/isbn/9780141439518-L.jpg",
    publishedDate: "1813",
    pageCount: 432,
    description:
      "A romantic novel of manners that follows Elizabeth Bennet as she deals with issues of morality and education.",
  },
  {
    isbn: "9780547928227",
    title: "The Hobbit",
    authors: ["J.R.R. Tolkien"],
    coverUrl:
      "https://covers.openlibrary.org/b/isbn/9780547928227-L.jpg",
    publishedDate: "1937",
    pageCount: 366,
    description:
      "Bilbo Baggins is swept into a quest to reclaim the lost Dwarf Kingdom of Erebor from the fearsome dragon Smaug.",
  },
  {
    isbn: "9780060935467",
    title: "To Kill a Mockingbird",
    authors: ["Harper Lee"],
    coverUrl:
      "https://covers.openlibrary.org/b/isbn/9780060935467-L.jpg",
    publishedDate: "2002",
    pageCount: 323,
    description:
      "A modern classic - the story of racial injustice in the American South told through the eyes of a child.",
  },
  {
    isbn: "9780679783268",
    title: "Crime and Punishment",
    authors: ["Fyodor Dostoevsky"],
    coverUrl:
      "https://covers.openlibrary.org/b/isbn/9780679783268-L.jpg",
    publishedDate: "1866",
    pageCount: 671,
    description:
      "A psychological novel exploring themes of morality, guilt, and redemption in 19th-century St. Petersburg.",
  },
]

export function searchBooks(query: string): Book[] {
  const lower = query.toLowerCase().trim()
  if (!lower) return []
  return mockBooks.filter(
    (book) =>
      book.title.toLowerCase().includes(lower) ||
      book.authors.some((a) => a.toLowerCase().includes(lower)) ||
      book.isbn.includes(lower)
  )
}

export function getBookByIsbn(isbn: string): Book | undefined {
  return mockBooks.find((b) => b.isbn === isbn)
}

export function generatePrediction(book: Book): Prediction {
  // Deterministic-ish prediction based on ISBN hash
  const hash = book.isbn
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const rating = 2.5 + ((hash % 25) / 10)
  const confidence = 55 + (hash % 40)

  const allRationale = [
    `You tend to rate ${book.authors[0]}'s writing style highly based on similar genres in your history.`,
    `Books published in ${book.publishedDate || "this era"} align well with your preferred reading period.`,
    `Your history shows a preference for books around ${book.pageCount || 300} pages.`,
    `Similar thematic elements appear in 4 of your top-rated books.`,
    `Readers with overlapping taste profiles rated this ${rating > 3.5 ? "above" : "around"} average.`,
  ]

  return {
    rating: Math.min(5, Math.round(rating * 10) / 10),
    confidence,
    rationale: allRationale.slice(0, 3 + (hash % 2)),
  }
}
