"use client";

/**
 * `/entity/<shortid>/<name>/settings/integration/match` - Match your accounts to Xero (Settings
 * Phase 2, 2026-11-11; Figma 353:999 frames 3, 3b, 4, 5 - the visual design; the rules are the
 * owner's, from Minty `docs/modernisation/xero_optional_database.md` §4, and the user's of
 * 2026-11-24).
 *
 * Where a company lands after signing in to Xero when its accounts need matching. Two steps:
 * - Accounts: every account is a row with a Xero account to pick (same code and type was picked for
 *   it; on a reconnect the ones already linked come picked; every other row starts on Minty's closest
 *   match by name - the user, 2026-11-25 - marked in orange for the person to check or change). Every
 *   account needs its own Xero account - used or not, and never one another account has - so the
 *   ones still to match come first. Each pick saves at once, so the page can be left and finished
 *   later.
 * - Contacts (when there are any to ask): each supplier takes its Xero contact (the one of its name
 *   is picked for it) or stays new in Xero, and each daily-closing contact still empty takes a Xero
 *   contact - asked here, before Finish, never after it.
 * Finish asks first (it can't be undone), then connects.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppHeader } from "@/components/ui/AppHeader";
import { Combo, type ComboRow } from "@/components/ui/Combo";
import { SETTINGS_OUTLINE, SETTINGS_PRIMARY } from "@/components/ui/settingsButtons";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { SETTINGS_INPUT_OK } from "@/components/ui/settingsFields";
import { LoadState, SettingsDialog } from "@/components/ui/SettingsShell";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/apiClient";

import {
  cancelChangeMatches,
  fetchMatchOne,
  fetchMatching,
  finishMatching,
  mapMatchOne,
  pickContactMatch,
  pickMatch,
  refreshMatching,
  retryContacts,
  type ContactAnswer,
  type MatchContactOption,
  type MatchContactPick,
  type MatchOnePage,
  type MatchOption,
  type MatchRow,
  type MatchingPage,
} from "@/features/company-settings/api/companySettings";
import { generalPath, integrationPath } from "@/features/company-settings/lib/paths";

export const MATCH_COPY = {
  title: "Match your accounts to Xero",
  lead: "Every Minty account needs its own Xero account. We've filled each one in with its closest Xero account. Check them, and change any that's wrong.",
  matched: (n: number, total: number) => `${n} of ${total} matched`,
  toGo: (n: number) => `${n} to go`,
  blocking: (n: number) =>
    `${n} ${n === 1 ? "account still needs" : "accounts still need"} a Xero account before you can go on.`,
  allMatched: "Every account has its Xero account.",
  guessed: (n: number) =>
    `Minty filled in ${n} ${n === 1 ? "account" : "accounts"} by name. Check ${n === 1 ? "it" : "them"} before you finish.`,
  guessNote: "Filled in by Minty. Check it's right.",
  minty: "Minty account",
  xero: "Xero account",
  choose: "Choose a Xero account",
  suggested: "Suggested",
  allAccounts: "All accounts",
  matchedRow: "Matched",
  heldBy: (name: string) => `matched to ${name}`,
  conflict: (code: string, name: string) =>
    `Xero's ${code} is ${name}, a different type - choose the account to use.`,
  nothingFits:
    "Nothing in Xero fits? Each Minty account needs its own Xero account: add the missing one in Xero, then Refresh from Xero pulls it in.",
  refresh: "Refresh from Xero",
  refreshing: "Refreshing…",
  back: "Back",
  finish: "Finish",
  finishBlocked: "Match every account marked * to finish.",
  next: "Next: contacts",
  nextBlocked: "Match every account marked * to go on.",
  stepAccounts: "Step 1 of 2 · Accounts",
  stepContacts: "Step 2 of 2 · Contacts",
  backToAccounts: "Back to accounts",
  confirmTitle: "Finish matching?",
  confirmBody:
    "Each matched account takes its Xero code and name - its Minty code stays - and Minty publishes to Xero from today. This can't be undone.",
  // Phase 3 (2026-11-12): why the page is open
  changeTitle: "Change your matches",
  changeLead:
    "Pick a different Xero account for any account. Only what's published from now on uses the new matches.",
  newOrgTitle: "Match your accounts to your new Xero organisation",
  newOrgLead:
    "This company now connects to a different Xero organisation. Tell us where each account should post there.",
  newAccountsTitle: "Match your accounts again",
  newAccountsLead:
    "Some accounts or contacts were added or changed while Xero was disconnected. The ones already matched are filled in, and we've filled in the closest Xero account for each new one. Anything you deleted or archived meanwhile is still in Xero, so it comes back. Archive it in Xero to keep it out.",
  // the user, 2026-11-27: a disconnected company is Minty-only; its changes are matched at reconnect
  changedOffline: "Changed while Xero was off. Once you finish, Xero's name and type are kept.",
  contactChangedOffline: "Changed while Xero was off. Once you finish, Xero's name is kept.",
  confirmChange:
    "Only records published from now on use the new matches. Records already in Xero stay as they are.",
  confirmNewOrg: (org: string | null) =>
    `Only records from today go to ${org || "your new organisation"}. Older records stay with your previous Xero organisation.`,
  cancel: "Cancel",
  goBack: "Go back",
  finishing: "Connecting to Xero…",
  // the contacts step (the user, 2026-11-24: before Finish, not a warning after it)
  contactsTitle: "Choose your contacts in Xero",
  contactsLead:
    "Tell us which Xero contact each one is. We've filled in the ones with the same name.",
  suppliers: "Suppliers",
  dailyClosing: "Petty Cash contacts",
  // matching and merging are separate (the user, 2026-11-25)
  heldContact: (name: string, holder: string) => `${name} - matched to ${holder}`,
  heldNote:
    "A Xero contact another contact already has can't be picked for a supplier. Merge the two in Settings first.",
  openContacts: "Open your contacts",
  contactNames: {
    cash_sale: "The customer for cash sales",
    director: "The person who pays personally",
    discrepancy: "The person for the cash difference",
  },
  chooseContact: "Choose a Xero contact",
  newInXero: "New in Xero",
  newHint: "Minty adds it to Xero the first time it's published.",
  noContact: "No contact found",
  keepTyping: "Keep typing to find more",
  contactsBlocking: (n: number) =>
    `${n} ${n === 1 ? "contact still needs" : "contacts still need"} an answer before you can finish.`,
  contactsDone: "Every contact has its answer.",
  contactsFinishBlocked: "Choose a contact for every one marked * to finish.",
  // a company the old rules left disconnected (before 2026-11-19)
  failedNote: "We'll only send these again. Xero stays disconnected until they're through.",
  tryAgain: "Try again",
  connected: "Connected to Xero.",
  nothing: "There's nothing to match with Xero for this company.",
  backToIntegration: "Back to Integration",
} as const;

function refusal(err: unknown): string {
  return err instanceof ApiError ? err.message : "I couldn't reach the server. Mind trying again?";
}

/** The code, unless it only repeats the name (a Xero bank coded with its own name). */
function shownCode(code: string | null | undefined, name: string): string {
  return code && code.trim().toLowerCase() !== name.trim().toLowerCase() ? code : "";
}

