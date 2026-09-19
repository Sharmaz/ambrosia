import { differenceBarColor } from "../differenceBarColor";

describe("differenceBarColor", () => {
  it("returns red for a negative difference", () => {
    expect(differenceBarColor(-10)).toBe("#dc2626");
  });

  it("returns orange for a positive difference", () => {
    expect(differenceBarColor(10)).toBe("#f97316");
  });

  it("returns green for zero difference", () => {
    expect(differenceBarColor(0)).toBe("#16a34a");
  });
});
