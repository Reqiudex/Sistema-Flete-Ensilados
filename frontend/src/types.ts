export interface Product {
  id: string;
  name: string;
  description: string;
  unit_price_ton: number;
  stock_tons: number;
  factor_flete: number;
  active?: boolean;
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
  product?: Pick<Product, 'id' | 'name'> & Partial<Product>;
}

export type OrderStatus = 'Pendiente' | 'En Camino' | 'Entregado' | 'Cancelado';
export type PaymentMethod = 'QR' | 'Transferencia' | 'WhatsApp';

export interface Order {
  id?: string;
  order_code?: string;
  customer_name: string;
  customer_phone: string;
  lat: number;
  lng: number;
  distance_km?: number;
  calculation_source?: 'google' | 'haversine';
  trips?: number;
  total_weight_tons: number;
  shipping_cost: number;
  total_amount: number;
  cost_items_bs?: number;
  cost_logistics_bs?: number;
  net_profit_bs?: number;
  payment_method: PaymentMethod;
  status: OrderStatus;
  created_at?: string;
  items?: OrderItem[];
  /** true cuando el pedido se guardó sin conexión y aún no llegó al servidor */
  pending_sync?: boolean;
}

/** Datos mínimos que el cliente envía; el servidor calcula precios, flete y totales. */
export interface NewOrderPayload {
  customerName: string;
  customerPhone: string;
  lat: number;
  lng: number;
  paymentMethod: PaymentMethod;
}

/** Cotización de flete (respuesta de /api/calculate-flete o cálculo local de contingencia). */
export interface FleteQuote {
  distance_km: number;
  source: 'google' | 'haversine';
  trips: number;
  shipping_cost: number;
  subtotal?: number;
  total?: number;
  /** true cuando se calculó en el navegador por falta de conexión */
  estimated_offline?: boolean;
}

/** Parámetros tarifarios vigentes (GET /api/flete-params). */
export interface FleteParams {
  origen: { nombre: string; lat: number; lng: number };
  tarifa_base_bs: number;
  precio_km_bs: number;
  factor_correccion_rural: number;
  capacidad_vehiculo_tons: number;
  peso_minimo_tons: number;
  pct_costo_mercaderia: number;
  pct_costo_logistico: number;
}

export type UserRole = 'Admin' | 'Superadmin';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  two_factor_enabled: boolean;
  created_at?: string;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}