function optionLabel(o: MatchOption): string {
  const code = shownCode(o.code, o.name);
  return code ? `${code} · ${o.name}` : o.name;
}

/** A guessed row's stand-in option (see `Row`). */
const GUESS = "__guess__";

function Row({
  row,
  options,
  busy,
  showGroup = false,
  onPick,
}: {
  row: MatchRow;
  options: MatchOption[];
  busy: boolean;
  /** In the "Not matched yet" section: the account's own group under its name. */
  showGroup?: boolean;
  onPick: (xeroAccountId: string | null) => void;
}) {
  const fitting = options.filter((o) => o.kind === row.kind);
  const suggestion =
    !row.pick && row.suggestion ? fitting.find((o) => o.id === row.suggestion) : undefined;
  const picked = row.pick?.xero_account_id ?? "";
  const needed = !row.pick;
  // Minty's guess by name: orange like an empty row until the person picks an account - the same
  // one included (the user, 2026-11-25). A native select fires no change for its current option, so
  // a guess sits on a hidden stand-in carrying its name, and choosing the real one is a change.
  const guess = Boolean(row.pick?.guess);
  const guessed = guess ? fitting.find((o) => o.id === picked) : undefined;
  // Xero's codes can be long (4000_01_01): the code runs with the name instead of a fixed column.
  const code = shownCode(row.code, row.name);
  const label = `${code ? `${code} ` : ""}${row.name}`;
  const note = row.conflict ? MATCH_COPY.conflict(row.conflict.code, row.conflict.name) : null;
  // One Minty account per Xero account (the user, 2026-11-24): one another account has is shown,
  // never picked.
  const option = (o: MatchOption) => {
    const held = o.held_by && o.id !== picked ? o.held_by : null;
    return (
      <option key={o.id} value={o.id} disabled={Boolean(held)}>
        {held ? `${optionLabel(o)} - ${MATCH_COPY.heldBy(held)}` : optionLabel(o)}
      </option>
    );
  };
  return (
    // Frame 3's row: the code, the name (a red *: every account needs a match), a tick once matched,
    // and the Xero account; one line each from a tablet up, the select under the name on a phone.
    <li className="flex min-w-0 flex-col gap-2 border-b border-set-line px-4 py-2.5 last:border-b-0 md:flex-row md:items-center md:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span data-account className="min-w-0 flex-1 break-words text-[14px] text-set-ink">
          {code ? (
            <>
              <span className="mr-1 text-[12.5px] tabular-nums text-set-mute">{code}</span>{" "}
            </>
          ) : null}
          {row.name}
          <RequiredMark />
          <span className="sr-only"> (required)</span>
          {showGroup && row.group ? (
            <span className="block text-[12.5px] text-set-mute">{row.group}</span>
          ) : null}
          {note ? <span className="block text-[12.5px] text-set-ink-2">{note}</span> : null}
          {row.changed_offline ? (
            <span className="block text-[12.5px] text-set-ink-2">{MATCH_COPY.changedOffline}</span>
          ) : null}
          {guess ? (
            <span className="block text-[12.5px] text-status-warning-ink">
              {MATCH_COPY.guessNote}
            </span>
          ) : null}
        </span>
        {row.pick && !guess ? (
          <span
            className="material-symbols-outlined shrink-0 text-set-ok-ink"
            aria-label={MATCH_COPY.matchedRow}
            role="img"
          >
            check
          </span>
        ) : null}
      </div>
      <label className="relative min-w-0 md:w-[42%] md:shrink-0">
        <span className="sr-only">
          {MATCH_COPY.xero} for {label}
        </span>
        <select
          value={guessed ? GUESS : picked}
          disabled={busy}
          aria-required
          aria-invalid={needed ? true : undefined}
          onChange={(e) => {
            if (e.target.value !== GUESS) onPick(e.target.value || null);
          }}
          className={`block min-h-11 w-full appearance-none rounded-[12px] border bg-white py-2 pr-10 pl-3 text-[13.5px] text-set-ink transition-[border-color,box-shadow] focus:outline-none disabled:cursor-not-allowed disabled:bg-set-pill md:min-h-9 ${needed || guess ? "border-status-warning-ink focus:shadow-[0_0_0_3px_rgba(232,161,58,0.2)]" : SETTINGS_INPUT_OK} ${picked ? "" : "text-set-mute"}`}
        >
          <option value="">{MATCH_COPY.choose}</option>
          {guessed ? (
            <option value={GUESS} hidden disabled>
              {optionLabel(guessed)}
            </option>
          ) : null}
          {suggestion ? (
            <optgroup label={MATCH_COPY.suggested}>{option(suggestion)}</optgroup>
          ) : null}
          {suggestion ? (
            <optgroup label={MATCH_COPY.allAccounts}>
              {fitting.filter((o) => o.id !== suggestion.id).map(option)}
            </optgroup>
          ) : (
            fitting.map(option)
          )}
        </select>
        <span
          className="material-symbols-outlined pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-set-mute"
          aria-hidden
        >
          expand_more
        </span>
      </label>
    </li>
  );
}

