import { resolveValue } from "../resolveValue";

const sampleConfig = {
  businessName: "Ambrosia",
  businessAddress: "Calle Principal 123",
  businessPhone: "+52 555 1234567",
  businessEmail: "contact@ambrosia.mx",
};

describe("resolveValue", () => {
  it("returns empty string for falsy values", () => {
    expect(resolveValue("")).toBe("");
    expect(resolveValue(null)).toBe("");
    expect(resolveValue(undefined)).toBe("");
  });

  it("replaces config variables with provided config", () => {
    expect(resolveValue("{{config.businessName}}", sampleConfig)).toBe("Ambrosia");
    expect(resolveValue("{{config.businessAddress}}", sampleConfig)).toBe("Calle Principal 123");
    expect(resolveValue("{{config.businessPhone}}", sampleConfig)).toBe("+52 555 1234567");
    expect(resolveValue("{{config.businessEmail}}", sampleConfig)).toBe("contact@ambrosia.mx");
  });

  it("uses sampleConfig when no config is provided", () => {
    expect(resolveValue("{{config.businessName}}")).toBe("Ambrosia");
  });

  it("replaces ticket variables with sampleTicket values", () => {
    expect(resolveValue("{{ticket.id}}")).toBe("123");
    expect(resolveValue("{{ticket.tableName}}")).toBe("Table 4");
    expect(resolveValue("{{ticket.roomName}}")).toBe("Main Hall");
    expect(resolveValue("{{ticket.date}}")).toBe("2024-01-10 19:30");
    expect(resolveValue("{{ticket.total}}")).toBe("215");
    expect(resolveValue("{{ticket.invoice}}")).toBe("lnbc10u1p0exampleinvoice");
  });

  it("replaces multiple variables in one string", () => {
    const result = resolveValue("{{config.businessName}} - {{ticket.tableName}}", sampleConfig);
    expect(result).toBe("Ambrosia - Table 4");
  });

  it("leaves unknown variables untouched", () => {
    expect(resolveValue("{{unknown.var}}", sampleConfig)).toBe("{{unknown.var}}");
  });

  it("replaces print variables with the default formats", () => {
    const printedAt = new Date(2026, 9, 15, 9, 5);
    expect(resolveValue("{{print.date}} {{print.time}}", sampleConfig, undefined, printedAt)).toBe("15/10/2026 09:05");
  });

  it("replaces print variables with the template formats", () => {
    const printedAt = new Date(2026, 9, 15, 21, 30);
    const printFormats = { dateFormat: "MONTH_DAY_YEAR", timeFormat: "HOURS_12" };
    expect(resolveValue("{{print.date}} {{print.time}}", sampleConfig, printFormats, printedAt)).toBe("10/15/2026 9:30 PM");
  });

  it("replaces the combined print date and time variable", () => {
    const printedAt = new Date(2026, 9, 15, 21, 30);
    expect(resolveValue("Printed: {{print.dateTime}}", sampleConfig, undefined, printedAt)).toBe("Printed: 15/10/2026 21:30");
  });
});
