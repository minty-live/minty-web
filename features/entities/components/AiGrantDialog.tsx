"use client";

/**
 * One company's AI allowance, from the entity list's "AI allowances" mode (owner, 2026-11-19: like
 * "Archive companies", no page of its own): what is left, its grants newest first, the "Give a
 * grant" form and its last reads. Superusers only (minty-accounts-api's `hub/ai_grants.py`). The
 * app's form dialog (`ModalFrame`): full width on a phone, 640px from tablet. A given grant shows at
 * once here and, through `onChanged`, on the company's row. A running grant can be ended (owner,
 * 2026-11-20): "End grant" asks first in minty-web's `ConfirmDialog` (the question-modal rule), and
 * the company dialog stays still while it asks (its Escape and backdrop wait).
 */

import { ErrorSummary } from "@minty/shared/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { ModalFrame } from "@/components/ui/ModalFrame";
import {
  SETTINGS_FIELD_ERROR,
  SETTINGS_LABEL,
  settingsInputClass,
} from "@/components/ui/settingsFields";
import {
  SETTINGS_DANGER,
  SETTINGS_OUTLINE,
  SETTINGS_PRIMARY,
} from "@/components/ui/settingsButtons";
import { useToast } from "@/components/ui/Toast";
import { ApiError, HOUSE_FALLBACK } from "@/lib/apiClient";

import {
  endAiGrant,
  fetchAiCompany,
  fetchAiReads,
  giveAiGrant,
  type AiCompany,
  type AiGrant,
  type GrantInput,
} from "@/features/entities/api/aiAllowances";
import {
  automaticGrants,
  canEnd,
  count,
  day,
  EMPTY_GRANT,
  END_GRANT,
  END_GRANT_LABEL,
  END_TEXT,
  END_TITLE,
  endedLine,
  fieldProblems,
  GRANT_ENDED,
  GRANT_NAME,
  ALL_READS,
  BACK,
  LOAD_OLDER,
  SHOW_MORE_READS,
  PAST_GRANTS,
  PAST_TEXT,
  NO_OPEN_GRANTS,
  showPastLabel,
  grantStatus,
  grantUse,
  submitProblems,
  type GrantField,
} from "@/features/entities/lib/aiGrant";

export const AI_PILL =
  "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium";
export const AI_PILL_TONE = {
  Open: "bg-status-info-bg text-status-info-ink",
  "Used up": "bg-status-warning-bg text-status-warning-ink",
  Ended: "bg-status-neutral-bg text-status-neutral-ink",
} as const;
const MODULE_NAME = { petty_cash: "Petty Cash", payment_request: "Payment Request" } as const;
const READ_STATUS = { ok: "Read", failed: "Failed", pending: "Reading" } as const;

const message = (e: unknown) => (e instanceof ApiError ? e.message : HOUSE_FALLBACK);

const FIELD_ID: Record<GrantField, string> = {
  tokens: "ai-grant-tokens",
  reads: "ai-grant-reads",
  days: "ai-grant-days",
  note: "ai-grant-note",
};
const ORDER: GrantField[] = ["tokens", "reads", "days", "note"];
/** Last reads: the newest three; "Show more reads" takes over the dialog (owner, 2026-11-20). */
const FIRST_READS = 3;

