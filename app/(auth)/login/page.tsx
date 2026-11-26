import Link from "next/link";
import { Notice, param } from "@/components/ui";
import { LoginForm } from "./login-form";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = param(sp.next);
  const signup = next ? `/signup?next=${encodeURIComponent(next)}` : "/signup";
  // Where a patient lands after deleting their account (#78).
  const deleted = param(sp.notice) === "deleted";

  return (
    <div className="card p-6 sm:p-8">
      {deleted && <Notice>Your account has been deleted.</Notice>}
      <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
      <p className="mt-1 text-muted">Welcome back. Log in to book and manage appointments.</p>

      <LoginForm next={next} />

      <p className="mt-6 text-center text-sm text-muted">
        New to CareTrack? <Link href={signup} className="link">Create an account</Link>
      </p>
    </div>
  );
}
