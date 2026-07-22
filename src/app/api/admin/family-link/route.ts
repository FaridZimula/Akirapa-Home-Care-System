import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const userId = searchParams.get('userId');

    const where: any = {};
    if (clientId) where.clientId = clientId;
    if (userId) where.userId = userId;

    const links = await prisma.linkedFamilyMember.findMany({
      where,
      include: {
        client: true,
        user: {
          select: { id: true, name: true, email: true, role: true, phoneNumber: true },
        },
      },
    });

    return NextResponse.json({ links });
  } catch (error) {
    console.error('Failed to fetch family links:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { clientId, userId, action } = await request.json();

    if (!clientId || !userId) {
      return NextResponse.json({ error: 'Client ID and User ID are required' }, { status: 400 });
    }

    if (action === 'UNLINK') {
      await prisma.linkedFamilyMember.deleteMany({
        where: { clientId, userId },
      });

      await logAudit({
        userId: 'ADMIN',
        action: 'UNLINK_FAMILY_MEMBER',
        details: `Unlinked user ${userId} from client ${clientId}`,
        outcome: 'SUCCESS',
      });

      return NextResponse.json({ success: true, message: 'Unlinked family member successfully' });
    }

    // Default: Link family member
    const link = await prisma.linkedFamilyMember.upsert({
      where: {
        clientId_userId: { clientId, userId },
      },
      update: {},
      create: {
        clientId,
        userId,
      },
      include: {
        client: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    await logAudit({
      userId: 'ADMIN',
      action: 'LINK_FAMILY_MEMBER',
      details: `Linked family member ${link.user.name} (${link.user.email}) to client ${link.client.name}`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({ success: true, link });
  } catch (error) {
    console.error('Failed to update family link:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
