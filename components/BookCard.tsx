'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import type { BookCandidate } from '@/types';

interface BookCardProps {
  book: BookCandidate;
  href?: string;
  onClick?: () => void;
}

export function BookCard({ book, href, onClick }: BookCardProps) {
  const content = (
    <Card
      className={`flex gap-4 ${onClick || href ? 'cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors' : ''}`}
      padding="md"
      onClick={onClick}
    >
      {book.coverUrl ? (
        <div className="flex-shrink-0 w-16 h-24 relative">
          <Image
            src={book.coverUrl}
            alt={`Cover of ${book.title}`}
            fill
            className="object-cover rounded"
            sizes="64px"
          />
        </div>
      ) : (
        <div className="flex-shrink-0 w-16 h-24 bg-neutral-200 dark:bg-neutral-700 rounded flex items-center justify-center">
          <span className="text-xs text-neutral-400">No cover</span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
          {typeof book.title === 'string' ? book.title : 'Unknown Title'}
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 truncate">
          {(Array.isArray(book.authors) ? book.authors.join(', ') : '') || 'Unknown author'}
        </p>
        {book.isbn13 && (
          <p className="text-xs text-neutral-500 mt-1">
            ISBN: {book.isbn13}
          </p>
        )}
      </div>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
