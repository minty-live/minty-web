/**
 * Petty Cash Settings' rules - the cards that need no Xero: the Electronic / Delivery sales
 * methods. Moved into the hub from minty-petty-cash-web's `lib/settings.ts` (owner, 2026-11-10),
 * which ported them from Flask's ORIGINAL `entity/settings_entity.html` and
 * `static/js/petty_cash_settings.js` (Minty `1c25b35^1`). What it reads and writes is
 * minty-petty-cash-api's `routes/settings.py` (`GET /settings`, `/sales-methods...`). The Xero
 * mapping and account codes are `xeroSettings.ts`'s. The country and currency are not set here:
 * the General tab is their one place.
 *
 * Left behind in the Petty Cash app: its own address for the page and its links to the other
 * settings tabs - every tab is this app's page now (`lib/settingsTabs.ts`).
 */

export type MethodType = "electronic" | "delivery";
export const METHOD_TYPES: readonly MethodType[] = ["electronic", "delivery"];

/** `own`: the company typed it, so it may rename and delete it; Minty's methods (`own: false`)
 * only come off its list (owner, 2026-11-12). */
export type SalesMethod = { id: string; name: string; value_name: string; own: boolean };
export type CatalogueMethod = { id: string; name: string };

export type SettingsPermissions = {
  /** The Xero cards' saves (the API's `XERO_RIGHTS`). */
  edit_xero: boolean;
  view_sales_methods: boolean;
  add_sales_method: boolean;
  rename_sales_method: boolean;
  remove_sales_method: boolean;
  reorder_sales_methods: boolean;
  /** The sales accounts card (2026-11-17); absent from an older API: not this person's. */
  edit_sales_accounts?: boolean;
};

/** Sales - Cash, Sales - Electronic Payment, Sales - Delivery on or off (owner, 2026-11-17): which
 * parts the daily report asks for (the API's `sales_parts`; onboarding's sales accounts screen). */
export type SalesParts = { cash: boolean; electronic: boolean; delivery: boolean };
export type SalesPart = keyof SalesParts;
export const SALES_PARTS: readonly SalesPart[] = ["cash", "electronic", "delivery"];

/** Each account's words, as onboarding's screen says them (Figma 464:73 rows 1 and 4). */
export const SALES_ACCOUNT: Record<
  SalesPart,
  { name: string; body: string; part: string; icon: string; kept: string }
> = {
  cash: {
    name: "Sales - Cash",
    body: "Notes and coins taken at the counter.",
    part: "Cash Sales",
    icon: "payments",
    kept: "Your daily report stops asking for cash sales. Past reports keep their cash sales.",
  },
  electronic: {
    name: "Sales - Electronic Payment",
    body: "Cards, wallets and transfers — Visa, Alipay, FPS…",
    part: "Electronic Payments",
    icon: "credit_card",
    kept: "Its methods leave your daily report and come back if you turn it on again. Past reports keep their electronic payments.",
  },
  delivery: {
    name: "Sales - Delivery",
    body: "Orders through delivery apps — Foodpanda, Keeta…",
    part: "Delivery Sales",
    icon: "local_shipping",
    kept: "Its methods leave your daily report and come back if you turn it on again. Past reports keep their delivery sales.",
  },
};
export const NO_SALES_ACCOUNT = "No sales account is ticked yet. Tick at least one to continue.";

/**
 * How the methods are grouped (owner, 2026-11-11; the API's `sales_groups`, from the business type):
 * one Non-cash card for a retail shop, a service or a general business - its methods are stored as
 * electronic - and Electronic and Delivery for Restaurant & Food and a company from before
 * onboarding asked. An answer without it is the second.
 */
export type SalesGroups = "non_cash" | "electronic_delivery";

export type SettingsRead = {
  sales_methods: Record<MethodType, SalesMethod[]>;
  sales_groups?: SalesGroups;
  /** Absent from an older API: every card shows, as before. */
  sales_parts?: SalesParts;
  available: Record<MethodType, CatalogueMethod[]>;
  xero_connected: boolean;
  permissions: SettingsPermissions;
};

