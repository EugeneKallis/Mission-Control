/**
 * Tests for src/components/ui/input.tsx
 * Covers: TextInput and Select — value, onChange, disabled, label, hint.
 */
import { describe, test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@/test-utils/render";
import { TextInput, Select } from "./input";

describe("TextInput", () => {
  test("renders an input that reflects value and fires onChange", () => {
    const onChange = mock();
    render(<TextInput value="hi" onChange={onChange} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("hi");
    fireEvent.change(input, { target: { value: "there" } });
    expect(onChange).toHaveBeenCalled();
  });

  test("renders the label when provided", () => {
    render(<TextInput label="Username" />);
    expect(screen.getByText("Username")).toBeInTheDocument();
  });

  test("omits the label element when not provided", () => {
    render(<TextInput />);
    expect(screen.queryByRole("label")).not.toBeInTheDocument();
  });

  test("renders the hint when provided", () => {
    render(<TextInput hint="Use letters only" />);
    expect(screen.getByText("Use letters only")).toBeInTheDocument();
  });

  test("respects the disabled prop", () => {
    render(<TextInput disabled value="x" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  test("passes through the type prop", () => {
    render(<TextInput type="email" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.type).toBe("email");
  });

  test("merges custom className", () => {
    render(<TextInput className="extra" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.className).toContain("extra");
    expect(input.className).toContain("w-full");
  });
});

describe("Select", () => {
  test("renders children as <option>s", () => {
    render(
      <Select>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.options).toHaveLength(2);
    expect(select.options[0].textContent).toBe("A");
  });

  test("renders the label", () => {
    render(
      <Select label="Role">
        <option>x</option>
      </Select>,
    );
    expect(screen.getByText("Role")).toBeInTheDocument();
  });

  test("fires onChange when a new option is selected", () => {
    const onChange = mock();
    render(
      <Select onChange={onChange} value="a">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
    expect(onChange).toHaveBeenCalled();
  });
});
