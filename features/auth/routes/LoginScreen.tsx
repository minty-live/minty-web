"use client";

/**
 * THE sign-in page since phase 2 (2026-10-05): log in (`/login`), sign up (`/signup`, its own
 * route since 2026-10-09) and an invitation (`/login?invite=&email=`), which were Flask's `/` +
 * `/register` and minty-onboarding-web's `/auth` until then. Flask stays the identity behind it
 * (features/auth/api/signIn.ts).
 *
 * - Email: a code is emailed (`requestCode`) and `/login/confirm` takes it. Log-in mode asks
 *   accounts-api to refuse an address with no account before anything is sent; that refusal is a
 *   question here ("You haven't signed up yet"): Continue opens `/signup` with the address,
 *   Cancel stays (2026-11-26).
 * - Xero: a navigation to accounts-api's OAuth start; its callback signs the person in. A Xero
 *   login with no Minty account comes back with `?xero_signup=` and the same question: Continue
 *   turns this page into the sign-up (Xero's names, its address fixed, the Terms) and Create
 *   account makes it with no code; Cancel drops the held login (2026-11-26).
 * - Making an account (sign-up, or an invitee new to Minty) needs the Terms agreed first: the
 *   box opens the read-to-agree panel and is ticked only by agreeing at its end. An invitee who
 *   already agreed is not asked again (`inviteOwesTerms`); any doubt keeps the box.
 */

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { TermsModal } from "@/components/ui/TermsModal";
import { ApiError } from "@/lib/apiClient";
import { leaveTo } from "@/lib/handoff";
import { EMAIL_ASCII_HINT, isEmail, useEmailInput } from "@minty/shared/emailInput";
import { SessionExpiredDialog } from "@minty/shared/ui";
import type { LegalDocumentBody } from "@/lib/legal/document";
import { LEGAL_PATHS } from "@/lib/legal/paths";

import {
  cancelXeroSignup,
  createXeroAccount,
  isNotSignedUp,
  requestCode,
  inviteOwesTerms,
  signUpTerms,
  xeroSignInUrl,
  xeroSignupDetails,
  type XeroSignup,
} from "@/features/auth/api/signIn";
import {
  AUTH_ERROR,
  AUTH_GHOST,
  AUTH_FIELD,
  AUTH_INPUT,
  AUTH_LABEL,
  AUTH_LINK,
  AUTH_PRIMARY,
  AuthHeading,
  AuthShell,
} from "@/features/auth/components/AuthShell";
import { useSignInNotices } from "@/features/auth/hooks/useSignInNotices";
import type { Arrival } from "@/features/auth/lib/arrival";
import { saveConfirmContext } from "@/features/auth/lib/handover";
import { AUTH_PATHS } from "@/features/auth/lib/paths";

export const LOGIN_COPY = {
  loginTitle: "Welcome",
  loginLead: "Start your journey with us today.",
  signupTitle: "Create your account",
  signupLead: "Sign up with your email to get started.",
  sendLogin: "Log in with OTP",
  sendSignup: "Continue with Email",
  sending: "Sending code…",
  xero: "Log in with Xero",
  noStorage:
    "Your browser is blocking site storage, so I can't take you to the next step. Mind allowing it and trying again?",
  termsUnavailable: "I couldn't load the Terms of Use just now. Mind trying again?",
  notSignedUpTitle: "You haven't signed up yet",
  notSignedUpBody: "Click Continue to start sign-up.",
  xeroLead: "Signing up with your Xero login.",
  createAccount: "Create account",
  creating: "Creating your account…",
} as const;

const noSubscribe = () => () => {};
const readOrigin = (): string | undefined => window.location.origin;
const serverNoOrigin = (): string | undefined => undefined;

