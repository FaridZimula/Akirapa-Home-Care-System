import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { hashPassword, verifyPassword } from '@/lib/password';
import { createSessionCookie, sessionCookieOptions } from '@/lib/session';
import { UserRole, PodRole, ShiftStatus } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const { email, password, role } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Determine user role (defaults to CAREGIVER)
      let finalRole: UserRole = UserRole.CAREGIVER;
      if (role === 'ADMIN') finalRole = UserRole.ADMIN;
      else if (role === 'CARE_COORDINATOR') finalRole = UserRole.CARE_COORDINATOR;
      else if (role === 'CAREGIVER') finalRole = UserRole.CAREGIVER;
      else if (role === 'CLIENT' || role === 'FAMILY_MEMBER') finalRole = UserRole.FAMILY_MEMBER;

      // Extract username from email
      const emailName = email.split('@')[0];
      const name = emailName.charAt(0).toUpperCase() + emailName.slice(1) + ' (Guest)';

      // Register new user dynamically
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(password),
          name,
          role: finalRole,
          phoneNumber: '+16045550199',
        },
      });

      const userId = user.id;

      // Seeding shift, tasks, and pod map if CAREGIVER
      if (finalRole === UserRole.CAREGIVER) {
        const client = await prisma.client.findFirst();
        if (client) {
          // Add to caregiver pod as PRIMARY or backup
          await prisma.caregiverPod.create({
            data: {
              clientId: client.id,
              caregiverId: userId,
              role: PodRole.PRIMARY,
            },
          }).catch(() => {
            return prisma.caregiverPod.create({
              data: {
                clientId: client.id,
                caregiverId: userId,
                role: PodRole.SECONDARY_1,
              },
            }).catch(() => {});
          });

          // Create active shift scheduled for today
          const start = new Date();
          start.setMinutes(start.getMinutes() + 15); // Starts in 15 mins
          const end = new Date(start.getTime() + 8 * 60 * 60 * 1000); // 8-hour shift
          const confirmationDeadline = new Date(start.getTime() - 24 * 60 * 60 * 1000);

          const shift = await prisma.shift.create({
            data: {
              clientId: client.id,
              caregiverId: userId,
              status: ShiftStatus.CONFIRMED,
              scheduledStart: start,
              scheduledEnd: end,
              confirmationDeadline,
            },
          });

          // Create tasks for this shift
          await prisma.shiftTask.createMany({
            data: [
              {
                shiftId: shift.id,
                taskName: 'Vital Signs Checklist',
                description: 'Verify temperature and blood pressure. Log in clinical chart.',
                scheduledTime: '10:00 AM',
                isCompleted: false,
              },
              {
                shiftId: shift.id,
                taskName: 'Medication Administration',
                description: 'Administer Lisinopril 10mg. Document client ingestion.',
                scheduledTime: '12:00 PM',
                isCompleted: false,
              },
              {
                shiftId: shift.id,
                taskName: 'Mobility Walk & Hydration',
                description: 'Perform 15-minute garden walk support. Provide glass of water.',
                scheduledTime: '02:30 PM',
                isCompleted: false,
              },
            ],
          });
        }
      }

      // Link client if FAMILY_MEMBER
      if (finalRole === UserRole.FAMILY_MEMBER) {
        const client = await prisma.client.findFirst();
        if (client) {
          await prisma.linkedFamilyMember.create({
            data: {
              clientId: client.id,
              userId: user.id,
            },
          }).catch(() => {});
        }
      }

      // Audit dynamic registration
      await logAudit({
        userId: user.id,
        action: 'MOCK_REGISTRATION',
        details: `Simulated registration of guest account ${email} as ${user.role}`,
        outcome: 'SUCCESS',
      });
    } else {
      const validPassword = await verifyPassword(password, user.passwordHash);
      if (!validPassword) {
        await logAudit({
          userId: user.id,
          action: 'LOGIN_FAILED',
          details: `Failed login attempt for ${email}: incorrect password`,
          outcome: 'FAILURE',
        });
        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
      }
    }

    // Log audit for successful login
    await logAudit({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      details: `User logged in: ${email} with role ${user.role}`,
      outcome: 'SUCCESS',
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phoneNumber: user.phoneNumber,
      },
    });

    // Set signed, httpOnly session cookie
    const session = createSessionCookie(user.id);
    response.cookies.set(session.name, session.value, sessionCookieOptions(session.maxAge));

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
