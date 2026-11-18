"use client";

/**
 * The billing account's card screens, composed (Figma 08-Y "Add Card Details" and 08-D "Edit
 * Card Details"): the banner, one narrow card with the form, and Minty holding the cards under
 * it. Adding mounts Stripe's own fields (`CardCaptureForm`); editing draws three fields of our
 * own, because the only things Stripe lets a saved card change are the name on it and when it
 * expires - the number is shown, masked and disabled, so its absence does not read as a bug.
 */

import Image from "next/image";
import { createPortal } from "react-dom";

import { LeaveDialog } from "@/components/ui/LeaveDialog";
import { useLeaveGuard } from "@minty/shared/leaveGuard";

import { CardCapturePanel } from "@/features/subscription/components/CardCaptureForm";
import { PortalHero } from "@/features/subscription/components/PortalHero";
import {
  ADD_CARD_HEADING,
  ADD_CARD_TITLE,
  EDIT_CARD_FOOT,
  EDIT_CARD_HEADING,
  EDIT_CARD_NOTE,
  EDIT_CARD_TITLE,
  STRIPE_NOTE,
} from "@/features/subscription/lib/billing";
import { EXPIRY_INVALID, useAddCard, useEditCard } from "@/features/subscription/hooks/useCardForm";

const SHEET =
  "mx-auto flex w-full max-w-[490px] flex-col gap-4 rounded-xl border border-border-subtle bg-white px-7 py-6 shadow-[0px_2px_8px_0px_rgba(0,0,0,0.1)]";
const FIELD =
  "h-11 w-full rounded-lg border border-border-input px-3.5 text-[15px] text-text-primary outline-none focus:border-border-focus";
const LABEL = "text-[13px] font-semibold text-text-primary";

function MintyWithCards() {
  return (
    <Image
      src="/portal/minty-cards.png"
      alt=""
      width={160}
      height={232}
      unoptimized
      className="mx-auto mt-2"
    />
  );
}

export function AddCardScreen({
  accountId,
  fixture,
}: {
  accountId?: string | null;
  fixture?: string | null;
}) {
  const add = useAddCard({ fixture, accountId });
  return (
    <div className="flex flex-col gap-8 pb-16">
      <PortalHero title={ADD_CARD_TITLE} />
      <section aria-label={ADD_CARD_HEADING} className={SHEET}>
        <div>
          <h2 className="text-[17px] font-bold text-text-primary">{ADD_CARD_HEADING}</h2>
          <p className="mt-1.5 text-[13px] text-text-muted">{STRIPE_NOTE}</p>
        </div>
        <CardCapturePanel
          setup={add}
          onSaved={add.saved}
          onCancel={add.cancel}
          account={add.account}
          country={add.country}
        />
      </section>
      <MintyWithCards />
    </div>
  );
}

export function EditCardScreen({
  cardId,
  accountId,
  fixture,
}: {
  cardId?: string | null;
  accountId?: string | null;
  fixture?: string | null;
}) {
  const edit = useEditCard({ cardId, accountId, fixture });
  // 08-Y (adding) arms no guard: the number, CVC and address are Stripe's own fields, in its
  // iframe - nothing of them is ours to see or to put back. Editing is all our own state.
  const leave = useLeaveGuard(edit.dirty, edit.reset);
  return (
    <div className="flex flex-col gap-8 pb-16">
      <PortalHero title={EDIT_CARD_TITLE} />
      <section aria-label={EDIT_CARD_HEADING} className={SHEET}>
        <div>
          <h2 className="text-[17px] font-bold text-text-primary">{EDIT_CARD_HEADING}</h2>
          <p className="mt-1.5 text-[13px] text-text-muted">{EDIT_CARD_NOTE}</p>
        </div>

        {edit.status === "error" ? (
          <p role="alert" className="text-[15px] text-status-danger-ink">
            {edit.error}
          </p>
        ) : edit.status === "loading" || !edit.card ? (
          <p role="status" className="py-6 text-center text-[15px] text-text-muted">
            Loading…
          </p>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void edit.save();
            }}
          >
            <div>
              <label className={LABEL} htmlFor="card-number">
                Card number
              </label>
              <input
                id="card-number"
                className={`${FIELD} mt-1.5 bg-surface-sunk text-text-muted`}
                value={`•••• •••• •••• ${edit.card.last4 ?? "••••"}`}
                disabled
                readOnly
              />
            </div>
            <div>
              <span className={LABEL}>Expiry date</span>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  aria-label="Expiry month"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="MM"
                  value={edit.fields.expMonth}
                  onChange={(e) => edit.setField("expMonth", e.target.value)}
                  aria-invalid={edit.saveError === EXPIRY_INVALID ? true : undefined}
                  className={`${FIELD} w-20 text-center ${edit.saveError === EXPIRY_INVALID ? "border-action-danger" : ""}`}
                />
                <span className="text-text-muted">/</span>
                <input
                  aria-label="Expiry year"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="YY"
                  value={edit.fields.expYear}
                  onChange={(e) => edit.setField("expYear", e.target.value)}
                  aria-invalid={edit.saveError === EXPIRY_INVALID ? true : undefined}
                  className={`${FIELD} w-20 text-center ${edit.saveError === EXPIRY_INVALID ? "border-action-danger" : ""}`}
                />
              </div>
            </div>
            <div>
              <label className={LABEL} htmlFor="card-name">
                Name on card
              </label>
              <input
                id="card-name"
                className={`${FIELD} mt-1.5`}
                value={edit.fields.name}
                onChange={(e) => edit.setField("name", e.target.value)}
              />
            </div>
            <p className="text-[13px] leading-relaxed text-text-muted">{EDIT_CARD_FOOT}</p>
            {edit.saveError && (
              <p role="alert" className="text-[13px] text-status-danger-ink">
                {edit.saveError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={edit.cancel}
                disabled={edit.busy}
                className="h-[44px] w-[104px] rounded-lg border border-border-default bg-white text-[15px] font-semibold text-text-primary hover:bg-surface-sunk disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={edit.busy || !edit.dirty}
                className="h-[44px] w-[150px] rounded-lg bg-action-primary text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {edit.busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </section>
      <MintyWithCards />

      {/* Over the drawer and any other modal - see IntegrationScreen's note. */}
      {leave.open
        ? createPortal(
            <div data-leave-dialog="" className="relative z-[250]">
              <LeaveDialog onDiscard={leave.discard} onStay={leave.stay} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
