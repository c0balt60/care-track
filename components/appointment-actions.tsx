// Accept / Decline / Cancel buttons wired to server actions (SCH-5 #23).
//
// They take plain values, so any page can use them: the detail page, the
// /appointments list, and the dashboards (SCH-7 #25).
import { ConfirmDialog } from "./confirm-dialog";

type ServerAction = (formData: FormData) => Promise<void>;

/** Accept and Decline for a pending request. */
export function RequestButtons({
  id, summary, approveAction, declineAction,
}: {
  id: string;
  /** e.g. "Ada Lovelace asked for Mon, Jan 7 at 10:00 AM." */
  summary: string;
  approveAction: ServerAction;
  declineAction: ServerAction;
}) {
  return (
    <>
      <ConfirmDialog
        id={`decline-${id}`}
        trigger="Decline"
        title="Decline this request?"
        text={summary}
        confirm="Decline request"
        cancel="Go back"
        danger
        action={declineAction}
      >
        <div>
          <label htmlFor={`note-${id}`} className="label">Note to the patient (optional)</label>
          <textarea id={`note-${id}`} name="note" rows={3} maxLength={1000} className="input" />
        </div>
      </ConfirmDialog>
      <form action={approveAction}>
        <button className="btn btn-primary">Accept</button>
      </form>
    </>
  );
}

/** Cancel a confirmed appointment, or withdraw a pending request. */
export function CancelButton({
  id, summary, pending, reasonRequired, otherParty, action,
}: {
  id: string;
  /** e.g. "Mon, Jan 7 at 10:00 AM with Dr. Grey." */
  summary: string;
  pending: boolean;
  reasonRequired: boolean;
  /** Who will see the reason. */
  otherParty: string;
  action: ServerAction;
}) {
  return (
    <ConfirmDialog
      id={`cancel-${id}`}
      trigger={pending ? "Withdraw request" : "Cancel appointment"}
      title={pending ? "Withdraw this request?" : "Cancel this appointment?"}
      text={summary}
      confirm={pending ? "Withdraw request" : "Cancel appointment"}
      cancel={pending ? "Keep request" : "Keep appointment"}
      danger
      action={action}
    >
      <div>
        <label htmlFor={`reason-${id}`} className="label">Reason{reasonRequired ? "" : " (optional)"}</label>
        <textarea id={`reason-${id}`} name="note" rows={3} maxLength={1000} required={reasonRequired} className="input" />
        {reasonRequired && <p className="mt-1 text-sm text-muted">{otherParty} will see this.</p>}
      </div>
    </ConfirmDialog>
  );
}
