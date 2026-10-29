import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  Truck, ArrowUpRight, TrendingUp,
  Package, DollarSign, Users, PlusCircle, Trash2, Edit2,
  Key, Mail, Save, CheckCircle, Lock, ShieldAlert, RefreshCw, LogOut, Wheat, Sprout, Download, X, Settings
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { FleteParams, Order, OrderStatus, PaymentMethod, Product, UserProfile, UserRole } from '../types';
import * as api from '../api';

interface AdminDashboardProps {
  user: UserProfile;
  onLogout: () => void;
  onSessionExpired: () => void;
  addToast: (toast: any) => void;
}

const PRODUCT_COLORS = ['#2d6a4f', '#7dd0a3', '#b0e6c5', '#1b4332'];
const PROFIT_COLORS = ['#2d6a4f', '#ef4444', '#d4a217']; // Verde (ganancia), rojo (materiales), amarillo (logística)

/** Transiciones de estado válidas (iguales a las del servidor). Entregado y Cancelado son finales. */
const TRANSICIONES: Record<OrderStatus, OrderStatus[]> = {
  Pendiente: ['En Camino', 'Entregado', 'Cancelado'],
  'En Camino': ['Pendiente', 'Entregado', 'Cancelado'],
  Entregado: [],
  Cancelado: [],
};
const ESTADOS_FILTRO = ['Todos', 'Pendiente', 'En Camino', 'Entregado', 'Cancelado'];

type TabId = 'dashboard' | 'orders' | 'products' | 'admins' | 'params' | 'security';

