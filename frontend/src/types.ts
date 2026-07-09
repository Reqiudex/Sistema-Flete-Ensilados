export interface Product {
  id: string;
  name: string;
  description: string;
  unit_price_ton: number;
  stock_tons: number;
  factor_flete: number;
  created_at?: string;
}

export interface CartItem {
  product: Product;
  quantityTons: number;
}

export interface OrderItem {
  id?: string;
  order_id?: string;
  product_id: string;
  quantity_tons: number;
  subtotal: number;
  product?: Product;
}

export interface Order {
  id?: string;
  order_code?: string;
  customer_name: string;
  customer_phone: string;
  lat: number;
  lng: number;
  total_weight_tons: number;
  shipping_cost: number;
  total_amount: number;
  cost_items_bs?: number;
  cost_logistics_bs?: number;
  net_profit_bs?: number;
  payment_method: 'QR' | 'Transferencia' | 'WhatsApp';
  status: 'Pendiente' | 'En Camino' | 'Entregado';
  created_at?: string;
  items?: OrderItem[];
}

export interface FleteResult {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  distance_km: number;
  calculation_source: 'google' | 'haversine';
  tarife_base: number;
  precio_km: number;
  product_factor_cost: number;
  shipping_cost: number;
}

export type UserRole = 'Admin' | 'Superadmin';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  two_factor_enabled: boolean;
  created_at?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: UserProfile | null;
  token: string | null;
}

export interface FinancialStats {
  totals: {
    revenue: number;
    cost_items: number;
    cost_logistics: number;
    net_profit: number;
    total_tons: number;
    profit_margin_pct: number;
  };
  orders: {
    total: number;
    delivered: number;
    pending: number;
    in_route: number;
  };
  charts: {
    monthly: Array<{ month: string; ingresos: number; costos: number; ganancia: number; toneladas: number }>;
    by_product: Array<{ name: string; value: number }>;
  };
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}
