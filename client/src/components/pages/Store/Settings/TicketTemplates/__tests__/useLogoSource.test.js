import { act, renderHook } from "@testing-library/react";

import { useUpload } from "@components/hooks/useUpload";

import { useLogoSource } from "../useLogoSource";

jest.mock("@components/hooks/useUpload");

describe("useLogoSource", () => {
  const upload = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useUpload.mockReturnValue({ upload, isUploading: false });
  });

  it("starts with the business logo when the element has no image", () => {
    const { result } = renderHook(() => useLogoSource("", jest.fn()));
    expect(result.current.logoSource).toBe("BUSINESS_LOGO");
  });

  it("starts with a custom image when the element already has one", () => {
    const { result } = renderHook(() => useLogoSource("/uploads/2026-10/bob.png", jest.fn()));
    expect(result.current.logoSource).toBe("CUSTOM_IMAGE");
  });

  it("clears the custom image when switching back to the business logo", () => {
    const onTemplateTextChange = jest.fn();
    const { result } = renderHook(() => useLogoSource("/uploads/2026-10/bob.png", onTemplateTextChange));

    act(() => result.current.selectLogoSource("BUSINESS_LOGO"));

    expect(result.current.logoSource).toBe("BUSINESS_LOGO");
    expect(onTemplateTextChange).toHaveBeenCalledWith("");
  });

  it("uploads a PNG and stores its upload path", async () => {
    upload.mockResolvedValue([{ path: "/uploads/2026-10/eve.png" }]);
    const onTemplateTextChange = jest.fn();
    const { result } = renderHook(() => useLogoSource("", onTemplateTextChange));
    const logoFile = new File(["logo"], "eve.png", { type: "image/png" });

    await act(() => result.current.changeLogoImage(logoFile));

    expect(upload).toHaveBeenCalledWith([logoFile]);
    expect(onTemplateTextChange).toHaveBeenCalledWith("/uploads/2026-10/eve.png");
  });

  it("clears the image when the uploader removes it", async () => {
    const onTemplateTextChange = jest.fn();
    const { result } = renderHook(() => useLogoSource("/uploads/2026-10/bob.png", onTemplateTextChange));

    await act(() => result.current.changeLogoImage(null));

    expect(onTemplateTextChange).toHaveBeenCalledWith("");
  });

  it("rejects image formats that cannot be printed and resets the uploader", async () => {
    const { result } = renderHook(() => useLogoSource("", jest.fn()));

    await act(() => result.current.changeLogoImage(new File(["logo"], "mallory.webp", { type: "image/webp" })));

    expect(upload).not.toHaveBeenCalled();
    expect(result.current.uploadErrorKey).toBe("templates.logo.unsupportedFormat");
    expect(result.current.uploaderResetKey).toBe(1);
  });

  it("reports an upload failure", async () => {
    upload.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useLogoSource("", jest.fn()));

    await act(() => result.current.changeLogoImage(new File(["logo"], "eve.png", { type: "image/png" })));

    expect(result.current.uploadErrorKey).toBe("templates.logo.uploadError");
  });
});
