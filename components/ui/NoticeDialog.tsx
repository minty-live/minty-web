"use client";

/**
 * A hand-over notice the person must read and act on, drawn as a one-button modal instead of a
 * toast (the user, 2026-11-24): the accounts API flashes it as category `dialog`. Its only sender
 * today is the refused Xero connect whose organisation keeps another currency - the sentence says
 * what to change, and a toast would be gone after 4 s, before anyone could read it. Minty never
 * changes the currency itself, so the one button only closes.
 *
 * ConfirmDialog's one-button look (`hideBack`), as the conflict dialog's "Close".
 */

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export const NOTICE_DIALOG_TITLE = "Xero wasn't connected";

type Notice = { category: string; message: string };

/** The notices a toast says, and the first one that opens this modal (if any). */
export function splitNotices<T extends Notice>(
  notices: T[],
): { toasts: T[]; dialog: string | null } {
  return {
    toasts: notices.filter((n) => n.category !== "dialog"),
    dialog: notices.find((n) => n.category === "dialog")?.message ?? null,
  };
}

export function NoticeDialog({
  message,
  entityName,
  onClose,
}: {
  message: string;
  entityName?: string | null;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title={NOTICE_DIALOG_TITLE}
      image="dont"
      entityName={entityName}
      busy={false}
      hideBack
      confirmLabel="Close"
      onConfirm={onClose}
      onBack={onClose}
    >
      <p>{message}</p>
    </ConfirmDialog>
  );
}
