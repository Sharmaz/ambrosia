"use client";

import { Card, CardBody, Chip } from "@heroui/react";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

export function OptionTypeCard({ optionType, isSaving, onEdit, onDelete }) {
  const productsTranslation = useTranslations("products");

  return (
    <Card shadow="none" className="border border-gray-200 bg-white">
      <CardBody className="p-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800">{optionType.name}</p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {optionType.values.map((optionValue) => (
                <Chip
                  key={optionValue.id}
                  size="sm"
                  className="bg-gray-100 text-gray-700 border border-gray-200"
                >
                  {optionValue.value}
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              data-testid={`edit-option-type-${optionType.id}`}
              aria-label={`${productsTranslation("edit")} ${optionType.name}`}
              onClick={() => onEdit(optionType.id)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              data-testid={`delete-option-type-${optionType.id}`}
              aria-label={`${productsTranslation("delete")} ${optionType.name}`}
              onClick={() => onDelete(optionType.id)}
              disabled={isSaving}
              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
