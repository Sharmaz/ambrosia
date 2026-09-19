import { differenceTextClass } from "../differenceTextClass";

describe("differenceTextClass", () => {
  it("returns a neutral class when difference is null", () => {
    expect(differenceTextClass(null)).toBe("text-gray-400");
  });

  it("returns red when the shift is short (negative difference)", () => {
    expect(differenceTextClass(-10)).toBe("text-red-600");
  });

  it("returns orange when the shift is over (positive difference)", () => {
    expect(differenceTextClass(10)).toBe("text-orange-500");
  });

  it("returns green when the shift matches exactly (zero difference)", () => {
    expect(differenceTextClass(0)).toBe("text-green-600");
  });
});
