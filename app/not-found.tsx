import Link from "next/link";
import { EmptyState, Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-6 px-4 py-16">
      <Logo />
      <EmptyState
        title="Page not found"
        text="This page doesn’t exist, or your account can’t see it."
        action={<Link href="/" className="btn btn-primary">Go to the home page</Link>}
      />
    </main>
  );
}
