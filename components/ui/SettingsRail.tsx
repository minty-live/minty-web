"use client";

/**
 * The settings side rail (the user, 2026-11-27; onboarding's sub-step menu's look): the tabs from
 * `lib/settingsTabs.ts` down the side, and under the open one the cards on its page, the one in
 * view marked. At every width:
 * - from `lg` it is a column beside the cards that stays in view as the page scrolls;
 * - below that a bar under the app's header names where the person is ("General · Contacts") and
 *   opens the same rail as a sheet.
 * Every tab is a plain link to this app's own page, so the leave guard sees each click. A section
 * is a button: it scrolls its card to the top (under the header) and moves focus there; the
 * address never changes.
 *
 * Every tab opens and closes to show its cards, so a card on another tab is one click away (the
 * user, 2026-11-27): another tab's cards are links to its page with the card's `#section-…`
 * (`SETTINGS_TAB_SECTIONS`), and the page goes to that card when it arrives.
 *
 * The open tab's sections are read from the page, not listed per tab: anything inside `content` marked
 * `data-settings-section="<its name>"` with an `id` (`SettingsCard` marks itself), so a card that
 * comes and goes (Invitations, the Modules result) comes and goes in the rail too.
 */

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";

import { Glyph } from "@/components/ui/Glyph";
import type { SettingsTab } from "@/lib/settingsTabs";

export type SettingsSection = { id: string; title: string };

const MARK = "data-settings-section";

/**
 * The marked sections inside `content`, kept current as the page draws; the one the person is in;
 * and `pick`, which makes a section the current one at once (a jump from the rail) and keeps it
 * until the person scrolls on their own.
 */
export function useSettingsSections(content: RefObject<HTMLElement | null>): {
  sections: SettingsSection[];
  current: string | null;
  pick: (id: string) => void;
} {
  const [sections, setSections] = useState<SettingsSection[]>([]);
  const [inView, setInView] = useState<string | null>(null);
  // A jump's own scroll must not move the mark: held from the pick until the scroll settles.
  const held = useRef(false);

  useEffect(() => {
    const root = content.current;
    if (!root) return;
    const read = () => {
      const found = [...root.querySelectorAll<HTMLElement>(`[${MARK}]`)]
        .filter((el) => el.id && el.getAttribute(MARK))
        .map((el) => ({ id: el.id, title: el.getAttribute(MARK) as string }));
      setSections((old) =>
        old.length === found.length &&
        old.every((s, i) => s.id === found[i].id && s.title === found[i].title)
          ? old
          : found,
      );
    };
    read();
    const watch = new MutationObserver(read);
    watch.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [MARK],
    });
    return () => watch.disconnect();
  }, [content]);

  useEffect(() => {
    if (sections.length === 0) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (held.current) return;
      const elements = sections
        .map((s) => document.getElementById(s.id))
        .filter((el): el is HTMLElement => el !== null);
      if (elements.length === 0) return;
      // The line under the header (and the phone's bar): the card that has reached it is the one
      // the person is in. Once the page can scroll no further, the last card on screen is.
      const line = (parseFloat(getComputedStyle(elements[0]).scrollMarginTop) || 0) + 8;
      const atEnd =
        window.scrollY > 0 &&
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let at: HTMLElement | undefined;
      // At the very top of the page the first card is the one, whatever sits where.
      if (window.scrollY > 0)
        for (const el of elements) {
          const top = el.getBoundingClientRect().top;
          if (top <= line || (atEnd && top < window.innerHeight - 40)) at = el;
        }
      setInView((at ?? elements[0]).id);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  const pick = useCallback((id: string) => {
    setInView(id);
    held.current = true;
    // Let go once the jump's scroll has stopped (or at once when nothing moves).
    let quiet = 0;
    const settle = () => {
      window.clearTimeout(quiet);
      quiet = window.setTimeout(() => {
        held.current = false;
        window.removeEventListener("scroll", settle);
      }, 200);
    };
    window.addEventListener("scroll", settle, { passive: true });
    settle();
  }, []);

  // Arriving from another tab's sub-topic (`…/general#section-contacts`): once that card is on the
  // page, go to it - once per address.
  const arrived = useRef<string | null>(null);
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash || arrived.current === hash || !sections.some((s) => s.id === hash)) return;
    arrived.current = hash;
    pick(hash);
    jumpTo(hash);
  }, [sections, pick]);

  const current =
    inView && sections.some((s) => s.id === inView) ? inView : (sections[0]?.id ?? null);
  return { sections, current, pick };
}

/** Scroll a section to the top under the header and give it focus, without moving the address. */
function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

const ITEM =
  "flex min-h-11 w-full min-w-0 items-center rounded-[12px] px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus";

