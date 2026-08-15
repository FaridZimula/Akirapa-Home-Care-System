import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import { isBusinessHubAuthorized } from '@/lib/adminAllowlist';
import { ShiftStatus, UserRole } from '@prisma/client';

export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (sessionUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Business Hub access is restricted to Administrators' }, { status: 403 });
    }

    // Strict email authorization check for Business Hub
    if (!isBusinessHubAuthorized(sessionUser.email)) {
      return NextResponse.json(
        { error: 'Access Denied: Business Hub is restricted exclusively to authorized Senior Business Administrators (info@akirapahomecareus.com & cathy@akirapahomecareus.com).' },
        { status: 403 }
      );
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    // Fetch database entities
    const totalClients = await prisma.client.count();
    const totalCaregivers = await prisma.user.count({
      where: { role: UserRole.CAREGIVER },
    });

    const monthShifts = await prisma.shift.findMany({
      where: {
        scheduledStart: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      include: {
        caregiver: { select: { id: true, name: true, payRate: true } },
        client: { select: { id: true, name: true, billingRatePerHour: true } },
      },
    });

    let completedShiftsCount = 0;
    let totalCareHours = 0;
    let totalRevenue = 0;
    let totalPayroll = 0;
    let totalOvertimeShifts = 0;

    const statusCounts = {
      COMPLETED: 0,
      CONFIRMED: 0,
      UNCONFIRMED: 0,
      DROPPED: 0,
      IN_PROGRESS: 0,
      NO_SHOW: 0,
    };

    // Calculate weekly breakdown logs for graphics
    const weeklyData = [
      { weekLabel: 'Week 1 (1-7)', shifts: 0, hours: 0, revenue: 0, payroll: 0 },
      { weekLabel: 'Week 2 (8-14)', shifts: 0, hours: 0, revenue: 0, payroll: 0 },
      { weekLabel: 'Week 3 (15-21)', shifts: 0, hours: 0, revenue: 0, payroll: 0 },
      { weekLabel: 'Week 4 (22-End)', shifts: 0, hours: 0, revenue: 0, payroll: 0 },
    ];

    for (const shift of monthShifts) {
      if (statusCounts[shift.status] !== undefined) {
        statusCounts[shift.status]++;
      }

      if (shift.status === ShiftStatus.COMPLETED) {
        completedShiftsCount++;
        if (shift.isOvertime) totalOvertimeShifts++;

        const start = shift.actualStart || shift.scheduledStart;
        const end = shift.actualEnd || shift.scheduledEnd;
        const hours = Math.max(0.5, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
        totalCareHours += hours;

        const caregiverPayRate = shift.caregiver?.payRate || 25.0; // Default $25/hr
        const clientBillingRate = shift.client?.billingRatePerHour || 45.0; // Default $45/hr

        const shiftWages = hours * caregiverPayRate * (shift.isOvertime ? 1.5 : 1.0);
        const shiftBilling = hours * clientBillingRate;

        totalPayroll += shiftWages;
        totalRevenue += shiftBilling;

        // Group into weekly buckets
        const dayOfMonth = start.getDate();
        let weekIdx = 0;
        if (dayOfMonth >= 8 && dayOfMonth <= 14) weekIdx = 1;
        else if (dayOfMonth >= 15 && dayOfMonth <= 21) weekIdx = 2;
        else if (dayOfMonth >= 22) weekIdx = 3;

        weeklyData[weekIdx].shifts++;
        weeklyData[weekIdx].hours += Math.round(hours * 10) / 10;
        weeklyData[weekIdx].revenue += Math.round(shiftBilling);
        weeklyData[weekIdx].payroll += Math.round(shiftWages);
      }
    }

    const netProfit = Math.max(0, totalRevenue - totalPayroll);
    const profitMarginPercent = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;
    const avgShiftDuration = completedShiftsCount > 0 ? Math.round((totalCareHours / completedShiftsCount) * 10) / 10 : 0;
    const caregiverUtilization = totalCaregivers > 0 ? Math.round((completedShiftsCount / (totalCaregivers * 4)) * 100) : 0;

    return NextResponse.json({
      monthName,
      summary: {
        totalClients,
        totalCaregivers,
        totalShiftsInMonth: monthShifts.length,
        completedShiftsCount,
        totalCareHours: Math.round(totalCareHours * 10) / 10,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalPayroll: Math.round(totalPayroll * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        profitMarginPercent,
        avgShiftDuration,
        caregiverUtilization: Math.min(100, caregiverUtilization),
        totalOvertimeShifts,
      },
      statusCounts,
      weeklyData,
      generatedAt: now.toISOString(),
      authorizedBy: sessionUser.email,
    });
  } catch (error) {
    console.error('Failed to generate Business Hub stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
