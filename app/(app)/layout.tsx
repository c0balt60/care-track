import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, Logo } from "@/components/ui";
import { UserIcon } from "@/components/icons";
import { PreviewBar } from "@/components/preview-bar";
import { getViewer } from "@/lib/mock-data";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();

  // The real app redirects in proxy.ts instead (see the auth note in the outline).
  if (!viewer) {
    return (
      <>
        <PreviewBar role="out" />
        <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-6 px-4 py-16">
          <Logo />
          <EmptyState
            icon={<UserIcon />}
            title="Log in to continue"
            text="In the real app, signed-out visitors go to Log in and come back here afterward. Pick a role in the bar above to preview this page."
            action={<Link href="/login" className="btn btn-primary">Log in</Link>}
          />
        </main>
      </>
    );
  }

  return <AppShell viewer={viewer}>{children}</AppShell>;
}
