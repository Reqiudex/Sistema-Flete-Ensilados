import React, { useEffect, useRef, useState } from 'react';
import { ShoppingBag, ArrowRight, Trash2, ShieldCheck, ShoppingCart, User, Phone, CheckCircle2, Wheat, Sprout, MapPin, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { Product, CartItem, NewOrderPayload, FleteQuote } from '../types';
import { obtenerParametros, PARAMETROS_POR_DEFECTO, telefonoValido } from '../api';
import MapComponent from './MapComponent';

interface CatalogCartProps {
  products: Product[];
  cart: CartItem[];
  addToCart: (product: Product, qty: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQty: (productId: string, qty: number) => void;
  productsOffline?: boolean;
  productsError?: string | null;
  /** true mientras se carga el catálogo por primera vez */
  productsLoading?: boolean;
  /** Reintenta la carga del catálogo */
  onRetryProducts?: () => void;
  /** Devuelve null si se registró bien o el mensaje de error a mostrar. */
  onSubmitOrder: (orderData: NewOrderPayload, quote: FleteQuote | null) => Promise<string | null>;
}

const bs = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString('es-BO', { maximumFractionDigits: 2 });
/** "1 tonelada", "2,5 toneladas" */
const toneladas = (n: number) => `${num(n)} ${n === 1 ? 'tonelada' : 'toneladas'}`;

const PASOS = [
  { id: 'catalog', corto: 'Productos', largo: 'Elegir productos' },
  { id: 'terms', corto: 'Términos', largo: 'Términos' },
  { id: 'checkout', corto: 'Entrega', largo: 'Datos y ubicación' },
] as const;

export default function CatalogCart({
  products,
  cart,
  addToCart,
  removeFromCart,
  updateCartQty,
  productsOffline = false,
  productsError = null,
  productsLoading = false,
  onRetryProducts,
  onSubmitOrder,
}: CatalogCartProps) {
  const [step, setStep] = useState<'catalog' | 'terms' | 'checkout'>('catalog');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'QR' | 'Transferencia' | 'WhatsApp'>('QR');

  // Geolocation and flete details state
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [fleteCost, setFleteCost] = useState<number>(0);
  const [distance, setDistance] = useState<number>(0);
  const [calcSource, setCalcSource] = useState<'google' | 'haversine'>('haversine');
  const [isCalculating, setIsCalculating] = useState(false);
  const [trips, setTrips] = useState<number>(1);
  const [quote, setQuote] = useState<FleteQuote | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [minWeight, setMinWeight] = useState<number>(PARAMETROS_POR_DEFECTO.peso_minimo_tons);
  // El pago QR solo se ofrece si el servidor tiene la pasarela configurada (sin dato, se asume disponible)
  const [qrDisponible, setQrDisponible] = useState(true);
  // Solo interfaz: indica si el cliente ya marcó su finca (el marcador empieza en un punto por defecto)
  const [ubicacionMarcada, setUbicacionMarcada] = useState(false);
  // Aviso visible y anunciado al agregar un producto
  const [avisoAgregado, setAvisoAgregado] = useState<string | null>(null);
  const tituloPaso = useRef<HTMLHeadingElement>(null);
  const primerPaso = useRef(true);

  useEffect(() => {
    obtenerParametros().then(p => {
      setMinWeight(p.peso_minimo_tons);
      if (p.pagos_qr === false) {
        setQrDisponible(false);
        setPaymentMethod(m => (m === 'QR' ? 'Transferencia' : m));
      }
    });
  }, []);

  // Al cambiar de paso: volver arriba y llevar el foco al título del paso
  useEffect(() => {
    if (primerPaso.current) { primerPaso.current = false; return; }
    window.scrollTo({ top: 0 });
    tituloPaso.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    if (!avisoAgregado) return undefined;
    const t = window.setTimeout(() => setAvisoAgregado(null), 4000);
    return () => window.clearTimeout(t);
  }, [avisoAgregado]);

  // Temporary quantity values for product cards
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const cartTotalWeight = cart.reduce((sum, item) => sum + item.quantityTons, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.quantityTons * item.product.unit_price_ton, 0);
  const totalAmount = Math.round((cartSubtotal + fleteCost) * 100) / 100;

  const handleQtyChange = (productId: string, val: string) => {
    const num = parseFloat(val);
    setQuantities(prev => ({
      ...prev,
      [productId]: isNaN(num) ? 0 : num
    }));
  };

  const handleAddToCartClick = (product: Product) => {
    const qty = quantities[product.id] !== undefined ? quantities[product.id] : 1;
    const enCarrito = cart.find(i => i.product.id === product.id)?.quantityTons || 0;
    if (!(qty > 0)) { setFormError('Ingrese una cantidad mayor a 0 toneladas.'); return; }
    if (enCarrito + qty > product.stock_tons) {
      setFormError(`Solo hay ${product.stock_tons} TM disponibles de ${product.name}.`);
      return;
    }
    setFormError(null);
    addToCart(product, qty);
    setAvisoAgregado(`Agregado: ${toneladas(qty)} de ${product.name}.`);
    // Reset temporary quantity to 1 after adding
    setQuantities(prev => ({ ...prev, [product.id]: 1 }));
  };

  const handleFleteCalculated = (q: FleteQuote) => {
    setFleteCost(q.shipping_cost);
    setDistance(q.distance_km);
    setCalcSource(q.source);
    setTrips(q.trips);
    setQuote(q);
    setFormError(null);
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (customerName.trim().length < 3) {
      setFormError('Ingrese su nombre completo (mínimo 3 caracteres).');
      document.getElementById('cliente-nombre')?.focus();
      return;
    }
    if (!telefonoValido(customerPhone)) {
      setFormError('Ingrese un número válido: celular de 8 dígitos (ej. 78945612) o fijo de 7 dígitos.');
      document.getElementById('cliente-celular')?.focus();
      return;
    }
    if (cartTotalWeight < minWeight) {
      setFormError(`El pedido mínimo es de ${minWeight} toneladas.`);
      return;
    }
    if (!selectedCoords) {
      setFormError('Arrastre el marcador en el mapa para ubicar su propiedad rural.');
      return;
    }

    setFormError(null);
    setSubmitting(true);
    const error = await onSubmitOrder(
      { customerName: customerName.trim(), customerPhone, lat: selectedCoords.lat, lng: selectedCoords.lng, paymentMethod },
      quote
    );
    setSubmitting(false);
    if (error) setFormError(error);
  };

  // Helper product illustrations/badges
  const getProductIcon = (name: string) => {
    if (name.toLowerCase().includes('maíz') || name.toLowerCase().includes('maiz')) {
      return <Wheat className="h-10 w-10 text-yellow-600" aria-hidden="true" />;
    }
    if (name.toLowerCase().includes('soya')) {
      return <Sprout className="h-10 w-10 text-green-600" aria-hidden="true" />;
    }
    return <Wheat className="h-10 w-10 text-orange-500" aria-hidden="true" />;
  };

  const pasoHabilitado = (id: typeof PASOS[number]['id']) =>
    id === 'catalog' || (cart.length > 0 && (id === 'terms' || acceptedTerms));
  const errorNombre = formError?.startsWith('Ingrese su nombre');
  const errorTelefono = formError?.startsWith('Ingrese un número');

  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${step === 'catalog' && cart.length > 0 ? 'pb-28 lg:pb-8' : ''}`}>
      {/* Indicador de pasos */}
      <nav aria-label="Pasos del pedido" className="mb-8">
        <ol className="flex justify-center items-center gap-1 sm:gap-4">
          {PASOS.map((p, i) => {
            const activo = step === p.id;
            const habilitado = pasoHabilitado(p.id);
            return (
              <li key={p.id} className="flex items-center gap-1 sm:gap-4">
                {i > 0 && <span className="h-0.5 w-3 sm:w-12 bg-gray-300" aria-hidden="true" />}
                <button
                  type="button"
                  disabled={!habilitado}
                  onClick={() => setStep(p.id)}
                  aria-current={activo ? 'step' : undefined}
                  className={`flex items-center gap-1 sm:gap-2 text-[13px] sm:text-sm font-bold pb-2 border-b-2 transition-colors min-h-[44px] ${
                    activo ? 'border-agro-500 text-agro-600' : 'border-transparent text-gray-600 hover:text-gray-900'
                  } ${habilitado ? '' : 'opacity-50 cursor-not-allowed'}`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${activo ? 'bg-agro-500 text-white' : 'bg-agro-100 text-agro-600'}`}>{i + 1}</span>
                  <span className="sm:hidden">{p.corto}</span>
                  <span className="hidden sm:inline">{p.largo}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {step === 'catalog' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Catalog grid */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h1 ref={tituloPaso} tabIndex={-1} className="text-2xl font-extrabold text-agro-600 focus:outline-none">Catálogo de ensilados</h1>
              <p className="text-sm text-gray-600 mt-1">Indique las toneladas y agréguelas al carrito. Pedido mínimo: {toneladas(minWeight)}.</p>
            </div>
            {productsOffline && (
              <p className="text-sm bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-lg p-3" role="status">
                Sin conexión: se muestra el último catálogo guardado. Precios y disponibilidad se confirman al enviar el pedido.
              </p>
            )}
            {formError && step === 'catalog' && (
              <p className="text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg p-3" role="alert">{formError}</p>
            )}
            <p className="sr-only" role="status" aria-live="polite">{avisoAgregado ?? ''}</p>

            {products.length === 0 ? (
              productsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6" aria-busy="true">
                  <p className="sr-only" role="status">Cargando catálogo…</p>
                  {[0, 1].map(i => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 animate-pulse" aria-hidden="true">
                      <div className="h-16 w-16 bg-gray-200 rounded-2xl" />
                      <div className="h-5 w-1/2 bg-gray-200 rounded" />
                      <div className="h-4 w-full bg-gray-100 rounded" />
                      <div className="h-4 w-3/4 bg-gray-100 rounded" />
                      <div className="h-10 w-full bg-gray-100 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-3">
                  <AlertTriangle className="h-10 w-10 mx-auto text-amber-500" aria-hidden="true" />
                  <h2 className="font-bold text-gray-900 text-lg">
                    {productsError ? 'No pudimos cargar el catálogo' : 'No hay productos disponibles por ahora'}
                  </h2>
                  <p className="text-sm text-gray-600 max-w-md mx-auto">
                    {productsError
                      ? `${productsError} Revise su conexión e intente de nuevo.`
                      : 'Vuelva a intentarlo más tarde o consúltenos por WhatsApp.'}
                  </p>
                  {onRetryProducts && (
                    <button
                      type="button"
                      onClick={onRetryProducts}
                      className="inline-flex items-center gap-2 bg-agro-500 hover:bg-agro-600 text-white py-2.5 px-5 rounded-xl font-bold text-sm"
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      <span>Reintentar</span>
                    </button>
                  )}
                </div>
              )
            ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {products.map((product) => {
                const tempQty = quantities[product.id] !== undefined ? quantities[product.id] : 1;
                const enCarrito = cart.find(i => i.product.id === product.id)?.quantityTons || 0;
                const idCantidad = `cantidad-${product.id}`;
                return (
                  <li
                    key={product.id}
                    className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow duration-300 flex flex-col justify-between"
                  >
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div className="bg-agro-50 p-3 rounded-2xl">
                          {getProductIcon(product.name)}
                        </div>
                        {enCarrito > 0 && (
                          <span className="bg-agro-100 text-agro-700 text-xs font-bold px-3 py-1 rounded-full inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            {num(enCarrito)} t en el carrito
                          </span>
                        )}
                      </div>
                      <h2 className="text-xl font-bold text-gray-900 mb-1">{product.name}</h2>
                      <p className="text-gray-600 text-sm mb-4">{product.description}</p>

                      <div className="flex justify-between items-baseline mb-4">
                        <span className="text-sm text-gray-600">Precio por tonelada</span>
                        <span className="text-2xl font-extrabold text-agro-500">{num(product.unit_price_ton)} Bs</span>
                      </div>

                      <div className="border-t border-gray-100 pt-4 flex justify-between items-center text-sm text-gray-600">
                        <span>Disponible en planta</span>
                        <span className="font-bold text-gray-800">{toneladas(product.stock_tons)}</span>
                      </div>
                    </div>

                    <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-end gap-3">
                      <div className="w-1/3">
                        <label htmlFor={idCantidad} className="block text-xs font-bold text-gray-600 mb-1">Toneladas</label>
                        <input
                          id={idCantidad}
                          type="number"
                          inputMode="decimal"
                          min={minWeight}
                          step="0.5"
                          max={product.stock_tons}
                          value={tempQty === 0 ? '' : tempQty}
                          onChange={(e) => handleQtyChange(product.id, e.target.value)}
                          className="w-full text-center py-2.5 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-agro-400 text-base font-semibold"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddToCartClick(product)}
                        aria-label={`Agregar ${product.name} al carrito`}
                        className="flex-1 bg-agro-500 hover:bg-agro-600 text-white py-3 px-4 rounded-lg font-bold text-sm transition-colors shadow-md flex justify-center items-center gap-1"
                      >
                        <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                        <span>Agregar</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            )}
          </div>

          {/* Cart Sidebar */}
          <section id="carrito" aria-labelledby="titulo-carrito" className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 self-start space-y-6 scroll-mt-24 lg:sticky lg:top-24">
            <div className="flex items-center gap-2 pb-4 border-b border-gray-100">
              <ShoppingBag className="h-6 w-6 text-agro-500" aria-hidden="true" />
              <h2 id="titulo-carrito" className="text-xl font-bold text-gray-800">Su carrito</h2>
            </div>

            {cart.length === 0 ? (
              <div className="py-8 text-center text-gray-600 space-y-3">
                <ShoppingCart className="h-12 w-12 mx-auto stroke-1 text-gray-400" aria-hidden="true" />
                <p className="text-sm">El carrito está vacío. Agregue toneladas de ensilado para cotizar.</p>
              </div>
            ) : (
              <>
                <ul className="space-y-4">
                  {cart.map((item) => {
                    const idCarrito = `carrito-${item.product.id}`;
                    return (
                    <li key={item.product.id} className="flex justify-between items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm text-gray-800">{item.product.name}</h3>
                        <span className="text-xs text-gray-600">{num(item.product.unit_price_ton)} Bs por tonelada</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label htmlFor={idCarrito} className="sr-only">Toneladas de {item.product.name}</label>
                        <input
                          id={idCarrito}
                          type="number"
                          inputMode="decimal"
                          min={minWeight}
                          step="0.5"
                          max={item.product.stock_tons}
                          value={item.quantityTons}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val > 0) {
                              updateCartQty(item.product.id, Math.min(val, item.product.stock_tons));
                            }
                          }}
                          className="w-16 text-center py-1.5 border border-gray-400 rounded text-sm font-bold focus:outline-none focus:ring-2 focus:ring-agro-400"
                        />
                        <span className="text-xs text-gray-600 font-semibold" aria-hidden="true">t</span>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.product.id)}
                          aria-label={`Quitar ${item.product.name} del carrito`}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg p-2"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                    );
                  })}
                </ul>

                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Peso total</span>
                    <span className="font-bold text-gray-800">{toneladas(cartTotalWeight)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-gray-800">
                    <span>Subtotal del producto</span>
                    <span>{bs(cartSubtotal)} Bs</span>
                  </div>
                  {cartTotalWeight < minWeight && (
                    <p className="text-sm text-red-700">Pedido mínimo: {toneladas(minWeight)}.</p>
                  )}
                  <p className="text-xs text-gray-700 bg-agro-50 p-2.5 rounded-lg border border-agro-100 flex items-start gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-agro-500 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>El flete desde los silos de San Ramón se calcula en el paso 3, cuando marque su finca en el mapa.</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setStep('terms')}
                  className="w-full bg-agro-500 hover:bg-agro-600 text-white py-3 rounded-xl font-bold text-base transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                  <span>Continuar</span>
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            )}
          </section>

          {/* Barra fija en móvil: resumen del carrito siempre a la vista */}
          {cart.length > 0 && (
            <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-4 py-3">
              {avisoAgregado && (
                <p className="text-xs font-bold text-agro-700 mb-1.5 flex items-center gap-1" aria-hidden="true">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {avisoAgregado}
                </p>
              )}
              <div className="flex items-center justify-between gap-3 max-w-xl mx-auto">
                <a href="#carrito" className="min-w-0 text-left underline-offset-2 hover:underline">
                  <span className="block text-xs text-gray-600">{toneladas(cartTotalWeight)} · ver carrito</span>
                  <span className="block font-extrabold text-gray-900">{bs(cartSubtotal)} Bs</span>
                </a>
                <button
                  type="button"
                  onClick={() => setStep('terms')}
                  className="shrink-0 bg-agro-500 hover:bg-agro-600 text-white py-3 px-5 rounded-xl font-bold text-sm flex items-center gap-1.5"
                >
                  <span>Continuar</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

        </div>
      ) : step === 'terms' ? (
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8 space-y-6">
          <div className="text-center space-y-1">
            <h1 ref={tituloPaso} tabIndex={-1} className="text-2xl font-extrabold text-agro-600 focus:outline-none">Términos y condiciones de uso</h1>
            <p className="text-sm text-gray-600">Léalos y acéptelos para continuar con la ubicación de su finca.</p>
          </div>

          <div
            tabIndex={0}
            role="region"
            aria-label="Texto de los términos y condiciones"
            className="max-h-[50vh] md:h-96 overflow-y-auto pr-4 space-y-4 text-sm text-gray-700 border border-gray-200 rounded-xl p-4 md:p-6 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-agro-400"
          >
            <div>
              <h2 className="font-bold text-gray-800 text-base mb-2">A. Marco legal sobre tecnologías de información y protección de datos</h2>
              <p className="mb-2">De acuerdo a la Ley N.º 164 (Ley General de Telecomunicaciones, Tecnologías de Información y Comunicación) del Estado Plurinacional de Bolivia, los códigos de pedido generados por la plataforma son registros internos y no constituyen documentos fiscales ni comprobantes tributarios.</p>
              <p>Conforme a la Constitución Política del Estado, garantizamos la protección y privacidad de sus datos. La información de geolocalización obtenida mediante Google Maps será utilizada únicamente para determinar distancias y estimar costos de transporte logístico. El sistema no realiza seguimiento permanente de la ubicación del usuario.</p>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <h2 className="font-bold text-gray-800 text-base mb-2">B. Naturaleza jurídica de la cotización y exclusión tributaria</h2>
              <p className="mb-2">Los valores generados por el sistema corresponden a <strong>estimaciones operativas referenciales</strong> destinadas a facilitar la determinación del costo de transporte. <strong>No representan una factura electrónica ni un documento tributario reconocido por el Servicio de Impuestos Nacionales (SIN).</strong></p>
              <p>La plataforma se limita al cálculo logístico considerando variables operativas (distancia, peso, etc). La emisión del documento fiscal definitivo (con IVA, IT u otros gravámenes) se realizará posteriormente mediante los mecanismos administrativos y contables establecidos por Ensilados Santa Cruz, de forma externa al sistema.</p>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <h2 className="font-bold text-gray-800 text-base mb-2">C. Consideraciones del Sistema y Variabilidad Logística</h2>
              <p className="mb-2">El cálculo del flete generado por el sistema corresponde a una estimación basada en distancia y rutas disponibles. <strong>Factores externos</strong> como condiciones climáticas, bloqueos, estado de los caminos o modificaciones forzosas en la ruta pueden generar variaciones en el costo final del servicio de transporte en el momento de la entrega.</p>
              <p><strong>Consentimiento para uso de ubicación:</strong> Al proporcionar su ubicación mediante el mapa integrado en el siguiente paso, el usuario acepta de forma expresa que sus coordenadas sean utilizadas exclusivamente para el propósito de calcular el costo de transporte y gestionar la entrega de su pedido.</p>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <h2 className="font-bold text-gray-800 text-base mb-2">D. Pagos digitales y normativa financiera</h2>
              <p>El sistema no procesa tarjetas ni débitos automáticos ni guarda datos bancarios. El pago por QR se realiza desde la aplicación de su banco con el QR de la empresa: usted paga el monto exacto indicado (con centavos) y la confirmación llega de forma automática al conciliarse el depósito. También puede pagar por transferencia, en efectivo o coordinarlo por WhatsApp; esos pagos los verifica el personal administrativo. Todo conforme a la normativa financiera vigente (ASFI) aplicable a operaciones comerciales.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-agro-50 p-4 rounded-xl border border-agro-100">
            <input
              type="checkbox"
              id="accept-terms"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 h-6 w-6 shrink-0 rounded border-gray-400 text-agro-500 focus:ring-agro-400 focus:ring-offset-0 cursor-pointer accent-agro-500"
            />
            <label htmlFor="accept-terms" className="text-sm font-medium text-gray-800 cursor-pointer leading-snug">
              He leído y acepto los términos de uso, exclusión tributaria de la cotización, y doy mi consentimiento para compartir mi ubicación exclusivamente para el cálculo del flete logístico según la normativa boliviana.
            </label>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-between pt-2 gap-3 sm:gap-0">
            <button
              type="button"
              onClick={() => setStep('catalog')}
              className="px-6 py-3 border border-gray-400 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-colors text-center"
            >
              Volver al catálogo
            </button>
            <button
              type="button"
              disabled={!acceptedTerms}
              onClick={() => setStep('checkout')}
              aria-describedby={acceptedTerms ? undefined : 'ayuda-terminos'}
              className={`px-8 py-3 rounded-xl font-extrabold transition-colors flex items-center justify-center gap-2 ${
                acceptedTerms ? 'bg-agro-500 hover:bg-agro-600 text-white shadow-md' : 'bg-gray-200 text-gray-600 cursor-not-allowed'
              }`}
            >
              <span>Continuar a la ubicación</span>
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          {!acceptedTerms && (
            <p id="ayuda-terminos" className="text-xs text-gray-600 text-center sm:text-right -mt-3">Marque la casilla de aceptación para continuar.</p>
          )}
        </div>
      ) : (
        /* Paso 3: datos del cliente, mapa y resumen. En móvil el orden es datos → mapa → resumen y envío. */
        <form onSubmit={handleCheckoutSubmit} noValidate className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
          <h1 ref={tituloPaso} tabIndex={-1} className="sr-only">Datos de entrega y ubicación de su finca</h1>

          {/* Datos del cliente */}
          <fieldset className="lg:col-start-1 lg:row-start-1 bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5 min-w-0">
            <legend className="sr-only">Sus datos</legend>
            <h2 className="text-xl font-extrabold text-agro-600" aria-hidden="true">Sus datos</h2>

            <div>
              <label htmlFor="cliente-nombre" className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Nombre completo</label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-5 w-5 text-gray-500" aria-hidden="true" />
                <input
                  id="cliente-nombre"
                  type="text"
                  required
                  autoComplete="name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  aria-invalid={errorNombre || undefined}
                  aria-describedby={errorNombre ? 'error-pedido' : undefined}
                  className={`pl-10 w-full p-2.5 border rounded-xl text-base focus:ring-2 focus:ring-agro-400 focus:outline-none ${errorNombre ? 'border-red-600' : 'border-gray-400'}`}
                />
              </div>
            </div>

            <div>
              <label htmlFor="cliente-celular" className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Celular (WhatsApp)</label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-500" aria-hidden="true" />
                <input
                  id="cliente-celular"
                  type="tel"
                  inputMode="tel"
                  required
                  autoComplete="tel-national"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Ej. 78945612"
                  aria-invalid={errorTelefono || undefined}
                  aria-describedby={errorTelefono ? 'ayuda-celular error-pedido' : 'ayuda-celular'}
                  className={`pl-10 w-full p-2.5 border rounded-xl text-base focus:ring-2 focus:ring-agro-400 focus:outline-none ${errorTelefono ? 'border-red-600' : 'border-gray-400'}`}
                />
              </div>
              <p id="ayuda-celular" className="text-xs text-gray-600 mt-1">8 dígitos, sin el +591. Lo usamos para coordinar la entrega.</p>
            </div>

            <fieldset>
              <legend className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Forma de pago</legend>
              <div className={`grid ${qrDisponible ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                {(['QR', 'Transferencia', 'WhatsApp'] as const).filter((m) => m !== 'QR' || qrDisponible).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    aria-pressed={paymentMethod === method}
                    className={`py-2.5 px-1 text-xs font-bold border rounded-lg transition-colors min-h-[44px] ${
                      paymentMethod === method
                        ? 'bg-agro-500 text-white border-agro-500 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-1.5">
                {paymentMethod === 'QR'
                  ? 'Al confirmar verá el monto exacto y el QR para pagar desde la app de su banco.'
                  : paymentMethod === 'Transferencia'
                    ? 'Al confirmar verá los datos de la cuenta bancaria.'
                    : 'Al confirmar podrá escribirnos por WhatsApp con el código de su pedido.'}
              </p>
            </fieldset>
          </fieldset>

          {/* Mapa */}
          <section aria-labelledby="titulo-mapa" className="lg:col-start-2 lg:col-span-2 lg:row-start-1 lg:row-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-4 space-y-3 min-w-0">
            <div className="flex justify-between items-start gap-3">
              <div>
                <h2 id="titulo-mapa" className="font-bold text-agro-600 text-lg">Ubicación de su finca</h2>
                <p className="text-sm text-gray-600">Toque el mapa o arrastre el marcador rojo hasta su propiedad.</p>
              </div>
              <button
                type="button"
                onClick={() => setStep('terms')}
                className="shrink-0 text-xs font-bold text-agro-600 underline hover:no-underline py-2"
              >
                Volver a términos
              </button>
            </div>

            {!ubicacionMarcada && (
              <p className="text-sm bg-amber-50 border border-amber-300 text-amber-900 rounded-lg p-3 flex items-start gap-2" role="status">
                <MapPin className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>Todavía no marcó su finca. El flete mostrado corresponde al punto de partida del mapa (Santa Cruz de la Sierra).</span>
              </p>
            )}

            <div className="rounded-xl overflow-hidden border border-gray-200">
              <MapComponent
                cartItems={cart.map(item => ({
                  product_id: item.product.id,
                  quantity_tons: item.quantityTons,
                  factor_flete: item.product.factor_flete,
                  unit_price_ton: item.product.unit_price_ton
                }))}
                onLocationSelected={(coords: { lat: number; lng: number }) => setSelectedCoords(coords)}
                onUbicacionElegida={() => setUbicacionMarcada(true)}
                onFleteCalculated={handleFleteCalculated}
                onCalculationStateChange={(loading: boolean) => setIsCalculating(loading)}
                onError={(msg: string | null) => setFormError(msg)}
              />
            </div>
          </section>

          {/* Resumen y envío */}
          <section aria-labelledby="titulo-resumen" className="lg:col-start-1 lg:row-start-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4 min-w-0">
            <h2 id="titulo-resumen" className="font-bold text-gray-800 text-lg">Resumen de su pedido</h2>

            <dl className="space-y-2 text-sm text-gray-700">
              <div className="flex justify-between gap-3">
                <dt>Producto ({toneladas(cartTotalWeight)})</dt>
                <dd className="font-semibold">{bs(cartSubtotal)} Bs</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Distancia estimada</dt>
                <dd className="font-semibold">{distance > 0 ? `${num(distance)} km` : 'Marque su finca'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Flete estimado</dt>
                <dd className="font-bold text-agro-600" aria-live="polite">
                  {isCalculating ? (
                    <span className="inline-flex items-center gap-1 text-gray-600"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Calculando…</span>
                  ) : `${bs(fleteCost)} Bs`}
                </dd>
              </div>
              {distance > 0 && (
                <div className="flex justify-between gap-3">
                  <dt>Viajes de camión</dt>
                  <dd className="font-semibold">{trips}</dd>
                </div>
              )}
            </dl>
            {distance > 0 && (
              <p className="text-xs text-gray-600 text-right">
                Distancia calculada con {calcSource === 'google' ? 'la ruta de Google Maps' : 'línea recta ajustada ×1,25'}
                {quote?.estimated_offline && ' · estimación sin conexión (el servidor confirma el valor final)'}
              </p>
            )}

            <div className="border-t border-gray-200 pt-3 flex justify-between items-baseline text-lg font-extrabold text-gray-900">
              <span>Total estimado</span>
              <span className="text-agro-600 text-xl">{bs(totalAmount)} Bs</span>
            </div>

            {formError && step === 'checkout' && (
              <p id="error-pedido" className="text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg p-3" role="alert">{formError}</p>
            )}

            <button
              type="submit"
              disabled={!selectedCoords || isCalculating || submitting}
              className={`w-full bg-agro-500 hover:bg-agro-600 text-white py-3.5 rounded-xl font-extrabold text-base transition-colors shadow-md flex items-center justify-center gap-2 ${
                (!selectedCoords || isCalculating || submitting) ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              {submitting
                ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                : <CheckCircle2 className="h-5 w-5 text-agro-accent" aria-hidden="true" />}
              <span>{submitting ? 'Enviando pedido…' : 'Confirmar y enviar pedido'}</span>
            </button>
            <p className="text-xs text-gray-600 text-center">El servidor confirma precios, flete y stock al registrar el pedido.</p>
          </section>

        </form>
      )}
    </div>
  );
}
