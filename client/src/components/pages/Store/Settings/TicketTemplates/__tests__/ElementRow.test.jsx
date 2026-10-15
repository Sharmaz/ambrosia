import { fireEvent, render, screen } from "@testing-library/react";

import { TemplateElementRow } from "../ElementRow";

jest.mock("@heroui/react", () => ({
  Button: ({ onPress, children, "aria-label": ariaLabel, isIconOnly, ...props }) => (
    <button type="button" onClick={onPress} aria-label={ariaLabel} {...props}>
      {children}
    </button>
  ),
  Input: ({ label, value, onChange, onSelect, endContent }) => (
    <label>
      {label}
      <input aria-label={label} value={value ?? ""} onChange={onChange} onSelect={onSelect} />
      {endContent}
    </label>
  ),
  Select: ({ label, children, onChange, selectedKeys }) => (
    <label>
      {label}
      <select
        aria-label={label}
        onChange={onChange}
        value={(selectedKeys && selectedKeys[0]) ?? ""}
      >
        {children}
      </select>
    </label>
  ),
  SelectItem: ({ value, children }) => (
    <option value={value}>{children}</option>
  ),
  Tooltip: ({ children }) => <>{children}</>,
}));

jest.mock("@components/shared/DeleteButton", () => ({
  DeleteButton: ({ onPress }) => (
    <button type="button" data-testid="delete-button" onClick={onPress}>
      delete
    </button>
  ),
}));

jest.mock("../VariablePicker", () => ({
  TemplateVariablePicker: ({ onSelect, onDeselect }) => (
    <>
      <button
        type="button"
        data-testid="variable-picker"
        onClick={() => onSelect("{{config.businessName}}")}
      >
        picker
      </button>
      <button
        type="button"
        data-testid="variable-deselect"
        onClick={() => onDeselect("{{print.date}}")}
      >
        deselect
      </button>
    </>
  ),
}));

jest.mock("@dnd-kit/sortable", () => ({
  useSortable: jest.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
}));

jest.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: jest.fn(() => "") } },
}));

const settingsTranslations = (key) => key;

const textTemplateElement = {
  localId: "el-1",
  type: "TEXT",
  value: "",
  style: { bold: false, justification: "LEFT", fontSize: "NORMAL" },
};

