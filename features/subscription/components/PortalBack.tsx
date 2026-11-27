"use client";

/**
 * The portal's way back - "‹ Back", every app's header back (`HeaderBack`, 2026-11-27); named
 * "Back to the previous page" on 04-A and 08-B - lives in the header bar (the user, 2026-09-29: no more "‹ Entity List"), at its left edge as
 * in every app (2026-11-27). The header belongs to the layout and the line to the
 * page, so the layout owns an empty slot in the header and each page portals its line into it.
 * A page with no line of its own leaves the slot empty: every such page has its own way out in
 * its body (Go Back, Cancel, Back to Manage Subscriptions).
 *
 * Rendered outside `PortalBackProvider` (a screen's own tests), the line stays where it is.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Slot = { el: HTMLElement | null; setEl: (el: HTMLElement | null) => void };

const SlotContext = createContext<Slot | null>(null);

export function PortalBackProvider({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  return <SlotContext.Provider value={{ el, setEl }}>{children}</SlotContext.Provider>;
}

/**
 * The header's slot, at the header row's left edge like every app's "‹ Back" (the user,
 * 2026-11-27; it used to be padded in `cqw` to line up with the teal banner).
 */
export function PortalBackSlot() {
  const slot = useContext(SlotContext);
  return <div ref={slot?.setEl} className="flex min-w-0 items-center" />;
}

export function PortalBack({ children }: { children: ReactNode }) {
  const slot = useContext(SlotContext);
  if (!slot) return <div className="self-start">{children}</div>;
  // Null only for the first commit: the slot's ref lands in that same commit and re-renders us.
  return slot.el ? createPortal(children, slot.el) : null;
}
