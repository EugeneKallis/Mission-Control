/**
 * Tests for src/components/ui/confirm-dialog.tsx
 * Covers: render, default + custom label, cancel/confirm flow, variant.
 */
import { describe, test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@/test-utils/render";
import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  test("renders nothing when open is false", () => {
    render(
      <ConfirmDialog
        open={false}
        onClose={mock()}
        onConfirm={mock()}
        title="Delete?"
      >
        x
      </ConfirmDialog>,
    );
    expect(screen.queryByRole("heading", { name: "Delete?" })).not.toBeInTheDocument();
  });

  test("renders title, children, and default confirm label", () => {
    render(
      <ConfirmDialog open onClose={mock()} onConfirm={mock()} title="Delete?">
        Are you sure?
      </ConfirmDialog>,
    );
    // The heading's accessible name includes the icon ("warning Delete?")
    // because the icon <span> is a child of the <h2>. Use getByText for
    // the exact title text and getAllByRole for the heading element.
    expect(screen.getByText("Delete?")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  test("uses a custom confirmLabel", () => {
    render(
      <ConfirmDialog
        open
        onClose={mock()}
        onConfirm={mock()}
        title="T"
        confirmLabel="Yes, do it"
      >
        x
      </ConfirmDialog>,
    );
    expect(
      screen.getByRole("button", { name: "Yes, do it" }),
    ).toBeInTheDocument();
  });

  test("Cancel button calls onClose and not onConfirm", () => {
    const onClose = mock();
    const onConfirm = mock();
    render(
      <ConfirmDialog open onClose={onClose} onConfirm={onConfirm} title="T">
        x
      </ConfirmDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("Confirm button calls onConfirm then onClose", () => {
    const calls: string[] = [];
    render(
      <ConfirmDialog
        open
        onClose={() => calls.push("close")}
        onConfirm={() => calls.push("confirm")}
        title="T"
      >
        x
      </ConfirmDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(calls).toEqual(["confirm", "close"]);
  });

  test("danger variant shows the warning icon by default", () => {
    render(
      <ConfirmDialog
        open
        onClose={mock()}
        onConfirm={mock()}
        title="T"
        variant="danger"
      >
        x
      </ConfirmDialog>,
    );
    expect(screen.getByText("warning")).toBeInTheDocument();
  });

  test("primary variant shows the check_circle icon by default", () => {
    render(
      <ConfirmDialog
        open
        onClose={mock()}
        onConfirm={mock()}
        title="T"
        variant="primary"
      >
        x
      </ConfirmDialog>,
    );
    expect(screen.getByText("check_circle")).toBeInTheDocument();
  });

  test("explicit icon overrides the variant default", () => {
    render(
      <ConfirmDialog
        open
        onClose={mock()}
        onConfirm={mock()}
        title="T"
        icon="custom-icon"
        variant="danger"
      >
        x
      </ConfirmDialog>,
    );
    expect(screen.getByText("custom-icon")).toBeInTheDocument();
    expect(screen.queryByText("warning")).not.toBeInTheDocument();
  });

  test("danger variant applies the error colour to the confirm button", () => {
    render(
      <ConfirmDialog
        open
        onClose={mock()}
        onConfirm={mock()}
        title="T"
        variant="danger"
      >
        x
      </ConfirmDialog>,
    );
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm.className).toContain("bg-error");
  });

  test("primary variant applies the primary colour to the confirm button", () => {
    render(
      <ConfirmDialog
        open
        onClose={mock()}
        onConfirm={mock()}
        title="T"
        variant="primary"
      >
        x
      </ConfirmDialog>,
    );
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm.className).toContain("bg-primary");
  });
});
