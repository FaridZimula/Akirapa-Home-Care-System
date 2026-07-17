import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const { email, purpose } = await request.json();

    if (!email || !purpose) {
      return NextResponse.json({ error: 'Email and purpose are required' }, { status: 400 });
    }

    if (purpose !== 'SIGNUP' && purpose !== 'PASSWORD_RESET') {
      return NextResponse.json({ error: 'Invalid verification purpose' }, { status: 400 });
    }

    // Check user existence
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (purpose === 'SIGNUP' && user) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 });
    }

    if (purpose === 'PASSWORD_RESET' && !user) {
      return NextResponse.json({ error: 'No account found with this email address' }, { status: 400 });
    }

    // Generate a 6-digit numeric token
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // Expires in 15 minutes

    // Delete any previous tokens for this email and purpose to avoid clutter
    await prisma.verificationToken.deleteMany({
      where: { email, purpose },
    });

    // Create the token in the database
    await prisma.verificationToken.create({
      data: {
        email,
        token,
        purpose,
        expiresAt,
      },
    });

    // Send email with OTP code
    const subject = purpose === 'SIGNUP' 
      ? 'Akirapa Sign Up Verification Code' 
      : 'Akirapa Password Reset Code';

    const html = `
      <div style="font-family: sans-serif; padding: 24px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; rounded: 12px;">
        <h2 style="color: #6d28d9; margin-bottom: 16px;">Akirapa In-Home Care</h2>
        <p>You requested a verification code for the purpose of <strong>${purpose === 'SIGNUP' ? 'creating an account' : 'resetting your password'}</strong>.</p>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 4px; margin: 24px 0; color: #111;">
          ${token}
        </div>
        <p style="font-size: 12px; color: #666; margin-top: 24px;">This code is valid for 15 minutes. If you did not request this code, please ignore this email.</p>
      </div>
    `;

    const sent = await sendEmail({ to: email, subject, html });

    if (sent) {
      return NextResponse.json({ success: true, message: 'Verification code sent successfully' });
    } else {
      return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 });
    }

  } catch (err) {
    console.error('Failed to generate verification token:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
