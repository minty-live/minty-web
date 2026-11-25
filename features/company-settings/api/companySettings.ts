/**
 * The two tabs' calls: Flask's bearer routes `/api/me/company/*` (Minty
 * `blueprints/entity/routes/hub_settings.py`). The company travels as `?entity=` on every call -
 * the one place Flask reads it from - and is checked against the person's memberships there.
 * A refusal rejects with `ApiError` carrying Flask's own sentence.
 */

import { mintyFetch } from "@/lib/apiClient";

/** `dialog`: one to act on, drawn as a modal (NoticeDialog), never a toast. */
export type Notice = {
  category: "success" | "error" | "warning" | "info" | "dialog";
  message: string;
};

export type RoleOption = { value: string; label: string };

export type Member = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  initials: string;
  role: string;
  role_label: string | null;
  /** The person whose card pays for the company. */
  subscriber: boolean;
  is_you: boolean;
  can_change_role: boolean;
  can_remove: boolean;
};

export type Invitation = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  role_label: string | null;
  created_at: string | null;
  /** Seconds before it may be sent again. */
  resend_cooldown: number;
  can_manage: boolean;
};

export type UsersPage = {
  company: { id: string; name: string };
  modules: string[];
  members: Member[];
  invitations: Invitation[];
  /** The roles this person may give - at or below their own. */
  roles: RoleOption[];
  can_invite: boolean;
  notices: Notice[];
};

/**
 * The company already holding the Xero organisation a connect from here was refused for
 * (Flask's `?xero_conflict=`). One organisation belongs to one company, so the way on is to
 * free it there first - `can_move` is whether this person may, on THAT company.
 */
export type XeroConflict = {
  entity_id: string;
  entity_name: string;
  organisation: string | null;
  can_move: boolean;
};

export type IntegrationPage = {
  company: { id: string; name: string; country_code: string | null; currency_id: string | null };
  modules: string[];
  countries: { code: string; name: string }[];
  currencies: { id: string; name: string }[];
  xero: {
    status: string;
    connected: boolean;
    needs_reconnect: boolean;
    organisation: string | null;
    last_connected_at: string | null;
  };
  can_edit: boolean;
  can_rename: boolean;
  /** Connected to Xero, so the currency stays Xero's (the user, 2026-11-24; the API refuses a change). */
  currency_locked?: boolean;
  /** How Minty keeps the books (step 4): a `minty` company's connect matches its accounts first. */
  setup_mode?: "minty" | "xero" | null;
  /** A `minty` company's own accounts - what the matching page will ask about (SET-1b's count). */
  own_accounts?: number;
  /** Matching started and not finished: the accounts, or (after Finish) suppliers Xero refused. */
  matching?: { accounts: boolean; contacts: boolean; reason?: MatchReason | null };
  notices: Notice[];
  /** Only on a read that carried a refused connect; null the rest of the time. */
  xero_conflict: XeroConflict | null;
  message?: string;
};

const q = (entityId: string, extra: Record<string, string | undefined> = {}) => ({
  entity: entityId,
  ...extra,
});

export function fetchUsers(
  entityId: string,
  flash?: string | null,
  signal?: AbortSignal,
): Promise<UsersPage> {
  return mintyFetch<UsersPage>("/api/me/company/users", {
    query: q(entityId, { flash: flash || undefined }),
    signal,
  });
}

export function inviteMember(
  entityId: string,
  invite: { email: string; role: string; first_name: string; last_name: string },
): Promise<{ invitation_id: string; email_sent: boolean; message: string }> {
  return mintyFetch("/api/me/company/invitations", {
    method: "POST",
    query: q(entityId),
    json: invite,
  });
}

export function cancelInvitation(
  entityId: string,
  invitationId: string,
): Promise<{ message: string }> {
  return mintyFetch(`/api/me/company/invitations/${encodeURIComponent(invitationId)}/cancel`, {
    method: "POST",
    query: q(entityId),
  });
}

/** 429 = still cooling down: `ApiError.body.retry_after` says for how long. */
export function resendInvitation(
  entityId: string,
  invitationId: string,
): Promise<{ message: string; resend_cooldown: number }> {
  return mintyFetch(`/api/me/company/invitations/${encodeURIComponent(invitationId)}/resend`, {
    method: "POST",
    query: q(entityId),
  });
}

