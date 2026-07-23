import { prisma } from './prisma';

export interface CreateNotificationPayload {
  userId: string;
  title: string;
  message: string;
  type: 'SHIFT_ASSIGNED' | 'SHIFT_DROPPED' | 'CLINICAL_ALERT' | 'EXCEPTION_OVERRIDE' | 'SYSTEM_ALERT';
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
