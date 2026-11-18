"use client";

/**
 * A pending change's modal (Figma section 06): one of the seven shapes `lib/changeModal.ts`
 * builds, in the `ConfirmDialog` shell - the module's name in its colour (or the bundle's in
 * teal), Minty in the mood the change calls for, the design's sentences, and the confirming
 * button in its tone.
 *
 * A change that only cancels is asked here first: Go back, or its Confirm, which applies it. A
 * change that bills is asked in "Billing Accounts" first - which account pays - and shows here
 * only once it is paid (the owner, 2026-11-11), with one button (`hideBack`): its Confirm lands
 * the row on its result.
 *
 * A paid cancellation (`askReason`) also asks why, in the person's own words (owner, 2026-11-13:
 * free text, required), capped at the audit column's 500 characters. Nothing is red on open; a
 * Confirm with nothing typed (spaces count as nothing) is refused with the sentence under the
 * box and focus moved to it, and typing clears it at once. Enter is a new line.
 */

import { useId, useRef, useState } from "react";

import type { ChangeModal } from "@/features/subscription/lib/changeModal";
import type { ResultPart } from "@/features/subscription/lib/changeResult";

import { PLAN_TONE } from "@/features/subscription/components/ChangeResultView";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { SHEET_FIELD_ERROR } from "@/components/ui/sheetClasses";

/** Part 11: the issue, then the action. */
export const REASON_EMPTY = "The reason is still empty. Tell us why you're leaving to continue.";

function Part({ part }: { part: ResultPart }) {
  if (part.style === "plain") return <>{part.text}</>;
  if (part.style === "strong")
    return <strong className="font-bold text-[#16202e]">{part.text}</strong>;
  if (part.style === "company") return <span className="text-[#219994]">{part.text}</span>;
  return <span className={`font-bold ${PLAN_TONE[part.style]}`}>{part.text}</span>;
}

/** The audit column's width (`subscription_audit_log.cancel_reason`, VARCHAR(500)). */
export const REASON_MAX = 500;
/** The count shows once this close to the cap, so the box is quiet for an ordinary sentence. */
const REASON_COUNT_FROM = REASON_MAX - 100;

export function ChangeDialog({
  modal,
  entityName,
  busy,
  hideBack = false,
  askReason = false,
  onConfirm,
  onBack,
}: {
  modal: ChangeModal;
  entityName: string;
  busy: boolean;
  /** The change is already paid: one button, nothing to go back to. */
  hideBack?: boolean;
  /** A paid cancellation: ask why they are leaving - required. */
  askReason?: boolean;
  /** The reason typed (only when `askReason`, never blank), else undefined. */
  onConfirm: (reason?: string) => void;
  onBack: () => void;
}) {
  const { title } = modal;
  const bundle = title.module?.tone === "bundle";
  const [reason, setReason] = useState("");
  // Set by a refused Confirm only, and cleared by typing: never red on open.
  const [refused, setRefused] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const reasonId = useId();
  const countId = useId();
  const errorId = useId();
  const empty = !reason.trim();
  const showError = refused && empty;
  const showCount = reason.length >= REASON_COUNT_FROM;
  const describedBy = [showError && errorId, showCount && countId].filter(Boolean).join(" ");

  const confirm = () => {
    if (!askReason) return onConfirm(undefined);
    if (empty) {
      setRefused(true);
      reasonRef.current?.focus();
      return;
    }
    onConfirm(reason);
  };
  return (
    <ConfirmDialog
      title={
        <span data-modal={modal.kind}>
          {title.lead}
          {title.module && (
            <>
              {/* the space keeps the accessible name "Remove Petty Cash?" across the line break */}{" "}
              <br />
              <span className={bundle ? "text-[#18c4c7]" : PLAN_TONE[title.module.tone]}>
                {title.module.name}
              </span>
            </>
          )}
          {title.tail}
        </span>
      }
      image={modal.image}
      entityName={entityName}
      busy={busy}
      confirmLabel={modal.confirmLabel}
      confirmTone={modal.confirmTone}
      hideBack={hideBack}
      onConfirm={confirm}
      onBack={onBack}
    >
      {modal.paragraphs.map((parts, i) => (
        <p key={i}>
          {parts.map((part, j) => (
            <Part key={j} part={part} />
          ))}
        </p>
      ))}
      {askReason && (
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={reasonId} className="text-[14px] font-semibold text-[#16202e]">
            Tell us why you&apos;re leaving <RequiredMark />
            <span className="sr-only"> (required)</span>
          </label>
          <textarea
            ref={reasonRef}
            id={reasonId}
            rows={3}
            maxLength={REASON_MAX}
            value={reason}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
            aria-required
            aria-invalid={showError || undefined}
            aria-describedby={describedBy || undefined}
            className={`min-h-[88px] w-full min-w-0 resize-y rounded-[12px] border bg-white px-4 py-3 text-[15px] leading-snug text-[#16202e] placeholder:text-[#737a87] focus:outline-none focus-visible:ring-2 disabled:opacity-60 ${
              showError
                ? "border-set-danger-line focus-visible:ring-set-danger-line/30"
                : "border-[#737a87]/30 focus:border-[#18c4c7] focus-visible:ring-[#18c4c7]/40"
            }`}
          />
          {showError && (
            <p id={errorId} className={SHEET_FIELD_ERROR}>
              {REASON_EMPTY}
            </p>
          )}
          {showCount && (
            <p id={countId} className="text-right text-[12px] text-[#737a87]">
              {reason.length} of {REASON_MAX} characters
            </p>
          )}
        </div>
      )}
    </ConfirmDialog>
  );
}
