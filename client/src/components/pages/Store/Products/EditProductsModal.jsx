"use client";

import { useState } from "react";

import {
  Button,
  Input,
  Switch,
  Textarea,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/react";
import { useTranslations } from "next-intl";

import { useCurrency } from "@/components/hooks/useCurrency";
import { ImageUploader } from "@components/shared/ImageUploader";

import { BundleProductSelector } from "./BundleProductSelector";
import { CategorySelector } from "./CategorySelector";
import { ProductPricingFields } from "./ProductPricingFields";

export function EditProductsModal({
  data,
  allProducts,
  onChange,
  updateProduct,
  onProductUpdated,
  isUploading = false,
  categories = [],
  categoriesLoading = false,
  createCategory,
  editProductsShowModal,
  onClose,
}) {
  const productsTranslations = useTranslations("products");
  const { currency } = useCurrency();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBundleConversionConfirmation, setShowBundleConversionConfirmation] = useState(false);
  const selectedBundleComponents = data.bundleComponents ?? [];
  const bundleRequiresComponents = data.isBundle && selectedBundleComponents.length === 0;

  const handleSubmit = async (productFormSubmission) => {
    productFormSubmission.preventDefault();
    if (isSubmitting || isUploading) return;
    if (bundleRequiresComponents) return;

    try {
      setIsSubmitting(true);
      await updateProduct(data);
      onClose?.();
      onProductUpdated?.();
    } catch {
      // useProducts already shows the user-facing toast for failed mutations.
    } finally {
      setIsSubmitting(false);
    }
  };

  const applyBundleSelection = (isBundleSelected) => {
    onChange({
      isBundle: isBundleSelected,
      hasVariants: isBundleSelected ? false : data.hasVariants,
      bundleComponents: [],
      productStock: isBundleSelected ? 0 : data.productStock,
      productMinStock: isBundleSelected ? 0 : data.productMinStock,
      productMaxStock: isBundleSelected ? 0 : data.productMaxStock,
    });
  };

  const handleBundleToggle = (isBundleSelected) => {
    const willConvertVariantProductToBundle = isBundleSelected && !data.isBundle && data.hasVariants;
    if (willConvertVariantProductToBundle) {
      setShowBundleConversionConfirmation(true);
      return;
    }
    applyBundleSelection(isBundleSelected);
  };

  const confirmBundleConversion = () => {
    setShowBundleConversionConfirmation(false);
    applyBundleSelection(true);
  };

  const cancelBundleConversion = () => {
    setShowBundleConversionConfirmation(false);
  };

  return (
    <>
      <Modal
        isOpen={editProductsShowModal}
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose?.();
        }}
        backdrop="blur"
        shouldBlockScroll={false}
        classNames={{
          backdrop: "backdrop-blur-xs bg-white/10",
          wrapper: "items-start h-auto",
          base: "my-auto overflow-hidden",
          body: "overflow-y-auto max-h-[65vh]",
        }}
        placement="center"
      >
        <ModalContent>
          <ModalHeader>{productsTranslations("modal.titleEdit")}</ModalHeader>

          <ModalBody>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Switch
                isSelected={data.isBundle}
                onValueChange={handleBundleToggle}
              >
                {productsTranslations("modal.isBundle")}
              </Switch>

              <Input
                label={productsTranslations("modal.productNameLabel")}
                placeholder={productsTranslations("modal.productNamePlaceholder")}
                isRequired
                errorMessage={productsTranslations("modal.errorMsgInputFieldEmpty")}
                value={data.productName}
                onChange={({ target: productNameInput }) => onChange({ productName: productNameInput.value })}
              />

              <Textarea
                label={productsTranslations("modal.productDescriptionLabel")}
                placeholder={productsTranslations("modal.productDescriptionPlaceholder")}
                value={data.productDescription ?? ""}
                onChange={({ target: productDescriptionInput }) => onChange({ productDescription: productDescriptionInput.value })}
              />

              <CategorySelector
                categories={categories}
                categoriesLoading={categoriesLoading}
                selectedCategories={data.productCategories}
                onSelectionChange={(keys) => onChange({ productCategories: keys })}
                createCategory={createCategory}
              />

              <Input
                label={productsTranslations("modal.productSKULabel")}
                placeholder={productsTranslations("modal.productSKUPlaceholder")}
                value={data.productSKU ?? ""}
                onChange={({ target: productSkuInput }) => onChange({ productSKU: productSkuInput.value })}
              />

              {!data.isBundle && (
                <div className="flex items-center gap-3">
                  <Switch
                    isSelected={data.hasVariants ?? false}
                    onValueChange={(hasVariantsSelected) => onChange({ hasVariants: hasVariantsSelected })}
                    size="sm"
                  />
                  <span className="text-sm text-gray-700">{productsTranslations("hasVariants")}</span>
                </div>
              )}

              {!data.hasVariants && (
                <ProductPricingFields
                  data={data}
                  onChange={onChange}
                  currency={currency}
                  includeStock={!data.isBundle}
                />
              )}

              {data.hasVariants && !data.isBundle && (
                <p className="text-xs text-gray-400">{productsTranslations("variantsHintEditModal")}</p>
              )}

              {data.isBundle && (
                <>
                  <BundleProductSelector
                    selectedProducts={selectedBundleComponents}
                    allProducts={allProducts ?? []}
                    onComponentsChange={(bundleComponents) => onChange({ bundleComponents })}
                  />
                  {bundleRequiresComponents && (
                    <p className="text-xs text-red-500">
                      {productsTranslations("modal.bundleComponentsRequired")}
                    </p>
                  )}
                </>
              )}

              <ImageUploader
                title=""
                uploadText={productsTranslations("modal.productImageUpload")}
                uploadDescription={productsTranslations("modal.productImageUploadMessage")}
                onChange={(file) => onChange({ productImage: file, productImageRemoved: file === null })}
                image={data.productImageRemoved ? null : (data.productImage || data.productImageUrl)}
              />

              <ModalFooter className="flex justify-between p-0 my-4">
                <Button
                  variant="bordered"
                  type="button"
                  className="px-6 py-2 border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  onPress={() => onClose?.()}
                >
                  {productsTranslations("modal.cancelButton")}
                </Button>

                <Button
                  color="primary"
                  className="bg-green-800"
                  type="submit"
                  isLoading={isSubmitting || isUploading}
                  isDisabled={bundleRequiresComponents}
                >
                  {productsTranslations("modal.editButton")}
                </Button>
              </ModalFooter>
            </form>
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={showBundleConversionConfirmation}
        onOpenChange={(isOpen) => {
          if (!isOpen) cancelBundleConversion();
        }}
        backdrop="blur"
        classNames={{
          backdrop: "backdrop-blur-xs bg-white/10",
        }}
        placement="center"
      >
        <ModalContent>
          <ModalHeader>{productsTranslations("modal.confirmBundleConversionTitle")}</ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600">
              {productsTranslations("modal.confirmBundleConversionDescription")}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="bordered"
              type="button"
              className="px-6 py-2 border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              onPress={cancelBundleConversion}
            >
              {productsTranslations("modal.cancelButton")}
            </Button>
            <Button color="warning" onPress={confirmBundleConversion}>
              {productsTranslations("modal.confirmBundleConversionButton")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