const NEW = "__new__";
/** A searchable list stays quick with thousands of contacts: the first matches, then "keep typing". */
const CONTACTS_SHOWN = 50;

function contactLabel(pick: MatchContactPick | null, options: MatchContactOption[]): string {
  if (!pick) return "";
  if (pick.new) return MATCH_COPY.newInXero;
  return options.find((o) => o.id === pick.xero_contact_id)?.name ?? "";
}

/** The shared searchable picker (Petty Cash Settings' Combo): a Xero contact, or - for a supplier -
 * new in Xero. Keyed by the current answer, so the box shows it again after a save. */
function ContactPicker({
  id,
  label,
  pick,
  options,
  allowNew,
  busy,
  onPick,
}: {
  id: string;
  label: string;
  pick: MatchContactPick | null;
  options: MatchContactOption[];
  allowNew: boolean;
  busy: boolean;
  onPick: (answer: ContactAnswer) => void;
}) {
  const current = contactLabel(pick, options);
  const [text, setText] = useState(current);
  const rows = (query: string): ComboRow[] => {
    const q = query.trim().toLowerCase();
    const out: ComboRow[] = [];
    if (allowNew && (!q || MATCH_COPY.newInXero.toLowerCase().includes(q))) {
      out.push({
        key: NEW,
        label: MATCH_COPY.newInXero,
        sub: MATCH_COPY.newHint,
        selected: pick?.new,
      });
    }
    const found = options.filter((o) => !q || o.name.toLowerCase().includes(q));
    out.push(
      ...found.slice(0, CONTACTS_SHOWN).map((o, i) =>
        // a supplier never takes one another contact has (a daily-closing slot may): shown, not pickable
        allowNew && o.held_by && o.id !== pick?.xero_contact_id
          ? { key: o.id, label: MATCH_COPY.heldContact(o.name, o.held_by), info: true }
          : {
              key: o.id,
              label: o.name,
              selected: o.id === pick?.xero_contact_id,
              divided: allowNew && i === 0 && out.length > 0,
            },
      ),
    );
    if (!found.length) out.push({ key: "none", label: MATCH_COPY.noContact, info: true });
    if (found.length > CONTACTS_SHOWN)
      out.push({ key: "more", label: MATCH_COPY.keepTyping, info: true });
    return out;
  };
  return (
    <div className="min-w-0 md:w-[42%] md:shrink-0">
      <label htmlFor={id} className="sr-only">
        Xero contact for {label}
      </label>
      <Combo
        id={id}
        value={text}
        placeholder={MATCH_COPY.chooseContact}
        disabled={busy}
        required
        rotateChevron
        rows={rows}
        onText={setText}
        onPick={(key) => onPick(key === NEW ? { new: true } : { xero_contact_id: key })}
        onBlur={() => setText(current)}
      />
    </div>
  );
}

