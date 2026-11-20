// "AI allowances" on Select Company in a browser (owner, 2026-11-18; a list mode like "Archive
// companies" since 2026-11-19), over a STUBBED accounts-api: `/api/me/entities` and `/api/me/ai/*`
// are answered by page.route. Phone first, then tablet and desktop, with no sideways scroll.
// minty-accounts-api's hub/tests/test_ai_grants.py covers the API.
import { expect, test, type Page } from "@playwright/test";

import {
  ACCOUNTS_API_URL,
  SUBSCRIPTION_API_URL,
  credentials,
  handoff,
  requireApp,
} from "../../../e2e/helpers";
import { SUPERUSER } from "../__fixtures__/entities";

const STUB_CREDS = { secret: "stub-never-sent", userId: "u-e2e", entityId: "", entityName: "" };
const creds = () => ({ ...(credentials() ?? STUB_CREDS), entityId: "", entityName: "" });
const FIVE = SUPERUSER.entities.find((e) => e.id === "e-scenario-5")!;

const COMPANY = {
  company: { id: FIVE.id, name: FIVE.name },
  allowance: {
    percent_left: 0,
    blocked: true,
    resumes_at: null,
    reads_left: null,
    reads_limit: null,
  },
  default_grant: { tokens: 20000, reads: null, days: null },
  grants: [
    {
      id: "g1",
      source: "default",
      tokens_total: 20000,
      tokens_used: 21000,
      reads_total: null,
      reads_used: 4,
      expires_at: null,
      open: false,
      granted_by: "ai_policy",
      note: null,
      created_at: "2026-11-10T08:00:00Z",
    },
  ],
  reads: [
    {
      id: "r1",
      created_at: "2026-11-18T08:00:00Z",
      module: "petty_cash",
      status: "ok",
      model: "gemini-3.5-flash-lite",
      attempts: "gemini-3.5-flash-lite:ok",
      tokens: 5200,
    },
  ],
  reads_more: true,
};

