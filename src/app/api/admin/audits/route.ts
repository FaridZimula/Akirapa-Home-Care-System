import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const audits = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 50, // Limit to recent 50 logs for performance
    });

    return NextResponse.json({ audits });
  } catch (error) {
    console.error('Failed to load audit logs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
