import { useState, useEffect, useCallback } from 'react';
import { ArrowRight, Sprout, Tractor, Droplets, Wheat, Plane } from 'lucide-react';
import Header from './components/Header';
import Footer from './components/Footer';
import CatalogCart from './components/CatalogCart';
import Confirmation from './components/Confirmation';
import AdminDashboard from './components/AdminDashboard';
import AuthScreen from './components/AuthScreen';
import ToastContainer from './components/ToastContainer';
import { Product, CartItem, Order, UserProfile, Toast, NewOrderPayload, FleteQuote } from './types';
import * as api from './api';

export default function App() {
  const [currentView, setView] = useState<string>('landing'); // landing, catalog, confirmation, admin
  const [products, setProducts] = useState<Product[]>([]);
  const [productsOffline, setProductsOffline] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [submittedOrder, setSubmittedOrder] = useState<Order | null>(null);

  // Sesión de administrador: el token se valida con el servidor (GET /api/auth/me) al cargar
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(() => api.obtenerToken());
  const [sessionChecked, setSessionChecked] = useState(() => !api.obtenerToken());

  // Toasts state
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { ...toast, id }]);
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const clearSession = () => {
    setUser(null);
    setToken(null);
    try { localStorage.removeItem(api.CLAVE_TOKEN); } catch { /* sin almacenamiento */ }
  };

  const handleLogin = (newUser: UserProfile, newToken: string) => {
    try { localStorage.setItem(api.CLAVE_TOKEN, newToken); } catch { /* sin almacenamiento */ }
    setUser(newUser);
    setToken(newToken);
    setView('admin');
  };

  const handleLogout = () => {
    clearSession();
    setView('landing');
    addToast({ type: 'info', title: 'Sesión Cerrada', message: 'Ha salido del panel de administración.' });
  };

  // Restaurar y validar la sesión guardada
  useEffect(() => {
    if (!api.obtenerToken()) return;
    api.perfil()
      .then(setUser)
      .catch((err) => {
        if (err instanceof api.ApiError && !err.isNetwork) clearSession();
      })
      .finally(() => setSessionChecked(true));
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const { productos, desdeCache } = await api.obtenerProductos();
      setProducts(productos);
      setProductsOffline(desdeCache);
      setProductsError(null);
    } catch (err) {
      setProductsError(api.mensajeError(err, 'No se pudo cargar el catálogo.'));
    }
  }, []);

  // Cargar catálogo y sincronizar pedidos guardados sin conexión
  const sincronizar = useCallback(async () => {
    if (api.pedidosPendientes().length === 0) return;
    const { enviados, rechazados } = await api.sincronizarPedidos();
    if (enviados.length > 0) {
      addToast({
        type: 'success',
        title: 'Pedidos enviados',
        message: enviados.map(o => o.order_code).join(', ') + ' registrados correctamente.',
      });
      loadProducts();
    }
    rechazados.forEach(r =>
      addToast({ type: 'warning', title: `Pedido de ${r.nombre} no registrado`, message: r.motivo })
    );
  }, [addToast, loadProducts]);

  useEffect(() => {
    loadProducts();
    sincronizar();
    const alVolverRed = () => { loadProducts(); sincronizar(); };
    window.addEventListener('online', alVolverRed);
    return () => window.removeEventListener('online', alVolverRed);
  }, [loadProducts, sincronizar]);

  // Cart operations
  const addToCart = (product: Product, qty: number) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantityTons: Math.round((item.quantityTons + qty) * 100) / 100 }
            : item
        );
      }
      return [...prev, { product, quantityTons: qty }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateCartQty = (productId: string, qty: number) => {
    setCart(prev =>
      prev.map(item =>
        item.product.id === productId ? { ...item, quantityTons: qty } : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  // Enviar pedido: el servidor recalcula precios, flete y totales y descuenta el stock.
  // Devuelve null si todo salió bien o un mensaje de error para mostrar en el formulario.
  const handleSubmitOrder = async (data: NewOrderPayload, quote: FleteQuote | null): Promise<string | null> => {
    try {
      const { order, enviado } = await api.crearPedido(
        data,
        cart.map(i => ({
          product_id: i.product.id,
          quantity_tons: i.quantityTons,
          name: i.product.name,
          unit_price_ton: i.product.unit_price_ton,
        })),
        quote,
      );
      setSubmittedOrder(order);
      clearCart();
      setView('confirmation');
      if (enviado) loadProducts();
      else addToast({
        type: 'warning',
        title: 'Sin conexión',
        message: 'Su pedido quedó guardado en este dispositivo y se enviará automáticamente al volver la conexión.',
      });
      return null;
    } catch (err) {
      if (err instanceof api.ApiError && err.code === 'STOCK_INSUFICIENTE') loadProducts();
      return api.mensajeError(err, 'No se pudo registrar el pedido.');
    }
  };

  const handleBackToStart = () => {
    setSubmittedOrder(null);
    setView('landing');
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-gray-50/50">
      
      <Header
        currentView={currentView}
        setView={setView}
        cartCount={cart.reduce((sum, item) => sum + item.quantityTons, 0)}
        user={user}
        onLogout={handleLogout}
      />

      {/* Main Content Areas */}
      <main className="flex-grow relative z-10">
        {currentView === 'landing' && (
          <div className="space-y-16 pb-16">
            
            {/* Hero Section */}
            <section className="relative overflow-hidden bg-agro-600 text-white py-24 sm:py-32 px-4 shadow-lg">
              {/* Decorative elements */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute -top-10 -left-10 w-40 h-40 bg-white rounded-full blur-2xl"></div>
                <div className="absolute bottom-10 right-10 w-60 h-60 bg-agro-accent rounded-full blur-3xl animate-pulse"></div>
              </div>

              <div className="max-w-5xl mx-auto text-center space-y-6 relative z-10">
                <span className="inline-flex items-center gap-1.5 bg-agro-500/50 text-agro-accent font-extrabold text-xs uppercase tracking-widest px-4 py-2 rounded-full border border-agro-accent/20">
                  <Sprout className="h-4 w-4" /> Logística Agrícola Digital en Santa Cruz
                </span>
                <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-tight font-sans">
                  Ensilados de Alta Calidad para su Ganadería
                </h1>
                <p className="text-agro-100 text-lg sm:text-xl max-w-2xl mx-auto font-light">
                  Suministro garantizado de Silo de Maíz, Soya y Sorgo. Cotice automáticamente el costo de envío geolocalizando su finca en tiempo real.
                </p>
                <div className="pt-6 flex flex-col sm:flex-row justify-center items-center gap-4">
                  <button
                    onClick={() => setView('catalog')}
                    className="w-full sm:w-auto bg-agro-accent hover:bg-agro-accentHover text-agro-900 py-3.5 px-8 rounded-xl font-extrabold text-base transition-all shadow-md flex items-center justify-center space-x-2"
                  >
                    <span>Cotizar Ensilado y Flete</span>
                    <ArrowRight className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => {
                      const element = document.getElementById('about');
                      element?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white border border-white/20 py-3.5 px-8 rounded-xl font-semibold text-base transition-all"
                  >
                    Conocer Más
                  </button>
                </div>
              </div>
            </section>

            {/* Quick Metrics */}
            <section className="max-w-6xl mx-auto px-4 -mt-10 sm:-mt-16 relative z-20">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 text-center space-y-2">
                  <div className="text-3xl font-extrabold text-agro-500">San Ramón</div>
                  <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block">Central de Silos</span>
                  <p className="text-sm text-gray-500">Ubicación estratégica para distribución departamental.</p>
                </div>
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 text-center space-y-2">
                  <div className="text-3xl font-extrabold text-agro-500">SIG Integrado</div>
                  <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block">Cálculo Preciso</span>
                  <p className="text-sm text-gray-500">Adiós a las llamadas infinitas. Flete matemático según distancia real.</p>
                </div>
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 text-center space-y-2">
                  <div className="text-3xl font-extrabold text-agro-500">Modo Offline</div>
                  <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block">Resiliencia Rural</span>
                  <p className="text-sm text-gray-500">Cotice con el catálogo guardado, su pedido se envía solo al volver la señal y puede descargar su recibo PDF.</p>
                </div>
              </div>
            </section>

            {/* Services Cards Section */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
              <div className="text-center max-w-2xl mx-auto space-y-2">
                <h2 className="text-3xl font-extrabold text-agro-600">Servicios Llave en Mano</h2>
                <p className="text-gray-500 text-sm">
                  Apoyamos al productor agropecuario de Santa Cruz en todas las etapas del ciclo de cultivo y colecta.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  {
                    title: 'Plantación y Siembra',
                    icon: <Tractor className="h-10 w-10 text-agro-500" />,
                    desc: 'Maquinaria de siembra neumática de precisión para maíz, soya y sorgo, maximizando rendimiento por hectárea.'
                  },
                  {
                    title: 'Sistemas de Riego',
                    icon: <Droplets className="h-10 w-10 text-blue-400" />,
                    desc: 'Instalación y monitoreo de pivotes y sistemas por goteo para contrarrestar sequías climáticas.'
                  },
                  {
                    title: 'Cosecha y Colecta',
                    icon: <Wheat className="h-10 w-10 text-gold-400" />,
                    desc: 'Cosecha mecanizada ultra-rápida, picado de forraje de calidad y ensilado compacto in-situ o traslado.'
                  },
                  {
                    title: 'Fumigación de Cultivos',
                    icon: <Plane className="h-10 w-10 text-gray-500" />,
                    desc: 'Control de plagas terrestre y aéreo con drones avanzados para coberturas uniformes y ecológicas.'
                  }
                ].map((srv, idx) => (
                  <div key={idx} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
                    <div className="mb-4">{srv.icon}</div>
                    <h3 className="font-extrabold text-gray-800 text-lg mb-2">{srv.title}</h3>
                    <p className="text-gray-500 text-xs leading-relaxed">{srv.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Institutional Section: History, Mission, Vision */}
            <section id="about" className="bg-gray-900 text-white py-16 scroll-mt-20">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  
                  <div className="space-y-4 bg-white/5 p-8 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors">
                    <h3 className="text-xl font-extrabold text-agro-accent">Nuestra Historia</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      Nacimos en el corazón productivo de San Ramón con el firme propósito de suplir de forraje nutritivo a la ganadería de Santa Cruz durante el invierno y épocas secas. Con los años incorporamos tecnología SIG para erradicar las ineficiencias de distribución logística.
                    </p>
                  </div>

                  <div className="space-y-4 bg-white/5 p-8 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors">
                    <h3 className="text-xl font-extrabold text-agro-accent">Misión</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      Proveer alimento balanceado de alta gama de manera ágil e inteligente, contribuyendo al desarrollo sostenible de las propiedades ganaderas y agrícolas del oriente boliviano mediante herramientas digitales accesibles al productor.
                    </p>
                  </div>

                  <div className="space-y-4 bg-white/5 p-8 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors">
                    <h3 className="text-xl font-extrabold text-agro-accent">Visión</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      Consolidarnos en 2030 como la principal red automatizada de acopio y distribución de silos en Santa Cruz, liderando la transición agro-tecnológica mediante plataformas descentralizadas de geolocalización y resiliencia offline.
                    </p>
                  </div>

                </div>
              </div>
            </section>

          </div>
        )}

        {currentView === 'catalog' && (
          <CatalogCart
            products={products}
            productsOffline={productsOffline}
            productsError={productsError}
            cart={cart}
            addToCart={addToCart}
            removeFromCart={removeFromCart}
            updateCartQty={updateCartQty}
            onSubmitOrder={handleSubmitOrder}
          />
        )}

        {currentView === 'confirmation' && submittedOrder && (
          <Confirmation
            order={submittedOrder}
            onBackToStart={handleBackToStart}
          />
        )}

        {currentView === 'admin' && (
          !sessionChecked ? (
            <div className="py-24 text-center text-gray-400 text-sm">Verificando sesión...</div>
          ) : user && token ? (
            <AdminDashboard
              user={user}
              onLogout={handleLogout}
              onSessionExpired={() => { clearSession(); addToast({ type: 'warning', title: 'Sesión expirada', message: 'Inicie sesión nuevamente.' }); }}
              addToast={addToast}
            />
          ) : (
            <AuthScreen
              onLogin={handleLogin}
              addToast={addToast}
            />
          )
        )}
      </main>

      <Footer />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
