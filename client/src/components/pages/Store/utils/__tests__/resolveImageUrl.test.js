import { resolveImageUrl } from "../resolveImageUrl";

describe("resolveImageUrl", () => {
  it("uploads product image files", async () => {
    const imageFile = new File(["image"], "product.png", { type: "image/png" });
    const upload = jest.fn().mockResolvedValue([{ url: "/uploads/product.png" }]);

    const imageUrl = await resolveImageUrl({ productImage: imageFile, productImageUrl: "/old.png" }, upload);

    expect(upload).toHaveBeenCalledWith([imageFile]);
    expect(imageUrl).toBe("/uploads/product.png");
  });

  it("returns null when a product image was removed", async () => {
    const imageUrl = await resolveImageUrl(
      { productImage: null, productImageRemoved: true, productImageUrl: "/old.png" },
      jest.fn(),
    );

    expect(imageUrl).toBeNull();
  });

  it("resolves variant image fields", async () => {
    const imageUrl = await resolveImageUrl(
      { imageFile: null, imageRemoved: false, imageUrl: "/variants/ram-2gb.png" },
      jest.fn(),
    );

    expect(imageUrl).toBe("/variants/ram-2gb.png");
  });
});