export default function AdminDashboard({ user, onLogout, onSessionExpired, addToast }: AdminDashboardProps) {
  const esSuper = user.role === 'Superadmin';
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [online, setOnline] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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
    role: 'Admin' as UserRole
  });

  // Manual Order Form states (el servidor calcula el flete a partir de las coordenadas)
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [manualOrderForm, setManualOrderForm] = useState({
    customer_name: '',
    customer_phone: '',
    product_id: '',
    quantity_tons: 10,
    payment_method: 'Transferencia' as PaymentMethod,
    lat: -17.75,
    lng: -63.07
  });

  // Cambio de contraseña propio
  const [selfForm, setSelfForm] = useState({ current: '', next: '' });
  const [updatingSelf, setUpdatingSelf] = useState(false);

  // 2FA (TOTP real)
  const [twoFASecret, setTwoFASecret] = useState<string | null>(null);
  const [twoFAUrl, setTwoFAUrl] = useState<string | null>(null);
  const [twoFACodeInput, setTwoFACodeInput] = useState('');
  const [twoFAPassword, setTwoFAPassword] = useState('');
  const [twoFAStep, setTwoFAStep] = useState<'none' | 'setup' | 'enabled'>(user.two_factor_enabled ? 'enabled' : 'none');
  const [twoFALoading, setTwoFALoading] = useState(false);

  // Parámetros tarifarios (Superadmin)
  const [params, setParams] = useState<FleteParams | null>(null);
  const [paramsForm, setParamsForm] = useState<Record<string, string>>({});

  const handleError = useCallback((err: unknown, titulo: string, porDefecto: string) => {
    if (err instanceof api.ApiError) {
      if (err.status === 401 && err.code !== 'CREDENCIALES_INVALIDAS') {
        onSessionExpired();
        return;
      }
      if (err.isNetwork) setOnline(false);
    }
    addToast({ type: 'error', title: titulo, message: api.mensajeError(err, porDefecto) });
  }, [addToast, onSessionExpired]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      setOrders(await api.admin.pedidos({ desde: dateFrom || undefined, hasta: dateTo || undefined }));
      setOnline(true);
    } catch (err) {
      handleError(err, 'Error', 'No se pudieron cargar los pedidos.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, handleError]);

  const fetchProducts = useCallback(async () => {
    try {
      setProducts(await api.admin.productos());
    } catch (err) {
      handleError(err, 'Error', 'No se pudieron cargar los productos.');
    }
  }, [handleError]);

  const fetchAdmins = useCallback(async () => {
    try {
      setAdmins(await api.admin.usuarios());
    } catch (err) {
      handleError(err, 'Error', 'No se pudieron cargar los administradores.');
    }
  }, [handleError]);

  const fetchParams = useCallback(async () => {
    try {
      const p = await api.admin.parametros();
      setParams(p);
      setParamsForm({
        tarifa_base_bs: String(p.tarifa_base_bs),
        precio_km_bs: String(p.precio_km_bs),
        factor_correccion_rural: String(p.factor_correccion_rural),
        capacidad_vehiculo_tons: String(p.capacidad_vehiculo_tons),
        peso_minimo_tons: String(p.peso_minimo_tons),
        pct_costo_mercaderia: String(p.pct_costo_mercaderia),
        pct_costo_logistico: String(p.pct_costo_logistico),
      });
    } catch (err) {
      handleError(err, 'Error', 'No se pudieron cargar los parámetros de flete.');
    }
  }, [handleError]);

  useEffect(() => { fetchProducts(); if (esSuper) { fetchAdmins(); fetchParams(); } }, [esSuper, fetchProducts, fetchAdmins, fetchParams]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const refreshAll = () => { fetchOrders(); fetchProducts(); if (esSuper) { fetchAdmins(); fetchParams(); } };

  // Cambio de estado (el servidor valida la transición, repone stock al cancelar y registra el historial)
  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    if (newStatus === 'Cancelado' && !window.confirm('¿Cancelar este pedido? Se devolverá el stock a inventario y no podrá reactivarse.')) return;
    try {
      await api.admin.cambiarEstado(orderId, newStatus);
      addToast({ type: 'success', title: 'Estado Actualizado', message: `Pedido cambiado a ${newStatus}.` });
      fetchOrders();
      if (newStatus === 'Cancelado') fetchProducts();
    } catch (err) {
      handleError(err, 'Error', 'No se pudo actualizar el estado del pedido.');
      fetchOrders();
    }
  };

  // Product CRUD Handlers
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.admin.guardarProducto(editingProduct ? editingProduct.id : null, productForm);
      addToast({
        type: 'success',
        title: editingProduct ? 'Producto Modificado' : 'Producto Registrado',
        message: `Producto '${productForm.name}' guardado.`
      });
      setShowProductModal(false);
      setEditingProduct(null);
      fetchProducts();
    } catch (err) {
      handleError(err, 'Error', 'No se pudo guardar el producto.');
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

  // "Eliminar" = desactivar: los pedidos históricos conservan el producto
  const handleDeleteProduct = async (prodId: string) => {
    if (!window.confirm('¿Desactivar este producto? Dejará de mostrarse en el catálogo (los pedidos anteriores se conservan).')) return;
    try {
      await api.admin.desactivarProducto(prodId);
      addToast({ type: 'success', title: 'Producto Desactivado', message: 'Ya no aparece en el catálogo público.' });
      fetchProducts();
    } catch (err) {
      handleError(err, 'Error', 'No se pudo desactivar el producto.');
    }
  };

  const handleReactivateProduct = async (prod: Product) => {
    try {
      await api.admin.guardarProducto(prod.id, { ...prod, active: true });
      addToast({ type: 'success', title: 'Producto Reactivado', message: `'${prod.name}' vuelve a mostrarse en el catálogo.` });
      fetchProducts();
    } catch (err) {
      handleError(err, 'Error', 'No se pudo reactivar el producto.');
    }
  };

  // Admin CRUD Handlers (solo Superadmin)
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAdmin) {
        await api.admin.actualizarUsuario(editingAdmin.id, {
          rol: adminForm.role,
          password: adminForm.password || undefined
        });
        addToast({ type: 'success', title: 'Administrador Actualizado', message: `Se actualizó el perfil de ${editingAdmin.email}.` });
      } else {
        await api.admin.crearUsuario(adminForm.email, adminForm.password, adminForm.role);
        addToast({ type: 'success', title: 'Administrador Creado', message: `Nuevo administrador registrado: ${adminForm.email}.` });
      }
      setShowAdminModal(false);
      setEditingAdmin(null);
      fetchAdmins();
    } catch (err) {
      handleError(err, 'Error', 'Error al guardar administrador.');
    }
  };

  const startEditAdmin = (admin: UserProfile) => {
    setEditingAdmin(admin);
    setAdminForm({ email: admin.email, password: '', role: admin.role });
    setShowAdminModal(true);
  };

  const handleDeleteAdmin = async (adminId: string) => {
    if (adminId === user.id) {
      addToast({ type: 'error', title: 'Acción inválida', message: 'No puede eliminar su propia cuenta.' });
      return;
    }
    if (!window.confirm('¿Está seguro de eliminar este administrador?')) return;
    try {
      await api.admin.eliminarUsuario(adminId);
      addToast({ type: 'success', title: 'Administrador Eliminado', message: 'El usuario fue removido.' });
      fetchAdmins();
    } catch (err) {
      handleError(err, 'Error', 'No se pudo eliminar el administrador.');
    }
  };

  // Cambio de contraseña propia (exige la contraseña actual)
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingSelf(true);
    try {
      await api.cambiarPassword(selfForm.current, selfForm.next);
      addToast({ type: 'success', title: 'Contraseña actualizada', message: 'Use la nueva contraseña en su próximo ingreso.' });
      setSelfForm({ current: '', next: '' });
    } catch (err) {
      handleError(err, 'Error', 'No se pudo cambiar la contraseña.');
    } finally {
      setUpdatingSelf(false);
    }
  };

  // Registro manual de pedido (venta directa): el servidor calcula flete y totales
  const handleRegisterManualOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!api.telefonoValido(manualOrderForm.customer_phone)) {
      addToast({ type: 'error', title: 'Teléfono inválido', message: 'Ingrese un celular de 8 dígitos o un fijo de 7 dígitos.' });
      return;
    }
    try {
      const creado = await api.admin.crearPedido(
        {
          customerName: manualOrderForm.customer_name,
          customerPhone: manualOrderForm.customer_phone,
          lat: manualOrderForm.lat,
          lng: manualOrderForm.lng,
          paymentMethod: manualOrderForm.payment_method
        },
        manualOrderForm.product_id,
        manualOrderForm.quantity_tons
      );
      addToast({ type: 'success', title: 'Pedido Registrado', message: `${creado.order_code}: total ${creado.total_amount.toLocaleString()} Bs. (flete ${creado.shipping_cost.toLocaleString()} Bs.).` });
      setShowOrderModal(false);
      fetchOrders();
      fetchProducts();
    } catch (err) {
      handleError(err, 'No se registró el pedido', 'Revise los datos ingresados.');
    }
  };

  // Guardar parámetros tarifarios (Superadmin)
  const handleSaveParams = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cambios: Record<string, number> = {};
      Object.entries(paramsForm).forEach(([k, v]) => { cambios[k] = Number(v); });
      await api.admin.guardarParametros(cambios);
      addToast({ type: 'success', title: 'Parámetros guardados', message: 'Las nuevas tarifas se aplican a las próximas cotizaciones.' });
      fetchParams();
    } catch (err) {
      handleError(err, 'Error', 'No se pudieron guardar los parámetros.');
    }
  };

  // Exportar CSV (HU09)
  const handleExportCsv = async () => {
    try {
      await api.admin.descargarCsv({ estado: filterStatus, desde: dateFrom || undefined, hasta: dateTo || undefined });
      addToast({ type: 'success', title: 'Reporte CSV', message: 'Archivo descargado (compatible con Excel).' });
    } catch (err) {
      handleError(err, 'Error', 'No se pudo generar el CSV.');
    }
  };

  // 2FA real (TOTP RFC 6238)
  const handleSetup2FA = async () => {
    setTwoFALoading(true);
    try {
      const r = await api.configurar2FA();
      setTwoFASecret(r.secreto);
      setTwoFAUrl(r.otpauth_url);
      setTwoFAStep('setup');
    } catch (err) {
      handleError(err, 'Error', 'No se pudo generar la configuración de 2FA.');
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleVerifyAndEnable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFALoading(true);
    try {
      await api.activar2FA(twoFACodeInput);
      setTwoFAStep('enabled');
      setTwoFACodeInput('');
      setTwoFASecret(null);
      setTwoFAUrl(null);
      addToast({ type: 'success', title: '2FA Activado', message: 'Desde ahora se pedirá un código al iniciar sesión.' });
    } catch (err) {
      handleError(err, 'Código inválido', 'No se pudo activar el doble factor.');
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFALoading(true);
    try {
      await api.desactivar2FA(twoFAPassword, twoFACodeInput);
      setTwoFAStep('none');
      setTwoFACodeInput('');
      setTwoFAPassword('');
      addToast({ type: 'success', title: '2FA Desactivado', message: 'La verificación en dos pasos fue desactivada.' });
    } catch (err) {
      handleError(err, 'Error', 'No se pudo desactivar el doble factor.');
    } finally {
      setTwoFALoading(false);
    }
  };

  // Indicadores del panel: se calculan con los importes y costos estimados que guarda el servidor
  const stats = useMemo(() => {
    const validos = orders.filter(o => o.status !== 'Cancelado');
    let salesTotal = 0, tonsTotal = 0, shippingSum = 0, materialsCostTotal = 0, logisticsCostTotal = 0, netProfitTotal = 0;
    const productSalesMap: Record<string, number> = {};
    const monthlySalesMap: Record<string, { revenue: number; costs: number; profit: number; order: number }> = {};

    validos.forEach(o => {
      salesTotal += o.total_amount;
      tonsTotal += o.total_weight_tons;
      shippingSum += o.shipping_cost;
      const costItems = o.cost_items_bs ?? 0;
      const costLogistics = o.cost_logistics_bs ?? 0;
      const profit = o.net_profit_bs ?? 0;
      materialsCostTotal += costItems;
      logisticsCostTotal += costLogistics;
      netProfitTotal += profit;

      const date = new Date(o.created_at || Date.now());
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlySalesMap[key]) monthlySalesMap[key] = { revenue: 0, costs: 0, profit: 0, order: date.getFullYear() * 12 + date.getMonth() };
      monthlySalesMap[key].revenue += o.total_amount;
      monthlySalesMap[key].costs += costItems + costLogistics;
      monthlySalesMap[key].profit += profit;

      (o.items || []).forEach(i => {
        const nombre = i.product?.name || 'Producto';
        productSalesMap[nombre] = (productSalesMap[nombre] || 0) + i.subtotal;
      });
    });

    const nombreMes = (key: string) => {
      const [y, m] = key.split('-').map(Number);
      return `${new Date(y, m - 1, 1).toLocaleString('es-ES', { month: 'short' }).toUpperCase()} ${String(y).slice(2)}`;
    };
    const monthlyTrendData = Object.keys(monthlySalesMap)
      .sort((a, b) => monthlySalesMap[a].order - monthlySalesMap[b].order)
      .map(key => ({
        month: nombreMes(key),
        ingresos: Math.round(monthlySalesMap[key].revenue),
        costos: Math.round(monthlySalesMap[key].costs),
        ganancia: Math.round(monthlySalesMap[key].profit)
      }));

    return {
      salesTotal,
      materialsCost: Math.round(materialsCostTotal),
      logisticsCost: Math.round(logisticsCostTotal),
      netProfit: Math.round(netProfitTotal),
      tonsTotal: Math.round(tonsTotal * 100) / 100,
      pendingCount: orders.filter(o => o.status === 'Pendiente').length,
      avgShipping: validos.length > 0 ? Math.round(shippingSum / validos.length) : 0,
      salesByProductData: Object.keys(productSalesMap).map(name => ({ name, value: Math.round(productSalesMap[name]) })).filter(i => i.value > 0),
      monthlyTrendData: monthlyTrendData.length > 0 ? monthlyTrendData : [{ month: '—', ingresos: 0, costos: 0, ganancia: 0 }],
      gainLossData: [
        { name: 'Ganancia Neta', value: Math.max(0, Math.round(netProfitTotal)) },
        { name: 'Costo de Materiales', value: Math.round(materialsCostTotal) },
        { name: 'Costo de Logística', value: Math.round(logisticsCostTotal) }
      ].filter(v => v.value > 0)
    };
  }, [orders]);

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
            <span className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
            <span className="text-[10px] font-bold text-dark-200 uppercase tracking-wider">
              {online ? 'Conectado al servidor' : 'Sin conexión'}
            </span>
          </div>
          <button
            onClick={refreshAll}
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
          ...(esSuper ? [
            { id: 'admins', label: 'Administradores', icon: <Users className="h-4 w-4" /> },
            { id: 'params', label: 'Tarifas de Flete', icon: <Settings className="h-4 w-4" /> }
          ] : []),
          { id: 'security', label: 'Mi Cuenta & 2FA', icon: <Key className="h-4 w-4" /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabId)}
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
                {/* Filtro por fechas y exportación CSV (HU09) */}
                <div className="flex items-center gap-2 text-xs text-dark-300">
                  <label className="flex items-center gap-1">Desde
                    <input type="date" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)}
                      className="bg-dark-900 border border-dark-600 rounded-lg px-2 py-1 text-white" />
                  </label>
                  <label className="flex items-center gap-1">Hasta
                    <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)}
                      className="bg-dark-900 border border-dark-600 rounded-lg px-2 py-1 text-white" />
                  </label>
                  {(dateFrom || dateTo) && (
                    <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-dark-400 hover:text-white underline">Limpiar</button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="py-2 px-4 flex items-center space-x-1.5 text-xs font-bold bg-dark-900 border border-dark-600 hover:border-agro-500 rounded-xl text-white"
                >
                  <Download className="h-4 w-4" />
                  <span>Exportar CSV</span>
                </button>

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
                  {ESTADOS_FILTRO.map((status) => (
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
                              disabled={TRANSICIONES[order.status].length === 0}
                              onChange={(e) => handleStatusChange(order.id!, e.target.value as OrderStatus)}
                              className={`text-xs font-bold rounded-xl px-3 py-1.5 border appearance-none focus:outline-none text-center cursor-pointer disabled:cursor-not-allowed bg-dark-900 ${
                                order.status === 'Pendiente'
                                  ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/5'
                                  : order.status === 'En Camino'
                                  ? 'text-blue-400 border-blue-500/30 bg-blue-500/5'
                                  : order.status === 'Cancelado'
                                  ? 'text-red-400 border-red-500/30 bg-red-500/5'
                                  : 'text-green-400 border-green-500/30 bg-green-500/5'
                              }`}
                            >
                              {[order.status, ...TRANSICIONES[order.status]].map(st => (
                                <option key={st} value={st}>{st}</option>
                              ))}
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
                                {order.status === 'Cancelado' ? 'Cancelado' : 'Sin Ruta'}
                              </span>
                            )}
                            
                            {TRANSICIONES[order.status].includes('Cancelado') && (
                              <button
                                onClick={() => handleStatusChange(order.id!, 'Cancelado')}
                                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                title="Cancelar Pedido (devuelve el stock)"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
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
                        {esSuper && prod.active !== false && (
                          <button
                            onClick={() => handleDeleteProduct(prod.id)}
                            className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                            title="Desactivar producto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        {prod.active === false && (
                          <button
                            onClick={() => handleReactivateProduct(prod)}
                            className="px-2 text-[10px] font-bold text-agro-accent border border-agro-500/40 rounded-lg hover:bg-agro-500/10"
                          >
                            Reactivar
                          </button>
                        )}
                      </div>
                    </div>
                    <h4 className="font-display font-extrabold text-white text-lg mb-2">
                      {prod.name}
                      {prod.active === false && <span className="ml-2 text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded align-middle">Inactivo</span>}
                    </h4>
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

        {/* TAB: TARIFAS DE FLETE (solo Superadmin) */}
        {activeTab === 'params' && esSuper && (
          <form onSubmit={handleSaveParams} className="glass rounded-3xl p-6 border border-dark-800 space-y-6 max-w-3xl animate-fade-in">
            <div>
              <h3 className="font-display font-extrabold text-white text-base">Tarifas y parámetros del cálculo de flete</h3>
              <p className="text-xs text-dark-400">
                Flete = viajes × (tarifa base + km × precio por km) + Σ (toneladas × factor del producto). Los cambios se aplican a las próximas cotizaciones.
              </p>
            </div>
            {!params ? (
              <p className="text-sm text-dark-400">Cargando parámetros...</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([
                  ['tarifa_base_bs', 'Tarifa base por viaje (Bs.)', '1'],
                  ['precio_km_bs', 'Precio por kilómetro (Bs.)', '0.5'],
                  ['factor_correccion_rural', 'Factor de corrección rural (contingencia Haversine)', '0.01'],
                  ['capacidad_vehiculo_tons', 'Capacidad del vehículo (TM por viaje)', '1'],
                  ['peso_minimo_tons', 'Pedido mínimo (TM)', '0.5'],
                  ['pct_costo_mercaderia', 'Costo de mercadería estimado (fracción, ej. 0.60)', '0.01'],
                  ['pct_costo_logistico', 'Costo logístico estimado (fracción del flete, ej. 0.70)', '0.01'],
                ] as const).map(([campo, etiqueta, paso]) => (
                  <div key={campo}>
                    <label className="block text-xs font-bold text-dark-300 uppercase mb-1">{etiqueta}</label>
                    <input
                      type="number"
                      step={paso}
                      min="0"
                      required
                      value={paramsForm[campo] ?? ''}
                      onChange={e => setParamsForm(prev => ({ ...prev, [campo]: e.target.value }))}
                      className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            )}
            <button type="submit" disabled={!params} className="btn-gold py-2.5 px-6 flex items-center space-x-2 text-dark-900 font-bold disabled:opacity-50">
              <Save className="h-4 w-4" />
              <span>Guardar parámetros</span>
            </button>
          </form>
        )}

        {/* TAB 5: SECURITY & 2FA */}
        {activeTab === 'security' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
            
            {/* Account Details changes */}
            <form onSubmit={handleChangePassword} className="glass rounded-3xl p-6 border border-dark-800 space-y-6">
              <div>
                <h3 className="font-display font-extrabold text-white text-base">Mi Cuenta</h3>
                <p className="text-xs text-dark-400">Sesión de <span className="text-gold-300 font-bold">{user.email}</span>. Para cambiar la contraseña debe confirmar la actual.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Contraseña actual</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                    <input
                      type="password"
                      value={selfForm.current}
                      onChange={e => setSelfForm(prev => ({ ...prev, current: e.target.value }))}
                      required
                      autoComplete="current-password"
                      className="w-full pl-10 pr-4 py-2.5 bg-dark-900 border border-dark-650 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-agro-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Nueva contraseña (mínimo 8 caracteres)</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                    <input
                      type="password"
                      value={selfForm.next}
                      onChange={e => setSelfForm(prev => ({ ...prev, next: e.target.value }))}
                      required
                      minLength={8}
                      autoComplete="new-password"
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
                  <span>{updatingSelf ? 'Guardando...' : 'Cambiar Contraseña'}</span>
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
                    <Key className="h-4 w-4 text-agro-accent" />
                    <span>{twoFALoading ? 'Generando configuración...' : 'Activar Doble Factor'}</span>
                  </button>
                </div>
              )}

              {twoFAStep === 'setup' && (
                <form onSubmit={handleVerifyAndEnable2FA} className="space-y-4 animate-scale-in">
                  <div className="flex flex-col items-center p-4 bg-white rounded-2xl border-gradient-agro">
                    {twoFAUrl && <QRCodeSVG value={twoFAUrl} size={160} includeMargin />}
                    <span className="text-[10px] text-dark-800 font-bold font-mono mt-3 uppercase tracking-wide select-all cursor-pointer">
                      Clave manual: {twoFASecret}
                    </span>
                  </div>

                  <p className="text-xs text-dark-300">
                    Escanee el QR con su aplicación (o ingrese la clave manual). Luego ingrese el código temporal de 6 dígitos para confirmar activación:
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
                    onClick={() => { setTwoFAStep('none'); setTwoFACodeInput(''); setTwoFASecret(null); setTwoFAUrl(null); }}
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
                    Para desactivar el doble factor, confirme su contraseña e ingrese un código vigente de su aplicación:
                  </p>
                  <input
                    type="password"
                    value={twoFAPassword}
                    onChange={e => setTwoFAPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="Contraseña actual"
                    className="w-full py-2 px-3 bg-dark-900 border border-dark-655 rounded-xl text-white text-sm focus:outline-none"
                  />

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
                  min="0.5"
                  step="0.5"
                  required
                  value={manualOrderForm.quantity_tons}
                  onChange={e => setManualOrderForm(prev => ({ ...prev, quantity_tons: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none"
                />
              </div>

              <p className="col-span-2 text-[11px] text-dark-300 bg-dark-900 border border-dark-700 rounded-xl p-3">
                El flete, la cantidad de viajes y el total se calculan automáticamente en el servidor a partir de las coordenadas y el peso.
                Se descuenta el stock del producto.
              </p>

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
                    min="0"
                    step="0.01"
                    required
                    value={productForm.unit_price_ton}
                    onChange={e => setProductForm(prev => ({ ...prev, unit_price_ton: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-dark-300 uppercase mb-1">Stock Disponible (Tons)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={productForm.stock_tons}
                    onChange={e => setProductForm(prev => ({ ...prev, stock_tons: parseFloat(e.target.value) || 0 }))}
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
                  disabled={!!editingAdmin}
                  value={adminForm.email}
                  onChange={e => setAdminForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="admin-nuevo@ensilados.com"
                  className="w-full bg-dark-900 border border-dark-650 rounded-xl py-2 px-3 text-white text-sm focus:outline-none disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-300 uppercase mb-1">
                  {editingAdmin ? 'Contraseña (vacío para no cambiar)' : 'Contraseña de Acceso'}
                </label>
                <input
                  type="password"
                  required={!editingAdmin}
                  minLength={8}
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
                {stats.gainLossData.map((_entry, index) => (
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
                {stats.salesByProductData.map((_entry, index) => (
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
