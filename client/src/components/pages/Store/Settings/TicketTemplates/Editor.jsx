"use client";

import { Input, Select, SelectItem } from "@heroui/react";

import { DATE_FORMATS, TIME_FORMATS } from "./defaults";
import { TemplateElementsEditor } from "./ElementsEditor";

export function TicketTemplatesEditor({
  name,
  onNameChange,
  printFormats,
  onPrintFormatsChange,
  elements,
  onElementChange,
  onElementAdd,
  onElementReorder,
  onElementRemove,
  config,
  settingsTranslations,
}) {
  return (
    <div className="flex min-w-0 flex-2 flex-col gap-4">
      <Input
        label={settingsTranslations("templates.nameLabel")}
        value={name}
        onChange={onNameChange}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label={settingsTranslations("templates.dateFormatLabel")}
          selectedKeys={[printFormats.dateFormat]}
          onChange={(event) => {
            if (event.target.value) onPrintFormatsChange({ ...printFormats, dateFormat: event.target.value });
          }}
        >
          {DATE_FORMATS.map((dateFormat) => (
            <SelectItem key={dateFormat} value={dateFormat}>
              {settingsTranslations(`templates.dateFormats.${dateFormat}`)}
            </SelectItem>
          ))}
        </Select>

        <Select
          label={settingsTranslations("templates.timeFormatLabel")}
          selectedKeys={[printFormats.timeFormat]}
          onChange={(event) => {
            if (event.target.value) onPrintFormatsChange({ ...printFormats, timeFormat: event.target.value });
          }}
        >
          {TIME_FORMATS.map((timeFormat) => (
            <SelectItem key={timeFormat} value={timeFormat}>
              {settingsTranslations(`templates.timeFormats.${timeFormat}`)}
            </SelectItem>
          ))}
        </Select>
      </div>

      <TemplateElementsEditor
        elements={elements}
        onChange={onElementChange}
        onAdd={onElementAdd}
        onReorder={onElementReorder}
        onRemove={onElementRemove}
        config={config}
        printFormats={printFormats}
        settingsTranslations={settingsTranslations}
      />
    </div>
  );
}
