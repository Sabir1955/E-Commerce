import { environment } from '../../../environments/environment';

/**
 * Returns the configured API base URL without trailing slashes.
 * e.g. "http://localhost:5000/api" or "<PC2-backend>/api"
 */
export function getApiBaseUrl(): string {
  const configuredApi = environment?.apiUrl ? String(environment.apiUrl).trim() : '';
  if (configuredApi) {
    return configuredApi.replace(/\/+$/, '');
  }
  return '/api';
}

/**
 * Returns the configured backend root URL without trailing slashes.
 * e.g. "http://localhost:5000" or "<PC2-backend>"
 */
export function getBackendBaseUrl(): string {
  const configuredBackend = environment?.backendUrl ? String(environment.backendUrl).trim() : '';
  if (configuredBackend) {
    return configuredBackend.replace(/\/+$/, '');
  }
  const apiBase = getApiBaseUrl();
  return apiBase.replace(/\/api\/?$/i, '');
}

/**
 * Sanitizes a URL into a clean relative path (/api/products/images/:id)
 * so that localhost or any machine origin is never sent to the database.
 */
export function toRelativeImageUrl(url?: string): string {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;

  const imgMatch = trimmed.match(/(?:\/api)?\/products\/images\/([a-zA-Z0-9_-]+)/i);
  if (imgMatch) {
    return `/api/products/images/${imgMatch[1]}`;
  }

  const prodImgMatch = trimmed.match(/(?:\/api)?\/products\/([a-zA-Z0-9_-]+)\/image/i);
  if (prodImgMatch) {
    return `/api/products/${prodImgMatch[1]}/image`;
  }

  const uploadsIndex = trimmed.indexOf('/uploads/');
  if (uploadsIndex !== -1) {
    return trimmed.slice(uploadsIndex);
  }

  return trimmed;
}

/**
 * Builds the full display URL using the configured API / backend base URL.
 * Automatically strips any foreign host (like localhost from another PC)
 * and constructs: API_BASE_URL + '/products/images/' + imageId
 */
export function resolveImageUrl(url?: string): string {
  const apiBase = getApiBaseUrl();
  const backendBase = getBackendBaseUrl();
  const placeholderUrl = `${apiBase}/products/placeholder`;

  if (!url) return placeholderUrl;
  const trimmed = String(url).trim();
  if (!trimmed) return placeholderUrl;

  // Immediate data: or blob: preview
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;

  // Reject local Windows paths
  if (/^[a-zA-Z]:[\\/]/i.test(trimmed) || trimmed.startsWith('file://')) {
    return placeholderUrl;
  }

  // 1. PostgreSQL image endpoint: /products/images/:imageId
  // ALWAYS build from configured API_BASE_URL + '/products/images/' + imageId
  const imgMatch = trimmed.match(/(?:\/api)?\/products\/images\/([a-zA-Z0-9_-]+)/i);
  if (imgMatch) {
    const imageId = imgMatch[1];
    return `${apiBase}/products/images/${imageId}`;
  }

  // Direct 24-hex ObjectId or valid ID
  if (/^[a-zA-Z0-9_-]{12,64}$/i.test(trimmed)) {
    return `${apiBase}/products/images/${trimmed}`;
  }

  // 2. Direct product image endpoint: /products/:id/image
  const prodImgMatch = trimmed.match(/(?:\/api)?\/products\/([a-zA-Z0-9_-]+)\/image/i);
  if (prodImgMatch) {
    const productId = prodImgMatch[1];
    return `${apiBase}/products/${productId}/image`;
  }

  // 3. Placeholder path
  if (trimmed.includes('placeholder')) {
    return placeholderUrl;
  }

  // 4. Legacy /uploads/ path fallback
  const uploadsIndex = trimmed.indexOf('/uploads/');
  if (uploadsIndex !== -1) {
    return `${backendBase}${trimmed.slice(uploadsIndex)}`;
  }

  // 5. External full URLs (e.g. https://cdn.example.com/photo.jpg)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Fallback
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${backendBase}${cleanPath}`;
}
