"use client";

/**
 * The sales accounts, under Petty Cash Account Code (owner, 2026-11-17; Figma 464:73 row 4): Sales -
 * Cash, Sales - Electronic Payment and Sales - Delivery on or off - which parts the daily report asks
 * for, as onboarding's sales accounts screen chose them - with each ticked account's methods inside
 * it (Figma 529:675). Since 2026-11-20 the card holds EVERYTHING until Save changes: the ticks and
 * every method added, renamed, moved or taken off, sent together in one `PUT /settings/sales`.
 * Save asks first only when something is turned off or taken off (minty-web's ConfirmDialog); at
 * least one account stays on, said at once. Turning one off keeps its methods: they come back when
 * it is turned on again. A refusal keeps every change, with the API's sentence.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { fingerprint } from "@minty/shared/drafts";
import { DraftNotice } from "@minty/shared/ui";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SETTINGS_PRIMARY } from "@/components/ui/settingsButtons";

import { Icon, PettyCashCard } from "@/features/petty-cash-settings/components/parts";
import type { MethodActions } from "@/features/petty-cash-settings/components/SalesMethodsCard";
import {
  DRAFT_FORMS,
  useCardDraft,
  type CardDrafts,
} from "@/features/petty-cash-settings/lib/drafts";
import {
  KIND,
  METHOD_TYPES,
  NEW_METHOD,
  NO_SALES_ACCOUNT,
  SALES_ACCOUNT,
  SALES_PARTS,
  heldAvailable,
  heldFrom,
  methodChanges,
  placedIds,
  removedMethods,
  salesBody,
  type CatalogueMethod,
  type HeldMethod,
  type HeldMethods,
  type MethodType,
  type SalesBody,
  type SalesMethod,
  type SalesPart,
  type SalesParts,
} from "@/features/petty-cash-settings/lib/settings";

const BADGE: Record<SalesPart, string> = {
  cash: "bg-set-ok-bg text-set-ok-ink",
  electronic: "bg-set-info-bg text-set-info-ink",
  delivery: "bg-set-warning-bg text-set-warning-ink",
};

/** What the card hands the page to draw a ticked account's methods: its held lists and actions. */
export type HeldLists = {
  methods: HeldMethods;
  available: Record<MethodType, CatalogueMethod[]>;
  actions: MethodActions;
};

/** The card's browser draft (shape 2, 2026-11-20): the ticks and the methods it holds. */
type SalesDraft = { ticks: SalesParts; methods: HeldMethods };

/** A kept draft's methods, only in the shape the card holds them. */
function draftMethods(value: unknown): HeldMethods | null {
  if (!value || typeof value !== "object") return null;
  const out: HeldMethods = { electronic: [], delivery: [] };
  for (const type of METHOD_TYPES) {
    const list = (value as Record<string, unknown>)[type];
    if (!Array.isArray(list)) return null;
    for (const item of list as Partial<HeldMethod>[]) {
      if (!item || typeof item.id !== "string" || typeof item.name !== "string") return null;
      out[type].push({
        id: item.id,
        name: item.name,
        value_name: typeof item.value_name === "string" ? item.value_name : "",
        own: !!item.own,
        ...(item.fresh ? { fresh: true } : {}),
        ...(typeof item.sale_info_id === "string" ? { sale_info_id: item.sale_info_id } : {}),
      });
    }
  }
  return out;
}

