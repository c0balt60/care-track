// HTML invoker commands (<button commandfor="id" command="show-modal">) open and
// close <dialog>s without JavaScript. React passes the attributes through; it
// just doesn't have types for them yet.
import "react";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- must match React's declaration to merge
  interface ButtonHTMLAttributes<T> {
    commandfor?: string;
    command?: "show-modal" | "close" | "request-close" | "toggle-popover" | "show-popover" | "hide-popover";
  }
}
