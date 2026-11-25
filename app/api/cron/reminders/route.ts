import { sendDueReminders } from "@/lib/appointment-reminders";
import { isCronAuthorized } from "@/lib/cron-auth";
import { requestLogger } from "@/lib/logger";
import { pruneRateLimits } from "@/lib/rate-limit";

// Called by Vercel Cron (see vercel.json). Safe to call repeatedly: each reminder is
// claimed before it's sent, so a second call sends nothing new.
export async function GET(request: Request) {
  const log = requestLogger(request);

  if (!isCronAuthorized(request)) {
    if (!process.env.CRON_SECRET) log.error("CRON_SECRET is not set, so the reminder cron is refusing every call");
    else log.warn("reminder cron called without a valid secret");
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sendDueReminders();
  // Piggybacks on the daily cron (Vercel Hobby allows few) so rate_limits doesn't grow forever.
  await pruneRateLimits();
  log.info(result, "reminder cron finished");
  return Response.json(result); // counts only: no names, no addresses
}