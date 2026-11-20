// Petty Cash Settings as a person sees it in the hub: the read, a sales method added, renamed,
// moved and deleted, the Xero mapping and account codes saved, a cashier's read-only page, the
// door's 409 for a company still setting up, and the first mapping save staying on the page (owner,
// 2026-11-11). minty-petty-cash-api is answered per path and method; every call names the
// company in its path and never with X-Entity-Id.

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { draftKey, writeDraft } from "@minty/shared/drafts";

import { DISCARD_CHANGES, GO_BACK_UPPER, LEAVE_TITLE } from "@/components/ui/LeaveDialog";
import { ToastProvider } from "@/components/ui/Toast";
import { SETTINGS_DANGER_FILL, SETTINGS_PRIMARY } from "@/components/ui/settingsButtons";
import { setAuth } from "@/lib/auth";
import { env } from "@/lib/env";

import type {
  SettingsPermissions,
  SettingsRead,
} from "@/features/petty-cash-settings/lib/settings";
import type { MappingKey, XeroRead } from "@/features/petty-cash-settings/lib/xeroSettings";
import {
  PettyCashSettingsScreen,
  READ_ONLY,
} from "@/features/petty-cash-settings/routes/PettyCashSettingsScreen";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/entity/e1/olive-shop/settings/petty-cash",
}));

const ID = "e1";
const COMPANY = { id: ID, name: "Olive Shop" };
const PREFIX = `/api/petty-cash/v1/companies/${ID}`;
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Route = (body: unknown) => Response;
function api(routes: Record<string, Route>) {
  fetchMock.mockImplementation(async (input, init = {}) => {
    const url = new URL(String(input));
    expect(url.origin).toBe(new URL(env.PETTY_CASH_API_URL).origin);
    expect(url.pathname.startsWith(PREFIX)).toBe(true);
    expect(new Headers(init.headers).get("X-Entity-Id")).toBeNull();
    expect(new Headers(init.headers).get("Authorization")).toMatch(/^Bearer /);
    const key = `${(init.method ?? "GET").toUpperCase()} ${url.pathname.slice(PREFIX.length)}`;
    const route = routes[key];
    if (!route) throw new Error(`unexpected ${key}`);
    return route(init.body ? JSON.parse(String(init.body)) : null);
  });
}
const sent = (key: string) =>
  fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        `${((init as RequestInit)?.method ?? "GET").toUpperCase()} ${new URL(String(input)).pathname.slice(PREFIX.length)}` ===
        key,
    )
    .map(([, init]) => JSON.parse(String((init as RequestInit).body ?? "null")));

const ALL: SettingsPermissions = {
  edit_xero: true,
  view_sales_methods: true,
  add_sales_method: true,
  rename_sales_method: true,
  remove_sales_method: true,
  reorder_sales_methods: true,
  edit_sales_accounts: true,
};
const CASHIER: SettingsPermissions = {
  ...ALL,
  edit_xero: false,
  add_sales_method: false,
  rename_sales_method: false,
  remove_sales_method: false,
  reorder_sales_methods: false,
  edit_sales_accounts: false,
};
// `own`: typed by the company (pencil and Delete); Minty's only come off its list (owner, 2026-11-12)
const m = (id: string, name: string, own = false) => ({
  id,
  name,
  value_name: `${name.toLowerCase()}_sales`,
  own,
});
const VISA = m("v1", "Visa");
const ALIPAY = m("v2", "AlipayHK", true);
const FOODPANDA = m("d1", "Foodpanda");

function settings(over: Partial<SettingsRead> = {}): SettingsRead {
  return {
    sales_methods: { electronic: [VISA, ALIPAY], delivery: [FOODPANDA] },
    available: {
      electronic: [{ id: "o1", name: "Octopus" }],
      delivery: [{ id: "k1", name: "Keeta" }],
    },
    xero_connected: true,
    permissions: ALL,
    ...over,
  };
}

const KEYS: MappingKey[] = [
  "main_bank",
  "deposit_bank",
  "cashsale_account",
  "cashsale_contact",
  "owners_account",
  "owners_contact",
  "discrepancy_account",
  "discrepancy_contact",
];
const LABELS: Record<MappingKey, string> = {
  main_bank: "Petty Cash Account",
  deposit_bank: "Deposit Bank Account",
  cashsale_account: "Cash Sales account code",
  cashsale_contact: "Cash Sales contact",
  owners_account: "Director Personal Account code",
  owners_contact: "Director / Responsible person",
  discrepancy_account: "Discrepancy account code",
  discrepancy_contact: "Discrepancy contact",
  electronicsale_account: "Electronic Payment sales account code",
  deliverysale_account: "Delivery sales account code",
};
const BANKS = [
  { id: "b1", name: "Petty Cash", code: "090" },
  { id: "b2", name: "HSBC Current", code: "091" },
];
const ACCOUNTS = [
  { id: "a1", name: "Sales", code: "200" },
  { id: "a2", name: "Owner Drawings", code: "880" },
];
const CONTACTS = [
  { id: "c1", name: "Walk-in Customer" },
  { id: "c2", name: "Tess Tester" },
];
const SAVED: Record<MappingKey, string | null> = {
  main_bank: "b1",
  deposit_bank: "b2",
  cashsale_account: "a1",
  cashsale_contact: "c1",
  owners_account: "a2",
  owners_contact: "c2",
  discrepancy_account: "a2",
  discrepancy_contact: "c2",
  // the other two sales accounts' codes (2026-11-17): not in these reads, so sent empty
  electronicsale_account: "",
  deliverysale_account: "",
};

