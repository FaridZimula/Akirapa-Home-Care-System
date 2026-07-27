import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser } from '@/lib/session';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Billing actions are restricted to administrators' }, { status: 403 });
    }

    const { id } = await params;
    const { amount, method } = await request.json();

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'A positive payment amount is required' }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({ where: { id }, include: { client: true } });
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const newAmountPaid = Math.min(invoice.totalDue, Math.round((invoice.amountPaid + amount) * 100) / 100);

    const [, updated] = await prisma.$transaction([
      prisma.payment.create({
        data: {
          invoiceId: id,
          clientId: invoice.clientId,
          amount,
          method: method || null,
        },
      }),
      prisma.invoice.update({
        where: { id },
        data: { amountPaid: newAmountPaid },
        include: { client: { select: { id: true, name: true, address: true } } },
      }),
    ]);

    await logAudit({
      userId: sessionUser.id,
      action: 'RECORD_INVOICE_PAYMENT',
      details: `Recorded payment of $${amount.toFixed(2)}${method ? ` (${method})` : ''} on invoice ${invoice.invoiceNumber} for ${invoice.client.name}. New balance paid: $${newAmountPaid.toFixed(2)} of $${invoice.totalDue.toFixed(2)}.`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({ success: true, invoice: updated });
  } catch (error) {
    console.error('Failed to record invoice payment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
