"use client";
import { useActionState, type ReactNode } from "react";
import { signUp } from "../actions";

/**
 * Wraps the sign-up fields (rendered by the page) in a form that posts to the
 * signUp server action and shows its error.
 */
export function SignupForm({ as, next, children }: { as: string; next?: string; children: ReactNode }) {
  const [state, action, pending] = useActionState(signUp, {});

  return (
    <form action={action} className="mt-6 space-y-4">
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {/* The server re-checks both: `as` against an allowlist, `next` with safeNext. */}
      <input type="hidden" name="as" value={as} />
      {next && <input type="hidden" name="next" value={next} />}

      {children}

      <button type="submit" disabled={pending} className="btn btn-primary w-full disabled:opacity-60">
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
