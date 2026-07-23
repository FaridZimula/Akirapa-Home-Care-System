import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { getSessionUser } from '@/lib/session';

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { action, details, outcome } = await request.json();

    if (!action || !details || !outcome) {
      return NextResponse.json(
        { error: 'Missing required audit parameters' },
        { status: 400 }
      );
    }

    // userId always comes from the verified session, never from the request body,
    // so a caller cannot forge audit entries under another user's identity.
    const logEntry = await logAudit({
      userId: sessionUser.id,
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
