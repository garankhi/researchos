export function doiUrl(doi: string): string {
  const separator = doi.indexOf('/');
  if (separator < 0) return `https://doi.org/${encodeURIComponent(doi)}`;

  const prefix = encodeURIComponent(doi.slice(0, separator));
  const suffix = doi.slice(separator + 1);
  // Escape the separator when a browser would otherwise remove a dot segment.
  if (suffix === '.' || suffix === '..') {
    return `https://doi.org/${prefix}%2F${suffix}`;
  }

  // Keep the DOI's prefix separator and encode the suffix as one URL segment.
  return `https://doi.org/${prefix}/${encodeURIComponent(suffix)}`;
}
