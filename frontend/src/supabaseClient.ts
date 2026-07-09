import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = 
  supabaseUrl && 
  supabaseUrl !== 'YOUR_SUPABASE_URL' && 
  supabaseAnonKey && 
  supabaseAnonKey !== 'YOUR_SUPABASE_ANON_KEY';

// Initialize Supabase Client
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// LocalStorage helpers for mock/demo mode when Supabase is not configured
export const getLocalProducts = () => {
  const local = localStorage.getItem('esc_products');
  if (local) return JSON.parse(local);
  
  // Seed data fallback
  const defaultProducts = [
    {
      id: 'prod-silo-maiz',
      name: 'Silo de maíz',
      description: 'Alimento balanceado y fermentado de alta calidad para ganado, elaborado con maíz seleccionado de Santa Cruz.',
      unit_price_ton: 450.00,
      stock_tons: 5000.0,
      factor_flete: 1.2
    },
    {
      id: 'prod-soya',
      name: 'Soya',
      description: 'Grano de soya rico en proteínas para nutrición animal e industrial.',
      unit_price_ton: 1800.00,
      stock_tons: 2500.0,
      factor_flete: 1.5
    },
    {
      id: 'prod-sorgo',
      name: 'Sorgo',
      description: 'Excelente alternativa forrajera y energética con alta tolerancia a la sequía.',
      unit_price_ton: 350.00,
      stock_tons: 4000.0,
      factor_flete: 1.0
    }
  ];
  localStorage.setItem('esc_products', JSON.stringify(defaultProducts));
  return defaultProducts;
};

export const getLocalOrders = () => {
  const local = localStorage.getItem('esc_orders');
  return local ? JSON.parse(local) : [];
};

export const saveLocalOrder = (order: any) => {
  const orders = getLocalOrders();
  // Generate code if missing
  if (!order.order_code) {
    const nextCodeNum = 1000 + orders.length;
    order.order_code = `ESC-${nextCodeNum}`;
  }
  if (!order.id) {
    order.id = crypto.randomUUID();
  }
  if (!order.created_at) {
    order.created_at = new Date().toISOString();
  }
  orders.unshift(order);
  localStorage.setItem('esc_orders', JSON.stringify(orders));
  return order;
};

export const updateLocalOrderStatus = (orderId: string, newStatus: string) => {
  const orders = getLocalOrders();
  const index = orders.findIndex((o: any) => o.id === orderId);
  if (index !== -1) {
    orders[index].status = newStatus;
    localStorage.setItem('esc_orders', JSON.stringify(orders));
    return orders[index];
  }
  return null;
};
