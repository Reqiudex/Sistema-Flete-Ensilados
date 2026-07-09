const bcrypt = require('bcryptjs');
const { demoUsers } = require('./authController');

// CRUD: Get all admin users (Superadmin only)
function getAllAdmins(req, res) {
  const admins = demoUsers.map(u => ({
    id: u.id,
    email: u.email,
    role: u.role,
    two_factor_enabled: u.two_factor_enabled,
    created_at: u.created_at
  }));
  return res.json({ success: true, data: admins });
}

// CRUD: Create new admin (Superadmin only)
async function createAdmin(req, res) {
  const { email, password, role } = req.body;
  
  if (!email || !password || !role) {
    return res.status(400).json({ error: 'Email, contraseña y rol son requeridos.' });
  }
  
  const validRoles = ['Admin', 'Superadmin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Rol inválido. Debe ser Admin o Superadmin.' });
  }
  
  const existingUser = demoUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    return res.status(409).json({ error: 'Ya existe un administrador con este correo.' });
  }
  
  const password_hash = await bcrypt.hash(password, 10);
  const newUser = {
    id: String(Date.now()),
    email,
    password_hash,
    role,
    two_factor_enabled: false,
    two_factor_secret: null,
    created_at: new Date().toISOString()
  };
  
  demoUsers.push(newUser);
  
  return res.status(201).json({
    success: true,
    message: `Administrador ${email} creado exitosamente con rol ${role}.`,
    data: {
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      two_factor_enabled: newUser.two_factor_enabled,
      created_at: newUser.created_at
    }
  });
}

// CRUD: Update admin (Superadmin can update any, Admin can update self)
async function updateAdmin(req, res) {
  const { id } = req.params;
  const { email, password, role } = req.body;
  const requester = req.user;
  
  // Admin can only update their own profile
  if (requester.role === 'Admin' && requester.id !== id) {
    return res.status(403).json({ error: 'No tiene permisos para modificar otros administradores.' });
  }
  
  // Admin cannot change their own role
  if (requester.role === 'Admin' && role) {
    return res.status(403).json({ error: 'No tiene permisos para cambiar su propio rol.' });
  }
  
  const userIndex = demoUsers.findIndex(u => u.id === id);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'Administrador no encontrado.' });
  }
  
  if (email) demoUsers[userIndex].email = email;
  if (password) demoUsers[userIndex].password_hash = await bcrypt.hash(password, 10);
  if (role && requester.role === 'Superadmin') demoUsers[userIndex].role = role;
  
  return res.json({
    success: true,
    message: 'Administrador actualizado exitosamente.',
    data: {
      id: demoUsers[userIndex].id,
      email: demoUsers[userIndex].email,
      role: demoUsers[userIndex].role,
      two_factor_enabled: demoUsers[userIndex].two_factor_enabled
    }
  });
}

// CRUD: Delete admin (Superadmin only, cannot delete self)
function deleteAdmin(req, res) {
  const { id } = req.params;
  const requester = req.user;
  
  if (requester.id === id) {
    return res.status(400).json({ error: 'No puede eliminar su propia cuenta.' });
  }
  
  const userIndex = demoUsers.findIndex(u => u.id === id);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'Administrador no encontrado.' });
  }
  
  demoUsers.splice(userIndex, 1);
  
  return res.json({
    success: true,
    message: 'Administrador eliminado exitosamente.'
  });
}

// Financial Statistics (computed from in-memory order dataset)
let ordersStore = require('../models/ordersStore');

function getFinancialStats(req, res) {
  const orders = ordersStore.getOrders();
  
  let totalRevenue = 0;
  let totalCostItems = 0;
  let totalCostLogistics = 0;
  let totalNetProfit = 0;
  let deliveredCount = 0;
  let pendingCount = 0;
  let inRouteCount = 0;
  let totalTons = 0;
  
  const monthlyData = {};
  const productStats = { 'Silo de maíz': 0, 'Soya': 0, 'Sorgo': 0 };
  
  orders.forEach(order => {
    totalRevenue += order.total_amount || 0;
    const subtotal = (order.total_amount || 0) - (order.shipping_cost || 0);
    const costItems = subtotal * 0.60;
    const costLogistics = (order.shipping_cost || 0) * 0.70;
    const netProfit = (order.total_amount || 0) - costItems - costLogistics;
    
    totalCostItems += costItems;
    totalCostLogistics += costLogistics;
    totalNetProfit += netProfit;
    totalTons += order.total_weight_tons || 0;
    
    if (order.status === 'Entregado') deliveredCount++;
    else if (order.status === 'Pendiente') pendingCount++;
    else if (order.status === 'En Camino') inRouteCount++;
    
    const date = new Date(order.created_at || Date.now());
    const monthKey = date.toLocaleString('es-ES', { month: 'short', year: '2-digit' }).toUpperCase();
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { revenue: 0, costs: 0, profit: 0, tons: 0 };
    }
    monthlyData[monthKey].revenue += order.total_amount || 0;
    monthlyData[monthKey].costs += costItems + costLogistics;
    monthlyData[monthKey].profit += netProfit;
    monthlyData[monthKey].tons += order.total_weight_tons || 0;
    
    if (order.items && Array.isArray(order.items)) {
      order.items.forEach(item => {
        const prodName = item.product?.name || (
          item.product_id === 'prod-silo-maiz' ? 'Silo de maíz' :
          item.product_id === 'prod-soya' ? 'Soya' : 'Sorgo'
        );
        if (productStats[prodName] !== undefined) {
          productStats[prodName] += item.subtotal || 0;
        }
      });
    }
  });
  
  const monthlyArray = Object.keys(monthlyData).map(month => ({
    month,
    ingresos: Math.round(monthlyData[month].revenue),
    costos: Math.round(monthlyData[month].costs),
    ganancia: Math.round(monthlyData[month].profit),
    toneladas: Math.round(monthlyData[month].tons * 10) / 10
  }));
  
  return res.json({
    success: true,
    data: {
      totals: {
        revenue: Math.round(totalRevenue),
        cost_items: Math.round(totalCostItems),
        cost_logistics: Math.round(totalCostLogistics),
        net_profit: Math.round(totalNetProfit),
        total_tons: Math.round(totalTons * 10) / 10,
        profit_margin_pct: totalRevenue > 0 ? Math.round((totalNetProfit / totalRevenue) * 100) : 0
      },
      orders: {
        total: orders.length,
        delivered: deliveredCount,
        pending: pendingCount,
        in_route: inRouteCount
      },
      charts: {
        monthly: monthlyArray.length > 0 ? monthlyArray : [{ month: 'JUN', ingresos: 0, costos: 0, ganancia: 0, toneladas: 0 }],
        by_product: Object.keys(productStats).map(k => ({ name: k, value: Math.round(productStats[k]) })).filter(p => p.value > 0)
      }
    }
  });
}

module.exports = {
  getAllAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  getFinancialStats
};
