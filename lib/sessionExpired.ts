/**
 * "Your session has expired" (owner, 2026-11-19): a 401 whose body carries
 * `reason: "session_expired"` means the hub sign-in behind the token has ENDED - 60 minutes
 * without activity, or signed out - so renewing the token quietly would only reach the sign-in
 * page anyway. Every API adds the reason (`minty_shared.tokens.session_ended`); a 401 without it
 * is a token that merely ran out, renewed quietly as before (lib/handoff.ts).
 *
 * `showSessionExpired(loginUrl)` is the ONE place the app says so: it raises `@minty/shared`'s
 * pop-up (`SessionExpiredHost`, drawn once in app/layout.tsx), whose OK goes to `loginUrl`. It
 * fires once: several calls fail together on a dead sign-in. The same file in minty-web,
 * minty-petty-cash-web, minty-payment-request-web and minty-onboarding-web - the app's seam over
 * the package's store, kept for its callers and tests.
 */

import {
  isSessionExpired,
  resetSessionExpiredForTests,
  SESSION_EXPIRED_REASON,
  sessionExpiredUrl,
  showSessionExpired as raisePopUp,
} from "@minty/shared/sessionExpired";

export { isSessionExpired, SESSION_EXPIRED_REASON };

type Navigate = (url: string) => void;

let seen: Navigate | null = null;

/** True once the session-expired path has been taken (the quiet re-hand-off then stays put). */
export function sessionExpiredShown(): boolean {
  return sessionExpiredUrl() !== null;
}

/** Tell the person their session has expired; OK takes them to `loginUrl` - once. */
export function showSessionExpired(loginUrl: string): void {
  if (sessionExpiredShown() || typeof window === "undefined") return;
  raisePopUp(loginUrl);
  seen?.(loginUrl);
}

/** Test seam: forget it was shown, and optionally hear the login address it is raised with. */
export function _resetSessionExpiredForTests(capture?: Navigate) {
  resetSessionExpiredForTests();
  seen = capture ?? null;
}