export function LoginScreen({ arrival }: { arrival: Arrival }) {
  const router = useRouter();
  useSignInNotices(arrival.flash);
  // "Your session has expired" (2026-11-19): the person is already where OK would take them.
  const [expiredOpen, setExpiredOpen] = useState(arrival.expired);

  // `invite` is a secret: once read, it leaves the address bar (and the history).
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, []);

  // This page's origin for the Xero link's `return_origin`: none in the server's HTML and the
  // hydration (they must agree), the browser's right after. Read during render it made the two
  // differ - a hydration mismatch React does not patch, so the link kept the server's address
  // and left a preview set.
  const origin = useSyncExternalStore(noSubscribe, readOrigin, serverNoOrigin);

  const invited = arrival.mode === "invite";
  // A Xero login with no Minty account, once Continue was pressed: this page is its sign-up.
  const [xero, setXero] = useState<XeroSignup | null>(null);
  const signup = arrival.mode === "signup" || xero !== null;
  // "You haven't signed up yet" - for the address typed, or for the held Xero login.
  const [ask, setAsk] = useState<{ email: string; xero?: XeroSignup } | null>(null);
  const [email, setEmail] = useState(arrival.email);
  const emailInput = useEmailInput(setEmail);
  const [firstName, setFirstName] = useState(arrival.firstName);
  const [lastName, setLastName] = useState(arrival.lastName);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // The Terms: owed on sign-up always; on an invitation unless Flask says this invitee agreed.
  const [termsOwed, setTermsOwed] = useState(arrival.mode !== "login");
  const [terms, setTerms] = useState<LegalDocumentBody | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [agreedVersion, setAgreedVersion] = useState("");
  useEffect(() => {
    if (!invited) return;
    inviteOwesTerms(arrival.invite)
      .then(setTermsOwed)
      .catch((err) =>
        console.error("[sign-in] whether the invitee owes the Terms is unknown; asking", err),
      );
  }, [invited, arrival.invite]);

  useEffect(() => {
    if (!arrival.xeroSignup || arrival.mode !== "login") return;
    xeroSignupDetails(arrival.xeroSignup)
      .then((held) => setAsk({ email: held.email, xero: held }))
      .catch((err) => {
        console.error("[sign-in] the held Xero login could not be read", err);
        setError(err instanceof ApiError ? err.message : String(err));
      });
  }, [arrival.xeroSignup, arrival.mode]);

  const continueSignup = () => {
    if (!ask) return;
    setAsk(null);
    if (ask.xero) {
      setXero(ask.xero);
      setEmail(ask.xero.email);
      setFirstName(ask.xero.firstName);
      setLastName(ask.xero.lastName);
      setTermsOwed(true);
      setAgreedVersion("");
      setError("");
      return;
    }
    const query = new URLSearchParams({ email: ask.email });
    if (arrival.next) query.set("next", arrival.next);
    router.push(`${AUTH_PATHS.signup}?${query.toString()}`);
  };

  const cancelSignup = () => {
    if (ask?.xero) {
      cancelXeroSignup(ask.xero.key).catch((err) =>
        console.error(
          "[sign-in] the held Xero login could not be dropped; it lapses on its own",
          err,
        ),
      );
    }
    setAsk(null);
  };

  const emailLocked = (invited && Boolean(arrival.email)) || xero !== null;
  const namesValid = !signup || (firstName.trim() !== "" && lastName.trim() !== "");
  const termsValid = !termsOwed || Boolean(agreedVersion);
  const canSend = isEmail(email) && namesValid && termsValid && !sending;

  const openTerms = async () => {
    setError("");
    if (!terms) {
      try {
        setTerms(await signUpTerms());
      } catch (err) {
        console.error("[sign-in] the Terms could not be loaded", err);
        setError(LOGIN_COPY.termsUnavailable);
        return;
      }
    }
    setTermsOpen(true);
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setError("");
    setSending(true);
    if (xero) {
      try {
        leaveTo(
          await createXeroAccount({
            key: xero.key,
            firstName,
            lastName,
            termsVersion: agreedVersion,
          }),
        );
      } catch (err) {
        setSending(false);
        setError(err instanceof ApiError ? err.message : String(err));
      }
      return;
    }
    const login = !signup && !invited;
    try {
      await requestCode({ email, login, invite: arrival.invite });
    } catch (err) {
      setSending(false);
      if (login && isNotSignedUp(err)) setAsk({ email });
      else setError(err instanceof ApiError ? err.message : String(err));
      return;
    }
    const handedOver = saveConfirmContext({
      email,
      login,
      invite: arrival.invite,
      firstName,
      lastName,
      termsAccepted: termsOwed && Boolean(agreedVersion),
      termsVersion: termsOwed ? agreedVersion : "",
      next: arrival.next,
    });
    if (!handedOver) {
      setSending(false);
      setError(LOGIN_COPY.noStorage);
      return;
    }
    router.push(AUTH_PATHS.confirm);
  };

  return (
    <AuthShell>
      <AuthHeading
        title={signup ? LOGIN_COPY.signupTitle : LOGIN_COPY.loginTitle}
        lead={xero ? LOGIN_COPY.xeroLead : signup ? LOGIN_COPY.signupLead : LOGIN_COPY.loginLead}
      />

      {invited && arrival.email ? (
        <div
          className="rounded-lg border border-border-selected/40 bg-state-selected px-3.5 py-3 text-[13.5px] leading-normal text-ink"
          role="status"
        >
          This invitation was sent to <strong className="font-semibold">{arrival.email}</strong>.
          Please sign in with that account to accept it.
        </div>
      ) : null}

      <form className="flex flex-col gap-3.5" onSubmit={(e) => void send(e)} noValidate>
        {signup ? (
          <>
            <div className={AUTH_FIELD}>
              <input
                id="signin-first-name"
                type="text"
                autoComplete="given-name"
                placeholder=" "
                className={AUTH_INPUT}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <label htmlFor="signin-first-name" className={AUTH_LABEL}>
                First name
                <RequiredMark />
              </label>
            </div>
            <div className={AUTH_FIELD}>
              <input
                id="signin-last-name"
                type="text"
                autoComplete="family-name"
                placeholder=" "
                className={AUTH_INPUT}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
              <label htmlFor="signin-last-name" className={AUTH_LABEL}>
                Last name
                <RequiredMark />
              </label>
            </div>
          </>
        ) : null}

        <div>
          <div className={AUTH_FIELD}>
            <input
              id="signin-email"
              {...emailInput.props}
              placeholder=" "
              className={AUTH_INPUT}
              value={email}
              readOnly={emailLocked}
              aria-readonly={emailLocked}
              title={
                xero
                  ? "Your Xero login's address"
                  : emailLocked
                    ? "This invite was sent to this address"
                    : undefined
              }
            />
            <label htmlFor="signin-email" className={AUTH_LABEL}>
              Email
              <RequiredMark />
            </label>
          </div>
          {emailInput.rejected ? (
            <p className="mt-1.5 text-[12.5px] text-danger" role="status">
              {EMAIL_ASCII_HINT}
            </p>
          ) : null}
        </div>

        {termsOwed ? (
          <label className="flex cursor-pointer items-start gap-2 text-[13.5px] leading-normal text-ink">
            {/* Never ticked directly - a box ticked without reading is not agreement. Clicking
                opens the document; agreeing at its end ticks it. Unticking is always allowed. */}
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-action-tick"
              checked={Boolean(agreedVersion)}
              onChange={() => {
                if (agreedVersion) setAgreedVersion("");
                else void openTerms();
              }}
            />
            <span>
              I agree to the{" "}
              <a
                className={AUTH_LINK}
                href={LEGAL_PATHS.terms}
                target="_blank"
                rel="noopener noreferrer"
              >
                Terms of Use
              </a>{" "}
              and{" "}
              <a
                className={AUTH_LINK}
                href={LEGAL_PATHS.privacy}
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy Policy
              </a>
              .
            </span>
          </label>
        ) : null}

        <button type="submit" className={AUTH_PRIMARY} disabled={!canSend}>
          {xero
            ? sending
              ? LOGIN_COPY.creating
              : LOGIN_COPY.createAccount
            : sending
              ? LOGIN_COPY.sending
              : signup
                ? LOGIN_COPY.sendSignup
                : LOGIN_COPY.sendLogin}
        </button>
        {error ? (
          <p className={AUTH_ERROR} role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {xero ? null : (
        <>
          <div className="flex items-center gap-3 text-[13px] text-muted" role="separator">
            <span className="h-px flex-1 bg-border-subtle" />
            or
            <span className="h-px flex-1 bg-border-subtle" />
          </div>

          <a
            className={AUTH_GHOST}
            href={xeroSignInUrl({ invite: arrival.invite, next: arrival.next }, origin)}
          >
            {LOGIN_COPY.xero}
            <Image
              src="/auth/xero-logo.webp"
              alt=""
              width={20}
              height={20}
              unoptimized
              className="h-5 w-5 rounded-full object-cover"
            />
          </a>
        </>
      )}

      <p className="text-center text-sm text-ink-soft">
        {signup ? (
          <>
            Already have an account?{" "}
            <a className={AUTH_LINK} href={AUTH_PATHS.login}>
              Log in
            </a>
          </>
        ) : (
          <>
            Don&apos;t have an account?{" "}
            <a className={AUTH_LINK} href={AUTH_PATHS.signup}>
              Sign up
            </a>
          </>
        )}
      </p>

      {termsOpen && terms ? (
        <TermsModal
          document={terms}
          agree={async (version) => setAgreedVersion(version)}
          onAccepted={() => setTermsOpen(false)}
          onCancel={() => setTermsOpen(false)}
        />
      ) : null}
      {ask ? (
        <ConfirmDialog
          title={LOGIN_COPY.notSignedUpTitle}
          image="surprised"
          lead={<span className="text-text-link">{ask.email}</span>}
          busy={false}
          confirmLabel="Continue"
          backLabel="Cancel"
          onConfirm={continueSignup}
          onBack={cancelSignup}
        >
          <p>{LOGIN_COPY.notSignedUpBody}</p>
        </ConfirmDialog>
      ) : null}
      <SessionExpiredDialog open={expiredOpen} onOk={() => setExpiredOpen(false)} />
    </AuthShell>
  );
}
