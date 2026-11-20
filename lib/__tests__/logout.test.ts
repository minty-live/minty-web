// An explicit sign-out takes this person's auto-saved drafts with it (the owner's decisions doc
// L1), BEFORE the token goes - and only theirs; the 401 / session-expired paths keep them (the
// drafts exist to survive the 60-minute sign-out).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { draftKey } from "@minty/shared/drafts";

import { getAuth, setAuth } from "@/lib/auth";

const order: string[] = [];

vi.mock("@/lib/handoff", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/handoff")>();
  return { ...real, postNavigate: vi.fn(() => order.push("navigate")) };
});

vi.mock("@minty/shared/drafts", async (importOriginal) => {
  const real = await importOriginal<typeof import("@minty/shared/drafts")>();
  return {
    ...real,
    clearDraftsForUser: vi.fn((userId: string, timeoutMs?: number) => {
      // the token is still there when the drafts go
      order.push(getAuth() ? "drafts (signed in)" : "drafts (signed out)");
      return real.clearDraftsForUser(userId, timeoutMs);
    }),
  };
});

const token = (userId: string) => `h.${btoa(JSON.stringify({ user_id: userId }))}.s`;
const keep = (userId: string) => {
  const key = draftKey({ userId, entityId: "e1" }, "settings.details", "-");
  localStorage.setItem(key, JSON.stringify({ v: 1, userId, savedAt: Date.now() }));
  return key;
};

beforeEach(() => {
  order.length = 0;
  localStorage.clear();
});
afterEach(() => localStorage.clear());

describe("logOut", () => {
  it("removes the person's drafts before clearing the token, then signs out at Minty", async () => {
    const mine = keep("u1");
    const theirs = keep("u2");
    setAuth(token("u1"), "e1", "Olive Shop");
    const { logOut } = await import("@/lib/logout");

    await logOut();

    expect(order).toEqual(["drafts (signed in)", "navigate"]);
    expect(localStorage.getItem(mine)).toBeNull();
    expect(localStorage.getItem(theirs)).not.toBeNull();
    expect(getAuth()).toBeNull();
  });

  it("with no person in the token, still signs out", async () => {
    setAuth("not-a-token", "e1", "Olive Shop");
    const { logOut } = await import("@/lib/logout");
    await logOut();
    expect(order).toEqual(["navigate"]);
    expect(getAuth()).toBeNull();
  });

  it("an ended session (the 401 path) keeps the drafts", async () => {
    const mine = keep("u1");
    setAuth(token("u1"), "e1", "Olive Shop");
    const { sessionExpired } = await import("@/lib/handoff");
    const { _resetSessionExpiredForTests } = await import("@/lib/sessionExpired");
    _resetSessionExpiredForTests(() => undefined);

    sessionExpired("e1");

    expect(getAuth()).toBeNull();
    expect(localStorage.getItem(mine)).not.toBeNull();
    _resetSessionExpiredForTests();
  });
});
