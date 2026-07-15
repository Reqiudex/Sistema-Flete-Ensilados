import React, { useState } from 'react';
import { ShoppingBag, ArrowRight, Trash2, ShieldCheck, ShoppingCart, User, Phone, CheckCircle2, Wheat, Sprout } from 'lucide-react';
import { Product, CartItem } from '../types';
import MapComponent from './MapComponent';

interface CatalogCartProps {
  products: Product[];
  cart: CartItem[];
  addToCart: (product: Product, qty: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQty: (productId: string, qty: number) => void;
  onSubmitOrder: (orderData: {
    customerName: string;
    customerPhone: string;
    lat: number;
    lng: number;
    shippingCost: number;
    totalAmount: number;
    totalWeight: number;
    paymentMethod: 'QR' | 'Transferencia' | 'WhatsApp';
  }) => void;
}

export default function CatalogCart({
  products,
  cart,
  addToCart,
  removeFromCart,
  updateCartQty,
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

  // Temporary quantity values for product cards
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const cartTotalWeight = cart.reduce((sum, item) => sum + item.quantityTons, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.quantityTons * item.product.unit_price_ton, 0);
  const totalAmount = cartSubtotal + fleteCost;

  const handleQtyChange = (productId: string, val: string) => {
    const num = parseFloat(val);
    setQuantities(prev => ({
      ...prev,
      [productId]: isNaN(num) ? 0 : num
    }));
  };

  const handleAddToCartClick = (product: Product) => {
    const qty = quantities[product.id] || 1;
    if (qty <= 0) return;
    addToCart(product, qty);
    // Reset temporary quantity to 1 after adding
    setQuantities(prev => ({ ...prev, [product.id]: 1 }));
  };

  const handleFleteCalculated = (details: {
    shippingCost: number;
    distance: number;
    source: 'google' | 'haversine';
  }) => {
    setFleteCost(details.shippingCost);
    setDistance(details.distance);
    setCalcSource(details.source);
  };

  const handleCheckoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) {
      alert('Por favor complete su nombre y número celular.');
      return;
    }
    if (!selectedCoords) {
      alert('Por favor arrastre el marcador en el mapa para ubicar su propiedad rural.');
      return;
    }

    onSubmitOrder({
      customerName,
      customerPhone,
      lat: selectedCoords.lat,
      lng: selectedCoords.lng,
      shippingCost: fleteCost,
      totalAmount,
      totalWeight: cartTotalWeight,
      paymentMethod
    });
  };

