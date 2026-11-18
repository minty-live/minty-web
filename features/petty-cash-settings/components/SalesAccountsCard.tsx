"use client";

/**
 * The sales accounts, under Petty Cash Account Code (owner, 2026-11-17; Figma 464:73 row 4): Sales -
 * Cash, Sales - Electronic Payment and Sales - Delivery on or off - which parts the daily report asks
 * for, as onboarding's sales accounts screen chose them. The three save together with Save changes
 * (`PUT /settings/sales-accounts`); turning one off asks first; at least one stays on, said at once.
 * Turning one off keeps its methods: they come back when it is turned on again.
 */

import { useEffect, useState, type ReactNode } from "react";

import { SettingsDialog } from "@/components/ui/SettingsShell";
import {
  SETTINGS_DANGER_FILL,
  SETTINGS_OUTLINE,
  SETTINGS_PRIMARY,
} from "@/components/ui/settingsButtons";

import { Icon, PettyCashCard } from "@/features/petty-cash-settings/components/parts";
import {
  NO_SALES_ACCOUNT,
  SALES_ACCOUNT,
  SALES_PARTS,
  type SalesPart,
  type SalesParts,
} from "@/features/petty-cash-settings/lib/settings";

const BADGE: Record<SalesPart, string> = {
  cash: "bg-set-ok-bg text-set-ok-ink",
  electronic: "bg-set-info-bg text-set-info-ink",
  delivery: "bg-set-warning-bg text-set-warning-ink",
};

export function SalesAccountsCard({
  saved,
  canEdit,
  busy,
  onSave,
  onDirty,
  methodsFor,
}: {
  saved: SalesParts;
  canEdit: boolean;
  busy: boolean;
  /** Sends the three; true when the API took them. */
  onSave: (parts: SalesParts) => Promise<boolean>;
  /** Unsaved ticks, for the page's "Leave without saving?". */
  onDirty: (on: boolean) => void;
  /** The methods drawn inside a ticked account (Figma 529:675); null for none (Cash). */
  methodsFor: (part: SalesPart) => ReactNode;
}) {
  const [ticks, setTicks] = useState<SalesParts>(saved);
  // Discard changes remounts the card (the page's resetKey); after a save the ticks are the saved ones.
  const [confirm, setConfirm] = useState<SalesPart[] | null>(null);

  const changes = SALES_PARTS.filter((k) => ticks[k] !== saved[k]).length;
  const none = SALES_PARTS.every((k) => !ticks[k]);
  useEffect(() => onDirty(changes > 0), [changes, onDirty]);

  const send = async () => {
    setConfirm(null);
    await onSave(ticks);
  };
  const save = () => {
    if (none || !changes) return;
    const turnedOff = SALES_PARTS.filter((k) => saved[k] && !ticks[k]);
    if (turnedOff.length) setConfirm(turnedOff);
    else void send();
  };

  return (
    <PettyCashCard
      title="Sales accounts and methods"
      lead="Tick the accounts your business takes, then set the methods under each. Your daily report asks only for those, and at least one account stays on."
      readOnly={!canEdit}
      testId="sales-accounts"
    >
      <div
        role="group"
        aria-label="Sales accounts"
        aria-describedby={none ? "sales-accounts-none" : undefined}
        className={`flex min-w-0 flex-col gap-2.5 rounded-[16px] ${none ? "ring-2 ring-set-danger-line" : ""}`}
      >
        {SALES_PARTS.map((key) => {
          const account = SALES_ACCOUNT[key];
          const on = ticks[key];
          const methods = on ? methodsFor(key) : null;
          return (
            <div
              key={key}
              className={`flex min-w-0 flex-col rounded-[16px] border transition-colors ${
                on ? "border-set-edge bg-white" : "border-set-line bg-set-pill"
              }`}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={!canEdit || busy}
                onClick={() => setTicks((t) => ({ ...t, [key]: !t[key] }))}
                className={`flex min-h-11 w-full min-w-0 items-center gap-3.5 rounded-[16px] px-4 py-3.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:cursor-default ${canEdit ? "hover:bg-set-pill/60" : ""}`}
              >
                <span
                  className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[24px] ${BADGE[key]} ${on ? "" : "opacity-60 grayscale"}`}
                >
                  <Icon name={account.icon} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                  <span
                    className={`text-base font-semibold ${on ? "text-set-ink" : "text-set-mute"}`}
                  >
                    {account.name}
                  </span>
                  <span className="text-[13px] [overflow-wrap:anywhere] text-set-mute">
                    {account.body}
                  </span>
                  <span
                    className={`mt-1 rounded-[6px] px-2 py-0.5 text-xs font-medium ${on ? "bg-[#e6f7f4] text-[#0f7a6e]" : "bg-transparent px-0 text-set-mute"}`}
                  >
                    {on
                      ? `Shows on your daily report: ${account.part}`
                      : "Not on your daily report"}
                  </span>
                </span>
                <span
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[18px] text-white ${on ? "border-[#0f7a6e] bg-[#0f7a6e]" : "border-set-edge bg-white"}`}
                >
                  {on ? <Icon name="check" /> : null}
                </span>
              </button>
              {methods ? (
                <div className="mx-4 mb-4 border-t border-set-line pt-3.5">{methods}</div>
              ) : null}
            </div>
          );
        })}
      </div>
      {none ? (
        <p id="sales-accounts-none" role="alert" className="text-sm text-set-danger-ink">
          {NO_SALES_ACCOUNT}
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-[13px] text-set-mute">
            {changes
              ? `${changes} change${changes === 1 ? "" : "s"} not saved yet`
              : "No changes to save yet"}
          </span>
          <button
            type="button"
            className={SETTINGS_PRIMARY}
            disabled={busy || none || !changes}
            onClick={save}
          >
            Save changes
          </button>
        </div>
      ) : null}

      {confirm ? (
        <SettingsDialog
          title={`Turn off ${confirm.map((k) => SALES_ACCOUNT[k].name).join(" and ")}?`}
          onClose={() => setConfirm(null)}
          actions={
            <>
              <button type="button" className={SETTINGS_OUTLINE} onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button type="button" className={SETTINGS_DANGER_FILL} onClick={() => void send()}>
                Turn off
              </button>
            </>
          }
        >
          {confirm.map((k) => (
            <p key={k} className="[overflow-wrap:anywhere]">
              {confirm.length > 1 ? <strong>{SALES_ACCOUNT[k].name}: </strong> : null}
              {SALES_ACCOUNT[k].kept}
            </p>
          ))}
        </SettingsDialog>
      ) : null}
    </PettyCashCard>
  );
}
