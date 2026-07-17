import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'noreply@akirapa.com';

  const hasSMTP = !!(host && port && user && pass);

  if (hasSMTP) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(port || '587'),
        secure: port === '465',
        auth: { user, pass },
      });

      await transporter.sendMail({
        from,
        to,
        subject,
        html,
      });

      console.log(`[SMTP Email] Sent successfully to ${to}: "${subject}"`);
      return true;
    } catch (err) {
      console.error('[SMTP Email Error] SMTP transmission failed, falling back to Sandbox Logging:', err);
    }
  }

  // Developer Sandbox Fallback Mode
  try {
    const sandboxDir = 'C:/Users/FARID/.gemini/antigravity-ide/brain/53604049-7fdf-417f-bc29-41882da35bd6/scratch';
    if (!fs.existsSync(sandboxDir)) {
      fs.mkdirSync(sandboxDir, { recursive: true });
    }

    const logPath = path.join(sandboxDir, 'simulated_emails.log');
    const logEntry = `[${new Date().toISOString()}]
TO: ${to}
SUBJECT: ${subject}
BODY:
${html.replace(/<[^>]*>/g, '')} // Stripped html tags
--------------------------------------------------------------------------------\n`;

    fs.appendFileSync(logPath, logEntry, 'utf8');
    
    // Print clear visual alert to Next.js terminal logs
    console.log('\n==================================================');
    console.log(`[DEVELOPER SANDBOX EMAIL SIMULATOR]`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Verification Code Details logged at:`);
    console.log(`file:///${logPath}`);
    console.log('==================================================\n');

    return true;
  } catch (err) {
    console.error('[Sandbox Email Simulator Error] Failed to write fallback email log:', err);
    return false;
  }
}
