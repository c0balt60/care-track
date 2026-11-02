"use server";
// Sign up, log in, and log out. The forms call these directly (server actions),
// so the password never passes through client-side JavaScript we wrote.
// Better Auth does the hashing, sessions, and cookies (lib/better-auth.ts);
// nextCookies() lets it set the session cookie from here.
import { eq } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/better-auth";
import { db } from "@/lib/db";
import { patients, users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { safeNext } from "@/lib/safe-next";

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

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const as = text(form, "as");
  if (!Object.hasOwn(SIGNUP_ROLES, as)) return { error: "Choose what describes you first." };
  const role = SIGNUP_ROLES[as as keyof typeof SIGNUP_ROLES];

  const name = text(form, "name");
  const email = text(form, "email");
  const password = form.get("password");
  if (!name || name.length > 200) return { error: "Enter your full name." };
  if (!email) return { error: "Enter your email." };
  if (typeof password !== "string" || password.length < 8) return { error: "Use a password of at least 8 characters." };

  // Patients book with the date of birth and phone from their account (see the outline).
  const dob = text(form, "dob");
  const phone = text(form, "phone");
  if (role === "patient") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob)) || new Date(dob) > new Date()) {
      return { error: "Enter a valid date of birth." };
    }
    if (!phone || phone.length > 40) return { error: "Enter your phone number." };
  }

  let userId: string;
  try {
    // Creates the user (role defaults to "patient"), the credential account with the
    // scrypt hash, and a session, then sets the httpOnly session cookie.
    const res = await auth.api.signUpEmail({ body: { name, email, password }, headers: await headers() });
    userId = res.user.id;
  } catch (err) {
    if (isAPIError(err)) {
      if (err.body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return { error: "An account with that email already exists. Try logging in." };
      if (err.body?.code === "INVALID_EMAIL") return { error: "Enter a valid email." };
      if (err.body?.code === "PASSWORD_TOO_LONG") return { error: "Use a password of at most 128 characters." };
    }
    logError(err, "Sign-up failed");
    return { error: "Something went wrong. Please try again." };
  }

  try {
    await db.transaction(async (tx) => {
      if (role !== "patient") await tx.update(users).set({ role }).where(eq(users.id, userId));
      if (role === "patient") await tx.insert(patients).values({ userId, name, dob, phone });
      // TODO(onboarding): practitioner and clinic profiles need city, time zone, and slot
      // length the form doesn't ask for yet, so their rows are created in a later step.
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
  const email = text(form, "email");
  const password = form.get("password");
  if (!email || typeof password !== "string" || !password) return { error: "Enter your email and password." };

  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
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
