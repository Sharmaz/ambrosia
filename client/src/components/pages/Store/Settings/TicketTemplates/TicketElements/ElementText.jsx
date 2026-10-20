import { resolveTemplateVariables } from "./resolveTemplateVariables";

export function ElementText({ localId, templateText, businessConfig, printFormats, className }) {
  return (
    <div key={localId} className={className}>
      {resolveTemplateVariables(templateText || "", businessConfig, printFormats)}
    </div>
  );
}
