const urls = new WeakMap();

const BROWSER_IMAGES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif']);

// Object URL for <img>, cached per texture + image bytes (replaced images get a fresh URL).
export function textureURL(texture) {
  const image = texture?.getImage();
  if (!image || !BROWSER_IMAGES.has(texture.getMimeType())) return null;
  const cached = urls.get(texture);
  if (cached?.image === image) return cached.url;
  if (cached) URL.revokeObjectURL(cached.url);
  const url = URL.createObjectURL(new Blob([image], { type: texture.getMimeType() }));
  urls.set(texture, { image, url });
  return url;
}

export function textureFileName(texture, index) {
  const ext = (texture.getMimeType().split('/')[1] || 'bin').replace('jpeg', 'jpg');
  const base = texture.getURI()?.split('/').pop()?.replace(/\.[^.]+$/, '') || texture.getName() || `texture_${index}`;
  return `${base}.${ext}`;
}

export function textureLabel(texture, index) {
  return texture.getName() || texture.getURI()?.split('/').pop() || `Texture ${index}`;
}