export function SettingsRail({
  tabs,
  content,
}: {
  tabs: SettingsTab[];
  /** The element holding the tab's cards. */
  content: RefObject<HTMLElement | null>;
}) {
  const { sections, current, pick } = useSettingsSections(content);
  const [open, setOpen] = useState(false);
  const sheetId = useId();
  const whereId = useId();
  const bar = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const openTab = tabs.find((t) => t.current)?.label;
  // Which tabs show their cards: the open one to start with; each opens and closes on its own.
  const [shown, setShown] = useState<Set<string>>(() => new Set(openTab ? [openTab] : []));
  const toggle = (label: string) =>
    setShown((old) => {
      const next = new Set(old);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  const listId = useId();
  const openSection = sections.find((s) => s.id === current)?.title;

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) bar.current?.focus();
  }, []);

  // The sheet (below lg): focus moves in, Escape and the scrim close it, Tab stays inside.
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("button, a[href]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const stops = [...panel.current.querySelectorAll<HTMLElement>("button, a[href]")];
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Grown past the phone layout with the sheet open: nothing to close any more.
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia?.("(min-width: 1024px)");
    if (!wide) return;
    const onChange = () => wide.matches && setOpen(false);
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, [open]);

  return (
    <>
      <div className="sticky top-[var(--app-header-h)] z-30 -mx-4 bg-white px-4 py-1.5 shadow-[inset_0_-1px_0_var(--set-line)] sm:-mx-6 sm:px-6 lg:hidden">
        <button
          ref={bar}
          type="button"
          aria-expanded={open}
          aria-controls={sheetId}
          aria-label="Settings menu"
          aria-describedby={whereId}
          onClick={() => setOpen(true)}
          className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-[12px] px-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        >
          <Glyph name="menu_open" className="text-[22px] text-set-mute" />
          <span id={whereId} className="min-w-0 flex-1 truncate text-[15px]">
            <span className="font-semibold text-set-ink">{openTab}</span>
            {openSection ? <span className="text-set-ink-2"> · {openSection}</span> : null}
          </span>
          <Glyph name="expand_more" className="text-[22px] text-set-mute" />
        </button>
      </div>

      <div
        id={sheetId}
        className={
          open ? "fixed inset-0 z-[150] flex lg:static lg:z-auto lg:block" : "hidden lg:block"
        }
      >
        <button
          type="button"
          aria-label="Close the settings menu"
          tabIndex={-1}
          onClick={() => close()}
          className="absolute inset-0 cursor-default bg-overlay-scrim lg:hidden"
        />
        <div
          ref={panel}
          role={open ? "dialog" : undefined}
          aria-modal={open ? true : undefined}
          aria-label={open ? "Settings menu" : undefined}
          className="relative flex h-full w-full flex-col gap-2 overflow-y-auto bg-white px-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] sm:max-w-[360px] lg:sticky lg:top-[calc(var(--app-header-h)+1.5rem)] lg:h-auto lg:max-h-[calc(100dvh-var(--app-header-h)-3rem)] lg:max-w-none lg:p-0"
        >
          <div className="flex items-center justify-between gap-2 lg:hidden">
            <p className="text-lg font-bold text-set-ink">Settings</p>
            <button
              type="button"
              aria-label="Close"
              onClick={() => close()}
              className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] text-set-mute hover:bg-set-pill hover:text-set-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
            >
              <Glyph name="close" className="text-[24px]" />
            </button>
          </div>
          <nav aria-label="Settings sections" className="min-w-0">
            <ul className="flex flex-col gap-1">
              {tabs.map((tab, i) => {
                const expanded = shown.has(tab.label);
                const subId = `${listId}-${i}`;
                // The open tab lists the cards on the page; another tab its known cards, as links.
                const hasSubs = tab.current ? sections.length > 0 : tab.sections.length > 0;
                return (
                  <li key={tab.label} className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1">
                      {tab.current ? (
                        <span
                          aria-current="page"
                          className={`${ITEM} relative flex-1 text-[15px] font-bold text-set-ink before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[3px] before:rounded-full before:bg-set-tab`}
                        >
                          {tab.label}
                        </span>
                      ) : (
                        <a
                          href={tab.href}
                          className={`${ITEM} flex-1 text-[15px] font-semibold text-set-ink-2 hover:bg-set-pill hover:text-set-ink`}
                        >
                          {tab.label}
                        </a>
                      )}
                      {hasSubs ? (
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={subId}
                          aria-label={`${expanded ? "Hide" : "Show"} ${tab.label} topics`}
                          onClick={() => toggle(tab.label)}
                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-set-mute hover:bg-set-pill hover:text-set-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                        >
                          <Glyph
                            name="expand_more"
                            className={`text-[22px] transition-transform duration-200 motion-reduce:transition-none ${expanded ? "" : "-rotate-90"}`}
                          />
                        </button>
                      ) : null}
                    </div>
                    {hasSubs && expanded ? (
                      <ul
                        id={subId}
                        aria-label={`On ${tab.label}`}
                        className="my-1 ml-4 flex flex-col gap-0.5 border-l border-set-line pl-2"
                      >
                        {tab.current
                          ? sections.map((s) => (
                              <li key={s.id} className="min-w-0">
                                <button
                                  type="button"
                                  aria-current={s.id === current ? "location" : undefined}
                                  onClick={() => {
                                    close(false);
                                    pick(s.id);
                                    jumpTo(s.id);
                                  }}
                                  className={`${ITEM} text-sm ${
                                    s.id === current
                                      ? "font-semibold text-set-tab-ink"
                                      : "font-medium text-set-ink-2 hover:bg-set-pill hover:text-set-ink"
                                  }`}
                                >
                                  <span className="min-w-0 break-words">{s.title}</span>
                                </button>
                              </li>
                            ))
                          : tab.sections.map((s) => (
                              <li key={s.href} className="min-w-0">
                                <a
                                  href={s.href}
                                  className={`${ITEM} text-sm font-medium text-set-ink-2 hover:bg-set-pill hover:text-set-ink`}
                                >
                                  <span className="min-w-0 break-words">{s.title}</span>
                                </a>
                              </li>
                            ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </>
  );
}
