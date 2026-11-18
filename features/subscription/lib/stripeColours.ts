/**
 * The Minty colour roles (@minty/shared/colors.css, main's palette), as LITERAL values for Stripe's Elements
 * appearance: Stripe draws its fields in a cross-origin iframe that cannot read our CSS
 * variables, so this is the one place in the app a role is written as a hex. Keep it equal to
 * colors.css's Light values; __tests__/no_raw_colours.test.ts allows this file and no other.
 */
export const STRIPE_COLOURS = {
  textPrimary: "#16202e", // --color-text-primary
  textSecondary: "#6b7380", // --color-text-secondary
  textMuted: "#8b93a0", // --color-text-muted
  borderInput: "#d8dee4", // --color-border-input
  borderFocus: "#54d3da", // --color-border-focus
  actionPrimary: "#4fc7c7", // --color-action-primary
  dangerInk: "#b42318", // --color-status-danger-ink
  /** border-focus at 18%: the focus glow the sheet's own inputs draw. */
  focusGlow: "rgba(84, 211, 218, 0.18)",
} as const;
