// General's chart of accounts and contacts as a person uses them (owner, 2026-11-12; their own tab
// first, merged into General the same day): the two lists, Edit and Delete on every row, the add
// form with the next free code filled in, delete asking first, the API's sentences shown, and a
// view-only person shown the lists alone (General's own view-only line says why). accounts-api is
// answered per path and method; every call names the company as ?entity=.

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { draftKey, writeDraft } from "@minty/shared/drafts";

import { ToastProvider } from "@/components/ui/Toast";
import { setAuth } from "@/lib/auth";
import { env } from "@/lib/env";

import type { AccountsRead, ContactsRead } from "@/features/company-settings/api/chart";
import { ChartSection } from "@/features/company-settings/components/ChartSection";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/entity/360812e1/olive-and-vine/settings/general",
}));

const ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const COMPANY = { id: ID, name: "Olive & Vine" };
const ALL = { add: true, edit: true, delete: true };

function accounts(over: Partial<AccountsRead> = {}): AccountsRead {
  const row = (id: string, code: string, name: string, extra = {}) => ({
    id,
    code,
    name,
    type: "expense",
    type_label: "Expense",
    description: "",
    own: true,
    source: "user",
    in_xero: false,
    used: false,
    ...extra,
  });
  return {
    accounts: [
      row("a-rent", "469", "Rent", { in_xero: true, used: true }),
      row("a-wages", "477", "Wages", { source: "template" }),
    ],
    types: [
      { value: "bank", label: "Bank" },
      { value: "expense", label: "Expense" },
    ],
    next_codes: { bank: "090", expense: "478" },
    minty_accounts: [
      {
        id: "t-fuel",
        code: "470",
        name: "Fuel",
        type: "expense",
        type_label: "Expense",
        description: "Vans and cars",
      },
    ],
    xero_live: false,
    permissions: ALL,
    ...over,
  };
}

function contacts(over: Partial<ContactsRead> = {}): ContactsRead {
  return {
    contacts: [
      {
        id: "c-kee",
        name: "Kee Wah",
        own: true,
        source: "user",
        in_xero: false,
        xero_id: null,
        used: false,
      },
      {
        id: "c-walk",
        name: "Walk-in Customer",
        own: true,
        source: "template",
        in_xero: false,
        xero_id: null,
        used: false,
      },
    ],
    xero_live: false,
    permissions: ALL,
    ...over,
  };
}

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
type Handler = (body: unknown) => Response;
const sent: { method: string; path: string; body: unknown }[] = [];

function api(routes: Record<string, Handler>) {
  fetchMock.mockImplementation(async (input, init = {}) => {
    const url = new URL(String(input));
    expect(url.origin).toBe(new URL(env.ACCOUNTS_API_URL).origin);
    expect(url.searchParams.get("entity")).toBe(ID);
    const method = (init.method ?? "GET").toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : null;
    if (method !== "GET") sent.push({ method, path: url.pathname, body });
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) throw new Error(`unexpected ${method} ${url.pathname}`);
    return handler(body);
  });
}

function show() {
  render(
    <ToastProvider>
      <ChartSection entityId={COMPANY.id} entityName={COMPANY.name} />
    </ToastProvider>,
  );
}

