/**
 * "Your session has expired" (owner, 2026-11-19): a 401 whose body carries
 * `reason: "session_expired"` means the hub sign-in behind the token has ENDED - 60 minutes
 * without activity, or signed out - so renewing the token quietly would only reach the sign-in
 * page anyway. Every API adds the reason (`minty_shared.tokens.session_ended`); a 401 without it
 * is a token that merely ran out, renewed quietly as before (lib/handoff.ts).
 * Copied to minty-petty-cash-web, minty-payment-request-web and minty-onboarding-web
 * (`lib/sessionExpired.ts`) - change all four until `@minty/shared` holds it.
 *
 * `showSessionExpired(loginUrl)` is the ONE place the app says so. For now it only goes to the
 * sign-in page; the pop-up itself ("Your session has expired", OK) is to come from
 * `@minty/shared` as one component for every app (pending the owner's word) and will sit behind
 * this same call. It fires once: several calls fail together on a dead sign-in.
 */

/** The `reason` on a 401 whose sign-in has ended (`minty_shared.tokens.SESSION_EXPIRED_REASON`). */
export const SESSION_EXPIRED_REASON = "session_expired";

/** Whether a 401's parsed body says the sign-in behind the token has ended. */
export function isSessionExpired(body: unknown): boolean {
  return (
    !!body &&
    typeof body === "object" &&
    (body as { reason?: unknown }).reason === SESSION_EXPIRED_REASON
  );
}

type Navigate = (url: string) => void;

const defaultNavigate: Navigate = (url) => {
  window.location.href = url;
};

let navigate: Navigate = defaultNavigate;
let shown = false;

/** True once the session-expired path has been taken (the quiet re-hand-off then stays put). */
export function sessionExpiredShown(): boolean {
  return shown;
}

/** Tell the person their session has expired and take them to `loginUrl` - once. */
export function showSessionExpired(loginUrl: string): void {
  if (shown || typeof window === "undefined") return;
  shown = true;
  navigate(loginUrl);
}

/** Test seam: forget it was shown, and optionally capture the navigation. */
export function _resetSessionExpiredForTests(capture?: Navigate) {
  shown = false;
  navigate = capture ?? defaultNavigate;
}