export function changeRole(
  entityId: string,
  memberId: string,
  role: string,
): Promise<{ message: string; role: string }> {
  return mintyFetch(`/api/me/company/users/${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    query: q(entityId),
    json: { role },
  });
}

export function removeMember(entityId: string, memberId: string): Promise<{ message: string }> {
  return mintyFetch(`/api/me/company/users/${encodeURIComponent(memberId)}`, {
    method: "DELETE",
    query: q(entityId),
  });
}

export function fetchIntegration(
  entityId: string,
  flash?: string | null,
  conflict?: string | null,
  signal?: AbortSignal,
): Promise<IntegrationPage> {
  return mintyFetch<IntegrationPage>("/api/me/company/integration", {
    query: q(entityId, { flash: flash || undefined, xero_conflict: conflict || undefined }),
    signal,
  });
}

export function saveIntegration(
  entityId: string,
  changes: { name?: string; country_code?: string; currency_id?: string },
): Promise<IntegrationPage> {
  return mintyFetch<IntegrationPage>("/api/me/company/integration", {
    method: "PATCH",
    query: q(entityId),
    json: changes,
  });
}

export function disconnectXero(entityId: string): Promise<IntegrationPage> {
  return mintyFetch<IntegrationPage>("/api/me/company/xero/disconnect", {
    method: "POST",
    query: q(entityId),
  });
}

// ---- Match your accounts to Xero (Settings Phase 2, 2026-11-11; accounts-api hub/xero_matching.py) ----

/** Why a matching is open (Phase 3, 2026-11-12; `entities.xero_matching`): a first connect, accounts
 * added while disconnected, a new organisation, or changing the matches. */
export type MatchReason = "first" | "new_accounts" | "new_org" | "change";

export type MatchRow = {
  account_id: string;
  code: string;
  name: string;
  type: string | null;
  /** Which Xero accounts fit: a bank only a bank; otherwise the same class. */
  kind: string | null;
  /** The account's own group ("Running the business") - shown in the "Not matched yet" section. */
  group?: string;
  /** An expense or bill line, a daily-closing account or a sales method uses it. Every account
   * needs a match all the same (the user, 2026-11-24). */
  used: boolean;
  system: boolean;
  pick: { xero_account_id: string; auto: boolean } | null;
  suggestion: string | null;
  /** Xero has the same code with another type: never picked for the person. */
  conflict: { code: string; name: string } | null;
};

/** `held_by`: the account that has this Xero account - one Minty account each (2026-11-24). */
export type MatchOption = {
  id: string;
  code: string;
  name: string;
  kind: string | null;
  held_by?: string | null;
};

export type PettyCashContact = "cash_sale" | "director" | "discrepancy";

/** A contacts-step answer: a Xero contact, or (a supplier only) new in Xero - its first publish puts it there. */
export type MatchContactPick = { xero_contact_id: string | null; auto: boolean; new: boolean };
/** `held_by`: the Minty contact that already has it - a supplier can't pick it (matching never merges,
 * the user, 2026-11-25); a daily-closing slot can. */
export type MatchContactOption = { id: string; name: string; held_by?: string | null };

/** The contacts step (the user, 2026-11-24): asked before Finish. `required` is false for a change. */
export type MatchContacts = {
  required: boolean;
  suppliers: { contact_id: string; name: string; pick: MatchContactPick | null }[];
  slots: { slot: PettyCashContact; pick: MatchContactPick | null }[];
  options: MatchContactOption[];
  /** Suppliers and slots with no answer - Finish is refused until it is 0. */
  blocking: number;
};

export type ContactAnswer = { xero_contact_id: string | null } | { new: true };

export type MatchingPage = {
  organisation: string | null;
  reason?: MatchReason | null;
  groups: { key: string; title: string; rows: MatchRow[] }[];
  options: MatchOption[];
  matched: number;
  total: number;
  /** Accounts with no match - Finish is refused until it is 0. */
  blocking: number;
  contacts: MatchContacts;
  pending: { accounts: boolean; contacts: boolean; reason?: MatchReason | null };
  failed_contacts: string[];
  connected?: boolean;
  error?: string;
  /** Finish / Try again only: daily closing's contacts still to choose - Xero's rules need them. */
  pettycash_contacts_missing?: PettyCashContact[];
  /** GET only: this person may refresh from Xero (and pick). */
  can_edit?: boolean;
};

const MATCHING = "/api/me/company/xero/matching";

export function fetchMatching(entityId: string, signal?: AbortSignal): Promise<MatchingPage> {
  return mintyFetch<MatchingPage>(MATCHING, { query: q(entityId), signal });
}

export function pickMatch(
  entityId: string,
  accountId: string,
  xeroAccountId: string | null,
): Promise<MatchingPage> {
  // PATCH: the accounts API's CORS answer allows no PUT (hub/transport.py METHODS).
  return mintyFetch<MatchingPage>(MATCHING, {
    method: "PATCH",
    query: q(entityId),
    json: { account_id: accountId, xero_account_id: xeroAccountId },
  });
}

/** `throttle` (the page opening): the API skips Xero when it read the chart under 2 minutes ago. */
export function refreshMatching(
  entityId: string,
  { throttle = false }: { throttle?: boolean } = {},
): Promise<MatchingPage> {
  return mintyFetch<MatchingPage>(`${MATCHING}/refresh`, {
    method: "POST",
    query: q(entityId),
    ...(throttle ? { json: { throttle: true } } : {}),
  });
}

/** One answer of the contacts step: a supplier's (`contact_id`) or a daily-closing contact's (`slot`). */
export function pickContactMatch(
  entityId: string,
  answer: ({ contact_id: string } | { slot: PettyCashContact }) & ContactAnswer,
): Promise<MatchingPage> {
  return mintyFetch<MatchingPage>(`${MATCHING}/contacts`, {
    method: "PATCH",
    query: q(entityId),
    json: answer,
  });
}

export function finishMatching(entityId: string): Promise<MatchingPage> {
  return mintyFetch<MatchingPage>(`${MATCHING}/finish`, { method: "POST", query: q(entityId) });
}

/** Change the matches (Phase 3): a connected company's page again, prefilled. */
export function startChangeMatches(entityId: string): Promise<MatchingPage> {
  return mintyFetch<MatchingPage>(`${MATCHING}/change`, { method: "POST", query: q(entityId) });
}

/** Leave a change of the matches; nothing changed. */
export function cancelChangeMatches(entityId: string): Promise<MatchingPage> {
  return mintyFetch<MatchingPage>(`${MATCHING}/cancel`, { method: "POST", query: q(entityId) });
}

export function retryContacts(entityId: string): Promise<MatchingPage> {
  return mintyFetch<MatchingPage>(`${MATCHING}/contacts`, { method: "POST", query: q(entityId) });
}

/**
 * Disconnect the OTHER company (`holderId`), freeing its Xero organisation for `entityId` -
 * the first half of the move; the caller then sends the person through Xero's consent screen
 * for `entityId`. Flask authorizes `holderId` on its own and refuses (403) when this person
 * may not disconnect it, whatever the dialog drew.
 */
export function releaseXero(entityId: string, holderId: string): Promise<{ message: string }> {
  return mintyFetch("/api/me/company/xero/release", {
    method: "POST",
    query: q(entityId),
    json: { entity_id: holderId },
  });
}

// ---- One account mapped again (owner's decisions doc A3, 2026-11-19; accounts-api matching.map_one) ----

export type MatchOnePage = {
  organisation: string | null;
  /** Its Xero account was archived or removed: the doc's sentence is in `message`. */
  gone_from_xero: boolean;
  message: string | null;
  row: MatchRow;
  options: MatchOption[];
};

export function fetchMatchOne(
  entityId: string,
  accountId: string,
  signal?: AbortSignal,
): Promise<MatchOnePage> {
  return mintyFetch<MatchOnePage>(`${MATCHING}/account`, {
    query: q(entityId, { account: accountId }),
    signal,
  });
}

/** Link the account to the Xero account picked. A 409 means another account already has it -
 * accounts are never merged (the user, 2026-11-24). */
export function mapMatchOne(
  entityId: string,
  accountId: string,
  xeroAccountId: string,
): Promise<{ message: string; account_id: string }> {
  return mintyFetch<{ message: string; account_id: string }>(`${MATCHING}/account`, {
    method: "POST",
    json: { account_id: accountId, xero_account_id: xeroAccountId },
    query: q(entityId),
  });
}
