// Match your accounts to Xero (`/entity/<shortid>/<name>/settings/integration/match`; the user's rules
// of 2026-11-24) over a STUBBED accounts-api, on a phone first: every account needs its own Xero account
// (one another account has is shown, never picked), the ones still to match come first and stay put while
// picked, Next goes on to the contacts step - a supplier new in Xero, a daily-closing contact picked from
// the searchable list - and Finish confirms and connects. Nothing wider than the screen at 360 / 768 /
// 1440, the contact list open included.

import { expect, test, type Page, type Route } from "@playwright/test";

import { ACCOUNTS_API_URL, credentials, handoff, requireApp } from "../../../e2e/helpers";

const ID = "360812e1-9f94-46a3-aa31-347e21afde8e";
const NAME = "Olive & Vine";
const PAGE = "/entity/360812e1/olive-and-vine/settings/integration/match";
const STUB_CREDS = {
  secret: "stub-api-never-sees-this",
  userId: "u-e2e",
  entityId: ID,
  entityName: NAME,
};
const creds = () => ({ ...(credentials() ?? STUB_CREDS), entityId: ID, entityName: NAME });

type Sent = { method: string; path: string; body: unknown };
type Pick = { xero_account_id: string; auto: boolean } | null;
type Answer = { xero_contact_id: string | null; auto: boolean; new: boolean } | null;

const OPTIONS = [
  { id: "x-pc", code: "090", name: "Petty Cash", kind: "bank" },
  { id: "x-rent", code: "469", name: "Rent", kind: "expense" },
  { id: "x-wages", code: "477", name: "Wages and Salaries", kind: "expense" },
  { id: "x-lic", code: "485", name: "Subscriptions", kind: "expense" },
];
const ROWS = [
  {
    id: "a-pc",
    code: "1000",
    name: "Petty Cash",
    kind: "bank",
    group: "Cash & bank",
    key: "cash_bank",
  },
  {
    id: "a-rent",
    code: "469",
    name: "Rent",
    kind: "expense",
    group: "Running the business",
    key: "running",
  },
  {
    id: "a-wages",
    code: "6001",
    name: "Salaries - Full Time",
    kind: "expense",
    group: "Running the business",
    key: "running",
  },
  {
    id: "a-lic",
    code: "6999",
    name: "Licences",
    kind: "expense",
    group: "Running the business",
    key: "running",
  },
];
const CONTACT_OPTIONS = [
  { id: "xc-abc", name: "ABC Supplies" },
  { id: "xc-ada", name: "Ada Director" },
  // a long list: the picker shows the first 50 and asks for more typing
  ...Array.from({ length: 80 }, (_, i) => ({ id: `xc-${i}`, name: `Supplier ${i + 1}` })),
];

