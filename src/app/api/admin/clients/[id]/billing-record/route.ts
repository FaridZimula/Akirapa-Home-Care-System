import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import { formatDate } from '@/lib/dateFormat';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Billing data is restricted to administrators' }, { status: 403 });
    }

    const { id } = await params;

    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const invoices = await prisma.invoice.findMany({
      where: { clientId: id },
      include: { payments: true },
      orderBy: { issuedDate: 'asc' },
    });

    type LedgerRow = { date: Date; invoiceNumber: string; description: string; charge: number; payment: number };
    const ledger: LedgerRow[] = [];

    for (const inv of invoices) {
      ledger.push({
        date: inv.issuedDate,
        invoiceNumber: inv.invoiceNumber,
        description: `Home Care Services (${formatDate(inv.servicePeriodStart)} - ${formatDate(inv.servicePeriodEnd)})`,
        charge: inv.totalDue,
        payment: 0,
      });
      for (const p of inv.payments) {
        ledger.push({
          date: p.paidAt,
          invoiceNumber: inv.invoiceNumber,
          description: `Payment Received${p.method ? ` - ${p.method}` : ''}`,
          charge: 0,
          payment: p.amount,
        });
      }
    }

    ledger.sort((a, b) => a.date.getTime() - b.date.getTime());

    let runningBalance = 0;
    const history = ledger.map(row => {
      runningBalance = Math.round((runningBalance + row.charge - row.payment) * 100) / 100;
      return { ...row, balance: runningBalance };
    });

    const totalCharges = Math.round(invoices.reduce((sum, i) => sum + i.totalDue, 0) * 100) / 100;
    const allPayments = invoices.flatMap(i => i.payments);
    const totalPayments = Math.round(allPayments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
    const currentBalance = Math.round((totalCharges - totalPayments) * 100) / 100;
    const lastPaymentDate = allPayments.length > 0
      ? allPayments.reduce((latest, p) => (p.paidAt > latest ? p.paidAt : latest), allPayments[0].paidAt)
      : null;

    let meta: any = {};
    try { meta = client.profileMetadata ? JSON.parse(client.profileMetadata) : {}; } catch {}

    return NextResponse.json({
      client: {
        id: client.id,
        name: client.name,
        address: client.address,
        phone: meta.phone || null,
        email: meta.email || null,
        clientSince: client.createdAt,
      },
      accountNumber: `HCA-AC-${client.id.slice(0, 8).toUpperCase()}`,
      totalCharges,
      totalPayments,
      currentBalance,
      lastPaymentDate,
      history,
    });
  } catch (error) {
    console.error('Failed to load client billing record:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
