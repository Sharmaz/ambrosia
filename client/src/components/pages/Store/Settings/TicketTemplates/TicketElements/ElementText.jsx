import { resolveValue } from "./resolveValue";

export function ElementText({ localId, templateText, businessConfig, printFormats, className }) {
  return (
    <div key={localId} className={className}>
      {resolveValue(templateText || "", businessConfig, printFormats)}
    </div>
  );
}
