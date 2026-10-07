import { PreviewBar } from "@/components/preview-bar";
import { Logo } from "@/components/ui";
import { getViewer } from "@/lib/mock-data";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();

  return (
    <>
      <PreviewBar role={viewer?.role ?? "out"} />
      <main id="main" className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
        <Logo />
        <div className="mt-6 w-full max-w-md">{children}</div>
      </main>
    </>
  );
}
