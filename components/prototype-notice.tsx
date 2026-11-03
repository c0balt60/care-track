// PROTOTYPE ONLY. Accounts are real, but most pages still show demo data from
// lib/mock-data.ts. Delete this notice together with that file in CMP-4 (#42).
export function PrototypeNotice() {
  return (
    <div className="bg-ink text-sm text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 sm:px-6">
        <span className="font-semibold">Prototype</span>
        <span className="text-white/70">Your account is real, but some pages still show demo data.</span>
      </div>
    </div>
  );
}
