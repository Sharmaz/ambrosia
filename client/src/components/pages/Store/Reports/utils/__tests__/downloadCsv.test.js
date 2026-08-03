import { downloadCsv } from "../downloadCsv";

describe("downloadCsv", () => {
  let originalCreateElement;
  let downloadLink;

  beforeEach(() => {
    originalCreateElement = document.createElement;
    downloadLink = {
      click: jest.fn(),
      download: "",
      href: "",
    };
    document.createElement = jest.fn((tagName) => {
      if (tagName === "a") return downloadLink;
      return originalCreateElement.call(document, tagName);
    });
    URL.createObjectURL = jest.fn(() => "blob:csv-download");
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
  });

  it("downloads CSV content with the requested filename", () => {
    downloadCsv("name,total\nAlice,100", "sales-report.csv");

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(document.createElement).toHaveBeenCalledWith("a");
    expect(downloadLink.href).toBe("blob:csv-download");
    expect(downloadLink.download).toBe("sales-report.csv");
    expect(downloadLink.click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:csv-download");
  });

  it("revokes the object URL when the download click fails", () => {
    downloadLink.click.mockImplementation(() => {
      throw new Error("Download blocked");
    });

    expect(() => downloadCsv("name,total\nAlice,100", "sales-report.csv")).toThrow("Download blocked");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:csv-download");
  });
});