function ContactRow({
  id,
  name,
  pick,
  options,
  allowNew,
  changedOffline = false,
  busy,
  onPick,
}: {
  id: string;
  name: string;
  pick: MatchContactPick | null;
  options: MatchContactOption[];
  allowNew: boolean;
  changedOffline?: boolean;
  busy: boolean;
  onPick: (answer: ContactAnswer) => void;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-2 border-b border-set-line px-4 py-2.5 last:border-b-0 md:flex-row md:items-center md:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="min-w-0 flex-1 break-words text-[14px] text-set-ink">
          {name}
          <RequiredMark />
          <span className="sr-only"> (required)</span>
          {changedOffline ? (
            <span className="block text-[12.5px] text-set-ink-2">
              {MATCH_COPY.contactChangedOffline}
            </span>
          ) : null}
          {pick?.new ? (
            <span className="block text-[12.5px] text-set-mute">{MATCH_COPY.newHint}</span>
          ) : null}
        </span>
        {pick ? (
          <span
            className="material-symbols-outlined shrink-0 text-set-ok-ink"
            aria-label={MATCH_COPY.matchedRow}
            role="img"
          >
            check
          </span>
        ) : null}
      </div>
      <ContactPicker
        key={`${pick?.xero_contact_id ?? ""}${pick?.new ? NEW : ""}`}
        id={id}
        label={name}
        pick={pick}
        options={options}
        allowNew={allowNew}
        busy={busy}
        onPick={onPick}
      />
    </li>
  );
}

/** The matching page, or - with `account` - one account mapped again (A3). */
export function MatchingScreen({
  company,
  account = null,
}: {
  company: { id: string; name: string };
  account?: string | null;
}) {
  return account ? (
    <OneAccount company={company} accountId={account} />
  ) : (
    <FullMatching company={company} />
  );
}

