"use client";

import { DEFAULT_STYLE } from "../defaults";

import { ElementLineBreak } from "./ElementLineBreak";
import { ElementLogo } from "./ElementLogo";
import { ElementQrCode } from "./ElementQrCode";
import { ElementSeparator } from "./ElementSeparator";
import { ElementTableRow } from "./ElementTableRow";
import { ElementText } from "./ElementText";
import { ElementTotalRow } from "./ElementTotalRow";

const ALWAYS_VISIBLE_TYPES = ["SEPARATOR", "LINE_BREAK", "TABLE_ROW", "LOGO"];

export function hasVisibleContent(templateElements) {
  return Array.isArray(templateElements) && templateElements.some(
    (templateElement) => ALWAYS_VISIBLE_TYPES.includes(templateElement.type) || templateElement.value?.trim(),
  );
}

const fontSizeClasses = {
  NORMAL: "text-sm",
  LARGE: "text-base",
  EXTRA_LARGE: "text-lg",
};

function resolveAlignment(justification) {
  if (justification === "CENTER") return "text-center";
  if (justification === "RIGHT") return "text-right";
  return "text-left";
}

export function TicketElementsPreview({ templateElements, businessConfig, printFormats }) {
  if (!Array.isArray(templateElements) || templateElements.length === 0) {
    return null;
  }

  return templateElements.flatMap((templateElement) => {
    const elementStyle = templateElement.style || DEFAULT_STYLE;
    const elementClassName = [
      resolveAlignment(elementStyle.justification),
      fontSizeClasses[elementStyle.fontSize] || fontSizeClasses.NORMAL,
      elementStyle.bold ? "font-semibold" : "font-normal",
    ].join(" ");

    if (templateElement.type === "SEPARATOR") {
      return [<ElementSeparator key={`${templateElement.localId}-sep`} />];
    }
    if (templateElement.type === "LINE_BREAK") {
      return [<ElementLineBreak key={`${templateElement.localId}-break`} />];
    }
    if (templateElement.type === "QRCODE") {
      return [
        <ElementQrCode
          key={`${templateElement.localId}-qr`}
          templateText={templateElement.value}
          businessConfig={businessConfig}
          printFormats={printFormats}
          fontSize={elementStyle.fontSize}
          justification={elementStyle.justification}
          className={elementClassName}
        />,
      ];
    }
    if (templateElement.type === "LOGO") {
      return [
        <ElementLogo
          key={`${templateElement.localId}-logo`}
          templateText={templateElement.value}
          businessConfig={businessConfig}
          fontSize={elementStyle.fontSize}
          justification={elementStyle.justification}
          className={elementClassName}
        />,
      ];
    }
    if (templateElement.type === "TABLE_ROW") {
      return ElementTableRow({ localId: templateElement.localId, className: elementClassName });
    }
    if (templateElement.type === "TOTAL_ROW") {
      return ElementTotalRow({
        localId: templateElement.localId,
        templateText: templateElement.value,
        businessConfig,
        printFormats,
        className: elementClassName,
      });
    }
    return [
      <ElementText
        key={templateElement.localId}
        localId={templateElement.localId}
        templateText={templateElement.value}
        businessConfig={businessConfig}
        printFormats={printFormats}
        className={elementClassName}
      />,
    ];
  });
}
