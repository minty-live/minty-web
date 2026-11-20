"use client";

/**
 * `/entity/<shortid>/<name>/settings/petty-cash` - Petty Cash Settings, moved into the hub from
 * minty-petty-cash-web (owner, 2026-11-10) with its behaviour, calls and words unchanged; only
 * the frame (the shared settings page, `SettingsShell`) and the look (the Settings frames, Figma
 * 353:999) are new. Reads `GET /settings` and `GET /settings/xero` from minty-petty-cash-api.
 *
 * - Account mapping and Petty Cash Account Code (`XeroCards.tsx`), read once per page load
 *   from `GET /settings/xero` (it asks Xero), each with its own Save; "Xero isn't connected" in
 *   both when the connection is not live.
 * - Electronic and Delivery: add (the catalogue or a new name), rename, Move up / down, Delete -
 *   each the API's at once, its answer drawn and its sentence shown.
 * - No Country & currency card: those are the General tab's.
 *
 * What a person may change is the API's `permissions`; a cashier sees it all read-only. Unsaved
 * card choices hold the page ("Leave without saving?") and are kept as browser drafts per card
 * (`lib/drafts.ts`: Restore or Discard when the page opens again).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLeaveGuard } from "@minty/shared/leaveGuard";

import {
  SettingsDialog,
  LoadState,
  ReadOnlyNotice,
  SettingsShell,
} from "@/components/ui/SettingsShell";
import { SETTINGS_DANGER_FILL, SETTINGS_OUTLINE } from "@/components/ui/settingsButtons";
import { LeaveDialog } from "@/components/ui/LeaveDialog";
import { useToast } from "@/components/ui/Toast";
import { ApiError, mintyFetch, type ApiRequest } from "@/lib/apiClient";
import { useDraftScope } from "@/lib/draftScope";

import { pettyCashSettingsFetch } from "@/features/petty-cash-settings/api/pettyCashSettings";
import { BusyOverlay } from "@/features/petty-cash-settings/components/parts";
import { SalesAccountsCard } from "@/features/petty-cash-settings/components/SalesAccountsCard";
import {
  SalesMethodsCard,
  SalesMethodsList,
  type MethodActions,
} from "@/features/petty-cash-settings/components/SalesMethodsCard";
import {
  AccountCodesCard,
  XeroMappingCard,
  type Call,
  type XeroLoad,
} from "@/features/petty-cash-settings/components/XeroCards";
import type { CardDrafts } from "@/features/petty-cash-settings/lib/drafts";
import { connectXeroPath } from "@/features/petty-cash-settings/lib/paths";
import {
  KIND,
  movedIds,
  placedIds,
  shownTypes,
  viewOnly,
  type MethodType,
  type SalesMethod,
  type SalesPart,
  type SalesParts,
  type SettingsAnswer,
  type SettingsRead,
} from "@/features/petty-cash-settings/lib/settings";
import type { XeroRead } from "@/features/petty-cash-settings/lib/xeroSettings";

export const UNREACHABLE =
  "We couldn't reach Petty Cash. Check your connection, then reload the page.";
export const READ_ONLY =
  "You have view-only access to these settings. Ask an Accountant or Admin to make changes.";
const SAVING = "Saving changes…";

type Load =
  | { kind: "loading" }
  | { kind: "ready"; read: SettingsRead }
  | { kind: "refused"; message: string }
  | { kind: "failed"; message: string };

/** The sentence for a failed call, or null for a 401 (already on its way back through the hand-off). */
function refusal(err: unknown): string | null {
  if (err instanceof ApiError) return err.status === 401 ? null : err.message;
  return UNREACHABLE;
}

