"use client";
import { useState } from "react";

import { Button, Input } from "@heroui/react";
import { useTranslations } from "next-intl";

import { OptionValueInput } from "./OptionValueInput";

const OPTION_TYPE_FIELD_CLASS_NAMES = {
  inputWrapper: "min-h-12 h-12 shadow-none",
};

export function OptionTypeForm({ initial, onSave, onCancel, isSaving }) {
  const productsTranslation = useTranslations("products");
  const [optionTypeName, setOptionTypeName] = useState(initial?.name ?? "");
  const [optionValueNames, setOptionValueNames] =
    useState(initial?.values?.map((initialOptionValue) => initialOptionValue.value) ?? []);

  const handleSave = () => {
    if (!optionTypeName.trim()) return;
    onSave({
      name: optionTypeName.trim(),
      values: optionValueNames.map((optionValueName, displayOrder) => ({ value: optionValueName, displayOrder })),
    });
  };

  return (
    <div className="p-4 bg-gray-50 rounded-2xl border border-dashed border-gray-300 space-y-3">
      <Input
        size="sm"
        label={productsTranslation("optionTypeName")}
        placeholder={productsTranslation("optionTypeNamePlaceholder")}
        value={optionTypeName}
        classNames={OPTION_TYPE_FIELD_CLASS_NAMES}
        onChange={(optionTypeNameChangeEvent) => setOptionTypeName(optionTypeNameChangeEvent.target.value)}
      />
      <OptionValueInput optionValueNames={optionValueNames} onOptionValueNamesChange={setOptionValueNames} />
      <div className="flex gap-2 justify-end pt-1">
        <Button size="sm" variant="bordered" onPress={onCancel} isDisabled={isSaving}>
          {productsTranslation("cancelVariant")}
        </Button>
        <Button
          size="sm"
          color="primary"
          className="bg-green-800"
          onPress={handleSave}
          isLoading={isSaving}
          isDisabled={!optionTypeName.trim() || optionValueNames.length === 0}
        >
          {productsTranslation("saveVariant")}
        </Button>
      </div>
    </div>
  );
}
