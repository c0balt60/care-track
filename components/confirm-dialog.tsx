import type { ReactNode } from "react";

type Props = {
  id: string;
  /** Label of the button that opens the dialog */
  trigger: ReactNode;
  triggerClassName?: string;
  title: string;
  text?: ReactNode;
  confirm: string;
  cancel?: string;
  danger?: boolean;
  /** Where the form goes. Leave it out and the confirm button just closes the dialog. */
  action?: string;
  method?: "get" | "post";
  hidden?: Record<string, string>;
  /** Extra fields, e.g. a reason textarea */
  children?: ReactNode;
};

/**
 * Native <dialog> opened with invoker commands, so there's no JavaScript: the
 * browser handles the focus trap, Esc to close, and returning focus.
 */
export function ConfirmDialog({
  id, trigger, triggerClassName = "btn btn-secondary", title, text, confirm, cancel = "Go back",
  danger, action, method = "get", hidden = {}, children,
}: Props) {
  return (
    <>
      <button type="button" commandfor={id} command="show-modal" className={triggerClassName}>
        {trigger}
      </button>
      <dialog
        id={id}
        aria-labelledby={`${id}-title`}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl bg-surface p-6 text-ink shadow-xl"
      >
        <form action={action} method={action ? method : "dialog"} className="space-y-4">
          <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>
          {text && <p className="text-muted">{text}</p>}
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {children}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button type="button" commandfor={id} command="close" className="btn btn-secondary">
              {cancel}
            </button>
            <button type="submit" className={`btn ${danger ? "btn-danger" : "btn-primary"}`}>
              {confirm}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
