import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shiftId = searchParams.get('shiftId');

    if (!shiftId) {
      return NextResponse.json({ error: 'shiftId parameter is required' }, { status: 400 });
    }

    const tasks = await prisma.shiftTask.findMany({
      where: { shiftId },
      orderBy: { scheduledTime: 'asc' },
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Failed to fetch shift tasks:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { taskId, shiftId, taskName, description, scheduledTime, isCompleted } = await request.json();

    // 1. Toggle completion of existing task
    if (taskId) {
      const updatedTask = await prisma.shiftTask.update({
        where: { id: taskId },
        data: {
          isCompleted: Boolean(isCompleted),
          completedAt: isCompleted ? new Date() : null,
        },
      });

      return NextResponse.json({ success: true, task: updatedTask });
    }

    // 2. Add new shift task if shiftId and task details provided
    if (shiftId && (taskName || description)) {
      const newTask = await prisma.shiftTask.create({
        data: {
          shiftId,
          taskName: taskName || 'Care Task',
          description: description || taskName || 'Shift task item',
          scheduledTime: scheduledTime || '09:00 AM',
          isCompleted: false,
        },
      });

      await logAudit({
        userId: 'CAREGIVER',
        action: 'ADD_SHIFT_TASK',
        details: `Added shift task "${newTask.description}" to shift ID ${shiftId}`,
        outcome: 'SUCCESS',
      });

      return NextResponse.json({ success: true, task: newTask });
    }

    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  } catch (error) {
    console.error('Failed to update shift task:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
