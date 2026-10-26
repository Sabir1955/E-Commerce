export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  sku?: string;
  stock: number;
  status: boolean;
}