"use client";

/**
 * "Subscription & Billing" - the portal's landing, composed (Figma 08-A): the way back into
 * Minty (in the header bar, `PortalBack`), the banner, the billing-account card and the Subscription Overview, and the two
 * account dialogs the card opens - which account to show, and "Change billing account" - each
 * of which can open a new account in place (onboarding's sheet, `BillingAccountDialogs`).
 * `SubscriptionOverview` reads the URL and hands the parameters here; the tests render this
 * directly with fixtures.
 *
 * "Back" returns to the page the person came from into the portal (`PORTAL_BACK.overview`: past
 * the portal's own pages, out to the app they came from). With nothing before it (a new tab), it
 * goes to the COMPANY this browser is scoped to, not to Minty's entity picker: through
 * `/entity/<id>/modules`, to its module selection - or straight into the module, when only one
 * is on (Minty routes it). Once a result's Back to Manage Subscriptions has traded the company's
 * token for the payer's, that fallback is Minty's entity list.
 */

import { useSyncExternalStore } from "react";

import { HeaderBack } from "@minty/shared/ui";

import { getAuth } from "@/lib/auth";
import { mintyModulesUrl } from "@/lib/mintyEntry";

import {
  AccountPickerDialog,
  MoveCompanyDialog,
} from "@/features/subscription/components/BillingAccountDialogs";
import {
  BillingAccountCard,
  SubscriptionOverviewCard,
} from "@/features/subscription/components/BillingOverviewPanels";
import { PortalBack } from "@/features/subscription/components/PortalBack";
import { TransferOutcomeDialog } from "@/features/subscription/components/TransferOutcomeDialog";
import {
  useBillingOverview,
  type UseBillingOverviewArgs,
} from "@/features/subscription/hooks/useBillingOverview";
import { OVERVIEW_BACK, OVERVIEW_TITLE } from "@/features/subscription/lib/billing";
import { PORTAL_BACK } from "@/features/subscription/lib/paths";

// A primitive, not the auth object: a fresh object per read makes the store loop (PortalChrome).
const noSubscribe = () => () => {};
const readEntityId = () => getAuth()?.entityId ?? "";
const serverEmpty = () => "";

export function SubscriptionOverviewScreen(args: UseBillingOverviewArgs) {
  const o = useBillingOverview(args);
  const entityId = useSyncExternalStore(noSubscribe, readEntityId, serverEmpty);

  return (
    <div className="flex flex-col gap-6 pb-16">
      <PortalBack>
        <HeaderBack
          href={mintyModulesUrl(entityId)}
          label={OVERVIEW_BACK}
          {...PORTAL_BACK.overview}
        />
      </PortalBack>
      <div className="rounded-[32px] bg-action-primary px-[54px] py-10">
        <h1 className="text-[40px] font-bold leading-none text-white">{OVERVIEW_TITLE}</h1>
      </div>

      {o.status === "error" ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-action-danger/30 bg-status-danger-bg px-4 py-3 text-sm text-status-danger-ink"
        >
          {o.error}
          <button
            type="button"
            onClick={o.reload}
            className="rounded-lg border border-action-danger/30 bg-white px-4 py-1.5 font-semibold"
          >
            Try again
          </button>
        </div>
      ) : (
        <div
          className="mx-auto flex w-full max-w-[720px] flex-col gap-8"
          aria-busy={o.status === "loading"}
        >
          <BillingAccountCard
            next={o.next}
            accountsFailed={o.accountsFailed}
            notice={o.notice}
            onPick={o.openPicker}
            onMove={o.openMove}
            onOpen={o.goToBilling}
            onRetry={o.reload}
          />
          <SubscriptionOverviewCard
            overview={o.overview}
            updatesExpanded={o.updatesExpanded}
            onToggleUpdates={o.toggleUpdates}
            onManage={o.manageSubscriptions}
          />
        </div>
      )}

      {/* Siblings of the card, never inside it: a click in a dialog would otherwise bubble to
          the card's own click and open the picker under the dialog. */}
      {o.picking && o.accounts && (
        <AccountPickerDialog
          data={o.accounts}
          currentId={o.account?.id ?? null}
          fixture={args.fixture}
          onConfirm={o.confirmPick}
          onOpened={o.accountOpened}
          onClose={o.closePicker}
        />
      )}
      {o.moving && o.accounts && (
        <MoveCompanyDialog
          data={o.accounts}
          busy={o.moveBusy}
          error={o.moveError}
          fixture={args.fixture}
          onMove={o.moveCompany}
          onOpened={o.accountOpened}
          onClose={o.closeMove}
        />
      )}

      {/* 07-I / A-07 (declined), A-08 (expired), 07-L (accepted) - all drawn OVER this page.
          The first modal on the landing, and it belongs here rather than on the transfer
          screen: that is where the design puts it, and it is the page the payer comes back
          to. Done marks it seen on the server, so it never opens again on any device. */}
      {o.outcome && (
        <TransferOutcomeDialog
          outcome={o.outcome.status}
          entityName={o.outcome.entity_name}
          who={o.outcome.who || null}
          onDone={o.dismissOutcome}
          onClose={o.closeOutcome}
        />
      )}
    </div>
  );
}
