// Matching a company's accounts to Xero (Settings Phase 2, 2026-11-11; Figma 353:999 SET-1b,
// frames 3, 3b, 4; the user's rules of 2026-11-24): the Integration card asks first for a company with
// its own accounts and shows "Matching isn't finished" while it is pending. On the page every account
// needs its own Xero account (one another account has is shown, never picked), the ones still to match
// come first and stay put while picked, the contacts step comes before Finish, and Finish confirms and
// connects.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/Toast";
import { setAuth } from "@/lib/auth";

import type {
  IntegrationPage,
  MatchContacts,
  MatchingPage,
  MatchRow,
} from "@/features/company-settings/api/companySettings";
import { IntegrationScreen } from "@/features/company-settings/routes/IntegrationScreen";
import { MATCH_COPY, MatchingScreen } from "@/features/company-settings/routes/MatchingScreen";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/entity/e1/olive-shop/settings/integration/match",
}));

const ID = "e1";
const COMPANY = { id: ID, name: "Olive Shop" };
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Route = (url: URL, init: RequestInit) => Response;
function api(routes: Record<string, Route>) {
  fetchMock.mockImplementation(async (input, init = {}) => {
    const url = new URL(String(input));
    const key = `${(init.method ?? "GET").toUpperCase()} ${url.pathname}`;
    const route = routes[key];
    if (!route) throw new Error(`unexpected ${key}`);
    return route(url, init);
  });
}

const MINTY: IntegrationPage = {
  company: { id: ID, name: "Olive Shop", country_code: "HK", currency_id: "c-hkd" },
  modules: ["PETTY_CASH"],
  countries: [],
  currencies: [],
  xero: {
    status: "disconnected",
    connected: false,
    needs_reconnect: false,
    organisation: null,
    last_connected_at: null,
  },
  can_edit: true,
  can_rename: true,
  setup_mode: "minty",
  own_accounts: 24,
  matching: { accounts: false, contacts: false },
  notices: [],
  xero_conflict: null,
};

function row(id: string, code: string, name: string, extra: Partial<MatchRow> = {}): MatchRow {
  return {
    account_id: id,
    code,
    name,
    type: "expense",
    kind: "expense",
    group: "Running the business",
    used: false,
    system: false,
    pick: null,
    suggestion: null,
    conflict: null,
    ...extra,
  };
}

/** No contacts to ask: Finish sits on the accounts step. */
const NO_CONTACTS: MatchContacts = {
  required: true,
  suppliers: [],
  slots: [],
  options: [],
  blocking: 0,
};

const OPTIONS = [
  { id: "x-rent", code: "469", name: "Rent", kind: "expense", held_by: "Rent" },
  { id: "x-wages", code: "477", name: "Wages and Salaries", kind: "expense", held_by: null },
  { id: "x-lic", code: "485", name: "Subscriptions", kind: "expense", held_by: null },
  { id: "x-bank", code: "090", name: "Petty Cash", kind: "bank", held_by: null },
];

function matchingPage(over: Partial<MatchingPage> = {}): MatchingPage {
  return {
    organisation: "Olive Ltd",
    groups: [
      {
        key: "unmatched",
        title: "Not matched yet",
        rows: [
          row("a-wages", "6001", "Salaries - Full Time", { used: true, suggestion: "x-wages" }),
          row("a-lic", "6999", "Licences"),
        ],
      },
      {
        key: "running",
        title: "Running the business",
        rows: [row("a-rent", "469", "Rent", { pick: { xero_account_id: "x-rent", auto: true } })],
      },
    ],
    options: OPTIONS,
    matched: 1,
    total: 3,
    blocking: 2,
    contacts: NO_CONTACTS,
    pending: { accounts: true, contacts: false },
    failed_contacts: [],
    ...over,
  };
}

const MATCHED = matchingPage({
  groups: [
    {
      key: "running",
      title: "Running the business",
      rows: [
        row("a-rent", "469", "Rent", { pick: { xero_account_id: "x-rent", auto: true } }),
        row("a-wages", "6001", "Salaries - Full Time", {
          used: true,
          pick: { xero_account_id: "x-wages", auto: false },
        }),
        row("a-lic", "6999", "Licences", { pick: { xero_account_id: "x-lic", auto: false } }),
      ],
    },
  ],
  options: OPTIONS.map((o) =>
    o.id === "x-wages"
      ? { ...o, held_by: "Salaries - Full Time" }
      : o.id === "x-lic"
        ? { ...o, held_by: "Licences" }
        : o,
  ),
  matched: 3,
  blocking: 0,
});