function xero(
  over: {
    live?: boolean;
    edit?: boolean;
    mapping?: Record<MappingKey, string | null>;
    /** The stored codes; the API lists them with or without Xero (owner, 2026-11-12). */
    codes?: boolean;
  } = {},
): XeroRead {
  const live = over.live ?? true;
  const codes = over.codes ?? live;
  const edit = over.edit ?? true;
  const mapping = over.mapping ?? SAVED;
  return {
    live,
    organisation: live ? "Olive Ltd" : null,
    mapping: live
      ? KEYS.map((key) => ({
          key,
          label: LABELS[key],
          kind: key.endsWith("contact") ? ("contact" as const) : ("account" as const),
          options: key.endsWith("bank") ? BANKS : key.endsWith("contact") ? CONTACTS : ACCOUNTS,
          selected: mapping[key],
        }))
      : null,
    mapping_saved: mapping.main_bank !== null,
    account_codes: codes
      ? [
          { code: "400", name: "Advertising", selected: true },
          { code: "404", name: "Bank Fees", selected: false },
        ]
      : [],
    permissions: { edit_mapping: edit, edit_account_codes: edit },
  };
}

function show() {
  render(
    <ToastProvider>
      <PettyCashSettingsScreen company={COMPANY} />
    </ToastProvider>,
  );
}

/** The page is drawn once `GET /settings` has answered. */
const drawn = () => screen.findByRole("list", { name: "Electronic methods" });

const card = (name: string) => within(screen.getByRole("region", { name }));

