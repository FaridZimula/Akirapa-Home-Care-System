import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser } from '@/lib/session';

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { userId, phoneNumber, profileMetadata, latitude, longitude } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const isSupervisor = sessionUser.role === 'ADMIN' || sessionUser.role === 'CARE_COORDINATOR';
    if (sessionUser.id !== userId && !isSupervisor) {
      return NextResponse.json({ error: 'You can only update your own profile' }, { status: 403 });
    }

    const updateData: any = {};
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (profileMetadata !== undefined) {
      updateData.profileMetadata = typeof profileMetadata === 'string' ? profileMetadata : JSON.stringify(profileMetadata);
    }
    if (typeof latitude === 'number') updateData.latitude = latitude;
    if (typeof longitude === 'number') updateData.longitude = longitude;

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
        latitude: true,
        longitude: true,
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
