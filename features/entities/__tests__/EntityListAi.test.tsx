// "AI allowances" on Select Company (owner, 2026-11-18; a list mode like "Archive companies" since
// 2026-11-19): a superuser turns it on, each row shows the company's AI allowance, Manage opens the
// company, and a given grant shows on the row at once. Nobody else gets the button.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@/components/ui/Sidebar";
import { ToastProvider } from "@/components/ui/Toast";
import { setAuth } from "@/lib/auth";
import { _resetHandoffForTests } from "@/lib/handoff";
import { _setViewerLoaderForTests } from "@/lib/viewer";

import { LIST, SUPERUSER } from "@/features/entities/__fixtures__/entities";
import type { AiCompany, AiCompanyRow } from "@/features/entities/api/aiAllowances";
import type { EntityListAnswer } from "@/features/entities/api/entities";
import { EntityListScreen } from "@/features/entities/routes/EntityListScreen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/entities",
}));

const TOKEN = "h.eyJ1c2VyX2lkIjoidTEifQ.s";
const fetchMock = vi.fn<typeof fetch>();
const FIVE = SUPERUSER.entities.find((e) => e.id === "e-scenario-5")!;

const aiRow = (id: string, over: Partial<AiCompanyRow> = {}): AiCompanyRow => ({
  id,
  name: id,
  percent_left: 100,
  blocked: false,
  tokens_used: 0,
  tokens_given: 20000,
  has_grant: false,
  reads: 0,
  last_read_at: null,
  ...over,
});

const COMPANY: AiCompany = {
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
      created_at: "2026-11-18T08:00:00Z",
      module: "payment_request",
      status: "ok",
      model: "gemini-3.8-flash",
      attempts: "gemini-3.8-flash:ok",
      tokens: 5200,
    },
  ],
};

const GIVEN: AiCompany = {
  ...COMPANY,
  allowance: { ...COMPANY.allowance, percent_left: 100, blocked: false },
  grants: [
    {
      ...COMPANY.grants[0],
      id: "g2",
      source: "manual",
      tokens_total: 50000,
      tokens_used: 0,
      reads_used: 0,
      open: true,
      granted_by: "boss@test.com",
      note: "pilot",
      created_at: "2026-11-18T09:00:00Z",
    },
    COMPANY.grants[0],
  ],
  message: `Grant given to ${FIVE.name}.`,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function serve(list: EntityListAnswer, give?: () => Response) {
  const asked = { ids: [] as string[], posts: [] as unknown[] };
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/api/me/entities")) return json(list);
    if (url.pathname.endsWith("/grants")) {
      asked.posts.push(JSON.parse(String(init?.body)));
      return give ? give() : json(GIVEN, 201);
    }
    if (url.pathname.endsWith("/api/me/ai/companies")) {
      const ids = (url.searchParams.get("ids") ?? "").split(",");
      asked.ids = ids;
      const companies = ids.map((id) =>
        id === FIVE.id
          ? aiRow(id, {
              percent_left: 0,
              blocked: true,
              tokens_used: null,
              tokens_given: null,
              has_grant: true,
              reads: 4,
              last_read_at: "2026-11-18T08:00:00Z",
            })
          : aiRow(id),
      );
      return json({ companies, page: 1, page_size: companies.length, total: companies.length });
    }
    if (url.pathname.includes("/api/me/ai/companies/")) return json(COMPANY);
    return json({});
  });
  return asked;
}

function show() {
  render(
    <ToastProvider>
      <SidebarProvider look="classic">
        <EntityListScreen />
      </SidebarProvider>
    </ToastProvider>,
  );
}

const list = () => within(screen.getByRole("list", { name: "Your companies" }));
const rowOf = (name: string) =>
  within(
    list()
      .getAllByRole("listitem")
      .find((li) => li.textContent?.includes(name)) as HTMLElement,
  );
const dialog = () => within(screen.getByRole("dialog"));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  _resetHandoffForTests(vi.fn());
  setAuth(TOKEN, "", "");
  window.history.replaceState({}, "", "/entities");
  _setViewerLoaderForTests(() => Promise.resolve({ name: "Boss", initials: "BS" }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  _resetHandoffForTests();
  _setViewerLoaderForTests(null);
});

async function aiMode() {
  await userEvent.click(await screen.findByRole("button", { name: "AI allowances" }));
  await screen.findByText(/^4 reads · last 18 Nov 2026$/);
}

