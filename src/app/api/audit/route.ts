import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const { userId, action, details, outcome } = await request.json();

    if (!userId || !action || !details || !outcome) {
      return NextResponse.json(
        { error: 'Missing required audit parameters' },
        { status: 400 }
      );
    }

    const logEntry = await logAudit({
      userId,
      action,
      details,
      outcome,
    });

    return NextResponse.json({ success: true, logEntry });
  } catch (error) {
    console.error('Audit API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
