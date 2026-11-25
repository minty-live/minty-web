"use client";

/**
 * General's chart of accounts and contacts cards (owner, 2026-11-12; their own tab first): the company's chart of accounts and
 * its contacts, every row with **Edit** and **Delete** - each is the company's own copy, those from
 * Minty's starter chart marked "Comes with Minty" (owner, 2026-11-12). Add (the
 * card's top-right button) and Edit open a form inline at the top of the card, above the list - no
 * dialog, as Petty Cash Settings' Add New Method (owner, 2026-11-12) - checked as typed
 * (`lib/rules.ts`); Delete asks first, saying what happens to records and to Xero. Every change is
 * the API's at once. While the company is live on Xero (`xero_live`) the chart has no Add, Edit or
 * Delete at all - Xero's to change, and the API refuses them (the user, 2026-11-23); contacts are still
 * added here (in Xero too while live), and a contact linked to Xero is changed in Xero only. Contacts
 * merge the Xero way (the user, 2026-11-25): **Merge contacts** turns the list into tick boxes and a panel
 * picks the one kept - always one of those ticked; while Xero is connected a contact in Xero is merged in
 * Xero first; while it is off, one linked to Xero merges here and the panel says Xero keeps it apart. Accounts are never merged (the user, 2026-11-24 - each matches its own Xero account).
 * An account shows its Minty code and, once linked, its Xero code beside it (Minty Code + Xero Code).
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { fingerprint, useAutoSaveDraft, type DraftScope } from "@minty/shared/drafts";
import { DraftRestore } from "@minty/shared/ui";

import {
  SETTINGS_DANGER_FILL,
  SETTINGS_OUTLINE,
  SETTINGS_PRIMARY,
} from "@/components/ui/settingsButtons";
import {
  SETTINGS_FIELD_ERROR,
  SETTINGS_INPUT,
  SETTINGS_INPUT_BAD,
  SETTINGS_INPUT_OK,
  SETTINGS_LABEL,
} from "@/components/ui/settingsFields";
import { Combo, type ComboRow } from "@/components/ui/Combo";
import { SettingsCard, SettingsDialog } from "@/components/ui/SettingsShell";
import { Tick } from "@/components/ui/Tick";

import type {
  Account,
  AccountInput,
  AccountsRead,
  Contact,
  ContactsRead,
  FromMinty,
  MintyAccount,
} from "@/features/company-settings/api/chart";
import {
  accountProblems,
  contactProblem,
  deleteNote,
  GONE_FROM_XERO,
  mergeInXeroNote,
  mergeLinkedNote,
  mergeSummary,
  usedNote,
  type AccountProblems,
} from "@/features/company-settings/lib/chartRules";

/** What a submit answers: done, or the API's per-field sentences to show under the fields. */
export type Outcome = { ok: true } | { ok: false; fields?: Record<string, string> };

/** A Material Symbols glyph at its box's size (petty-cash-settings' helper; features stay apart). */
function Icon({ name }: { name: string }) {
  return (
    <span className="inline-flex shrink-0 text-[20px]" aria-hidden="true">
      <span className="material-symbols-outlined" style={{ fontSize: "inherit" }}>
        {name}
      </span>
    </span>
  );
}

/** A row with a Xero id: "In Xero" while Xero is connected, "Linked to Xero" while it is off
 * (disconnected, or part-way through matching; Xero optional, 2026-11-10). */
function XeroBadge({ live }: { live: boolean }) {
  return <Badge>{live ? "In Xero" : "Linked to Xero"}</Badge>;
}

/** Under the search. While Xero is connected no account is added, changed or deleted here (the user,
 * 2026-11-23; accounts only); otherwise a row linked to Xero is changed in Xero (the user, 2026-11-19 -
 * accounts, with the owner's decisions doc A1; then contacts the same day). */
function FromXeroNote({ what, live }: { what: "Accounts" | "Contacts"; live: boolean }) {
  return (
    <p className="text-[13px] text-set-ink-2">
      {live
        ? `Your company is connected to Xero, so ${what.toLowerCase()} are added and changed in Xero, and Minty follows.`
        : `${what} linked to Xero are changed in Xero, and Minty follows.`}
    </p>
  );
}

