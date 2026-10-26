export interface Product {
  id: number | string;
  _id?: string;
  name: string;
  description: string;
  price: number;
  image?: string;
  imageUrl?: string;
  images?: string[];
  category: string;
  categoryId?: string;
  sku?: string;
  stock: number;
  available?: boolean;
  active?: boolean;
  createdAt?: string;
  attributes?: Record<string, string>;
  brand?: string;
  material?: string;
  rating?: number;
  reviewCount?: number;
  featured?: boolean;
  slug?: string;
}

export const PRODUCT_CATALOG: Product[] = [];
