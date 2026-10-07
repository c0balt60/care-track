"use client";

import { useRouter } from "next/navigation";

// PROTOTYPE ONLY. Switches the fake signed-in role until real auth exists.
// Delete this bar together with lib/mock-data.ts.
export function PreviewBar({ role }: { role: string }) {
  const router = useRouter();

  return (
    <div className="bg-slate-900 text-sm text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 sm:px-6">
        <span className="font-semibold">Prototype</span>
        <span className="text-slate-300">Fake data. Nothing is saved.</span>
        <label className="ml-auto flex items-center gap-2">
          Viewing as
          <select
            defaultValue={role}
            onChange={(e) => {
              document.cookie = `preview-role=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
              router.refresh();
            }}
            className="min-h-8 rounded-md bg-slate-800 px-2 text-white"
          >
            <option value="out">Signed out</option>
            <option value="patient">Patient</option>
            <option value="practitioner">Practitioner</option>
            <option value="staff">Clinic staff</option>
          </select>
        </label>
      </div>
    </div>
  );
}
