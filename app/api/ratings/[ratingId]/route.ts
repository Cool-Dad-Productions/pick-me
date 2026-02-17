import 'server-only';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ ratingId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ratingId } = await params;

    // Find work rating and verify ownership
    const rating = await db.workRating.findUnique({
      where: { id: ratingId },
      select: { id: true, userId: true },
    });

    if (!rating) {
      return NextResponse.json({ error: 'Rating not found' }, { status: 404 });
    }

    if (rating.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete the work rating
    await db.workRating.delete({
      where: { id: ratingId },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Delete rating error:', error);
    return NextResponse.json(
      { error: 'Failed to delete rating' },
      { status: 500 }
    );
  }
}