const ROW_BUTTON =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-set-mute transition-colors disabled:cursor-not-allowed";

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-set-pill px-2 py-0.5 text-[12px] font-medium text-set-ink-2">
      {children}
    </span>
  );
}

/** A list row: the name and its line, then Edit and Delete where the company owns it. */
function Row({
  title,
  detail,
  badges,
  note,
  canEdit,
  canDelete,
  busy,
  onEdit,
  onDelete,
}: {
  title: string;
  detail?: string;
  badges: ReactNode;
  /** A line under the row that needs the person (an account gone from Xero, A3). */
  note?: ReactNode;
  canEdit: boolean;
  canDelete: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex min-h-14 min-w-0 items-center gap-2 border-b border-set-line px-3 py-2 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="min-w-0 text-[14.5px] [overflow-wrap:anywhere] text-set-ink">{title}</span>
        {detail || badges ? (
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12.5px] text-set-mute">
            {detail ? <span>{detail}</span> : null}
            {badges}
          </span>
        ) : null}
        {note}
      </div>
      {canEdit ? (
        <button
          type="button"
          disabled={busy}
          onClick={onEdit}
          aria-label={`Edit ${title}`}
          title="Edit"
          className={`${ROW_BUTTON} enabled:hover:bg-set-pill enabled:hover:text-set-ink`}
        >
          <Icon name="edit" />
        </button>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          aria-label={`Delete ${title}`}
          title="Delete"
          className={`${ROW_BUTTON} enabled:hover:bg-set-warn-bg enabled:hover:text-set-danger-line`}
        >
          <Icon name="delete" />
        </button>
      ) : null}
    </li>
  );
}

/**
 * The add / edit form, inline at the top of its card (owner, 2026-11-12: no dialog). Its first
 * field takes focus; Escape cancels unless a picker's list is open (the picker closes that first).
 */
function InlineForm({
  title,
  busy,
  onClose,
  actions,
  children,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  actions: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
  }, []);
  return (
    <div
      ref={panel}
      role="group"
      aria-label={title}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape" && !e.defaultPrevented && !busy) {
          e.preventDefault();
          onClose();
        }
      }}
      className="flex min-w-0 flex-col gap-4 rounded-[12px] border border-set-line p-4"
    >
      <h4 className="text-[14.5px] font-semibold [overflow-wrap:anywhere] text-set-ink">{title}</h4>
      {children}
      <div className="flex flex-wrap gap-3">{actions}</div>
    </div>
  );
}

/** A long list scrolls in its own box (owner, 2026-11-12), the page around it with the document. */
const LIST =
  "m-0 max-h-[min(28rem,60vh)] list-none overflow-y-auto overscroll-contain rounded-[12px] border border-set-line p-0 [scrollbar-gutter:stable]";

function AddButton({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`${SETTINGS_OUTLINE} w-full sm:w-auto`}
    >
      <Icon name="add" />
      {label}
    </button>
  );
}