const card = (title: string) => within(screen.getByRole("region", { name: title }));
/** The first read drawn: the cards are on the page. */
const loaded = () => screen.findByRole("region", { name: "Chart of accounts" });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(`h.${btoa(JSON.stringify({ user_id: "u1", role: "admin" }))}.s`, ID, COMPANY.name);
  sent.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe("the two lists", () => {
  it("show Edit and Delete on the company's rows while Xero is off - Merge on contacts only (2026-11-24)", async () => {
    api({
      "GET /api/me/company/accounts": () => json(accounts()),
      "GET /api/me/company/contacts": () => json(contacts()),
    });
    show();
    await loaded();

    const chart = card("Chart of accounts");
    expect(await chart.findByText("477 - Wages")).toBeInTheDocument();
    // a copy of Minty's is the company's own too (owner, 2026-11-12), marked where it came from
    expect(chart.getByRole("button", { name: "Edit 477 - Wages" })).toBeInTheDocument();
    expect(chart.getByRole("button", { name: "Delete 477 - Wages" })).toBeInTheDocument();
    // accounts are never merged (the user, 2026-11-24)
    expect(chart.queryByRole("button", { name: /^Merge/ })).toBeNull();
    expect(chart.getByRole("button", { name: /Add an account/ })).toBeInTheDocument();
    expect(chart.getByText("Comes with Minty")).toBeInTheDocument();

    const people = card("Contacts");
    expect(people.getByRole("button", { name: "Edit Kee Wah" })).toBeInTheDocument();
    expect(people.getByRole("button", { name: "Delete Walk-in Customer" })).toBeInTheDocument();
    // contacts merge the Xero way, from the card (the user, 2026-11-25): no Merge on a row
    expect(people.getByRole("button", { name: /Merge contacts/ })).toBeInTheDocument();
    expect(people.queryByRole("button", { name: "Merge Kee Wah" })).toBeNull();
    expect(people.getByRole("button", { name: /Add a contact/ })).toBeInTheDocument();
  });

  it("while Xero is connected no account is added, edited, deleted or merged here, contacts still are (the user, 2026-11-23, 2026-11-24)", async () => {
    api({
      "GET /api/me/company/accounts": () => json(accounts({ xero_live: true })),
      "GET /api/me/company/contacts": () => json(contacts({ xero_live: true })),
    });
    show();
    await loaded();

    const chart = card("Chart of accounts");
    expect(await chart.findByText("469 - Rent")).toBeInTheDocument();
    expect(chart.getByText("In Xero")).toBeInTheDocument();
    for (const row of ["469 - Rent", "477 - Wages"]) {
      expect(chart.queryByRole("button", { name: `Edit ${row}` })).toBeNull();
      expect(chart.queryByRole("button", { name: `Delete ${row}` })).toBeNull();
      expect(chart.queryByRole("button", { name: `Merge ${row}` })).toBeNull();
    }
    expect(chart.queryByRole("button", { name: /Add an account/ })).toBeNull();
    expect(
      chart.getByText(
        "Your company is connected to Xero, so accounts are added and changed in Xero, and Minty follows.",
      ),
    ).toBeInTheDocument();
    expect(chart.queryByText(/linked to Xero are changed/)).toBeNull();

    // contacts are still added here (in Xero too, C5): Minty's own keep Edit and Delete
    const people = card("Contacts");
    for (const row of ["Kee Wah", "Walk-in Customer"]) {
      expect(people.getByRole("button", { name: `Edit ${row}` })).toBeInTheDocument();
      expect(people.getByRole("button", { name: `Delete ${row}` })).toBeInTheDocument();
    }
    expect(people.getByRole("button", { name: /Add a contact/ })).toBeInTheDocument();
    expect(people.queryByText(/connected to Xero/)).toBeNull();
    expect(
      people.getByText(/A contact you add here goes to Xero too when Xero is connected\./),
    ).toBeInTheDocument();
    // it is Xero, not the person's role: no view-only line
    expect(screen.queryByText(/only an Accountant or an Admin/)).toBeNull();
  });

  it("while Xero is off, a row linked to Xero is marked so and offers no Edit or Delete (the API refuses them)", async () => {
    const linked = {
      id: "c-abc",
      name: "ABC Supplies",
      own: true,
      source: "xero",
      in_xero: true,
      xero_id: "x-abc",
      used: false,
    };
    api({
      "GET /api/me/company/accounts": () => json(accounts()),
      "GET /api/me/company/contacts": () =>
        json(contacts({ contacts: [...contacts().contacts, linked] })),
    });
    show();
    await loaded();

    const chart = card("Chart of accounts");
    expect(await chart.findByText("469 - Rent")).toBeInTheDocument();
    expect(chart.getByText("Linked to Xero")).toBeInTheDocument();
    expect(chart.queryByText("In Xero")).toBeNull();
    expect(chart.queryByRole("button", { name: "Edit 469 - Rent" })).toBeNull();
    expect(chart.queryByRole("button", { name: "Delete 469 - Rent" })).toBeNull();
    expect(
      chart.getByText("Accounts linked to Xero are changed in Xero, and Minty follows."),
    ).toBeInTheDocument();
    // the company's own rows that aren't in Xero keep both
    expect(chart.getByRole("button", { name: "Edit 477 - Wages" })).toBeInTheDocument();

    const people = card("Contacts");
    expect(people.getByText("Linked to Xero")).toBeInTheDocument();
    expect(people.queryByRole("button", { name: "Edit ABC Supplies" })).toBeNull();
    expect(people.queryByRole("button", { name: "Delete ABC Supplies" })).toBeNull();
    expect(
      people.getByText("Contacts linked to Xero are changed in Xero, and Minty follows."),
    ).toBeInTheDocument();
    expect(people.getByRole("button", { name: "Edit Kee Wah" })).toBeInTheDocument();
  });

  it("a company with nothing linked to Xero sees no Xero note", async () => {
    const own = accounts().accounts.map((a) => ({ ...a, in_xero: false }));
    api({
      "GET /api/me/company/accounts": () => json(accounts({ accounts: own })),
      "GET /api/me/company/contacts": () => json(contacts()),
    });
    show();
    await loaded();
    expect(await screen.findByText("469 - Rent")).toBeInTheDocument();
    expect(screen.queryByText(/linked to Xero/i)).toBeNull();
    expect(screen.queryByText("In Xero")).toBeNull();
  });

  it("a view-only person sees the lists alone", async () => {
    const none = { add: false, edit: false, delete: false };
    api({
      "GET /api/me/company/accounts": () => json(accounts({ permissions: none })),
      "GET /api/me/company/contacts": () => json(contacts({ permissions: none })),
    });
    show();
    await loaded();

    expect(await screen.findByText("469 - Rent")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Edit|Delete|Add) / })).toBeNull();
  });

  it("a failed read says so and tries again", async () => {
    let fail = true;
    api({
      "GET /api/me/company/accounts": () =>
        fail ? json({ error: "I couldn't reach the accounts just now." }, 503) : json(accounts()),
      "GET /api/me/company/contacts": () => json(contacts()),
    });
    show();
    expect(await screen.findByText("I couldn't reach the accounts just now.")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("469 - Rent")).toBeInTheDocument();
  });
});

