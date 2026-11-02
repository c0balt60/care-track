// Every /api/auth/* request (sign-in, sign-up, sign-out, get-session, ...) goes to Better Auth.
// Our forms use server actions instead (app/(auth)/actions.ts); this handler is for
// Better Auth's own endpoints and any future client SDK use.
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/better-auth";

export const { GET, POST } = toNextJsHandler(auth);
