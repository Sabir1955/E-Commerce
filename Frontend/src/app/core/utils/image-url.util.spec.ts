import { describe, it, expect } from 'vitest';
import { resolveImageUrl, toRelativeImageUrl, getApiBaseUrl, getBackendBaseUrl } from './image-url.util';
import { environment } from '../../../environments/environment';

describe('image-url.util', () => {
  it('should build GridFS image URL from configured API base URL without hardcoded localhost', () => {
    const fileId = '6ac67b134845237ba0829e3a';
    const relativeUrl = `/api/products/images/${fileId}`;
    const result = resolveImageUrl(relativeUrl);

    expect(result).toBe(`${getApiBaseUrl()}/products/images/${fileId}`);
  });

  it('should strip stale foreign host (like localhost from another PC) and rebuild from configured API base URL', () => {
    const fileId = '6ac67b134845237ba0829e3a';
    const foreignUrl = `http://localhost:5000/api/products/images/${fileId}`;
    const result = resolveImageUrl(foreignUrl);

    expect(result).toBe(`${getApiBaseUrl()}/products/images/${fileId}`);
  });

  it('should handle direct 24-character hex ObjectId', () => {
    const fileId = '6ac67b134845237ba0829e3a';
    const result = resolveImageUrl(fileId);

    expect(result).toBe(`${getApiBaseUrl()}/products/images/${fileId}`);
  });

  it('should handle product image endpoint /products/:id/image', () => {
    const prodId = '6ac67b134845237ba0829e3a';
    const url = `/api/products/${prodId}/image`;
    const result = resolveImageUrl(url);

    expect(result).toBe(`${getApiBaseUrl()}/products/${prodId}/image`);
  });

  it('should preserve external CDN image URLs', () => {
    const external = 'https://cdn.sacred-assets.com/photo-1599643478518-a784e5dc4c8f';
    expect(resolveImageUrl(external)).toBe(external);
  });

  it('should reject local Windows paths and return placeholder', () => {
    const winPath = 'C:\\Users\\admin\\Pictures\\rudraksha.png';
    const result = resolveImageUrl(winPath);
    expect(result).toContain('placeholder');
    expect(result).not.toContain('C:');
  });

  it('should convert full URLs to clean relative paths via toRelativeImageUrl', () => {
    const fileId = '6ac67b134845237ba0829e3a';
    expect(toRelativeImageUrl(`http://localhost:5000/api/products/images/${fileId}`)).toBe(`/api/products/images/${fileId}`);
    expect(toRelativeImageUrl(`http://192.168.1.100:5000/api/products/images/${fileId}`)).toBe(`/api/products/images/${fileId}`);
    expect(toRelativeImageUrl(`/api/products/images/${fileId}`)).toBe(`/api/products/images/${fileId}`);
  });
});
