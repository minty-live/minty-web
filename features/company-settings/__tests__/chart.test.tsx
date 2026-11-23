// General's chart of accounts and contacts as a person uses them (owner, 2026-11-12; their own tab
// first, merged into General the same day): the two lists, Edit and Delete on every row, the add
// form with the next free code filled in, delete asking first, the API's sentences shown, and a
// view-only person shown the lists alone (General's own view-only line says why). accounts-api is
// answered per path and method; every call names the company as ?entity=.

import { act, render, screen, within } from "@testing-library/react";
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
  it("show Edit, Delete and Merge on the company's rows while Xero is off", async () => {
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
    expect(chart.getByRole("button", { name: "Merge 477 - Wages" })).toBeInTheDocument();
    expect(chart.getByRole("button", { name: /Add an account/ })).toBeInTheDocument();
    expect(chart.getByText("Comes with Minty")).toBeInTheDocument();

    const people = card("Contacts");
    expect(people.getByRole("button", { name: "Edit Kee Wah" })).toBeInTheDocument();
    expect(people.getByRole("button", { name: "Delete Walk-in Customer" })).toBeInTheDocument();
    expect(people.getByRole("button", { name: /Add a contact/ })).toBeInTheDocument();
  });

  it("while Xero is connected no account is added, edited or deleted here, contacts still are - Merge stays (the user, 2026-11-23)", async () => {
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
      expect(chart.getByRole("button", { name: `Merge ${row}` })).toBeInTheDocument();
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
      expect(people.getByRole("button", { name: `Merge ${row}` })).toBeInTheDocument();
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

  it("a used account can't be deleted: the bin says why, sends nothing and offers Merge (owner, 2026-11-18)", async () => {
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
    // D3 (owner's decisions doc): the way out is a merge
    expect(within(dialog).getByRole("button", { name: "Merge instead" })).toBeInTheDocument();
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

describe("merging and Xero (owner's decisions doc M1-M4, A3, 2026-11-19)", () => {
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

  it("live on Xero, a contact linked to Xero is changed in Xero only: no Edit or Delete, still Merge; Minty's own keep both (the user, 2026-11-19, 2026-11-23)", async () => {
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
    expect(people.getByRole("button", { name: "Merge ABC Supplies" })).toBeInTheDocument();
    expect(
      people.getByText("Contacts linked to Xero are changed in Xero, and Minty follows."),
    ).toBeInTheDocument();
    expect(people.getByRole("button", { name: "Edit Kee Wah" })).toBeInTheDocument();
  });

  it("merging asks which one is kept, then confirms, then sends it", async () => {
    api({
      "GET /api/me/company/accounts": () => json(accounts({ xero_live: true })),
      "GET /api/me/company/contacts": () => json(contacts()),
      "POST /api/me/company/accounts/a-wages/merge": () =>
        json({ message: "Wages merged into Rent.", moved: { report_expense: 3 } }),
    });
    show();
    await loaded();
    const user = userEvent.setup();
    await user.click(
      await card("Chart of accounts").findByRole("button", { name: "Merge 477 - Wages" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Merge Wages" });
    expect(within(dialog).getByRole("button", { name: "Merge" })).toBeDisabled();
    expect(within(dialog).getByText("Choose the account to merge Wages with.")).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText("Merge with"), "a-rent");
    await user.click(within(dialog).getByRole("radio", { name: "Keep Rent" }));
    await user.click(within(dialog).getByRole("button", { name: "Merge" }));

    const confirm = screen.getByRole("dialog", { name: /Merge Wages into Rent\?/ });
    expect(confirm).toHaveTextContent(
      "Wages's records move to Rent, and Wages leaves every list. Xero isn't changed. This can't be undone.",
    );
    expect(sent).toEqual([]);
    await user.click(within(confirm).getByRole("button", { name: "Merge" }));
    expect(await screen.findByText("Wages merged into Rent.")).toBeInTheDocument();
    expect(sent).toEqual([
      { method: "POST", path: "/api/me/company/accounts/a-wages/merge", body: { into: "a-rent" } },
    ]);
  });

  it("only accounts of the same kind are offered to merge with", async () => {
    const mixed = [
      ...accounts().accounts,
      {
        ...accounts().accounts[0],
        id: "a-bank",
        code: "090",
        name: "HSBC",
        type: "bank",
        type_label: "Bank",
      },
    ];
    api({
      "GET /api/me/company/accounts": () => json(accounts({ xero_live: true, accounts: mixed })),
      "GET /api/me/company/contacts": () => json(contacts()),
    });
    show();
    await loaded();
    const user = userEvent.setup();
    await user.click(
      await card("Chart of accounts").findByRole("button", { name: "Merge 477 - Wages" }),
    );
    const options = within(screen.getByRole("dialog", { name: "Merge Wages" }))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["Choose an account", "469 - Rent"]);
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
// account's id), offered when the form opens again (Restore / Discard); a save that went through,
// Cancel and Discard remove it; an account saved since makes it stale (shown, never put back).
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

  it("a new account: kept 2 s after typing, offered when Add opens again, Restore puts it back", async () => {
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
    expect(await form.findByText(/You have unsaved changes from \d\d:\d\d\./)).toBeInTheDocument();
    expect(form.queryByLabelText(/^Name/)).toBeNull();
    await user.click(form.getByRole("button", { name: "Restore" }));
    expect(form.getByLabelText(/^Name/)).toHaveValue("Parking");
    expect(form.getByLabelText(/Type/)).toHaveValue("expense");
    expect(form.getByLabelText(/Code/)).toHaveValue("478");
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

  it("Discard removes it and leaves the form empty", async () => {
    api(reads);
    const first = mount();
    await loaded();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await typeParking(user);
    await wait2s();
    first.unmount();

    mount();
    await loaded();
    await user.click(
      await card("Chart of accounts").findByRole("button", { name: /Add an account/ }),
    );
    const form = within(screen.getByRole("group", { name: "Add an account" }));
    await user.click(await form.findByRole("button", { name: "Discard" }));
    expect(localStorage.getItem(NEW)).toBeNull();
    expect(form.getByRole("combobox", { name: /Account/ })).toHaveValue("");
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

  it("an edit saved since by someone else: shown, never put back", async () => {
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
    expect(
      await form.findByText(/This was saved again after your unsaved changes/),
    ).toBeInTheDocument();
    expect(form.queryByRole("button", { name: "Restore" })).toBeNull();
    await user.click(form.getByRole("button", { name: "Show what I typed" }));
    expect(form.getByText("Staff wages", { selector: "dd" })).toBeInTheDocument();
    expect(form.getByLabelText(/^Name/)).toHaveValue("Wages");
  });
});
