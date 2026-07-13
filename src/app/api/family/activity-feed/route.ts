import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    const logs = await prisma.activityLog.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });

    const decryptedLogs = logs.map(log => {
      let details = null;
      try {
        const decryptedStr = decrypt(log.encryptedLog);
        details = JSON.parse(decryptedStr);
      } catch (err) {
        console.error('Failed to decrypt activity log entry:', err);
        details = { notes: '[Failed to decrypt details - Key error]', hasRedFlags: false };
      }

      let parsedMediaUrls = [];
      try {
        parsedMediaUrls = JSON.parse(log.mediaUrls);
      } catch (err) {
        parsedMediaUrls = [];
      }

      return {
        id: log.id,
        clientId: log.clientId,
        shiftId: log.shiftId,
        createdAt: log.createdAt,
        details,
        mediaUrls: parsedMediaUrls,
      };
    });

    return NextResponse.json({ logs: decryptedLogs });
  } catch (error) {
    console.error('Failed to fetch activity feed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
