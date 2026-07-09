// In-memory orders store for demo mode
let orders = [
  {
    id: 'demo-1',
    order_code: 'ESC-1001',
    customer_name: 'Ganadería El Trébol',
    customer_phone: '78911223',
    lat: -17.7500,
    lng: -63.0700,
    total_weight_tons: 15,
    shipping_cost: 2150,
    total_amount: 8900,
    payment_method: 'Transferencia',
    status: 'Entregado',
    created_at: '2026-05-12T14:30:00Z',
    items: [{ product_id: 'prod-silo-maiz', product: { name: 'Silo de maíz' }, quantity_tons: 15, subtotal: 6750 }]
  },
  {
    id: 'demo-2',
    order_code: 'ESC-1002',
    customer_name: 'Agrícola Los Girasoles',
    customer_phone: '76543210',
    lat: -17.3400,
    lng: -63.2500,
    total_weight_tons: 25,
    shipping_cost: 2420,
    total_amount: 47420,
    payment_method: 'QR',
    status: 'Entregado',
    created_at: '2026-05-24T09:15:00Z',
    items: [{ product_id: 'prod-soya', product: { name: 'Soya' }, quantity_tons: 25, subtotal: 45000 }]
  },
  {
    id: 'demo-3',
    order_code: 'ESC-1003',
    customer_name: 'Estancia La Esperanza',
    customer_phone: '72109876',
    lat: -16.9000,
    lng: -62.6000,
    total_weight_tons: 40,
    shipping_cost: 1100,
    total_amount: 15100,
    payment_method: 'WhatsApp',
    status: 'En Camino',
    created_at: '2026-06-02T11:00:00Z',
    items: [{ product_id: 'prod-sorgo', product: { name: 'Sorgo' }, quantity_tons: 40, subtotal: 14000 }]
  },
  {
    id: 'demo-4',
    order_code: 'ESC-1004',
    customer_name: 'Hacienda El Prado',
    customer_phone: '67854321',
    lat: -17.5500,
    lng: -62.8500,
    total_weight_tons: 12,
    shipping_cost: 1800,
    total_amount: 7200,
    payment_method: 'Transferencia',
    status: 'Pendiente',
    created_at: '2026-06-07T16:45:00Z',
    items: [{ product_id: 'prod-silo-maiz', product: { name: 'Silo de maíz' }, quantity_tons: 12, subtotal: 5400 }]
  }
];

let orderCodeCounter = 1005;

function getOrders() {
  return [...orders];
}

function getOrderById(id) {
  return orders.find(o => o.id === id);
}

function createOrder(orderData) {
  const newOrder = {
    ...orderData,
    id: Date.now().toString(),
    order_code: `ESC-${orderCodeCounter++}`,
    status: 'Pendiente',
    created_at: new Date().toISOString()
  };
  orders.unshift(newOrder);
  return newOrder;
}

function updateOrderStatus(id, status) {
  const idx = orders.findIndex(o => o.id === id);
  if (idx !== -1) {
    orders[idx].status = status;
    return orders[idx];
  }
  return null;
}

module.exports = { getOrders, getOrderById, createOrder, updateOrderStatus };
