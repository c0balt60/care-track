// Better Auth setup: email + password accounts, sessions stored in the database
// and identified by an httpOnly cookie. Docs: https://www.better-auth.com/docs
//
// Named better-auth.ts (not auth.ts) because lib/auth.ts holds getViewer/requireRole,
// which read the session from here. To check who is signed in or what they may open,
// use lib/auth.ts: it also checks the role's profile row, which a bare session doesn't.
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "./db";
import * as schema from "./db/schema";
import { eq } from "drizzle-orm";
import { APIError } from "better-auth/api";

// Vercel previews get a new URL per push, so a fixed BETTER_AUTH_URL can't match them and
// log-in fails with "Invalid origin". On a preview, use the branch URL Vercel sets and also
// trust the per-commit URL. Only this deployment's own hosts, never "*.vercel.app", which
// would trust every other Vercel site too. Elsewhere these are unset and BETTER_AUTH_URL wins.
const { VERCEL_ENV, VERCEL_URL, VERCEL_BRANCH_URL } = process.env;
const isPreview = VERCEL_ENV === "preview";

export const auth = betterAuth({
  // BETTER_AUTH_SECRET (signs cookies) is read from the environment; so is BETTER_AUTH_URL
  // outside Vercel previews.
  baseURL: isPreview ? `https://${VERCEL_BRANCH_URL ?? VERCEL_URL}` : undefined,
  trustedOrigins: isPreview && VERCEL_URL ? [`https://${VERCEL_URL}`] : [],

  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    // Our tables are plural: users, sessions, accounts, verifications.
    usePlural: true,
  }),

  // Block sign-up over HTTP (POST /api/auth/sign-up/email returns 404). Every new account
  // must go through the signUp server action, which validates the profile fields and
  // creates the patients row. auth.api.signUpEmail() skips the HTTP router, so the
  // action still works.
  disabledPaths: ["/sign-up/email"],

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

    // A disabled account can't start a new session. Admins disable accounts from /admin, which
  // also deletes the sessions it already has, so it's signed out right away.
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const [user] = await db
            .select({ disabledAt: schema.users.disabledAt })
            .from(schema.users)
            .where(eq(schema.users.id, session.userId))
            .limit(1);
          if (user?.disabledAt) {
            throw new APIError("FORBIDDEN", { message: "This account has been disabled.", code: "ACCOUNT_DISABLED" });
          }
        },
      },
    },
  },

  advanced: {
    // Postgres makes the ids (gen_random_uuid), like every other table here.
    database: { generateId: "uuid" },
  },

  // Lets server actions set the session cookie. Must stay the last plugin.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