/** Where each row sits, as the page last opened or refreshed: a pick saves at once and the API
 * answers with the row in its group, but the row stays where the person is working. */
type Layout = { key: string; title: string; ids: string[] }[];

function layoutOf(page: MatchingPage): Layout {
  return page.groups.map((g) => ({
    key: g.key,
    title: g.title,
    ids: g.rows.map((r) => r.account_id),
  }));
}

function laidOut(page: MatchingPage, layout: Layout | null) {
  const byId = new Map(page.groups.flatMap((g) => g.rows).map((r) => [r.account_id, r]));
  const placed = layout?.flatMap((g) => g.ids) ?? [];
  if (!layout || placed.length !== byId.size || placed.some((id) => !byId.has(id))) {
    return page.groups;
  }
  return layout.map((g) => ({
    key: g.key,
    title: g.title,
    rows: g.ids.map((id) => byId.get(id) as MatchRow),
  }));
}

function FullMatching({ company }: { company: { id: string; name: string } }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [page, setPage] = useState<MatchingPage | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [step, setStep] = useState<"accounts" | "contacts">("accounts");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const integration = integrationPath(company.id, company.name);

  const run = useCallback(
    async (
      what: string,
      call: () => Promise<MatchingPage>,
      relayout = false,
    ): Promise<MatchingPage | null> => {
      setBusy(what);
      try {
        const answer = await call();
        setPage(answer);
        if (relayout) setLayout(layoutOf(answer));
        return answer;
      } catch (err) {
        showToast(refusal(err), "error");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [showToast],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchMatching(company.id, controller.signal).then(
      (answer) => {
        if (controller.signal.aborted) return;
        setError("");
        setPage(answer);
        setLayout(layoutOf(answer));
        // Opening the page reads Xero again (at most every 2 minutes), so an account made in Xero
        // meanwhile - a bank, say - is there to pick (production, 2026-11-23).
        if (answer.can_edit && answer.pending.accounts) {
          void run("refresh", () => refreshMatching(company.id, { throttle: true }), true);
        }
      },
      (err: unknown) => {
        if (!controller.signal.aborted) setError(refusal(err));
      },
    );
    return () => controller.abort();
  }, [company.id, attempt, run]);

  const afterFinish = (answer: MatchingPage | null) => {
    if (!answer) return;
    if (answer.error) showToast(answer.error, "error");
    if (answer.connected) {
      showToast(MATCH_COPY.connected, "success");
      router.push(integration);
    }
  };

  if (!page) {
    return (
      <Frame back={integration}>
        <LoadState
          status={error ? "error" : "loading"}
          error={error}
          onRetry={() => {
            setError("");
            setAttempt((n) => n + 1);
          }}
        />
      </Frame>
    );
  }

  if (!page.pending.accounts && !page.pending.contacts && !busy) {
    return (
      <Frame back={integration}>
        <p className="text-sm text-set-ink-2">{MATCH_COPY.nothing}</p>
        <a href={integration} className={SETTINGS_OUTLINE}>
          {MATCH_COPY.backToIntegration}
        </a>
      </Frame>
    );
  }

  const reason = page.reason ?? null;
  const [heading, lead] =
    reason === "change"
      ? [MATCH_COPY.changeTitle, MATCH_COPY.changeLead]
      : reason === "new_org"
        ? [MATCH_COPY.newOrgTitle, MATCH_COPY.newOrgLead]
        : reason === "new_accounts"
          ? [MATCH_COPY.newAccountsTitle, MATCH_COPY.newAccountsLead]
          : [MATCH_COPY.title, MATCH_COPY.lead];
  const confirmBody =
    reason === "change" || reason === "new_accounts"
      ? MATCH_COPY.confirmChange
      : reason === "new_org"
        ? MATCH_COPY.confirmNewOrg(page.organisation)
        : MATCH_COPY.confirmBody;
  const contacts = page.contacts;
  const askContacts =
    Boolean(contacts?.required) && contacts.suppliers.length + contacts.slots.length > 0;
  const onContacts = askContacts && step === "contacts";
  const contactsLeft = askContacts ? contacts.blocking : 0;
  const contactsOnly = !page.pending.accounts && page.pending.contacts;

  const finishButton = (blocked: boolean, reasonId: string, reasonText: string) => (
    <>
      {blocked ? (
        <span id={reasonId} className="text-[13px] text-set-ink-2">
          {reasonText}
        </span>
      ) : null}
      <button
        type="button"
        className={SETTINGS_PRIMARY}
        disabled={busy !== null || blocked}
        aria-describedby={blocked ? reasonId : undefined}
        onClick={() => setConfirming(true)}
      >
        {MATCH_COPY.finish}
      </button>
    </>
  );

  return (
    <Frame back={integration}>
      <div className="flex min-w-0 flex-col gap-1">
        {askContacts ? (
          <p className="text-[12.5px] font-medium text-set-mute">
            {onContacts ? MATCH_COPY.stepContacts : MATCH_COPY.stepAccounts}
          </p>
        ) : null}
        <h2 className="text-[26px] font-bold text-set-ink">
          {onContacts ? MATCH_COPY.contactsTitle : heading}
        </h2>
        <p className="text-[14px] text-set-ink-2">{onContacts ? MATCH_COPY.contactsLead : lead}</p>
      </div>

      {contactsOnly ? (
        <section
          role="alert"
          className="flex flex-col gap-3 rounded-[14px] border border-set-edge bg-white p-5"
        >
          <p className="text-[14.5px] text-set-ink">{MATCH_COPY.failedNote}</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={SETTINGS_PRIMARY}
              disabled={busy !== null}
              onClick={() => void run("finish", () => retryContacts(company.id)).then(afterFinish)}
            >
              {MATCH_COPY.tryAgain}
            </button>
          </div>
        </section>
      ) : onContacts ? (
        <>
          <section
            aria-live="polite"
            className="rounded-[14px] border border-border-selected bg-set-ok-bg p-4 text-[13px] text-set-ink-2"
          >
            {contactsLeft ? MATCH_COPY.contactsBlocking(contactsLeft) : MATCH_COPY.contactsDone}
          </section>
          {contacts.suppliers.length && contacts.options.some((o) => o.held_by) ? (
            <p className="text-[13px] text-set-ink-2">
              {MATCH_COPY.heldNote}{" "}
              <a
                href={generalPath(company.id, company.name)}
                className="font-semibold underline underline-offset-2"
              >
                {MATCH_COPY.openContacts}
              </a>
            </p>
          ) : null}
          {[
            {
              key: "suppliers",
              title: MATCH_COPY.suppliers,
              rows: contacts.suppliers.map((s) => ({
                id: `contact-${s.contact_id}`,
                name: s.name,
                pick: s.pick,
                allowNew: true,
                changedOffline: Boolean(s.changed_offline),
                target: { contact_id: s.contact_id },
              })),
            },
            {
              key: "slots",
              title: MATCH_COPY.dailyClosing,
              rows: contacts.slots.map((s) => ({
                id: `slot-${s.slot}`,
                name: MATCH_COPY.contactNames[s.slot],
                pick: s.pick,
                allowNew: false,
                changedOffline: false,
                target: { slot: s.slot },
              })),
            },
          ]
            .filter((group) => group.rows.length)
            .map((group) => (
              <section
                key={group.key}
                className="min-w-0 rounded-[14px] border border-set-edge bg-white"
              >
                <h3 className="border-b border-set-line px-4 pt-4 pb-1.5 text-[12.5px] font-medium text-set-mute">
                  {group.title}
                </h3>
                <ul className="min-w-0">
                  {group.rows.map((r) => (
                    <ContactRow
                      key={r.id}
                      id={r.id}
                      name={r.name}
                      pick={r.pick}
                      options={contacts.options}
                      allowNew={r.allowNew}
                      changedOffline={r.changedOffline}
                      busy={busy !== null}
                      onPick={(answer) =>
                        void run("pick", () =>
                          pickContactMatch(company.id, { ...r.target, ...answer }),
                        )
                      }
                    />
                  ))}
                </ul>
              </section>
            ))}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-set-line pt-4">
            <button
              type="button"
              className={SETTINGS_OUTLINE}
              disabled={busy !== null}
              onClick={() => setStep("accounts")}
            >
              {MATCH_COPY.backToAccounts}
            </button>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {finishButton(
                contactsLeft > 0 || page.blocking > 0,
                "finish-reason",
                page.blocking ? MATCH_COPY.finishBlocked : MATCH_COPY.contactsFinishBlocked,
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <section
            aria-live="polite"
            className="flex flex-col gap-2 rounded-[14px] border border-border-selected bg-set-ok-bg p-4"
          >
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-lg font-bold text-set-ink">
                {MATCH_COPY.matched(page.matched, page.total)}
              </span>
              {page.blocking > 0 ? (
                <span className="text-[13px] text-set-ink-2">{MATCH_COPY.toGo(page.blocking)}</span>
              ) : null}
            </p>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-state-selected"
              role="progressbar"
              aria-label={MATCH_COPY.matched(page.matched, page.total)}
              aria-valuenow={page.total ? Math.round((page.matched / page.total) * 100) : 100}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-set-tab"
                style={{
                  width: `${page.total ? Math.round((page.matched / page.total) * 100) : 100}%`,
                }}
              />
            </div>
            <p className="text-[13px] text-set-ink-2">
              {page.blocking ? MATCH_COPY.blocking(page.blocking) : MATCH_COPY.allMatched}
            </p>
            {page.guessed ? (
              <p className="text-[13px] text-set-ink-2">{MATCH_COPY.guessed(page.guessed)}</p>
            ) : null}
          </section>

          <section className="min-w-0 overflow-hidden rounded-[14px] border border-set-edge bg-white">
            <div className="hidden border-b border-set-line px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-set-mute md:flex">
              <span className="flex-1">{MATCH_COPY.minty}</span>
              <span className="w-[44%]">{MATCH_COPY.xero}</span>
            </div>
            {laidOut(page, layout).map((group) => {
              const done = group.rows.filter((r) => r.pick).length;
              return (
                <div key={group.key} className="min-w-0">
                  <h3 className="border-b border-set-line px-4 pt-4 pb-1.5 text-[12.5px] font-medium text-set-mute">
                    {group.title} · {done} of {group.rows.length} matched
                  </h3>
                  <ul className="min-w-0">
                    {group.rows.map((row) => (
                      <Row
                        key={row.account_id}
                        row={row}
                        options={page.options}
                        busy={busy !== null}
                        showGroup={group.key === "unmatched"}
                        onPick={(id) =>
                          void run("pick", () => pickMatch(company.id, row.account_id, id))
                        }
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>

          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-set-mute">{MATCH_COPY.nothingFits}</p>
            <div>
              <button
                type="button"
                className={SETTINGS_OUTLINE}
                disabled={busy !== null}
                onClick={() => void run("refresh", () => refreshMatching(company.id), true)}
              >
                {busy === "refresh" ? MATCH_COPY.refreshing : MATCH_COPY.refresh}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-set-line pt-4">
            <a href={integration} className={SETTINGS_OUTLINE}>
              {MATCH_COPY.back}
            </a>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {reason === "change" ? (
                <button
                  type="button"
                  className={SETTINGS_OUTLINE}
                  disabled={busy !== null}
                  onClick={() =>
                    void run("cancel", () => cancelChangeMatches(company.id)).then((answer) => {
                      if (answer) router.push(integration);
                    })
                  }
                >
                  {MATCH_COPY.cancel}
                </button>
              ) : null}
              {askContacts ? (
                <>
                  {page.blocking ? (
                    <span id="next-reason" className="text-[13px] text-set-ink-2">
                      {MATCH_COPY.nextBlocked}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={SETTINGS_PRIMARY}
                    disabled={busy !== null || page.blocking > 0}
                    aria-describedby={page.blocking ? "next-reason" : undefined}
                    onClick={() => {
                      setStep("contacts");
                      window.scrollTo?.({ top: 0 });
                    }}
                  >
                    {MATCH_COPY.next}
                  </button>
                </>
              ) : (
                finishButton(page.blocking > 0, "finish-reason", MATCH_COPY.finishBlocked)
              )}
            </div>
          </div>
        </>
      )}

      {confirming ? (
        <SettingsDialog
          title={MATCH_COPY.confirmTitle}
          busy={busy !== null}
          onClose={() => setConfirming(false)}
          actions={
            <>
              <button
                type="button"
                className={SETTINGS_OUTLINE}
                disabled={busy !== null}
                onClick={() => setConfirming(false)}
              >
                {MATCH_COPY.goBack}
              </button>
              <button
                type="button"
                className={SETTINGS_PRIMARY}
                disabled={busy !== null}
                onClick={() => {
                  setConfirming(false);
                  void run("finish", () => finishMatching(company.id)).then(afterFinish);
                }}
              >
                {MATCH_COPY.finish}
              </button>
            </>
          }
        >
          <p>{confirmBody}</p>
        </SettingsDialog>
      ) : null}

      {busy === "finish" ? (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-overlay-scrim p-4"
          role="status"
        >
          <div className="flex flex-col items-center gap-3 rounded-[16px] bg-white px-8 py-6 text-[14.5px] font-medium text-set-ink">
            <span className="material-symbols-outlined animate-spin text-set-tab" aria-hidden>
              progress_activity
            </span>
            {MATCH_COPY.finishing}
          </div>
        </div>
      ) : null}
    </Frame>
  );
}

function Frame({ back, children }: { back: string; children: React.ReactNode }) {
  return (
    // One scroll: the document's (the header is sticky). The settings pages' own scroll box, copied
    // here at first, drew a second scroll bar beside the page's.
    <div className="flex min-h-dvh min-w-0 max-w-full flex-col bg-white">
      {/* Back = Integration, always: "where the person came from" was Xero's sign-in landing here. */}
      <AppHeader title="Connect to Xero" back={{ href: back, label: "Back", direct: true }} />
      <main className="flex min-w-0 flex-1 flex-col pb-[env(safe-area-inset-bottom,0px)]">
        <div className="mx-auto flex w-full max-w-[928px] min-w-0 flex-col gap-5 px-4 pt-6 pb-14 sm:px-6 sm:pt-10">
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * One account mapped again (the owner's decisions doc A3, 2026-11-19): its Xero account was archived
 * or removed, so the person picks the one to use - the matching page's own row, the account's
 * kind only. Only that account's link changes: no records move. A Xero account another account
 * already has is refused - accounts are never merged (the user, 2026-11-24) - and named.
 */
function OneAccount({
  company,
  accountId,
}: {
  company: { id: string; name: string };
  accountId: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [page, setPage] = useState<MatchOnePage | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState("");
  const general = generalPath(company.id, company.name);

  useEffect(() => {
    const controller = new AbortController();
    fetchMatchOne(company.id, accountId, controller.signal).then(
      (answer) => {
        setError("");
        setPage(answer);
      },
      (err: unknown) => {
        if (!controller.signal.aborted) setError(refusal(err));
      },
    );
    return () => controller.abort();
  }, [company.id, accountId, attempt]);

  if (!page) {
    return (
      <Frame back={general}>
        <LoadState
          status={error ? "error" : "loading"}
          error={error}
          onRetry={() => {
            setError("");
            setAttempt((n) => n + 1);
          }}
        />
      </Frame>
    );
  }

  const save = async () => {
    if (!pick) return;
    setBusy(true);
    setRefused("");
    try {
      const answer = await mapMatchOne(company.id, accountId, pick);
      showToast(answer.message, "success");
      router.push(general);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setRefused(refusal(err));
      } else {
        showToast(refusal(err), "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const row = { ...page.row, pick: pick ? { xero_account_id: pick, auto: false } : null };
  return (
    <Frame back={general}>
      <header className="flex min-w-0 flex-col gap-2">
        <h1 className="text-[22px] font-semibold text-set-ink [overflow-wrap:anywhere]">
          Map {page.row.name} to a Xero account
        </h1>
        {page.message ? <p className="text-[14px] text-set-ink-2">{page.message}</p> : null}
      </header>
      <ul className="m-0 list-none rounded-[12px] border border-set-line p-0">
        <Row
          row={row}
          options={page.options}
          busy={busy}
          onPick={(id) => {
            setRefused("");
            setPick(id);
          }}
        />
      </ul>
      {refused ? (
        <p
          className="rounded-[12px] border border-set-line p-4 text-[14px] text-set-ink"
          role="alert"
        >
          {refused}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={SETTINGS_PRIMARY}
          disabled={busy || !pick}
          onClick={() => void save()}
        >
          Save
        </button>
        {!pick ? (
          <span className="text-[12.5px] text-set-mute">Choose the Xero account to use.</span>
        ) : null}
      </div>
    </Frame>
  );
}
