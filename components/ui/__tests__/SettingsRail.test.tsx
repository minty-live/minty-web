import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsRail } from "@/components/ui/SettingsRail";
import { SettingsCard } from "@/components/ui/SettingsShell";
import type { SettingsTab } from "@/lib/settingsTabs";

const USERS = "/entity/e1/co/settings/users";
const TABS: SettingsTab[] = [
  {
    label: "Users",
    href: USERS,
    sections: [
      { title: "Members", href: `${USERS}#section-members` },
      { title: "Invitations", href: `${USERS}#section-invitations` },
    ],
  },
  { label: "General", current: true, sections: [] },
  { label: "Integration", href: "/entity/e1/co/settings/integration", sections: [] },
];

function Page({ withLater = false }: { withLater?: boolean }) {
  const content = useRef<HTMLDivElement>(null);
  const [later, setLater] = useState(false);
  return (
    <main>
      <button type="button" onClick={() => setLater(true)}>
        Invite someone
      </button>
      <SettingsRail tabs={TABS} content={content} />
      <div ref={content}>
        <SettingsCard
          title={
            <>
              Entity name<span>*</span>
            </>
          }
          railTitle="Entity name"
        >
          <p>name</p>
        </SettingsCard>
        <SettingsCard title="Chart of accounts">
          <section aria-label="Expense">not a rail section</section>
        </SettingsCard>
        <SettingsCard title="Contacts">
          <p>contacts</p>
        </SettingsCard>
        <SettingsCard>
          <p>no title, not in the rail</p>
        </SettingsCard>
        {withLater && later ? (
          <SettingsCard title="Invitations">
            <p>pending</p>
          </SettingsCard>
        ) : null}
      </div>
    </main>
  );
}

const rail = () => within(screen.getByRole("navigation", { name: "Settings sections" }));
const sectionList = () => within(screen.getByRole("list", { name: "On General" }));

describe("SettingsRail", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });
  const scrollIntoView = vi.fn();
  beforeEach(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    scrollIntoView.mockReset();
  });

  it("lists the tabs as links, the open one current and not a link", () => {
    render(<Page />);
    expect(rail().getByRole("link", { name: "Users" })).toHaveAttribute(
      "href",
      "/entity/e1/co/settings/users",
    );
    expect(rail().getByText("General")).toHaveAttribute("aria-current", "page");
    expect(rail().queryByRole("link", { name: "General" })).toBeNull();
  });

  it("lists the open tab's titled cards in page order, the first current at the top of the page", () => {
    render(<Page />);
    const buttons = sectionList().getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Entity name",
      "Chart of accounts",
      "Contacts",
    ]);
    expect(buttons[0]).toHaveAttribute("aria-current", "location");
    expect(buttons[1]).not.toHaveAttribute("aria-current");
  });

  it("adds a card that appears later", async () => {
    render(<Page withLater />);
    expect(sectionList().queryByRole("button", { name: "Invitations" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Invite someone" }));
    expect(await sectionList().findByRole("button", { name: "Invitations" })).toBeInTheDocument();
  });

  it("a section scrolls its card to the top and focuses it, the address unchanged", async () => {
    render(<Page />);
    const before = window.location.href;
    await userEvent.click(sectionList().getByRole("button", { name: "Contacts" }));
    const card = screen.getByRole("region", { name: "Contacts" });
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
    expect(scrollIntoView.mock.contexts[0]).toBe(card);
    expect(card).toHaveFocus();
    expect(window.location.href).toBe(before);
    // the card picked is the current one at once, even where the page cannot bring it to the top
    expect(sectionList().getByRole("button", { name: "Contacts" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("the bar names where the person is and opens the sheet; Escape closes it and focus returns", async () => {
    render(<Page />);
    const bar = screen.getByRole("button", { name: "Settings menu" });
    expect(bar).toHaveAccessibleDescription(/^General\s*· Entity name$/);
    expect(bar).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(bar);
    expect(bar).toHaveAttribute("aria-expanded", "true");
    const sheet = screen.getByRole("dialog", { name: "Settings menu" });
    expect(within(sheet).getByRole("button", { name: "Close" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bar).toHaveFocus();
  });

  it("picking a section in the sheet closes it and jumps", async () => {
    render(<Page />);
    await userEvent.click(screen.getByRole("button", { name: "Settings menu" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Chart of accounts" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("region", { name: "Chart of accounts" })).toHaveFocus();
  });

  it("Tab stays inside the open sheet", async () => {
    render(<Page />);
    await userEvent.click(screen.getByRole("button", { name: "Settings menu" }));
    const sheet = within(screen.getByRole("dialog"));
    const close = sheet.getByRole("button", { name: "Close" });
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    // the last stop is the last tab (Integration, which has no topics to open)
    expect(sheet.getByRole("link", { name: "Integration" })).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
  });

  it("each tab opens and closes; another tab's topics link to its cards", async () => {
    render(<Page />);
    // the open tab starts open, the others closed
    expect(screen.getByRole("button", { name: "Hide General topics" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const users = screen.getByRole("button", { name: "Show Users topics" });
    expect(users).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "On Users" })).toBeNull();
    // Integration lists no topics, so it has nothing to open
    expect(screen.queryByRole("button", { name: /Integration topics/ })).toBeNull();

    await userEvent.click(users);
    const list = within(screen.getByRole("list", { name: "On Users" }));
    expect(list.getByRole("link", { name: "Invitations" })).toHaveAttribute(
      "href",
      `${USERS}#section-invitations`,
    );
    await userEvent.click(screen.getByRole("button", { name: "Hide Users topics" }));
    expect(screen.queryByRole("list", { name: "On Users" })).toBeNull();

    // the open tab closes too, and opens again
    await userEvent.click(screen.getByRole("button", { name: "Hide General topics" }));
    expect(screen.queryByRole("list", { name: "On General" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show General topics" }));
    expect(sectionList().getAllByRole("button")).toHaveLength(3);
  });

  it("arriving with a card's address goes to that card", async () => {
    window.history.replaceState(null, "", "/settings/general#section-contacts");
    render(<Page />);
    const card = screen.getByRole("region", { name: "Contacts" });
    expect(card).toHaveAttribute("id", "section-contacts");
    await waitFor(() => expect(card).toHaveFocus());
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(card);
    expect(sectionList().getByRole("button", { name: "Contacts" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });
});
