// The confirmation modal rendered (Figma section 06): the module's name in its colour in the
// title, the company, the sentences with their bold and coloured runs, Minty's mood, the
// confirming button in its tone; Go back, Escape and the backdrop go back, nothing while busy.

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { draftKey } from "@minty/shared/drafts";

import { SUMMARY_FIXTURES } from "@/features/subscription/__fixtures__/modulePage";
import { ChangeDialog } from "@/features/subscription/components/ChangeDialog";
import { buildChangeModal } from "@/features/subscription/lib/changeModal";

function show(
  codes: ("PETTY_CASH" | "PAYMENT_REQUEST")[],
  page = SUMMARY_FIXTURES.M44,
  busy = false,
) {
  const onConfirm = vi.fn();
  const onBack = vi.fn();
  const modal = buildChangeModal(page, codes)!;
  render(
    <ChangeDialog
      modal={modal}
      entityName="Nexora Health Limited"
      busy={busy}
      onConfirm={onConfirm}
      onBack={onBack}
    />,
  );
  return { onConfirm, onBack, dialog: screen.getByRole("dialog") };
}

describe("ChangeDialog", () => {
  it("Remove Petty Cash? - the name in its colour, the two sentences, Confirm Change in orange", async () => {
    const { dialog, onConfirm, onBack } = show(["PETTY_CASH"]);
    expect(dialog).toHaveAccessibleName("Remove Petty Cash?");
    expect(within(dialog).getByText("Petty Cash")).toHaveClass("text-module-pettycash-ink");
    expect(within(dialog).getByText("Nexora Health Limited")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/You've chosen to remove Petty Cash\. You'll still have access/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Your other module will stay active/)).toBeInTheDocument();
    expect(dialog.querySelector("img")).toHaveAttribute("data-image", "surprised");
    const confirm = within(dialog).getByRole("button", { name: "Confirm Change" });
    expect(confirm).toHaveAttribute("data-tone", "orange");
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(within(dialog).getByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("Cancel Subscription? - the red button, Minty sad", () => {
    const { dialog } = show(["PETTY_CASH", "PAYMENT_REQUEST"]);
    expect(dialog).toHaveAccessibleName("Cancel Subscription?");
    expect(within(dialog).getByText("No modules are selected.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Confirm Cancellation" })).toHaveAttribute(
      "data-tone",
      "red",
    );
    expect(dialog.querySelector("img")).toHaveAttribute("data-image", "sad");
  });

  it("You have unlocked Super Minty - the bundle's name in teal, Minty in a cape", () => {
    const { dialog } = show(["PETTY_CASH", "PAYMENT_REQUEST"], SUMMARY_FIXTURES.M22);
    expect(dialog).toHaveAccessibleName("You have unlocked Super Minty");
    expect(within(dialog).getByText("Super Minty")).toHaveClass("text-text-link");
    expect(within(dialog).getByRole("button", { name: "Confirm" })).toHaveAttribute(
      "data-tone",
      "teal",
    );
    expect(dialog.querySelector("img")).toHaveAttribute("data-image", "super");
  });

  it("Subscription Changes - the modules in colour, removed and added in bold", () => {
    const { dialog } = show(["PETTY_CASH", "PAYMENT_REQUEST"], SUMMARY_FIXTURES.M45);
    expect(dialog).toHaveAccessibleName("Subscription Changes");
    const p = within(dialog)
      .getByText(/will be/)
      .closest("p")!;
    expect(within(p).getByText("Petty Cash")).toHaveClass("text-module-pettycash-ink");
    expect(within(p).getByText("Payment Request")).toHaveClass("text-module-payment-ink");
    expect(within(p).getByText("removed").tagName).toBe("STRONG");
    expect(within(p).getByText("added").tagName).toBe("STRONG");
    expect(within(dialog).getByRole("button", { name: "Confirm Changes" })).toBeInTheDocument();
  });

  it("after a payment (hideBack) it has one button; Escape lands as Confirm does", async () => {
    // A change that bills is asked in Billing Accounts first and celebrated here once paid
    // (the owner, 2026-11-11): there is nothing to go back to.
    const onConfirm = vi.fn();
    const onBack = vi.fn();
    render(
      <ChangeDialog
        modal={buildChangeModal(SUMMARY_FIXTURES.M22, ["PETTY_CASH", "PAYMENT_REQUEST"])!}
        entityName="Nexora Health Limited"
        busy={false}
        hideBack
        onConfirm={onConfirm}
        onBack={onBack}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Go back" })).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("a paid cancellation asks why - required - and Confirm passes the words on", async () => {
    const onConfirm = vi.fn();
    render(
      <ChangeDialog
        modal={buildChangeModal(SUMMARY_FIXTURES.M44, ["PETTY_CASH"])!}
        entityName="Nexora Health Limited"
        busy={false}
        askReason
        onConfirm={onConfirm}
        onBack={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    const field = within(dialog).getByRole("textbox", {
      name: "Tell us why you're leaving (required)",
    });
    expect(field).toHaveAttribute("aria-required", "true");
    expect(field).toHaveAttribute("maxlength", "500");
    // Nothing is red on open.
    expect(field).not.toHaveAttribute("aria-invalid");
    expect(within(dialog).queryByText(/still empty/)).toBeNull();
    await userEvent.type(field, "Too expensive{Enter}for now");
    // Enter is a new line in the box, never the confirmation.
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm Change" }));
    expect(onConfirm).toHaveBeenCalledWith("Too expensive\nfor now");
  });

  it("a blank reason is refused: the sentence under the box, focus on it, nothing confirmed", async () => {
    const onConfirm = vi.fn();
    render(
      <ChangeDialog
        modal={buildChangeModal(SUMMARY_FIXTURES.M44, ["PETTY_CASH"])!}
        entityName="Nexora Health Limited"
        busy={false}
        askReason
        onConfirm={onConfirm}
        onBack={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    const field = within(dialog).getByRole("textbox");
    await userEvent.type(field, "   ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm Change" }));
    expect(onConfirm).not.toHaveBeenCalled();
    const said = "The reason is still empty. Tell us why you're leaving to continue.";
    expect(within(dialog).getByText(said)).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(said);
    expect(field).toHaveFocus();
    // Typing clears it at once.
    await userEvent.type(field, "Moving to another tool");
    expect(within(dialog).queryByText(said)).toBeNull();
    expect(field).not.toHaveAttribute("aria-invalid");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm Change" }));
    expect(onConfirm).toHaveBeenCalledWith("   Moving to another tool");
  });

  it("without askReason there is no box, and Confirm passes nothing", async () => {
    const { dialog, onConfirm } = show(["PETTY_CASH", "PAYMENT_REQUEST"], SUMMARY_FIXTURES.M22);
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it("the box is shut while the change is being applied", () => {
    render(
      <ChangeDialog
        modal={buildChangeModal(SUMMARY_FIXTURES.M44, ["PETTY_CASH"])!}
        entityName="Nexora Health Limited"
        busy
        askReason
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("while the change is being applied nothing closes it", async () => {
    const { dialog, onBack, onConfirm } = show(["PETTY_CASH"], SUMMARY_FIXTURES.M44, true);
    expect(within(dialog).getByRole("button", { name: "Confirm Change" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onBack).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

// Auto-saved drafts (the owner's decisions doc L1; @minty/shared/drafts): the cancellation reason is
// kept in this browser 2 s after the last keystroke, per person and company, put back at once when
// the dialog opens again - no notice (the user, 2026-11-24) - and removed once the cancellation
// goes through.
describe("ChangeDialog - the reason's auto-saved draft", () => {
  const SCOPE = { userId: "u1", entityId: "e9" };
  const KEY = draftKey(SCOPE, "subscription.cancel", "e9");
  const wait2s = () =>
    act(async () => {
      vi.advanceTimersByTime(2100);
    });
  const mount = (onConfirm: (reason?: string) => void | Promise<boolean | void> = vi.fn()) =>
    render(
      <ChangeDialog
        modal={buildChangeModal(SUMMARY_FIXTURES.M44, ["PETTY_CASH"])!}
        entityName="Nexora Health Limited"
        busy={false}
        askReason
        onConfirm={onConfirm}
        onBack={vi.fn()}
        draft={{ scope: SCOPE, record: "e9" }}
      />,
    );
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("kept 2 s after typing; opened again the words are back at once, with no notice", async () => {
    const first = mount();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByRole("textbox"), "Too expensive");
    expect(localStorage.getItem(KEY)).toBeNull();
    await wait2s();
    expect(JSON.parse(localStorage.getItem(KEY) ?? "null").value).toEqual({
      reason: "Too expensive",
    });
    first.unmount();

    mount();
    const dialog = within(screen.getByRole("dialog"));
    await waitFor(() => expect(dialog.getByRole("textbox")).toHaveValue("Too expensive"));
    expect(dialog.queryByText(/unsaved changes/)).toBeNull();
    expect(dialog.queryByRole("button", { name: "Restore" })).toBeNull();
    expect(dialog.queryByRole("button", { name: "Discard" })).toBeNull();
  });

  it("removed when the cancellation goes through, kept when it does not", async () => {
    let done = false;
    const onConfirm = vi.fn(async () => done);
    mount(onConfirm);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByRole("textbox"), "Too expensive");
    await wait2s();
    const confirm = screen.getByRole("button", { name: "Confirm Change" });
    await user.click(confirm);
    await wait2s();
    expect(localStorage.getItem(KEY)).not.toBeNull(); // refused: kept
    done = true;
    await user.click(confirm);
    await wait2s();
    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("nothing is kept without a person to keep it for", async () => {
    render(
      <ChangeDialog
        modal={buildChangeModal(SUMMARY_FIXTURES.M44, ["PETTY_CASH"])!}
        entityName="Nexora Health Limited"
        busy={false}
        askReason
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        draft={{ scope: null, record: "e9" }}
      />,
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByRole("textbox"), "Too expensive");
    await wait2s();
    expect(localStorage.length).toBe(0);
  });
});
