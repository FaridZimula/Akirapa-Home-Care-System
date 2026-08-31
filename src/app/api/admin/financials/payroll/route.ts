import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';

export async function GET(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Payroll management is restricted to administrators' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    const records = await prisma.payrollRecord.findMany({
      where: userId ? { userId } : undefined,
      include: {
        user: { select: { id: true, name: true, email: true, role: true, payRate: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ records });
  } catch (error) {
    console.error('Failed to fetch payroll records:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Payroll entry is restricted to administrators' }, { status: 403 });
    }

    const body = await request.json();

    // Check if bulk upload (array) or single record creation
    const isBulk = Array.isArray(body.records);
    const recordsToProcess = isBulk ? body.records : [body];

    const createdRecords = [];

    for (const item of recordsToProcess) {
      const {
        userId,
        payPeriodStart,
        payPeriodEnd,
        hourlyRate,
        regularHours,
        overtimeHours,
        bonus,
        deductions,
        paymentMethod,
        referenceNumber,
        status,
        notes,
      } = item;

      if (!userId || !payPeriodStart || !payPeriodEnd) {
        if (!isBulk) {
          return NextResponse.json({ error: 'User ID and Pay Period dates are required' }, { status: 400 });
        }
        continue;
      }

      const rate = parseFloat(hourlyRate) || 0;
      const reg = parseFloat(regularHours) || 0;
      const ot = parseFloat(overtimeHours) || 0;
      const b = parseFloat(bonus) || 0;
      const d = parseFloat(deductions) || 0;

      // Calculate Gross Pay = (Regular Hours * Rate) + (Overtime Hours * Rate * 1.5) + Bonus
      const grossPay = Math.round(((reg * rate) + (ot * rate * 1.5) + b) * 100) / 100;

      // Calculate Net Pay = Gross Pay - Deductions
      const netPay = Math.max(0, Math.round((grossPay - d) * 100) / 100);

      const record = await prisma.payrollRecord.create({
        data: {
          userId,
          payPeriodStart: new Date(payPeriodStart),
          payPeriodEnd: new Date(payPeriodEnd),
          hourlyRate: rate,
          regularHours: reg,
          overtimeHours: ot,
          bonus: b,
          deductions: d,
          grossPay,
          netPay,
          paymentMethod: paymentMethod || 'Direct Deposit',
          referenceNumber: referenceNumber || null,
          status: status || 'PAID',
          paidAt: status === 'DRAFT' ? null : new Date(),
          notes: notes || null,
        },
        include: {
          user: { select: { name: true, email: true } },
        },
      });

      // Update user's default payRate if passed
      if (rate > 0) {
        await prisma.user.update({
          where: { id: userId },
          data: { payRate: rate },
        });
      }

      // Notify employee of payslip issue
      await createNotification({
        userId,
        title: '💵 Payroll Statement Published',
        message: `Your payroll statement for period ending ${new Date(payPeriodEnd).toLocaleDateString()} has been generated. Net Pay: $${netPay.toFixed(2)}.`,
        type: 'INVOICE_ISSUED',
      });

      createdRecords.push(record);
    }

    await logAudit({
      userId: sessionUser.id,
      action: 'ADMIN_CREATE_PAYROLL',
      details: `Admin ${sessionUser.email} processed ${createdRecords.length} payroll record(s).`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({
      success: true,
      count: createdRecords.length,
      records: createdRecords,
      message: `Processed ${createdRecords.length} payroll statement(s) successfully.`,
    });
  } catch (error) {
    console.error('Failed to create payroll record:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Payroll updates are restricted to administrators' }, { status: 403 });
    }

    const { id, status, referenceNumber, paymentMethod, notes } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Payroll Record ID is required' }, { status: 400 });
    }

    const updatedRecord = await prisma.payrollRecord.update({
      where: { id },
      data: {
        status: status || 'PAID',
        referenceNumber: referenceNumber ?? undefined,
        paymentMethod: paymentMethod ?? undefined,
        notes: notes ?? undefined,
        paidAt: status === 'PAID' ? new Date() : undefined,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (status === 'PAID') {
      await createNotification({
        userId: updatedRecord.userId,
        title: '✅ Payroll Paid',
        message: `Your net salary payment of $${updatedRecord.netPay.toFixed(2)} has been disbursed via ${updatedRecord.paymentMethod || 'Direct Deposit'}.`,
        type: 'PAYMENT_RECEIVED',
      });
    }

    await logAudit({
      userId: sessionUser.id,
      action: 'ADMIN_UPDATE_PAYROLL',
      details: `Admin ${sessionUser.email} updated payroll record ${id} status to ${status}.`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({ success: true, record: updatedRecord });
  } catch (error) {
    console.error('Failed to update payroll record:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
