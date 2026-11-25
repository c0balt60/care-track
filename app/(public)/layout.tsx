import { Footer } from "@/components/footer";
import { DemoNotice } from "@/components/demo-notice";
import { Topbar } from "@/components/topbar";
import { getViewer } from "@/lib/auth";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();

  return (
    <>
      <DemoNotice />
      <Topbar signedIn={!!viewer} />
      <main id="main" className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
