/**
 * Tests for src/components/ui/modal.tsx
 * Covers: open gating, ESC key, backdrop click, close button, icon, actions.
 */
import { describe, test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@/test-utils/render";
import { Modal } from "./modal";

describe("Modal", () => {
  test("renders nothing when open is false", () => {
    render(
      <Modal open={false} onClose={mock()} title="X">
        body
      </Modal>,
    );
    expect(screen.queryByRole("heading", { name: "X" })).not.toBeInTheDocument();
  });

  test("renders title, children, and actions when open", () => {
    render(
      <Modal
        open
        onClose={mock()}
        title="Hello"
        actions={<button>OK</button>}
      >
        Body text
      </Modal>,
    );
    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByText("Body text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
  });

  test("renders the icon when provided", () => {
    render(
      <Modal open onClose={mock()} title="T" icon="settings">
        x
      </Modal>,
    );
    expect(screen.getByText("settings")).toBeInTheDocument();
  });

  test("omits the icon span when icon is not provided", () => {
    render(
      <Modal open onClose={mock()} title="T">
        x
      </Modal>,
    );
    // The close button icon is the only material-symbols span.
    const icons = document.querySelectorAll(".material-symbols-outlined");
    expect(icons).toHaveLength(1);
    expect(icons[0].textContent).toBe("close");
  });

  test("calls onClose when the close button is clicked", () => {
    const onClose = mock();
    render(
      <Modal open onClose={onClose} title="T">
        x
      </Modal>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("calls onClose when the Escape key is pressed", () => {
    const onClose = mock();
    render(
      <Modal open onClose={onClose} title="T">
        x
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("does not bind the Escape key handler when closed", () => {
    const onClose = mock();
    render(
      <Modal open={false} onClose={onClose} title="T">
        x
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  test("calls onClose when the backdrop is clicked", () => {
    const onClose = mock();
    render(
      <Modal open onClose={onClose} title="T">
        x
      </Modal>,
    );
    // Backdrop is the fixed full-screen container.
    const backdrop = document.querySelector(".fixed.inset-0") as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("does not call onClose when the modal body is clicked", () => {
    const onClose = mock();
    render(
      <Modal open onClose={onClose} title="T">
        inner
      </Modal>,
    );
    const heading = screen.getByRole("heading", { name: "T" });
    // Click bubbles up to the backdrop, but target !== currentTarget on
    // the inner panel so onClose should NOT fire.
    fireEvent.click(heading);
    expect(onClose).not.toHaveBeenCalled();
  });
});
