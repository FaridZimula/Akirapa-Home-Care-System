import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { UserRole, PodRole, ShiftStatus } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const { 
      email, 
      password, 
      name, 
      phoneNumber, 
      role,
      patientName,
      patientAddress,
      patientLatitude,
      patientLongitude,
      careNeeds,
      medicalHistory,
      emergencyName,
      emergencyPhone,
      emergencyRelation
    } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    // Determine role (default to CAREGIVER, no signup for ADMIN)
    let finalRole: UserRole = UserRole.CAREGIVER;
    if (role === 'CLIENT' || role === 'FAMILY_MEMBER') {
      finalRole = UserRole.FAMILY_MEMBER;
    }

    // Create new user record
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: password, // Plain-text passwords for mock prototype simplicity
        name,
        role: finalRole,
        phoneNumber: phoneNumber || '+16045550199',
      },
    });

    // Handle Caregiver profile seeding so they have immediate test data
    if (finalRole === UserRole.CAREGIVER) {
      const client = await prisma.client.findFirst();
      if (client) {
        // Add to caregiver pod as PRIMARY or SECONDARY_1
        await prisma.caregiverPod.create({
          data: {
            clientId: client.id,
            caregiverId: user.id,
            role: PodRole.PRIMARY,
          },
        }).catch(() => {
          return prisma.caregiverPod.create({
            data: {
              clientId: client.id,
              caregiverId: user.id,
              role: PodRole.SECONDARY_1,
            },
          }).catch(() => {});
        });

        // Create active shift scheduled for today
        const start = new Date();
        start.setMinutes(start.getMinutes() + 15);
        const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);
        const confirmationDeadline = new Date(start.getTime() - 24 * 60 * 60 * 1000);

        const shift = await prisma.shift.create({
          data: {
            clientId: client.id,
            caregiverId: user.id,
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

    // Handle Client / Family member profile creation and linking
    if (finalRole === UserRole.FAMILY_MEMBER) {
      let targetClientId: string | null = null;

      if (patientName && patientAddress) {
        // Create custom patient profile from signup fields
        const client = await prisma.client.create({
          data: {
            name: patientName,
            address: patientAddress,
            latitude: parseFloat(patientLatitude) || 49.2827,
            longitude: parseFloat(patientLongitude) || -123.1207,
            geofenceRadiusMeter: 150,
          },
        });
        targetClientId = client.id;

        // Seed a dynamic care plan for the client
        const carePlan = await prisma.carePlan.create({
          data: {
            clientId: client.id,
          },
        });

        const seededTasks = [];

        // Check Care Needs
        if (careNeeds?.medication) {
          seededTasks.push({
            taskName: 'Medication Administration',
            description: 'Administer scheduled medications. Ensure caregiver observes ingestion.',
            scheduledTime: '08:00 AM',
            isMandatory: true,
          });
        }
        if (careNeeds?.mobility) {
          seededTasks.push({
            taskName: 'Mobility Walk & Transfer Support',
            description: 'Support patient with transferring from bed and perform 15-min walk.',
            scheduledTime: '11:00 AM',
            isMandatory: true,
          });
        }
        if (careNeeds?.bathing) {
          seededTasks.push({
            taskName: 'Bathing & Dressing Assistance',
            description: 'Assist client with personal hygiene and dressing for the day.',
            scheduledTime: '09:00 AM',
            isMandatory: true,
          });
        }
        if (careNeeds?.mealPrep) {
          seededTasks.push({
            taskName: 'Meal Preparation & Nutrition',
            description: 'Prepare a healthy balanced meal and assist with dietary needs.',
            scheduledTime: '01:00 PM',
            isMandatory: true,
          });
        }
        if (careNeeds?.companionship) {
          seededTasks.push({
            taskName: 'Social Engagement & Conversation',
            description: 'Engage client in memory stimulation, reading, or conversation.',
            scheduledTime: '04:00 PM',
            isMandatory: false,
          });
        }

        // Check Medical Concerns to add specific clinical oversight
        if (medicalHistory?.hypertension) {
          seededTasks.push({
            taskName: 'Vital Signs Checklist (Hypertension)',
            description: 'Measure blood pressure and heart rate. Log in clinical feed.',
            scheduledTime: '10:00 AM',
            isMandatory: true,
          });
        }
        if (medicalHistory?.cognitive) {
          seededTasks.push({
            taskName: 'Cognitive Reality Orientation',
            description: 'Orient client to date, location, and engage in cognitive exercises.',
            scheduledTime: '02:00 PM',
            isMandatory: true,
          });
        }
        if (medicalHistory?.falls) {
          seededTasks.push({
            taskName: 'Safety Risk Assessment & Cleared Walkways',
            description: 'Verify patient walker access and ensure floors are free of trip hazards.',
            scheduledTime: '08:30 AM',
            isMandatory: true,
          });
        }

        // Fallback default tasks if nothing selected
        if (seededTasks.length === 0) {
          seededTasks.push(
            {
              taskName: 'Vital Signs Checklist',
              description: 'Verify temperature and blood pressure.',
              scheduledTime: '10:00 AM',
              isMandatory: true,
            },
            {
              taskName: 'Medication Administration',
              description: 'Administer Lisinopril 10mg.',
              scheduledTime: '12:00 PM',
              isMandatory: true,
            }
          );
        }

        await prisma.carePlanTask.createMany({
          data: seededTasks.map(t => ({
            carePlanId: carePlan.id,
            ...t
          }))
        });
      } else {
        // Fallback to first existing client
        const client = await prisma.client.findFirst();
        if (client) {
          targetClientId = client.id;
        }
      }

      if (targetClientId) {
        await prisma.linkedFamilyMember.create({
          data: {
            clientId: targetClientId,
            userId: user.id,
          },
        }).catch(() => {});
      }
    }

    // Audit log dynamic registration
    await logAudit({
      userId: user.id,
      action: 'REGISTRATION_SUCCESS',
      details: `User registered account: ${email} with role ${user.role}`,
      outcome: 'SUCCESS',
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phoneNumber: user.phoneNumber,
      },
    });

    // Set mock session cookie
    response.cookies.set('session_user', JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phoneNumber: user.phoneNumber,
    }), {
      path: '/',
      httpOnly: false,
      maxAge: 60 * 15, // 15 mins session matching idle timeout
    });

    return response;
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
