import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const { clientId, title, taskName, description, scheduledTime, isMandatory } = await request.json();

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    // 1. Find or create CarePlan for client
    let carePlan = await prisma.carePlan.findFirst({
      where: { clientId },
      include: { tasks: true },
    });

    if (!carePlan) {
      carePlan = await prisma.carePlan.create({
        data: {
          clientId,
        },
        include: { tasks: true },
      });
    }

    // 2. Add task to CarePlan if task parameters provided
    if (taskName && description) {
      const newTask = await prisma.carePlanTask.create({
        data: {
          carePlanId: carePlan.id,
          taskName: taskName || 'Care Task',
          description,
          scheduledTime: scheduledTime || '09:00 AM',
          isMandatory: isMandatory !== undefined ? Boolean(isMandatory) : true,
        },
      });

      await logAudit({
        userId: 'ADMIN',
        action: 'CREATE_CARE_PLAN_TASK',
        details: `Added task "${description}" (${scheduledTime || '09:00 AM'}) to Care Plan for client: ${clientId}`,
        outcome: 'SUCCESS',
      });

      return NextResponse.json({ success: true, task: newTask, carePlanId: carePlan.id });
    }

    return NextResponse.json({ success: true, carePlan });
  } catch (error) {
    console.error('Failed to update care plan:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID parameter is required' }, { status: 400 });
    }

    await prisma.carePlanTask.delete({
      where: { id: taskId },
    });

    await logAudit({
      userId: 'ADMIN',
      action: 'DELETE_CARE_PLAN_TASK',
      details: `Deleted care plan task ID: ${taskId}`,
      outcome: 'SUCCESS',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete care plan task:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