describe("AI allowances on Select Company", () => {
  it("is a superuser's mode beside Archive companies, one at a time", async () => {
    serve(SUPERUSER);
    show();
    const ai = await screen.findByRole("button", { name: "AI allowances" });
    expect(screen.getByRole("button", { name: "Archive companies" })).toBeInTheDocument();

    await userEvent.click(ai);
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Archive companies" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Archive companies" })).toBeInTheDocument();
  });

  it("nobody else gets it", async () => {
    serve(LIST);
    show();
    await screen.findByRole("list", { name: "Your companies" });
    expect(screen.queryByRole("button", { name: "AI allowances" })).toBeNull();
  });

  it("asks for exactly the companies listed, not archived ones, and shows each one's allowance", async () => {
    const asked = serve(SUPERUSER);
    show();
    await aiMode();

    expect(asked.ids).toContain(FIVE.id);
    expect(asked.ids).not.toContain("e-archived");
    const five = rowOf(FIVE.name);
    expect(five.getByText("Used up")).toBeInTheDocument();
    expect(five.getByText("0% left")).toBeInTheDocument();
    // the row keeps its badges (owner, 2026-11-19), the same as browsing
    expect(five.getByRole("img", { name: "Free trial: Petty Cash" })).toBeInTheDocument();
    expect(five.getByRole("img", { name: "Petty Cash module" })).toBeInTheDocument();
    expect(list().getByText("Setup in progress")).toBeInTheDocument();
    // no way into the company while the mode is on: Manage instead
    expect(list().queryByRole("link", { name: /Scenario 5/ })).toBeNull();
    expect(
      five.getByRole("button", { name: `Manage the AI allowance of ${FIVE.name}` }),
    ).toBeInTheDocument();
    // an archived company keeps its archived row
    expect(rowOf("Gold Moon Company").getByText("Archived")).toBeInTheDocument();
  });

  it("Manage opens the company: its grants and its last reads", async () => {
    serve(SUPERUSER);
    show();
    await aiMode();
    await userEvent.click(
      rowOf(FIVE.name).getByRole("button", { name: `Manage the AI allowance of ${FIVE.name}` }),
    );

    expect(
      await dialog().findByText(
        "Used up: its read buttons are off until it is given another grant.",
      ),
    ).toBeInTheDocument();
    const grants = within(dialog().getByRole("list", { name: "Grants" }));
    expect(grants.getByText("Default grant")).toBeInTheDocument();
    expect(grants.getByText("21,000 of 20,000 tokens used")).toBeInTheDocument();
    expect(
      dialog().getByText("18 Nov 2026 · Payment Request · Read · 5,200 tokens"),
    ).toBeInTheDocument();
  });

  it("checks each field as it is typed, and only a submit says the grant gives nothing", async () => {
    const asked = serve(SUPERUSER);
    show();
    await aiMode();
    await userEvent.click(
      rowOf(FIVE.name).getByRole("button", { name: `Manage the AI allowance of ${FIVE.name}` }),
    );
    const tokens = await dialog().findByRole("textbox", { name: "Tokens" });

    await userEvent.type(tokens, "lots");
    expect(tokens).toHaveAccessibleDescription(
      "Enter the tokens as a whole number from 1 to 10,000,000.",
    );
    await userEvent.clear(tokens);
    expect(tokens).not.toHaveAccessibleDescription();
    await userEvent.click(dialog().getByRole("button", { name: "Give grant" }));
    expect(tokens).toHaveAccessibleDescription(
      "The grant gives nothing yet. Add tokens, reads or both to continue.",
    );
    expect(tokens).toHaveFocus();
    expect(asked.posts).toHaveLength(0);
  });

  it("gives a grant: the dialog and the company's row show it at once", async () => {
    const asked = serve(SUPERUSER);
    show();
    await aiMode();
    await userEvent.click(
      rowOf(FIVE.name).getByRole("button", { name: `Manage the AI allowance of ${FIVE.name}` }),
    );
    await userEvent.type(await dialog().findByRole("textbox", { name: "Tokens" }), "50,000");
    await userEvent.type(dialog().getByRole("textbox", { name: "Note (optional)" }), "pilot");
    await userEvent.click(dialog().getByRole("button", { name: "Give grant" }));

    expect(await screen.findByText(`Grant given to ${FIVE.name}.`)).toBeInTheDocument();
    expect(asked.posts).toEqual([{ tokens: "50,000", reads: "", days: "", note: "pilot" }]);
    expect(dialog().getByText("100% of its AI allowance left.")).toBeInTheDocument();
    await userEvent.click(dialog().getByRole("button", { name: "Close" }));
    await waitFor(() => expect(rowOf(FIVE.name).queryByText("Used up")).toBeNull());
    expect(rowOf(FIVE.name).getByText("100% left · 0 of 50,000 tokens used")).toBeInTheDocument();
  });

  it("shows the API's refusal on the field it names", async () => {
    serve(SUPERUSER, () =>
      json(
        {
          error: "The grant wasn't given. Fix the fields below and try again.",
          fields: {
            days: "Enter the days as a whole number from 1 to 3,650, or leave it empty for no end date.",
          },
        },
        422,
      ),
    );
    show();
    await aiMode();
    await userEvent.click(
      rowOf(FIVE.name).getByRole("button", { name: `Manage the AI allowance of ${FIVE.name}` }),
    );
    await userEvent.type(await dialog().findByRole("textbox", { name: "Tokens" }), "5000");
    await userEvent.click(dialog().getByRole("button", { name: "Give grant" }));

    expect(await dialog().findByText(/Enter the days as a whole number/)).toBeInTheDocument();
  });
});