/** Every write answers the whole read again, with the sentence to show. */
export type SettingsAnswer = SettingsRead & { message: string };

/**
 * The API's limits on a method's name: a new one leaves room for the "_sales" of its 80-character
 * value name (`ADD_NAME_MAX`), a rename may use all 80 (`RENAME_NAME_MAX`).
 */
export const ADD_NAME_MAX = 80 - "_sales".length;
export const RENAME_NAME_MAX = 80;
export const NAME_EMPTY = "The method's name is still empty. Type a name to add it.";

/** Flask's wording for each card (`partials/electronic_delivery_section.html`, the script's KINDS). */
export const KIND: Record<
  MethodType,
  { title: string; sub: string; noun: string; pick: string; enter: string }
> = {
  electronic: {
    title: "Electronic",
    sub: "Card and wallet payments a sales report can record.",
    noun: "payment method",
    pick: "Select a payment method",
    enter: "Enter payment method name",
  },
  delivery: {
    title: "Delivery",
    sub: "Delivery platforms a sales report can record.",
    noun: "delivery method",
    pick: "Select a delivery method",
    enter: "Enter delivery method name",
  },
};

/** A card's wording: a Non-cash company's electronic card is its one Non-cash card. */
export function kindFor(type: MethodType, groups?: SalesGroups): (typeof KIND)[MethodType] {
  if (groups === "non_cash" && type === "electronic")
    return {
      ...KIND.electronic,
      title: "Electronic",
      sub: "Card, wallet and transfer payments a sales report can record.",
    };
  return KIND[type];
}

/** The cards the page shows: only the ticked sales accounts' (2026-11-17). With Delivery not ticked,
 * a Non-cash company's Delivery card still shows while it holds methods (from before the business
 * type was asked), so they can be seen and removed - its report counts them in Non-cash. */
export function shownTypes(
  read: Pick<SettingsRead, "sales_groups" | "sales_methods" | "sales_parts">,
): MethodType[] {
  const parts = read.sales_parts;
  const nonCash = read.sales_groups === "non_cash";
  const legacyDelivery = nonCash && read.sales_methods.delivery.length > 0;
  const types: MethodType[] = [];
  if (!parts || parts.electronic) types.push("electronic");
  if (parts ? parts.delivery || (legacyDelivery && parts.electronic) : !nonCash || legacyDelivery)
    types.push("delivery");
  return types;
}

/** The catalogue picker's rows: the methods offered (`available`, never on the list), filtered. */
export function catalogueOptions(available: CatalogueMethod[], query: string): CatalogueMethod[] {
  const q = query.trim().toLowerCase();
  return q ? available.filter((m) => m.name.toLowerCase().includes(q)) : available;
}

/**
 * A new or renamed method's name, checked as it is typed: longer than `max` (`ADD_NAME_MAX` or
 * `RENAME_NAME_MAX`), or already on this type's list (any case, as the API's 409) - null when
 * fine. An empty name is only "not finished", so it says nothing here; the Add that is refused for
 * it says `NAME_EMPTY`. `except` is the method being renamed, which may keep its own name.
 */
export function methodNameProblem(
  name: string,
  listed: SalesMethod[],
  max: number,
  except?: string,
): string | null {
  const wanted = name.trim();
  if (!wanted) return null;
  if (wanted.length > max) return `That name is too long. Keep it to ${max} characters or fewer.`;
  const folded = wanted.toLowerCase();
  if (listed.some((m) => m.id !== except && m.name.trim().toLowerCase() === folded))
    return `${wanted} is already on the list.`;
  return null;
}

/** The type's ids after the method at `from` takes the place of the one at `to` (a drag dropped on
 * that row); null for a drop on itself or outside the list. */
