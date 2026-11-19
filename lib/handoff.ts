/**
 * Getting a token, and getting a new one.
 *
 * This app never mints a token and never refreshes one (Flask is the single minter -
 * cross-cutting rule 1). Both the first arrival and a lapsed session go through Flask's
 * login-gated `GET /handoff/minty-web?next=<path>&entity_id=<id>` (Minty, Part 2 step 5):
 * with a live Flask session it mints the module token and sends the browser straight back to
 * `/landing?token=…&next=<path>` here - a silent round trip, because Flask's 24-hour session
 * outlives the 30-minute token; without one it shows the login first and then does the same.
 */

import { clearAuth, getAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { HUB_HOME } from "@/lib/hubPaths";
import { sessionExpiredShown, showSessionExpired } from "@/lib/sessionExpired";
import { safeNextPath } from "@minty/shared/safeNext";

/** A path this app may land on after the handoff (lib/safeNext.ts has the rule). */
export function safeNext(raw: string | null | undefined, fallback: string = HUB_HOME): string {
  return safeNextPath(raw, fallback);
}

/**
 * `origin` is where Flask should hand back to: the page's own origin, or - in the proxy, which
 * runs on the server - the request's. Flask uses it only for a branch preview set (Minty
 * `blueprints/shared/preview_origin.py`) and ignores it everywhere else.
 */
export function handoffUrl(next: string, entityId?: string, origin?: string): string {
  const qs = new URLSearchParams({ next: safeNext(next) });
  if (entityId) qs.set("entity_id", entityId);
  return withReturnOrigin(`${env.ACCOUNTS_API_URL}/handoff/minty-web?${qs.toString()}`, origin);
}

/** `url` (a Flask address) naming this app's origin as `return_origin`; unchanged with none. */
export function withReturnOrigin(url: string, origin?: string): string {
  const own = origin ?? (typeof window === "undefined" ? undefined : window.location.origin);
  if (!own) return url;
  const target = new URL(url);
  target.searchParams.set("return_origin", own);
  return target.toString();
}

type Navigate = (url: string) => void;

const defaultNavigate: Navigate = (url) => {
  window.location.href = url;
};

let navigate: Navigate = defaultNavigate;
let redirecting = false;

/**
 * Send the browser to Flask for a fresh token, once. Several requests in flight fail together
 * on an expired token, and each one reassigning `location.href` while the first navigation is
 * already under way is how a redirect turns into a flicker.
 */
export function redirectToHandoff(next?: string, entityId?: string) {
  if (redirecting || sessionExpiredShown() || typeof window === "undefined") return;
  redirecting = true;
  clearAuth();
  const target = next ?? window.location.pathname + window.location.search;
  navigate(handoffUrl(target, entityId));
}

/**
 * The hub's sign-in page (this app's `/login`) when the sign-in behind the token has ENDED
 * (lib/sessionExpired.ts, 2026-11-19), with `next` = the re-hand-off (a path on accounts-api)
 * that brings the person back to this page, for the company the cookie names, once signed in.
 */
export function sessionExpiredLoginUrl(entityId?: string): string {
  const company = entityId ?? (getAuth()?.entityId || undefined);
  const back = new URL(handoffUrl(window.location.pathname + window.location.search, company));
  return `/login?${new URLSearchParams({ next: back.pathname + back.search }).toString()}`;
}

/** "Your session has expired": the cookie cleared, then `showSessionExpired` - once. */
export function sessionExpired(entityId?: string) {
  if (sessionExpiredShown() || typeof window === "undefined") return;
  const url = sessionExpiredLoginUrl(entityId);
  clearAuth();
  showSessionExpired(url);
}

/** Send the browser somewhere outside the app - Stripe's card form - through the same seam. */
export function leaveTo(url: string) {
  navigate(url);
}

/**
 * Leave by a top-level form POST (no body) - Minty's `/logout` answers a GET with 405 and takes a
 * POST only from a front end's `Origin`. Never `fetch` (the session cookie and the 302 belong to
 * the browser's navigation). The meta first: this app's `Referrer-Policy: same-origin` makes the
 * browser send `Origin: null` on a cross-origin POST, and `strict-origin` names only the origin -
 * what `Origin` says anyway, never a path or query. The page is leaving, so it stays.
 */
export function postNavigate(url: string) {
  const meta = document.createElement("meta");
  meta.name = "referrer";
  meta.content = "strict-origin";
  document.head.appendChild(meta);
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  form.hidden = true;
  document.body.appendChild(form);
  form.submit();
}

/** Test seam: forget that a redirect is under way, and optionally capture the navigation
 * instead of assigning `location.href` (jsdom does not allow `location` to be replaced). */
export function _resetHandoffForTests(capture?: Navigate) {
  redirecting = false;
  navigate = capture ?? defaultNavigate;
}
