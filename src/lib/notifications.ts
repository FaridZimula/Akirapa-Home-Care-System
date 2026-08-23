import { prisma } from './prisma';

export type NotificationType =
  | 'SHIFT_ASSIGNED'
  | 'SHIFT_CONFIRMED'
  | 'SHIFT_DROPPED'
  | 'SHIFT_STARTED'
  | 'SHIFT_COMPLETED'
  | 'CLINICAL_ALERT'
  | 'EXCEPTION_OVERRIDE'
  | 'CARE_PLAN_UPDATED'
  | 'REVIEW_SUBMITTED'
  | 'INVOICE_ISSUED'
  | 'PAYMENT_RECEIVED'
  | 'SYSTEM_ALERT'
  | 'NEW_MESSAGE'
  | 'SHIFT_CONFIRMATION_MISSED'
  | 'FAMILY_APPROVAL_PENDING';

export interface CreateNotificationPayload {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
}

export async function createNotification(payload: CreateNotificationPayload) {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: payload.userId,
        title: payload.title,
        message: payload.message,
        type: payload.type,
        isRead: false,
      },
    });
    return notification;
  } catch (error) {
    console.error('Failed to create notification in DB:', error);
    return null;
  }
}

export async function getUserNotifications(userId: string) {
  try {
    return await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    console.error('Failed to retrieve user notifications:', error);
    return [];
  }
}

export async function markAsRead(notificationId: string, userId: string) {
  try {
    return await prisma.notification.update({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  } catch (error) {
    console.error('Failed to mark notification as read:', error);
    return null;
  }
}

export async function markAllAsRead(userId: string) {
  try {
    return await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error);
    return { count: 0 };
  }
}

/**
 * Notify all administrators and care coordinators in the system.
 */
export async function notifyAdmins({
  title,
  message,
  type = 'SYSTEM_ALERT',
  excludeUserId,
}: {
  title: string;
  message: string;
  type?: NotificationType;
  excludeUserId?: string;
}) {
  try {
    const adminUsers = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'CARE_COORDINATOR'] },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });

    return await Promise.all(
      adminUsers.map(admin =>
        createNotification({
          userId: admin.id,
          title,
          message,
          type,
        })
      )
    );
  } catch (error) {
    console.error('Failed to notify admins:', error);
    return [];
  }
}

/**
 * Notify all linked family members for a given client profile.
 */
export async function notifyClientFamily({
  clientId,
  title,
  message,
  type = 'SYSTEM_ALERT',
  excludeUserId,
}: {
  clientId: string;
  title: string;
  message: string;
  type?: NotificationType;
  excludeUserId?: string;
}) {
  try {
    const linkedFamily = await prisma.linkedFamilyMember.findMany({
      where: {
        clientId,
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
      },
      select: { userId: true },
    });

    return await Promise.all(
      linkedFamily.map(f =>
        createNotification({
          userId: f.userId,
          title,
          message,
          type,
        })
      )
    );
  } catch (error) {
    console.error('Failed to notify client family members:', error);
    return [];
  }
}

/**
 * Notify a specific caregiver.
 */
export async function notifyCaregiver({
  caregiverId,
  title,
  message,
  type = 'SHIFT_ASSIGNED',
}: {
  caregiverId: string;
  title: string;
  message: string;
  type?: NotificationType;
}) {
  return await createNotification({
    userId: caregiverId,
    title,
    message,
    type,
  });
}

/**
 * Multi-party notification orchestrator for shifts.
 * Dispatches targeted notifications to Admins, Caregiver, and Client Family.
 */
export async function notifyShiftParties({
  shiftId,
  parties = ['ADMIN', 'CAREGIVER', 'CLIENT'],
  title,
  defaultMessage,
  type,
  caregiverMessage,
  clientMessage,
  adminMessage,
  excludeUserId,
}: {
  shiftId: string;
  parties?: Array<'ADMIN' | 'CAREGIVER' | 'CLIENT'>;
  title: string;
  defaultMessage?: string;
  type: NotificationType;
  caregiverMessage?: string;
  clientMessage?: string;
  adminMessage?: string;
  excludeUserId?: string;
}) {
  try {
    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        client: true,
        caregiver: true,
      },
    });

    if (!shift) return;

    const promises: Promise<unknown>[] = [];

    // 1. Caregiver notification
    if (parties.includes('CAREGIVER') && shift.caregiverId && shift.caregiverId !== excludeUserId) {
      promises.push(
        createNotification({
          userId: shift.caregiverId,
          title,
          message: caregiverMessage || defaultMessage || `Update regarding your shift for ${shift.client.name}.`,
          type,
        })
      );
    }

    // 2. Client / Family notification
    if (parties.includes('CLIENT') && shift.clientId) {
      promises.push(
        notifyClientFamily({
          clientId: shift.clientId,
          title,
          message: clientMessage || defaultMessage || `Update regarding scheduled care for ${shift.client.name}.`,
          type,
          excludeUserId,
        })
      );
    }

    // 3. Admin & Care Coordinator notification
    if (parties.includes('ADMIN')) {
      promises.push(
        notifyAdmins({
          title,
          message: adminMessage || defaultMessage || `Shift update for client ${shift.client.name} and caregiver ${shift.caregiver.name}.`,
          type,
          excludeUserId,
        })
      );
    }

    await Promise.all(promises);
  } catch (error) {
    console.error('Failed to notify shift parties:', error);
  }
}
