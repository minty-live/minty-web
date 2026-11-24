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
 * added here (in Xero too while live), and a contact linked to Xero is changed in Xero only. Merge stays.
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
  accountClass,
  accountProblems,
  contactProblem,
  deleteNote,
  GONE_FROM_XERO,
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
  canMerge = false,
  busy,
  onEdit,
  onDelete,
  onMerge,
}: {
  title: string;
  detail?: string;
  badges: ReactNode;
  /** A line under the row that needs the person (an account gone from Xero, A3). */
  note?: ReactNode;
  canEdit: boolean;
  canDelete: boolean;
  canMerge?: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMerge?: () => void;
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
      {canMerge && onMerge ? (
        <button
          type="button"
          disabled={busy}
          onClick={onMerge}
          aria-label={`Merge ${title}`}
          title="Merge"
          className={`${ROW_BUTTON} enabled:hover:bg-set-pill enabled:hover:text-set-ink`}
        >
          <Icon name="call_merge" />
        </button>
      ) : null}
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
  onMerge,
  mapHref,
}: {
  read: AccountsRead;
  busy: boolean;
  /** The add / edit form when one is open, drawn above the list. */
  form?: ReactNode;
  onAdd: () => void;
  onEdit: (account: Account) => void;
  onDelete: (account: Account) => void;
  onMerge: (account: Account) => void;
  /** The matching page for one account (A3): where an account gone from Xero is mapped again. */
  mapHref: (account: Account) => string;
}) {
  const [query, setQuery] = useState("");
  const { permissions: may } = read;
  // live on Xero: added, changed and deleted in Xero only - Merge stays (the user, 2026-11-23)
  const here = !read.xero_live;
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = read.accounts.filter(
      (a) => !q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q),
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
                    canMerge={a.own && may.delete}
                    busy={busy}
                    onEdit={() => onEdit(a)}
                    onDelete={() => onDelete(a)}
                    onMerge={() => onMerge(a)}
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

export function ContactsCard({
  read,
  busy,
  form,
  onAdd,
  onEdit,
  onDelete,
  onMerge,
}: {
  read: ContactsRead;
  busy: boolean;
  /** The add / rename form when one is open, drawn above the list. */
  form?: ReactNode;
  onAdd: () => void;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  onMerge: (contact: Contact) => void;
}) {
  const [query, setQuery] = useState("");
  const { permissions: may } = read;
  const q = query.trim().toLowerCase();
  const shown = read.contacts.filter((c) => !q || c.name.toLowerCase().includes(q));
  return (
    <SettingsCard
      title="Contacts"
      lead="The people and businesses on your expenses and payment requests. A contact you add here goes to Xero too when Xero is connected."
      readOnly={!may.add && !may.edit && !may.delete}
      action={
        may.add && !form ? <AddButton label="Add a contact" busy={busy} onClick={onAdd} /> : null
      }
    >
      {form}
      <Search label="Search contacts" value={query} onChange={setQuery} />
      {read.contacts.some((c) => c.in_xero) ? <FromXeroNote what="Contacts" live={false} /> : null}
      {shown.length === 0 ? (
        <p className="text-sm text-set-mute" role="status">
          {read.contacts.length ? "No contacts match your search." : "No contacts yet."}
        </p>
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
              canMerge={c.own && may.delete}
              busy={busy}
              onEdit={() => onEdit(c)}
              onDelete={() => onDelete(c)}
              onMerge={() => onMerge(c)}
            />
          ))}
        </ul>
      )}
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
  /** D3 (owner's decisions doc, 2026-11-19): a used one can't be deleted, but can be merged. */
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

/** One of the two records a merge names. */
export type MergeSide = { id: string; name: string };

/**
 * Merge two accounts or two contacts (owner's decisions doc M1-M4): the other one picked, then
 * which of the two is kept. No new record is made and Xero isn't touched; the next step asks once
 * more (`mergeNote`). Accounts merge only within one class (an expense into an expense).
 */
export function MergeDialog({
  kind,
  row,
  others,
  into,
  busy,
  onClose,
  onNext,
}: {
  kind: "account" | "contact";
  row: MergeSide;
  others: (MergeSide & { label: string })[];
  /** Preselected (from the matching page's "merge instead"). */
  into?: string;
  busy: boolean;
  onClose: () => void;
  onNext: (merged: MergeSide, kept: MergeSide) => void;
}) {
  const id = useId();
  const [other, setOther] = useState(into && others.some((o) => o.id === into) ? into : "");
  const [keep, setKeep] = useState<"this" | "other">("other");
  const picked = others.find((o) => o.id === other);
  const reason = picked ? null : `Choose the ${kind} to merge ${row.name} with.`;
  return (
    <SettingsDialog
      title={`Merge ${row.name}`}
      busy={busy}
      onClose={onClose}
      actions={
        <>
          <button type="button" className={SETTINGS_OUTLINE} disabled={busy} onClick={onClose}>
            Go back
          </button>
          <button
            type="button"
            className={SETTINGS_PRIMARY}
            disabled={busy || !picked}
            aria-describedby={reason ? `${id}-why` : undefined}
            onClick={() =>
              picked &&
              (keep === "other"
                ? onNext({ id: row.id, name: row.name }, { id: picked.id, name: picked.name })
                : onNext({ id: picked.id, name: picked.name }, { id: row.id, name: row.name }))
            }
          >
            Merge
          </button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={SETTINGS_LABEL}>Merge with</span>
          <select
            value={other}
            disabled={busy}
            onChange={(e) => setOther(e.target.value)}
            className={`${SETTINGS_INPUT} ${SETTINGS_INPUT_OK} min-h-11`}
          >
            <option value="">Choose {kind === "account" ? "an account" : "a contact"}</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {others.length === 0 ? (
          <p className="text-[13px] text-set-ink-2">
            {kind === "account"
              ? `There's no other account of this kind to merge ${row.name} with.`
              : `There's no other contact to merge ${row.name} with.`}
          </p>
        ) : null}
        <fieldset className="flex min-w-0 flex-col gap-2" disabled={busy || !picked}>
          <legend className={`${SETTINGS_LABEL} mb-1.5`}>Which one do you keep?</legend>
          {(["other", "this"] as const).map((side) => (
            <label key={side} className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3">
              <input
                type="radio"
                name={`${id}-keep`}
                checked={keep === side}
                onChange={() => setKeep(side)}
                className="size-5 shrink-0 accent-action-tick"
              />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                Keep {side === "this" ? row.name : (picked?.name ?? `the other ${kind}`)}
              </span>
            </label>
          ))}
        </fieldset>
        {reason ? (
          <p id={`${id}-why`} className="text-[12.5px] text-set-mute">
            {reason}
          </p>
        ) : null}
      </div>
    </SettingsDialog>
  );
}

/** The accounts an account can merge with: the others of its class (`accountClass`). */
export function mergeableAccounts(
  read: AccountsRead,
  row: Account,
): (MergeSide & { label: string })[] {
  const cls = accountClass(row.type);
  return (
    read.accounts
      // an account gone from Xero is never the one kept (the API refuses it); it can still be merged away
      .filter((a) => a.id !== row.id && accountClass(a.type) === cls && !a.gone_from_xero)
      .map((a) => ({ id: a.id, name: a.name, label: a.code ? `${a.code} - ${a.name}` : a.name }))
  );
}

export function mergeableContacts(
  read: ContactsRead,
  row: Contact,
): (MergeSide & { label: string })[] {
  return read.contacts
    .filter((c) => c.id !== row.id)
    .map((c) => ({ id: c.id, name: c.name, label: c.name }));
}
