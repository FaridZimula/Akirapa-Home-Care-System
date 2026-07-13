import { prisma } from './prisma';

export async function logAudit({
  userId,
  action,
  details,
  outcome,
}: {
  userId: string;
  action: string;
  details: string;
  outcome: 'SUCCESS' | 'FAILURE';
}) {
  try {
    const logEntry = await prisma.auditLog.create({
      data: {
        userId,
        action,
        details,
        outcome,
      },
    });
    console.log(`[AUDIT LOG] [${logEntry.timestamp.toISOString()}] User: ${userId} | Action: ${action} | Outcome: ${outcome} | Details: ${details}`);
    return logEntry;
  } catch (error) {
    console.error('Failed to write audit log to database:', error);
    // Fallback console logging for audit reliability
    console.warn(`[AUDIT FALLBACK] User: ${userId} | Action: ${action} | Outcome: ${outcome} | Details: ${details}`);
    return null;
  }
}
