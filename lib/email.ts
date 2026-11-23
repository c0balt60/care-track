// Sends email. Locally that means SMTP to Mailpit (the fake inbox from docker compose,
// read at http://localhost:8025); in production it means Resend. RESEND_API_KEY picks
// which one, so callers just call sendEmail() and never care.
import nodemailer from "nodemailer";
import { logger } from "./logger";

const log = logger.child({ module: "email" });

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain-text body. Always required, so every mail client has something to show. */
  text: string;
  html?: string;
};

const DEFAULT_FROM = "CareTrack <noreply@caretrack.local>";

/** One address with no spaces or commas. Line breaks in headers are how email injection starts. */
const ADDRESS = /^[^\s@<>,;]+@[^\s@<>,;]+$/;

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!ADDRESS.test(message.to)) throw new Error("sendEmail: invalid recipient address");
  if (/[\r\n]/.test(message.subject)) throw new Error("sendEmail: the subject can't contain line breaks");

  const apiKey = process.env.RESEND_API_KEY;
  let transport: "resend" | "smtp";

  if (apiKey) {
    transport = "resend";
    await sendWithResend(apiKey, message);
  } else if (process.env.NODE_ENV === "production") {
    // Fail loudly. Quietly trying localhost:1025 from a server would lose the email.
    throw new Error("sendEmail: RESEND_API_KEY is not set");
  } else {
    transport = "smtp";
    await sendWithSmtp(message);
  }

  // The subject only: the recipient is personal data.
  log.info({ transport, subject: message.subject }, "email sent");
}

async function sendWithResend(apiKey: string, m: EmailMessage) {
  // Resend only sends from a domain verified in its dashboard, so there's no safe default.
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("sendEmail: EMAIL_FROM must be set when RESEND_API_KEY is set");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    // Resend explains itself in the body (e.g. "domain is not verified").
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`sendEmail: Resend rejected the message (HTTP ${response.status}) ${detail}`);
  }
}

async function sendWithSmtp(m: EmailMessage) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
    ignoreTLS: true, // Mailpit speaks plain SMTP
  });
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
      to: m.to,
      subject: m.subject,
      text: m.text,
      html: m.html,
    });
  } finally {
    transporter.close();
  }
}