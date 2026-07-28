import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';

// Admin/coordinator-only visibility - caregivers never see reviews about themselves.
export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || (sessionUser.role !== 'ADMIN' && sessionUser.role !== 'CARE_COORDINATOR')) {
      return NextResponse.json({ error: 'Caregiver reviews are restricted to administrators' }, { status: 403 });
    }

    const reviews = await prisma.caregiverReview.findMany({
      include: {
        client: { select: { id: true, name: true } },
        caregiver: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
      },
      orderBy: { weekStart: 'desc' },
    });

    return NextResponse.json({ reviews });
  } catch (error) {
    console.error('Failed to load caregiver reviews:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
