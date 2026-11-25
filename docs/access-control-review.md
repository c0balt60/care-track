# Access-control review (CMP-1, #39)

We tried to read or change other users' appointments and patients across roles and clinics. Every attack is a test in [`lib/access-control.test.ts`](../lib/access-control.test.ts) or [`lib/better-auth.test.ts`](../lib/better-auth.test.ts), so a later change can't quietly reopen a hole. Run them with `pnpm exec vitest run lib/access-control.test.ts lib/better-auth.test.ts`.

**Result:** no attack read or changed another user's data. We found two problems, and both are fixed (see [Findings](#findings)).

## How the tests attack

The fixture has:
- two clinics, X and Y;
- one practitioner at each: A at X, B at Y;
- staff at each clinic;
- two patients: P1 sees A, P2 sees B;
- an admin.

Each test signs in as one of them and calls a **real server action** with someone else's ids. The test passes only if the database is exactly as it was afterwards: appointments, events, audit log, users, practitioners, clinics, patients and availability.

Only the session (`lib/auth`) and Next's `redirect`/`revalidatePath` are faked. The database is PGlite with the real migrations.

The last group of tests is **positive controls**: the right person *can* do each thing. Without them, a broken fixture could make every "nothing changed" test pass for the wrong reason.

## Who may do what

| | Patient | Practitioner | Staff | Admin |
|---|---|---|---|---|
| See an appointment | their own | their own | their clinic's practitioners' | none |
| Approve or decline a request | no | their own | their clinic's | no |
| Cancel | their own | their own | their clinic's | no |
| Book or reschedule | for themselves | no | no (front desk is SCH-6 #24) | no |
| Edit availability | no | their own | no | no |
| Edit the clinic, remove a practitioner from it | no | no | their own clinic | no |
| Edit patient details | their own | no | no | no |
| Change roles, disable accounts, verify practitioners | no | no | no | yes |

The appointment rules live in one pure function, `involves()` and `can()` in [`lib/appointment-rules.ts`](../lib/appointment-rules.ts). Pages and actions both use it, so a hidden button and a refused action can't disagree.

## What we tried

| Attack | Result | Why it holds |
|---|---|---|
| P2 cancels P1's appointment | Refused, shown as "not found" | `changeStatus` reloads the appointment inside the transaction and checks `involves()` |
| Practitioner B approves, declines or cancels A's appointments | Refused | Same check |
| Staff at Y act on X's appointments | Refused | `involves()` compares the practitioner's clinic with the staff member's |
| P1 approves their own request | Refused (`forbidden`) | `can()`: only the clinic side approves |
| Admin cancels an appointment | Sent to login | The actions only accept patient, practitioner or staff |
| A malformed id (`1 OR 1=1`) | "Not found" | `isId()` before any query; ids are never put into SQL as text |
| B, Y-staff or admin open A's appointment page | `null`, so the page 404s | `loadAppointmentFor` checks `involves()` |
| Y-staff list X's practitioner's appointments with `?practitioner=` | Empty | `listAppointmentsFor` puts the party check in the SQL `WHERE`, so a filter can only narrow it |
| P2 books a slot and passes P1's appointment as `rescheduleFromId` | Refused (`reschedule`) | `checkReschedule` requires the old appointment to be the patient's own |
| Staff, practitioner or admin book | Refused | Only patients can book (front-desk booking isn't built yet) |
| B removes A's availability exception | Nothing removed | The `DELETE` is scoped to the session's practitioner id |
| Y-staff remove X's practitioner | Refused (`not-on-team`) | The `UPDATE` requires the practitioner to be on the staff member's clinic |
| Y-staff edit their clinic with `clinicId` set to X in the form | Only Y changes | The clinic comes from the session; form ids are ignored |
| P2 edits details with P1's `patientId` in the form | Only P2 changes | The patient comes from the session |
| B edits a profile with A's `practitionerId` in the form | Only B changes | The practitioner comes from the session |
| A patient, practitioner or staff member calls the admin actions (role, disable, enable, verify, unverify) | Sent to login, nothing changed | Each admin action calls `getViewerAs("admin")` first |
| Signed-in user calls `/api/auth/update-user` with `role: "admin"` | Refused | `role` has `input: false` in [`lib/better-auth.ts`](../lib/better-auth.ts) |
| Signed-in user calls `/api/auth/delete-user` or `/change-email` | Refused | Not enabled |
| Signed-in user revokes another user's session token | Their session survives | Better Auth only revokes your own sessions |

**Checked by reading, not by test:**
- `saveAvailability` and `addException` take the practitioner from the session, never the form.
- Every page under `app/(app)` starts with `requireRole()`.
- The cron route compares `CRON_SECRET` in constant time and refuses every call when it's unset ([`lib/cron-auth.ts`](../lib/cron-auth.ts), which has its own tests).

## Findings

### 1. Three changes weren't audited (fixed)

These changed data without writing an audit row, so nobody could tell who changed them:
- editing a clinic's profile;
- removing a practitioner from a clinic;
- editing a practitioner's public profile.

Now each writes its row in the same transaction as the change: `clinic.update`, `practitioner.leave_clinic` and `practitioner.update`. A new `diffOf()` in [`lib/audit.ts`](../lib/audit.ts) records the before and after values. This is public business data, not PHI; patient details still use `redactedDiff()`.

Tested by the positive controls in `lib/access-control.test.ts`.

### 2. Better Auth endpoints the app doesn't use were open (fixed)

Any signed-in user could call these over HTTP:
- **`/api/auth/update-user`** accepted a 5,000-character name and a `javascript:` image URL. That skips the app's validation (200 characters) and the audit log, and it changes `users.name` without `patients.name`.
- **`/api/auth/verify-password` and `/change-password`** let someone holding a session guess the account's password **outside the login rate limit**.

All three are now in `disabledPaths` and return 404. If settings later offers "change password", build it as a rate-limited server action, as we did for log-in.

Tested in `lib/better-auth.test.ts`: "blocks the account endpoints the app doesn't use".

## By design, not findings

- **Unverified practitioners can be opened and booked by direct link.** ADM-2 hides them from listings only; that was a deliberate choice.
- **Anyone can sign up as a practitioner or staff member, but it grants nothing.** Those accounts have no practitioner or clinic row until one is linked, and `getViewerAs` treats a role without its row as signed out.
- **Admins can't see appointments or patient details.** Their tools are users, practitioners and the audit log, which holds ids, not health information.
