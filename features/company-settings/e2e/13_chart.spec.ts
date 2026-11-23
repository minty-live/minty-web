// General's chart of accounts and contacts (`/entity/<shortid>/<name>/settings/general`, owner
// 2026-11-12; their own tab first, merged into General the same day) over a STUBBED accounts-api: on a phone, add an account (the next free code filled in), rename a
// contact, delete one after its confirm - each the API's at once - and Minty's own rows locked.
// Nothing wider than the screen at 360 / 768 / 1440, with a dialog open too.

import { expect, test, type Page, type Route } from "@playwright/test";

import {
  ACCOUNTS_API_URL,
  SUBSCRIPTION_API_URL,
  credentials,
  handoff,
  requireApp,
} from "../../../e2e/helpers";

const ID = "360812e1-9f94-46a3-aa31-347e21afde8e";
const NAME = "Olive & Vine";
const PAGE = "/entity/360812e1/olive-and-vine/settings/general";
/** General's own read (the company's details), answered so the page draws. */
const DETAILS = {
  company: {
    id: "360812e1-9f94-46a3-aa31-347e21afde8e",
    name: "Olive & Vine",
    country_code: "HK",
    currency_id: "c-hkd",
  },
  modules: ["PETTY_CASH", "PAYMENT_REQUEST"],
  countries: [{ code: "HK", name: "Hong Kong" }],
  currencies: [{ id: "c-hkd", name: "Hong Kong Dollar" }],
  xero: {
    status: "not_connected",
    connected: false,
    needs_reconnect: false,
    organisation: null,
    last_connected_at: null,
  },
  can_edit: true,
  can_rename: true,
  notices: [],
};
const STUB_CREDS = {
  secret: "stub-api-never-sees-this",
  userId: "u-e2e",
  entityId: ID,
  entityName: NAME,
};
const creds = () => ({ ...(credentials() ?? STUB_CREDS), entityId: ID, entityName: NAME });
const ALL = { add: true, edit: true, delete: true };

type Sent = { method: string; path: string; body: unknown };

function account(id: string, code: string, name: string, over = {}) {
  return {
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
    ...over,
  };
}

