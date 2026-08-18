import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser } from '@/lib/session';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Account deletion is restricted to administrators' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const targetUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User account not found' }, { status: 404 });
    }

    // Do not allow deleting ADMIN users via portal to avoid lock-outs
    if (targetUser.role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Administrator accounts cannot be deleted from account management' },
        { status: 403 }
      );
    }

    // Perform cascading removal of dependent records in transaction
    await prisma.$transaction(async (tx) => {
      // 1. Find shifts assigned to caregiver
      const userShifts = await tx.shift.findMany({
        where: { caregiverId: id },
        select: { id: true },
      });
      const shiftIds = userShifts.map((s) => s.id);

      if (shiftIds.length > 0) {
        // Delete location history for user's shifts
        await tx.caregiverLocationHistory.deleteMany({
          where: { shiftId: { in: shiftIds } },
        });

        // Delete shift tasks for user's shifts
        await tx.shiftTask.deleteMany({
          where: { shiftId: { in: shiftIds } },
        });

        // Delete shift offers for user's shifts
        await tx.shiftOffer.deleteMany({
          where: { shiftId: { in: shiftIds } },
        });

        // Delete activity logs for user's shifts
        await tx.activityLog.deleteMany({
          where: { shiftId: { in: shiftIds } },
        });

        // Delete user's shifts
        await tx.shift.deleteMany({
          where: { id: { in: shiftIds } },
        });
      }

      // 2. Delete caregiver pod assignments
      await tx.caregiverPod.deleteMany({
        where: { caregiverId: id },
      });

      // 3. Delete shift offers targeting caregiver directly
      await tx.shiftOffer.deleteMany({
        where: { caregiverId: id },
      });

      // 4. Delete availabilities
      await tx.availability.deleteMany({
        where: { caregiverId: id },
      });

      // 5. Delete reviews where caregiver is subject or reviewer
      await tx.caregiverReview.deleteMany({
        where: {
          OR: [{ caregiverId: id }, { reviewerId: id }],
        },
      });

      // 6. Delete linked family member ties
      await tx.linkedFamilyMember.deleteMany({
        where: { userId: id },
      });

      // 7. Delete messages sent by user
      await tx.message.deleteMany({
        where: { senderId: id },
      });

      // 8. Delete notifications
      await tx.notification.deleteMany({
        where: { userId: id },
      });

      // 9. Delete audit logs for user
      await tx.auditLog.deleteMany({
        where: { userId: id },
      });

      // 10. Finally delete user account
      await tx.user.delete({
        where: { id },
      });
    });

    await logAudit({
      userId: sessionUser.id,
      action: 'ADMIN_DELETE_USER',
      details: `Admin ${sessionUser.email} deleted ${targetUser.role} account ${targetUser.name} (${targetUser.email})`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({
      success: true,
      message: `Account for ${targetUser.name} (${targetUser.email}) deleted successfully.`,
    });
  } catch (error) {
    console.error('Failed to delete user account:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
