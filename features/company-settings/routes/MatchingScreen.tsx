"use client";

/**
 * `/entity/<shortid>/<name>/settings/integration/match` - Match your accounts to Xero (Settings
 * Phase 2, 2026-11-11; Figma 353:999 frames 3, 3b, 4, 5 - the visual design; the rules are the
 * owner's, from Minty `docs/modernisation/xero_optional_database.md` §4).
 *
 * Where a company that kept its books in Minty lands after signing in to Xero. Every one of its
 * accounts is a row with a Xero account to pick (same code and type was picked for it); each pick
 * saves at once, so the page can be left and finished later. Finish is the replace: it asks first
 * (what will be archived and combined; it can't be undone) and is refused while an account a record
 * uses has no match. Then the suppliers go to Xero ("Bringing your contacts over…"); any Xero
 * refuses are named, with Try again, and Xero stays disconnected until they are through.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppHeader } from "@/components/ui/AppHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
  pickMatch,
  refreshMatching,
  retryContacts,
  type MatchOnePage,
  type MatchOption,
  type MatchRow,
  type MatchingPage,
  type PettyCashContact,
} from "@/features/company-settings/api/companySettings";
import {
  generalPath,
  integrationPath,
  pettyCashTabPath,
} from "@/features/company-settings/lib/paths";

export const MATCH_COPY = {
  title: "Match your accounts to Xero",
  lead: "Tell us where each Minty account should post. We've filled in the ones whose code and type match.",
  matched: (n: number, total: number) => `${n} of ${total} matched`,
  toGo: (n: number) => `${n} to go`,
  blocking: (n: number) =>
    `${n} ${n === 1 ? "account your records use still needs" : "accounts your records use still need"} a Xero match before you can finish.`,
  allUsedMatched:
    "Every account your records use is matched. Any you leave blank aren't used, so they'll be archived when you finish.",
  minty: "Minty account",
  xero: "Xero account",
  choose: "Choose a Xero account",
  suggested: "Suggested",
  allAccounts: "All accounts",
  matchedRow: "Matched",
  conflict: (code: string, name: string) =>
    `Xero's ${code} is ${name}, a different type - choose the account to use.`,
  combined: (names: string[]) => `Combined with ${names.join(", ")}`,
  nothingFits:
    "Nothing in Xero looks right? Pick the closest account, or create the one you want in Xero and come back - Refresh from Xero pulls it in.",
  refresh: "Refresh from Xero",
  refreshing: "Refreshing…",
  back: "Back",
  finish: "Finish",
  finishBlocked: "Match the accounts marked * to finish.",
  confirmTitle: "Finish matching?",
  confirmBody:
    "Each matched account takes its Xero code and name, and Minty publishes to Xero from today. This can't be undone.",
  // Phase 3 (2026-11-12): why the page is open
  changeTitle: "Change your matches",
  changeLead:
    "Pick a different Xero account for any account. Only what's published from now on uses the new matches.",
  newOrgTitle: "Match your accounts to your new Xero organisation",
  newOrgLead:
    "This company now connects to a different Xero organisation. Tell us where each account should post there.",
  newAccountsTitle: "Match the accounts added while Xero was disconnected",
  newAccountsLead: "Tell us where each new account should post in Xero.",
  confirmChange:
    "Only records published from now on use the new matches. Records already in Xero stay as they are.",
  confirmNewOrg: (org: string | null) =>
    `Only records from today go to ${org || "your new organisation"}. Older records stay with your previous Xero organisation.`,
  cancel: "Cancel",
  willArchive: "Not used, so archived:",
  willCombine: (xero: string, accounts: string[]) =>
    `${accounts.join(" and ")} become one: ${xero}`,
  goBack: "Go back",
  contacts: "Bringing your contacts over…",
  failedTitle: (n: number) =>
    n === 1 ? "One contact didn't make it over" : `${n} contacts didn't make it over`,
  failedBody: "Your account matches are saved. Xero would not take these:",
  failedNote: "We'll only send these again. Xero stays disconnected until they're through.",
  later: "Later",
  tryAgain: "Try again",
  connected: "Connected to Xero.",
  // Production, 2026-11-23: Xero's daily closing needs three contacts Minty's own books didn't.
  contactsTitle: "Choose your Petty Cash contacts",
  contactsBody: "Petty Cash needs these contacts before it can publish to Xero:",
  contactNames: {
    cash_sale: "The customer for cash sales",
    director: "The person who pays personally",
    discrepancy: "The person for the cash difference",
  },
  contactsNote: "Choose them in Petty Cash Settings.",
  contactsOpen: "Choose contacts",
  contactsLater: "Later",
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

function Row({
  row,
  options,
  busy,
  onPick,
}: {
  row: MatchRow;
  options: MatchOption[];
  busy: boolean;
  onPick: (xeroAccountId: string | null) => void;
}) {
  const fitting = options.filter((o) => o.kind === row.kind);
  const suggestion =
    !row.pick && row.suggestion ? fitting.find((o) => o.id === row.suggestion) : undefined;
  const picked = row.pick?.xero_account_id ?? "";
  const needed = row.used && !row.pick;
  // Xero's codes can be long (4000_01_01): the code runs with the name instead of a fixed column.
  const code = shownCode(row.code, row.name);
  const label = `${code ? `${code} ` : ""}${row.name}`;
  const note = row.conflict
    ? MATCH_COPY.conflict(row.conflict.code, row.conflict.name)
    : row.combined_with.length
      ? MATCH_COPY.combined(row.combined_with)
      : null;
  return (
    // Frame 3's row: the code, the name (a red * when a record uses it), a tick once matched, and
    // the Xero account; one line each from a tablet up, the select under the name on a phone.
    <li className="flex min-w-0 flex-col gap-2 border-b border-set-line px-4 py-2.5 last:border-b-0 md:flex-row md:items-center md:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span data-account className="min-w-0 flex-1 break-words text-[14px] text-set-ink">
          {code ? (
            <>
              <span className="mr-1 text-[12.5px] tabular-nums text-set-mute">{code}</span>{" "}
            </>
          ) : null}
          {row.name}
          {row.used ? (
            <>
              <RequiredMark />
              <span className="sr-only"> (required)</span>
            </>
          ) : null}
          {note ? <span className="block text-[12.5px] text-set-ink-2">{note}</span> : null}
        </span>
        {row.pick ? (
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
          value={picked}
          disabled={busy}
          aria-required={row.used}
          aria-invalid={needed ? true : undefined}
          onChange={(e) => onPick(e.target.value || null)}
          className={`block min-h-11 w-full appearance-none rounded-[12px] border bg-white py-2 pr-10 pl-3 text-[13.5px] text-set-ink transition-[border-color,box-shadow] focus:outline-none disabled:cursor-not-allowed disabled:bg-set-pill md:min-h-9 ${needed ? "border-status-warning-ink focus:shadow-[0_0_0_3px_rgba(232,161,58,0.2)]" : SETTINGS_INPUT_OK} ${picked ? "" : "text-set-mute"}`}
        >
          <option value="">{MATCH_COPY.choose}</option>
          {suggestion ? (
            <optgroup label={MATCH_COPY.suggested}>
              <option value={suggestion.id}>{optionLabel(suggestion)}</option>
            </optgroup>
          ) : null}
          {suggestion ? (
            <optgroup label={MATCH_COPY.allAccounts}>
              {fitting
                .filter((o) => o.id !== suggestion.id)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {optionLabel(o)}
                  </option>
                ))}
            </optgroup>
          ) : (
            fitting.map((o) => (
              <option key={o.id} value={o.id}>
                {optionLabel(o)}
              </option>
            ))
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

function FullMatching({ company }: { company: { id: string; name: string } }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [page, setPage] = useState<MatchingPage | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const [missingContacts, setMissingContacts] = useState<PettyCashContact[]>([]);
  const integration = integrationPath(company.id, company.name);

  const run = useCallback(
    async (what: string, call: () => Promise<MatchingPage>): Promise<MatchingPage | null> => {
      setBusy(what);
      try {
        const answer = await call();
        setPage(answer);
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
        // Opening the page reads Xero again (at most every 2 minutes), so an account made in Xero
        // meanwhile - a bank, say - is there to pick (production, 2026-11-23).
        if (answer.can_edit && answer.pending.accounts) {
          void run("refresh", () => refreshMatching(company.id, { throttle: true }));
        }
      },
      (err: unknown) => {
        if (!controller.signal.aborted) setError(refusal(err));
      },
    );
    return () => controller.abort();
  }, [company.id, attempt, run]);

  const afterContacts = (answer: MatchingPage | null) => {
    if (!answer) return;
    if (answer.error) showToast(answer.error, "error");
    if (answer.connected) {
      showToast(MATCH_COPY.connected, "success");
      // Xero's rules need daily closing's contacts: ask before leaving, so Publish isn't refused.
      if (answer.pettycash_contacts_missing?.length) {
        setMissingContacts(answer.pettycash_contacts_missing);
        return;
      }
      router.push(integration);
      return;
    }
    setFailed(answer.failed_contacts.length ? answer.failed_contacts : failed);
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
  const toGo = page.total - page.matched;
  const progress = page.total ? Math.round((page.matched / page.total) * 100) : 100;
  const contactsOnly = !page.pending.accounts && page.pending.contacts;
  // After Finish (nothing pending any more, so it sits over either frame below).
  const contactsDialog = missingContacts.length ? (
    <ConfirmDialog
      title={MATCH_COPY.contactsTitle}
      image="surprised"
      entityName={company.name}
      busy={false}
      confirmLabel={MATCH_COPY.contactsOpen}
      backLabel={MATCH_COPY.contactsLater}
      onConfirm={() => router.push(pettyCashTabPath(company.id, company.name))}
      onBack={() => router.push(integration)}
    >
      <p className="mt-6 text-[15px] leading-snug">{MATCH_COPY.contactsBody}</p>
      <ul className="mt-2 list-disc pl-5 text-[15px] leading-snug">
        {missingContacts.map((key) => (
          <li key={key}>{MATCH_COPY.contactNames[key]}</li>
        ))}
      </ul>
      <p className="mt-2 text-[15px] leading-snug">{MATCH_COPY.contactsNote}</p>
    </ConfirmDialog>
  ) : null;

  if (!page.pending.accounts && !page.pending.contacts && !busy) {
    return (
      <Frame back={integration}>
        <p className="text-sm text-set-ink-2">{MATCH_COPY.nothing}</p>
        <a href={integration} className={SETTINGS_OUTLINE}>
          {MATCH_COPY.backToIntegration}
        </a>
        {contactsDialog}
      </Frame>
    );
  }

  return (
    <Frame back={integration}>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-[26px] font-bold text-set-ink">{heading}</h2>
        <p className="text-[14px] text-set-ink-2">{lead}</p>
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
              onClick={() =>
                void run("contacts", () => retryContacts(company.id)).then(afterContacts)
              }
            >
              {MATCH_COPY.tryAgain}
            </button>
          </div>
        </section>
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
              {toGo > 0 ? (
                <span className="text-[13px] text-set-ink-2">{MATCH_COPY.toGo(toGo)}</span>
              ) : null}
            </p>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-state-selected"
              role="progressbar"
              aria-label={MATCH_COPY.matched(page.matched, page.total)}
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-set-tab" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-[13px] text-set-ink-2">
              {page.blocking ? MATCH_COPY.blocking(page.blocking) : MATCH_COPY.allUsedMatched}
            </p>
          </section>

          <section className="min-w-0 overflow-hidden rounded-[14px] border border-set-edge bg-white">
            <div className="hidden border-b border-set-line px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-set-mute md:flex">
              <span className="flex-1">{MATCH_COPY.minty}</span>
              <span className="w-[44%]">{MATCH_COPY.xero}</span>
            </div>
            {page.groups.map((group) => {
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
                onClick={() => void run("refresh", () => refreshMatching(company.id))}
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
              {page.blocking ? (
                <span id="finish-reason" className="text-[13px] text-set-ink-2">
                  {MATCH_COPY.finishBlocked}
                </span>
              ) : null}
              <button
                type="button"
                className={SETTINGS_PRIMARY}
                disabled={busy !== null || page.blocking > 0}
                aria-describedby={page.blocking ? "finish-reason" : undefined}
                onClick={() => setConfirming(true)}
              >
                {MATCH_COPY.finish}
              </button>
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
                  void run("finish", () => finishMatching(company.id)).then(afterContacts);
                }}
              >
                {MATCH_COPY.finish}
              </button>
            </>
          }
        >
          <p>{confirmBody}</p>
          {page.will_archive.length ? (
            <p className="mt-2">
              {MATCH_COPY.willArchive} {page.will_archive.join(", ")}
            </p>
          ) : null}
          {page.will_combine.map((c) => (
            <p key={c.xero} className="mt-2">
              {MATCH_COPY.willCombine(c.xero, c.accounts)}
            </p>
          ))}
        </SettingsDialog>
      ) : null}

      {busy === "finish" || busy === "contacts" ? (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-overlay-scrim p-4"
          role="status"
        >
          <div className="flex flex-col items-center gap-3 rounded-[16px] bg-white px-8 py-6 text-[14.5px] font-medium text-set-ink">
            <span className="material-symbols-outlined animate-spin text-set-tab" aria-hidden>
              progress_activity
            </span>
            {MATCH_COPY.contacts}
          </div>
        </div>
      ) : null}

      {failed.length && busy === null ? (
        <SettingsDialog
          title={MATCH_COPY.failedTitle(failed.length)}
          onClose={() => router.push(integration)}
          actions={
            <>
              <button
                type="button"
                className={SETTINGS_OUTLINE}
                onClick={() => router.push(integration)}
              >
                {MATCH_COPY.later}
              </button>
              <button
                type="button"
                className={SETTINGS_PRIMARY}
                onClick={() => {
                  setFailed([]);
                  void run("contacts", () => retryContacts(company.id)).then(afterContacts);
                }}
              >
                {MATCH_COPY.tryAgain}
              </button>
            </>
          }
        >
          <p>{MATCH_COPY.failedBody}</p>
          <ul className="mt-2 flex flex-col gap-1 rounded-[12px] border border-set-danger-line/40 p-3">
            {failed.map((name) => (
              <li key={name} className="flex items-center gap-2 text-set-ink">
                <span className="size-2 shrink-0 rounded-full bg-set-danger-line" aria-hidden />
                {name}
              </li>
            ))}
          </ul>
          <p className="mt-2">{MATCH_COPY.failedNote}</p>
        </SettingsDialog>
      ) : null}

      {contactsDialog}
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
 * already holds is refused with "merge instead", which opens the merge on General.
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
  const [mergeInto, setMergeInto] = useState<{ id: string; name: string; sentence: string } | null>(
    null,
  );
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
    try {
      const answer = await mapMatchOne(company.id, accountId, pick);
      showToast(answer.message, "success");
      router.push(general);
    } catch (err) {
      const body =
        err instanceof ApiError
          ? (err.body as { merge_into?: { id: string; name: string } })
          : null;
      if (body?.merge_into) {
        setMergeInto({ ...body.merge_into, sentence: refusal(err) });
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
        <Row row={row} options={page.options} busy={busy} onPick={setPick} />
      </ul>
      {mergeInto ? (
        <div
          className="flex min-w-0 flex-col gap-3 rounded-[12px] border border-set-line p-4"
          role="alert"
        >
          <p className="text-[14px] text-set-ink">{mergeInto.sentence}</p>
          <div>
            <button
              type="button"
              className={SETTINGS_PRIMARY}
              onClick={() =>
                router.push(
                  `${general}?merge=${encodeURIComponent(accountId)}&into=${encodeURIComponent(mergeInto.id)}`,
                )
              }
            >
              Merge into {mergeInto.name}
            </button>
          </div>
        </div>
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
