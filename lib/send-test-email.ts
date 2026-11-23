// Sends one test email: `pnpm email:test`, or `pnpm email:test someone@example.com`.
// Locally it lands in Mailpit at http://localhost:8025.
// Careful: if RESEND_API_KEY is set in your .env, this sends a real email.
import { sendEmail } from "./email";

async function main() {
  const to = process.argv[2] ?? "test@example.com";
  await sendEmail({
    to,
    subject: "CareTrack test email",
    text: "If you can read this, sendEmail() works.",
    html: "<p>If you can read this, <strong>sendEmail()</strong> works.</p>",
  });
  console.log(`Sent a test email to ${to}.`);
  console.log(`Local inbox: http://localhost:${process.env.MAILPIT_UI_PORT ?? 8025}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});