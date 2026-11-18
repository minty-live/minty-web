// Part 13 V-01, one palette for every Minty app (owner, 2026-11-18): screens bind to the
// @minty/shared/colors.css roles (bg-action-primary, text-text-secondary, border-border-input,
// bg-status-danger-bg ... or var(--color-...) in CSS), never a hex, never a Tailwind palette
// colour and never the pre-Part 13 aliases. This guard fails on any that creeps back into the
// source. It reads the files as text - so it catches a class string wherever it is built - and
// skips comments. (minty-petty-cash-web's __tests__/no_raw_colours.test.ts, the same guard.)
//
// Exceptions are listed by file and reason; add one only with the reason beside it.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const DIRS = ["app", "components", "features", "lib"];

/** Folders that are not screens, or not ours to recolour. */
const SKIP_DIRS = new Set(["__tests__", "__fixtures__", "e2e", "node_modules"]);
/** No path is skipped any more: the hand-off landing draws in the tokens too (owner, 2026-11-18). */
const SKIP_PATHS: string[] = [];

/** file (posix, from the repo root) -> what is allowed there, and why. */
const ALLOWED: Record<string, { pattern: RegExp; why: string }> = {
  "features/subscription/components/CardBrand.tsx": {
    pattern: /^#[0-9a-fA-F]{3,8}$/,
    why: "the card networks' own brand colours (Visa, Mastercard ...), not Minty's",
  },
  "features/subscription/lib/stripeColours.ts": {
    pattern: /^#[0-9a-fA-F]{3,8}$/,
    why: "the roles as literal values for Stripe's cross-origin iframe, which cannot read CSS variables",
  },
};

const PALETTE =
  "gray|red|amber|rose|sky|orange|stone|emerald|green|blue|yellow|slate|zinc|neutral|teal|cyan|indigo|purple|pink|lime|violet|fuchsia";
const UTIL =
  "bg|text|border|ring|from|to|via|outline|fill|stroke|decoration|divide|placeholder|accent|caret|shadow";
const RAW = new RegExp(
  [
    String.raw`#[0-9a-fA-F]{3,8}\b`,
    String.raw`(?<![\w-])(?:[a-z-]+:)*(?:${UTIL})(?:-[trblxy])?-(?:${PALETTE})(?:-\d{2,3})?(?:\/\d+)?\b`,
    // black is text-text-primary (white stays: it is surface-card and action-on-primary)
    String.raw`(?<![\w-])(?:[a-z-]+:)*(?:${UTIL})-black\b`,
    // the pre-Part 13 aliases: `--primary` grey, `--secondary` brand teal used as a fill, the
    // old link teal and the orange accent
    String.raw`(?<![\w-])(?:[a-z-]+:)*(?:${UTIL})-(?:primary|secondary|teal-strong|accent)(?:\/\d+)?(?![\w-])`,
  ].join("|"),
  "g",
);

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      out.push(...sources(p));
    } else if (/\.(ts|tsx|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function stripComments(text: string): string {
  // a block comment keeps its line breaks, so the line numbers reported stay the file's own
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ""))
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/**
 * globals.css: its `prefers-color-scheme: dark` block still holds the skeleton's dark hexes - out
 * of scope until screens get Dark (D-24: launch is Light). Everything else in it is an alias.
 */
function withoutDarkBlock(text: string): string {
  return text.replace(/@media \(prefers-color-scheme: dark\) \{[\s\S]*?\n\}/, "");
}

describe("the guard itself", () => {
  it.each([
    'className="bg-[#54D3DA]"',
    'className="text-gray-700"',
    'className="hover:bg-red-50"',
    'className="border-t-gray-200"',
    'className="bg-secondary/10"',
    'className="text-primary"',
    'className="text-black"',
    'className="text-teal-strong"',
    "const TEAL = '#54d3da';",
    "color: #6b7280;",
  ])("catches %s", (sample) => {
    expect(sample.match(RAW)).not.toBeNull();
  });

  it.each([
    'className="bg-action-primary text-action-on-primary"',
    'className="text-text-primary"',
    'className="bg-status-info-bg"',
    'className="border-action-secondary-border text-action-secondary-text"',
    'className="bg-accent-avatar-bg text-accent-avatar-ink"',
    'className="accent-action-primary bg-white text-white"',
    "color: var(--color-text-link);",
  ])("lets the token %s through", (sample) => {
    expect(sample.match(RAW)).toBeNull();
  });
});

describe("Part 13 V-01: no raw colours in the source", () => {
  it("binds every colour to a @minty/shared/colors.css role", () => {
    const offences: string[] = [];
    for (const dir of DIRS) {
      for (const file of sources(join(ROOT, dir))) {
        const rel = relative(ROOT, file).split(sep).join("/");
        if (SKIP_PATHS.some((p) => rel.startsWith(p))) continue;
        let text = stripComments(readFileSync(file, "utf8"));
        if (rel === "app/globals.css") text = withoutDarkBlock(text);
        for (const match of text.matchAll(RAW)) {
          if (ALLOWED[rel]?.pattern.test(match[0])) continue;
          const line = text.slice(0, match.index).split("\n").length;
          offences.push(`${rel}:${line}  ${match[0]}`);
        }
      }
    }
    expect(
      offences,
      `raw colours (use a @minty/shared/colors.css role):\n${offences.join("\n")}`,
    ).toEqual([]);
  });

  it("globals.css takes the roles from @minty/shared", () => {
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
    expect(css).toContain('@import "@minty/shared/colors.css";');
  });
});