function wrap(node: React.ReactNode) {
  render(<ToastProvider>{node}</ToastProvider>);
}

describe("Matching a company's accounts to Xero", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuth("h.eyJ1c2VyX2lkIjoidTEifQ.s", ID, "Olive Shop");
    fetchMock.mockReset();
    router.push.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("SET-1b: a company with its own accounts is asked first, with the rows to match", async () => {
    api({ "GET /api/me/company/integration": () => json(MINTY) });
    wrap(<IntegrationScreen company={COMPANY} flash={null} xeroConflict={null} />);
    await userEvent.click(await screen.findByRole("button", { name: "Connect to Xero" }));
    const dialog = screen.getByRole("dialog", { name: "One step before we connect" });
    expect(within(dialog).getByText(/match them up - 24 rows/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Sign in to Xero" })).toHaveAttribute(
      "href",
      expect.stringContaining("xero_reconnect"),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("an unfinished match says so and offers Continue matching, and Disconnect (2026-11-19)", async () => {
    api({
      "GET /api/me/company/integration": () =>
        json({ ...MINTY, matching: { accounts: true, contacts: false } }),
    });
    wrap(<IntegrationScreen company={COMPANY} flash={null} xeroConflict={null} />);
    expect(
      await screen.findByRole("heading", { name: "Matching isn't finished" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue matching" })).toHaveAttribute(
      "href",
      expect.stringContaining("/settings/integration/match"),
    );
    expect(screen.queryByRole("button", { name: "Connect to Xero" })).toBeNull();
    expect(screen.getByRole("button", { name: "Disconnect from Xero" })).toBeInTheDocument();
  });

  it("opening the page reads Xero again, so a bank made there meanwhile can be picked (2026-11-23)", async () => {
    const bankRow = row("a-pc", "1000", "Petty Cash", { type: "bank", kind: "bank", used: true });
    const stale = matchingPage({
      groups: [{ key: "unmatched", title: "Not matched yet", rows: [bankRow] }],
      options: [{ id: "x-rent", code: "469", name: "Rent", kind: "expense" }],
      can_edit: true,
    });
    const refreshed = {
      ...stale,
      options: [{ id: "x-b1", code: "1011", name: "Bank 1", kind: "bank" as const }],
    };
    const bodies: unknown[] = [];
    api({
      "GET /api/me/company/xero/matching": () => json(stale),
      "POST /api/me/company/xero/matching/refresh": (_url, init) => {
        bodies.push(JSON.parse(String(init.body)));
        return json(refreshed);
      },
    });
    wrap(<MatchingScreen company={COMPANY} />);
    const select = await screen.findByRole("combobox", { name: /Petty Cash/ });
    await waitFor(() =>
      expect(within(select).getByRole("option", { name: "1011 · Bank 1" })).toBeInTheDocument(),
    );
    expect(bodies).toEqual([{ throttle: true }]);
  });

  it("someone who may only look isn't sent to Xero on opening", async () => {
    api({ "GET /api/me/company/xero/matching": () => json(matchingPage({ can_edit: false })) });
    wrap(<MatchingScreen company={COMPANY} />);
    await screen.findByRole("combobox", { name: /Rent/ });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("every account needs a match, used or not; the ones to match come first; picks save at once", async () => {
    const picks: unknown[] = [];
    api({
      "GET /api/me/company/xero/matching": () => json(matchingPage()),
      "PATCH /api/me/company/xero/matching": (_url, init) => {
        picks.push(JSON.parse(String(init.body)));
        return json(MATCHED);
      },
    });
    wrap(<MatchingScreen company={COMPANY} />);
    expect(await screen.findByText("1 of 3 matched")).toBeInTheDocument();
    expect(screen.getByText(MATCH_COPY.blocking(2))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish" })).toBeDisabled();
    expect(screen.getByText(MATCH_COPY.finishBlocked)).toBeInTheDocument();
    // Licences is used by nothing, and still needed (the user, 2026-11-24)
    expect(
      screen.getByRole("combobox", { name: /Xero account for 6999 Licences/ }),
    ).toHaveAttribute("aria-required", "true");
    // the ones still to match first, each saying its group
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings[0]).toMatch(/^Not matched yet/);
    expect(screen.getAllByText("Running the business").length).toBeGreaterThan(0);

    // the bank account is no option for an expense account
    const select = screen.getByRole("combobox", {
      name: /Xero account for 6001 Salaries - Full Time/,
    });
    expect(within(select).queryByRole("option", { name: /Petty Cash/ })).toBeNull();
    // the suggestion leads the dropdown, in its own group
    expect(within(select).getByRole("group", { name: MATCH_COPY.suggested })).toBeInTheDocument();
    await userEvent.selectOptions(select, "x-wages");
    await waitFor(() =>
      expect(picks).toEqual([{ account_id: "a-wages", xero_account_id: "x-wages" }]),
    );
    expect(await screen.findByText("3 of 3 matched")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish" })).toBeEnabled();
  });

  it("a Xero account another account has is shown, never picked (one Minty account each, 2026-11-24)", async () => {
    api({ "GET /api/me/company/xero/matching": () => json(matchingPage()) });
    wrap(<MatchingScreen company={COMPANY} />);
    const select = await screen.findByRole("combobox", { name: /Xero account for 6999 Licences/ });
    const held = within(select).getByRole("option", { name: "469 · Rent - matched to Rent" });
    expect(held).toBeDisabled();
    expect(within(select).getByRole("option", { name: "485 · Subscriptions" })).toBeEnabled();
    // its own account's row offers it as its pick
    const rent = screen.getByRole("combobox", { name: /Xero account for 469 Rent/ });
    expect(within(rent).getByRole("option", { name: "469 · Rent" })).toBeEnabled();
  });

  it("a picked row stays where the person is working until the page is read again", async () => {
    const afterPick = matchingPage({
      groups: [
        {
          key: "unmatched",
          title: "Not matched yet",
          rows: [row("a-lic", "6999", "Licences")],
        },
        {
          key: "running",
          title: "Running the business",
          rows: [
            row("a-rent", "469", "Rent", { pick: { xero_account_id: "x-rent", auto: true } }),
            row("a-wages", "6001", "Salaries - Full Time", {
              pick: { xero_account_id: "x-wages", auto: false },
            }),
          ],
        },
      ],
      matched: 2,
      blocking: 1,
    });
    api({
      "GET /api/me/company/xero/matching": () => json(matchingPage()),
      "PATCH /api/me/company/xero/matching": () => json(afterPick),
    });
    wrap(<MatchingScreen company={COMPANY} />);
    const select = await screen.findByRole("combobox", {
      name: /Xero account for 6001 Salaries - Full Time/,
    });
    await userEvent.selectOptions(select, "x-wages");
    expect(await screen.findByText("2 of 3 matched")).toBeInTheDocument();
    const unmatched = screen.getByRole("heading", { name: /^Not matched yet/ });
    expect(unmatched).toHaveTextContent("Not matched yet · 1 of 2 matched");
    expect(unmatched.nextElementSibling).toHaveTextContent("Salaries - Full Time");
  });

  it("a long code runs with the name, and a code that repeats the name isn't shown twice", async () => {
    // Change your matches, 2026-11-13: Xero's codes (4000_01_01, a bank's name as its code) ran
    // out of the 44px code column into the name.
    api({
      "GET /api/me/company/xero/matching": () =>
        json(
          matchingPage({
            groups: [
              {
                key: "cash",
                title: "Cash & bank",
                rows: [row("a-pc", "Petty Cash", "Petty Cash", { kind: "bank", type: "bank" })],
              },
              {
                key: "sales",
                title: "Sales",
                rows: [row("a-cc", "4000_01_01", "Sales_Credit Card")],
              },
            ],
            options: [{ id: "x-pc", code: "Petty Cash", name: "Petty Cash", kind: "bank" }],
          }),
        ),
    });
    wrap(<MatchingScreen company={{ id: ID, name: "Olive Shop" }} />);
    const name = await screen.findByText("Sales_Credit Card");
    expect(name.closest("[data-account]")).toHaveTextContent("4000_01_01 Sales_Credit Card");
    expect(screen.getByText("Petty Cash", { selector: "[data-account]" }).textContent).toMatch(
      /^Petty Cash/,
    );
    expect(screen.getByRole("option", { name: "Petty Cash" })).toBeInTheDocument();
  });

  it("the header's Back goes to Integration itself, not back through Xero's sign-in", async () => {
    api({ "GET /api/me/company/xero/matching": () => json(matchingPage()) });
    wrap(<MatchingScreen company={COMPANY} />);
    await screen.findByText("1 of 3 matched");
    const back = screen.getAllByRole("link", { name: /Back/ })[0];
    expect(back.getAttribute("href")).toMatch(/\/settings\/integration$/);
    expect(back).not.toHaveAttribute("data-back-link");
  });

  it("with no contacts to ask, Finish asks first, then connects and goes back to Integration", async () => {
    api({
      "GET /api/me/company/xero/matching": () => json(MATCHED),
      "POST /api/me/company/xero/matching/finish": () =>
        json({ ...MATCHED, pending: { accounts: false, contacts: false }, connected: true }),
    });
    wrap(<MatchingScreen company={COMPANY} />);
    expect(screen.queryByText(MATCH_COPY.stepAccounts)).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: "Finish" }));
    const confirm = screen.getByRole("dialog", { name: MATCH_COPY.confirmTitle });
    expect(within(confirm).getByText(/its Minty code stays/)).toBeInTheDocument();
    expect(within(confirm).getByText(/can't be undone/)).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: "Finish" }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/\/settings\/integration$/)),
    );
  });

  // The user, 2026-11-24: the contacts are chosen before Finish - each supplier its Xero contact or new
  // in Xero, each daily-closing contact still empty a Xero contact - not warned about after it.
  const ASKED: MatchContacts = {
    required: true,
    suppliers: [
      {
        contact_id: "c-abc",
        name: "ABC Supplies",
        pick: { xero_contact_id: "xc-abc", auto: true, new: false },
      },
      { contact_id: "c-wing", name: "Wing Lee Trading Co.", pick: null },
    ],
    slots: [{ slot: "director", pick: null }],
    options: [
      { id: "xc-abc", name: "ABC Supplies" },
      { id: "xc-ada", name: "Ada Director" },
    ],
    blocking: 2,
  };

  it("the contacts step: Next from the accounts, each one answered, then Finish", async () => {
    const answers: unknown[] = [];
    let contacts = ASKED;
    api({
      "GET /api/me/company/xero/matching": () => json({ ...MATCHED, contacts }),
      "PATCH /api/me/company/xero/matching/contacts": (_url, init) => {
        const body = JSON.parse(String(init.body));
        answers.push(body);
        contacts =
          "contact_id" in body
            ? {
                ...contacts,
                suppliers: contacts.suppliers.map((s) =>
                  s.contact_id === body.contact_id
                    ? { ...s, pick: { xero_contact_id: null, auto: false, new: true } }
                    : s,
                ),
                blocking: contacts.blocking - 1,
              }
            : {
                ...contacts,
                slots: [
                  {
                    slot: "director",
                    pick: { xero_contact_id: body.xero_contact_id, auto: false, new: false },
                  },
                ],
                blocking: contacts.blocking - 1,
              };
        return json({ ...MATCHED, contacts });
      },
      "POST /api/me/company/xero/matching/finish": () =>
        json({ ...MATCHED, pending: { accounts: false, contacts: false }, connected: true }),
    });
    wrap(<MatchingScreen company={COMPANY} />);
    const user = userEvent.setup();
    expect(await screen.findByText(MATCH_COPY.stepAccounts)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish" })).toBeNull();
    await user.click(screen.getByRole("button", { name: MATCH_COPY.next }));

    expect(screen.getByRole("heading", { name: MATCH_COPY.contactsTitle })).toBeInTheDocument();
    expect(screen.getByText(MATCH_COPY.stepContacts)).toBeInTheDocument();
    expect(screen.getByText(MATCH_COPY.contactsBlocking(2))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Xero contact for ABC Supplies" })).toHaveValue(
      "ABC Supplies",
    );
    expect(screen.getByText(MATCH_COPY.contactNames.director)).toBeInTheDocument();

    await user.click(
      screen.getByRole("combobox", { name: "Xero contact for Wing Lee Trading Co." }),
    );
    await user.click(screen.getByRole("option", { name: new RegExp(MATCH_COPY.newInXero) }));
    await waitFor(() =>
      expect(screen.getByText(MATCH_COPY.contactsBlocking(1))).toBeInTheDocument(),
    );

    const director = screen.getByRole("combobox", {
      name: `Xero contact for ${MATCH_COPY.contactNames.director}`,
    });
    await user.click(director);
    expect(screen.queryByRole("option", { name: new RegExp(MATCH_COPY.newInXero) })).toBeNull();
    await user.type(director, "Ada");
    await user.click(screen.getByRole("option", { name: "Ada Director" }));
    await waitFor(() => expect(screen.getByText(MATCH_COPY.contactsDone)).toBeInTheDocument());
    expect(answers).toEqual([
      { contact_id: "c-wing", new: true },
      { slot: "director", xero_contact_id: "xc-ada" },
    ]);

    await user.click(screen.getByRole("button", { name: "Finish" }));
    await user.click(
      within(screen.getByRole("dialog", { name: MATCH_COPY.confirmTitle })).getByRole("button", {
        name: "Finish",
      }),
    );
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/\/settings\/integration$/)),
    );
  });

  it("Next waits for every account, and the contacts step goes back to the accounts", async () => {
    api({
      "GET /api/me/company/xero/matching": () => json(matchingPage({ contacts: ASKED })),
    });
    wrap(<MatchingScreen company={COMPANY} />);
    const next = await screen.findByRole("button", { name: MATCH_COPY.next });
    expect(next).toBeDisabled();
    expect(screen.getByText(MATCH_COPY.nextBlocked)).toBeInTheDocument();
  });

  it("a company the old rules left disconnected gets Try again", async () => {
    let tries = 0;
    api({
      "GET /api/me/company/xero/matching": () =>
        json({ ...MATCHED, pending: { accounts: false, contacts: true } }),
      "POST /api/me/company/xero/matching/contacts": () => {
        tries += 1;
        return json({ ...MATCHED, pending: { accounts: false, contacts: false }, connected: true });
      },
    });
    wrap(<MatchingScreen company={COMPANY} />);
    await userEvent.click(await screen.findByRole("button", { name: MATCH_COPY.tryAgain }));
    await waitFor(() => expect(tries).toBe(1));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
  });
});

describe("Phase 3: a new organisation, new accounts, changing the matches (owner, 2026-11-12)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuth("h.eyJ1c2VyX2lkIjoidTEifQ.s", ID, "Olive Shop");
    fetchMock.mockReset();
    router.push.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  const CONNECTED: IntegrationPage = {
    ...MINTY,
    setup_mode: "xero",
    own_accounts: 0,
    xero: {
      status: "connected",
      connected: true,
      needs_reconnect: false,
      organisation: "Olive Ltd",
      last_connected_at: "2026-11-10T02:00:00Z",
    },
    matching: { accounts: false, contacts: false, reason: null },
  };

  it.each([
    ["new_org", "Your new Xero organisation needs your accounts matched."],
    [
      "new_accounts",
      "Some accounts were added while Xero was disconnected. Match them to finish reconnecting.",
    ],
  ] as const)("the card names why a %s matching is open", async (reason, line) => {
    api({
      "GET /api/me/company/integration": () =>
        json({ ...CONNECTED, matching: { accounts: true, contacts: false, reason } }),
    });
    wrap(<IntegrationScreen company={COMPANY} flash={null} xeroConflict={null} />);
    expect(
      await screen.findByRole("heading", { name: "Matching isn't finished" }),
    ).toBeInTheDocument();
    expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue matching" })).toBeInTheDocument();
  });

  it("a connected company can change its matches: it starts the change, then opens the page", async () => {
    const posted: string[] = [];
    api({
      "GET /api/me/company/integration": () => json(CONNECTED),
      "POST /api/me/company/xero/matching/change": (url) => {
        posted.push(url.pathname);
        return json(matchingPage({ reason: "change" }));
      },
    });
    wrap(<IntegrationScreen company={COMPANY} flash={null} xeroConflict={null} />);
    await userEvent.click(await screen.findByRole("button", { name: "Change matches" }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        expect.stringContaining("/settings/integration/match"),
      ),
    );
    expect(posted).toEqual(["/api/me/company/xero/matching/change"]);
  });

  it("a change in progress says so on the card, publishing going on meanwhile", async () => {
    api({
      "GET /api/me/company/integration": () =>
        json({ ...CONNECTED, matching: { accounts: true, contacts: false, reason: "change" } }),
    });
    wrap(<IntegrationScreen company={COMPANY} flash={null} xeroConflict={null} />);
    expect(
      await screen.findByRole("heading", { name: "Changing your matches" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue changing" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change matches" })).toBeNull();
  });

  it("the page in change mode: its own heading, Cancel, and Finish says only what is published from now on", async () => {
    const posted: string[] = [];
    api({
      "GET /api/me/company/xero/matching": () =>
        json({ ...MATCHED, reason: "change", contacts: { ...NO_CONTACTS, required: false } }),
      "POST /api/me/company/xero/matching/cancel": (url) => {
        posted.push(url.pathname);
        return json({ ...MATCHED, reason: null, pending: { accounts: false, contacts: false } });
      },
    });
    wrap(<MatchingScreen company={COMPANY} />);
    expect(
      await screen.findByRole("heading", { name: MATCH_COPY.changeTitle }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    const confirm = screen.getByRole("dialog", { name: MATCH_COPY.confirmTitle });
    expect(within(confirm).getByText(MATCH_COPY.confirmChange)).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: "Go back" }));

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(posted).toEqual(["/api/me/company/xero/matching/cancel"]));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(expect.stringContaining("/settings/integration")),
    );
  });

  it("a reconnect that matches again shows every account, the matched ones filled in", async () => {
    api({
      "GET /api/me/company/xero/matching": () => json(matchingPage({ reason: "new_accounts" })),
    });
    wrap(<MatchingScreen company={COMPANY} />);
    expect(
      await screen.findByRole("heading", { name: MATCH_COPY.newAccountsTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(MATCH_COPY.newAccountsLead)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Xero account for 469 Rent/ })).toHaveValue(
      "x-rent",
    );
  });

  it("the page for a new organisation says older records stay with the old one", async () => {
    api({ "GET /api/me/company/xero/matching": () => json({ ...MATCHED, reason: "new_org" }) });
    wrap(<MatchingScreen company={COMPANY} />);
    expect(
      await screen.findByRole("heading", { name: MATCH_COPY.newOrgTitle }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    const confirm = screen.getByRole("dialog", { name: MATCH_COPY.confirmTitle });
    expect(within(confirm).getByText(MATCH_COPY.confirmNewOrg("Olive Ltd"))).toBeInTheDocument();
  });
});

describe("one account mapped again (owner's decisions doc A3, 2026-11-19)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuth("h.eyJ1c2VyX2lkIjoidTEifQ.s", ID, "Olive Shop");
    fetchMock.mockReset();
    router.push.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  const ONE = {
    organisation: "Olive Shop Ltd",
    gone_from_xero: true,
    message:
      "This account is archived in Xero. Please check it in Xero, then map this account to the one you want to use.",
    row: row("a-rent", "469", "Rent", { used: true }),
    options: [
      { id: "x-clean", code: "420", name: "Cleaning", kind: "expense" },
      { id: "x-bank", code: "090", name: "HSBC", kind: "bank" },
    ],
  };

  function showOne() {
    render(
      <ToastProvider>
        <MatchingScreen company={COMPANY} account="a-rent" />
      </ToastProvider>,
    );
  }

  it("says why, offers the Xero accounts of its kind and saves the pick", async () => {
    let body: unknown = null;
    api({
      "GET /api/me/company/xero/matching/account": (url) => {
        expect(url.searchParams.get("account")).toBe("a-rent");
        return json(ONE);
      },
      "POST /api/me/company/xero/matching/account": (_url, init) => {
        body = JSON.parse(String(init.body));
        return json({ message: "Rent now uses Cleaning in Xero.", account_id: "a-rent" });
      },
    });
    showOne();
    expect(await screen.findByText("Map Rent to a Xero account")).toBeInTheDocument();
    expect(screen.getByText(ONE.message)).toBeInTheDocument();
    const user = userEvent.setup();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    const select = screen.getByRole("combobox");
    expect(within(select).queryByRole("option", { name: /HSBC/ })).toBeNull();
    await user.selectOptions(select, "x-clean");
    await user.click(save);
    expect(await screen.findByText("Rent now uses Cleaning in Xero.")).toBeInTheDocument();
    expect(body).toEqual({ account_id: "a-rent", xero_account_id: "x-clean" });
    expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/\/settings\/general$/));
  });

  it("a Xero account another account has is refused and named - accounts are never merged (2026-11-24)", async () => {
    const sentence =
      "Wages is already linked to that Xero account. Choose a different Xero account.";
    api({
      "GET /api/me/company/xero/matching/account": () => json(ONE),
      "POST /api/me/company/xero/matching/account": () => json({ error: sentence }, 409),
    });
    showOne();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByRole("combobox"), "x-clean");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(sentence);
    expect(screen.queryByRole("button", { name: /Merge/ })).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });
});
