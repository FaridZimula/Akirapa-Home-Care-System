import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser } from '@/lib/session';
import { getCurrentWeekStart } from '@/lib/weekBounds';
import { ShiftStatus } from '@prisma/client';

async function verifyFamilyLink(userId: string, clientId: string) {
  return prisma.linkedFamilyMember.findUnique({
    where: { clientId_userId: { clientId, userId } },
  });
}

async function getThisWeeksCaregivers(clientId: string, weekStart: Date) {
  const shifts = await prisma.shift.findMany({
    where: {
      clientId,
      status: ShiftStatus.COMPLETED,
      actualStart: { gte: weekStart },
      actualEnd: { not: null },
    },
    select: { caregiverId: true, caregiver: { select: { id: true, name: true } } },
  });
  const byId = new Map<string, { id: string; name: string }>();
  for (const s of shifts) byId.set(s.caregiverId, s.caregiver);
  return Array.from(byId.values());
}

export async function GET(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }

    const link = await verifyFamilyLink(sessionUser.id, clientId);
    if (!link) {
      return NextResponse.json({ error: 'You are not linked to this client' }, { status: 403 });
    }

    const weekStart = getCurrentWeekStart();
    const caregivers = await getThisWeeksCaregivers(clientId, weekStart);

    const existingReviews = await prisma.caregiverReview.findMany({
      where: { clientId, weekStart, caregiverId: { in: caregivers.map(c => c.id) } },
    });
    const reviewByCaregiver = new Map(existingReviews.map(r => [r.caregiverId, r]));

    return NextResponse.json({
      weekStart: weekStart.toISOString(),
      caregivers: caregivers.map(c => ({
        ...c,
        existingReview: reviewByCaregiver.get(c.id) || null,
      })),
    });
  } catch (error) {
    console.error('Failed to load caregiver reviews:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { clientId, caregiverId, strengths, improvements, wouldContinue, rating } = await request.json();

    if (!clientId || !caregiverId || typeof wouldContinue !== 'boolean') {
      return NextResponse.json({ error: 'clientId, caregiverId, and wouldContinue are required' }, { status: 400 });
    }

    const link = await verifyFamilyLink(sessionUser.id, clientId);
    if (!link) {
      return NextResponse.json({ error: 'You are not linked to this client' }, { status: 403 });
    }

    const weekStart = getCurrentWeekStart();

    // Only allow reviewing a caregiver who actually had a completed shift with this client this week.
    const thisWeeksCaregivers = await getThisWeeksCaregivers(clientId, weekStart);
    if (!thisWeeksCaregivers.some(c => c.id === caregiverId)) {
      return NextResponse.json({ error: 'This caregiver did not have a completed shift with this client this week' }, { status: 400 });
    }

    const review = await prisma.caregiverReview.upsert({
      where: { clientId_caregiverId_weekStart: { clientId, caregiverId, weekStart } },
      update: {
        strengths: strengths || null,
        improvements: improvements || null,
        wouldContinue,
        rating: typeof rating === 'number' ? rating : null,
        reviewerId: sessionUser.id,
      },
      create: {
        clientId,
        caregiverId,
        reviewerId: sessionUser.id,
        weekStart,
        strengths: strengths || null,
        improvements: improvements || null,
        wouldContinue,
        rating: typeof rating === 'number' ? rating : null,
      },
    });

    const caregiver = await prisma.user.findUnique({ where: { id: caregiverId } });
    const client = await prisma.client.findUnique({ where: { id: clientId } });

    await logAudit({
      userId: sessionUser.id,
      action: 'SUBMIT_CAREGIVER_REVIEW',
      details: `${sessionUser.name} submitted a weekly review for caregiver ${caregiver?.name} on behalf of client ${client?.name}. Would continue: ${wouldContinue ? 'Yes' : 'No'}.`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({ success: true, review });
  } catch (error) {
    console.error('Failed to submit caregiver review:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
