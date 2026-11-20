/**
 * The "Give a grant" form's rules and the AI allowances mode's words (owner, 2026-11-18). The same limits as
 * minty-accounts-api's `hub/ai_grants.py` (`check_grant`), which checks again: each field checks
 * itself as it is typed; "give nothing" is only said on a refused submit (it means "not finished
 * yet"). Part 11 wording: the issue, then what to do.
 */

import type { AiCompanyRow, AiGrant, GrantInput } from "@/features/entities/api/aiAllowances";

export const MAX_TOKENS = 10_000_000;
export const MAX_READS = 10_000;
export const MAX_DAYS = 3650;
export const MAX_NOTE = 255;

export type GrantField = keyof GrantInput;

export const FIELD_MESSAGE: Record<GrantField | "nothing", string> = {
  nothing: "The grant gives nothing yet. Add tokens, reads or both to continue.",
  tokens: `Enter the tokens as a whole number from 1 to ${MAX_TOKENS.toLocaleString("en-GB")}.`,
  reads: `Enter the reads as a whole number from 1 to ${MAX_READS.toLocaleString("en-GB")}.`,
  days: `Enter the days as a whole number from 1 to ${MAX_DAYS.toLocaleString("en-GB")}, or leave it empty for no end date.`,
  note: `Shorten the note to ${MAX_NOTE} characters or fewer.`,
};

export const EMPTY_GRANT: GrantInput = { tokens: "", reads: "", days: "", note: "" };

/** A whole number in range; "" is fine (optional); anything else is a problem. */
function wholeOk(raw: string, max: number): boolean {
  const text = raw.replace(/,/g, "").trim();
  if (!text) return true;
  if (!/^\d+$/.test(text)) return false;
  const n = Number(text);
  return n >= 1 && n <= max;
}

/** Each field's own problem, as it is typed. */
export function fieldProblems(input: GrantInput): Partial<Record<GrantField, string>> {
  const out: Partial<Record<GrantField, string>> = {};
  if (!wholeOk(input.tokens, MAX_TOKENS)) out.tokens = FIELD_MESSAGE.tokens;
  if (!wholeOk(input.reads, MAX_READS)) out.reads = FIELD_MESSAGE.reads;
  if (!wholeOk(input.days, MAX_DAYS)) out.days = FIELD_MESSAGE.days;
  if (input.note.trim().length > MAX_NOTE) out.note = FIELD_MESSAGE.note;
  return out;
}

/** Everything a submit checks: the fields, then that the grant gives something. */
export function submitProblems(input: GrantInput): Partial<Record<GrantField, string>> {
  const out = fieldProblems(input);
  if (!out.tokens && !out.reads && !input.tokens.trim() && !input.reads.trim()) {
    out.tokens = FIELD_MESSAGE.nothing;
  }
  return out;
}

/** "20,000" */
export const count = (n: number) => n.toLocaleString("en-GB");

/** "18 Nov 2026" */
export function day(iso: string | null): string {
  if (!iso) return "";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** The row's line: "75% left · 5,000 of 20,000 tokens used". */
export function rowAllowance(row: AiCompanyRow): string {
  const percent = row.percent_left ?? 0;
  const tokens =
    row.tokens_given !== null && row.tokens_used !== null
      ? ` · ${count(row.tokens_used)} of ${count(row.tokens_given)} tokens used`
      : "";
  return `${percent}% left${tokens}`;
}

/** "1 read · last 18 Nov 2026", or "No reads yet". */
export function rowReads(row: AiCompanyRow): string {
  if (!row.reads)
    return row.has_grant
      ? "No reads yet"
      : "No reads yet · gets the default grant on its first read";
  const plural = row.reads === 1 ? "read" : "reads";
  return `${count(row.reads)} ${plural}${row.last_read_at ? ` · last ${day(row.last_read_at)}` : ""}`;
}

/** A grant's size and use: "5,000 of 20,000 tokens used · 1 of 10 reads used". */
export function grantUse(grant: AiGrant): string {
  const parts: string[] = [];
  if (grant.tokens_total !== null)
    parts.push(`${count(grant.tokens_used)} of ${count(grant.tokens_total)} tokens used`);
  if (grant.reads_total !== null)
    parts.push(`${count(grant.reads_used)} of ${count(grant.reads_total)} reads used`);
  return parts.join(" · ");
}

/** The grant's status pill: Open, Used up or Ended (expired, or ended by support). */
export function grantStatus(grant: AiGrant, now = new Date()): "Open" | "Used up" | "Ended" {
  if (grant.ended_at) return "Ended";
  if (grant.open) return "Open";
  if (grant.expires_at && new Date(grant.expires_at) <= now) return "Ended";
  return "Used up";
}

// ---- ending a grant (owner, 2026-11-20) ----------------------------------------------------------

export const END_GRANT = "End grant";
export const END_GRANT_LABEL = "End this grant";
export const END_TITLE = "End this grant?";
export const END_TEXT = "Its unused tokens and reads can't be used anymore. This can't be undone.";
export const GRANT_ENDED = "Grant ended.";

/** Still running (open or used up): not ended by support and not past its end date. */
export function canEnd(grant: AiGrant, now = new Date()): boolean {
  if (grant.ended_at) return false;
  return !(grant.expires_at && new Date(grant.expires_at) <= now);
}

/** "Ended 20 Nov 2026 by boss@test.com" - only for a grant support ended. */
export function endedLine(grant: AiGrant): string | null {
  if (!grant.ended_at) return null;
  return `Ended ${day(grant.ended_at)}${grant.ended_by ? ` by ${grant.ended_by}` : ""}`;
}
