/**
 * The settings tabs' fields (Figma SET-G, 2026-11-10): radius 12, the frames' edge, 14.5px text,
 * at least 44px high; the teal edge on focus, as onboarding's fields. A refused field keeps the sheets' red border and
 * message (`components/ui/sheetClasses.ts`), so colour is never the only signal.
 */

export { SHEET_FIELD_ERROR as SETTINGS_FIELD_ERROR } from "@/components/ui/sheetClasses";
import { SHEET_INPUT_BAD } from "@/components/ui/sheetClasses";

export { SHEET_INPUT_BAD as SETTINGS_INPUT_BAD };

export const SETTINGS_INPUT =
  "block min-h-11 w-full rounded-[12px] border bg-white px-3.5 py-3 text-[14.5px] text-set-ink transition-[border-color,box-shadow] duration-150 focus:!outline-none disabled:cursor-not-allowed disabled:bg-set-pill";
/**
 * Focus is the teal edge alone - no glow and no ring outside it - as onboarding's `.field
 * input:focus` (the user, 2026-11-27). The ring is the app's unlayered `:focus-visible` rule
 * (app/globals.css), which only an important utility (`focus:!outline-none`, on SETTINGS_INPUT)
 * beats; the teal edge is the focus signal in its place.
 */
export const SETTINGS_INPUT_OK = "border-border-input focus:border-border-focus";
export const SETTINGS_LABEL = "mb-1.5 block text-[13px] font-semibold text-set-ink";

/** A field's own problem as it is typed: the red edge (`SETTINGS_INPUT_BAD`) or the usual one. */
export function settingsInputClass(invalid: boolean): string {
  return `${SETTINGS_INPUT} ${invalid ? SHEET_INPUT_BAD : SETTINGS_INPUT_OK}`;
}
