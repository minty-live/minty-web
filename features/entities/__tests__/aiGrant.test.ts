// The "Give a grant" form's rules and the AI allowances mode's words (owner, 2026-11-18).

import { describe, expect, it } from "vitest";

import type { AiCompanyRow, AiGrant } from "@/features/entities/api/aiAllowances";
import {
  EMPTY_GRANT,
  FIELD_MESSAGE,
  fieldProblems,
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
    expect(rowReads(row({ reads: 0, has_grant: false, last_read_at: null }))).toBe(
      "No reads yet · gets the default grant on its first read",
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
