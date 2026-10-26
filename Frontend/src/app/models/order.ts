import { Product } from './product';

export interface OrderItem {
  product: Product;
  quantity: number;
  price: number;
}

export interface Order {
  id: number;
  customerName: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  items: OrderItem[];
  total: number;
  paymentStatus: string;
  paymentMethod?: string;
  paymentRecordId?: string;
  gatewayOrderId?: string;
  paymentId?: string;
  gatewayMethod?: string;
  orderStatus: string;
  orderDate: string;
}