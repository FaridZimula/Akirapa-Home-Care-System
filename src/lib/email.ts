import nodemailer from 'nodemailer';

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
  const from = process.env.SMTP_FROM || (user ? `Akirapa Home Care <${user}>` : 'Akirapa Home Care <info@akirapahomecareus.com>');

  if (!host || !port || !user || !pass) {
    console.error('[SMTP Email Error] SMTP_HOST/PORT/USER/PASS are not configured; email was not sent.');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port, 10),
      secure: port === '465',
      auth: { user, pass },
      // Some local dev machines run antivirus (e.g. Avast Mail Shield) that MITMs
      // outbound TLS with a self-signed cert Node doesn't trust. Only relax
      // validation outside production, where no such interception exists.
      tls: process.env.NODE_ENV === 'production' ? undefined : { rejectUnauthorized: false },
    });

    await transporter.sendMail({ from, to, subject, html });

    console.log(`[SMTP Email] Sent successfully to ${to}: "${subject}"`);
    return true;
  } catch (err) {
    console.error('[SMTP Email Error] SMTP transmission failed:', err);
    return false;
  }
}