describe("an account", () => {
  it("one of Minty's accounts is picked from the dropdown and added as it is", async () => {
    api({
      "GET /api/me/company/accounts": () => json(accounts()),
      "GET /api/me/company/contacts": () => json(contacts()),
      "POST /api/me/company/accounts": () => json({ account: {}, message: "Fuel added." }, 201),
    });
    show();
    await loaded();
    const user = userEvent.setup();
    await user.click(
      await card("Chart of accounts").findByRole("button", { name: /Add an account/ }),
    );
    const dialog = within(screen.getByRole("group", { name: "Add an account" }));
    const picker = dialog.getByRole("combobox", { name: /Account/ });
    await user.click(picker);
    // the note on top as the list opens, as Petty Cash Settings' Add New Method
    expect(dialog.getByText("Type an account name to add a new account")).toBeInTheDocument();
    await user.click(dialog.getByRole("option", { name: /Fuel/ }));
    expect(dialog.getByText("470 - Fuel")).toBeInTheDocument();
    expect(dialog.queryByLabelText(/Type/)).toBeNull(); // nothing to fill in
    await user.click(dialog.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Fuel added.")).toBeInTheDocument();
    expect(sent).toEqual([
      { method: "POST", path: "/api/me/company/accounts", body: { template_id: "t-fuel" } },
    ]);
  });

  it("nothing picked is said; a typed name opens the fields for one of the company's own", async () => {
    api({
      "GET /api/me/company/accounts": () => json(accounts()),
      "GET /api/me/company/contacts": () => json(contacts()),
      "POST /api/me/company/accounts": () => json({ account: {}, message: "Parking added." }, 201),
    });
    show();
    await loaded();
    const user = userEvent.setup();
    await user.click(
      await card("Chart of accounts").findByRole("button", { name: /Add an account/ }),
    );
    const dialog = within(screen.getByRole("group", { name: "Add an account" }));
    await user.click(dialog.getByRole("button", { name: "Add" }));
    expect(
      dialog.getByText("Pick one of Minty's accounts, or type a name to add your own."),
    ).toBeInTheDocument();
    await user.type(dialog.getByRole("combobox", { name: /Account/ }), "Parking");
    await user.click(dialog.getByRole("option", { name: "+ Add 'Parking' as a new account" }));
    expect(dialog.getByLabelText(/^Name/)).toHaveValue("Parking");

    await user.selectOptions(dialog.getByLabelText(/Type/), "expense");
    expect(dialog.getByLabelText(/Code/)).toHaveValue("478");
    expect(
      dialog.getByText("478 is the next free code for Expense. You can change it."),
    ).toBeInTheDocument();
    await user.clear(dialog.getByLabelText(/Code/));
    await user.type(dialog.getByLabelText(/Code/), "469");
    expect(
      dialog.getByText("The code 469 is already used by Rent. Choose another code."),
    ).toBeInTheDocument();
    await user.clear(dialog.getByLabelText(/Code/));
    await user.type(dialog.getByLabelText(/Code/), "471");
    await user.click(dialog.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Parking added.")).toBeInTheDocument();
    expect(sent).toEqual([
      {
        method: "POST",
        path: "/api/me/company/accounts",
        body: { code: "471", name: "Parking", type: "expense", description: "" },
      },
    ]);
  });

  it("a refused Save shows the API's field sentence under the field and keeps the form", async () => {
    api({
      "GET /api/me/company/accounts": () => json(accounts()),
      "GET /api/me/company/contacts": () => json(contacts()),
      "PATCH /api/me/company/accounts/a-wages": () =>
        json(
          {
            error: "The code 477 is already used by Tea. Choose another code.",
            fields: { code: "The code 477 is already used by Tea. Choose another code." },
          },
          409,
        ),
    });
    show();
    await loaded();
    const user = userEvent.setup();
    await user.click(
      await card("Chart of accounts").findByRole("button", { name: "Edit 477 - Wages" }),
    );
    const dialog = within(screen.getByRole("group", { name: "Edit Wages" }));
    await user.click(dialog.getByRole("button", { name: "Save" }));
    expect(
      await dialog.findByText("The code 477 is already used by Tea. Choose another code."),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Edit Wages" })).toBeInTheDocument();
  });

  it("a used account can't be deleted: the bin says why and sends nothing - no merge for accounts (owner, 2026-11-18; 2026-11-24)", async () => {
    const own = accounts().accounts.map((a) => ({ ...a, in_xero: false }));
    api({
      "GET /api/me/company/accounts": () => json(accounts({ accounts: own })),
      "GET /api/me/company/contacts": () => json(contacts()),
    });
    show();
    await loaded();
    const user = userEvent.setup();
    await user.click(
      await card("Chart of accounts").findByRole("button", { name: "Delete 469 - Rent" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Rent can't be deleted" });
    expect(dialog).toHaveTextContent(
      "Rent is already used in your records or Petty Cash Settings, so it can't be deleted.",
    );
    expect(within(dialog).queryByRole("button", { name: "Delete" })).toBeNull();
    // accounts are never merged (the user, 2026-11-24): no "Merge instead" for an account
    expect(within(dialog).queryByRole("button", { name: "Merge instead" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sent).toEqual([]);
  });

  it("an unused one asks first, then is deleted", async () => {
    api({
      "GET /api/me/company/accounts": () => json(accounts()),
      "GET /api/me/company/contacts": () => json(contacts()),
      "DELETE /api/me/company/accounts/a-wages": () => json({ message: "Wages deleted." }),
    });
    show();
    await loaded();
    const user = userEvent.setup();
    await user.click(
      await card("Chart of accounts").findByRole("button", { name: "Delete 477 - Wages" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Delete Wages?" });
    expect(dialog).toHaveTextContent("This can't be undone.");
    await user.click(within(dialog).getByRole("button", { name: "Go back" }));
    expect(sent).toEqual([]);
    await user.click(card("Chart of accounts").getByRole("button", { name: "Delete 477 - Wages" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Wages deleted.")).toBeInTheDocument();
    expect(sent).toEqual([
      { method: "DELETE", path: "/api/me/company/accounts/a-wages", body: null },
    ]);
  });
});

describe("merging contacts and Xero (owner's decisions doc M1-M4, A3, 2026-11-19)", () => {
  it("each account shows its Minty code and, once linked, its Xero code (the user, 2026-11-24)", async () => {
    const both = accounts().accounts.map((a) =>
      a.id === "a-rent" ? { ...a, code: "6100", xero_code: "469" } : { ...a, xero_code: "" },
    );
    api({
      "GET /api/me/company/accounts": () => json(accounts({ accounts: both })),
      "GET /api/me/company/contacts": () => json(contacts()),
    });
    show();
    await loaded();
    const chart = card("Chart of accounts");
    expect(await chart.findByText("6100 - Rent")).toBeInTheDocument();
    expect(chart.getByText("Xero code 469")).toBeInTheDocument();
    expect(chart.queryAllByText(/^Xero code/)).toHaveLength(1);
    const user = userEvent.setup();
    await user.type(chart.getByRole("searchbox"), "469");
    expect(chart.getByText("6100 - Rent")).toBeInTheDocument();
    expect(chart.queryByText("477 - Wages")).toBeNull();
  });

  it("an account gone from Xero says so and links to its one-account matching", async () => {
    const gone = accounts().accounts.map((a) =>
      a.id === "a-rent" ? { ...a, gone_from_xero: true } : a,
    );
    api({
      "GET /api/me/company/accounts": () => json(accounts({ xero_live: true, accounts: gone })),
      "GET /api/me/company/contacts": () => json(contacts()),
    });
    show();
    await loaded();
    const chart = card("Chart of accounts");
    expect(await chart.findByText("Archived in Xero")).toBeInTheDocument();
    expect(
      chart.getByText(
        /This account is archived in Xero. Please check it in Xero, then map this account/,
      ),
    ).toBeInTheDocument();
    const map = chart.getByRole("link", { name: "Map Rent to a Xero account" });
    expect(map.getAttribute("href")).toMatch(/\/settings\/integration\/match\?account=a-rent$/);
  });

  it("live on Xero, a contact linked to Xero is changed in Xero only: no Edit or Delete; Minty's own keep both (the user, 2026-11-19, 2026-11-23)", async () => {
    const linked = {
      id: "c-abc",
      name: "ABC Supplies",
      own: true,
      source: "xero",
      in_xero: true,
      xero_id: "x-abc",
      used: false,
    };
    api({
      "GET /api/me/company/accounts": () => json(accounts()),
      "GET /api/me/company/contacts": () =>
        json(contacts({ xero_live: true, contacts: [...contacts().contacts, linked] })),
    });
    show();
    await loaded();
    const people = card("Contacts");
    expect(await people.findByText("ABC Supplies")).toBeInTheDocument();
    expect(people.queryByRole("button", { name: "Edit ABC Supplies" })).toBeNull();
    expect(people.queryByRole("button", { name: "Delete ABC Supplies" })).toBeNull();
    expect(people.getByRole("button", { name: /Merge contacts/ })).toBeInTheDocument();
    expect(
      people.getByText("Contacts linked to Xero are changed in Xero, and Minty follows."),
    ).toBeInTheDocument();
    expect(people.getByRole("button", { name: "Edit Kee Wah" })).toBeInTheDocument();
  });

  const THREE = () =>
    contacts({
      contacts: [
        ...contacts().contacts,
        {
          id: "c-kee2",
          name: "Kee Wah Bakery",
          own: true,
          source: "user",
          in_xero: false,
          xero_id: null,
          used: true,
        },
      ],
    });

  it("contacts merge the Xero way: tick several, keep one of them, confirm, sent at once (the user, 2026-11-25)", async () => {
    api({
      "GET /api/me/company/accounts": () => json(accounts()),
      "GET /api/me/company/contacts": () => json(THREE()),
      "POST /api/me/company/contacts/merge": () =>
        json({
          message: "Walk-in Customer and Kee Wah Bakery merged into Kee Wah. Kee Wah stays.",
          kept: "c-kee",
          moved: { bill: 2 },
        }),
    });
    show();
    await loaded();
    const user = userEvent.setup();
    const people = card("Contacts");
    await user.click(await people.findByRole("button", { name: /Merge contacts/ }));

    const panel = within(screen.getByRole("region", { name: "Merge contacts" }));
    const merge = panel.getByRole("button", { name: "Merge" });
    expect(merge).toBeDisabled();
    expect(panel.getByText("Tick at least two contacts.")).toBeInTheDocument();
    // the dropdown offers only the ones ticked: never a new contact
    for (const name of ["Walk-in Customer", "Kee Wah", "Kee Wah Bakery"]) {
      await user.click(people.getByRole("checkbox", { name }));
    }
    expect(panel.getByText("3 contacts ticked")).toBeInTheDocument();
    expect(panel.getByText("Choose the one to keep.")).toBeInTheDocument();
    const keep = panel.getByLabelText("Keep this one");
    expect(
      within(keep)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Choose the one to keep", "Kee Wah", "Walk-in Customer", "Kee Wah Bakery"]);
    await user.selectOptions(keep, "c-kee");
    expect(
      panel.getByText(
        "Walk-in Customer and Kee Wah Bakery merge into Kee Wah. Kee Wah stays; the others leave every list. Xero isn't changed.",
      ),
    ).toBeInTheDocument();
    // unticking the kept one clears the choice
    await user.click(people.getByRole("checkbox", { name: /^Kee Wah$/ }));
    expect(panel.getByText("Choose the one to keep.")).toBeInTheDocument();
    await user.click(people.getByRole("checkbox", { name: /^Kee Wah$/ }));
    await user.selectOptions(keep, "c-kee");
    await user.click(merge);

    const confirm = screen.getByRole("dialog", { name: "Merge 2 contacts into Kee Wah?" });
    expect(confirm).toHaveTextContent(
      "The records of Walk-in Customer and Kee Wah Bakery move to Kee Wah, and they leave every list. Xero isn't changed. This can't be undone.",
    );
    expect(sent).toEqual([]);
    await user.click(within(confirm).getByRole("button", { name: "Merge" }));
    expect(
      await screen.findByText(
        "Walk-in Customer and Kee Wah Bakery merged into Kee Wah. Kee Wah stays.",
      ),
    ).toBeInTheDocument();
    expect(sent).toEqual([
      {
        method: "POST",
        path: "/api/me/company/contacts/merge",
        body: { ids: ["c-walk", "c-kee2", "c-kee"], keep: "c-kee" },
      },
    ]);
    expect(screen.queryByRole("region", { name: "Merge contacts" })).toBeNull();
  });

  const LINKED = {
    id: "c-abc",
    name: "ABC Supplies",
    own: true,
    source: "xero",
    in_xero: true,
    xero_id: "x-abc",
    used: false,
  };

  async function tickWithLinked(live: boolean) {
    api({
      "GET /api/me/company/accounts": () => json(accounts()),
      "GET /api/me/company/contacts": () =>
        json(contacts({ xero_live: live, contacts: [...contacts().contacts, LINKED] })),
    });
    show();
    await loaded();
    const user = userEvent.setup();
    const people = card("Contacts");
    await user.click(await people.findByRole("button", { name: /Merge contacts/ }));
    await user.click(people.getByRole("checkbox", { name: /^Kee Wah/ }));
    await user.click(people.getByRole("checkbox", { name: /^ABC Supplies/ }));
    const panel = within(screen.getByRole("region", { name: "Merge contacts" }));
    await user.selectOptions(panel.getByLabelText("Keep this one"), "c-kee");
    return { user, people, panel };
  }

  it("while Xero is connected, a ticked contact in Xero is merged in Xero first; Cancel leaves (2026-11-25)", async () => {
    const { user, people, panel } = await tickWithLinked(true);
    expect(panel.getByRole("button", { name: "Merge" })).toBeDisabled();
    expect(
      panel.getByText(
        "In Xero already: ABC Supplies. Your company is connected to Xero, so merge them in Xero first, and Minty follows at the next sync.",
      ),
    ).toBeInTheDocument();
    // two contacts only in Minty still merge here
    await user.click(people.getByRole("checkbox", { name: /^ABC Supplies/ }));
    await user.click(people.getByRole("checkbox", { name: /^Walk-in Customer/ }));
    expect(panel.getByRole("button", { name: "Merge" })).toBeEnabled();

    await user.click(panel.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("region", { name: "Merge contacts" })).toBeNull();
    expect(people.queryByRole("checkbox")).toBeNull();
    expect(sent).toEqual([]);
  });

  it("while Xero is off, a contact linked to it merges here, and the panel says Xero keeps it apart (2026-11-25)", async () => {
    const { panel } = await tickWithLinked(false);
    expect(panel.getByRole("button", { name: "Merge" })).toBeEnabled();
    expect(panel.getByRole("note")).toHaveTextContent(
      "ABC Supplies is linked to Xero. Xero keeps it as a separate contact: merge it there too when you reconnect.",
    );
  });

  it("a used contact can't be deleted; Merge instead opens the merge with it ticked", async () => {
    api({
      "GET /api/me/company/accounts": () => json(accounts()),
      "GET /api/me/company/contacts": () => json(THREE()),
    });
    show();
    await loaded();
    const user = userEvent.setup();
    await user.click(
      await card("Contacts").findByRole("button", { name: "Delete Kee Wah Bakery" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Kee Wah Bakery can't be deleted" });
    await user.click(within(dialog).getByRole("button", { name: "Merge instead" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(card("Contacts").getByRole("checkbox", { name: /^Kee Wah Bakery/ })).toBeChecked();
    expect(screen.getByText("1 contact ticked")).toBeInTheDocument();
  });
});

describe("a contact", () => {
  it("is added, a name already there refused as it is typed", async () => {
    api({
      "GET /api/me/company/accounts": () => json(accounts()),
      "GET /api/me/company/contacts": () => json(contacts()),
      "POST /api/me/company/contacts": () => json({ contact: {}, message: "Nina Ng added." }, 201),
    });
    show();
    await loaded();
    const user = userEvent.setup();
    await user.click(await card("Contacts").findByRole("button", { name: /Add a contact/ }));
    const dialog = within(screen.getByRole("group", { name: "Add a contact" }));
    await user.type(dialog.getByLabelText(/Name/), "kee wah");
    expect(
      dialog.getByText(
        "Kee Wah is already in your contacts. Use that one, or choose another name.",
      ),
    ).toBeInTheDocument();
    await user.clear(dialog.getByLabelText(/Name/));
    await user.type(dialog.getByLabelText(/Name/), "Nina  Ng{Enter}");
    expect(await screen.findByText("Nina Ng added.")).toBeInTheDocument();
    expect(sent).toEqual([
      { method: "POST", path: "/api/me/company/contacts", body: { name: "Nina Ng" } },
    ]);
  });
});

describe("the add form opens inline (owner, 2026-11-12: no dialog)", () => {
  it("sits at the top of its card, above the search and the list; the button comes back on Cancel or Escape", async () => {
    api({
      "GET /api/me/company/accounts": () => json(accounts()),
      "GET /api/me/company/contacts": () => json(contacts()),
    });
    show();
    await loaded();
    const user = userEvent.setup();
    const chart = card("Chart of accounts");

    await user.click(chart.getByRole("button", { name: /Add an account/ }));
    const form = chart.getByRole("group", { name: "Add an account" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(chart.queryByRole("button", { name: /Add an account/ })).toBeNull();
    const search = chart.getByRole("searchbox", { name: /Search accounts/ });
    expect(form.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(chart.queryByRole("group", { name: "Add an account" })).toBeNull();
    await user.click(chart.getByRole("button", { name: /Add an account/ }));
    await user.keyboard("{Escape}"); // closes the picker's list first
    await user.keyboard("{Escape}");
    expect(chart.queryByRole("group", { name: "Add an account" })).toBeNull();
    expect(chart.getByRole("button", { name: /Add an account/ })).toBeInTheDocument();
  });
});

// Auto-saved drafts (the owner's decisions doc L1; @minty/shared/drafts): the add / edit account
// form keeps what was typed in this browser 2 s after the last change (record `new` or the
// account's id), put back at once when the form opens again - no notice (the user, 2026-11-24); a
// save that went through and Cancel remove it; an account saved since makes it stale (dropped
// silently, never put back).
describe("the account form's auto-saved draft", () => {
  const NEW = draftKey({ userId: "u1", entityId: ID }, "settings.account", "new");
  const WAGES = draftKey({ userId: "u1", entityId: ID }, "settings.account", "a-wages");
  const wait2s = () =>
    act(async () => {
      vi.advanceTimersByTime(2100);
    });
  const mount = () =>
    render(
      <ToastProvider>
        <ChartSection entityId={COMPANY.id} entityName={COMPANY.name} />
      </ToastProvider>,
    );
  const reads = {
    "GET /api/me/company/accounts": () => json(accounts()),
    "GET /api/me/company/contacts": () => json(contacts()),
  };
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  async function typeParking(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await card("Chart of accounts").findByRole("button", { name: /Add an account/ }),
    );
    const form = within(screen.getByRole("group", { name: "Add an account" }));
    await user.type(form.getByRole("combobox", { name: /Account/ }), "Parking");
    await user.click(form.getByRole("option", { name: "+ Add 'Parking' as a new account" }));
    await user.selectOptions(form.getByLabelText(/Type/), "expense");
    return form;
  }

  it("a new account: kept 2 s after typing, back at once when Add opens again, with no notice", async () => {
    api(reads);
    const first = mount();
    await loaded();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await typeParking(user);
    await wait2s();
    const kept = JSON.parse(localStorage.getItem(NEW) ?? "null");
    expect(kept.value).toMatchObject({
      pick: "new",
      input: { name: "Parking", type: "expense", code: "478" },
    });
    first.unmount();

    mount();
    await loaded();
    await user.click(
      await card("Chart of accounts").findByRole("button", { name: /Add an account/ }),
    );
    const form = within(screen.getByRole("group", { name: "Add an account" }));
    expect(await form.findByLabelText(/^Name/)).toHaveValue("Parking");
    expect(form.getByLabelText(/Type/)).toHaveValue("expense");
    expect(form.getByLabelText(/Code/)).toHaveValue("478");
    expect(form.queryByText(/unsaved changes/)).toBeNull();
    expect(form.queryByRole("button", { name: "Restore" })).toBeNull();
  });

  it("Cancel closes the form and its draft goes with it", async () => {
    api(reads);
    mount();
    await loaded();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const form = await typeParking(user);
    await wait2s();
    expect(localStorage.getItem(NEW)).not.toBeNull();
    await user.click(form.getByRole("button", { name: "Cancel" }));
    await wait2s();
    expect(localStorage.getItem(NEW)).toBeNull();
  });

  it("a save that went through removes it", async () => {
    api({
      ...reads,
      "POST /api/me/company/accounts": () => json({ account: {}, message: "Parking added." }, 201),
    });
    mount();
    await loaded();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const form = await typeParking(user);
    await wait2s();
    expect(localStorage.getItem(NEW)).not.toBeNull();
    await user.click(form.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Parking added.")).toBeInTheDocument();
    await wait2s();
    expect(localStorage.getItem(NEW)).toBeNull();
  });

  it("an edit saved since by someone else: dropped silently, never put back", async () => {
    writeDraft(WAGES, {
      v: 1,
      form: "settings.account",
      record: "a-wages",
      shape: 1,
      userId: "u1",
      entityId: ID,
      savedAt: Date.now(),
      basedOn: "an-older-save",
      value: {
        pick: "new",
        text: "",
        input: { code: "477", name: "Staff wages", type: "expense", description: "" },
        codeTouched: true,
      },
      files: [],
      missing: [],
    });
    api(reads);
    mount();
    await loaded();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(
      await card("Chart of accounts").findByRole("button", { name: "Edit 477 - Wages" }),
    );
    const form = within(screen.getByRole("group", { name: "Edit Wages" }));
    await waitFor(() => expect(localStorage.getItem(WAGES)).toBeNull());
    expect(form.getByLabelText(/^Name/)).toHaveValue("Wages");
    expect(form.queryByText(/unsaved changes/)).toBeNull();
    expect(form.queryByRole("button", { name: "Show what I typed" })).toBeNull();
  });
});
