// The "Give a grant" form's rules and the AI allowances mode's words (owner, 2026-11-18).

import { describe, expect, it } from "vitest";

import type { AiCompanyRow, AiGrant } from "@/features/entities/api/aiAllowances";
import {
  automaticGrants,
  canEnd,
  EMPTY_GRANT,
  endedLine,
  FIELD_MESSAGE,
  fieldProblems,
  GRANT_NAME,
  grantStatus,
  grantUse,
  rowAllowance,
  rowReads,
  submitProblems,
} from "@/features/entities/lib/aiGrant";

const row = (over: Partial<AiCompanyRow> = {}): AiCompanyRow => ({
  id: "e1",
  name: "Olive & Vine",
  percent_left: 75,
  blocked: false,
  tokens_used: 5000,
  tokens_given: 20000,
  has_grant: true,
  reads: 1,
  last_read_at: "2026-11-18T08:00:00Z",
  ...over,
});

const grant = (over: Partial<AiGrant> = {}): AiGrant => ({
  id: "g1",
  source: "manual",
  tokens_total: 20000,
  tokens_used: 5000,
  reads_total: null,
  reads_used: 1,
  expires_at: null,
  open: true,
  granted_by: "boss@test.com",
  note: null,
  created_at: "2026-11-18T08:00:00Z",
  ...over,
});

describe("the form's checks", () => {
  it("lets every field be empty while typing, and commas in numbers", () => {
    expect(fieldProblems(EMPTY_GRANT)).toEqual({});
    expect(fieldProblems({ ...EMPTY_GRANT, tokens: "50,000", days: "90" })).toEqual({});
  });

  it("says at once when a number can't be used, naming the allowed range", () => {
    expect(fieldProblems({ ...EMPTY_GRANT, tokens: "lots" })).toEqual({
      tokens: FIELD_MESSAGE.tokens,
    });
    expect(fieldProblems({ ...EMPTY_GRANT, tokens: "0" })).toEqual({
      tokens: FIELD_MESSAGE.tokens,
    });
    expect(fieldProblems({ ...EMPTY_GRANT, reads: "10.5" })).toEqual({
      reads: FIELD_MESSAGE.reads,
    });
    expect(fieldProblems({ ...EMPTY_GRANT, days: "3651" })).toEqual({ days: FIELD_MESSAGE.days });
    expect(fieldProblems({ ...EMPTY_GRANT, note: "x".repeat(256) })).toEqual({
      note: FIELD_MESSAGE.note,
    });
    expect(FIELD_MESSAGE.tokens).toBe("Enter the tokens as a whole number from 1 to 10,000,000.");
  });

  it("only a submit says the grant gives nothing", () => {
    expect(submitProblems(EMPTY_GRANT)).toEqual({ tokens: FIELD_MESSAGE.nothing });
    expect(submitProblems({ ...EMPTY_GRANT, reads: "10" })).toEqual({});
  });
});

describe("the mode's words", () => {
  it("a company row: what is left and its reads", () => {
    expect(rowAllowance(row())).toBe("75% left · 5,000 of 20,000 tokens used");
    expect(rowReads(row())).toBe("1 read · last 18 Nov 2026");
    expect(rowAllowance(row({ tokens_given: null, tokens_used: null, percent_left: 0 }))).toBe(
      "0% left",
    );
    expect(rowReads(row({ reads: 0, has_grant: false, last_read_at: null }))).toBe("No reads yet");
  });

  it("names each grant and says what a company gets by itself (the user, 2026-11-27)", () => {
    expect(GRANT_NAME).toEqual({
      trial: "AI trial",
      cycle: "Billing period",
      manual: "Grant",
      default: "Default grant",
    });
    const trial = { tokens: 280000, reads: null, days: 30 };
    expect(automaticGrants({ default_grant: trial, cycle_tokens: 280000 })).toBe(
      "It gets a 30-day AI trial of 280,000 tokens, then 280,000 tokens each billing period while it pays.",
    );
    expect(automaticGrants({ default_grant: trial, cycle_tokens: null })).toBe(
      "It gets a 30-day AI trial of 280,000 tokens.",
    );
    expect(automaticGrants({ default_grant: null, cycle_tokens: 280000 })).toBe(
      "It gets 280,000 tokens each billing period while it pays.",
    );
    expect(automaticGrants({ default_grant: null })).toBe(
      "It gets nothing automatically: give it a grant to let it read.",
    );
  });

  it("a grant: its use and its pill", () => {
    expect(grantUse(grant({ reads_total: 10 }))).toBe(
      "5,000 of 20,000 tokens used · 1 of 10 reads used",
    );
    expect(grantStatus(grant())).toBe("Open");
    expect(grantStatus(grant({ open: false }))).toBe("Used up");
    expect(grantStatus(grant({ open: false, expires_at: "2026-01-01T00:00:00Z" }))).toBe("Ended");
  });
});

describe("ending a grant (owner, 2026-11-20)", () => {
  const now = new Date("2026-11-20T10:00:00Z");

  it("an open or used-up grant can be ended; an ended or expired one can't", () => {
    expect(canEnd(grant(), now)).toBe(true);
    expect(canEnd(grant({ open: false }), now)).toBe(true); // used up
    expect(canEnd(grant({ ended_at: "2026-11-20T09:00:00Z", ended_by: "x@y.z" }), now)).toBe(false);
    expect(canEnd(grant({ open: false, expires_at: "2026-11-19T00:00:00Z" }), now)).toBe(false);
  });

  it("says when and who", () => {
    expect(endedLine(grant({ ended_at: "2026-11-20T09:00:00Z", ended_by: "boss@test.com" }))).toBe(
      "Ended 20 Nov 2026 by boss@test.com",
    );
    expect(endedLine(grant())).toBeNull();
  });
});
