// The sign-in page as a person meets it: log in by code on `/login` (Flask refusing an address
// with no account), sign up on `/signup` (names and the Terms first - the box ticked only by
// agreeing at the document's end), an invitation (its address fixed, the Terms skipped when
// Flask says they were agreed), Xero as a navigation that keeps `next`, and Flask's messages
// from the way here.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/Toast";
import { env } from "@/lib/env";
import { _resetHandoffForTests } from "@/lib/handoff";

import { readArrival } from "@/features/auth/lib/arrival";
import { readConfirmContext } from "@/features/auth/lib/handover";
import { LOGIN_COPY, LoginScreen } from "@/features/auth/routes/LoginScreen";

const push = vi.fn();
// One router for every render, as Next's is.
const router = { push, replace: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Answers by path; records what was asked. */
/** Flask's routes plus this app's own - `/api/legal/*` is a relative URL, so resolve it. */
function flask(routes: Record<string, () => Response>) {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input), window.location.origin);
    const answer = routes[url.pathname];
    if (!answer) throw new Error(`unexpected call ${url.pathname}`);
    return answer();
  });
}

const calls = (path: string) =>
  fetchMock.mock.calls
    .filter(([input]) => new URL(String(input), window.location.origin).pathname === path)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body ?? "null")));

/** `signup` is what the `/signup` route tells `readArrival`, as app/signup does. */
function show(query = "", opts: { signup?: boolean } = {}) {
  render(
    <ToastProvider>
      <LoginScreen arrival={readArrival(new URLSearchParams(query), opts)} />
    </ToastProvider>,
  );
}

// Flask names the live version (`/legal/current`); this app supplies that version's text from
// its own registry (`/api/legal/terms/<version>`). Two reads, as the gate makes.
const TERMS_LIVE = {
  terms_version: "beta-1",
  privacy_version: "beta-1",
  effective_date: "18 September 2026",
};
const TERMS_DOC = {
  kind: "terms",
  version: "beta-1",
  html: "<p>The Terms.</p>",
  sha256: "c90a335ed1b5b8cf5d8f5dc6702117418878594053ef3c0720b7816182c7c438",
  effective_date: "18 September 2026",
  is_pinned: true,
  is_current: true,
  show_draft_notice: false,
};

