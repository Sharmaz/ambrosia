import { printHtmlDocument } from "../printHtmlDocument";

describe("printHtmlDocument", () => {
  let originalWindowOpen;

  beforeEach(() => {
    originalWindowOpen = window.open;
  });

  afterEach(() => {
    window.open = originalWindowOpen;
  });

  it("writes the html document and opens the print dialog", () => {
    const printWindow = {
      document: {
        open: jest.fn(),
        write: jest.fn(),
        close: jest.fn(),
        title: "",
      },
      focus: jest.fn(),
      print: jest.fn(),
    };
    window.open = jest.fn(() => printWindow);

    printHtmlDocument({
      htmlContent: "<html><body>Invoice</body></html>",
      title: "Invoice 2026-0001",
    });

    expect(window.open).toHaveBeenCalledWith("", "_blank");
    expect(printWindow.document.open).toHaveBeenCalledTimes(1);
    expect(printWindow.document.write).toHaveBeenCalledWith("<html><body>Invoice</body></html>");
    expect(printWindow.document.close).toHaveBeenCalledTimes(1);
    expect(printWindow.document.title).toBe("Invoice 2026-0001");
    expect(printWindow.focus).toHaveBeenCalledTimes(1);
    expect(printWindow.print).toHaveBeenCalledTimes(1);
  });

  it("throws when the print window is blocked", () => {
    window.open = jest.fn(() => null);

    expect(() => {
      printHtmlDocument({
        htmlContent: "<html><body>Invoice</body></html>",
      });
    }).toThrow("Print window was blocked");
  });
});
