import { Footer } from "@/components/footer";
import { PreviewBar } from "@/components/preview-bar";
import { Topbar } from "@/components/topbar";
import { getViewer } from "@/lib/mock-data";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();

  return (
    <>
      <PreviewBar role={viewer?.role ?? "out"} />
      <Topbar signedIn={!!viewer} />
      <main id="main" className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
