// "Your session has expired" (owner, 2026-11-19): a 401 whose body says `reason: session_expired`
// (the hub sign-in behind the token has ended - 60 minutes without activity, or signed out) goes
// through ONE call, `showSessionExpired(loginUrl)`, once however many calls fail together: the
// hub's sign-in page with `next` = the re-hand-off back to the page the person was on. Any other
// 401 still renews the token quietly.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch, mintyFetch } from "@/lib/apiClient";
import { getAuth, setAuth } from "@/lib/auth";
import { _resetHandoffForTests, sessionExpiredLoginUrl } from "@/lib/handoff";
import { _resetSessionExpiredForTests, isSessionExpired } from "@/lib/sessionExpired";

const TOKEN = "h.eyJ1c2VyX2lkIjoidTEifQ.s";
const fetchMock = vi.fn<typeof fetch>();
const handoff = vi.fn<(url: string) => void>();
const expired = vi.fn<(url: string) => void>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("a 401 whose sign-in has ended", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    _resetHandoffForTests(handoff);
    _resetSessionExpiredForTests(expired);
    setAuth(TOKEN, "e1", "Olive Shop");
    window.history.replaceState({}, "", "/entity/e1/settings/users?tab=2");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    handoff.mockReset();
    expired.mockReset();
    _resetHandoffForTests();
    _resetSessionExpiredForTests();
  });

  it("reads the reason off a 401's body", () => {
    expect(isSessionExpired({ error: "Unauthorized", reason: "session_expired" })).toBe(true);
    expect(isSessionExpired({ detail: "Unauthorized", reason: "session_expired" })).toBe(true);
    expect(isSessionExpired({ error: "Unauthorized" })).toBe(false);
    expect(isSessionExpired(null)).toBe(false);
    expect(isSessionExpired("session_expired")).toBe(false);
  });

  it("says so once for calls failing together, with the way back to this page", async () => {
    fetchMock.mockImplementation(async () =>
      answer(401, { error: "Unauthorized", reason: "session_expired" }),
    );

    const results = await Promise.allSettled([
      apiFetch("/api/me/subscriptions"),
      mintyFetch("/api/me/profile"),
      mintyFetch("/api/me/terms", { onUnauthorized: "reject" }),
    ]);

    expect(results.every((r) => r.status === "rejected" && r.reason instanceof ApiError)).toBe(
      true,
    );
    expect(handoff).not.toHaveBeenCalled(); // no quiet re-hand-off
    expect(expired).toHaveBeenCalledTimes(1);
    const target = new URL(expired.mock.calls[0][0], window.location.origin);
    expect(target.origin + target.pathname).toBe(window.location.origin + "/login");
    const back = new URL(target.searchParams.get("next") ?? "", "http://accounts.test");
    expect(back.pathname).toBe("/handoff/minty-web");
    expect(back.searchParams.get("next")).toBe("/entity/e1/settings/users?tab=2");
    expect(back.searchParams.get("entity_id")).toBe("e1");
    expect(getAuth()).toBeNull();
  });

  it("a 401 without the reason still renews quietly", async () => {
    fetchMock.mockResolvedValueOnce(answer(401, { error: "Unauthorized" }));

    await expect(apiFetch("/api/me/subscriptions")).rejects.toBeInstanceOf(ApiError);

    expect(expired).not.toHaveBeenCalled();
    expect(handoff).toHaveBeenCalledTimes(1);
    expect(new URL(handoff.mock.calls[0][0]).pathname).toBe("/handoff/minty-web");
  });

  it("the sign-in page's next is a path on accounts-api", () => {
    const url = new URL(sessionExpiredLoginUrl(), window.location.origin);
    expect(url.searchParams.get("next")?.startsWith("/handoff/minty-web?")).toBe(true);
  });
});
