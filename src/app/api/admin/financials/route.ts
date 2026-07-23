import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import { ShiftStatus } from '@prisma/client';

// Monday 00:00:00 (server local time) through now.
function getCurrentWeekStart(): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ...
  const daysSinceMonday = (day + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (sessionUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Payroll data is restricted to administrators' }, { status: 403 });
    }

    const weekStart = getCurrentWeekStart();
    const now = new Date();

    const completedShifts = await prisma.shift.findMany({
      where: {
        status: ShiftStatus.COMPLETED,
        actualStart: { gte: weekStart },
        actualEnd: { not: null },
      },
      select: {
        caregiverId: true,
        actualStart: true,
        actualEnd: true,
        isOvertime: true,
        caregiver: { select: { id: true, name: true, email: true, payRate: true } },
      },
    });

    const byCaregiver = new Map<string, {
      id: string;
      name: string;
      email: string;
      payRate: number | null;
      hoursWorked: number;
      shiftsCompleted: number;
      overtimeShifts: number;
    }>();

    for (const shift of completedShifts) {
      if (!shift.actualStart || !shift.actualEnd) continue;
      const hours = (shift.actualEnd.getTime() - shift.actualStart.getTime()) / (1000 * 60 * 60);
      const existing = byCaregiver.get(shift.caregiverId);
      if (existing) {
        existing.hoursWorked += hours;
        existing.shiftsCompleted += 1;
        if (shift.isOvertime) existing.overtimeShifts += 1;
      } else {
        byCaregiver.set(shift.caregiverId, {
          id: shift.caregiver.id,
          name: shift.caregiver.name,
          email: shift.caregiver.email,
          payRate: shift.caregiver.payRate,
          hoursWorked: hours,
          shiftsCompleted: 1,
          overtimeShifts: shift.isOvertime ? 1 : 0,
        });
      }
    }

    const caregiverPayroll = Array.from(byCaregiver.values())
      .map(c => ({
        ...c,
        hoursWorked: Math.round(c.hoursWorked * 100) / 100,
        wagesOwed: c.payRate != null ? Math.round(c.hoursWorked * c.payRate * 100) / 100 : null,
      }))
      .sort((a, b) => (b.wagesOwed ?? 0) - (a.wagesOwed ?? 0));

    const totalPayroll = caregiverPayroll.reduce((sum, c) => sum + (c.wagesOwed ?? 0), 0);
    const totalHours = caregiverPayroll.reduce((sum, c) => sum + c.hoursWorked, 0);
    const caregiversMissingRate = caregiverPayroll.filter(c => c.payRate == null).length;

    return NextResponse.json({
      weekStart: weekStart.toISOString(),
      weekEnd: now.toISOString(),
      caregiverPayroll,
      totalPayroll: Math.round(totalPayroll * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
      caregiversMissingRate,
    });
  } catch (error) {
    console.error('Failed to compute financials:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