export function PettyCashSettingsScreen({ company }: { company: { id: string; name: string } }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    pettyCashSettingsFetch<SettingsRead>(company.id, "/settings").then(
      (read) => {
        if (live) setLoad({ kind: "ready", read });
      },
      (err: unknown) => {
        const message = refusal(err);
        if (!live || message === null) return;
        // 403 (not for this person) and 409 (still onboarding) are answers: Try again can't help.
        setLoad(
          err instanceof ApiError && (err.status === 403 || err.status === 409)
            ? { kind: "refused", message }
            : { kind: "failed", message },
        );
      },
    );
    return () => {
      live = false;
    };
  }, [company.id, attempt]);

  return (
    <SettingsShell company={company} modules={null} tab="petty-cash">
      {load.kind === "loading" ? <LoadState status="loading" onRetry={() => undefined} /> : null}
      {load.kind === "refused" ? (
        // a 403 is the API's answer for this person: trying again changes nothing
        <p className="mt-6 text-center text-sm text-set-danger-ink" role="alert">
          {load.message}
        </p>
      ) : null}
      {load.kind === "failed" ? (
        <LoadState
          status="error"
          error={load.message}
          onRetry={() => {
            setLoad({ kind: "loading" });
            setAttempt((n) => n + 1);
          }}
        />
      ) : null}
      {load.kind === "ready" ? <SettingsBody initial={load.read} company={company} /> : null}
    </SettingsShell>
  );
}

