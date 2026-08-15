import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { getSessionUser } from '@/lib/session';
import { formatDate } from '@/lib/dateFormat';
import { ShiftStatus } from '@prisma/client';
import { isBusinessHubAuthorized } from '@/lib/adminAllowlist';

function computeStatus(totalDue: number, amountPaid: number, dueDate: Date, now: Date): 'PAID' | 'OVERDUE' | 'PARTIAL' | 'PENDING' {
  if (amountPaid >= totalDue) return 'PAID';
  if (dueDate < now) return 'OVERDUE';
  if (amountPaid > 0) return 'PARTIAL';
  return 'PENDING';
}

export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.role !== 'ADMIN' || !isBusinessHubAuthorized(sessionUser.email)) {
      return NextResponse.json({ error: 'Billing data is restricted to authorized senior business administrators (cathy@akirapahomecareus.com and info@akirapahomecareus.com).' }, { status: 403 });
    }

    const now = new Date();
    const invoices = await prisma.invoice.findMany({
      include: { client: { select: { id: true, name: true, address: true } } },
      orderBy: { issuedDate: 'desc' },
    });

    const enriched = invoices.map(inv => {
      const balance = Math.round((inv.totalDue - inv.amountPaid) * 100) / 100;
      const status = computeStatus(inv.totalDue, inv.amountPaid, inv.dueDate, now);
      let lineItems: any[] = [];
      try { lineItems = JSON.parse(inv.lineItemsJson); } catch {}
      return { ...inv, lineItems, balance, status };
    });

    const totalInvoiced = enriched.reduce((sum, i) => sum + i.totalDue, 0);
    const totalReceived = enriched.reduce((sum, i) => sum + i.amountPaid, 0);
    const outstanding = enriched.reduce((sum, i) => sum + Math.max(0, i.balance), 0);
    const overdue = enriched.filter(i => i.status === 'OVERDUE').reduce((sum, i) => sum + Math.max(0, i.balance), 0);

    return NextResponse.json({
      invoices: enriched,
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      totalReceived: Math.round(totalReceived * 100) / 100,
      outstanding: Math.round(outstanding * 100) / 100,
      overdue: Math.round(overdue * 100) / 100,
    });
  } catch (error) {
    console.error('Failed to load invoices:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.role !== 'ADMIN' || !isBusinessHubAuthorized(sessionUser.email)) {
      return NextResponse.json({ error: 'Billing actions are restricted to authorized senior business administrators (cathy@akirapahomecareus.com and info@akirapahomecareus.com).' }, { status: 403 });
    }

    const { clientId, servicePeriodStart, servicePeriodEnd, dueDate, taxRatePercent, discountAmount } = await request.json();

    if (!clientId || !servicePeriodStart || !servicePeriodEnd || !dueDate) {
      return NextResponse.json({ error: 'Client, service period, and due date are required' }, { status: 400 });
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    if (client.billingRatePerHour == null) {
      return NextResponse.json({ error: `Set a billing rate for ${client.name} before generating an invoice (Business Hub → Geofence & Profile).` }, { status: 400 });
    }

    const periodStart = new Date(servicePeriodStart);
    const periodEnd = new Date(servicePeriodEnd);

    const shifts = await prisma.shift.findMany({
      where: {
        clientId,
        status: ShiftStatus.COMPLETED,
        actualStart: { gte: periodStart, lte: periodEnd },
        actualEnd: { not: null },
      },
      include: { caregiver: { select: { name: true } } },
      orderBy: { actualStart: 'asc' },
    });

    if (shifts.length === 0) {
      return NextResponse.json({ error: `No completed shifts found for ${client.name} between ${formatDate(periodStart)} and ${formatDate(periodEnd)}.` }, { status: 400 });
    }

    const rate = client.billingRatePerHour;
    const lineItems = shifts.map(s => {
      const hours = Math.round(((s.actualEnd!.getTime() - s.actualStart!.getTime()) / (1000 * 60 * 60)) * 100) / 100;
      const amount = Math.round(hours * rate * 100) / 100;
      return {
        description: `Home Care Visit - ${s.caregiver.name}`,
        date: s.actualStart,
        hours,
        rate,
        amount,
      };
    });

    const subtotal = Math.round(lineItems.reduce((sum, li) => sum + li.amount, 0) * 100) / 100;
    const taxRate = typeof taxRatePercent === 'number' ? taxRatePercent : 0;
    const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
    const discount = typeof discountAmount === 'number' ? discountAmount : 0;
    const totalDue = Math.round((subtotal + taxAmount - discount) * 100) / 100;

    const existingCount = await prisma.invoice.count();
    const invoiceNumber = `HCA-${String(existingCount + 101).padStart(4, '0')}`;

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        clientId,
        servicePeriodStart: periodStart,
        servicePeriodEnd: periodEnd,
        dueDate: new Date(dueDate),
        lineItemsJson: JSON.stringify(lineItems),
        subtotal,
        taxRate,
        taxAmount,
        discountAmount: discount,
        totalDue,
        amountPaid: 0,
      },
      include: { client: { select: { id: true, name: true, address: true } } },
    });

    await logAudit({
      userId: sessionUser.id,
      action: 'GENERATE_INVOICE',
      details: `Generated invoice ${invoiceNumber} for ${client.name} (${formatDate(periodStart)} - ${formatDate(periodEnd)}), total $${totalDue.toFixed(2)}.`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({ success: true, invoice: { ...invoice, lineItems, balance: totalDue, status: 'PENDING' } });
  } catch (error) {
    console.error('Failed to generate invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
