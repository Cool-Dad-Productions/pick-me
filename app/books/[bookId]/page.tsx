'use client';

import { useEffect, useState, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PredictionDisplay } from '@/components/PredictionDisplay';
import type { Book } from '@prisma/client';
import type { PredictionResult } from '@/types';

interface BookDetailPageProps {
  params: Promise<{ bookId: string }>;
}

export default function BookDetailPage({ params }: BookDetailPageProps) {
  const { bookId } = use(params);
  const [book, setBook] = useState<Book | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchBook() {
      try {
        const response = await fetch(`/api/books/${bookId}`);
        if (!response.ok) {
          setError('Book not found');
          return;
        }
        const data = await response.json();
        setBook(data.book);
      } catch {
        setError('Failed to load book');
      } finally {
        setLoading(false);
      }
    }

    fetchBook();
  }, [bookId]);

  async function handlePredict() {
    setPredicting(true);
    setPrediction(null);

    try {
      const response = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Prediction failed');
        return;
      }

      setPrediction(data);
    } catch {
      setError('Failed to get prediction');
    } finally {
      setPredicting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-neutral-600 dark:text-neutral-400">Loading...</p>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card padding="lg">
          <p className="text-red-500 mb-4">{error || 'Book not found'}</p>
          <Link href="/search">
            <Button variant="secondary">Back to Search</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/search"
        className="inline-block mb-4 text-sm text-neutral-600 dark:text-neutral-400 hover:underline"
      >
        &larr; Back to Search
      </Link>

      <Card padding="lg" className="mb-6">
        <div className="flex gap-6">
          {book.coverUrl ? (
            <div className="flex-shrink-0 w-32 h-48 relative">
              <Image
                src={book.coverUrl}
                alt={`Cover of ${book.title}`}
                fill
                className="object-cover rounded"
                sizes="128px"
              />
            </div>
          ) : (
            <div className="flex-shrink-0 w-32 h-48 bg-neutral-200 dark:bg-neutral-700 rounded flex items-center justify-center">
              <span className="text-sm text-neutral-400">No cover</span>
            </div>
          )}

          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              {typeof book.title === 'string' ? book.title : 'Unknown Title'}
            </h1>
            <p className="text-lg text-neutral-600 dark:text-neutral-400 mt-1">
              {(Array.isArray(book.authors) ? book.authors.join(', ') : '') || 'Unknown author'}
            </p>
            {book.isbn13 && (
              <p className="text-sm text-neutral-500 mt-2">
                ISBN: {book.isbn13}
              </p>
            )}
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        {!prediction && !predicting && (
          <Button onClick={handlePredict} className="w-full" size="lg">
            Predict My Rating
          </Button>
        )}

        <PredictionDisplay prediction={prediction} loading={predicting} />
      </div>
    </div>
  );
}