function SettingsBody({
  initial,
  company,
}: {
  initial: SettingsRead;
  company: { id: string; name: string };
}) {
  const { showToast } = useToast();
  const entityId = company.id;
  const [read, setRead] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    type: MethodType;
    method: SalesMethod;
  } | null>(null);
  // a ref, not state: a second click in the same frame must see the first one
  const acting = useRef(false);
  const perms = read.permissions;

  // "Leave without saving?" over the two Xero cards (each saves on its own; the sales methods save
  // at once, so they never hold anything). Discard remounts both forms from what the API holds.
  // The sales accounts card holds its ticks until Save changes too (2026-11-17).
  const [dirty, setDirty] = useState({ mapping: false, codes: false, accounts: false });
  const [resetKey, setResetKey] = useState(0);
  const mappingDirty = useCallback((on: boolean) => setDirty((d) => ({ ...d, mapping: on })), []);
  const codesDirty = useCallback((on: boolean) => setDirty((d) => ({ ...d, codes: on })), []);
  const accountsDirty = useCallback((on: boolean) => setDirty((d) => ({ ...d, accounts: on })), []);
  // Each card's auto-saved draft (lib/drafts.ts): per person and company. "Discard changes" clears
  // them all BEFORE the cards remount - a form going away writes what it still holds.
  const draftScope = useDraftScope(entityId);
  const draftClears = useRef(new Set<() => void>());
  const drafts = useMemo<CardDrafts>(
    () => ({
      scope: draftScope,
      register: (clear) => {
        draftClears.current.add(clear);
        return () => {
          draftClears.current.delete(clear);
        };
      },
    }),
    [draftScope],
  );
  const leave = useLeaveGuard(dirty.mapping || dirty.codes || dirty.accounts, () => {
    for (const clear of draftClears.current) clear();
    setDirty({ mapping: false, codes: false, accounts: false });
    setResetKey((k) => k + 1);
  });

  /** One call: the busy overlay, and a refusal's sentence as the error toast; null when it did not go through. */
  const call: Call = useCallback(
    async <T,>(
      path: string,
      init: ApiRequest & { hub?: boolean },
      busyText = SAVING,
      onRefused?: (message: string) => void,
    ): Promise<T | null> => {
      if (acting.current) return null;
      acting.current = true;
      setBusy(busyText);
      try {
        if (init.hub) {
          // accounts-api's company door (Settings' contacts): the company as ?entity=
          return await mintyFetch<T>(path, {
            method: init.method,
            json: init.json,
            query: { ...init.query, entity: entityId },
          });
        }
        return await pettyCashSettingsFetch<T>(entityId, path, init);
      } catch (err) {
        const message = refusal(err);
        if (message !== null) {
          showToast(message, "error");
          onRefused?.(message);
        }
        return null;
      } finally {
        acting.current = false;
        setBusy(null);
      }
    },
    [entityId, showToast],
  );

  /** One write of the cards that need no Xero: the API's answer drawn and its sentence shown; true when it went through. */
  const write = useCallback(
    async (path: string, init: ApiRequest): Promise<boolean> => {
      const answer = await call<SettingsAnswer>(path, init);
      if (!answer) return false;
      const { message, ...next } = answer;
      setRead(next);
      showToast(message, "success");
      return true;
    },
    [call, showToast],
  );

  // The Xero cards' read: once per page load (each read asks Xero), and again only on Try again.
  const [xero, setXero] = useState<XeroLoad>({ kind: "loading" });
  const [xeroAttempt, setXeroAttempt] = useState(0);
  // one request per attempt, even when an effect runs twice (React's dev check): each read asks Xero
  const xeroAsk = useRef<{ attempt: number; answer: Promise<XeroRead> } | null>(null);
  useEffect(() => {
    let live = true;
    if (xeroAsk.current?.attempt !== xeroAttempt)
      xeroAsk.current = {
        attempt: xeroAttempt,
        answer: pettyCashSettingsFetch<XeroRead>(entityId, "/settings/xero"),
      };
    xeroAsk.current.answer.then(
      (next) => {
        if (live) setXero({ kind: "ready", read: next });
      },
      (err: unknown) => {
        const message = refusal(err);
        if (!live || message === null) return;
        setXero({
          kind: "failed",
          message,
          retry: !(err instanceof ApiError && (err.status === 403 || err.status === 409)),
        });
      },
    );
    return () => {
      live = false;
    };
  }, [entityId, xeroAttempt]);
  const retryXero = () => {
    setXero({ kind: "loading" });
    setXeroAttempt((n) => n + 1);
  };
  const xeroSaved = ({ message, ...next }: XeroRead & { message: string }) => {
    setXero({ kind: "ready", read: next });
    showToast(message, "success");
  };
  const connectHref = connectXeroPath(entityId, company.name);

  const actions: MethodActions = {
    add: (type, body) => write("/sales-methods", { method: "POST", json: { type, ...body } }),
    rename: (method, name) =>
      write(`/sales-methods/${encodeURIComponent(method.id)}`, { method: "PUT", json: { name } }),
    move: (type, index, step) => {
      const ids = movedIds(
        read.sales_methods[type].map((m) => m.id),
        index,
        step,
      );
      if (ids)
        void write("/sales-methods/order", { method: "PUT", json: { type, method_ids: ids } });
    },
    place: (type, from, to) => {
      const ids = placedIds(
        read.sales_methods[type].map((m) => m.id),
        from,
        to,
      );
      if (ids)
        void write("/sales-methods/order", { method: "PUT", json: { type, method_ids: ids } });
    },
    remove: (type, method) => setConfirmDelete({ type, method }),
    say: (message) => showToast(message, "error"),
  };

  // Each ticked account's methods inside its card (owner, 2026-11-17; Figma 529:675). A Non-cash
  // company's leftover delivery methods (from before the business type was asked) stay under
  // Electronic Payment while Delivery is off, so they can be seen and removed.
  const methodsList = (type: MethodType) => (
    <SalesMethodsList
      key={type}
      region
      type={type}
      groups={read.sales_groups}
      methods={read.sales_methods[type]}
      available={read.available[type]}
      permissions={perms}
      busy={busy !== null}
      actions={actions}
    />
  );
  const methodsFor = (part: SalesPart) => {
    if (part === "cash") return null;
    if (part === "delivery") return methodsList("delivery");
    const leftover =
      read.sales_groups === "non_cash" &&
      !read.sales_parts?.delivery &&
      read.sales_methods.delivery.length > 0;
    return (
      <div className="flex min-w-0 flex-col gap-5">
        {methodsList("electronic")}
        {leftover ? methodsList("delivery") : null}
      </div>
    );
  };

  return (
    <>
      {viewOnly(perms) ? <ReadOnlyNotice>{READ_ONLY}</ReadOnlyNotice> : null}

      <div className="flex min-w-0 flex-col gap-4">
        <XeroMappingCard
          load={xero}
          busy={busy !== null}
          call={call}
          connectHref={connectHref}
          onRetry={retryXero}
          onAdded={(message) => showToast(message, "success")}
          // Every save stays here and says so - the first included (owner, 2026-11-11: it used to
          // leave for the Petty Cash dashboard, as Flask's did, and its sentence went with the page).
          onSaved={({ first_save: _first, ...answer }) => xeroSaved(answer)}
          onDirty={mappingDirty}
          resetKey={resetKey}
          drafts={drafts}
        />

        {/* under the mapping (owner, 2026-11-12) */}
        <AccountCodesCard
          load={xero}
          busy={busy !== null}
          call={call}
          connectHref={connectHref}
          onRetry={retryXero}
          onSaved={xeroSaved}
          onDirty={codesDirty}
          resetKey={resetKey}
          drafts={drafts}
        />

        {/* under the account codes (owner, 2026-11-17; Figma 464:73 row 4) */}
        {read.sales_parts ? (
          <SalesAccountsCard
            key={resetKey}
            saved={read.sales_parts}
            canEdit={!!perms.edit_sales_accounts}
            busy={busy !== null}
            onSave={(parts: SalesParts) =>
              write("/settings/sales-accounts", { method: "PUT", json: parts })
            }
            onDirty={accountsDirty}
            methodsFor={methodsFor}
            drafts={drafts}
          />
        ) : null}

        {/* an API without the sales accounts: the method cards of their own, as before */}
        {(read.sales_parts ? [] : shownTypes(read)).map((type) => (
          <SalesMethodsCard
            key={type}
            type={type}
            groups={read.sales_groups}
            methods={read.sales_methods[type]}
            available={read.available[type]}
            permissions={perms}
            busy={busy !== null}
            actions={actions}
          />
        ))}
      </div>

      {/* Over the sidebar drawer and any other modal, as General's: data-leave-dialog keeps a link
          inside the dialog out of the guard. */}
      {leave.open
        ? createPortal(
            <div data-leave-dialog="" className="relative z-[250]">
              <LeaveDialog onDiscard={leave.discard} onStay={leave.stay} />
            </div>,
            document.body,
          )
        : null}

      {busy ? <BusyOverlay text={busy} /> : null}
      {confirmDelete ? (
        <SettingsDialog
          title={`${confirmDelete.method.own ? "Delete" : "Remove"} ${KIND[confirmDelete.type].title} Method`}
          onClose={() => setConfirmDelete(null)}
          actions={
            <>
              <button
                type="button"
                className={SETTINGS_OUTLINE}
                onClick={() => setConfirmDelete(null)}
              >
                Go back
              </button>
              <button
                type="button"
                className={SETTINGS_DANGER_FILL}
                onClick={() => {
                  const { method } = confirmDelete;
                  setConfirmDelete(null);
                  void write(`/sales-methods/${encodeURIComponent(method.id)}`, {
                    method: "DELETE",
                  });
                }}
              >
                {confirmDelete.method.own ? "Delete" : "Remove"}
              </button>
            </>
          }
        >
          {confirmDelete.method.own ? (
            <p className="[overflow-wrap:anywhere]">
              Are you sure you want to delete &quot;
              <strong className="font-semibold text-set-ink">{confirmDelete.method.name}</strong>
              &quot;? This action cannot be undone.
            </p>
          ) : (
            // Minty's method only leaves this company's list (owner, 2026-11-12)
            <p className="[overflow-wrap:anywhere]">
              Remove &quot;
              <strong className="font-semibold text-set-ink">{confirmDelete.method.name}</strong>
              &quot; from your list? You can add it back any time.
            </p>
          )}
        </SettingsDialog>
      ) : null}
    </>
  );
}