export function placedIds(ids: string[], from: number, to: number): string[] | null {
  if (from === to || from < 0 || from >= ids.length || to < 0 || to >= ids.length) return null;
  const next = ids.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** The type's ids after moving `index` one place (`step` -1 up, +1 down); null past either end. */
export function movedIds(ids: string[], index: number, step: -1 | 1): string[] | null {
  return placedIds(ids, index, index + step);
}

/** Nothing on the page is this person's to change (a cashier): Flask's view-only notice. */
export function viewOnly(p: SettingsPermissions): boolean {
  return !(
    p.edit_xero ||
    p.add_sales_method ||
    p.rename_sales_method ||
    p.remove_sales_method ||
    p.reorder_sales_methods ||
    p.edit_sales_accounts
  );
}

// --- the sales accounts card, held until Save changes (2026-11-20) --------------------------------

/**
 * A method as the card holds it before Save changes: one the API sent (its `id`), or one added here
 * (`id` `new:<n>`, `fresh`) - picked from the catalogue (`sale_info_id`) or typed (`own`).
 */
export type HeldMethod = SalesMethod & { fresh?: boolean; sale_info_id?: string };
export type HeldMethods = Record<MethodType, HeldMethod[]>;

/** One item of `PUT /settings/sales`'s lists: kept (renamed when `name` is sent) or added. */
export type SalesMethodItem =
  { id: string; name?: string } | { sale_info_id: string } | { name: string };
export type SalesBody = {
  accounts: SalesParts;
  methods: Partial<Record<MethodType, SalesMethodItem[]>>;
};

export const NEW_METHOD = "new:";

/** The card's own copy of the saved lists, to change until Save changes. */
export function heldFrom(saved: Record<MethodType, SalesMethod[]>): HeldMethods {
  return { electronic: [...saved.electronic], delivery: [...saved.delivery] };
}

/** The saved methods the card has taken off, in their saved order. */
export function removedMethods(
  saved: Record<MethodType, SalesMethod[]>,
  held: HeldMethods,
): SalesMethod[] {
  return METHOD_TYPES.flatMap((type) =>
    saved[type].filter((m) => !held[type].some((h) => !h.fresh && h.id === m.id)),
  );
}

/** How many changes the card holds in its methods: each add, rename and removal, and each list
 * whose kept methods changed order. */
export function methodChanges(saved: Record<MethodType, SalesMethod[]>, held: HeldMethods): number {
  let count = removedMethods(saved, held).length;
  for (const type of METHOD_TYPES) {
    const kept = held[type].filter((h) => !h.fresh);
    count += held[type].length - kept.length;
    count += kept.filter((h) => saved[type].find((m) => m.id === h.id)?.name !== h.name).length;
    const before = saved[type].map((m) => m.id).filter((id) => kept.some((h) => h.id === id));
    if (kept.some((h, i) => h.id !== before[i])) count += 1;
  }
  return count;
}

/** What the add field offers while the card holds changes: the API's list, the saved Minty methods
 * taken off here (to put back), less the ones already added here. */
export function heldAvailable(
  available: CatalogueMethod[],
  saved: SalesMethod[],
  held: HeldMethod[],
): CatalogueMethod[] {
  const taken = new Set(held.map((h) => h.sale_info_id ?? h.id));
  const back = saved
    .filter((m) => !m.own && !held.some((h) => !h.fresh && h.id === m.id))
    .map((m) => ({ id: m.id, name: m.name }));
  return [...available, ...back].filter((m) => !taken.has(m.id));
}

/** The one `PUT /settings/sales`: the ticks and, when this person can see them, both lists in
 * their held order. */
export function salesBody(
  ticks: SalesParts,
  held: HeldMethods | null,
  saved: Record<MethodType, SalesMethod[]>,
): SalesBody {
  const methods: SalesBody["methods"] = {};
  if (held) {
    for (const type of METHOD_TYPES) {
      methods[type] = held[type].map((h): SalesMethodItem => {
        if (h.fresh) return h.sale_info_id ? { sale_info_id: h.sale_info_id } : { name: h.name };
        const was = saved[type].find((m) => m.id === h.id);
        return was && was.name !== h.name ? { id: h.id, name: h.name } : { id: h.id };
      });
    }
  }
  return { accounts: { ...ticks }, methods };
}