async function arrive(page: Page): Promise<Sent[]> {
  const sent: Sent[] = [];
  const picks: Record<string, Pick> = {
    "a-pc": { xero_account_id: "x-pc", auto: true },
    "a-rent": { xero_account_id: "x-rent", auto: true },
    "a-wages": null,
    "a-lic": null,
  };
  const suppliers: Record<string, Answer> = {
    "c-abc": { xero_contact_id: "xc-abc", auto: true, new: false },
    "c-wing": null,
  };
  let director: Answer = null;

  const read = () => {
    const rows = ROWS.map((r) => ({
      account_id: r.id,
      code: r.code,
      name: r.name,
      type: r.kind,
      kind: r.kind,
      group: r.group,
      used: r.id !== "a-lic",
      system: false,
      pick: picks[r.id],
      suggestion: r.id === "a-wages" && !picks[r.id] ? "x-wages" : null,
      conflict: null,
      key: r.key,
    }));
    const unmatched = rows.filter((r) => !r.pick);
    const groups = [
      ...(unmatched.length
        ? [{ key: "unmatched", title: "Not matched yet", rows: unmatched }]
        : []),
      ...[
        ["cash_bank", "Cash & bank"],
        ["running", "Running the business"],
      ]
        .map(([key, title]) => ({ key, title, rows: rows.filter((r) => r.pick && r.key === key) }))
        .filter((g) => g.rows.length),
    ];
    const holder = Object.fromEntries(
      Object.entries(picks)
        .filter(([, p]) => p)
        .map(([id, p]) => [p!.xero_account_id, ROWS.find((r) => r.id === id)!.name]),
    );
    const blockingContacts = Object.values(suppliers).filter((a) => !a).length + (director ? 0 : 1);
    return {
      organisation: "Olive Ltd",
      reason: "first",
      groups,
      options: OPTIONS.map((o) => ({ ...o, held_by: holder[o.id] ?? null })),
      matched: rows.length - unmatched.length,
      total: rows.length,
      blocking: unmatched.length,
      contacts: {
        required: true,
        suppliers: [
          { contact_id: "c-abc", name: "ABC Supplies", pick: suppliers["c-abc"] },
          { contact_id: "c-wing", name: "Wing Lee Trading Co.", pick: suppliers["c-wing"] },
        ],
        slots: [{ slot: "director", pick: director }],
        options: CONTACT_OPTIONS,
        blocking: blockingContacts,
      },
      pending: { accounts: true, contacts: false, reason: "first" },
      failed_contacts: [],
      can_edit: true,
    };
  };

  await page.route(`${ACCOUNTS_API_URL}/api/me/company/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204 });
    const url = new URL(req.url());
    expect(url.searchParams.get("entity")).toBe(ID);
    const path = url.pathname.replace("/api/me/company", "");
    const body = req.postData() ? JSON.parse(req.postData() as string) : null;
    if (req.method() !== "GET") sent.push({ method: req.method(), path, body });
    if (path === "/xero/matching" && req.method() === "GET") return route.fulfill({ json: read() });
    if (path === "/xero/matching/refresh") return route.fulfill({ json: read() });
    if (path === "/xero/matching" && req.method() === "PATCH") {
      picks[body.account_id] = body.xero_account_id
        ? { xero_account_id: body.xero_account_id, auto: false }
        : null;
      return route.fulfill({ json: read() });
    }
    if (path === "/xero/matching/contacts" && req.method() === "PATCH") {
      const answer = body.new
        ? { xero_contact_id: null, auto: false, new: true }
        : { xero_contact_id: body.xero_contact_id, auto: false, new: false };
      if (body.contact_id) suppliers[body.contact_id] = answer;
      else director = answer;
      return route.fulfill({ json: read() });
    }
    if (path === "/xero/matching/finish") {
      return route.fulfill({
        json: { ...read(), pending: { accounts: false, contacts: false }, connected: true },
      });
    }
    return route.fulfill({ status: 404, json: { error: "Not stubbed" } });
  });
  await handoff(page, creds(), PAGE);
  return sent;
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const width of [360, 768, 1440]) {
  test(`matching: every account, then the contacts, then Finish, at ${width}px`, async ({
    page,
  }) => {
    await requireApp();
    await page.setViewportSize({ width, height: 900 });
    const sent = await arrive(page);

    // the ones still to match first; every row is required; one another account has can't be picked
    const unmatched = page.getByRole("heading", { name: /^Not matched yet/ });
    await expect(unmatched).toBeVisible();
    const lic = page.getByRole("combobox", { name: /Xero account for 6999 Licences/ });
    await expect(lic).toHaveAttribute("aria-required", "true");
    await expect(lic.getByRole("option", { name: "469 · Rent - matched to Rent" })).toHaveAttribute(
      "disabled",
      "",
    );
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({
      path: `test-results/14_matching_accounts_${width}.png`,
      fullPage: true,
    });

    await expect(page.getByRole("button", { name: "Next: contacts" })).toBeDisabled();
    await lic.selectOption("x-lic");
    await page
      .getByRole("combobox", { name: /Xero account for 6001 Salaries - Full Time/ })
      .selectOption("x-wages");
    // picked rows stay where the person is working
    await expect(unmatched).toHaveText("Not matched yet · 2 of 2 matched");
    await page.getByRole("button", { name: "Next: contacts" }).click();

    await expect(page.getByRole("heading", { name: "Choose your contacts in Xero" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Finish" })).toBeDisabled();
    await page.getByRole("combobox", { name: "Xero contact for Wing Lee Trading Co." }).click();
    await page.getByRole("option", { name: /New in Xero/ }).click();
    const director = page.getByRole("combobox", {
      name: "Xero contact for The person who pays personally",
    });
    await director.click();
    await expect(page.getByText("Keep typing to find more")).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({
      path: `test-results/14_matching_contacts_list_${width}.png`,
      fullPage: true,
    });
    await director.fill("Ada");
    await page.getByRole("option", { name: "Ada Director" }).click();
    await expect(page.getByText("Every contact has its answer.")).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({
      path: `test-results/14_matching_contacts_${width}.png`,
      fullPage: true,
    });

    await page.getByRole("button", { name: "Finish" }).click();
    const confirm = page.getByRole("dialog", { name: "Finish matching?" });
    await expect(confirm).toContainText("its Minty code stays");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await confirm.getByRole("button", { name: "Finish" }).click();
    await expect.poll(() => sent.some((s) => s.path === "/xero/matching/finish")).toBe(true);
    expect(sent.filter((s) => s.method === "PATCH").map((s) => s.body)).toEqual([
      { account_id: "a-lic", xero_account_id: "x-lic" },
      { account_id: "a-wages", xero_account_id: "x-wages" },
      { contact_id: "c-wing", new: true },
      { slot: "director", xero_contact_id: "xc-ada" },
    ]);
  });
}
