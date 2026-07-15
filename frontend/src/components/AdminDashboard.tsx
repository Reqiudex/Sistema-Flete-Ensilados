import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  Truck, ArrowUpRight, TrendingUp,
  Package, DollarSign, Users, PlusCircle, Trash2, Edit2, ShieldAlert,
  Key, Mail, Save, CheckCircle, QrCode, Lock, RefreshCw, LogOut, Wheat, Sprout, Download, X
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Order, Product, UserProfile } from '../types';
import {
  supabase, isSupabaseConfigured, getLocalOrders, updateLocalOrderStatus, saveLocalOrder, getLocalProducts
} from '../supabaseClient';

interface AdminDashboardProps {
  user: UserProfile;
  token: string;
  onLogout: () => void;
  addToast: (toast: any) => void;
}

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:3001/api' 
  : 'https://api.tesis.cherry.lat/api';

const PRODUCT_COLORS = ['#2d6a4f', '#7dd0a3', '#b0e6c5', '#1b4332'];
const PROFIT_COLORS = ['#2d6a4f', '#ef4444', '#d4a217']; // Green (Profit), Red (Materials Cost), Yellow (Logistics Cost)

export default function AdminDashboard({ user, token, onLogout, addToast }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'products' | 'admins' | 'security'>('dashboard');
  const [dbMode, setDbMode] = useState<string>('Local');
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('Todos');

  // Product Form states
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    unit_price_ton: 0,
    stock_tons: 0,
    factor_flete: 1.0
  });

  // Admin Form states
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<UserProfile | null>(null);
  const [adminForm, setAdminForm] = useState({
    email: '',
    password: '',
    role: 'Admin' as 'Admin' | 'Superadmin'
  });

  // Manual Order Form states
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [manualOrderForm, setManualOrderForm] = useState({
    customer_name: '',
    customer_phone: '',
    product_id: '',
    quantity_tons: 10,
    shipping_cost: 1000,
    payment_method: 'Transferencia' as 'QR' | 'Transferencia' | 'WhatsApp',
    lat: -16.6133,
    lng: -62.4994
  });

  // Self Account Form state
  const [selfForm, setSelfForm] = useState({
    email: user.email,
    password: ''
  });
  const [updatingSelf, setUpdatingSelf] = useState(false);

  // 2FA Setup state
  const [twoFASecret, setTwoFASecret] = useState<string | null>(null);
  const [twoFACodeInput, setTwoFACodeInput] = useState('');
  const [twoFAStep, setTwoFAStep] = useState<'none' | 'setup' | 'enabled'>('none');
  const [twoFALoading, setTwoFALoading] = useState(false);

  // Fetch all initial data
  useEffect(() => {
    fetchOrders();
    fetchProducts();
    if (user.role === 'Superadmin') {
      fetchAdmins();
    }
    check2FAStatus();
  }, []);

  const check2FAStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTwoFAStep(data.two_factor_enabled ? 'enabled' : 'none');
      } else {
        setTwoFAStep(user.two_factor_enabled ? 'enabled' : 'none');
      }
    } catch {
      setTwoFAStep(user.two_factor_enabled ? 'enabled' : 'none');
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      if (isSupabaseConfigured && supabase) {
        setDbMode('Supabase');
        const { data, error } = await supabase
          .from('orders')
          .select(`
            *,
            items:order_items(
              *,
              product:products(*)
            )
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setOrders(data || []);
      } else {
        setDbMode('Local (Demo)');
        setOrders(getLocalOrders());
      }
    } catch (err) {
      console.error('Error al cargar pedidos:', err);
      setOrders(getLocalOrders());
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('name');
        if (error) throw error;
        setProducts(data || []);
      } else {
        setProducts(getLocalProducts());
      }
    } catch (err) {
      console.error('Error cargando productos:', err);
      setProducts(getLocalProducts());
    }
  };

  const fetchAdmins = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdmins(data.data || []);
      } else {
        // Mock offline fallback
        setAdmins([
          { id: '1', email: 'superadmin@ensilados.com', role: 'Superadmin', two_factor_enabled: false },
          { id: '2', email: 'admin@ensilados.com', role: 'Admin', two_factor_enabled: false }
        ]);
      }
    } catch (err) {
      console.error('Error cargando administradores:', err);
      setAdmins([
        { id: '1', email: 'superadmin@ensilados.com', role: 'Superadmin', two_factor_enabled: false },
        { id: '2', email: 'admin@ensilados.com', role: 'Admin', two_factor_enabled: false }
      ]);
    }
  };

  // Status adjustment
  const handleStatusChange = async (orderId: string, newStatus: 'Pendiente' | 'En Camino' | 'Entregado') => {
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('orders')
          .update({ status: newStatus })
          .eq('id', orderId);
        if (error) throw error;
        addToast({ type: 'success', title: 'Estado Actualizado', message: `Pedido cambiado a ${newStatus}.` });
        fetchOrders();
      } else {
        updateLocalOrderStatus(orderId, newStatus);
        addToast({ type: 'success', title: 'Estado Actualizado', message: `Pedido cambiado a ${newStatus} (modo local).` });
        fetchOrders();
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: 'No se pudo actualizar el estado del pedido.' });
    }
  };

  // Order Deletion
  const handleDeleteOrder = (orderId: string) => {
    if (!window.confirm('¿Está seguro de eliminar este pedido?')) return;
    try {
      const stored = getLocalOrders().filter((o: any) => o.id !== orderId);
      localStorage.setItem('esc_orders', JSON.stringify(stored));
      addToast({ type: 'success', title: 'Pedido Eliminado', message: 'El pedido fue retirado del sistema.' });
      fetchOrders();
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'No se pudo eliminar el pedido.' });
    }
  };

  // Product CRUD Handlers
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        const updated = { ...editingProduct, ...productForm };
        if (isSupabaseConfigured && supabase) {
          const { error } = await supabase.from('products').update(productForm).eq('id', editingProduct.id);
          if (error) throw error;
        } else {
          const prods = getLocalProducts().map((p: Product) => p.id === editingProduct.id ? updated : p);
          localStorage.setItem('esc_products', JSON.stringify(prods));
        }
        addToast({ type: 'success', title: 'Producto Modificado', message: `Producto '${productForm.name}' actualizado.` });
      } else {
        const newProd: Product = {
          id: `prod-${Date.now()}`,
          ...productForm
        };
        if (isSupabaseConfigured && supabase) {
          const { error } = await supabase.from('products').insert([productForm]);
          if (error) throw error;
        } else {
          const prods = [...getLocalProducts(), newProd];
          localStorage.setItem('esc_products', JSON.stringify(prods));
        }
        addToast({ type: 'success', title: 'Producto Registrado', message: `Producto '${productForm.name}' guardado.` });
      }
      setShowProductModal(false);
      setEditingProduct(null);
      fetchProducts();
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: 'No se pudo guardar el producto.' });
    }
  };

  const startEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setProductForm({
      name: prod.name,
      description: prod.description,
      unit_price_ton: prod.unit_price_ton,
      stock_tons: prod.stock_tons,
      factor_flete: prod.factor_flete
    });
    setShowProductModal(true);
  };

  const handleDeleteProduct = (prodId: string) => {
    if (!window.confirm('¿Está seguro de eliminar este producto?')) return;
    try {
      if (isSupabaseConfigured && supabase) {
        // Delete in Supabase
        addToast({ type: 'info', title: 'Supabase', message: 'Elimine el producto directamente en la consola para evitar fallos de integridad.' });
      } else {
        const prods = getLocalProducts().filter((p: Product) => p.id !== prodId);
        localStorage.setItem('esc_products', JSON.stringify(prods));
        addToast({ type: 'success', title: 'Producto Eliminado', message: 'El producto fue removido localmente.' });
        fetchProducts();
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'No se pudo eliminar el producto.' });
    }
  };

  // Admin CRUD Handlers
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAdmin) {
        // Modify existing
        const res = await fetch(`${API_BASE}/admin/users/${editingAdmin.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            email: adminForm.email,
            password: adminForm.password || undefined,
            role: adminForm.role
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        addToast({ type: 'success', title: 'Administrador Actualizado', message: `Se actualizó el perfil de ${adminForm.email}.` });
      } else {
        // Create new
        const res = await fetch(`${API_BASE}/admin/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(adminForm)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        addToast({ type: 'success', title: 'Administrador Creado', message: `Nuevo administrador registrado: ${adminForm.email}.` });
      }
      setShowAdminModal(false);
      setEditingAdmin(null);
      fetchAdmins();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error CRUD', message: err.message || 'Error al guardar administrador.' });
    }
  };

  const startEditAdmin = (admin: UserProfile) => {
    setEditingAdmin(admin);
    setAdminForm({
      email: admin.email,
      password: '',
      role: admin.role
    });
    setShowAdminModal(true);
  };

  const handleDeleteAdmin = async (adminId: string) => {
    if (adminId === user.id) {
      addToast({ type: 'error', title: 'Acción inválida', message: 'No puede eliminar su propia cuenta.' });
      return;
    }
    if (!window.confirm('¿Está seguro de eliminar este administrador?')) return;
    try {
      const res = await fetch(`${API_BASE}/admin/users/${adminId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      addToast({ type: 'success', title: 'Administrador Eliminado', message: 'El usuario fue removido.' });
      fetchAdmins();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message || 'No se pudo eliminar el administrador.' });
    }
  };

  // Self Details Update Handler
  const handleUpdateSelf = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingSelf(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: selfForm.email,
          password: selfForm.password || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      addToast({ type: 'success', title: 'Perfil Guardado', message: 'Sus datos de acceso han sido modificados.' });
      setSelfForm(prev => ({ ...prev, password: '' }));
      
      // Update local storage user profile data
      const updatedUser = { ...user, email: selfForm.email };
      localStorage.setItem('esc_user', JSON.stringify(updatedUser));
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message || 'No se pudo actualizar su cuenta.' });
    } finally {
      setUpdatingSelf(false);
    }
  };

  // Register Manual Order (CRM input)
  const handleRegisterManualOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedProduct = products.find(p => p.id === manualOrderForm.product_id);
    if (!selectedProduct) {
      addToast({ type: 'error', title: 'Error', message: 'Seleccione un producto válido.' });
      return;
    }

    const materialCost = manualOrderForm.quantity_tons * selectedProduct.unit_price_ton;
    const finalTotal = materialCost + manualOrderForm.shipping_cost;

    const newOrder: Order = {
      customer_name: manualOrderForm.customer_name,
      customer_phone: manualOrderForm.customer_phone,
      lat: manualOrderForm.lat,
      lng: manualOrderForm.lng,
      total_weight_tons: manualOrderForm.quantity_tons,
      shipping_cost: manualOrderForm.shipping_cost,
      total_amount: finalTotal,
      payment_method: manualOrderForm.payment_method,
      status: 'Pendiente',
      items: [{
        product_id: selectedProduct.id,
        quantity_tons: manualOrderForm.quantity_tons,
        subtotal: materialCost,
        product: selectedProduct
      }]
    };

    saveLocalOrder(newOrder);
    addToast({ type: 'success', title: 'Pedido Registrado', message: `Pedido manual ${newOrder.customer_name} guardado.` });
    setShowOrderModal(false);
    fetchOrders();
  };

  // 2FA Activate/Deactivate functions
  const handleSetup2FA = async () => {
    setTwoFALoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/setup-2fa`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setTwoFASecret(data.secret);
      setTwoFAStep('setup');
      addToast({ type: 'info', title: '2FA Generado', message: 'Escanee el código QR e introduzca el código de validación.' });
    } catch (err: any) {
      // Offline mock setup fallback
      const mockSecret = 'ESC2FASECRET2024';
      setTwoFASecret(mockSecret);
      setTwoFAStep('setup');
      addToast({ type: 'info', title: '2FA Generado (Offline)', message: 'Copie la clave secreta manual para su app.' });
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleVerifyAndEnable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFALoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/enable-2fa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ totp_code: twoFACodeInput })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setTwoFAStep('enabled');
      setTwoFACodeInput('');
      addToast({ type: 'success', title: '2FA Activado', message: 'Seguridad doble factor habilitada correctamente.' });
    } catch (err: any) {
      // Offline fallback success simulator (any 6 digit succeeds for testing offline)
      if (twoFACodeInput.length === 6) {
        setTwoFAStep('enabled');
        setTwoFACodeInput('');
        addToast({ type: 'success', title: '2FA Activado (Offline)', message: 'Seguridad doble factor habilitada (simulado).' });
      } else {
        addToast({ type: 'error', title: 'Código inválido', message: 'El código 2FA debe tener 6 dígitos.' });
      }
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFALoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/disable-2fa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ totp_code: twoFACodeInput })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setTwoFAStep('none');
      setTwoFACodeInput('');
      addToast({ type: 'success', title: '2FA Desactivado', message: 'La seguridad de doble factor ha sido desactivada.' });
    } catch (err: any) {
      if (twoFACodeInput.length === 6) {
        setTwoFAStep('none');
        setTwoFACodeInput('');
        addToast({ type: 'success', title: '2FA Desactivado (Offline)', message: 'Doble factor desactivado (simulado).' });
      } else {
        addToast({ type: 'error', title: 'Error', message: 'Ingrese el código de verificación actual para confirmar.' });
      }
    } finally {
      setTwoFALoading(false);
    }
  };

  // Calculations for financial dashboard
  const computeStats = () => {
    let salesTotal = 0;
    let tonsTotal = 0;
    let pendingCount = 0;
    let avgShipping = 0;
    let shippingSum = 0;
    
    // Gain/Loss elements
    let materialsCostTotal = 0;
    let logisticsCostTotal = 0;
    let netProfitTotal = 0;

    const productSalesMap: Record<string, number> = {
      'Silo de maíz': 0,
      'Soya': 0,
      'Sorgo': 0,
    };

    const monthlySalesMap: Record<string, { revenue: number; costs: number; profit: number }> = {};

    orders.forEach(o => {
      salesTotal += o.total_amount;
      tonsTotal += o.total_weight_tons;
      shippingSum += o.shipping_cost;
      if (o.status === 'Pendiente') pendingCount++;

      const subtotal = o.total_amount - o.shipping_cost;
      const costItems = subtotal * 0.60; // 60% of material price is production cost
      const costLogistics = o.shipping_cost * 0.70; // 70% of logistics price is real expense
      const profit = o.total_amount - costItems - costLogistics;

      materialsCostTotal += costItems;
      logisticsCostTotal += costLogistics;
      netProfitTotal += profit;

      // Group by Month
      const date = new Date(o.created_at || Date.now());
      const monthName = date.toLocaleString('es-ES', { month: 'short' }).toUpperCase();
      if (!monthlySalesMap[monthName]) {
        monthlySalesMap[monthName] = { revenue: 0, costs: 0, profit: 0 };
      }
      monthlySalesMap[monthName].revenue += o.total_amount;
      monthlySalesMap[monthName].costs += costItems + costLogistics;
      monthlySalesMap[monthName].profit += profit;

      // Product sales share
      if (o.items && o.items.length > 0) {
        o.items.forEach(i => {
          const prodName = i.product?.name || (i.product_id === 'prod-silo-maiz' ? 'Silo de maíz' : i.product_id === 'prod-soya' ? 'Soya' : 'Sorgo');
          if (productSalesMap[prodName] !== undefined) {
            productSalesMap[prodName] += i.subtotal;
          }
        });
      } else {
        productSalesMap['Silo de maíz'] += subtotal;
      }
    });

    avgShipping = orders.length > 0 ? shippingSum / orders.length : 0;

    const salesByProductData = Object.keys(productSalesMap).map(key => ({
      name: key,
      value: Math.round(productSalesMap[key])
    })).filter(item => item.value > 0);

    const monthlyTrendData = Object.keys(monthlySalesMap).map(key => ({
      month: key,
      ingresos: Math.round(monthlySalesMap[key].revenue),
      costos: Math.round(monthlySalesMap[key].costs),
      ganancia: Math.round(monthlySalesMap[key].profit)
    }));

    // Gain/Loss details data
    const gainLossData = [
      { name: 'Ganancia Neta', value: Math.max(0, Math.round(netProfitTotal)) },
      { name: 'Costo de Materiales', value: Math.round(materialsCostTotal) },
      { name: 'Costo de Logística', value: Math.round(logisticsCostTotal) }
    ].filter(v => v.value > 0);

    return {
      salesTotal,
      materialsCost: Math.round(materialsCostTotal),
      logisticsCost: Math.round(logisticsCostTotal),
      netProfit: Math.round(netProfitTotal),
      tonsTotal,
      pendingCount,
      avgShipping: Math.round(avgShipping),
      salesByProductData,
      monthlyTrendData: monthlyTrendData.length > 0 ? monthlyTrendData : [{ month: 'JUN', ingresos: 0, costos: 0, ganancia: 0 }],
      gainLossData
    };
  };

  const stats = computeStats();

  const generatePDFReport = async () => {
    const element = document.getElementById('pdf-report-template');
    if (!element) {
      addToast({ type: 'error', title: 'Error', message: 'No se encontró la plantilla del reporte.' });
      return;
    }
    try {
      addToast({ type: 'info', title: 'Generando...', message: 'Preparando el reporte PDF profesional.' });
      
      // Mostrar temporalmente para el renderizado
      element.style.display = 'block';
      
      const canvas = await html2canvas(element, { 
        scale: 2, 
        useCORS: true, 
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      // Ocultar de nuevo
      element.style.display = 'none';
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Reporte_Ventas_${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}.pdf`);
      addToast({ type: 'success', title: 'Reporte Generado', message: 'El PDF ha sido descargado exitosamente.' });
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: 'No se pudo generar el reporte.' });
    }
  };

  const getDriverRouteLink = (lat: number, lng: number) => {
    return `https://www.google.com/maps/dir/?api=1&origin=-16.6133,-62.4994&destination=${lat},${lng}&travelmode=driving`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">
      
      {/* Admin header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between bg-dark-800/80 border border-agro-600/30 p-6 rounded-3xl shadow-dark-lg backdrop-blur-xl gap-4">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-gradient-agro text-white rounded-2xl shadow-agro">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-black text-white">Panel Administrativo</h1>
            <p className="text-xs text-dark-300">
              Registrado como: <span className="text-gold-300 font-bold">{user.email}</span> — Rol: <span className="bg-agro-500/20 text-agro-accent font-bold px-2 py-0.5 rounded border border-agro-accent/20 text-[10px]">{user.role}</span>
            </p>
          </div>
        </div>

        {/* Database state indicator & tabs selector */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-dark-900 border border-dark-600 px-3 py-1.5 rounded-xl">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-bold text-dark-200 uppercase tracking-wider">
              {dbMode}
            </span>
          </div>
          <button
            onClick={fetchOrders}
            className="p-2 bg-dark-900 border border-dark-600 hover:border-agro-500 rounded-xl text-white transition-all hover:scale-105"
            title="Sincronizar Datos"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={onLogout}
            className="p-2 bg-dark-900 border border-dark-600 hover:border-red-500 rounded-xl text-red-400 transition-all hover:scale-105"
            title="Cerrar Sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-dark-700 overflow-x-auto gap-2 scrollbar-none pb-1">
        {[
          { id: 'dashboard', label: 'Estadísticas & CRM', icon: <TrendingUp className="h-4 w-4" /> },
          { id: 'orders', label: 'Gestión Pedidos', icon: <Truck className="h-4 w-4" /> },
          { id: 'products', label: 'Productos', icon: <Package className="h-4 w-4" /> },
          ...(user.role === 'Superadmin' ? [{ id: 'admins', label: 'Administradores', icon: <Users className="h-4 w-4" /> }] : []),
          { id: 'security', label: 'Mi Cuenta & 2FA', icon: <Key className="h-4 w-4" /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center space-x-2 px-5 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-agro-accent text-agro-accent font-black bg-agro-500/10 rounded-t-xl'
                : 'border-transparent text-dark-300 hover:text-white'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB CONTENT CAROUSEL/VIEWPORT */}
      <div className="view-transition-enter">
        
        {/* TAB 1: DASHBOARD STATS */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-fade-in" id="dashboard-report-area">
            {/* Header for Dashboard Actions */}
            <div className="flex justify-end mt-4">
              <button
                onClick={generatePDFReport}
                className="btn-gold py-2 px-4 flex items-center space-x-2 font-bold text-xs shadow-sm rounded-xl"
              >
                <Download className="h-4 w-4" />
                <span>Exportar Reporte PDF</span>
              </button>
            </div>

            {/* Cards metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="glass rounded-2xl p-6 flex items-center justify-between border-gradient-agro">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-dark-300 uppercase tracking-widest block">Ventas Totales</span>
                  <span className="text-2xl font-display font-black text-white block">{stats.salesTotal.toLocaleString()} Bs.</span>
                </div>
                <div className="p-3.5 bg-agro-500/20 text-agro-accent rounded-xl border border-agro-accent/20">
                  <DollarSign className="h-6 w-6" />
                </div>
              </div>

              <div className="glass rounded-2xl p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-dark-300 uppercase tracking-widest block">Ganancia Neta</span>
                  <span className={`text-2xl font-display font-black block ${stats.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.netProfit.toLocaleString()} Bs.
                  </span>
                </div>
                <div className="p-3.5 bg-green-500/20 text-green-400 rounded-xl border border-green-500/20">
                  <TrendingUp className="h-6 w-6" />
                </div>
              </div>

              <div className="glass rounded-2xl p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-dark-300 uppercase tracking-widest block">Costos Totales</span>
                  <span className="text-2xl font-display font-black text-red-400 block">
                    {(stats.materialsCost + stats.logisticsCost).toLocaleString()} Bs.
                  </span>
                </div>
                <div className="p-3.5 bg-red-500/20 text-red-400 rounded-xl border border-red-500/20">
                  <ShieldAlert className="h-6 w-6" />
                </div>
              </div>

              <div className="glass rounded-2xl p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-dark-300 uppercase tracking-widest block">Volumen Despachado</span>
                  <span className="text-2xl font-display font-black text-white block">{stats.tonsTotal} Tons</span>
                </div>
                <div className="p-3.5 bg-dark-700 text-dark-200 rounded-xl border border-dark-600">
                  <Package className="h-6 w-6" />
                </div>
              </div>
            </div>

            {/* Graphs panels */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Monthly Trend Bar Chart */}
              <div className="glass rounded-2xl p-6 lg:col-span-2 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-display font-extrabold text-white text-base">Facturación Mensual (Bs.)</h3>
                  <span className="text-[10px] text-gold-300 flex items-center gap-1 font-bold">
                    <TrendingUp className="h-4 w-4" /> Ingresos vs Egresos
                  </span>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.monthlyTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#252525" vertical={false} />
                      <XAxis dataKey="month" stroke="#808080" fontSize={11} />
                      <YAxis stroke="#808080" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: '#141414', borderColor: '#252525', borderRadius: '12px' }} />
                      <Legend verticalAlign="top" height={36} />
                      <Bar dataKey="ingresos" fill="#2d6a4f" radius={[4, 4, 0, 0]} name="Ingresos (Bs.)" />
                      <Bar dataKey="costos" fill="#ef4444" radius={[4, 4, 0, 0]} name="Costos (Bs.)" />
                      <Bar dataKey="ganancia" fill="#d4a217" radius={[4, 4, 0, 0]} name="Ganancia Neta" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Profit & Loss Pie Chart */}
              <div className="glass rounded-2xl p-6 space-y-4 flex flex-col justify-between">
                <h3 className="font-display font-extrabold text-white text-base">Distribución Ganancias / Pérdidas</h3>
                <div className="h-[200px] w-full relative flex items-center justify-center">
                  {stats.gainLossData.length === 0 ? (
                    <span className="text-dark-400 text-sm">Sin datos para graficar</span>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.gainLossData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={75}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {stats.gainLossData.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={PROFIT_COLORS[index % PROFIT_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${value.toLocaleString()} Bs.`} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="space-y-2 text-xs">
                  {stats.gainLossData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center justify-between p-2 rounded bg-dark-900 border border-dark-800">
                      <div className="flex items-center space-x-2">
                        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: PROFIT_COLORS[index % PROFIT_COLORS.length] }}></span>
                        <span className="font-bold text-dark-300">{entry.name}</span>
                      </div>
                      <span className="font-black text-white">{entry.value.toLocaleString()} Bs.</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Product Share & Performance stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Product share pie chart */}
              <div className="glass rounded-2xl p-6 space-y-4">
                <h3 className="font-display font-extrabold text-white text-base">Participación de Productos en Ventas</h3>
                <div className="h-[200px] w-full relative flex items-center justify-center">
                  {stats.salesByProductData.length === 0 ? (
                    <span className="text-dark-400 text-sm">Sin datos para graficar</span>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.salesByProductData}
                          cx="50%"
                          cy="50%"
                          innerRadius={0}
                          outerRadius={75}
                          dataKey="value"
                        >
                          {stats.salesByProductData.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={PRODUCT_COLORS[index % PRODUCT_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${value.toLocaleString()} Bs.`} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="flex justify-center flex-wrap gap-x-4 gap-y-2 text-xs">
                  {stats.salesByProductData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center space-x-1.5">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: PRODUCT_COLORS[index % PRODUCT_COLORS.length] }}></span>
                      <span className="font-bold text-dark-300">{entry.name} ({entry.value.toLocaleString()} Bs.)</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* General business overview metrics */}
              <div className="glass rounded-2xl p-6 space-y-6">
                <h3 className="font-display font-extrabold text-white text-base">CRM Operativo - Rendimiento Comercial</h3>
                <div className="space-y-4">
                  <div className="p-4 bg-dark-900 border border-dark-800 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs text-dark-400 font-bold block">Margen Comercial Neto Promedio</span>
                      <span className="text-sm text-dark-200">Porcentaje de ganancia sobre el volumen total facturado.</span>
                    </div>
                    <span className="text-2xl font-display font-black text-agro-accent">
                      {stats.salesTotal > 0 ? Math.round((stats.netProfit / stats.salesTotal) * 100) : 0}%
                    </span>
                  </div>

                  <div className="p-4 bg-dark-900 border border-dark-800 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs text-dark-400 font-bold block">Costo de Transporte Promedio</span>
                      <span className="text-sm text-dark-200">Flete por despacho de silos.</span>
                    </div>
                    <span className="text-2xl font-display font-black text-white">
                      {stats.avgShipping.toLocaleString()} Bs.
                    </span>
                  </div>

                  <div className="p-4 bg-dark-900 border border-dark-800 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs text-dark-400 font-bold block">Volumen por Despacho</span>
                      <span className="text-sm text-dark-200">Toneladas promedio por pedido.</span>
                    </div>
                    <span className="text-2xl font-display font-black text-white">
                      {orders.length > 0 ? (Math.round((stats.tonsTotal / orders.length) * 10) / 10) : 0} T
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 2: CRM ORDERS */}
        {activeTab === 'orders' && (
          <div className="glass rounded-3xl overflow-hidden border border-dark-800 animate-fade-in">
            <div className="p-6 border-b border-dark-850 bg-dark-800/40 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="font-display font-extrabold text-white text-base">CRM Operativo - Despachos</h3>
                <p className="text-xs text-dark-400">Verifique pedidos, actualice estados y asigne rutas.</p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                {/* Manual Register button */}
                <button
                  onClick={() => {
                    if (products.length === 0) {
                      addToast({ type: 'warning', title: 'Sin Productos', message: 'Registre al menos un producto primero.' });
                      return;
                    }
                    setManualOrderForm({
                      customer_name: '',
                      customer_phone: '',
                      product_id: products[0].id,
                      quantity_tons: 10,
                      shipping_cost: 1200,
                      payment_method: 'Transferencia',
                      lat: -17.7500,
                      lng: -63.0700
                    });
                    setShowOrderModal(true);
                  }}
                  className="btn-gold py-2 px-4 flex items-center space-x-1.5 text-xs text-dark-900 shadow-sm"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>Nuevo Pedido Manual</span>
                </button>

                {/* Filters */}
                <div className="flex items-center space-x-2 bg-dark-900 rounded-xl p-1 border border-dark-600">
                  {['Todos', 'Pendiente', 'En Camino', 'Entregado'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setFilterStatus(status)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        filterStatus === status
                          ? 'bg-agro-500 text-white shadow-sm'
                          : 'text-dark-400 hover:text-white'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="text-center py-12 text-dark-400 space-y-3">
                  <span className="h-8 w-8 rounded-full border-4 border-agro-500 border-t-transparent animate-spin inline-block"></span>
                  <p className="text-sm font-semibold">Cargando despachos...</p>
                </div>
              ) : orders.filter(o => filterStatus === 'Todos' ? true : o.status === filterStatus).length === 0 ? (
                <div className="text-center py-12 text-dark-400 space-y-3">
                  <Truck className="h-12 w-12 mx-auto text-dark-500 stroke-1" />
                  <p className="text-sm">No se encontraron registros de despachos.</p>
                </div>
              ) : (
                <table className="table-dark">
                  <thead>
                    <tr>
                      <th className="py-4 px-6">Código / Fecha</th>
                      <th className="py-4 px-6">Cliente / Contacto</th>
                      <th className="py-4 px-6 text-center">Peso</th>
                      <th className="py-4 px-6 text-right">Flete</th>
                      <th className="py-4 px-6 text-right">Monto Total</th>
                      <th className="py-4 px-6 text-center">Estado</th>
                      <th className="py-4 px-6 text-center">Ruta Chofer / Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800 text-sm">
                    {orders
                      .filter(o => filterStatus === 'Todos' ? true : o.status === filterStatus)
                      .map((order) => (
                        <tr key={order.id} className="hover:bg-dark-800/20 transition-all duration-300">
                          <td className="py-4 px-6">
                            <span className="font-extrabold text-agro-accent block">{order.order_code}</span>
                            <span className="text-[10px] text-dark-400 block mt-0.5">
                              {new Date(order.created_at || Date.now()).toLocaleString('es-ES')}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <span className="font-bold text-white block">{order.customer_name}</span>
                            <span className="text-xs text-dark-300 block">{order.customer_phone}</span>
                          </td>
                          <td className="py-4 px-6 text-center font-bold text-dark-200">
                            {order.total_weight_tons} T
                          </td>
                          <td className="py-4 px-6 text-right font-semibold text-dark-300">
                            {order.shipping_cost.toLocaleString()} Bs.
                          </td>
                          <td className="py-4 px-6 text-right font-black text-agro-accent">
                            {order.total_amount.toLocaleString()} Bs.
                          </td>
                          <td className="py-4 px-6 text-center">
                            <select
                              value={order.status}
                              onChange={(e) => handleStatusChange(order.id!, e.target.value as any)}
                              className={`text-xs font-bold rounded-xl px-3 py-1.5 border appearance-none focus:outline-none text-center cursor-pointer bg-dark-900 ${
                                order.status === 'Pendiente'
                                  ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/5'
                                  : order.status === 'En Camino'
                                  ? 'text-blue-400 border-blue-500/30 bg-blue-500/5'
                                  : 'text-green-400 border-green-500/30 bg-green-500/5'
                              }`}
                            >
                              <option value="Pendiente">Pendiente</option>
                              <option value="En Camino">En Camino</option>
                              <option value="Entregado">Entregado</option>
                            </select>
                          </td>
                          <td className="py-4 px-6 text-center flex items-center justify-center space-x-2">
                            {order.status === 'En Camino' ? (
                              <a
                                href={getDriverRouteLink(order.lat, order.lng)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center space-x-1 bg-agro-500 hover:bg-agro-600 text-white font-bold text-xs px-2.5 py-1.5 rounded-lg transition-all shadow-sm"
                              >
                                <span>Ruta</span>
                                <ArrowUpRight className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-[10px] text-dark-400 bg-dark-900 border border-dark-800 px-2 py-1.5 rounded-lg select-none">
                                Sin Ruta
                              </span>
                            )}
                            
                            <button
                              onClick={() => handleDeleteOrder(order.id!)}
                              className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                              title="Eliminar Pedido"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: PRODUCTS CRUD */}
        {activeTab === 'products' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center bg-dark-800/40 p-4 border border-dark-800 rounded-2xl">
              <div>
                <h3 className="font-display font-extrabold text-white text-base">Inventario de Silos</h3>
                <p className="text-xs text-dark-400">Precios de venta por tonelada y disponibilidad en planta.</p>
              </div>
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setProductForm({ name: '', description: '', unit_price_ton: 300, stock_tons: 1000, factor_flete: 1.0 });
                  setShowProductModal(true);
                }}
                className="btn-gold py-2 px-4 flex items-center space-x-1.5 text-xs text-dark-900 font-bold shadow-sm"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Agregar Producto</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {products.map(prod => (
                <div key={prod.id} className="glass rounded-2xl p-6 border-gradient-agro flex flex-col justify-between hover:scale-[1.01] transition-all">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <span className="bg-dark-900 border border-dark-700 p-2.5 rounded-xl block">
                        {prod.name.toLowerCase().includes('maíz') || prod.name.toLowerCase().includes('maiz') ? <Wheat className="h-6 w-6 text-yellow-500" /> : prod.name.toLowerCase().includes('soya') ? <Sprout className="h-6 w-6 text-green-500" /> : <Wheat className="h-6 w-6 text-orange-400" />}
                      </span>
                      <div className="flex space-x-1">
                        <button
                          onClick={() => startEditProduct(prod)}
                          className="p-1.5 text-agro-accent hover:bg-agro-500/10 rounded-lg transition-all"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(prod.id)}
                          className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <h4 className="font-display font-extrabold text-white text-lg mb-2">{prod.name}</h4>
                    <p className="text-xs text-dark-300 leading-relaxed mb-4">{prod.description}</p>
                  </div>

                  <div className="space-y-3 border-t border-dark-700 pt-4 text-xs">
                    <div className="flex justify-between">
                      <span className="text-dark-400">Precio de Venta</span>
                      <span className="font-extrabold text-white">{prod.unit_price_ton} Bs. / Ton</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-400">Stock Disponible</span>
                      <span className="font-extrabold text-agro-accent">{prod.stock_tons} Tons</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-400">Factor de Flete</span>
                      <span className="font-bold text-gold-300">{prod.factor_flete}x</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: ADMIN USERS CRUD */}
        {activeTab === 'admins' && user.role === 'Superadmin' && (
          <div className="glass rounded-3xl border border-dark-800 overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-dark-850 bg-dark-800/40 flex justify-between items-center">
              <div>
                <h3 className="font-display font-extrabold text-white text-base">Administradores del Sistema</h3>
                <p className="text-xs text-dark-400">Sólo Superadmin puede añadir, editar o remover perfiles de seguridad.</p>
              </div>
              <button
                onClick={() => {
                  setEditingAdmin(null);
                  setAdminForm({ email: '', password: '', role: 'Admin' });
                  setShowAdminModal(true);
                }}
                className="btn-gold py-2 px-4 flex items-center space-x-1.5 text-xs text-dark-900 font-bold shadow-sm"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Agregar Administrador</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="table-dark">
                <thead>
                  <tr>
                    <th className="py-4 px-6">ID de Usuario</th>
                    <th className="py-4 px-6">Correo de Ingreso</th>
                    <th className="py-4 px-6 text-center">Rol de Acceso</th>
                    <th className="py-4 px-6 text-center">Seguridad 2FA</th>
                    <th className="py-4 px-6 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800 text-sm">
                  {admins.map(adm => (
                    <tr key={adm.id} className="hover:bg-dark-800/20 transition-all duration-300">
                      <td className="py-4 px-6 text-dark-400 font-mono text-xs">
                        {adm.id}
                      </td>
                      <td className="py-4 px-6 font-bold text-white">
                        {adm.email} {adm.id === user.id && <span className="text-[10px] bg-dark-600 text-dark-200 px-2 py-0.5 rounded ml-2">Mi Cuenta</span>}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className={`text-[10px] font-extrabold rounded-md px-2.5 py-1 border ${
                          adm.role === 'Superadmin' 
                            ? 'text-gold-400 border-gold-500/30 bg-gold-500/5' 
                            : 'text-agro-accent border-agro-500/30 bg-agro-500/5'
                        }`}>
                          {adm.role}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className={`h-2.5 w-2.5 rounded-full inline-block ${adm.two_factor_enabled ? 'bg-green-500' : 'bg-dark-600'}`} title={adm.two_factor_enabled ? 'Activado' : 'Inactivo'}></span>
                      </td>
                      <td className="py-4 px-6 text-center flex items-center justify-center space-x-3">
                        <button
                          onClick={() => startEditAdmin(adm)}
                          className="p-1.5 text-agro-accent hover:bg-agro-500/10 rounded-lg transition-all"
                          title="Modificar Administrador"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        
                        {adm.id !== user.id && (
                          <button
                            onClick={() => handleDeleteAdmin(adm.id)}
                            className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                            title="Eliminar Cuenta"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: SECURITY & 2FA */}
        {activeTab === 'security' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
            
            {/* Account Details changes */}
            <form onSubmit={handleUpdateSelf} className="glass rounded-3xl p-6 border border-dark-800 space-y-6">
              <div>
                <h3 className="font-display font-extrabold text-white text-base">Mis Datos de Acceso</h3>
                <p className="text-xs text-dark-400">Modifique sus credenciales para ingresar al sistema.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Correo Electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                    <input
                      type="email"
                      value={selfForm.email}
                      onChange={e => setSelfForm(prev => ({ ...prev, email: e.target.value }))}
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-dark-900 border border-dark-650 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-agro-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Nueva Contraseña (dejar vacío si no cambia)</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                    <input
                      type="password"
                      value={selfForm.password}
                      onChange={e => setSelfForm(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-4 py-2.5 bg-dark-900 border border-dark-650 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-agro-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={updatingSelf}
                  className="btn-gold py-2.5 px-6 flex items-center justify-center space-x-2 w-full disabled:opacity-60 text-dark-900 font-bold"
                >
                  <Save className="h-4 w-4" />
                  <span>{updatingSelf ? 'Guardando...' : 'Actualizar Credenciales'}</span>
                </button>
              </div>
            </form>

            {/* 2FA configuration portal */}
            <div className="glass rounded-3xl p-6 border border-dark-800 space-y-6">
              <div>
                <h3 className="font-display font-extrabold text-white text-base">Doble Factor de Autenticación (2FA)</h3>
                <p className="text-xs text-dark-400">Proteja el acceso agregando una verificación OTP adicional mediante dispositivo móvil.</p>
              </div>

              {twoFAStep === 'none' && (
                <div className="space-y-4">
                  <div className="p-4 bg-dark-900 border border-dark-800 rounded-xl text-xs text-dark-300 leading-relaxed">
                    <p className="font-bold text-white mb-2 flex items-center gap-2"><Lock className="h-4 w-4" /> Nivel de seguridad básico</p>
                    Para activar, presione el botón de abajo. Deberá escanear el código QR con una app de autenticación (Google Authenticator, Authy, Microsoft Authenticator) e ingresar el código generado.
                  </div>
                  <button
                    onClick={handleSetup2FA}
                    disabled={twoFALoading}
                    className="btn-agro w-full py-3 flex items-center justify-center space-x-2 disabled:opacity-50 text-white font-bold"
                  >
                    <QrCode className="h-4 w-4 text-agro-accent animate-pulse" />
                    <span>{twoFALoading ? 'Generando configuración...' : 'Activar Doble Factor'}</span>
                  </button>
                </div>
              )}

              {twoFAStep === 'setup' && (
                <form onSubmit={handleVerifyAndEnable2FA} className="space-y-4 animate-scale-in">
                  <div className="flex flex-col items-center p-4 bg-white rounded-2xl border-gradient-agro">
                    {/* Simulated SVG QR code representation */}
                    <div className="w-[140px] h-[140px] bg-dark-900 border border-dark-700 p-2 rounded-lg flex items-center justify-center relative">
                      <QrCode className="w-24 h-24 text-white animate-pulse" />
                      <div className="absolute inset-0 bg-transparent flex items-center justify-center">
                        <span className="text-[9px] bg-agro-500 text-white px-2 py-0.5 rounded font-mono font-bold">QR DE CONFIGURACIÓN</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-dark-800 font-bold font-mono mt-3 uppercase tracking-wide select-all cursor-pointer">
                      Secret: {twoFASecret}
                    </span>
                  </div>

                  <p className="text-xs text-dark-300">
                    Escanee el QR. Luego ingrese el código temporal de 6 dígitos para confirmar activación:
                  </p>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={twoFACodeInput}
                      onChange={e => setTwoFACodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      required
                      className="text-center font-mono text-lg tracking-widest flex-1 py-2 bg-dark-900 border border-dark-655 rounded-xl text-gold-300 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={twoFALoading || twoFACodeInput.length !== 6}
                      className="btn-gold py-2 px-5 text-dark-900 font-bold shrink-0 disabled:opacity-50"
                    >
                      Verificar
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => { setTwoFAStep('none'); setTwoFACodeInput(''); }}
                    className="text-xs text-dark-400 hover:text-white block w-full text-center"
                  >
                    Cancelar Configuración
                  </button>
                </form>
              )}

              {twoFAStep === 'enabled' && (
                <form onSubmit={handleDisable2FA} className="space-y-4">
                  <div className="p-4 bg-agro-500/10 border border-agro-500/30 rounded-xl text-xs flex items-center gap-3">
                    <CheckCircle className="h-8 w-8 text-green-400 shrink-0" />
                    <div>
                      <strong className="text-green-400 font-bold flex items-center gap-1.5 mb-1"><CheckCircle className="h-4 w-4" /> Doble factor activo</strong>
                      Su cuenta cuenta con una de las capas de seguridad más avanzadas disponibles en el sistema.
                    </div>
                  </div>

                  <p className="text-xs text-dark-400">
                    Para desactivar el doble factor de autenticación, ingrese un código temporal generado en su aplicación móvil:
                  </p>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={twoFACodeInput}
                      onChange={e => setTwoFACodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      required
                      className="text-center font-mono text-lg tracking-widest flex-1 py-2 bg-dark-900 border border-dark-655 rounded-xl text-red-300 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={twoFALoading || twoFACodeInput.length !== 6}
                      className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-xl font-bold shrink-0 text-xs disabled:opacity-50"
                    >
                      Desactivar 2FA
                    </button>
                  </div>
                </form>
              )}
            </div>

          </div>
        )}

      </div>

      {/* CRM ORDER MODAL (CREATION) */}
      {showOrderModal && createPortal(
        <div className="fixed inset-0 z-[100] bg-dark-950/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <form onSubmit={handleRegisterManualOrder} className="glass rounded-3xl p-6 max-w-lg w-full border-gradient-agro space-y-4 animate-scale-in">
            <div className="flex justify-between items-start">
              <h3 className="font-display font-extrabold text-white text-lg">Registrar Venta Directa (Manual)</h3>
              <button type="button" onClick={() => setShowOrderModal(false)} className="text-dark-400 hover:text-white transition-colors" title="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Nombre del Cliente</label>
                <input
                  type="text"
                  required
                  value={manualOrderForm.customer_name}
                  onChange={e => setManualOrderForm(prev => ({ ...prev, customer_name: e.target.value }))}
                  placeholder="Ganadería El Porvenir"
                  className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Celular Cliente</label>
                <input
                  type="tel"
                  required
                  value={manualOrderForm.customer_phone}
                  onChange={e => setManualOrderForm(prev => ({ ...prev, customer_phone: e.target.value }))}
                  placeholder="76049210"
                  className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Método de Pago</label>
                <select
                  value={manualOrderForm.payment_method}
                  onChange={e => setManualOrderForm(prev => ({ ...prev, payment_method: e.target.value as any }))}
                  className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none cursor-pointer"
                >
                  <option value="QR">QR Pago Fiel</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="WhatsApp">WhatsApp / Coordinado</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Producto</label>
                <select
                  value={manualOrderForm.product_id}
                  onChange={e => setManualOrderForm(prev => ({ ...prev, product_id: e.target.value }))}
                  className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none cursor-pointer"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.unit_price_ton} Bs./t)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Cantidad (Tons)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={manualOrderForm.quantity_tons}
                  onChange={e => setManualOrderForm(prev => ({ ...prev, quantity_tons: parseInt(e.target.value) || 0 }))}
                  className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Costo Flete Envío (Bs.)</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={manualOrderForm.shipping_cost}
                  onChange={e => setManualOrderForm(prev => ({ ...prev, shipping_cost: parseInt(e.target.value) || 0 }))}
                  className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Finca Latitud</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={manualOrderForm.lat}
                  onChange={e => setManualOrderForm(prev => ({ ...prev, lat: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Finca Longitud</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={manualOrderForm.lng}
                  onChange={e => setManualOrderForm(prev => ({ ...prev, lng: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none"
                />
              </div>

            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                className="px-4 py-2 text-xs font-bold text-dark-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-gold py-2 px-5 text-dark-900 font-bold text-xs shadow"
              >
                Registrar Venta
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* PRODUCT MODAL (CREATE / EDIT) */}
      {showProductModal && createPortal(
        <div className="fixed inset-0 z-[100] bg-dark-950/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <form onSubmit={handleProductSubmit} className="glass rounded-3xl p-6 max-w-md w-full border-gradient-agro space-y-4 animate-scale-in">
            <div className="flex justify-between items-start">
              <h3 className="font-display font-extrabold text-white text-lg">
                {editingProduct ? `Editar Silo: ${editingProduct.name}` : 'Registrar Nuevo Silo de Forraje'}
              </h3>
              <button type="button" onClick={() => setShowProductModal(false)} className="text-dark-400 hover:text-white transition-colors" title="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Nombre Comercial del Producto</label>
                <input
                  type="text"
                  required
                  value={productForm.name}
                  onChange={e => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ej. Silo de Sorgo Premium"
                  className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Descripción Nutritiva / Detalles</label>
                <textarea
                  value={productForm.description}
                  onChange={e => setProductForm(prev => ({ ...prev, description: e.target.value }))}
                  required
                  rows={3}
                  placeholder="Detalles de fibra, humedad, aditivos, etc."
                  className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Precio Unitario (Bs./Ton)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={productForm.unit_price_ton}
                    onChange={e => setProductForm(prev => ({ ...prev, unit_price_ton: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Stock Inicial (Tons)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={productForm.stock_tons}
                    onChange={e => setProductForm(prev => ({ ...prev, stock_tons: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Factor Logístico de Peso (Flete)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    required
                    value={productForm.factor_flete}
                    onChange={e => setProductForm(prev => ({ ...prev, factor_flete: parseFloat(e.target.value) || 1.0 }))}
                    className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="px-4 py-2 text-xs font-bold text-dark-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-gold py-2 px-5 text-dark-900 font-bold text-xs shadow"
              >
                Guardar Producto
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* ADMIN USERS MODAL (CREATE / EDIT) */}
      {showAdminModal && createPortal(
        <div className="fixed inset-0 z-[100] bg-dark-950/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <form onSubmit={handleAdminSubmit} className="glass rounded-3xl p-6 max-w-sm w-full border-gradient-agro space-y-4 animate-scale-in">
            <div className="flex justify-between items-start">
              <h3 className="font-display font-extrabold text-white text-lg">
                {editingAdmin ? 'Modificar Administrador' : 'Registrar Nuevo Administrador'}
              </h3>
              <button type="button" onClick={() => setShowAdminModal(false)} className="text-dark-400 hover:text-white transition-colors" title="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  value={adminForm.email}
                  onChange={e => setAdminForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="admin-nuevo@ensilados.com"
                  className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-300 uppercase mb-1">
                  {editingAdmin ? 'Contraseña (vacío para no cambiar)' : 'Contraseña de Acceso'}
                </label>
                <input
                  type="password"
                  required={!editingAdmin}
                  value={adminForm.password}
                  onChange={e => setAdminForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Rol de Acceso en Sistema</label>
                <select
                  value={adminForm.role}
                  onChange={e => setAdminForm(prev => ({ ...prev, role: e.target.value as any }))}
                  className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none cursor-pointer"
                >
                  <option value="Admin">Administrador (Solo Despachos y Catálogo)</option>
                  <option value="Superadmin">Superadministrador (Acceso Total y Seguridad)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAdminModal(false)}
                className="px-4 py-2 text-xs font-bold text-dark-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-gold py-2 px-5 text-dark-900 font-bold text-xs shadow"
              >
                {editingAdmin ? 'Guardar Cambios' : 'Crear Cuenta'}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Plantilla oculta para el PDF (A4 Portrait aprox proportion) */}
      <div 
        id="pdf-report-template" 
        className="bg-white text-black p-10 w-[800px]" 
        style={{ display: 'none', position: 'absolute', left: '-9999px', top: '-9999px' }}
      >
        {/* Header */}
        <div className="flex justify-between items-end border-b-2 border-gray-300 pb-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-gray-900">Reporte de Ventas y CRM</h1>
            <p className="text-lg text-gray-600 font-bold">Ensilados Santa Cruz</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Fecha de emisión: {new Date().toLocaleDateString('es-ES')}</p>
            <p className="text-sm text-gray-500">Generado por: {user.email}</p>
          </div>
        </div>

        {/* Resumen Financiero */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4">Resumen Financiero y Operativo</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-gray-200 bg-gray-50 p-4 rounded-xl flex justify-between items-center">
              <span className="text-sm text-gray-600 font-bold uppercase">Ventas Totales</span>
              <span className="text-xl font-black text-gray-900">{stats.salesTotal.toLocaleString()} Bs.</span>
            </div>
            <div className="border border-green-200 bg-green-50 p-4 rounded-xl flex justify-between items-center">
              <span className="text-sm text-green-700 font-bold uppercase">Ganancia Neta</span>
              <span className="text-xl font-black text-green-700">{stats.netProfit.toLocaleString()} Bs.</span>
            </div>
            <div className="border border-red-200 bg-red-50 p-4 rounded-xl flex justify-between items-center">
              <span className="text-sm text-red-700 font-bold uppercase">Costos Totales</span>
              <span className="text-xl font-black text-red-700">{(stats.materialsCost + stats.logisticsCost).toLocaleString()} Bs.</span>
            </div>
            <div className="border border-gray-200 bg-gray-50 p-4 rounded-xl flex justify-between items-center">
              <span className="text-sm text-gray-600 font-bold uppercase">Volumen Desp.</span>
              <span className="text-xl font-black text-gray-900">{stats.tonsTotal} Tons</span>
            </div>
          </div>
        </div>

        {/* Gráficos Principales */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4">Facturación Mensual</h2>
          <div className="bg-white">
            <BarChart width={720} height={300} data={stats.monthlyTrendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '13px' }}/>
              <Bar dataKey="ingresos" fill="#15803d" name="Ingresos (Bs.)" />
              <Bar dataKey="costos" fill="#dc2626" name="Costos (Bs.)" />
              <Bar dataKey="ganancia" fill="#ca8a04" name="Ganancia Neta" />
            </BarChart>
          </div>
        </div>

        {/* Desglose de Distribución */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h2 className="text-sm font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4">Costos vs Ganancias</h2>
            <PieChart width={340} height={250}>
              <Pie
                data={stats.gainLossData}
                cx="50%" cy="50%"
                innerRadius={60} outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {stats.gainLossData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={PROFIT_COLORS[index % PROFIT_COLORS.length]} />
                ))}
              </Pie>
              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px' }}/>
            </PieChart>
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4">Ventas por Producto</h2>
            <PieChart width={340} height={250}>
              <Pie
                data={stats.salesByProductData}
                cx="50%" cy="50%"
                innerRadius={60} outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {stats.salesByProductData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={PRODUCT_COLORS[index % PRODUCT_COLORS.length]} />
                ))}
              </Pie>
              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px' }}/>
            </PieChart>
          </div>
        </div>
        
        <div className="mt-12 text-center text-gray-400 text-xs border-t border-gray-200 pt-4">
          Reporte generado automáticamente por el Sistema Administrativo Ensilados Santa Cruz
        </div>
      </div>

    </div>
  );
}