async function stub(page: Page): Promise<unknown[]> {
  const given: unknown[] = [];
  const json = (body: unknown, status = 200) => ({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route(`${ACCOUNTS_API_URL}/api/me/entities**`, (route) =>
    route.fulfill(json(SUPERUSER)),
  );
  await page.route(`${ACCOUNTS_API_URL}/api/me/ai/companies**`, (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST") {
      given.push(route.request().postDataJSON());
      const grant = {
        ...COMPANY.grants[0],
        id: "g2",
        source: "manual",
        tokens_total: 50000,
        tokens_used: 0,
        reads_used: 0,
        open: true,
        granted_by: "boss@dailyminty.com",
        note: "pilot",
        created_at: "2026-11-18T09:00:00Z",
      };
      return route.fulfill(
        json(
          {
            ...COMPANY,
            allowance: { ...COMPANY.allowance, percent_left: 100, blocked: false },
            grants: [grant, ...COMPANY.grants],
            message: `Grant given to ${FIVE.name}.`,
          },
          201,
        ),
      );
    }
    if (url.pathname.endsWith("/reads"))
      return route.fulfill(
        json({
          reads: [
            {
              id: "r0",
              created_at: "2026-11-17T08:00:00Z",
              module: "payment_request",
              status: "failed",
              model: null,
              attempts: "gemini-3.5-flash-lite:timeout",
              tokens: 0,
            },
          ],
          more: false,
        }),
      );
    if (url.pathname.endsWith("/companies")) {
      const ids = (url.searchParams.get("ids") ?? "").split(",");
      const companies = ids.map((id) => ({
        id,
        name: id,
        percent_left: id === FIVE.id ? 0 : 100,
        blocked: id === FIVE.id,
        tokens_used: id === FIVE.id ? null : 0,
        tokens_given: id === FIVE.id ? null : 20000,
        has_grant: id === FIVE.id,
        reads: id === FIVE.id ? 4 : 0,
        last_read_at: id === FIVE.id ? "2026-11-18T08:00:00Z" : null,
      }));
      return route.fulfill(json({ companies, page: 1, page_size: ids.length, total: ids.length }));
    }
    return route.fulfill(json(COMPANY));
  });
  await page.route(`${ACCOUNTS_API_URL}/api/me/profile**`, (route) =>
    route.fulfill(
      json({ user: { id: "u-e2e", name: "Boss", initials: "BS", email: "b@x.com" }, entity: null }),
    ),
  );
  await page.route(`${SUBSCRIPTION_API_URL}/api/me/subscriptions**`, (route) =>
    route.fulfill(json({ error: "not_found" }, 404)),
  );
  return given;
}

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test.describe("AI allowances on Select Company", () => {
  test.beforeEach(async () => {
    await requireApp();
  });

  test("a superuser's list mode: each company's allowance, Manage, giving a grant - phone first", async ({
    page,
  }) => {
    const given = await stub(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await handoff(page, creds(), "/entities");

    const main = page.getByRole("main");
    await main.getByRole("button", { name: "AI allowances" }).click();
    await expect(main.getByRole("button", { name: "AI allowances" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(main.getByRole("button", { name: "Archive companies" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    const manage = main.getByRole("button", { name: `Manage the AI allowance of ${FIVE.name}` });
    await expect(manage).toBeVisible();
    await expect(main.getByText("4 reads · last 18 Nov 2026")).toBeVisible();

    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      expect((await manage.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await noSideScroll(page)).toBe(true);
      if (process.env.E2E_SHOTS)
        await page.screenshot({ path: `${process.env.E2E_SHOTS}/ai-mode-${width}.png` });
    }

    await page.setViewportSize({ width: 360, height: 800 });
    await manage.click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText("Used up: its read buttons are off until it is given another grant."),
    ).toBeVisible();
    // owner, 2026-11-19: older reads come on "Show more reads", not a fixed 20
    const more = dialog.getByRole("button", { name: "Show more reads" });
    expect((await more.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await more.click();
    await expect(
      dialog.getByText("17 Nov 2026 · Payment Request · Failed · 0 tokens"),
    ).toBeVisible();
    await expect(more).toHaveCount(0);
    expect(await noSideScroll(page)).toBe(true);
    const tokens = dialog.getByRole("textbox", { name: "Tokens" });
    await tokens.fill("lots");
    await expect(tokens).toHaveAccessibleDescription(
      "Enter the tokens as a whole number from 1 to 10,000,000.",
    );
    await tokens.fill("50,000");
    await dialog.getByRole("textbox", { name: "Note (optional)" }).fill("pilot");
    expect(await noSideScroll(page)).toBe(true);
    if (process.env.E2E_SHOTS)
      await page.screenshot({ path: `${process.env.E2E_SHOTS}/ai-mode-company-360.png` });
    await dialog.getByRole("button", { name: "Give grant" }).click();

    await expect(dialog.getByText("100% of its AI allowance left.")).toBeVisible();
    expect(given).toEqual([{ tokens: "50,000", reads: "", days: "", note: "pilot" }]);
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(main.getByText("100% left · 0 of 50,000 tokens used")).toBeVisible();

    // one mode at a time: the Archive companies tab moves straight there (owner, 2026-11-20) - its
    // rows keep their badges too, and both modes' row actions are 44px icon buttons named for a
    // screen reader (owner, 2026-11-19)
    await main.getByRole("button", { name: "Archive companies" }).click();
    const archive = main.getByRole("button", { name: `Archive company ${FIVE.name}` });
    await expect(archive).toBeVisible();
    const box = (await archive.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await noSideScroll(page)).toBe(true);
    if (process.env.E2E_SHOTS)
      await page.screenshot({ path: `${process.env.E2E_SHOTS}/archive-mode-360.png` });
  });
});
