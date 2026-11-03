import { PrototypeNotice } from "@/components/prototype-notice";
import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <PrototypeNotice />
      <main id="main" className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
        <Logo />
        <div className="mt-6 w-full max-w-md">{children}</div>
      </main>
    </>
  );
}