describe("LoginScreen", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/login");
    window.sessionStorage.clear();
    push.mockReset();
    fetchMock.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("logs in by code: Flask is asked in log-in mode, the hand-over keeps next, then the code's page", async () => {
    flask({ "/auth/email/request-code": () => json({ status: "success" }) });
    show("next=%2Fentities");

    expect(screen.getByRole("heading", { name: LOGIN_COPY.loginTitle })).toBeInTheDocument();
    const send = screen.getByRole("button", { name: LOGIN_COPY.sendLogin });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/^Email\s*\*?$/), "jane@example.com{Enter}");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login/confirm"));
    expect(calls("/auth/email/request-code")).toEqual([
      { email: "jane@example.com", mode: "login" },
    ]);
    expect(readConfirmContext()).toMatchObject({
      email: "jane@example.com",
      login: true,
      next: "/entities",
    });
  });

  const NOT_SIGNED_UP = "You haven't signed up yet. Click Continue to start sign-up.";
  const notSignedUp = () =>
    json({ status: "error", message: NOT_SIGNED_UP, action: "signup" }, 404);

  it("an address with no account is asked about sign-up: Continue opens it with the address", async () => {
    flask({ "/auth/email/request-code": notSignedUp });
    show("next=%2Fentities");

    await userEvent.type(screen.getByLabelText(/^Email\s*\*?$/), "nobody@example.com");
    await userEvent.click(screen.getByRole("button", { name: LOGIN_COPY.sendLogin }));

    const dialog = await screen.findByRole("dialog", { name: LOGIN_COPY.notSignedUpTitle });
    expect(dialog).toHaveTextContent("nobody@example.com");
    expect(dialog).toHaveTextContent(LOGIN_COPY.notSignedUpBody);
    expect(screen.queryByRole("alert")).toBeNull(); // asked, not refused
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(push).toHaveBeenCalledWith("/signup?email=nobody%40example.com&next=%2Fentities");
  });

  it("Cancel on the sign-up question stays on log in with the address kept", async () => {
    flask({ "/auth/email/request-code": notSignedUp });
    show();

    await userEvent.type(screen.getByLabelText(/^Email\s*\*?$/), "nobody@example.com");
    await userEvent.click(screen.getByRole("button", { name: LOGIN_COPY.sendLogin }));
    await screen.findByRole("dialog", { name: LOGIN_COPY.notSignedUpTitle });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText(/^Email\s*\*?$/)).toHaveValue("nobody@example.com");
    expect(push).not.toHaveBeenCalled();
  });

  it("sign-up opened from the question starts with the address filled in", () => {
    show("email=nobody%40example.com", { signup: true });
    expect(screen.getByLabelText(/^Email\s*\*?$/)).toHaveValue("nobody@example.com");
  });

  it("any other refusal is still said in the page's error line", async () => {
    flask({
      "/auth/email/request-code": () =>
        json(
          { status: "error", message: "Please wait a moment before requesting another code." },
          400,
        ),
    });
    show();
    await userEvent.type(screen.getByLabelText(/^Email\s*\*?$/), "jane@example.com{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Please wait a moment");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  describe("a Xero login with no Minty account", () => {
    const DETAILS = {
      status: "success",
      email: "nia@example.com",
      first_name: "Nia",
      last_name: "New",
    };
    const HANDOFF = `${env.ACCOUNTS_API_URL}/auth/email/handoff?h=abc`;

    const agreeToTerms = async () => {
      await userEvent.click(screen.getByRole("checkbox"));
      const agreeBox = await screen.findByRole("checkbox", { name: /I have read and agree/ });
      await waitFor(() => expect(agreeBox).toBeEnabled());
      await userEvent.click(agreeBox);
      await userEvent.click(screen.getByRole("button", { name: "Accept & Continue" }));
      await waitFor(() => expect(screen.getByRole("checkbox")).toBeChecked());
    };

    it("asks first, then Continue is the sign-up form with Xero's address fixed - no code", async () => {
      const navigate = vi.fn<(url: string) => void>();
      _resetHandoffForTests(navigate);
      flask({
        "/auth/xero/signup-details": () => json(DETAILS),
        "/legal/current": () => json(TERMS_LIVE),
        "/api/legal/terms/beta-1": () => json(TERMS_DOC),
        "/auth/xero/signup": () =>
          json({ status: "success", action: "login", redirect_url: HANDOFF }),
      });
      show("xero_signup=signed-key");

      const dialog = await screen.findByRole("dialog", { name: LOGIN_COPY.notSignedUpTitle });
      expect(dialog).toHaveTextContent("nia@example.com");
      expect(dialog).toHaveTextContent(LOGIN_COPY.notSignedUpBody);
      expect(calls("/auth/xero/signup-details")).toEqual([{ key: "signed-key" }]);
      await userEvent.click(screen.getByRole("button", { name: "Continue" }));

      expect(screen.getByRole("heading", { name: LOGIN_COPY.signupTitle })).toBeInTheDocument();
      expect(screen.getByLabelText(/^First name\s*\*?$/)).toHaveValue("Nia");
      expect(screen.getByLabelText(/^Last name\s*\*?$/)).toHaveValue("New");
      const email = screen.getByLabelText(/^Email\s*\*?$/);
      expect(email).toHaveValue("nia@example.com");
      expect(email).toHaveAttribute("readonly");
      expect(screen.queryByRole("link", { name: /Log in with Xero/ })).toBeNull();
      const create = screen.getByRole("button", { name: LOGIN_COPY.createAccount });
      expect(create).toBeDisabled(); // the Terms are owed

      await agreeToTerms();
      await userEvent.clear(screen.getByLabelText(/^Last name\s*\*?$/));
      await userEvent.type(screen.getByLabelText(/^Last name\s*\*?$/), "Newer");
      await userEvent.click(create);

      await waitFor(() => expect(calls("/auth/xero/signup")).toHaveLength(1));
      expect(calls("/auth/xero/signup")).toEqual([
        {
          key: "signed-key",
          first_name: "Nia",
          last_name: "Newer",
          terms_accepted: true,
          terms_version: "beta-1",
        },
      ]);
      expect(calls("/auth/email/request-code")).toEqual([]); // no code: Xero proved the address
      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith(
          `${HANDOFF}&return_origin=${encodeURIComponent(window.location.origin)}`,
        ),
      );
      _resetHandoffForTests();
    });

    it("Cancel drops the held Xero login and leaves the log-in page as it was", async () => {
      flask({
        "/auth/xero/signup-details": () => json(DETAILS),
        "/auth/xero/signup-cancel": () => json({ status: "success" }),
      });
      show("xero_signup=signed-key");

      await screen.findByRole("dialog", { name: LOGIN_COPY.notSignedUpTitle });
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).toBeNull();
      await waitFor(() =>
        expect(calls("/auth/xero/signup-cancel")).toEqual([{ key: "signed-key" }]),
      );
      expect(screen.getByRole("heading", { name: LOGIN_COPY.loginTitle })).toBeInTheDocument();
      expect(screen.getByLabelText(/^Email\s*\*?$/)).toHaveValue("");
    });

    it("a held login that timed out says so, with no question", async () => {
      flask({
        "/auth/xero/signup-details": () =>
          json(
            {
              status: "error",
              message: "That Xero sign-in has timed out. Log in with Xero again to continue.",
            },
            410,
          ),
      });
      show("xero_signup=old-key");

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That Xero sign-in has timed out.",
      );
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("the key leaves the address bar at once", () => {
      flask({ "/auth/xero/signup-details": () => json(DETAILS) });
      window.history.replaceState({}, "", "/login?xero_signup=signed-key");
      show("xero_signup=signed-key");
      expect(window.location.search).toBe("");
    });
  });

  it("signs up: names, then the Terms - the box opens the document and only agreeing ticks it", async () => {
    flask({
      "/legal/current": () => json(TERMS_LIVE),
      "/api/legal/terms/beta-1": () => json(TERMS_DOC),
      "/auth/email/request-code": () => json({ status: "success" }),
    });
    show("", { signup: true });

    expect(screen.getByRole("heading", { name: LOGIN_COPY.signupTitle })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^First name\s*\*?$/), "Jane");
    await userEvent.type(screen.getByLabelText(/^Last name\s*\*?$/), "Doe");
    await userEvent.type(screen.getByLabelText(/^Email\s*\*?$/), "jane@example.com");
    const send = screen.getByRole("button", { name: LOGIN_COPY.sendSignup });
    expect(send).toBeDisabled(); // the Terms are owed

    const box = screen.getByRole("checkbox");
    await userEvent.click(box);
    // Clicking opened the document instead of ticking.
    expect(box).not.toBeChecked();
    const dialog = await screen.findByRole("dialog", { name: "Terms & Conditions" });
    expect(dialog).toHaveTextContent("The Terms.");
    // a short document has nothing to scroll: the panel's own box unlocks at once
    const agreeBox = await screen.findByRole("checkbox", { name: /I have read and agree/ });
    await waitFor(() => expect(agreeBox).toBeEnabled());
    await userEvent.click(agreeBox);
    await userEvent.click(screen.getByRole("button", { name: "Accept & Continue" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("checkbox")).toBeChecked();
    await userEvent.click(send);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login/confirm"));
    // sign-up asks without log-in mode: the address is new
    expect(calls("/auth/email/request-code")).toEqual([{ email: "jane@example.com" }]);
    expect(readConfirmContext()).toMatchObject({
      login: false,
      firstName: "Jane",
      lastName: "Doe",
      termsAccepted: true,
      termsVersion: "beta-1",
    });
  });

  it("an invitation fixes the address, and skips the Terms when Flask says they were agreed", async () => {
    flask({
      "/legal/invite-terms-status": () => json({ terms_required: false }),
      "/auth/email/request-code": () => json({ status: "success" }),
    });
    window.history.replaceState({}, "", "/login?invite=secret&email=ivy%40example.com");
    show("invite=secret&email=ivy%40example.com&fn=Ivy&ln=Lee");

    // the secret leaves the address bar at once
    expect(window.location.search).toBe("");
    expect(screen.getByRole("status")).toHaveTextContent(
      "This invitation was sent to ivy@example.com",
    );
    expect(screen.getByLabelText(/^Email\s*\*?$/)).toHaveAttribute("readonly");
    await waitFor(() => expect(screen.queryByRole("checkbox")).toBeNull());
    expect(calls("/legal/invite-terms-status")).toEqual([{ invite: "secret" }]);

    await userEvent.click(screen.getByRole("button", { name: LOGIN_COPY.sendLogin }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(calls("/auth/email/request-code")).toEqual([
      { email: "ivy@example.com", invite: "secret" },
    ]);
    expect(readConfirmContext()).toMatchObject({
      invite: "secret",
      firstName: "Ivy",
      lastName: "Lee",
      login: false,
    });
  });

  it("keeps the Terms box when Flask cannot say whether an invitee agreed - and says so in the console", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    flask({ "/legal/invite-terms-status": () => json({ error: "boom" }, 500) });
    show("invite=secret&email=ivy%40example.com");

    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    error.mockRestore();
  });

  it("Xero is a navigation to Flask that keeps the invitation and next", async () => {
    flask({ "/legal/invite-terms-status": () => json({ terms_required: true }) });
    show("invite=secret&email=ivy%40example.com&next=%2Fentity");

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Log in with Xero/ })).toHaveAttribute(
        "href",
        `${env.ACCOUNTS_API_URL}/xero_auth?invite=secret&next=%2Fentity&return_origin=${encodeURIComponent(window.location.origin)}`,
      ),
    );
  });

  // The server cannot know the browser's origin, so the first render - the server's HTML and the
  // browser's hydration alike - must not name one: naming it during render made React report a
  // mismatch it never patches, and the link kept the server's address (2026-10-20).
  it("Xero's first render names no origin, so the server's HTML and hydration agree", () => {
    const html = renderToString(
      <ToastProvider>
        <LoginScreen
          arrival={readArrival(new URLSearchParams("invite=secret&email=ivy%40example.com"), {})}
        />
      </ToastProvider>,
    );
    const href = /href="([^"]*xero_auth[^"]*)"/.exec(html)?.[1].replace(/&amp;/g, "&");
    expect(href).toBe(`${env.ACCOUNTS_API_URL}/xero_auth?invite=secret`);
  });

  it("shows what Flask flashed on the way here", async () => {
    flask({
      "/auth/notices": () =>
        json({ notices: [{ category: "info", message: "Please log in to access this page." }] }),
    });
    show("flash=signed.value");

    expect(await screen.findByText("Please log in to access this page.")).toBeInTheDocument();
  });

  it("refuses a next that leaves the site", () => {
    expect(readArrival(new URLSearchParams("next=%2F%2Fevil.example")).next).toBe("");
    expect(readArrival(new URLSearchParams("next=https%3A%2F%2Fevil.example")).next).toBe("");
    expect(readArrival(new URLSearchParams("next=%2Fentities")).next).toBe("/entities");
  });

  it("opens with 'Your session has expired' after accounts-api's door met an ended sign-in", async () => {
    show("expired=1&next=%2Fentity");
    const dialog = screen.getByRole("alertdialog", { name: "Your session has expired" });
    expect(dialog).toHaveTextContent("Sign in again to carry on.");
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("says nothing about an expired session on an ordinary visit", () => {
    show("next=%2Fentity");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
