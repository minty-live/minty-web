/**
 * Whose auto-saved drafts a form keeps (`@minty/shared/drafts`, the owner's decisions doc L1): the
 * signed-in person - the token's `user_id` - and the company the form is for. Settings pages name
 * the company in their address, and the payer portal's token names none, so the company is the
 * caller's (the token's `entity_id` only when the caller has none). No token, or one without a
 * person: null, and nothing is kept or offered.
 */

import { useMemo } from "react";

import { draftScopeFromToken, type DraftScope } from "@minty/shared/drafts";

import { getAuth } from "@/lib/auth";

export function draftScope(entityId: string | null | undefined): DraftScope | null {
  const person = draftScopeFromToken(getAuth()?.token);
  if (!person) return null;
  return { userId: person.userId, entityId: entityId || person.entityId };
}

/** `draftScope` once per company (the cookie is read in the browser; the server render gets null). */
export function useDraftScope(entityId: string | null | undefined): DraftScope | null {
  return useMemo(() => draftScope(entityId), [entityId]);
}

/** The signed-in person, for an explicit sign-out's `clearDraftsForUser`; null when unknown. */
export function draftUserId(): string | null {
  return draftScopeFromToken(getAuth()?.token)?.userId ?? null;
}
