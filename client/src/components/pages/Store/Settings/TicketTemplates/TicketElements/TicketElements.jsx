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

export function hasVisibleContent(elements) {
  return Array.isArray(elements) && elements.some(
    (el) => ALWAYS_VISIBLE_TYPES.includes(el.type) || el.value?.trim(),
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
    const style = templateElement.style || DEFAULT_STYLE;
    const className = [
      resolveAlignment(style.justification),
      fontSizeClasses[style.fontSize] || fontSizeClasses.NORMAL,
      style.bold ? "font-semibold" : "font-normal",
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
          fontSize={style.fontSize}
          justification={style.justification}
          className={className}
        />,
      ];
    }
    if (templateElement.type === "LOGO") {
      return [
        <ElementLogo
          key={`${templateElement.localId}-logo`}
          templateText={templateElement.value}
          businessConfig={businessConfig}
          fontSize={style.fontSize}
          justification={style.justification}
          className={className}
        />,
      ];
    }
    if (templateElement.type === "TABLE_ROW") {
      return ElementTableRow({ localId: templateElement.localId, className });
    }
    if (templateElement.type === "TOTAL_ROW") {
      return ElementTotalRow({
        localId: templateElement.localId,
        templateText: templateElement.value,
        businessConfig,
        printFormats,
        className,
      });
    }
    return [
      <ElementText
        key={templateElement.localId}
        localId={templateElement.localId}
        templateText={templateElement.value}
        businessConfig={businessConfig}
        printFormats={printFormats}
        className={className}
      />,
    ];
  });
}