async function arrive(page: Page, live = false): Promise<Sent[]> {
  const sent: Sent[] = [];
  const state = {
    accounts: [
      account("a-rent", "469", "Rent", { used: true }),
      account("a-wages", "477", "Wages", { source: "template" }),
      // gone from Xero (owner's decisions doc A3): the line under it and Map it
      account("a-old", "468", "Old Rent", { in_xero: true, gone_from_xero: true, used: true }),
    ],
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
  };
  await page.route(`${ACCOUNTS_API_URL}/api/me/company/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204 });
    const url = new URL(req.url());
    expect(url.searchParams.get("entity")).toBe(ID);
    const path = url.pathname.replace("/api/me/company", "");
    const body = req.postData() ? JSON.parse(req.postData() as string) : null;
    if (req.method() === "GET" && path === "/integration") return route.fulfill({ json: DETAILS });
    if (req.method() === "GET" && path === "/accounts")
      return route.fulfill({
        json: {
          accounts: state.accounts,
          types: [
            { value: "bank", label: "Bank" },
            { value: "expense", label: "Expense" },
          ],
          next_codes: { bank: "090", expense: "478" },
          minty_accounts: [
            {
              id: "t-parking",
              code: "472",
              name: "Parking",
              type: "expense",
              type_label: "Expense",
              description: "",
            },
          ],
          xero_live: live,
          permissions: ALL,
        },
      });
    if (req.method() === "GET" && path === "/contacts")
      return route.fulfill({
        json: { contacts: state.contacts, xero_live: live, permissions: ALL },
      });
    sent.push({ method: req.method(), path, body });
    if (req.method() === "POST" && path === "/accounts") {
      state.accounts = [...state.accounts, account("a-new", body.code, body.name)];
      return route.fulfill({ status: 201, json: { account: {}, message: `${body.name} added.` } });
    }
    if (req.method() === "PATCH" && path === "/contacts/c-kee") {
      state.contacts = state.contacts.map((c) =>
        c.id === "c-kee" ? { ...c, name: body.name } : c,
      );
      return route.fulfill({ json: { contact: {}, message: `${body.name} saved.` } });
    }
    if (req.method() === "DELETE" && path === "/contacts/c-kee") {
      state.contacts = state.contacts.filter((c) => c.id !== "c-kee");
      return route.fulfill({ json: { message: "Kee Wah Bakery deleted." } });
    }
    return route.fulfill({ status: 404, json: { error: "not_found" } });
  });
  await page.route(`${ACCOUNTS_API_URL}/api/me/profile**`, (route) =>
    route.fulfill({
      json: {
        user: {
          id: "u1",
          first_name: "Ada",
          last_name: "Admin",
          name: "Ada Admin",
          initials: "AA",
          email: "ada@test.com",
        },
        entity: null,
      },
    }),
  );
  await page.route(`${SUBSCRIPTION_API_URL}/api/me/subscriptions**`, (route) =>
    route.fulfill({ status: 404, json: { error: "not_found" } }),
  );
  await handoff(page, creds(), PAGE);
  await expect(page.getByRole("region", { name: "Chart of accounts" })).toBeVisible();
  return sent;
}

const toast = (page: Page, text: string) =>
  page.locator("[data-toast-type]").filter({ hasText: text });
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.describe("accounts and contacts", () => {
  test.beforeEach(async () => {
    await requireApp();
  });

  test("on a phone: add an account, rename then delete a contact; Minty's copies marked", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const sent = await arrive(page);
    const chart = page.getByRole("region", { name: "Chart of accounts" });
    await expect(chart.getByRole("button", { name: "Edit 477 - Wages" })).toBeVisible();
    await expect(chart.getByText("Comes with Minty")).toBeVisible();

    // a used account can't be deleted (owner, 2026-11-18): its bin says why and sends nothing
    await chart.getByRole("button", { name: "Delete 469 - Rent" }).click();
    const stays = page.getByRole("dialog", { name: "Rent can't be deleted" });
    await expect(stays).toContainText(
      "Rent is already used in your records or Petty Cash Settings, so it can't be deleted.",
    );
    await expect(stays.getByRole("button", { name: "Delete" })).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await stays.getByRole("button", { name: "Close" }).click();
    await expect(stays).toHaveCount(0);

    await chart.getByRole("button", { name: /Add an account/ }).click();
    const form = page.getByRole("group", { name: "Add an account" });
    // Minty's accounts in the dropdown, the note on top; a typed name not there is a new one
    const picker = form.getByRole("combobox", { name: /Account/ });
    await picker.click();
    await expect(form.getByText("Type an account name to add a new account")).toBeVisible();
    await expect(form.getByRole("option", { name: /Parking/ })).toBeVisible();
    await picker.fill("Fuel");
    await form.getByRole("option", { name: "+ Add 'Fuel' as a new account" }).click();
    await expect(form.getByLabel(/^Name/)).toHaveValue("Fuel");
    await form.getByLabel(/Type/).selectOption("expense");
    await expect(form.getByLabel(/Code/)).toHaveValue("478");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await form.getByRole("button", { name: "Add" }).click();
    await expect(toast(page, "Fuel added.")).toBeVisible();
    await expect(chart.getByText("478 - Fuel")).toBeVisible();

    const people = page.getByRole("region", { name: "Contacts" });
    await people.getByRole("button", { name: "Edit Kee Wah" }).click();
    const rename = page.getByRole("group", { name: "Rename Kee Wah" });
    await rename.getByLabel(/Name/).fill("Kee Wah Bakery");
    await rename.getByLabel(/Name/).press("Enter");
    await expect(toast(page, "Kee Wah Bakery saved.")).toBeVisible();

    await people.getByRole("button", { name: "Delete Kee Wah Bakery" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete Kee Wah Bakery?" });
    await expect(confirm).toContainText("This can't be undone.");
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(toast(page, "Kee Wah Bakery deleted.")).toBeVisible();
    await expect(people.getByText("Kee Wah Bakery")).toHaveCount(0);

    expect(sent).toEqual([
      {
        method: "POST",
        path: "/accounts",
        body: { code: "478", name: "Fuel", type: "expense", description: "" },
      },
      { method: "PATCH", path: "/contacts/c-kee", body: { name: "Kee Wah Bakery" } },
      { method: "DELETE", path: "/contacts/c-kee", body: null },
    ]);
  });
});

for (const width of [360, 768, 1440]) {
  test(`accounts and contacts: nothing is wider than the screen at ${width}px`, async ({
    page,
  }) => {
    await requireApp();
    await page.setViewportSize({ width, height: 900 });
    await arrive(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: /Add a contact/ }).click();
    await expect(page.getByRole("group", { name: "Add a contact" })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Delete 469 - Rent" }).click();
    await expect(page.getByRole("dialog", { name: "Rent can't be deleted" })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page
      .getByRole("dialog", { name: "Rent can't be deleted" })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    // an account gone from Xero says so; the merge dialog fits too (doc A3, M1)
    await expect(page.getByRole("link", { name: "Map Old Rent to a Xero account" })).toBeVisible();
    await page.getByRole("button", { name: "Merge 477 - Wages" }).click();
    await expect(page.getByRole("dialog", { name: "Merge Wages" })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/13_chart_merge_${width}.png`, fullPage: true });
  });
}

// Live on Xero (the user, 2026-11-23): no Add, Edit or Delete anywhere - Merge stays - and each card
// says where the change is made.
for (const width of [360, 768, 1440]) {
  test(`live on Xero: no account to add, edit or delete, contacts still, Merge kept, at ${width}px`, async ({
    page,
  }) => {
    await requireApp();
    await page.setViewportSize({ width, height: 900 });
    const sent = await arrive(page, true);
    const chart = page.getByRole("region", { name: "Chart of accounts" });
    const people = page.getByRole("region", { name: "Contacts" });
    await expect(
      chart.getByText(
        "Your company is connected to Xero, so accounts are added and changed in Xero, and Minty follows.",
      ),
    ).toBeVisible();
    await expect(chart.getByRole("button", { name: /^Add an account$/ })).toHaveCount(0);
    await expect(chart.getByRole("button", { name: /^(Edit|Delete) / })).toHaveCount(0);
    await expect(chart.getByRole("button", { name: "Merge 477 - Wages" })).toBeVisible();
    // contacts are saved in Minty first, live or not (the user, 2026-11-23)
    await expect(people.getByRole("button", { name: /Add a contact/ })).toBeVisible();
    await expect(people.getByRole("button", { name: "Edit Kee Wah" })).toBeVisible();
    await expect(people.getByRole("button", { name: "Delete Kee Wah" })).toBeVisible();
    await expect(people.getByRole("button", { name: "Merge Kee Wah" })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/13_chart_live_${width}.png`, fullPage: true });
    expect(sent).toEqual([]);
  });
}
