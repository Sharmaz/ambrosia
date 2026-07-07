import BitcoinPriceService from "../bitcoinPriceService";

describe("BitcoinPriceService", () => {
  let priceService;

  beforeEach(() => {
    priceService = new BitcoinPriceService();
    priceService.clearCache();
    global.fetch = jest.fn();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the price from the API on a successful fetch", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bitcoin: { usd: 50000 } }),
    });

    const price = await priceService.getBitcoinPrice("usd");

    expect(price).toBe(50000);
  });

  it("throws instead of returning a fallback price when the network request fails", async () => {
    global.fetch.mockRejectedValue(new Error("network error"));

    await expect(priceService.getBitcoinPrice("usd")).rejects.toThrow(
      "Unable to get BTC price for usd",
    );
  });

  it("throws instead of returning a fallback price when the response is not ok", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(priceService.getBitcoinPrice("usd")).rejects.toThrow(
      "Unable to get BTC price for usd",
    );
  });

  it("throws instead of returning a fallback price when the currency is missing from the response", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bitcoin: {} }),
    });

    await expect(priceService.getBitcoinPrice("mxn")).rejects.toThrow(
      "Unable to get BTC price for mxn",
    );
  });

  it("does not cache a price after a failed fetch", async () => {
    global.fetch.mockRejectedValueOnce(new Error("network error"));
    await expect(priceService.getBitcoinPrice("usd")).rejects.toThrow();

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ bitcoin: { usd: 60000 } }),
    });
    const price = await priceService.getBitcoinPrice("usd");

    expect(price).toBe(60000);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("reuses the cached price within the cache window instead of refetching", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bitcoin: { usd: 50000 } }),
    });

    await priceService.getBitcoinPrice("usd");
    const secondPrice = await priceService.getBitcoinPrice("usd");

    expect(secondPrice).toBe(50000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