function Search({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${SETTINGS_INPUT} ${SETTINGS_INPUT_OK} placeholder:text-set-mute`}
      />
    </div>
  );
}

// ---- accounts ------------------------------------------------------------------------------------

export function AccountsCard({
  read,
  busy,
  form,
  onAdd,
  onEdit,
  onDelete,
  mapHref,
}: {
  read: AccountsRead;
  busy: boolean;
  /** The add / edit form when one is open, drawn above the list. */
  form?: ReactNode;
  onAdd: () => void;
  onEdit: (account: Account) => void;
  onDelete: (account: Account) => void;
  /** The matching page for one account (A3): where an account gone from Xero is mapped again. */
  mapHref: (account: Account) => string;
}) {
  const [query, setQuery] = useState("");
  const { permissions: may } = read;
  // live on Xero: added, changed and deleted in Xero only (the user, 2026-11-23); never merged (2026-11-24)
  const here = !read.xero_live;
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = read.accounts.filter(
      (a) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        (a.xero_code ?? "").toLowerCase().includes(q),
    );
    return read.types
      .map((t) => ({ label: t.label, rows: shown.filter((a) => a.type === t.value) }))
      .filter((g) => g.rows.length);
  }, [read, query]);
  return (
    <SettingsCard
      title="Chart of accounts"
      lead="The accounts your reports and payment requests post to."
      readOnly={!may.add && !may.edit && !may.delete}
      action={
        may.add && here && !form ? (
          <AddButton label="Add an account" busy={busy} onClick={onAdd} />
        ) : null
      }
    >
      {form}
      <Search label="Search accounts by name or code" value={query} onChange={setQuery} />
      {read.xero_live || read.accounts.some((a) => a.in_xero) ? (
        <FromXeroNote what="Accounts" live={read.xero_live} />
      ) : null}
      {groups.length === 0 ? (
        <p className="text-sm text-set-mute" role="status">
          {read.accounts.length ? "No accounts match your search." : "No accounts yet."}
        </p>
      ) : (
        <div className={LIST} aria-label="Accounts" role="region">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h4 className="sticky top-0 z-10 border-b border-set-line bg-set-pill px-3 py-2 text-[12.5px] font-semibold text-set-ink-2">
                {group.label}
              </h4>
              <ul className="m-0 list-none p-0">
                {group.rows.map((a) => (
                  <Row
                    key={a.id}
                    title={a.code ? `${a.code} - ${a.name}` : a.name}
                    detail={a.description || undefined}
                    badges={
                      <>
                        {/* Minty Code + Xero Code (the user, 2026-11-24): the title's is Minty's */}
                        {a.in_xero && a.xero_code ? <span>Xero code {a.xero_code}</span> : null}
                        {a.gone_from_xero ? (
                          <Badge>Archived in Xero</Badge>
                        ) : a.in_xero ? (
                          <XeroBadge live={read.xero_live} />
                        ) : null}
                        {a.source === "template" ? <Badge>Comes with Minty</Badge> : null}
                      </>
                    }
                    note={
                      a.gone_from_xero ? (
                        <span className="text-[12.5px] text-set-danger-line">
                          {GONE_FROM_XERO}{" "}
                          <a
                            href={mapHref(a)}
                            className="font-semibold underline underline-offset-2"
                            aria-label={`Map ${a.name} to a Xero account`}
                          >
                            Map it
                          </a>
                        </span>
                      ) : undefined
                    }
                    // linked to Xero: changed in Xero only (the user, 2026-11-19)
                    canEdit={a.own && may.edit && here && !a.in_xero}
                    canDelete={a.own && may.delete && here && !a.in_xero}
                    busy={busy}
                    onEdit={() => onEdit(a)}
                    onDelete={() => onDelete(a)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}

const EMPTY: AccountInput = { code: "", name: "", type: "", description: "" };
const ADD = "__add__";
/** The picker's note, on top as the list opens (owner, 2026-11-12: Petty Cash Settings' way). */
export const ACCOUNT_HINT = "Type an account name to add a new account";
const PICK_ONE = "Pick one of Minty's accounts, or type a name to add your own.";

type Pick = { kind: "minty"; row: MintyAccount } | { kind: "new" } | null;

/** What the account form keeps as a browser draft: the pick (Minty's account id, "new" or none). */
type AccountDraft = {
  pick: string | null;
  text: string;
  input: AccountInput;
  codeTouched: boolean;
};

/**
 * Add or edit one account. Adding works as Petty Cash Settings' Add New Method (owner,
 * 2026-11-12): an **Account** dropdown of Minty's accounts - one picked is added as it is - and a
 * name typed into it that isn't there offers "+ Add '<name>' as a new account", which opens the
 * fields for the company's own: Type, then Code (the next free one filled in), Name, Description.
 * Editing is those fields alone.
 *
 * What is typed is kept as a browser draft (`settings.account`, record `new` or the account's id;
 * `@minty/shared/drafts`, the owner's decisions doc L1): 2 s after the last change, put back at once
 * when the form opens again (no notice - the user, 2026-11-24), stale - dropped silently, never put
 * back - once the account was saved since. Removed by a save that went through and by Cancel.
 */
export function AccountForm({
  read,
  editing,
  busy,
  onClose,
  onSubmit,
  draftScope = null,
}: {
  read: AccountsRead;
  /** The account being edited; null to add one. */
  editing: Account | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: AccountInput | FromMinty) => Promise<Outcome>;
  /** Whose drafts (`lib/draftScope.ts`); null keeps none. */
  draftScope?: DraftScope | null;
}) {
  const ids = { type: useId(), code: useId(), name: useId(), description: useId() };
  const pickerId = useId();
  const [pick, setPick] = useState<Pick>(editing ? { kind: "new" } : null);
  const [text, setText] = useState("");
  const [pickProblem, setPickProblem] = useState<string | null>(null);
  const [input, setInput] = useState<AccountInput>(
    editing
      ? {
          code: editing.code,
          name: editing.name,
          type: editing.type,
          description: editing.description,
        }
      : EMPTY,
  );
  // a code the person typed stays; one we filled in follows the type
  const [codeTouched, setCodeTouched] = useState(!!editing);
  const [submitted, setSubmitted] = useState(false);
  const [server, setServer] = useState<Record<string, string>>({});
  const others = read.accounts.filter((a) => a.id !== editing?.id);
  const problems: AccountProblems = { ...accountProblems(input, others, submitted), ...server };
  const typeLabel = read.types.find((t) => t.value === input.type)?.label ?? "";
  const nextCode = input.type ? read.next_codes[input.type] : undefined;

  const savedInput = useMemo(
    () =>
      editing
        ? {
            code: editing.code,
            name: editing.name,
            type: editing.type,
            description: editing.description,
          }
        : null,
    [editing],
  );
  const draft = useAutoSaveDraft<AccountDraft>({
    scope: draftScope,
    form: "settings.account",
    record: editing?.id ?? "new",
    shape: 1,
    basedOn: savedInput ? fingerprint(savedInput) : null,
    value: {
      pick: pick === null ? null : pick.kind === "minty" ? pick.row.id : "new",
      text,
      input,
      codeTouched,
    },
    dirty: savedInput
      ? (Object.keys(savedInput) as (keyof AccountInput)[]).some((k) => input[k] !== savedInput[k])
      : pick !== null || text.trim() !== "",
  });
  /** Cancel (and Escape): the form closes and its draft goes with it. */
  const close = () => {
    draft.clear();
    onClose();
  };
  function restoreDraft() {
    const kept = draft.restore()?.value;
    if (!kept) return;
    const row = read.minty_accounts.find((m) => m.id === kept.pick);
    setPick(editing || kept.pick === "new" ? { kind: "new" } : row ? { kind: "minty", row } : null);
    setText(typeof kept.text === "string" ? kept.text : "");
    if (kept.input) setInput({ ...EMPTY, ...kept.input });
    setCodeTouched(Boolean(kept.codeTouched) || !!editing);
  }

  function set(field: keyof AccountInput, value: string) {
    // a field typed into drops the API's sentence about it
    setServer((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== field)));
    setInput((current) => {
      const next = { ...current, [field]: value };
      if (field === "type" && !codeTouched) next.code = read.next_codes[value] ?? "";
      return next;
    });
    if (field === "code") setCodeTouched(true);
  }

  const known = (name: string) => name.trim().toLowerCase() === text.trim().toLowerCase();

  function rows(query: string): ComboRow[] {
    const typed = query.trim().toLowerCase();
    const offered = read.minty_accounts.filter(
      (m) => !typed || m.name.toLowerCase().includes(typed) || m.code.toLowerCase().includes(typed),
    );
    const out: ComboRow[] = [];
    if (!typed) out.push({ key: "hint", label: ACCOUNT_HINT, info: true });
    out.push(
      ...offered.map((m) => ({
        key: m.id,
        label: m.name,
        sub: [m.code, m.type_label].filter(Boolean).join(" · "),
        selected: pick?.kind === "minty" && pick.row.id === m.id,
      })),
    );
    if (
      typed &&
      !read.minty_accounts.some((m) => known(m.name)) &&
      !others.some((a) => known(a.name))
    )
      out.push({
        key: ADD,
        label: `+ Add '${query.trim()}' as a new account`,
        divided: offered.length > 0,
      });
    if (typed && !offered.length)
      out.push({ key: "none", label: "No matching account found", info: true });
    return out;
  }

  function choose(key: string) {
    setPickProblem(null);
    if (key === ADD) {
      // the typed name goes into the Name field, the rest to fill in
      setPick({ kind: "new" });
      set("name", text.trim());
      return;
    }
    const row = read.minty_accounts.find((m) => m.id === key);
    if (!row) return;
    setPick({ kind: "minty", row });
    setText(row.name);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pick === null) {
      setPickProblem(PICK_ONE);
      document.getElementById(pickerId)?.focus();
      return;
    }
    if (pick.kind === "minty") {
      const outcome = await onSubmit({ template_id: pick.row.id });
      if (outcome.ok) draft.clear();
      else if (outcome.fields) setPickProblem(Object.values(outcome.fields)[0] ?? null);
      return;
    }
    setSubmitted(true);
    const now = accountProblems(input, others, true);
    const wrong = (Object.keys(now) as (keyof AccountInput)[]).filter((k) => now[k]);
    if (wrong.length) {
      document.getElementById(ids[wrong[0]])?.focus();
      return;
    }
    const outcome = await onSubmit({
      ...input,
      code: input.code.trim(),
      name: input.name.replace(/\s+/g, " ").trim(),
      description: input.description.trim(),
    });
    if (outcome.ok) draft.clear();
    else if (outcome.fields) setServer(outcome.fields);
  }

  const field = (name: keyof AccountInput) => ({
    id: ids[name],
    "aria-invalid": problems[name] ? true : undefined,
    "aria-describedby": problems[name] ? `${ids[name]}-problem` : undefined,
    className: `${SETTINGS_INPUT} ${problems[name] ? SETTINGS_INPUT_BAD : SETTINGS_INPUT_OK}`,
  });
  const problem = (name: keyof AccountInput) =>
    problems[name] ? (
      <p id={`${ids[name]}-problem`} className={SETTINGS_FIELD_ERROR}>
        {problems[name]}
      </p>
    ) : null;
  const required = (label: string) => (
    <>
      {label}{" "}
      <span className="text-set-danger-ink" aria-hidden="true">
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );

  return (
    <InlineForm
      title={editing ? `Edit ${editing.name}` : "Add an account"}
      busy={busy}
      onClose={close}
      actions={
        <>
          <button
            type="button"
            className={`${SETTINGS_OUTLINE} flex-1`}
            disabled={busy}
            onClick={close}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="account-form"
            className={`${SETTINGS_PRIMARY} flex-1`}
            disabled={busy}
          >
            {editing ? "Save" : "Add"}
          </button>
        </>
      }
    >
      {draft.offer ? (
        <DraftRestore
          stale={draft.offer.stale}
          onRestore={restoreDraft}
          onDiscard={draft.discard}
        />
      ) : null}
      <form id="account-form" noValidate onSubmit={submit} className="flex flex-col gap-4">
        {!editing ? (
          <div className="min-w-0">
            <label htmlFor={pickerId} className={SETTINGS_LABEL}>
              {required("Account")}
            </label>
            <Combo
              id={pickerId}
              value={text}
              placeholder="Select an account"
              rows={rows}
              rotateChevron
              required
              invalid={!!pickProblem}
              describedBy={pickProblem ? `${pickerId}-problem` : undefined}
              onText={(typed) => {
                // typing searches; nothing is chosen until a row is picked
                setText(typed);
                setPick(null);
                setPickProblem(null);
              }}
              onPick={choose}
              onBlur={() => setText((typed) => (pick?.kind === "minty" ? pick.row.name : typed))}
            />
            {pickProblem ? (
              <p id={`${pickerId}-problem`} className={SETTINGS_FIELD_ERROR}>
                {pickProblem}
              </p>
            ) : null}
          </div>
        ) : null}
        {pick?.kind === "minty" ? (
          <div className="flex min-w-0 flex-col gap-1 rounded-[12px] border border-set-line bg-set-pill px-3.5 py-3 text-[13px] text-set-ink-2">
            <span className="text-[14.5px] font-semibold [overflow-wrap:anywhere] text-set-ink">
              {pick.row.code ? `${pick.row.code} - ${pick.row.name}` : pick.row.name}
            </span>
            <span>{pick.row.type_label}</span>
            {pick.row.description ? <span>{pick.row.description}</span> : null}
          </div>
        ) : null}
        {pick?.kind === "new" ? (
          <>
            <div className="min-w-0">
              <label htmlFor={ids.type} className={SETTINGS_LABEL}>
                {required("Type")}
              </label>
              <select
                {...field("type")}
                aria-required
                value={input.type}
                onChange={(e) => set("type", e.target.value)}
              >
                <option value="">Choose a type</option>
                {read.types.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              {problem("type")}
            </div>
            <div className="min-w-0">
              <label htmlFor={ids.code} className={SETTINGS_LABEL}>
                {input.type === "bank" ? "Code" : required("Code")}
              </label>
              <input
                {...field("code")}
                type="text"
                autoComplete="off"
                aria-required={input.type !== "bank" || undefined}
                value={input.code}
                onChange={(e) => set("code", e.target.value)}
              />
              {problem("code") ??
                (!editing && nextCode && input.code === nextCode ? (
                  <p className="mt-1.5 text-[12.5px] text-set-mute">
                    {nextCode} is the next free code for {typeLabel}. You can change it.
                  </p>
                ) : null)}
            </div>
            <div className="min-w-0">
              <label htmlFor={ids.name} className={SETTINGS_LABEL}>
                {required("Name")}
              </label>
              <input
                {...field("name")}
                type="text"
                autoComplete="off"
                aria-required
                value={input.name}
                onChange={(e) => set("name", e.target.value)}
              />
              {problem("name")}
            </div>
            <div className="min-w-0">
              <label htmlFor={ids.description} className={SETTINGS_LABEL}>
                Description
              </label>
              <textarea
                {...field("description")}
                rows={2}
                value={input.description}
                onChange={(e) => set("description", e.target.value)}
              />
              {problem("description")}
            </div>
          </>
        ) : null}
      </form>
    </InlineForm>
  );
}

// ---- contacts ------------------------------------------------------------------------------------

/** The Xero-style merge (the user, 2026-11-25): the contacts ticked, and the one kept - one of them. */
export type MergeState = { ticked: string[]; keep: string };

/** Why Merge is off, or null: the reason sits beside the button (the house rule for a gated button). */
export function mergeBlocked(read: ContactsRead, merge: MergeState): string | null {
  if (merge.ticked.length < 2) return "Tick at least two contacts.";
  if (!merge.keep || !merge.ticked.includes(merge.keep)) return "Choose the one to keep.";
  if (read.xero_live) {
    // connected: a contact in Xero is merged in Xero first (the user, 2026-11-25)
    const inXero = read.contacts.filter((c) => merge.ticked.includes(c.id) && c.in_xero);
    if (inXero.length) return mergeInXeroNote(inXero.map((c) => c.name));
  }
  return null;
}

export function ContactsCard({
  read,
  busy,
  form,
  merge,
  onAdd,
  onEdit,
  onDelete,
  onMergeChange,
  onMerge,
}: {
  read: ContactsRead;
  busy: boolean;
  /** The add / rename form when one is open, drawn above the list. */
  form?: ReactNode;
  /** Merge mode: the rows are tick boxes and the panel picks the one kept (null: the list as usual). */
  merge: MergeState | null;
  onAdd: () => void;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  onMergeChange: (merge: MergeState | null) => void;
  /** Merge pressed: the ticked contacts and the one kept, to confirm. */
  onMerge: (merge: MergeState) => void;
}) {
  const [query, setQuery] = useState("");
  const keepId = useId();
  const { permissions: may } = read;
  const q = query.trim().toLowerCase();
  const shown = read.contacts.filter((c) => !q || c.name.toLowerCase().includes(q));
  const mergeable = read.contacts.filter((c) => c.own);
  const ticked = merge ? read.contacts.filter((c) => merge.ticked.includes(c.id)) : [];
  const kept = ticked.find((c) => c.id === merge?.keep);
  const blocked = merge ? mergeBlocked(read, merge) : null;
  // Xero off: linked ones merge here, and Xero keeps them as separate contacts (the user's pick, 2026-11-25)
  const linkedOff = read.xero_live ? [] : ticked.filter((c) => c.in_xero).map((c) => c.name);
  const toggle = (id: string) => {
    if (!merge) return;
    const next = merge.ticked.includes(id)
      ? merge.ticked.filter((t) => t !== id)
      : [...merge.ticked, id];
    onMergeChange({ ticked: next, keep: next.includes(merge.keep) ? merge.keep : "" });
  };
  return (
    <SettingsCard
      title="Contacts"
      lead="The people and businesses on your expenses and payment requests. A contact you add here goes to Xero too when Xero is connected."
      readOnly={!may.add && !may.edit && !may.delete}
      action={
        merge || form ? null : (
          <div className="flex w-full flex-wrap gap-3 sm:w-auto">
            {may.delete && mergeable.length >= 2 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onMergeChange({ ticked: [], keep: "" })}
                className={`${SETTINGS_OUTLINE} w-full sm:w-auto`}
              >
                <Icon name="call_merge" />
                Merge contacts
              </button>
            ) : null}
            {may.add ? <AddButton label="Add a contact" busy={busy} onClick={onAdd} /> : null}
          </div>
        )
      }
    >
      {form}
      <Search label="Search contacts" value={query} onChange={setQuery} />
      {read.contacts.some((c) => c.in_xero) ? <FromXeroNote what="Contacts" live={false} /> : null}
      {merge ? (
        <p className="text-[13px] text-set-ink-2">
          Tick the contacts to merge, then choose the one to keep. The others&apos; records move to
          it.
        </p>
      ) : null}
      <div
        className={
          merge
            ? "grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start"
            : "min-w-0"
        }
      >
        {shown.length === 0 ? (
          <p className="text-sm text-set-mute" role="status">
            {read.contacts.length ? "No contacts match your search." : "No contacts yet."}
          </p>
        ) : merge ? (
          <ul className={LIST} aria-label="Contacts to merge">
            {shown.map((c) => (
              <li key={c.id} className="border-b border-set-line last:border-b-0">
                <label
                  className={`flex min-h-14 min-w-0 items-center gap-3 px-3 py-2 ${c.own ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                >
                  <Tick
                    checked={merge.ticked.includes(c.id)}
                    disabled={busy || !c.own}
                    onChange={() => toggle(c.id)}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="min-w-0 text-[14.5px] [overflow-wrap:anywhere] text-set-ink">
                      {c.name}
                    </span>
                    {c.in_xero ? (
                      <span className="flex flex-wrap gap-1.5">
                        <XeroBadge live={read.xero_live} />
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <ul className={LIST} aria-label="Contacts">
            {shown.map((c) => (
              <Row
                key={c.id}
                title={c.name}
                badges={
                  <>
                    {c.in_xero ? <XeroBadge live={read.xero_live} /> : null}
                    {c.source === "template" ? <Badge>Comes with Minty</Badge> : null}
                  </>
                }
                // linked to Xero: changed in Xero only (the user, 2026-11-19)
                canEdit={c.own && may.edit && !c.in_xero}
                canDelete={c.own && may.delete && !c.in_xero}
                busy={busy}
                onEdit={() => onEdit(c)}
                onDelete={() => onDelete(c)}
              />
            ))}
          </ul>
        )}
        {merge ? (
          <section
            aria-label="Merge contacts"
            className="flex min-w-0 flex-col gap-4 rounded-[12px] border border-set-line p-4"
          >
            <h4 className="text-[14.5px] font-semibold text-set-ink">
              {ticked.length === 1 ? "1 contact ticked" : `${ticked.length} contacts ticked`}
            </h4>
            <label htmlFor={keepId} className="flex min-w-0 flex-col gap-1.5">
              <span className={SETTINGS_LABEL}>Keep this one</span>
              <select
                id={keepId}
                value={kept ? kept.id : ""}
                disabled={busy || ticked.length === 0}
                onChange={(e) => onMergeChange({ ticked: merge.ticked, keep: e.target.value })}
                className={`${SETTINGS_INPUT} ${SETTINGS_INPUT_OK} min-h-11`}
              >
                <option value="">Choose the one to keep</option>
                {ticked.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {kept && ticked.length >= 2 ? (
              <p className="text-[13px] [overflow-wrap:anywhere] text-set-ink-2">
                {mergeSummary(
                  ticked.filter((c) => c.id !== kept.id).map((c) => c.name),
                  kept.name,
                )}
              </p>
            ) : null}
            {linkedOff.length ? (
              <p
                className="text-[13px] [overflow-wrap:anywhere] text-status-warning-ink"
                role="note"
              >
                {mergeLinkedNote(linkedOff)}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={SETTINGS_OUTLINE}
                disabled={busy}
                onClick={() => onMergeChange(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={SETTINGS_PRIMARY}
                disabled={busy || blocked !== null}
                aria-describedby={blocked ? `${keepId}-why` : undefined}
                onClick={() => onMerge(merge)}
              >
                Merge
              </button>
              {blocked ? (
                <span id={`${keepId}-why`} className="text-[12.5px] text-set-ink-2">
                  {blocked}
                </span>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </SettingsCard>
  );
}

/** Add a contact, or rename one. */
export function ContactForm({
  read,
  editing,
  busy,
  onClose,
  onSubmit,
}: {
  read: ContactsRead;
  editing: Contact | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<Outcome>;
}) {
  const id = useId();
  const [name, setName] = useState(editing?.name ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [server, setServer] = useState<string | null>(null);
  const others = read.contacts.filter((c) => c.id !== editing?.id);
  const problem = server ?? contactProblem(name, others, submitted);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (contactProblem(name, others, true)) {
      document.getElementById(id)?.focus();
      return;
    }
    const outcome = await onSubmit(name.replace(/\s+/g, " ").trim());
    if (!outcome.ok && outcome.fields?.name) setServer(outcome.fields.name);
  }

  return (
    <InlineForm
      title={editing ? `Rename ${editing.name}` : "Add a contact"}
      busy={busy}
      onClose={onClose}
      actions={
        <>
          <button
            type="button"
            className={`${SETTINGS_OUTLINE} flex-1`}
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="contact-form"
            className={`${SETTINGS_PRIMARY} flex-1`}
            disabled={busy}
          >
            {editing ? "Save" : "Add"}
          </button>
        </>
      }
    >
      <form id="contact-form" noValidate onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor={id} className={SETTINGS_LABEL}>
          Name{" "}
          <span className="text-set-danger-ink" aria-hidden="true">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </label>
        <input
          id={id}
          type="text"
          autoComplete="off"
          aria-required
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
          value={name}
          onChange={(e) => {
            setServer(null);
            setName(e.target.value);
          }}
          className={`${SETTINGS_INPUT} ${problem ? SETTINGS_INPUT_BAD : SETTINGS_INPUT_OK}`}
        />
        {problem ? (
          <p id={`${id}-problem`} className={SETTINGS_FIELD_ERROR}>
            {problem}
          </p>
        ) : null}
      </form>
    </InlineForm>
  );
}

/** Delete asks first, saying what happens to the records and to Xero. */
export function DeleteDialog({
  row,
  busy,
  onClose,
  onConfirm,
  onMerge,
}: {
  row: { name: string; used: boolean; in_xero: boolean };
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** D3 (owner's decisions doc, 2026-11-19): a used contact can't be deleted, but can be merged.
   * Accounts are never merged (the user, 2026-11-24). */
  onMerge?: () => void;
}) {
  if (row.used) {
    return (
      <SettingsDialog
        title={`${row.name} can't be deleted`}
        busy={busy}
        onClose={onClose}
        actions={
          <>
            <button type="button" className={SETTINGS_OUTLINE} onClick={onClose}>
              Close
            </button>
            {onMerge ? (
              <button type="button" className={SETTINGS_PRIMARY} onClick={onMerge}>
                Merge instead
              </button>
            ) : null}
          </>
        }
      >
        <p className="[overflow-wrap:anywhere]">{usedNote(row.name)}</p>
      </SettingsDialog>
    );
  }
  return (
    <SettingsDialog
      title={`Delete ${row.name}?`}
      busy={busy}
      onClose={onClose}
      actions={
        <>
          <button type="button" className={SETTINGS_OUTLINE} disabled={busy} onClick={onClose}>
            Go back
          </button>
          <button
            type="button"
            className={SETTINGS_DANGER_FILL}
            disabled={busy}
            onClick={onConfirm}
          >
            Delete
          </button>
        </>
      }
    >
      <p className="[overflow-wrap:anywhere]">{deleteNote(row)}</p>
    </SettingsDialog>
  );
}
