import { Chip } from "@heroui/react";

import { CATEGORY_CHIP_CLOSE_BUTTON_STYLES } from "./utils/categorySelector";

export function SelectedCategoryChips({ categories, onRemove }) {
  if (categories.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => (
        <Chip
          key={category.id}
          variant="flat"
          classNames={{
            closeButton: CATEGORY_CHIP_CLOSE_BUTTON_STYLES,
          }}
          onClose={() => onRemove(category.id)}
        >
          {category.name}
        </Chip>
      ))}
    </div>
  );
}
