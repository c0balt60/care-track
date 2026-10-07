import { Logo } from "./ui";

export function Footer() {
  return (
    <footer className="bg-sand">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-6">
        <div>
          <Logo />
          <p className="mt-1">Designing valuable solutions</p>
        </div>
        <p>A student project. Not for real medical care.</p>
      </div>
    </footer>
  );
}
