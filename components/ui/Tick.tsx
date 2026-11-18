"use client";

import { useEffect, useRef } from "react";

/**
 * The Settings tick box: the Minty Action fill with a white tick when on, a white bar when some
 * are on (indeterminate). One look for every tick list in the hub's Settings (Petty Cash and
 * Payment account codes).
 */
export function Tick({
  checked,
  indeterminate = false,
  disabled,
  label,
  busy,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled: boolean;
  label?: string;
  busy?: boolean;
  onChange: (on: boolean) => void;
}) {
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (box.current) box.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const GLYPH =
    "pointer-events-none absolute inset-0 m-auto hidden h-3.5 w-3.5 fill-white peer-disabled:opacity-40";
  return (
    <span className="relative inline-flex h-5 w-5 shrink-0">
      <input
        ref={box}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        aria-busy={busy || undefined}
        onChange={(e) => onChange(e.target.checked)}
        className="peer m-0 h-5 w-5 cursor-pointer appearance-none rounded-[6px] border border-border-input bg-white checked:border-action-tick checked:bg-action-tick indeterminate:border-action-tick indeterminate:bg-action-tick focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-40"
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`${GLYPH} ${indeterminate ? "" : "peer-checked:block"}`}
      >
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
      </svg>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`${GLYPH} ${indeterminate ? "block" : ""}`}
      >
        <path d="M6 11h12v2H6z" />
      </svg>
    </span>
  );
}
