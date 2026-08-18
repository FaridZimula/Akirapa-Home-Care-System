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
        { error: 'Client deletion is restricted to administrators' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const targetClient = await prisma.client.findUnique({
      where: { id },
      include: {
        familyMembers: true,
      },
    });

    if (!targetClient) {
      return NextResponse.json({ error: 'Client profile not found' }, { status: 404 });
    }

    const linkedFamilyUserIds = targetClient.familyMembers.map((f) => f.userId);

    // Perform cascading removal of all client dependent records in transaction
    await prisma.$transaction(async (tx) => {
      // 1. Find and cleanup all client shifts
      const clientShifts = await tx.shift.findMany({
        where: { clientId: id },
        select: { id: true },
      });
      const shiftIds = clientShifts.map((s) => s.id);

      if (shiftIds.length > 0) {
        await tx.caregiverLocationHistory.deleteMany({
          where: { shiftId: { in: shiftIds } },
        });

        await tx.shiftTask.deleteMany({
          where: { shiftId: { in: shiftIds } },
        });

        await tx.shiftOffer.deleteMany({
          where: { shiftId: { in: shiftIds } },
        });

        await tx.activityLog.deleteMany({
          where: { shiftId: { in: shiftIds } },
        });

        await tx.shift.deleteMany({
          where: { id: { in: shiftIds } },
        });
      }

      // 2. Find and cleanup Care Plans
      const carePlans = await tx.carePlan.findMany({
        where: { clientId: id },
        select: { id: true },
      });
      const carePlanIds = carePlans.map((cp) => cp.id);

      if (carePlanIds.length > 0) {
        await tx.carePlanTask.deleteMany({
          where: { carePlanId: { in: carePlanIds } },
        });

        await tx.carePlan.deleteMany({
          where: { clientId: id },
        });
      }

      // 3. Delete Caregiver Pods
      await tx.caregiverPod.deleteMany({
        where: { clientId: id },
      });

      // 4. Delete Activity Logs
      await tx.activityLog.deleteMany({
        where: { clientId: id },
      });

      // 5. Delete Caregiver Reviews
      await tx.caregiverReview.deleteMany({
        where: { clientId: id },
      });

      // 6. Delete Messages
      await tx.message.deleteMany({
        where: { clientId: id },
      });

      // 7. Delete Payments & Invoices
      await tx.payment.deleteMany({
        where: { clientId: id },
      });

      await tx.invoice.deleteMany({
        where: { clientId: id },
      });

      // 8. Unlink family members
      await tx.linkedFamilyMember.deleteMany({
        where: { clientId: id },
      });

      // 9. Clean up orphan family user accounts linked to no other clients
      for (const userId of linkedFamilyUserIds) {
        const remainingLinks = await tx.linkedFamilyMember.count({
          where: { userId },
        });
        if (remainingLinks === 0) {
          // Delete audit logs, notifications, messages for this orphan user before deleting
          await tx.notification.deleteMany({ where: { userId } });
          await tx.auditLog.deleteMany({ where: { userId } });
          await tx.user.delete({ where: { id: userId } }).catch((e) => {
            console.warn(`Could not delete orphan family user ${userId}:`, e);
          });
        }
      }

      // 10. Delete the Client profile
      await tx.client.delete({
        where: { id },
      });
    });

    await logAudit({
      userId: sessionUser.id,
      action: 'ADMIN_DELETE_CLIENT',
      details: `Admin ${sessionUser.email} deleted client profile ${targetClient.name}`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({
      success: true,
      message: `Client ${targetClient.name} and associated profile deleted successfully.`,
    });
  } catch (error) {
    console.error('Failed to delete client:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
