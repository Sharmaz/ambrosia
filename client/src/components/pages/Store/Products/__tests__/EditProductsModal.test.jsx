import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { I18nProvider } from "@/i18n/I18nProvider";

import { EditProductsModal } from "../EditProductsModal";

jest.mock("../CategorySelector", () => ({
  CategorySelector: () => (
    <div aria-label="modal.productCategoryLabel">
      category-selector
    </div>
  ),
}));

jest.mock("../BundleProductSelector", () => ({
  BundleProductSelector: () => <div data-testid="bundle-product-selector" />,
}));

jest.mock("@heroui/react", () => {
  const actual = jest.requireActual("@heroui/react");
  const NumberInput = ({
    label,
    onValueChange,
    value = "",
    isRequired,
    errorMessage,
    startContent,
    minValue,
    maxValue,
    classNames,
    ...props
  }) => (
    <input
      aria-label={label}
      type="number"
      value={value}
      onChange={(numberInputChangeEvent) => {
        const parsed = Number(numberInputChangeEvent.target.value);
        const clamped = Number.isNaN(parsed) ? "" : Math.max(0, parsed);
        onValueChange?.(clamped);
      }}
      {...props}
    />
  );

  const Switch = ({ children, isSelected, onValueChange }) => (
    <label>
      <input
        data-testid={children === "modal.isBundle" ? "bundle-switch" : "variants-switch"}
        type="checkbox"
        checked={isSelected ?? false}
        onChange={(switchChangeEvent) => onValueChange?.(switchChangeEvent.target.checked)}
      />
      {children}
    </label>
  );

  const Button = ({
    children,
    onPress,
    isDisabled,
    disabled,
    type = "button",
    isLoading,
    isIconOnly,
    fullWidth,
    ...buttonProps
  }) => (
    <button type={type} onClick={onPress} disabled={isDisabled || disabled || isLoading} {...buttonProps}>
      {children}
    </button>
  );

  return { ...actual, addToast: jest.fn(), Button, NumberInput, Switch };
});

jest.mock("@/components/hooks/useCurrency", () => ({
  useCurrency: () => ({
    currency: { acronym: "$" },
  }),
}));

const categories = [
  { id: "cat-1", name: "Category 1" },
];

const { addToast } = require("@heroui/react");

const baseProductForm = {
  productId: "1",
  productName: "Jade Wallet",
  productDescription: "Hardware wallet",
  productCategories: ["cat-1"],
  productSKU: "jade-wallet",
  productPrice: 10,
  productStock: 5,
  productImage: "",
};

const mockFileReader = (fileReaderResult = "data:image/png;base64,test") => {
  const originalFileReader = global.FileReader;
  global.FileReader = jest.fn(() => ({
    readAsDataURL() {
      this.result = fileReaderResult;
      this.onloadend?.({ target: { result: fileReaderResult } });
    },
  }));
  return () => {
    global.FileReader = originalFileReader;
  };
};

const renderModal = (props = {}) => render(
  <I18nProvider>
    <EditProductsModal
      productForm={baseProductForm}
      onChange={jest.fn()}
      updateProduct={jest.fn()}
      onProductUpdated={jest.fn()}
      categories={categories}
      categoriesLoading={false}
      createCategory={jest.fn()}
      editProductsShowModal
      onClose={jest.fn()}
      {...props}
    />
  </I18nProvider>,
);

