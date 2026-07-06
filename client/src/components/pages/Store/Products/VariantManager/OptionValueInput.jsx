"use client";
import { useState } from "react";

import { Button, Chip, Input } from "@heroui/react";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

const OPTION_VALUE_FIELD_CLASS_NAMES = {
  inputWrapper: "min-h-12 h-12 shadow-none",
};

export function OptionValueInput({ optionValueNames, onOptionValueNamesChange }) {
  const productsTranslation = useTranslations("products");
  const [pendingOptionValueName, setPendingOptionValueName] = useState("");

  const addValue = () => {
    const trimmedOptionValueName = pendingOptionValueName.trim();
    if (!trimmedOptionValueName || optionValueNames.includes(trimmedOptionValueName)) return;
    onOptionValueNamesChange([...optionValueNames, trimmedOptionValueName]);
    setPendingOptionValueName("");
  };

  const removeValue = (valueToRemove) => {
    onOptionValueNamesChange(
      optionValueNames.filter((existingOptionValueName) => existingOptionValueName !== valueToRemove),
    );
  };

  const handleKeyDown = (keyboardEvent) => {
    if (keyboardEvent.key === "Enter") {
      keyboardEvent.preventDefault();
      addValue();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          size="sm"
          aria-label={productsTranslation("optionValuePlaceholder")}
          placeholder={productsTranslation("optionValuePlaceholder")}
          value={pendingOptionValueName}
          classNames={OPTION_VALUE_FIELD_CLASS_NAMES}
          onChange={(optionValueChangeEvent) => setPendingOptionValueName(optionValueChangeEvent.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button
          isIconOnly
          size="sm"
          variant="flat"
          className="min-w-12 h-12"
          onPress={addValue}
          isDisabled={!pendingOptionValueName.trim()}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      {optionValueNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {optionValueNames.map((optionValueName) => (
            <Chip
              key={optionValueName}
              size="sm"
              className="bg-gray-100 text-gray-700"
              endContent={(
                <button
                  type="button"
                  onClick={() => removeValue(optionValueName)}
                  className="ml-0.5 text-gray-400 hover:text-gray-600"
                  aria-label={productsTranslation("removeOptionValue")}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            >
              {optionValueName}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
