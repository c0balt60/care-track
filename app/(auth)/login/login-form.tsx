"use client";
import { useActionState } from "react";
import { logIn } from "../actions";

/** The form posts straight to the logIn server action; useActionState shows its error. */
export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(logIn, {});

  return (
    <form className="mt-6 space-y-4" action={action}>
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {/* Checked again on the server with safeNext before redirecting. */}
      {next && <input type="hidden" name="next" value={next} />}

      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" placeholder="name@example.com" />
      </div>

      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary w-full disabled:opacity-60">
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
