"use server";
// Sign up, log in, and log out. The forms call these directly (server actions),
// so the password never passes through client-side JavaScript we wrote.
// Better Auth does the hashing, sessions, and cookies (lib/better-auth.ts);
// nextCookies() lets it set the session cookie from here.
import { eq } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/better-auth";
import { db } from "@/lib/db";
import { patients, users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { clientIp, LIMITS, rateLimit, tooManyAttempts } from "@/lib/rate-limit";
import { safeNext } from "@/lib/safe-next";
import { dob as dobField } from "@/lib/patient-details";
import { parse, phone, requiredText } from "@/lib/validation";
import { z } from "zod";

export type FormState = { error?: string };

/** A trimmed text field, or "" when missing. */
const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

/** Logs an unexpected error. Never pass form data here: it holds the password. */
function logError(err: unknown, msg: string) {
  logger.error({ err }, msg);
}

// `as` on the sign-up page → role in the users table. Admin is deliberately not here:
// admins are only ever made by another admin (ADM-1 #32) or the seed script.
const SIGNUP_ROLES = { patient: "patient", practitioner: "practitioner", clinic: "staff" } as const;

// These forms show the error as text, so each schema's error is the message itself.
const signUpForm = z.object({
  as: z.enum(Object.keys(SIGNUP_ROLES) as (keyof typeof SIGNUP_ROLES)[], { error: "Choose what describes you first." }),
  name: requiredText(200, "Enter your full name."),
  email: requiredText(254, "Enter your email.").pipe(z.email({ error: "Enter a valid email." })),
  password: z
    .string({ error: "Use a password of at least 8 characters." })
    .min(8)
    .max(128, { error: "Use a password of at most 128 characters." }), // Better Auth's limit
});

// Patients book with the date of birth and phone from their account (see the outline).
// The same rules as the /settings form, so a value accepted here can be saved there.
const patientSignUpFields = (today: string) =>
  z.object({ dob: dobField(today, "Enter a valid date of birth."), phone: phone("Enter a valid phone number.") });

const logInForm = z.object({
  email: requiredText(254, "Enter your email and password."),
  password: z.string({ error: "Enter your email and password." }).min(1).max(128, { error: "Email or password is incorrect." }),
});

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const fields = parse(signUpForm, form);
  if (!fields.ok) return { error: fields.error };
  const { name, email, password } = fields.data;
  const role = SIGNUP_ROLES[fields.data.as];

  let dob = "";
  let phone = "";
  if (role === "patient") {
    const extra = parse(patientSignUpFields(new Date().toISOString().slice(0, 10)), form);
    if (!extra.ok) return { error: extra.error };
    ({ dob, phone } = extra.data);
  }

  // After validation, so typos don't use up attempts; before the account is made.
  const h = await headers();
  const wait = await rateLimit(`signup:ip:${clientIp(h)}`, LIMITS.signupPerIp);
  if (wait) return { error: tooManyAttempts(wait) };

  let userId: string;
  try {
    // Creates the user (role defaults to "patient"), the credential account with the
    // scrypt hash, and a session, then sets the httpOnly session cookie.
    const res = await auth.api.signUpEmail({ body: { name, email, password }, headers: h });
    userId = res.user.id;
  } catch (err) {
    if (isAPIError(err)) {
      if (err.body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return { error: "An account with that email already exists. Try logging in." };
      if (err.body?.code === "INVALID_EMAIL") return { error: "Enter a valid email." };
    }
    logError(err, "Sign-up failed");
    return { error: "Something went wrong. Please try again." };
  }

  try {
    // Audit rows go in the same transaction, so a failed log undoes the change (AUD-2 #15).
    await db.transaction(async (tx) => {
      if (role === "patient") {
        const [patient] = await tx.insert(patients).values({ userId, name, dob, phone }).returning({ id: patients.id });
        await audit(userId, "patient.create", "patients", patient.id, null, tx);
      } else {
        await tx.update(users).set({ role }).where(eq(users.id, userId));
        await audit(userId, "user.role_change", "users", userId, { role: { from: "patient", to: role } }, tx);
      }
      // TODO(onboarding): practitioner and clinic profiles need details the sign-up form
      // doesn't ask for yet (see signup/page.tsx), so their rows are created in a later step.
    });
  } catch (err) {
    // Don't leave a half-made account behind: deleting the user cascades to its
    // session and account rows. The browser keeps a cookie for a session that no longer exists.
    await db.delete(users).where(eq(users.id, userId));
    logError(err, "Sign-up profile step failed");
    return { error: "Something went wrong. Please try again." };
  }

  redirect(safeNext(text(form, "next")));
}

export async function logIn(_prev: FormState, form: FormData): Promise<FormState> {
  const fields = parse(logInForm, form);
  if (!fields.ok) return { error: fields.error };
  const { email, password } = fields.data;

  // Per IP stops one attacker trying many accounts; per email stops many IPs trying one account.
  const h = await headers();
  const wait =
    (await rateLimit(`login:ip:${clientIp(h)}`, LIMITS.loginPerIp)) ||
    (await rateLimit(`login:email:${email.toLowerCase()}`, LIMITS.loginPerEmail));
  if (wait) return { error: tooManyAttempts(wait) };

  try {
    await auth.api.signInEmail({ body: { email, password }, headers: h });
  } catch (err) {
    // One message for wrong email and wrong password, so the form doesn't reveal who has an account.
    if (isAPIError(err) && (err.status === "UNAUTHORIZED" || err.status === "BAD_REQUEST")) {
      return { error: "Email or password is incorrect." };
    }
    logError(err, "Log-in failed");
    return { error: "Something went wrong. Please try again." };
  }

  // redirect() works by throwing, so it stays outside the try/catch.
  redirect(safeNext(text(form, "next")));
}

export async function logOut() {
  // Deletes the session row and clears the cookie. Fine to call when already signed out.
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (err) {
    if (!isAPIError(err)) logError(err, "Log-out failed");
  }
  redirect("/login");
}