describe("TemplateElementRow", () => {
  it("updates element fields and toggles bold when expanded", () => {
    const onChange = jest.fn();
    const onRemove = jest.fn();

    render(
      <TemplateElementRow
        templateElement={textTemplateElement}
        isOpen
        onToggle={jest.fn()}
        onChange={onChange}
        onRemove={onRemove}
        businessConfig={null}
        settingsTranslations={settingsTranslations}
      />,
    );

    fireEvent.change(screen.getByLabelText("templates.elementValueLabel"), {
      target: { value: "Hello" },
    });
    expect(onChange).toHaveBeenCalledWith({ ...textTemplateElement, value: "Hello" });

    fireEvent.change(screen.getByLabelText("templates.elementTypeLabel"), {
      target: { value: "HEADER" },
    });
    expect(onChange).toHaveBeenCalledWith({ ...textTemplateElement, type: "HEADER" });

    fireEvent.change(screen.getByLabelText("templates.justificationLabel"), {
      target: { value: "RIGHT" },
    });
    expect(onChange).toHaveBeenCalledWith({
      ...textTemplateElement,
      style: { ...textTemplateElement.style, justification: "RIGHT" },
    });

    fireEvent.change(screen.getByLabelText("templates.fontSizeLabel"), {
      target: { value: "LARGE" },
    });
    expect(onChange).toHaveBeenCalledWith({
      ...textTemplateElement,
      style: { ...textTemplateElement.style, fontSize: "LARGE" },
    });

    fireEvent.click(screen.getByRole("button", { name: "templates.boldToggle" }));
    expect(onChange).toHaveBeenCalledWith({
      ...textTemplateElement,
      style: { ...textTemplateElement.style, bold: true },
    });

    fireEvent.click(screen.getByTestId("delete-button"));
    expect(onRemove).toHaveBeenCalledWith("el-1");
  });

  it("collapses fields by default and shows them on toggle", () => {
    const onToggle = jest.fn();

    render(
      <TemplateElementRow
        templateElement={textTemplateElement}
        isOpen={false}
        onToggle={onToggle}
        onChange={jest.fn()}
        onRemove={jest.fn()}
        businessConfig={null}
        settingsTranslations={settingsTranslations}
      />,
    );

    expect(screen.queryByLabelText("templates.elementValueLabel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "templates.expand" }));
    expect(onToggle).toHaveBeenCalled();
  });

  it("hides value and style controls for line breaks", () => {
    render(
      <TemplateElementRow
        templateElement={{ localId: "el-2", type: "LINE_BREAK", value: "", style: {} }}
        isOpen
        onToggle={jest.fn()}
        onChange={jest.fn()}
        onRemove={jest.fn()}
        businessConfig={null}
        settingsTranslations={settingsTranslations}
      />,
    );

    expect(screen.queryByLabelText("templates.elementValueLabel")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("templates.justificationLabel")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("templates.fontSizeLabel")).not.toBeInTheDocument();
  });

  it.each(["HEADER", "TEXT", "FOOTER"])(
    "shows variable picker for %s type",
    (type) => {
      render(
        <TemplateElementRow
          templateElement={{ localId: "el-3", type, value: "", style: {} }}
          isOpen
          onToggle={jest.fn()}
          onChange={jest.fn()}
          onRemove={jest.fn()}
          businessConfig={null}
          settingsTranslations={settingsTranslations}
        />,
      );
      expect(screen.getByTestId("variable-picker")).toBeInTheDocument();
    },
  );

  it.each(["QRCODE", "TABLE_HEADER"])(
    "hides variable picker for %s type",
    (type) => {
      render(
        <TemplateElementRow
          templateElement={{ localId: "el-4", type, value: "", style: {} }}
          isOpen
          onToggle={jest.fn()}
          onChange={jest.fn()}
          onRemove={jest.fn()}
          businessConfig={null}
          settingsTranslations={settingsTranslations}
        />,
      );
      expect(screen.queryByTestId("variable-picker")).not.toBeInTheDocument();
    },
  );

  it("selecting a variable appends it when the cursor was never placed", () => {
    const onChange = jest.fn();
    render(
      <TemplateElementRow
        templateElement={{ localId: "el-5", type: "TEXT", value: "Welcome to", style: {} }}
        isOpen
        onToggle={jest.fn()}
        onChange={onChange}
        onRemove={jest.fn()}
        businessConfig={null}
        settingsTranslations={settingsTranslations}
      />,
    );
    fireEvent.click(screen.getByTestId("variable-picker"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: "Welcome to {{config.businessName}}" }),
    );
  });

  it("deselecting a variable removes every occurrence from the value", () => {
    const onChange = jest.fn();
    render(
      <TemplateElementRow
        templateElement={{ localId: "el-7", type: "TEXT", value: "{{print.date}} {{print.date}} {{print.time}}", style: {} }}
        isOpen
        onToggle={jest.fn()}
        onChange={onChange}
        onRemove={jest.fn()}
        businessConfig={null}
        settingsTranslations={settingsTranslations}
      />,
    );
    fireEvent.click(screen.getByTestId("variable-deselect"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: "{{print.time}}" }),
    );
  });

  it("selecting a variable inserts it at the cursor", () => {
    const onChange = jest.fn();
    render(
      <TemplateElementRow
        templateElement={{ localId: "el-6", type: "TEXT", value: "Hi alice!", style: {} }}
        isOpen
        onToggle={jest.fn()}
        onChange={onChange}
        onRemove={jest.fn()}
        businessConfig={null}
        settingsTranslations={settingsTranslations}
      />,
    );
    const valueInput = screen.getByLabelText("templates.elementValueLabel");
    valueInput.setSelectionRange(3, 8);
    fireEvent.select(valueInput);
    fireEvent.click(screen.getByTestId("variable-picker"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: "Hi {{config.businessName}}!" }),
    );
  });
});
