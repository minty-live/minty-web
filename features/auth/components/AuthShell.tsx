/**
 * The sign-in screens' frame: the bar with the Minty mark (as the hub's other pages draw it - no
 * initials and no menu, there is nobody signed in yet) over one narrow column. The look is the
 * sign-in page Flask and minty-onboarding-web drew until phase 2.
 */

import Image from "next/image";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/ui/Wordmark";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh min-w-0 flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-border-default bg-white pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex h-16 w-full max-w-[1920px] items-center gap-2 px-4 sm:h-18 sm:px-6">
          <Image
            src="/minty-mark.png"
            alt=""
            width={40}
            height={40}
            priority
            unoptimized
            className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10"
          />
          <Wordmark className="text-lg text-ink" />
        </div>
      </header>
      <main className="flex flex-1 justify-center px-4 pb-12 pt-6">
        <div className="flex w-full min-w-0 max-w-[380px] flex-col gap-6 pt-6">{children}</div>
      </main>
    </div>
  );
}

export function AuthHeading({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="text-center">
      <h1 className="text-[26px] font-bold leading-tight text-ink">{title}</h1>
      <p className="mt-1.5 text-[15px] text-ink-soft">{lead}</p>
    </div>
  );
}

/** The form's classes, one set for both screens.
 *
 * Floating labels (owner, 2026-11-18): an empty field shows its label inside, where a placeholder
 * would be; clicked or filled, the label moves onto the box's top border, at its upper left
 * (a white backing cuts the line). The label is a real <label>
 * placed AFTER its input (it is the input's `peer`), so the input needs `placeholder=" "` for
 * `:placeholder-shown` to tell empty from filled. No field shows a hint of its own. */
export const AUTH_FIELD = "relative";
export const AUTH_INPUT =
  "peer block h-12 w-full rounded-lg border border-border-input bg-white px-4 text-[15px] text-ink placeholder:text-transparent focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/30 read-only:bg-surface-sunk";
export const AUTH_LABEL =
  "pointer-events-none absolute left-3 top-0 -translate-y-1/2 bg-white px-1 text-xs font-semibold text-ink transition-all duration-150 peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-[15px] peer-placeholder-shown:font-normal peer-placeholder-shown:text-text-muted peer-focus:top-0 peer-focus:text-xs peer-focus:font-semibold peer-focus:text-text-link";
export const AUTH_PRIMARY =
  "inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-action-primary px-5 text-[15px] font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed disabled:bg-action-disabled disabled:text-text-disabled";
export const AUTH_GHOST =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-border-default bg-white px-5 text-[15px] font-semibold text-ink transition-colors hover:bg-surface-sunk focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus";
export const AUTH_LINK = "font-semibold text-text-link underline underline-offset-2";
export const AUTH_ERROR = "text-center text-[13px] text-danger";
