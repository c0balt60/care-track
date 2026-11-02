// Better Auth setup: email + password accounts, sessions stored in the database
// and identified by an httpOnly cookie. Docs: https://www.better-auth.com/docs
//
// Named better-auth.ts (not auth.ts) because lib/auth.ts already holds
// getViewer/requireRole, which switch over to this in AUTH-2 (#12).
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "./db";
import * as schema from "./db/schema";

export const auth = betterAuth({
  // BETTER_AUTH_SECRET (signs cookies) and BETTER_AUTH_URL are read from the environment.
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    // Our tables are plural: users, sessions, accounts, verifications.
    usePlural: true,
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8, // matches the sign-up form's hint
    autoSignIn: true, // signing up also signs you in
    // TODO(EML-1 #26): turn on requireEmailVerification once email sending exists.
  },

  user: {
    additionalFields: {
      role: {
        type: [...schema.USER_ROLES],
        required: true,
        defaultValue: "patient",
        // Server-owned: sign-up requests can't set it, so nobody can make themselves admin.
        // Our signUp action sets practitioner/staff after the account exists.
        input: false,
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // extend the expiry at most once a day while in use
  },

  advanced: {
    // Postgres makes the ids (gen_random_uuid), like every other table here.
    database: { generateId: "uuid" },
  },

  // Lets server actions set the session cookie. Must stay the last plugin.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
