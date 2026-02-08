interface ImageDimensions {
  width: number;
  height: number;
}

const cache = new Map<string, ImageDimensions>();

export const getCachedPageDimensions = (
  imageUrl: string
): ImageDimensions | undefined => cache.get(imageUrl);

export const setCachedPageDimensions = (
  imageUrl: string,
  dimensions: ImageDimensions
): void => {
  cache.set(imageUrl, dimensions);
};

export const clearPageDimensionCache = (): void => {
  cache.clear();
};
