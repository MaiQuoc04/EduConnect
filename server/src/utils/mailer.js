import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter;

// Sends one email through SMTP (SMTP_* in .env). In development without SMTP_HOST the email is printed to the
// server console instead, so features like UC-02 can be tested without a mail account.
export async function sendMail({ to, subject, text, html }) {
  if (!env.mail.host) {
    if (env.isProduction) throw new Error('SMTP_HOST is not configured');
    console.log(`[mail:dev] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  transporter ??= nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.port === 465,
    auth: env.mail.user ? { user: env.mail.user, pass: env.mail.pass } : undefined,
  });
  await transporter.sendMail({ from: env.mail.from, to, subject, text, html });
}
