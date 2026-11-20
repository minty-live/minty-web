/**
 * AI allowances for Minty support (owner, 2026-11-18): minty-accounts-api's `hub/ai_grants.py`,
 * drawn as the entity list's "AI allowances" mode (like "Archive companies"; owner, 2026-11-19).
 * Superusers only - anyone else is refused (403). Each company reads receipts
 * and invoices against its own AI grants (minty-db's `ai_grant`); here support sees what is left and
 * gives a company a grant. The models, the default grant and the extra caps stay on
 * minty-petty-cash-api's `manage.py ai_policy`.
 */

import { mintyFetch } from "@/lib/apiClient";

export type AiCompanyRow = {
  id: string;
  name: string;
  /** How much of the company's open grants is left, 0-100. */
  percent_left: number | null;
  /** Nothing left (or an extra cap reached): its read buttons are disabled. */
  blocked: boolean;
  /** Tokens used / given over the grants that still have room; null when none has a token cap. */
  tokens_used: number | null;
  tokens_given: number | null;
  /** False: never given anything - the figures are the default grant it gets on its first read. */
  has_grant: boolean;
  /** Reads a model answered, all time. */
  reads: number;
  last_read_at: string | null;
};

export type AiCompanyList = {
  companies: AiCompanyRow[];
  page: number;
  page_size: number;
  total: number;
};

export type AiGrant = {
  id: string;
  /** `default` = given automatically on the first read; `manual` = given by support. */
  source: "default" | "manual";
  tokens_total: number | null;
  tokens_used: number;
  reads_total: number | null;
  reads_used: number;
  expires_at: string | null;
  /** Still has room and has not expired. */
  open: boolean;
  granted_by: string | null;
  note: string | null;
  created_at: string;
  /** Ended early by Minty support (owner, 2026-11-20): when, and who. Absent from an older API. */
  ended_at?: string | null;
  ended_by?: string | null;
};

export type AiRead = {
  id: string;
  created_at: string;
  module: "petty_cash" | "payment_request";
  status: "pending" | "ok" | "failed";
  model: string | null;
  attempts: string | null;
  tokens: number;
};

export type AiCompany = {
  company: { id: string; name: string };
  allowance: {
    percent_left: number | null;
    blocked: boolean;
    resumes_at: string | null;
    reads_left: number | null;
    reads_limit: number | null;
  };
  default_grant: { tokens: number | null; reads: number | null; days: number | null } | null;
  grants: AiGrant[];
  /** The 20 newest; `reads_more` when older ones are left ("Show more reads"). */
  reads: AiRead[];
  reads_more: boolean;
  /** After a grant is given. */
  message?: string;
};

export type GrantInput = { tokens: string; reads: string; days: string; note: string };

/** The allowance of exactly the companies the list shows (`?ids=`, at most 500). */
export function fetchAiCompanies(ids: string[], signal?: AbortSignal): Promise<AiCompanyList> {
  return mintyFetch<AiCompanyList>("/api/me/ai/companies", {
    query: { ids: ids.join(",") },
    signal,
  });
}

export function fetchAiCompany(id: string, signal?: AbortSignal): Promise<AiCompany> {
  return mintyFetch<AiCompany>(`/api/me/ai/companies/${encodeURIComponent(id)}`, { signal });
}

/** The next 20 reads older than `before` (a read of this company), and whether more are left. */
export function fetchAiReads(
  id: string,
  before: string,
  signal?: AbortSignal,
): Promise<{ reads: AiRead[]; more: boolean }> {
  return mintyFetch<{ reads: AiRead[]; more: boolean }>(
    `/api/me/ai/companies/${encodeURIComponent(id)}/reads`,
    { query: { before }, signal },
  );
}

/** End one of the company's grants now (owner, 2026-11-20); the API answers the company again. */
export function endAiGrant(id: string, grantId: string): Promise<AiCompany> {
  return mintyFetch<AiCompany>(
    `/api/me/ai/companies/${encodeURIComponent(id)}/grants/${encodeURIComponent(grantId)}/end`,
    { method: "POST" },
  );
}

/** Give the company a grant; the API answers the company again, with `message`. */
export function giveAiGrant(id: string, input: GrantInput): Promise<AiCompany> {
  return mintyFetch<AiCompany>(`/api/me/ai/companies/${encodeURIComponent(id)}/grants`, {
    method: "POST",
    json: input,
  });
}
