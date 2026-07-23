import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const { userId, phoneNumber, profileMetadata } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const updateData: any = {};
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (profileMetadata !== undefined) {
      updateData.profileMetadata = typeof profileMetadata === 'string' ? profileMetadata : JSON.stringify(profileMetadata);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phoneNumber: true,
        profileMetadata: true,
      }
    });

    await logAudit({
      userId,
      action: 'UPDATE_USER_PROFILE',
      details: `User ${updatedUser.name} updated profile certifications and metadata.`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Failed to update user profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
