// Shown on every page. CareTrack is a learning project: it must only ever hold
// made-up data, and this tells the people typing into it (see README and
// docs/compliance-checklist.md). Payments, once added, run in Stripe test mode.
export function DemoNotice() {
  return (
    <div className="bg-ink text-sm text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 sm:px-6">
        <span className="font-semibold">Demo app</span>
        <span className="text-white/70">Use made-up details only. Never enter real health information.</span>
      </div>
    </div>
  );
}