  // Helper product illustrations/badges
  const getProductIcon = (name: string) => {
    if (name.toLowerCase().includes('maíz') || name.toLowerCase().includes('maiz')) {
      return <Wheat className="h-10 w-10 text-yellow-500" />;
    }
    if (name.toLowerCase().includes('soya')) {
      return <Sprout className="h-10 w-10 text-green-500" />;
    }
    return <Wheat className="h-10 w-10 text-orange-400" />;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Step Indicator */}
      <div className="flex justify-center items-center space-x-4 mb-8">
        <button
          onClick={() => setStep('catalog')}
          className={`flex items-center space-x-2 text-sm font-bold pb-2 border-b-2 transition-all ${
            step === 'catalog'
              ? 'border-agro-500 text-agro-600'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <span className="w-6 h-6 rounded-full bg-agro-100 text-agro-600 flex items-center justify-center text-xs font-bold">1</span>
          <span className="hidden sm:inline">Seleccionar Silos</span>
        </button>
        <div className="h-0.5 w-6 sm:w-12 bg-gray-200"></div>
        <button
          disabled={cart.length === 0}
          onClick={() => setStep('terms')}
          className={`flex items-center space-x-2 text-sm font-bold pb-2 border-b-2 transition-all ${
            cart.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
          } ${
            step === 'terms'
              ? 'border-agro-500 text-agro-600'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <span className="w-6 h-6 rounded-full bg-agro-100 text-agro-600 flex items-center justify-center text-xs font-bold">2</span>
          <span className="hidden sm:inline">Términos</span>
        </button>
        <div className="h-0.5 w-6 sm:w-12 bg-gray-200"></div>
        <button
          disabled={cart.length === 0 || !acceptedTerms}
          onClick={() => { if (acceptedTerms) setStep('checkout') }}
          className={`flex items-center space-x-2 text-sm font-bold pb-2 border-b-2 transition-all ${
            (cart.length === 0 || !acceptedTerms) ? 'opacity-50 cursor-not-allowed' : ''
          } ${
            step === 'checkout'
              ? 'border-agro-500 text-agro-600'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <span className="w-6 h-6 rounded-full bg-agro-100 text-agro-600 flex items-center justify-center text-xs font-bold">3</span>
          <span className="hidden sm:inline">Datos y Ubicación</span>
        </button>
      </div>

      {step === 'catalog' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Catalog grid */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-2xl font-extrabold text-agro-600">Catálogo de Ensilados</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {products.map((product) => {
                const tempQty = quantities[product.id] !== undefined ? quantities[product.id] : 1;
                return (
                  <div
                    key={product.id}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col justify-between"
                  >
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div className="text-4xl bg-agro-50 p-3 rounded-2xl">
                          {getProductIcon(product.name)}
                        </div>
                        <span className="bg-agro-100 text-agro-700 text-xs font-semibold px-3 py-1 rounded-full">
                          Silo Acopio
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-1">{product.name}</h3>
                      <p className="text-gray-500 text-sm mb-4 line-clamp-3">{product.description}</p>
                      
                      <div className="flex justify-between items-baseline mb-4">
                        <span className="text-xs text-gray-400">Precio por Tonelada</span>
                        <span className="text-2xl font-extrabold text-agro-500">{product.unit_price_ton} Bs.</span>
                      </div>

                      <div className="border-t border-gray-100 pt-4 flex justify-between items-center text-xs text-gray-500">
                        <span>Disponibilidad en planta</span>
                        <span className="font-bold text-gray-700">{product.stock_tons} Toneladas</span>
                      </div>
                    </div>

                    <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center space-x-3">
                      <div className="w-1/3">
                        <label className="sr-only">Toneladas</label>
                        <input
                          type="number"
                          min="1"
                          max={product.stock_tons}
                          value={tempQty === 0 ? '' : tempQty}
                          onChange={(e) => handleQtyChange(product.id, e.target.value)}
                          placeholder="Ton"
                          className="w-full text-center py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-agro-400 text-sm font-semibold"
                        />
                      </div>
                      <button
                        onClick={() => handleAddToCartClick(product)}
                        className="flex-1 bg-agro-500 hover:bg-agro-600 text-white py-2 px-4 rounded-lg font-bold text-sm transition-all shadow-md hover:scale-[1.02] flex justify-center items-center space-x-1"
                      >
                        <ShoppingCart className="h-4 w-4" />
                        <span>Agregar</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cart Sidebar */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 self-start space-y-6">
            <div className="flex items-center space-x-2 pb-4 border-b border-gray-100">
              <ShoppingBag className="h-6 w-6 text-agro-500" />
              <h2 className="text-xl font-bold text-gray-800">Carrito de Compra</h2>
            </div>

            {cart.length === 0 ? (
              <div className="py-8 text-center text-gray-400 space-y-3">
                <ShoppingCart className="h-12 w-12 mx-auto stroke-1 text-gray-300" />
                <p className="text-sm">El carrito está vacío. Agregue toneladas de ensilado para cotizar.</p>
              </div>
            ) : (
              <>
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div key={item.product.id} className="flex justify-between items-center space-x-3 p-3 bg-gray-50 rounded-xl">
                      <div className="flex-1">
                        <h4 className="font-bold text-sm text-gray-800">{item.product.name}</h4>
                        <span className="text-xs text-gray-400">{item.product.unit_price_ton} Bs. / ton</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min="1"
                          value={item.quantityTons}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val > 0) {
                              updateCartQty(item.product.id, val);
                            }
                          }}
                          className="w-14 text-center py-1 border border-gray-200 rounded text-xs font-bold focus:outline-none"
                        />
                        <span className="text-xs text-gray-500 font-semibold">T</span>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Peso total:</span>
                    <span className="font-bold text-gray-800">{cartTotalWeight} Toneladas</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-gray-800">
                    <span>Subtotal material:</span>
                    <span>{cartSubtotal.toLocaleString()} Bs.</span>
                  </div>
                  <p className="text-[11px] text-gray-400 bg-agro-50 p-2.5 rounded-lg border border-agro-100 flex items-start space-x-1">
                    <ShieldCheck className="h-4 w-4 text-agro-500 shrink-0 mt-0.5" />
                    <span>El flete logístico desde los silos de San Ramón se calculará con mapa en el siguiente paso.</span>
                  </p>
                </div>

                <button
                  onClick={() => setStep('terms')}
                  className="w-full bg-agro-500 hover:bg-agro-600 text-white py-3 rounded-xl font-bold text-base transition-all shadow-md hover:shadow-lg hover:scale-[1.01] flex items-center justify-center space-x-2"
                >
                  <span>Continuar Cotización</span>
                  <ArrowRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

        </div>
      ) : step === 'terms' ? (
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 space-y-6">
          <h2 className="text-2xl font-extrabold text-agro-600 text-center">Términos y Condiciones de Uso</h2>
          
          <div className="h-96 overflow-y-auto pr-4 space-y-4 text-sm text-gray-600 border border-gray-100 rounded-xl p-4 md:p-6 bg-gray-50">
            <div>
              <h3 className="font-bold text-gray-800 text-base mb-2">A. Marco legal sobre tecnologías de información y protección de datos</h3>
              <p className="mb-2">De acuerdo a la Ley N.º 164 (Ley General de Telecomunicaciones, Tecnologías de Información y Comunicación) del Estado Plurinacional de Bolivia, los códigos de pedido generados por la plataforma son registros internos y no constituyen documentos fiscales ni comprobantes tributarios.</p>
              <p>Conforme a la Constitución Política del Estado, garantizamos la protección y privacidad de sus datos. La información de geolocalización obtenida mediante Google Maps será utilizada únicamente para determinar distancias y estimar costos de transporte logístico. El sistema no realiza seguimiento permanente de la ubicación del usuario.</p>
            </div>
            
            <div className="pt-4 border-t border-gray-200">
              <h3 className="font-bold text-gray-800 text-base mb-2">B. Naturaleza jurídica de la cotización y exclusión tributaria</h3>
              <p className="mb-2">Los valores generados por el sistema corresponden a <strong>estimaciones operativas referenciales</strong> destinadas a facilitar la determinación del costo de transporte. <strong>No representan una factura electrónica ni un documento tributario reconocido por el Servicio de Impuestos Nacionales (SIN).</strong></p>
              <p>La plataforma se limita al cálculo logístico considerando variables operativas (distancia, peso, etc). La emisión del documento fiscal definitivo (con IVA, IT u otros gravámenes) se realizará posteriormente mediante los mecanismos administrativos y contables establecidos por Ensilados Santa Cruz, de forma externa al sistema.</p>
            </div>
            
            <div className="pt-4 border-t border-gray-200">
              <h3 className="font-bold text-gray-800 text-base mb-2">C. Consideraciones del Sistema y Variabilidad Logística</h3>
              <p className="mb-2">El cálculo del flete generado por el sistema corresponde a una estimación basada en distancia y rutas disponibles. <strong>Factores externos</strong> como condiciones climáticas, bloqueos, estado de los caminos o modificaciones forzosas en la ruta pueden generar variaciones en el costo final del servicio de transporte en el momento de la entrega.</p>
              <p><strong>Consentimiento para uso de ubicación:</strong> Al proporcionar su ubicación mediante el mapa integrado en el siguiente paso, el usuario acepta de forma expresa que sus coordenadas sean utilizadas exclusivamente para el propósito de calcular el costo de transporte y gestionar la entrega de su pedido.</p>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <h3 className="font-bold text-gray-800 text-base mb-2">D. Pagos digitales y normativa financiera</h3>
              <p>Actualmente, este sistema no incorpora mecanismos de pago electrónico en línea (tarjetas, débito automático) dentro de la plataforma. Los pagos se coordinan de forma administrativa y externa según los métodos acordados, cumpliendo la normativa financiera vigente (ASFI) aplicable a operaciones comerciales.</p>
            </div>
          </div>

          <div className="flex items-start space-x-3 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
            <input
              type="checkbox"
              id="accept-terms"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-gray-300 text-agro-500 focus:ring-agro-400 focus:ring-offset-0 cursor-pointer"
            />
            <label htmlFor="accept-terms" className="text-sm font-medium text-gray-700 cursor-pointer leading-snug">
              He leído y acepto los términos de uso, exclusión tributaria de la cotización, y doy mi consentimiento para compartir mi ubicación exclusivamente para el cálculo del flete logístico según la normativa boliviana.
            </label>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-between pt-4 gap-4 sm:gap-0">
            <button
              type="button"
              onClick={() => setStep('catalog')}
              className="px-6 py-3 sm:py-2 border border-gray-300 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition-all text-center"
            >
              Volver al Catálogo
            </button>
            <button
              type="button"
              disabled={!acceptedTerms}
              onClick={() => setStep('checkout')}
              className={`px-8 py-3 sm:py-2 rounded-xl font-extrabold text-white transition-all flex items-center justify-center space-x-2 ${
                acceptedTerms ? 'bg-agro-500 hover:bg-agro-600 shadow-md hover:scale-[1.02]' : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              <span>Continuar a Ubicación</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : (
        /* Step 3: Checkout with Map and Customer details */
        <form onSubmit={handleCheckoutSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Customer Form & Logistics details */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
              <h2 className="text-xl font-extrabold text-agro-600">Detalles del Cliente</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Nombre Completo</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ej. Juan Pérez"
                      className="pl-10 w-full p-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-agro-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Número Celular (WhatsApp)</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      type="tel"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Ej. 78945612"
                      className="pl-10 w-full p-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-agro-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Método de Pago</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['QR', 'Transferencia', 'WhatsApp'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`py-2 px-1 text-xs font-bold border rounded-lg transition-all ${
                          paymentMethod === method
                            ? 'bg-agro-500 text-white border-agro-500 shadow-sm'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Price breakdown */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h3 className="font-bold text-gray-800 text-base">Resumen de Cotización</h3>
              
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Subtotal Material:</span>
                  <span className="font-semibold">{cartSubtotal.toLocaleString()} Bs.</span>
                </div>
                <div className="flex justify-between">
                  <span>Distancia Estimada:</span>
                  <span className="font-semibold">{distance > 0 ? `${distance} km` : 'Por definir en mapa'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Costo de Flete Estimado:</span>
                  <span className="font-bold text-agro-500">
                    {fleteCost > 0 ? `${fleteCost.toLocaleString()} Bs.` : '0 Bs.'}
                  </span>
                </div>
                {distance > 0 && (
                  <div className="text-[10px] text-gray-400 text-right">
                    Ruta calculada vía: {calcSource === 'google' ? 'Google Roads' : 'Línea recta (Ajustada)'}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-3 flex justify-between text-lg font-extrabold text-gray-900">
                <span>Total Estimado:</span>
                <span className="text-agro-600">{totalAmount.toLocaleString()} Bs.</span>
              </div>

              <button
                type="submit"
                disabled={!selectedCoords || isCalculating}
                className={`w-full bg-agro-500 hover:bg-agro-600 text-white py-3.5 rounded-xl font-extrabold text-base transition-all shadow-md flex items-center justify-center space-x-2 ${
                  (!selectedCoords || isCalculating) ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.01]'
                }`}
              >
                <CheckCircle2 className="h-5 w-5 text-agro-accent" />
                <span>Confirmar y Enviar Pedido</span>
              </button>
            </div>
          </div>

          {/* Interactive Map */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h3 className="font-bold text-agro-600 text-lg">Geolocalización de su Propiedad</h3>
                  <p className="text-xs text-gray-500">Arrastre el marcador (Pin) sobre su finca o propiedad agrícola en el mapa.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('terms')}
                  className="text-xs font-bold text-agro-500 hover:underline"
                >
                  Volver a Términos
                </button>
              </div>

              <div className="rounded-xl overflow-hidden border border-gray-200">
                <MapComponent
                  cartItems={cart.map(item => ({
                    quantity_tons: item.quantityTons,
                    factor_flete: item.product.factor_flete
                  }))}
                  totalWeight={cartTotalWeight}
                  onLocationSelected={(coords: { lat: number; lng: number }) => setSelectedCoords(coords)}
                  onFleteCalculated={handleFleteCalculated}
                  onCalculationStateChange={(loading: boolean) => setIsCalculating(loading)}
                />
              </div>
            </div>
          </div>

        </form>
      )}
    </div>
  );
}