/** The question's title: what goes, in a few words. */
function confirmTitle(turnedOff: SalesPart[], removed: SalesMethod[]): string {
  const parts: string[] = [];
  if (turnedOff.length)
    parts.push(`turn off ${turnedOff.map((k) => SALES_ACCOUNT[k].name).join(" and ")}`);
  if (removed.length)
    parts.push(
      removed.length === 1 ? `remove ${removed[0].name}` : `remove ${removed.length} methods`,
    );
  const text = parts.join(" and ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}?`;
}

export function SalesAccountsCard({
  saved,
  savedMethods,
  available,
  canEdit,
  holdsMethods,
  busy,
  entityName,
  onSave,
  onDirty,
  say,
  methodsFor,
  drafts,
}: {
  saved: SalesParts;
  /** The methods the API holds, per type: the card's starting copy. */
  savedMethods: Record<MethodType, SalesMethod[]>;
  /** The catalogue methods not on the company's lists (the add field's choices). */
  available: Record<MethodType, CatalogueMethod[]>;
  canEdit: boolean;
  /** This person sees the methods: only then does the save send their lists. */
  holdsMethods: boolean;
  busy: boolean;
  /** The company, under the question's title. */
  entityName?: string;
  /** Sends the card in one `PUT /settings/sales`; true when the API took it. */
  onSave: (body: SalesBody) => Promise<boolean>;
  /** Unsaved changes, for the page's "Leave without saving?". */
  onDirty: (on: boolean) => void;
  /** The error toast (the add field with nothing picked). */
  say: (message: string) => void;
  /** The methods drawn inside a ticked account (Figma 529:675) from the card's held lists; null
   * for none (Cash). */
  methodsFor: (part: SalesPart, held: HeldLists) => ReactNode;
  /** The card's auto-saved draft (`lib/drafts.ts`). */
  drafts?: CardDrafts;
}) {
  const [ticks, setTicks] = useState<SalesParts>(saved);
  const [methods, setMethods] = useState<HeldMethods>(() => heldFrom(savedMethods));
  // Discard changes remounts the card (the page's resetKey). A save answers a new read: the card
  // starts again from it (the API's ids for what was added here).
  const [base, setBase] = useState(savedMethods);
  if (base !== savedMethods) {
    setBase(savedMethods);
    setMethods(heldFrom(savedMethods));
    setTicks(saved);
  }
  const [confirm, setConfirm] = useState<{
    turnedOff: SalesPart[];
    removed: SalesMethod[];
  } | null>(null);

  const changes =
    SALES_PARTS.filter((k) => ticks[k] !== saved[k]).length + methodChanges(savedMethods, methods);
  const none = SALES_PARTS.every((k) => !ticks[k]);
  useEffect(() => onDirty(changes > 0), [changes, onDirty]);
  // the ticks and methods as a browser draft, against what the API sent (lib/drafts.ts)
  const savedMark = useMemo(
    () => fingerprint({ parts: saved, methods: savedMethods }),
    [saved, savedMethods],
  );
  const draft = useCardDraft<SalesDraft>(drafts, {
    form: DRAFT_FORMS.sales,
    shape: 2,
    ready: canEdit,
    basedOn: savedMark,
    value: { ticks, methods },
    dirty: canEdit && changes > 0,
  });
  const restoreDraft = () => {
    const kept = draft.restore()?.value;
    if (!kept) return;
    const t: Partial<SalesParts> = kept.ticks ?? {};
    setTicks({ cash: !!t.cash, electronic: !!t.electronic, delivery: !!t.delivery });
    const back = draftMethods(kept.methods);
    if (!back) return;
    setMethods(back);
  };
  const describeDraft = () => {
    const value = draft.offer?.value;
    const kept = draftMethods(value?.methods);
    return [
      ...SALES_PARTS.map((k) => ({
        label: SALES_ACCOUNT[k].name,
        value: value?.ticks?.[k] ? "On" : "Off",
      })),
      ...(kept
        ? METHOD_TYPES.map((type) => ({
            label: `${KIND[type].title} methods`,
            value: kept[type].map((h) => h.name).join(", ") || "None",
          }))
        : []),
    ];
  };

  // The methods' actions, on the card's own lists: nothing is sent until Save changes.
  const change = useCallback(
    (type: MethodType, next: (list: HeldMethod[]) => HeldMethod[]) =>
      setMethods((all) => ({ ...all, [type]: next(all[type]) })),
    [],
  );
  const place = (type: MethodType, from: number, to: number) =>
    change(type, (list) => {
      const order = placedIds(
        list.map((h) => h.id),
        from,
        to,
      );
      return order ? order.map((id) => list.find((h) => h.id === id) as HeldMethod) : list;
    });
  const actions: MethodActions = {
    add: async (type, body) => {
      // a saved method taken off here comes back as itself (at the end)
      const back = savedMethods[type].find((m) =>
        "sale_info_id" in body
          ? m.id === body.sale_info_id
          : m.name.trim().toLowerCase() === body.name.trim().toLowerCase(),
      );
      if (back && !methods[type].some((h) => !h.fresh && h.id === back.id)) {
        change(type, (list) => [...list, back]);
        return true;
      }
      const picked =
        "sale_info_id" in body ? available[type].find((m) => m.id === body.sale_info_id) : null;
      if (picked === undefined) return false;
      setMethods((all) => {
        // a new id, one past every new id either list holds (a rename finds it by id)
        const used = [...all.electronic, ...all.delivery]
          .filter((h) => h.id.startsWith(NEW_METHOD))
          .map((h) => Number(h.id.slice(NEW_METHOD.length)) || 0);
        const id = `${NEW_METHOD}${Math.max(0, ...used) + 1}`;
        const added: HeldMethod = picked
          ? {
              id,
              name: picked.name,
              value_name: "",
              own: false,
              fresh: true,
              sale_info_id: picked.id,
            }
          : // typed here: the company's own
            {
              id,
              name: "name" in body ? body.name.trim() : "",
              value_name: "",
              own: true,
              fresh: true,
            };
        return { ...all, [type]: [...all[type], added] };
      });
      return true;
    },
    rename: async (method, name) => {
      for (const type of METHOD_TYPES)
        change(type, (list) => list.map((h) => (h.id === method.id ? { ...h, name } : h)));
      return true;
    },
    move: (type, index, step) => place(type, index, index + step),
    place,
    // no question of its own: Discard changes, or not saving, puts it back
    remove: (type, method) => change(type, (list) => list.filter((h) => h.id !== method.id)),
    say,
  };
  const held: HeldLists = {
    methods,
    available: {
      electronic: heldAvailable(available.electronic, savedMethods.electronic, methods.electronic),
      delivery: heldAvailable(available.delivery, savedMethods.delivery, methods.delivery),
    },
    actions,
  };

  const send = async () => {
    setConfirm(null);
    if (await onSave(salesBody(ticks, holdsMethods ? methods : null, savedMethods))) draft.clear();
  };
  const save = () => {
    if (none || !changes) return;
    const turnedOff = SALES_PARTS.filter((k) => saved[k] && !ticks[k]);
    const removed = removedMethods(savedMethods, methods);
    if (turnedOff.length || removed.length) setConfirm({ turnedOff, removed });
    else void send();
  };

  return (
    <PettyCashCard
      title="Sales accounts and methods"
      lead="Tick the accounts your business takes, then set the methods under each. Your daily report asks only for those, and at least one account stays on."
      readOnly={!canEdit}
      testId="sales-accounts"
    >
      {draft.offer ? (
        <DraftNotice
          savedAt={draft.offer.savedAt}
          stale={draft.offer.stale}
          onRestore={restoreDraft}
          onDiscard={draft.discard}
          describe={describeDraft}
        />
      ) : null}
      <div
        role="group"
        aria-label="Sales accounts"
        aria-describedby={none ? "sales-accounts-none" : undefined}
        className={`flex min-w-0 flex-col gap-2.5 rounded-[16px] ${none ? "ring-2 ring-set-danger-line" : ""}`}
      >
        {SALES_PARTS.map((key) => {
          const account = SALES_ACCOUNT[key];
          const on = ticks[key];
          const inside = on ? methodsFor(key, held) : null;
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
                    className={`mt-1 rounded-[6px] px-2 py-0.5 text-xs font-medium ${on ? "bg-state-selected text-text-link" : "bg-transparent px-0 text-set-mute"}`}
                  >
                    {on
                      ? `Shows on your daily report: ${account.part}`
                      : "Not on your daily report"}
                  </span>
                </span>
                <span
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[18px] text-white ${on ? "border-border-selected bg-action-primary" : "border-set-edge bg-white"}`}
                >
                  {on ? <Icon name="check" /> : null}
                </span>
              </button>
              {inside ? (
                <div className="mx-4 mb-4 border-t border-set-line pt-3.5">{inside}</div>
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
        <ConfirmDialog
          title={confirmTitle(confirm.turnedOff, confirm.removed)}
          image="surprised"
          entityName={entityName}
          busy={busy}
          confirmTone="red"
          confirmLabel={
            confirm.removed.length === 0
              ? "Turn off"
              : confirm.turnedOff.length
                ? "Save changes"
                : confirm.removed.every((m) => m.own)
                  ? "Delete"
                  : "Remove"
          }
          onConfirm={() => void send()}
          onBack={() => setConfirm(null)}
        >
          {confirm.turnedOff.map((k) => (
            <p key={k} className="[overflow-wrap:anywhere]">
              {confirm.turnedOff.length > 1 || confirm.removed.length ? (
                <strong>{SALES_ACCOUNT[k].name}: </strong>
              ) : null}
              {SALES_ACCOUNT[k].kept}
            </p>
          ))}
          {confirm.removed.length ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {confirm.removed.map((m) => (
                // the company's own is deleted; Minty's only leaves the list (owner, 2026-11-12)
                <li key={m.id} className="[overflow-wrap:anywhere]">
                  {m.own
                    ? `${m.name} is deleted. This can't be undone.`
                    : `${m.name} comes off your list. You can add it back any time.`}
                </li>
              ))}
            </ul>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </PettyCashCard>
  );
}
