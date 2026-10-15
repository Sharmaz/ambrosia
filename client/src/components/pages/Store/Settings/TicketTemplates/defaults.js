export const DEFAULT_STYLE = {
  bold: false,
  justification: "LEFT",
  fontSize: "NORMAL",
};

export function createElement() {
  return {
    localId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "TEXT",
    value: "",
    style: DEFAULT_STYLE,
  };
}

export const DATE_FORMATS = ["DAY_MONTH_YEAR", "MONTH_DAY_YEAR", "YEAR_MONTH_DAY"];

export const TIME_FORMATS = ["HOURS_24", "HOURS_12"];

export const DEFAULT_PRINT_FORMATS = {
  dateFormat: "DAY_MONTH_YEAR",
  timeFormat: "HOURS_24",
};