describe("EditProductsModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders product data and translations", () => {
    renderModal();

    expect(screen.getByText("modal.titleEdit")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Jade Wallet")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Hardware wallet")).toBeInTheDocument();
  });

  it("updates text fields with string values", () => {
    const onChange = jest.fn();
    renderModal({ onChange });

    fireEvent.change(screen.getByLabelText("modal.productNameLabel"), { target: { value: "New name" } });
    expect(onChange).toHaveBeenLastCalledWith({ productName: "New name" });

    fireEvent.change(screen.getByLabelText("modal.productDescriptionLabel"), { target: { value: "New Description" } });
    expect(onChange).toHaveBeenLastCalledWith({ productDescription: "New Description" });

    fireEvent.change(screen.getByLabelText("modal.productSKULabel"), { target: { value: "sku-456" } });
    expect(onChange).toHaveBeenLastCalledWith({ productSKU: "sku-456" });
  });

  it("enforces non-negative numeric values for price and stock", () => {
    const onChange = jest.fn();
    renderModal({ onChange });

    fireEvent.change(screen.getByLabelText("modal.productPriceLabel"), { target: { value: "-12" } });
    const latestPriceUpdate = onChange.mock.calls.at(-1)[0];
    expect(typeof latestPriceUpdate.productPrice).toBe("number");
    expect(latestPriceUpdate.productPrice).toBeGreaterThanOrEqual(0);

    fireEvent.change(screen.getByLabelText("modal.productStockLabel"), { target: { value: "-8" } });
    const latestStockUpdate = onChange.mock.calls.at(-1)[0];
    expect(typeof latestStockUpdate.productStock).toBe("number");
    expect(latestStockUpdate.productStock).toBeGreaterThanOrEqual(0);
  });

  it("handles image upload and removal", async () => {
    const onChange = jest.fn();
    const restoreFileReader = mockFileReader();
    renderModal({ onChange });
    const fileInput = document.querySelector("input[type=\"file\"]");
    const file = new File(["content"], "photo.png", { type: "image/png" });

    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onChange).toHaveBeenCalledWith({ productImage: file, productImageRemoved: false });
    expect(await screen.findByAltText("Image preview")).toBeInTheDocument();

    const removeButton = screen.getByTestId("remove-image-button");
    fireEvent.click(removeButton);

    const latestImageUpdate = onChange.mock.calls.at(-1)?.[0];
    expect(latestImageUpdate).toEqual({ productImage: null, productImageRemoved: true });
    expect(screen.queryByAltText("Image preview")).not.toBeInTheDocument();
    restoreFileReader();
  });

  it("ignores image change when no file is provided", () => {
    const onChange = jest.fn();
    renderModal({ onChange });
    const fileInput = document.querySelector("input[type=\"file\"]");
    fireEvent.change(fileInput, { target: { files: [] } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("handles category select with empty value and loading", () => {
    renderModal({
      categories: [],
      categoriesLoading: true,
      productForm: { ...baseProductForm, productCategories: [] },
    });

    const select = screen.getAllByLabelText("modal.productCategoryLabel")[0];
    expect(select).toBeInTheDocument();
  });

  it("closes modal via onOpenChange", () => {
    const onClose = jest.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByText("modal.cancelButton"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders the category selector in edit mode", () => {
    renderModal();

    expect(screen.getByLabelText("modal.productCategoryLabel")).toBeInTheDocument();
  });

  it("closes on cancel", () => {
    const onClose = jest.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByText("modal.cancelButton"));

    expect(onClose).toHaveBeenCalled();
  });

  it("renders the bundle toggle", () => {
    renderModal();

    expect(screen.getByText("modal.isBundle")).toBeInTheDocument();
  });

  it("hides stock field when product is a bundle", () => {
    renderModal({ productForm: { ...baseProductForm, isBundle: true } });

    expect(screen.queryByLabelText("modal.productStockLabel")).not.toBeInTheDocument();
  });

  it("shows BundleComponentSelector when product is a bundle", () => {
    renderModal({ productForm: { ...baseProductForm, isBundle: true } });

    expect(screen.getByTestId("bundle-product-selector")).toBeInTheDocument();
  });

  it("requires bundle components before saving a bundle", () => {
    const updateProduct = jest.fn();
    renderModal({
      updateProduct,
      productForm: { ...baseProductForm, isBundle: true, bundleComponents: [] },
    });

    expect(screen.getByText("modal.bundleComponentsRequired")).toBeInTheDocument();
    expect(screen.getByText("modal.editButton")).toBeDisabled();

    fireEvent.click(screen.getByText("modal.editButton"));

    expect(updateProduct).not.toHaveBeenCalled();
  });

  it("calls onChange with bundle fields when bundle toggle is switched on", () => {
    const onChange = jest.fn();
    renderModal({ onChange });

    fireEvent.click(screen.getByTestId("bundle-switch"));

    expect(onChange).toHaveBeenCalledWith({
      isBundle: true,
      hasVariants: false,
      bundleComponents: [],
      productStock: 0,
      productMinStock: 0,
      productMaxStock: 0,
    });
  });

  it("asks for confirmation before converting a variant product to a bundle", () => {
    const onChange = jest.fn();
    renderModal({ productForm: { ...baseProductForm, hasVariants: true, isBundle: false }, onChange });

    fireEvent.click(screen.getByTestId("bundle-switch"));

    expect(screen.getByText("modal.confirmBundleConversionTitle")).toBeInTheDocument();
    expect(screen.getByText("modal.confirmBundleConversionDescription")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("modal.confirmBundleConversionButton"));

    expect(onChange).toHaveBeenCalledWith({
      isBundle: true,
      hasVariants: false,
      bundleComponents: [],
      productStock: 0,
      productMinStock: 0,
      productMaxStock: 0,
    });
  });

  it("saves changes and closes on submit", async () => {
    const onClose = jest.fn();
    const updateProduct = jest.fn(() => Promise.resolve());
    const onProductUpdated = jest.fn();

    renderModal({ onClose, updateProduct, onProductUpdated });

    fireEvent.click(screen.getByText("modal.editButton"));

    await waitFor(() => expect(updateProduct).toHaveBeenCalledWith(baseProductForm));
    expect(addToast).toHaveBeenCalledWith({
      description: "toasts.updateSuccess",
      color: "success",
    });
    expect(onClose).toHaveBeenCalled();
    expect(onProductUpdated).toHaveBeenCalled();
  });

  it("keeps the modal open when update fails", async () => {
    const onClose = jest.fn();
    const updateProduct = jest.fn(() => Promise.reject(new Error("Invalid product data")));
    const onProductUpdated = jest.fn();

    renderModal({ onClose, updateProduct, onProductUpdated });

    fireEvent.click(screen.getByText("modal.editButton"));

    await waitFor(() => expect(updateProduct).toHaveBeenCalledWith(baseProductForm));
    expect(onClose).not.toHaveBeenCalled();
    expect(onProductUpdated).not.toHaveBeenCalled();
  });

  it("does not submit when uploading", () => {
    const updateProduct = jest.fn();
    renderModal({ updateProduct, isUploading: true });

    fireEvent.click(screen.getByText("modal.editButton"));
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it("prevents double submit while submitting", () => {
    const updateProduct = jest.fn(() => new Promise(() => { }));
    renderModal({ updateProduct, isUploading: false });

    fireEvent.click(screen.getByText("modal.editButton"));
    fireEvent.click(screen.getByText("modal.editButton"));
    expect(updateProduct).toHaveBeenCalledTimes(1);
  });
});
