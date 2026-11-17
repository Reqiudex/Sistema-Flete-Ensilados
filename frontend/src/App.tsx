import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { ArrowRight, Sprout, Tractor, Droplets, Wheat, Plane, Loader2 } from 'lucide-react';
import Header from './components/Header';
import Footer from './components/Footer';
import CatalogCart from './components/CatalogCart';
import ToastContainer from './components/ToastContainer';

// Vistas pesadas (PDF, QR, gráficos del panel) se descargan solo cuando se abren
const Confirmation = lazy(() => import('./components/Confirmation'));
const PagoQr = lazy(() => import('./components/PagoQr'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const AuthScreen = lazy(() => import('./components/AuthScreen'));

const TITULOS: Record<string, string> = {
  landing: 'Ensilados Santa Cruz | Silo de maíz, soya y sorgo con flete calculado',
  catalog: 'Catálogo y cotización de flete | Ensilados Santa Cruz',
  confirmation: 'Pedido registrado | Ensilados Santa Cruz',
  pago: 'Estado del pago | Ensilados Santa Cruz',
  admin: 'Administración | Ensilados Santa Cruz',
};

function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="py-24 flex items-center justify-center gap-2 text-gray-500 text-sm" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}
import { Product, CartItem, Order, UserProfile, Toast, NewOrderPayload, FleteQuote } from './types';
import * as api from './api';

export default function App() {
  // Retorno desde el checkout de la pasarela: /?pedido=ESC-1234 muestra el estado del pago de ese pedido
  const [pedidoRetorno, setPedidoRetorno] = useState<string | null>(() => {
    const c = new URLSearchParams(window.location.search).get('pedido')?.trim().toUpperCase() || '';
    return /^ESC-\d{3,10}$/.test(c) ? c : null;
  });
  const [currentView, setView] = useState<string>(() => (pedidoRetorno ? 'pago' : 'landing')); // landing, catalog, confirmation, pago, admin
  const [products, setProducts] = useState<Product[]>([]);
  const [productsOffline, setProductsOffline] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productsLoading, setProductsLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [submittedOrder, setSubmittedOrder] = useState<Order | null>(null);
  const [pagoInicial, setPagoInicial] = useState<api.PagoQr | null>(null);

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
    } finally {
      setProductsLoading(false);
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

  // Al cambiar de vista: volver arriba, mover el foco al contenido (teclado y lector de pantalla) y actualizar el título
  const mainRef = useRef<HTMLElement>(null);
  const primeraVista = useRef(true);
  useEffect(() => {
    document.title = TITULOS[currentView] || TITULOS.landing;
    if (primeraVista.current) { primeraVista.current = false; return; }
    window.scrollTo({ top: 0 });
    mainRef.current?.focus({ preventScroll: true });
  }, [currentView]);

  // El botón del carrito de la cabecera lleva al catálogo y muestra el carrito
  const irAlCarrito = () => {
    setView('catalog');
    window.setTimeout(() => document.getElementById('carrito')?.scrollIntoView({ block: 'start' }), 60);
  };

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
      const { order, enviado, pago } = await api.crearPedido(
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
      setPagoInicial(pago ?? null);
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
    setPagoInicial(null);
    if (pedidoRetorno) {
      setPedidoRetorno(null);
      window.history.replaceState(null, '', window.location.pathname);
    }
    setView('landing');
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-gray-50 text-gray-900">
      <a href="#contenido" className="saltar-contenido">Saltar al contenido</a>

      <Header
        currentView={currentView}
        setView={setView}
        onCartClick={irAlCarrito}
        cartCount={cart.reduce((sum, item) => sum + item.quantityTons, 0)}
        user={user}
        onLogout={handleLogout}
      />

      {/* Main Content Areas */}
      <main id="contenido" ref={mainRef} tabIndex={-1} className="flex-grow relative z-10 focus:outline-none">
        {currentView === 'landing' && (
          <div className="space-y-16 pb-16">
            
            {/* Hero Section */}
            <section className="relative overflow-hidden bg-agro-600 text-white py-24 sm:py-32 px-4 shadow-lg">
              {/* Decorative elements */}
              <div className="absolute inset-0 opacity-10" aria-hidden="true">
                <div className="absolute -top-10 -left-10 w-40 h-40 bg-white rounded-full blur-2xl"></div>
                <div className="absolute bottom-10 right-10 w-60 h-60 bg-agro-accent rounded-full blur-3xl"></div>
              </div>

              <div className="max-w-5xl mx-auto text-center space-y-6 relative z-10">
                <span className="inline-flex items-center gap-1.5 bg-agro-700 text-agro-accent font-extrabold text-xs uppercase tracking-widest px-4 py-2 rounded-full border border-agro-accent/20">
                  <Sprout className="h-4 w-4" aria-hidden="true" /> San Ramón · Santa Cruz, Bolivia
                </span>
                <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-tight font-sans">
                  Ensilados de Alta Calidad para su Ganadería
                </h1>
                <p className="text-agro-100 text-lg sm:text-xl max-w-2xl mx-auto font-light">
                  Silo de maíz, sorgo y soya puestos en su finca. Elija las toneladas, marque su propiedad en el mapa y vea al instante el costo del flete y el total.
                </p>
                <div className="pt-6 flex flex-col sm:flex-row justify-center items-center gap-4">
                  <button
                    onClick={() => setView('catalog')}
                    className="w-full sm:w-auto bg-agro-accent hover:bg-agro-accentHover text-agro-900 py-3.5 px-8 rounded-xl font-extrabold text-base transition-all shadow-md flex items-center justify-center space-x-2"
                  >
                    <span>Cotizar ensilado y flete</span>
                    <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => {
                      const element = document.getElementById('como-funciona');
                      element?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full sm:w-auto bg-agro-700 hover:bg-agro-800 text-white border border-white/30 py-3.5 px-8 rounded-xl font-semibold text-base transition-all"
                  >
                    Cómo funciona
                  </button>
                </div>
              </div>
            </section>

            {/* Quick Metrics */}
            <section className="max-w-6xl mx-auto px-4 -mt-10 sm:-mt-16 relative z-20">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 text-center space-y-2">
                  <p className="text-3xl font-extrabold text-agro-500">San Ramón</p>
                  <p className="text-xs text-gray-600 font-bold uppercase tracking-wider">Central de silos</p>
                  <p className="text-sm text-gray-600">Ubicación estratégica para distribuir en todo el departamento.</p>
                </div>
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 text-center space-y-2">
                  <p className="text-3xl font-extrabold text-agro-500">Flete al instante</p>
                  <p className="text-xs text-gray-600 font-bold uppercase tracking-wider">Según la distancia real</p>
                  <p className="text-sm text-gray-600">Marque su finca en el mapa y conozca el costo del transporte sin tener que llamar.</p>
                </div>
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 text-center space-y-2">
                  <p className="text-3xl font-extrabold text-agro-500">Funciona sin señal</p>
                  <p className="text-xs text-gray-600 font-bold uppercase tracking-wider">Pensado para el campo</p>
                  <p className="text-sm text-gray-600">Cotice con el catálogo guardado: su pedido se envía solo al volver la señal y puede descargar su comprobante en PDF.</p>
                </div>
              </div>
            </section>

            {/* Cómo funciona: los tres pasos del pedido */}
            <section id="como-funciona" aria-labelledby="titulo-como-funciona" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 scroll-mt-24">
              <div className="text-center max-w-2xl mx-auto space-y-2">
                <h2 id="titulo-como-funciona" className="text-3xl font-extrabold text-agro-600">Cómo hacer su pedido</h2>
                <p className="text-gray-600 text-sm">Tres pasos, desde el celular o la computadora.</p>
              </div>
              <ol className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { t: 'Elija el ensilado', d: 'Indique cuántas toneladas necesita de silo de maíz, sorgo o soya. Verá el precio por tonelada y el stock disponible.' },
                  { t: 'Marque su finca', d: 'Ubique su propiedad en el mapa. El sistema calcula la distancia desde San Ramón, los viajes de camión y el costo del flete.' },
                  { t: 'Confirme y pague', d: 'Deje su nombre y celular. Pague con QR desde su banco, por transferencia o coordine por WhatsApp. Descargue su comprobante.' },
                ].map((p, i) => (
                  <li key={p.t} className="bg-white rounded-2xl border border-gray-200 p-6 flex gap-4">
                    <span className="shrink-0 w-10 h-10 rounded-full bg-agro-500 text-white font-extrabold flex items-center justify-center" aria-hidden="true">{i + 1}</span>
                    <div>
                      <h3 className="font-extrabold text-gray-900 text-lg mb-1">{p.t}</h3>
                      <p className="text-gray-600 text-sm leading-relaxed">{p.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setView('catalog')}
                  className="inline-flex items-center gap-2 bg-agro-500 hover:bg-agro-600 text-white py-3 px-7 rounded-xl font-extrabold transition-colors"
                >
                  <span>Empezar mi pedido</span>
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </section>

            {/* Services Cards Section */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
              <div className="text-center max-w-2xl mx-auto space-y-2">
                <h2 className="text-3xl font-extrabold text-agro-600">Servicios Llave en Mano</h2>
                <p className="text-gray-600 text-sm">
                  Apoyamos al productor agropecuario de Santa Cruz en todas las etapas del ciclo de cultivo y colecta.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  {
                    title: 'Plantación y Siembra',
                    icon: <Tractor className="h-10 w-10 text-agro-500" aria-hidden="true" />,
                    desc: 'Maquinaria de siembra neumática de precisión para maíz, soya y sorgo, maximizando rendimiento por hectárea.'
                  },
                  {
                    title: 'Sistemas de Riego',
                    icon: <Droplets className="h-10 w-10 text-blue-400" aria-hidden="true" />,
                    desc: 'Instalación y monitoreo de pivotes y sistemas por goteo para contrarrestar sequías climáticas.'
                  },
                  {
                    title: 'Cosecha y Colecta',
                    icon: <Wheat className="h-10 w-10 text-gold-400" aria-hidden="true" />,
                    desc: 'Cosecha mecanizada ultra-rápida, picado de forraje de calidad y ensilado compacto in-situ o traslado.'
                  },
                  {
                    title: 'Fumigación de Cultivos',
                    icon: <Plane className="h-10 w-10 text-gray-500" aria-hidden="true" />,
                    desc: 'Control de plagas terrestre y aéreo con drones avanzados para coberturas uniformes y ecológicas.'
                  }
                ].map((srv, idx) => (
                  <div key={idx} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
                    <div className="mb-4">{srv.icon}</div>
                    <h3 className="font-extrabold text-gray-800 text-lg mb-2">{srv.title}</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">{srv.desc}</p>
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
            productsLoading={productsLoading}
            onRetryProducts={() => { setProductsLoading(true); loadProducts(); }}
            productsOffline={productsOffline}
            productsError={productsError}
            cart={cart}
            addToCart={addToCart}
            removeFromCart={removeFromCart}
            updateCartQty={updateCartQty}
            onSubmitOrder={handleSubmitOrder}
          />
        )}

        <Suspense fallback={<Cargando />}>
        {currentView === 'confirmation' && submittedOrder && (
          <Confirmation
            order={submittedOrder}
            pago={pagoInicial}
            onBackToStart={handleBackToStart}
          />
        )}

        {currentView === 'pago' && pedidoRetorno && (
          <section className="max-w-xl mx-auto px-4 py-12 space-y-6" aria-labelledby="titulo-estado-pago">
            <div className="text-center space-y-1">
              <h1 id="titulo-estado-pago" className="text-2xl font-extrabold text-gray-900">Pedido {pedidoRetorno}</h1>
              <p className="text-sm text-gray-600">Estado del pago por QR</p>
            </div>
            <PagoQr codigo={pedidoRetorno} />
            <button type="button" onClick={handleBackToStart} className="w-full text-sm font-bold text-agro-600 underline">
              Volver al inicio
            </button>
          </section>
        )}

        {currentView === 'admin' && (
          !sessionChecked ? (
            <Cargando texto="Verificando sesión…" />
          ) : user && token ? (
            // El panel usa tarjetas translúcidas pensadas para fondo oscuro: se le da su propio fondo
            <div className="bg-dark-950 text-white">
              <AdminDashboard
                user={user}
                onLogout={handleLogout}
                onSessionExpired={() => { clearSession(); addToast({ type: 'warning', title: 'Sesión expirada', message: 'Inicie sesión nuevamente.' }); }}
                addToast={addToast}
              />
            </div>
          ) : (
            <AuthScreen
              onLogin={handleLogin}
              addToast={addToast}
            />
          )
        )}
        </Suspense>
      </main>

      <Footer />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
