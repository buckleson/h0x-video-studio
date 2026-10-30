// A3b edge cases: the "soraLogin" reminder and the openAiLogo prop are gone;
// an old caller passing them gets the generic reminder, never an OpenAI login.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ActionReminderModal, { type ReminderType } from "./action-reminder-modal";
import { actionReminderProps, isActionReminderOpen, showActionReminder } from "./action-reminder-modal-signals";

const CONSUMER_TEXT = /openai|\bsora\b|chatgpt|midjourney|grok|world\s*labs/i;

vi.mock("@storyteller/ui-modal", () => ({
  Modal: ({ isOpen, title, children }: { isOpen: boolean; title?: string; children: React.ReactNode }) =>
    isOpen ? (
      <div role="dialog">
        {title && <h2>{title}</h2>}
        {children}
      </div>
    ) : null,
}));

afterEach(() => {
  cleanup();
  isActionReminderOpen.value = false;
  actionReminderProps.value = null;
});

describe("action reminder modal", () => {
  it("artcraftLogin shows a neutral coming-soon reminder", () => {
    renderModal("artcraftLogin");
    expect(screen.getByRole("heading").textContent).toBe("Coming soon");
    expect(screen.getByRole("button", { name: "OK" })).toBeTruthy();
  });

  it("default shows the generic reminder", () => {
    renderModal("default");
    expect(screen.getByRole("heading").textContent).toBe("Action Required");
    expect(screen.getByRole("button", { name: /Proceed/ })).toBeTruthy();
  });

  it.each(["soraLogin", "midjourneyLogin", "grokLogin", ""])(
    "removed or unknown type %j falls back to the generic reminder",
    (type) => {
      renderModal(type as ReminderType);
      const dialog = screen.getByRole("dialog");
      expect(screen.getByRole("heading").textContent).toBe("Action Required");
      expect(dialog.textContent).not.toMatch(CONSUMER_TEXT);
    },
  );

  it("an old openAiLogo prop renders no image", () => {
    const props = { openAiLogo: "/openai.png" } as Record<string, unknown>;
    renderModal("default", props);
    expect(screen.getByRole("dialog").querySelector("img")).toBeNull();
  });

  it("hideTitle hides the title for every type", () => {
    renderModal("artcraftLogin", { hideTitle: true });
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("primary action fires once per click", () => {
    const onPrimary = vi.fn();
    renderModal("artcraftLogin", { onPrimaryAction: onPrimary });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it("showActionReminder opens and onClose closes", () => {
    showActionReminder({ reminderType: "artcraftLogin", onPrimaryAction: () => {} });
    expect(isActionReminderOpen.value).toBe(true);
    expect(actionReminderProps.value?.reminderType).toBe("artcraftLogin");
    expect(actionReminderProps.value).not.toHaveProperty("openAiLogo");
    actionReminderProps.value?.onClose();
    expect(isActionReminderOpen.value).toBe(false);
  });
});

function renderModal(reminderType: ReminderType, extra: Record<string, unknown> = {}) {
  render(
    <ActionReminderModal
      isOpen={true}
      onClose={() => {}}
      onPrimaryAction={() => {}}
      reminderType={reminderType}
      {...extra}
    />,
  );
}
