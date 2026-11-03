import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getViewer } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();

  // Pages check access themselves with requireRole(); this only keeps the shell
  // from rendering for signed-out visitors. Coming back to the page after log-in
  // (?next=) is AUTH-3 (#13), done in proxy.ts.
  if (!viewer) redirect("/login");

  return <AppShell viewer={viewer}>{children}</AppShell>;
}