export function AiGrantDialog({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: (company: AiCompany) => void;
}) {
  const { showToast } = useToast();
  const [company, setCompany] = useState<AiCompany | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState<GrantInput>(EMPTY_GRANT);
  const [refused, setRefused] = useState<Partial<Record<GrantField, string>>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // "Show more reads" (owner, 2026-11-20): the 3 newest here; the button takes over the dialog with
  // every read loaded (the API sends 20), and "Load older reads" asks for 20 more each press
  const [showReads, setShowReads] = useState(false);
  const readsButton = useRef<HTMLButtonElement>(null);
  const readsHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (showReads) readsHeading.current?.focus();
  }, [showReads]);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [focusRead, setFocusRead] = useState<string | null>(null);
  const readsList = useRef<HTMLUListElement>(null);
  // "End grant" (owner, 2026-11-20): the grant being asked about, and that question's progress
  const [ending, setEnding] = useState<AiGrant | null>(null);
  // "Show past grants" (owner, 2026-11-20): used-up and ended grants take over the dialog
  const [showPast, setShowPast] = useState(false);
  const pastButton = useRef<HTMLButtonElement>(null);
  const pastHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (showPast) pastHeading.current?.focus();
  }, [showPast]);
  const [endBusy, setEndBusy] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    fetchAiCompany(id, abort.signal)
      .then((answer) => {
        setCompany(answer);
        setTimeout(() => heading.current?.focus(), 0);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setLoadError(message(e));
      });
    return () => abort.abort();
  }, [id]);

  // the reads "Load older reads" brought: focus the first one, so the place isn't lost
  useEffect(() => {
    if (!focusRead) return;
    readsList.current?.querySelector<HTMLElement>(`[data-read="${focusRead}"]`)?.focus();
  }, [focusRead, company]);

  async function loadOlderReads() {
    if (!company || moreBusy) return;
    const last = company.reads[company.reads.length - 1];
    if (!last) return;
    setMoreBusy(true);
    setMoreError(null);
    try {
      const page = await fetchAiReads(company.company.id, last.id);
      setCompany((now) =>
        now ? { ...now, reads: [...now.reads, ...page.reads], reads_more: page.more } : now,
      );
      setFocusRead(page.reads[0]?.id ?? null);
    } catch (e) {
      setMoreError(message(e));
    } finally {
      setMoreBusy(false);
    }
  }

  // as typed: each field's own problem; after a refused submit, also what the submit said
  const live = fieldProblems(input);
  const shown: Partial<Record<GrantField, string>> = { ...refused, ...live };

  function change(field: GrantField, value: string) {
    setInput((before) => ({ ...before, [field]: value }));
    // a refused "give nothing" clears as soon as tokens or reads holds something
    setRefused((before) => {
      const next = { ...before };
      delete next[field];
      if (field === "reads" && value.trim()) delete next.tokens;
      return next;
    });
  }

  async function endGrant() {
    if (!company || !ending || endBusy) return;
    setEndBusy(true);
    setEndError(null);
    try {
      const answer = await endAiGrant(company.company.id, ending.id);
      setCompany(answer);
      onChanged(answer);
      setEnding(null);
      showToast(answer.message ?? GRANT_ENDED, "success");
    } catch (err) {
      setEndError(message(err));
    } finally {
      setEndBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !company) return;
    const problems = submitProblems(input);
    const keys = ORDER.filter((k) => problems[k]);
    if (keys.length) {
      setRefused(problems);
      setAttempt((n) => n + 1);
      if (keys.length === 1)
        setTimeout(() => document.getElementById(FIELD_ID[keys[0]])?.focus(), 0);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const answer = await giveAiGrant(company.company.id, input);
      setCompany(answer);
      setInput(EMPTY_GRANT);
      setRefused({});
      onChanged(answer);
      showToast(answer.message ?? `Grant given to ${answer.company.name}.`, "success");
    } catch (err) {
      const fields =
        err instanceof ApiError && err.status === 422
          ? ((err.body as { fields?: Partial<Record<GrantField, string>> } | null)?.fields ?? null)
          : null;
      if (fields) {
        setRefused(fields);
        setAttempt((n) => n + 1);
      } else setFormError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const summary = ORDER.filter((k) => refused[k] && shown[k]).map((k) => ({
    fieldId: FIELD_ID[k],
    message: shown[k] as string,
  }));

  // only the grants still running are listed (owner, 2026-11-20); used-up and ended ones wait
  // behind "Show past grants"
  const openGrants = company ? company.grants.filter((g) => grantStatus(g) === "Open") : [];
  const pastGrants = company ? company.grants.filter((g) => grantStatus(g) !== "Open") : [];

  /** One read's line - the newest three here, every one loaded under Show more reads. */
  const renderRead = (r: AiCompany["reads"][number]) => (
    <li
      key={r.id}
      data-read={r.id}
      tabIndex={-1}
      className="text-sm text-text-primary outline-none"
    >
      {day(r.created_at)} · {MODULE_NAME[r.module]} · {READ_STATUS[r.status]} · {count(r.tokens)}{" "}
      tokens
    </li>
  );

  /** One grant's card - in the open list, or under Show past grants (owner, 2026-11-20). */
  const renderGrant = (grant: AiGrant) => {
    const state = grantStatus(grant);
    return (
      <li key={grant.id} className="rounded-[12px] border border-border-default p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2 pt-2.5">
            <span className="text-sm font-semibold text-text-primary">
              {GRANT_NAME[grant.source]}
            </span>
            <span className={`${AI_PILL} ${AI_PILL_TONE[state]}`}>{state}</span>
          </div>
          {/* top right of its card (owner, 2026-11-20) */}
          {canEnd(grant) ? (
            <button
              type="button"
              className={`${SETTINGS_DANGER} shrink-0`}
              aria-label={END_GRANT_LABEL}
              onClick={() => {
                setEndError(null);
                setEnding(grant);
              }}
            >
              {END_GRANT}
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-text-primary">{grantUse(grant)}</p>
        <p className="text-sm text-text-secondary">
          Given {day(grant.created_at)}
          {grant.granted_by ? ` by ${grant.granted_by}` : ""}
          {grant.expires_at && !grant.ended_at ? ` · ends ${day(grant.expires_at)}` : ""}
        </p>
        {endedLine(grant) ? (
          <p className="break-words text-sm text-text-secondary">{endedLine(grant)}</p>
        ) : null}
        {grant.note ? (
          <p className="break-words text-sm text-text-secondary">{grant.note}</p>
        ) : null}
      </li>
    );
  };

  return (
    <>
      <ModalFrame
        labelledBy="ai-company-title"
        busy={busy || ending !== null}
        onDismiss={onClose}
        dismissLabel="Close"
        className="flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-y-auto rounded-[16px] bg-white p-4 shadow-xl sm:p-6 min-[640px]:max-w-[640px]"
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="ai-company-title"
            ref={heading}
            tabIndex={-1}
            className="min-w-0 break-words text-lg font-semibold text-text-primary outline-none"
          >
            {company?.company.name ?? "AI allowance"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-text-muted hover:bg-surface-sunk hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus disabled:opacity-50"
          >
            <Icon name="close" size={24} />
          </button>
        </div>

        {!company && !loadError ? (
          <p role="status" className="mt-4 text-sm text-text-secondary">
            Loading the company…
          </p>
        ) : null}
        {loadError ? (
          <p role="alert" className="mt-4 text-sm text-status-danger-ink">
            {loadError}
          </p>
        ) : null}

        {company && showPast ? (
          <>
            <div className="mt-2">
              <button
                type="button"
                className={SETTINGS_OUTLINE}
                onClick={() => {
                  setShowPast(false);
                  setTimeout(() => pastButton.current?.focus(), 0);
                }}
              >
                {BACK}
              </button>
            </div>
            <h3
              ref={pastHeading}
              tabIndex={-1}
              className="mt-4 text-sm font-semibold text-text-primary outline-none"
            >
              {PAST_GRANTS}
            </h3>
            <p className="mt-1 text-sm text-text-secondary">{PAST_TEXT}</p>
            <ul aria-label={PAST_GRANTS} className="mt-2 flex flex-col gap-2">
              {pastGrants.map(renderGrant)}
            </ul>
          </>
        ) : company && showReads ? (
          <>
            <div className="mt-2">
              <button
                type="button"
                className={SETTINGS_OUTLINE}
                onClick={() => {
                  setShowReads(false);
                  setFocusRead(null);
                  // back to the button, or to the title when every read fits the three
                  setTimeout(() => (readsButton.current ?? heading.current)?.focus(), 0);
                }}
              >
                {BACK}
              </button>
            </div>
            <h3
              ref={readsHeading}
              tabIndex={-1}
              className="mt-4 text-sm font-semibold text-text-primary outline-none"
            >
              {ALL_READS}
            </h3>
            <ul ref={readsList} aria-label={ALL_READS} className="mt-2 flex flex-col gap-1">
              {company.reads.map(renderRead)}
            </ul>
            {moreError ? (
              <p role="alert" className="mt-2 text-sm text-status-danger-ink">
                {moreError}
              </p>
            ) : null}
            {company.reads_more ? (
              <div className="mt-3">
                <button
                  type="button"
                  className={SETTINGS_OUTLINE}
                  onClick={() => void loadOlderReads()}
                  disabled={moreBusy}
                >
                  {moreBusy ? "Loading…" : LOAD_OLDER}
                </button>
              </div>
            ) : null}
          </>
        ) : company ? (
          <>
            <p className="mt-2 text-sm text-text-primary">
              {company.allowance.blocked
                ? company.allowance.resumes_at
                  ? `Paused until ${day(company.allowance.resumes_at)} by a limit over every company.`
                  : "Used up: its read buttons are off until it is given another grant."
                : `${company.allowance.percent_left ?? 0}% of its AI allowance left.`}
            </p>

            {/* each section's view button sits at the right of its title row (owner, 2026-11-20) */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-text-primary">Open grants</h3>
              {pastGrants.length > 0 ? (
                <button
                  type="button"
                  ref={pastButton}
                  className={SETTINGS_OUTLINE}
                  onClick={() => setShowPast(true)}
                >
                  {showPastLabel(pastGrants.length)}
                </button>
              ) : null}
            </div>
            {company.grants.length === 0 ? (
              <p className="mt-1 text-sm text-text-secondary">
                None yet. {automaticGrants(company)}
              </p>
            ) : openGrants.length === 0 ? (
              <p className="mt-1 text-sm text-text-secondary">{NO_OPEN_GRANTS}</p>
            ) : (
              <ul aria-label="Grants" className="mt-2 flex flex-col gap-2">
                {openGrants.map(renderGrant)}
              </ul>
            )}

            <form noValidate onSubmit={(e) => void submit(e)} className="mt-6 flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-text-primary">Give a grant</h3>
              <p className="-mt-3 text-sm text-text-secondary">
                It adds to what the company has left. A receipt takes about 3,500–6,000 tokens.
              </p>
              {summary.length > 1 ? (
                <ErrorSummary items={summary} attempt={attempt} look="classic" />
              ) : null}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <GrantNumber
                  field="tokens"
                  label="Tokens"
                  value={input.tokens}
                  problem={shown.tokens}
                  onChange={change}
                />
                <GrantNumber
                  field="reads"
                  label="Reads (optional)"
                  value={input.reads}
                  problem={shown.reads}
                  onChange={change}
                />
                <GrantNumber
                  field="days"
                  label="Ends after days (optional)"
                  value={input.days}
                  problem={shown.days}
                  onChange={change}
                />
              </div>
              <div>
                <label htmlFor={FIELD_ID.note} className={SETTINGS_LABEL}>
                  Note (optional)
                </label>
                <input
                  id={FIELD_ID.note}
                  type="text"
                  value={input.note}
                  onChange={(e) => change("note", e.target.value)}
                  aria-invalid={shown.note ? true : undefined}
                  aria-describedby={shown.note ? `${FIELD_ID.note}-msg` : undefined}
                  className={settingsInputClass(!!shown.note)}
                />
                {shown.note ? (
                  <p id={`${FIELD_ID.note}-msg`} className={SETTINGS_FIELD_ERROR}>
                    {shown.note}
                  </p>
                ) : null}
              </div>
              {formError ? (
                <p role="alert" className="text-sm text-status-danger-ink">
                  {formError}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-3">
                <button type="submit" className={SETTINGS_PRIMARY} disabled={busy}>
                  {busy ? "Giving…" : "Give grant"}
                </button>
              </div>
            </form>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-text-primary">Last reads</h3>
              {company.reads.length > FIRST_READS || company.reads_more ? (
                <button
                  type="button"
                  ref={readsButton}
                  className={SETTINGS_OUTLINE}
                  onClick={() => {
                    setMoreError(null);
                    setShowReads(true);
                  }}
                >
                  {SHOW_MORE_READS}
                </button>
              ) : null}
            </div>
            {company.reads.length === 0 ? (
              <p className="mt-1 text-sm text-text-secondary">No reads yet.</p>
            ) : (
              <ul aria-label="Last reads" className="mt-2 flex flex-col gap-1">
                {company.reads.slice(0, FIRST_READS).map(renderRead)}
              </ul>
            )}
          </>
        ) : null}
      </ModalFrame>
      {ending ? (
        <ConfirmDialog
          title={END_TITLE}
          image="sad"
          busy={endBusy}
          confirmLabel={END_GRANT}
          confirmTone="red"
          onConfirm={() => void endGrant()}
          onBack={() => setEnding(null)}
        >
          <p>{END_TEXT}</p>
          {endError ? (
            <p role="alert" className="text-status-danger-ink">
              {endError}
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}

function GrantNumber({
  field,
  label,
  value,
  problem,
  onChange,
}: {
  field: GrantField;
  label: string;
  value: string;
  problem: string | undefined;
  onChange: (field: GrantField, value: string) => void;
}) {
  const id = FIELD_ID[field];
  return (
    <div>
      <label htmlFor={id} className={SETTINGS_LABEL}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${id}-msg` : undefined}
        className={settingsInputClass(!!problem)}
      />
      {problem ? (
        <p id={`${id}-msg`} className={SETTINGS_FIELD_ERROR}>
          {problem}
        </p>
      ) : null}
    </div>
  );
}
