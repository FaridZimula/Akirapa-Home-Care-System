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
  | 'FAMILY_APPROVAL_PENDING'
  | 'LATE_ARRIVAL';

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

import { sendEmail } from './email';
import { formatDate, formatTime, formatDateTime } from './dateFormat';

/**
 * Send an email alert to the caregiver when a shift is assigned.
 */
export async function sendShiftAssignmentEmail({
  caregiverEmail,
  caregiverName,
  clientName,
  clientAddress,
  scheduledStart,
  scheduledEnd,
  confirmationDeadline,
}: {
  caregiverEmail: string;
  caregiverName: string;
  clientName: string;
  clientAddress?: string;
  scheduledStart: Date | string;
  scheduledEnd: Date | string;
  confirmationDeadline: Date | string;
}): Promise<boolean> {
  if (!caregiverEmail) return false;

  const dateStr = formatDate(scheduledStart);
  const startStr = formatTime(scheduledStart);
  const endStr = formatTime(scheduledEnd);
  const deadlineStr = formatDateTime(confirmationDeadline);

  const subject = `🗓️ Action Required: New Shift Assigned for ${clientName} (${dateStr})`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
      <div style="background-color: #0f172a; padding: 20px; text-align: center; border-radius: 6px 6px 0 0;">
        <h2 style="color: #ffffff; margin: 0; font-size: 22px;">Akirapa Home Care</h2>
        <p style="color: #38bdf8; margin: 5px 0 0 0; font-size: 14px;">Shift Assignment Notification</p>
      </div>

      <div style="padding: 24px; color: #334155; line-height: 1.6;">
        <p style="font-size: 16px;">Hello <strong>${caregiverName}</strong>,</p>
        <p>You have been assigned a new care shift. Please review the details below and log in to your Akirapa portal to confirm your availability.</p>

        <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; font-weight: bold; color: #64748b; width: 140px;">Client Name:</td>
              <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${clientName}</td>
            </tr>
            ${clientAddress ? `
            <tr>
              <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Location:</td>
              <td style="padding: 6px 0; color: #334155;">${clientAddress}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Date:</td>
              <td style="padding: 6px 0; color: #334155;">${dateStr}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Time Window:</td>
              <td style="padding: 6px 0; color: #334155;">${startStr} – ${endStr}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold; color: #dc2626;">Confirm By:</td>
              <td style="padding: 6px 0; font-weight: bold; color: #dc2626;">${deadlineStr}</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin: 30px 0 20px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://akirapa-home-care-system-ynmt.vercel.app'}" 
             style="background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">
            Open Portal & Confirm Shift
          </a>
        </div>

        <p style="font-size: 13px; color: #64748b; margin-top: 24px; text-align: center;">
          If you are unable to fulfill this shift, please log in immediately to notify administration or contact your Care Coordinator.
        </p>
      </div>

      <div style="background-color: #f1f5f9; padding: 14px; text-align: center; font-size: 12px; color: #64748b; border-radius: 0 0 6px 6px;">
        &copy; ${new Date().getFullYear()} Akirapa Home Care System. All rights reserved.
      </div>
    </div>
  `;

  return await sendEmail({ to: caregiverEmail, subject, html });
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