describe("PettyCashSettingsScreen", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuth("h.eyJ1c2VyX2lkIjoidTEifQ.s", ID, "Olive Shop");
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads the methods in order and the Xero cards once, in the shell's Petty Cash tab", async () => {
    api({
      "GET /settings": () => json(settings()),
      "GET /settings/xero": () => json(xero({ live: false })),
    });
    show();

    const electronic = within(await screen.findByRole("list", { name: "Electronic methods" }));
    expect(electronic.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Visa"),
      expect.stringContaining("AlipayHK"),
    ]);
    const tabs = within(screen.getByRole("navigation", { name: "Settings sections" }));
    expect(tabs.getByText("Petty Cash Settings")).toHaveAttribute("aria-current", "page");
    // the account code card sits under the mapping (owner, 2026-11-12), the methods after them
    expect(
      Array.from(document.querySelectorAll("[data-settings-card]")).map((c) =>
        c.getAttribute("data-settings-card"),
      ),
    ).toEqual(["xero-mapping", "account-codes", "electronic", "delivery"]);
    // not connected: both Xero cards say so, linking to this app's Integration tab
    // one scroll bar (owner, 2026-11-12): the frame scrolls with the document
    expect(document.querySelector("main")?.className ?? "").not.toMatch(/overflow-y-auto/);
    const notices = await screen.findAllByText(/Xero isn.t connected/);
    expect(notices).toHaveLength(2);
    // the one notice, as Payment Settings draws it (owner, 2026-11-12)
    for (const n of notices) expect(n.closest("[data-xero-not-connected]")).not.toBeNull();
    for (const link of screen.getAllByRole("link", { name: "Integration" }))
      expect(link).toHaveAttribute("href", "/entity/e1/olive-shop/settings/integration");
    expect(screen.queryByText(READ_ONLY)).toBeNull();
    expect(sent("GET /settings/xero")).toHaveLength(1);
  });

  it("without Xero the codes are still there to tick; only the mapping waits for Xero", async () => {
    // owner, 2026-11-12: the account codes are available even without Xero
    api({
      "GET /settings": () => json(settings()),
      "GET /settings/xero": () => json(xero({ live: false, codes: true })),
    });
    show();

    const codes = within(await screen.findByRole("region", { name: "Petty Cash Account Code" }));
    expect(await codes.findByRole("checkbox", { name: /400 - Advertising/ })).toBeChecked();
    expect(codes.getByRole("checkbox", { name: /404 - Bank Fees/ })).not.toBeChecked();
    expect(codes.queryByText(/Xero isn.t connected/)).toBeNull();
    const mapping = within(screen.getByRole("region", { name: "Account mapping" }));
    expect(mapping.getByText(/Xero isn.t connected/)).toBeInTheDocument();
  });

  it("a Non-cash company sees one Electronic card (named after its sales account since 2026-11-17) and no empty Delivery card", async () => {
    api({
      "GET /settings": () =>
        json(
          settings({
            sales_groups: "non_cash",
            sales_methods: { electronic: [VISA, ALIPAY], delivery: [] },
          }),
        ),
      "GET /settings/xero": () => json(xero({ live: false })),
    });
    show();

    expect(await screen.findByRole("list", { name: "Electronic methods" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Delivery methods" })).toBeNull();
    expect(screen.queryByText("No delivery methods yet.")).toBeNull();
  });

  it("each method has the bin and the drag handle, no menu, and a drop reorders", async () => {
    // owner, 2026-11-12: the list keeps its rows; the bin and the handle replace the menu
    let state = settings({
      sales_methods: { electronic: [VISA, ALIPAY, m("o1", "Octopus")], delivery: [FOODPANDA] },
    });
    api({
      "GET /settings": () => json(state),
      "GET /settings/xero": () => json(xero({ live: false })),
      "PUT /sales-methods/order": (body) => {
        const ids = (body as { method_ids: string[] }).method_ids;
        state = {
          ...state,
          sales_methods: {
            ...state.sales_methods,
            electronic: ids.map((id) => state.sales_methods.electronic.find((x) => x.id === id)!),
          },
        };
        return json({ ...state, message: "Order saved." });
      },
    });
    show();
    const list = await drawn();

    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((li) => li.querySelector("img"))).toEqual([null, null, null]);
    const visa = within(rows[0]);
    expect(visa.getByRole("button", { name: "Remove Visa from my list" })).toBeInTheDocument();
    const handle = visa.getByRole("button", { name: "Move Visa" });
    expect(handle).toHaveAttribute("draggable", "true");

    // Visa dropped on Octopus: the whole list in its new order
    fireEvent.dragStart(handle);
    fireEvent.dragOver(rows[2]);
    fireEvent.drop(rows[2]);
    expect(await screen.findByText("Order saved.")).toBeInTheDocument();
    expect(sent("PUT /sales-methods/order")).toEqual([
      { type: "electronic", method_ids: ["v2", "o1", "v1"] },
    ]);
    // dropped on itself: nothing is sent
    fireEvent.dragStart(within(rows[0]).getByRole("button", { name: /^Move / }));
    fireEvent.drop(rows[0]);
    expect(sent("PUT /sales-methods/order")).toHaveLength(1);
  });

  it("adds from the catalogue, renames, moves and deletes - each the API's answer, its sentence shown", async () => {
    let state = settings();
    const answer = (next: SettingsRead, message: string, status = 200) => {
      state = next;
      return json({ ...next, message }, status);
    };
    api({
      "GET /settings": () => json(state),
      "GET /settings/xero": () => json(xero({ live: false })),
      "POST /sales-methods": () =>
        answer(
          {
            ...state,
            sales_methods: {
              ...state.sales_methods,
              electronic: [...state.sales_methods.electronic, m("o1", "Octopus")],
            },
            available: { ...state.available, electronic: [] },
          },
          "Octopus added.",
          201,
        ),
      "PUT /sales-methods/v2": (body) =>
        answer(
          {
            ...state,
            sales_methods: {
              ...state.sales_methods,
              electronic: state.sales_methods.electronic.map((x) =>
                x.id === "v2" ? { ...x, name: (body as { name: string }).name } : x,
              ),
            },
          },
          "Name saved.",
        ),
      "PUT /sales-methods/order": (body) => {
        const ids = (body as { method_ids: string[] }).method_ids;
        return answer(
          {
            ...state,
            sales_methods: {
              ...state.sales_methods,
              electronic: ids.map((id) => state.sales_methods.electronic.find((x) => x.id === id)!),
            },
          },
          "Order saved.",
        );
      },
      "DELETE /sales-methods/d1": () =>
        answer(
          { ...state, sales_methods: { ...state.sales_methods, delivery: [] } },
          "Foodpanda is off your list. You can add it back any time.",
        ),
      "DELETE /sales-methods/v2": () =>
        answer(
          {
            ...state,
            sales_methods: {
              ...state.sales_methods,
              electronic: state.sales_methods.electronic.filter((x) => x.id !== "v2"),
            },
          },
          "Alipay HK deleted.",
        ),
    });
    show();
    await drawn();
    const user = userEvent.setup();

    // add: the catalogue, picked, sent by id
    // the add field is always there under the chips (Figma 529:675): no Add New Method to open
    expect(card("Electronic").queryByRole("button", { name: /Add New Method/ })).toBeNull();
    const picker = await card("Electronic").findByRole("combobox", { name: "Method" });
    await user.click(picker);
    expect(
      card("Electronic")
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Octopus"]);
    // the note on top as the list opens (owner, 2026-11-12), never a choice
    expect(
      card("Electronic").getByText("Type a method name to add a new method"),
    ).toBeInTheDocument();
    await user.click(card("Electronic").getByRole("option", { name: "Octopus" }));
    await user.click(card("Electronic").getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Octopus added.")).toBeInTheDocument();
    expect(sent("POST /sales-methods")).toEqual([{ type: "electronic", sale_info_id: "o1" }]);
    // Minty's method: the name is text and there is no pencil (owner, 2026-11-12)
    expect(card("Electronic").getByText("Octopus")).toBeInTheDocument();
    expect(card("Electronic").queryByRole("button", { name: "Edit Octopus" })).toBeNull();

    // rename: the pencil turns the name into a box, checked as typed, Enter saves
    await user.click(card("Electronic").getByRole("button", { name: "Edit AlipayHK" }));
    const box = card("Electronic").getByRole("textbox", { name: "Rename AlipayHK" });
    await user.clear(box);
    await user.type(box, "visa");
    expect(card("Electronic").getByText("visa is already on the list.")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(sent("PUT /sales-methods/v2")).toEqual([]);
    await user.clear(box);
    await user.type(box, "Alipay HK{Enter}");
    expect(await screen.findByText("Name saved.")).toBeInTheDocument();
    expect(sent("PUT /sales-methods/v2")).toEqual([{ name: "Alipay HK" }]);

    // move: the type's whole list in its new order
    // no Move up / Move down (owner, 2026-11-12): the handle, dragged or with the arrow keys
    expect(card("Electronic").queryByRole("menuitem")).toBeNull();
    card("Electronic").getByRole("button", { name: "Move Visa" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(await screen.findByText("Order saved.")).toBeInTheDocument();
    expect(sent("PUT /sales-methods/order")).toEqual([
      { type: "electronic", method_ids: ["v2", "v1", "o1"] },
    ]);

    // Minty's method: no pencil; its bin only takes it off the list, and asks first
    expect(card("Delivery").queryByRole("button", { name: "Edit Foodpanda" })).toBeNull();
    expect(card("Delivery").queryByRole("button", { name: "Delete Foodpanda" })).toBeNull();
    const removeFoodpanda = { name: "Remove Foodpanda from my list" };
    await user.click(card("Delivery").getByRole("button", removeFoodpanda));
    expect(screen.getByRole("dialog", { name: "Remove Delivery Method" })).toHaveTextContent(
      'Remove "Foodpanda" from your list? You can add it back any time.',
    );
    let dialog = within(screen.getByRole("dialog", { name: "Remove Delivery Method" }));
    expect(dialog.getByRole("button", { name: "Go back" })).toHaveFocus();
    await user.click(dialog.getByRole("button", { name: "Go back" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sent("DELETE /sales-methods/d1")).toHaveLength(0);
    await user.click(card("Delivery").getByRole("button", removeFoodpanda));
    dialog = within(screen.getByRole("dialog", { name: "Remove Delivery Method" }));
    expect(dialog.getByRole("button", { name: "Remove" }).className).toBe(SETTINGS_DANGER_FILL);
    await user.click(dialog.getByRole("button", { name: "Remove" }));
    expect(
      await screen.findByText("Foodpanda is off your list. You can add it back any time."),
    ).toBeInTheDocument();
    expect(card("Delivery").getByText("No delivery methods yet.")).toBeInTheDocument();

    // the company's own method: Delete, confirmed, gone for good
    await user.click(card("Electronic").getByRole("button", { name: "Delete Alipay HK" }));
    dialog = within(screen.getByRole("dialog", { name: "Delete Electronic Method" }));
    expect(screen.getByRole("dialog", { name: "Delete Electronic Method" })).toHaveTextContent(
      'Are you sure you want to delete "Alipay HK"? This action cannot be undone.',
    );
    await user.click(dialog.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Alipay HK deleted.")).toBeInTheDocument();
  });

  it("an add by name is checked as typed; a refusal says the API's sentence and keeps the form", async () => {
    api({
      "GET /settings": () => json(settings()),
      "GET /settings/xero": () => json(xero({ live: false })),
      "POST /sales-methods": () => json({ error: "Deliveroo is already on the list." }, 409),
    });
    show();
    await drawn();
    const user = userEvent.setup();

    // a name typed into the picker is offered as a new method, then lands in the Name box
    const picker = card("Delivery").getByRole("combobox", { name: "Method" });
    await user.type(picker, "Lalamove");
    expect(card("Delivery").queryByText("Type a method name to add a new method")).toBeNull();
    await user.click(
      card("Delivery").getByRole("option", { name: "+ Add 'Lalamove' as a new method" }),
    );
    const name = card("Delivery").getByRole("textbox", { name: "Name" });
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveValue("Lalamove");
    await user.clear(name);
    expect(card("Delivery").queryByText(/still empty/)).toBeNull();
    await user.click(card("Delivery").getByRole("button", { name: "Add" }));
    expect(
      card("Delivery").getByText("The method's name is still empty. Type a name to add it."),
    ).toBeInTheDocument();
    await user.type(name, "x".repeat(75));
    expect(
      card("Delivery").getByText("That name is too long. Keep it to 74 characters or fewer."),
    ).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    await user.clear(name);
    await user.type(name, "Deliveroo{Enter}");
    expect(await screen.findByText("Deliveroo is already on the list.")).toBeInTheDocument();
    expect(sent("POST /sales-methods")).toEqual([{ type: "delivery", name: "Deliveroo" }]);
    expect(name).toHaveValue("Deliveroo");
  });

  it("saves the Xero mapping: a new pick, the eight keys sent, the API's sentence", async () => {
    let read = xero();
    api({
      "GET /settings": () => json(settings()),
      "GET /settings/xero": () => json(read),
      "PUT /settings/xero/mapping": (body) => {
        read = xero({ mapping: body as Record<MappingKey, string> });
        return json({ ...read, message: "Account mapping saved.", first_save: false });
      },
    });
    show();
    await drawn();
    const user = userEvent.setup();

    const mapping = card("Account mapping");
    const sales = await mapping.findByRole("combobox", {
      name: /Select account code for cash sales/,
    });
    expect(sales).toHaveValue("Sales - 200");
    const save = mapping.getByRole("button", { name: "Save Changes" });
    expect(save).toBeDisabled();
    expect(save.className).toBe(SETTINGS_PRIMARY);
    // the Deposit Bank Account never offers the Petty Cash Account's bank
    await user.click(mapping.getByRole("combobox", { name: /deposit excess cash/ }));
    expect(mapping.getAllByRole("option").map((o) => o.textContent)).toEqual(["HSBC Current091"]);
    await user.keyboard("{Escape}");

    await user.clear(sales);
    await user.type(sales, "880");
    await user.click(mapping.getByRole("option", { name: /Owner Drawings/ }));
    expect(sales).toHaveValue("Owner Drawings - 880");
    await user.click(save);
    expect(await screen.findByText("Account mapping saved.")).toBeInTheDocument();
    expect(sent("PUT /settings/xero/mapping")).toEqual([{ ...SAVED, cashsale_account: "a2" }]);
    await waitFor(() =>
      expect(card("Account mapping").getByRole("button", { name: "Save Changes" })).toBeDisabled(),
    );
  });

  it("first setup: a refused Save lists what is missing; the first save stays here, saying so", async () => {
    const empty = Object.fromEntries(KEYS.map((k) => [k, null])) as Record<MappingKey, null>;
    api({
      "GET /settings": () => json(settings()),
      "GET /settings/xero": () => json(xero({ mapping: empty })),
      "PUT /settings/xero/mapping": (body) =>
        json({
          ...xero({ mapping: body as Record<MappingKey, string> }),
          message: "Account mapping saved.",
          first_save: true,
        }),
    });
    show();
    await drawn();
    const user = userEvent.setup();
    const mapping = card("Account mapping");
    const first = await mapping.findByRole("combobox", { name: /Select Petty Cash bank account/ });
    expect(
      mapping.getAllByRole("combobox").filter((b) => b.getAttribute("aria-invalid") === "true"),
    ).toHaveLength(0);
    await user.click(first);
    await user.click(mapping.getByRole("option", { name: /Petty Cash/ }));
    await user.click(mapping.getByRole("button", { name: "Save Changes" }));

    const summary = within(mapping.getByRole("alert"));
    expect(summary.getAllByRole("link")).toHaveLength(7);
    expect(summary.getByRole("link", { name: "Choose the Deposit Bank Account." })).toBeVisible();
    expect(sent("PUT /settings/xero/mapping")).toEqual([]);

    const picks: [RegExp, RegExp][] = [
      [/deposit excess cash/, /HSBC Current/],
      [/account code for cash sales/, /Sales/],
      [/Customer contact/, /Walk-in Customer/],
      [/Advance Payment from director/, /Owner Drawings/],
      [/Cash Discrepancy/, /Owner Drawings/],
    ];
    for (const [box, option] of picks) {
      await user.click(mapping.getByRole("combobox", { name: box }));
      await user.click(mapping.getAllByRole("option", { name: option })[0]);
    }
    for (const box of mapping.getAllByRole("combobox", { name: /Director or Responsible/ })) {
      await user.click(box);
      await user.click(mapping.getByRole("option", { name: /Tess Tester/ }));
    }
    await user.click(mapping.getByRole("button", { name: "Save Changes" }));
    // Like every save: the sentence shows and the page stays (owner, 2026-11-11 - it used to leave
    // for the Petty Cash dashboard, and the sentence went with the page).
    expect(await screen.findByText("Account mapping saved.")).toBeInTheDocument();
    expect(sent("PUT /settings/xero/mapping")).toEqual([SAVED]);
    expect(
      card("Account mapping").getByRole("button", { name: "Save Changes" }),
    ).toBeInTheDocument();
  });

  it("saves the account codes: at least one stays ticked, said at once", async () => {
    let read = xero();
    api({
      "GET /settings": () => json(settings()),
      "GET /settings/xero": () => json(read),
      "PUT /settings/xero/account-codes": (body) => {
        const codes = (body as { codes: string[] }).codes;
        read = {
          ...read,
          account_codes: read.account_codes!.map((c) => ({
            ...c,
            selected: codes.includes(c.code),
          })),
        };
        return json({ ...read, message: "Account codes saved." });
      },
    });
    show();
    await drawn();
    const user = userEvent.setup();
    const codes = card("Petty Cash Account Code");
    const advertising = await codes.findByRole("checkbox", { name: "400 - Advertising" });
    await user.click(advertising);
    expect(codes.getByText("Pick at least one account code.")).toBeInTheDocument();
    const save = codes.getByRole("button", { name: "Save Changes" });
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription("Pick at least one account code.");
    await user.click(codes.getByRole("checkbox", { name: "404 - Bank Fees" }));
    expect(codes.queryByText("Pick at least one account code.")).toBeNull();
    await user.click(save);
    expect(await screen.findByText("Account codes saved.")).toBeInTheDocument();
    expect(sent("PUT /settings/xero/account-codes")).toEqual([{ codes: ["404"] }]);
  });

  it("a cashier sees it all read-only: the notice, no controls, no Save", async () => {
    api({
      "GET /settings": () => json(settings({ permissions: CASHIER })),
      "GET /settings/xero": () => json(xero({ edit: false })),
    });
    show();

    expect(await screen.findByText(READ_ONLY)).toBeInTheDocument();
    await screen.findByRole("combobox", { name: /Select Petty Cash bank account/ });
    expect(screen.queryByRole("button", { name: "Save Changes" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add New Method/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Move|Delete) / })).toBeNull();
    expect(card("Electronic").queryByRole("button", { name: "Visa" })).toBeNull();
    expect(card("Electronic").getByText("Visa")).toBeInTheDocument();
    for (const box of screen.getAllByRole("combobox")) expect(box).toBeDisabled();
    expect(
      card("Petty Cash Account Code").getByRole("checkbox", { name: "400 - Advertising" }),
    ).toBeDisabled();
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(
      true,
    );
  });

  it("a company still setting up: the door's 409 sentence, and no Try again (it can't help)", async () => {
    const SETTING_UP = "This company is still setting up. Finish setting it up to use Petty Cash.";
    let reads = 0;
    api({
      "GET /settings": () => {
        reads += 1;
        return json({ error: SETTING_UP }, 409);
      },
    });
    show();

    expect(await screen.findByText(SETTING_UP)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(reads).toBe(1);
    expect(screen.queryByRole("region", { name: "Electronic" })).toBeNull();
  });

  it("a 403 says the API's sentence and offers no retry", async () => {
    api({
      "GET /settings": () => json({ error: "You don't have access to that company." }, 403),
    });
    show();

    expect(await screen.findByText("You don't have access to that company.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("a Xero read that fails says so in both cards; Try again asks once more", async () => {
    let fail = true;
    api({
      "GET /settings": () => json(settings()),
      "GET /settings/xero": () =>
        fail
          ? json({ error: "I couldn't reach Xero just now. Try again in a minute." }, 502)
          : json(xero()),
    });
    show();

    expect(
      await screen.findAllByText("I couldn't reach Xero just now. Try again in a minute."),
    ).toHaveLength(2);
    expect(card("Electronic").getByText("Visa")).toBeInTheDocument();
    fail = false;
    await userEvent.click(card("Account mapping").getByRole("button", { name: "Try again" }));
    expect(
      await card("Account mapping").findByRole("combobox", {
        name: /Select Petty Cash bank account/,
      }),
    ).toHaveValue("Petty Cash - 090");
    expect(sent("GET /settings/xero")).toHaveLength(2);
  });
});

// "Leave without saving?" over the two Xero cards (2026-11-11; the port had no guard): the sales
// methods save at once, so only the cards can hold unsaved choices.
// The sales accounts, under the account codes (owner, 2026-11-17; Figma 464:73 row 4): Sales - Cash,
// Electronic Payment and Delivery on or off, saved together; turning one off asks first; at least one
// stays on; only the ticked accounts' method cards show.
describe("PettyCashSettingsScreen - the sales accounts", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuth("h.eyJ1c2VyX2lkIjoidTEifQ.s", ID, "Olive Shop");
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  const ON = { cash: true, electronic: true, delivery: true };
  const box = (name: RegExp) => card("Sales accounts and methods").getByRole("checkbox", { name });
  const save = () =>
    card("Sales accounts and methods").getByRole("button", { name: "Save changes" });

  it("sits under the account codes, ticked as the API says", async () => {
    api({
      "GET /settings": () => json(settings({ sales_parts: ON })),
      "GET /settings/xero": () => json(xero()),
    });
    show();
    await drawn();
    const order = Array.from(document.querySelectorAll("[data-settings-card]")).map((el) =>
      el.getAttribute("data-settings-card"),
    );
    expect(order.indexOf("sales-accounts")).toBe(order.indexOf("account-codes") + 1);
    expect(box(/Sales - Cash/)).toHaveAttribute("aria-checked", "true");
    expect(box(/Sales - Delivery/)).toHaveAttribute("aria-checked", "true");
    expect(save()).toBeDisabled();
  });

  it("turning Delivery off asks first, saves the three, and hides its methods card", async () => {
    api({
      "GET /settings": () => json(settings({ sales_parts: ON })),
      "GET /settings/xero": () => json(xero()),
      "PUT /settings/sales-accounts": (body) =>
        json({
          ...settings({ sales_parts: body as typeof ON }),
          message: "Your sales accounts are saved.",
        }),
    });
    show();
    await drawn();
    expect(screen.getByRole("list", { name: "Delivery methods" })).toBeInTheDocument();
    await userEvent.click(box(/Sales - Delivery/));
    expect(
      card("Sales accounts and methods").getByText("1 change not saved yet"),
    ).toBeInTheDocument();
    await userEvent.click(save());
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Turn off Sales - Delivery?")).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Turn off" }));
    await waitFor(() =>
      expect(sent("PUT /settings/sales-accounts")).toEqual([
        { cash: true, electronic: true, delivery: false },
      ]),
    );
    expect(await screen.findByText("Your sales accounts are saved.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Delivery methods" })).toBeNull();
  });

  it("refuses none ticked, at once, and sends nothing", async () => {
    api({
      "GET /settings": () =>
        json(settings({ sales_parts: { cash: true, electronic: false, delivery: false } })),
      "GET /settings/xero": () => json(xero()),
    });
    show();
    await screen.findByRole("region", { name: "Sales accounts and methods" });
    await userEvent.click(box(/Sales - Cash/));
    expect(
      card("Sales accounts and methods").getByText(
        "No sales account is ticked yet. Tick at least one to continue.",
      ),
    ).toBeInTheDocument();
    expect(save()).toBeDisabled();
    expect(sent("PUT /settings/sales-accounts")).toEqual([]);
  });

  it("each ticked account holds its methods; Cash has none and there are no separate cards", async () => {
    api({
      "GET /settings": () =>
        json(settings({ sales_parts: { cash: true, electronic: true, delivery: false } })),
      "GET /settings/xero": () => json(xero()),
    });
    show();
    await drawn();
    const accounts = screen.getByRole("region", { name: "Sales accounts and methods" });
    const electronic = within(accounts).getByRole("region", { name: "Electronic" });
    expect(
      within(electronic).getByRole("list", { name: "Electronic methods" }),
    ).toBeInTheDocument();
    expect(within(electronic).getByRole("combobox", { name: "Method" })).toBeInTheDocument();
    // Delivery is off: its methods fold away with it
    expect(screen.queryByRole("list", { name: "Delivery methods" })).toBeNull();
    // no card of their own any more
    expect(document.querySelector('[data-settings-card="electronic"]')).toBeNull();
    expect(document.querySelector('[data-settings-card="delivery"]')).toBeNull();
  });

  it("a cashier sees the accounts but cannot change them", async () => {
    api({
      "GET /settings": () =>
        json(
          settings({ sales_parts: ON, permissions: { ...CASHIER, edit_sales_accounts: false } }),
        ),
      "GET /settings/xero": () => json(xero({ edit: false })),
    });
    show();
    await drawn();
    expect(box(/Sales - Cash/)).toBeDisabled();
    expect(
      card("Sales accounts and methods").queryByRole("button", { name: "Save changes" }),
    ).toBeNull();
  });
});

// Each sales account has its own code (owner, 2026-11-17): the mapping draws Electronic Payment
// Sales and Delivery Sales when the API sends them (their sales account ticked), optional, and saves
// the picks with the rest.
describe("PettyCashSettingsScreen - each sales account's code", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuth("h.eyJ1c2VyX2lkIjoidTEifQ.s", ID, "Olive Shop");
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("offers the two codes, optional, and sends the one picked", async () => {
    const read = xero();
    const at = read.mapping!.findIndex((f) => f.key === "cashsale_account") + 1;
    const codeField = (key: MappingKey, label: string) => ({
      key,
      label,
      kind: "account" as const,
      options: ACCOUNTS,
      selected: null,
      optional: true,
    });
    read.mapping!.splice(
      at,
      0,
      codeField("electronicsale_account", "Electronic Payment sales account code"),
      codeField("deliverysale_account", "Delivery sales account code"),
    );
    api({
      "GET /settings": () => json(settings()),
      "GET /settings/xero": () => json(read),
      "PUT /settings/xero/mapping": () =>
        json({ ...read, message: "Account mapping saved.", first_save: false }),
    });
    show();
    await drawn();
    const mapping = card("Account mapping");
    const electronic = await mapping.findByRole("combobox", {
      name: /Select account code for electronic payment sales/,
    });
    expect(mapping.getByText("Select account code for delivery sales")).toBeInTheDocument();
    expect(electronic).not.toBeRequired();
    const user = userEvent.setup();
    await user.click(electronic);
    await user.click(mapping.getByRole("option", { name: /Sales/ }));
    await user.click(mapping.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(sent("PUT /settings/xero/mapping")).toEqual([
        { ...SAVED, electronicsale_account: "a1" },
      ]),
    );
  });
});

describe("PettyCashSettingsScreen - leaving with unsaved Xero choices", () => {
  let went: string[];
  const onClick = (event: MouseEvent) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (anchor instanceof HTMLAnchorElement) {
      event.preventDefault();
      went.push(anchor.getAttribute("href") ?? "");
    }
  };
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuth("h.eyJ1c2VyX2lkIjoidTEifQ.s", ID, "Olive Shop");
    fetchMock.mockReset();
    went = [];
    window.addEventListener("click", onClick);
  });
  afterEach(() => {
    window.removeEventListener("click", onClick);
    vi.unstubAllGlobals();
  });

  it("asks first: Go Back keeps the tick, Discard changes puts the saved ticks back and goes", async () => {
    api({
      "GET /settings": () => json(settings()),
      "GET /settings/xero": () => json(xero()),
    });
    show();
    await drawn();
    const user = userEvent.setup();
    const codes = card("Petty Cash Account Code");
    await user.click(await codes.findByRole("checkbox", { name: "404 - Bank Fees" }));

    await user.click(screen.getByRole("link", { name: "Users" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName(LEAVE_TITLE);
    expect(went).toEqual([]);

    await user.click(within(dialog).getByRole("button", { name: GO_BACK_UPPER }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(codes.getByRole("checkbox", { name: "404 - Bank Fees" })).toBeChecked();

    await user.click(screen.getByRole("link", { name: "Users" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: DISCARD_CHANGES }),
    );
    expect(
      card("Petty Cash Account Code").getByRole("checkbox", { name: "404 - Bank Fees" }),
    ).not.toBeChecked();
    expect(went).toEqual([expect.stringContaining("/settings/users")]);
  });

  it("asks nothing when nothing changed", async () => {
    api({
      "GET /settings": () => json(settings()),
      "GET /settings/xero": () => json(xero()),
    });
    show();
    await drawn();
    await card("Petty Cash Account Code").findByRole("checkbox", { name: "404 - Bank Fees" });
    await userEvent.click(screen.getByRole("link", { name: "Users" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(went).toEqual([expect.stringContaining("/settings/users")]);
  });
});

// Auto-saved drafts (the owner's decisions doc L1; @minty/shared/drafts): each card keeps what was
// chosen in this browser 2 s after the last change, per person and company; coming back asks
// first (Restore / Discard); its own Save, and "Discard changes", remove it.
describe("PettyCashSettingsScreen - auto-saved drafts", () => {
  let went: string[];
  const onClick = (event: MouseEvent) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (anchor instanceof HTMLAnchorElement) {
      event.preventDefault();
      went.push(anchor.getAttribute("href") ?? "");
    }
  };
  const scope = { userId: "u1", entityId: ID };
  const MAPPING = draftKey(scope, "settings.pc-mapping", "-");
  const CODES = draftKey(scope, "settings.pc-codes", "-");
  const SALES = draftKey(scope, "settings.pc-sales", "-");
  const ON = { cash: true, electronic: true, delivery: true };
  const wait2s = () =>
    act(async () => {
      vi.advanceTimersByTime(2100);
    });
  const mount = () =>
    render(
      <ToastProvider>
        <PettyCashSettingsScreen company={COMPANY} />
      </ToastProvider>,
    );

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", fetchMock);
    setAuth("h.eyJ1c2VyX2lkIjoidTEifQ.s", ID, "Olive Shop");
    fetchMock.mockReset();
    went = [];
    window.addEventListener("click", onClick);
  });
  afterEach(() => {
    window.removeEventListener("click", onClick);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function pickOwnerDrawings(user: ReturnType<typeof userEvent.setup>) {
    const mapping = card("Account mapping");
    const sales = await mapping.findByRole("combobox", {
      name: /Select account code for cash sales/,
    });
    await user.clear(sales);
    await user.type(sales, "880");
    await user.click(mapping.getByRole("option", { name: /Owner Drawings/ }));
    return sales;
  }

  it("the mapping: kept 2 s after a choice, offered when the page opens again, Restore puts it back", async () => {
    api({
      "GET /settings": () => json(settings()),
      "GET /settings/xero": () => json(xero()),
    });
    const first = mount();
    await drawn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await pickOwnerDrawings(user);
    expect(localStorage.getItem(MAPPING)).toBeNull();
    await wait2s();
    const kept = JSON.parse(localStorage.getItem(MAPPING) ?? "null");
    expect(kept.value.cashsale_account).toBe("a2");
    first.unmount();

    mount();
    await drawn();
    const mapping = card("Account mapping");
    const notice = await mapping.findByText(/You have unsaved changes from \d\d:\d\d\./);
    expect(notice.closest("[data-draft-notice]")).toHaveAttribute("data-draft-notice", "fresh");
    // nothing changes until the person picks
    const sales = mapping.getByRole("combobox", { name: /Select account code for cash sales/ });
    expect(sales).toHaveValue("Sales - 200");
    await user.click(mapping.getByRole("button", { name: "Restore" }));
    expect(sales).toHaveValue("Owner Drawings - 880");
    expect(mapping.getByRole("button", { name: "Save Changes" })).toBeEnabled();
    expect(mapping.queryByText(/You have unsaved changes/)).toBeNull();
    // the other cards keep their own drafts: none here
    expect(card("Petty Cash Account Code").queryByText(/unsaved changes/)).toBeNull();
  });

  it("Discard removes the mapping's draft and keeps the saved choices", async () => {
    api({
      "GET /settings": () => json(settings()),
      "GET /settings/xero": () => json(xero()),
    });
    const first = mount();
    await drawn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await pickOwnerDrawings(user);
    await wait2s();
    first.unmount();

    mount();
    await drawn();
    const mapping = card("Account mapping");
    await mapping.findByText(/You have unsaved changes/);
    await user.click(mapping.getByRole("button", { name: "Discard" }));
    expect(mapping.queryByText(/You have unsaved changes/)).toBeNull();
    expect(localStorage.getItem(MAPPING)).toBeNull();
    expect(
      mapping.getByRole("combobox", { name: /Select account code for cash sales/ }),
    ).toHaveValue("Sales - 200");
  });

  it("the mapping's own Save removes its draft", async () => {
    let read = xero();
    api({
      "GET /settings": () => json(settings()),
      "GET /settings/xero": () => json(read),
      "PUT /settings/xero/mapping": (body) => {
        read = xero({ mapping: body as Record<MappingKey, string> });
        return json({ ...read, message: "Account mapping saved.", first_save: false });
      },
    });
    mount();
    await drawn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await pickOwnerDrawings(user);
    await wait2s();
    expect(localStorage.getItem(MAPPING)).not.toBeNull();
    await user.click(card("Account mapping").getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByText("Account mapping saved.")).toBeInTheDocument();
    await wait2s();
    expect(localStorage.getItem(MAPPING)).toBeNull();
  });

  it("saved by someone since: the draft is shown, never put back", async () => {
    writeDraft(MAPPING, {
      v: 1,
      form: "settings.pc-mapping",
      record: "-",
      shape: 1,
      userId: "u1",
      entityId: ID,
      savedAt: Date.now() - 60_000,
      basedOn: "an-older-save",
      value: { ...SAVED, cashsale_account: "a2" },
      files: [],
      missing: [],
    });
    api({
      "GET /settings": () => json(settings()),
      "GET /settings/xero": () => json(xero()),
    });
    mount();
    await drawn();
    const mapping = card("Account mapping");
    const notice = await mapping.findByText(/This was saved again after your unsaved changes/);
    expect(notice.closest("[data-draft-notice]")).toHaveAttribute("data-draft-notice", "stale");
    expect(mapping.queryByRole("button", { name: "Restore" })).toBeNull();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(mapping.getByRole("button", { name: "Show what I typed" }));
    expect(mapping.getByText("Cash Sales account code").nextElementSibling).toHaveTextContent(
      "Owner Drawings - 880",
    );
    expect(
      mapping.getByRole("combobox", { name: /Select account code for cash sales/ }),
    ).toHaveValue("Sales - 200");
  });

  it("another person's draft on this browser is never offered", async () => {
    writeDraft(draftKey({ userId: "u2", entityId: ID }, "settings.pc-mapping", "-"), {
      v: 1,
      form: "settings.pc-mapping",
      record: "-",
      shape: 1,
      userId: "u2",
      entityId: ID,
      savedAt: Date.now(),
      basedOn: null,
      value: { ...SAVED, cashsale_account: "a2" },
      files: [],
      missing: [],
    });
    api({
      "GET /settings": () => json(settings()),
      "GET /settings/xero": () => json(xero()),
    });
    mount();
    await drawn();
    await card("Account mapping").findByRole("combobox", {
      name: /Select account code for cash sales/,
    });
    await act(async () => undefined);
    expect(screen.queryByText(/unsaved changes/)).toBeNull();
  });

  it("the account codes and the sales accounts keep drafts of their own", async () => {
    api({
      "GET /settings": () => json(settings({ sales_parts: ON })),
      "GET /settings/xero": () => json(xero()),
    });
    const first = mount();
    await drawn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(
      await card("Petty Cash Account Code").findByRole("checkbox", { name: "404 - Bank Fees" }),
    );
    await user.click(
      card("Sales accounts and methods").getByRole("checkbox", { name: /Sales - Delivery/ }),
    );
    await wait2s();
    expect(JSON.parse(localStorage.getItem(CODES) ?? "null").value).toEqual(["400", "404"]);
    expect(JSON.parse(localStorage.getItem(SALES) ?? "null").value).toEqual({
      ...ON,
      delivery: false,
    });
    expect(localStorage.getItem(MAPPING)).toBeNull();
    first.unmount();

    mount();
    await drawn();
    const codes = card("Petty Cash Account Code");
    await codes.findByText(/You have unsaved changes/);
    await user.click(codes.getByRole("button", { name: "Restore" }));
    expect(codes.getByRole("checkbox", { name: "404 - Bank Fees" })).toBeChecked();
    const sales = card("Sales accounts and methods");
    await user.click(sales.getByRole("button", { name: "Restore" }));
    expect(sales.getByRole("checkbox", { name: /Sales - Delivery/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(sales.getByText("1 change not saved yet")).toBeInTheDocument();
  });

  it("Discard changes on leaving removes every card's draft", async () => {
    api({
      "GET /settings": () => json(settings()),
      "GET /settings/xero": () => json(xero()),
    });
    mount();
    await drawn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(
      await card("Petty Cash Account Code").findByRole("checkbox", { name: "404 - Bank Fees" }),
    );
    await pickOwnerDrawings(user);
    await wait2s();
    expect(localStorage.getItem(CODES)).not.toBeNull();
    expect(localStorage.getItem(MAPPING)).not.toBeNull();

    await user.click(screen.getByRole("link", { name: "Users" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: DISCARD_CHANGES }),
    );
    expect(went).toEqual([expect.stringContaining("/settings/users")]);
    await wait2s();
    expect(localStorage.getItem(CODES)).toBeNull();
    expect(localStorage.getItem(MAPPING)).toBeNull();
  });
});
