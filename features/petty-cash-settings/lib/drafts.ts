"use client";

/**
 * Each Petty Cash Settings card keeps its own auto-saved draft (`@minty/shared/drafts`, the owner's
 * decisions doc L1: this browser only, 2 s after the last change, put back at once with no notice
 * (the user, 2026-11-24), never the real settings): Account mapping (`settings.pc-mapping`), Petty
 * Cash Account Code (`settings.pc-codes`) and the sales accounts (`settings.pc-sales`), each record
 * `-`, each `basedOn` the fingerprint of the values the API sent for that card - a save by anyone
 * since makes the draft stale (dropped silently, never put back). Shape 2 (2026-11-20) for the two
 * cards that hold more than their picks: the mapping keeps its new contacts (`{picked, contacts}`) and the sales
 * accounts their methods (`{ticks, methods}`); a shape-1 draft from before is dropped.
 *
 * The cards remount on the page's "Discard changes" (its `resetKey`), and a form going away writes
 * what it still holds, so the page clears every card's draft FIRST: each card registers its
 * `clear` with the page (`register`), which calls them all in its leave-guard reset.
 */

import { useEffect } from "react";

import { useAutoSaveDraft, type DraftScope } from "@minty/shared/drafts";

export const DRAFT_FORMS = {
  mapping: "settings.pc-mapping",
  codes: "settings.pc-codes",
  sales: "settings.pc-sales",
} as const;

/** What the page hands each card: whose drafts, and where its `clear` goes for the reset. */
export type CardDrafts = {
  scope: DraftScope | null;
  /** Keep `clear` for the page's "Discard changes"; the returned function forgets it. */
  register?: (clear: () => void) => () => void;
};

export function useCardDraft<T>(
  drafts: CardDrafts | undefined,
  opts: {
    form: string;
    ready: boolean;
    basedOn: string;
    value: T;
    dirty: boolean;
    /** The value's shape (bumped when it changes); 1 unless said. */
    shape?: number;
  },
) {
  const draft = useAutoSaveDraft<T>({
    scope: drafts?.scope ?? null,
    form: opts.form,
    record: "-",
    shape: opts.shape ?? 1,
    ready: opts.ready,
    basedOn: opts.basedOn,
    value: opts.value,
    dirty: opts.dirty,
  });
  const register = drafts?.register;
  const { clear } = draft;
  useEffect(() => register?.(clear), [register, clear]);
  return draft;
}
