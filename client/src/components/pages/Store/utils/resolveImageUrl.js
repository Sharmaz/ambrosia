export const resolveImageUrl = async (imageSource, upload) => {
  const selectedImageFile = imageSource.productImage ?? imageSource.imageFile;
  const imageWasRemoved = imageSource.productImageRemoved ?? imageSource.imageRemoved;
  const fallbackImageUrl = imageSource.productImageUrl ?? imageSource.imageUrl;

  if (selectedImageFile instanceof File) {
    const uploadResults = await upload([selectedImageFile]);
    return uploadResults?.[0]?.url || uploadResults?.[0]?.path || null;
  }
  if (imageWasRemoved) return null;
  return fallbackImageUrl || null;
};
