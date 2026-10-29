import { jsPDF } from 'jspdf';
import { CheckCircle2, Download, MessageSquare, Landmark, MapPin, Phone, User, Sprout, ArrowRight } from 'lucide-react';
import { Order } from '../types';

interface ConfirmationProps {
  order: Order;
  onBackToStart: () => void;
}

export default function Confirmation({ order, onBackToStart }: ConfirmationProps) {
  
  // Generación del PDF ligero client-side con jsPDF
  const generatePDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Encabezado
      doc.setFillColor(27, 67, 79); // #1b4332 -> rgb(27, 67, 50)
      doc.rect(0, 0, 210, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('ENSILADOS SANTA CRUZ', 15, 18);
      
      doc.setFontSize(10);
      doc.setFont('Helvetica', 'normal');
      doc.text('Central de Silos: San Ramón, Santa Cruz, Bolivia', 15, 25);
      doc.text(`Fecha: ${new Date(order.created_at || '').toLocaleDateString()}`, 15, 30);

      // Código de Pedido en Grande (Derecha)
      doc.setFillColor(212, 163, 115); // agro-accent #d4a373
      doc.rect(145, 10, 50, 20, 'F');
      doc.setTextColor(15, 30, 20);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('PEDIDO NRO', 150, 16);
      doc.setFontSize(14);
      doc.text(order.order_code || 'ESC-N/A', 150, 24);

      // Datos de Cliente
      doc.setTextColor(27, 67, 50);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('DATOS DEL CLIENTE', 15, 50);
      doc.line(15, 52, 195, 52);

      doc.setTextColor(50, 50, 50);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Nombre: ${order.customer_name}`, 15, 58);
      doc.text(`Celular: ${order.customer_phone}`, 15, 64);
      doc.text(`Ubicación GPS: Lat ${order.lat.toFixed(6)}, Lng ${order.lng.toFixed(6)}`, 15, 70);

      // Tabla de Productos
      doc.setTextColor(27, 67, 50);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('DETALLE DEL PEDIDO', 15, 82);
      doc.line(15, 84, 195, 84);

      // Cabeceras de tabla
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(9);
      doc.text('Producto', 15, 90);
      doc.text('Cant. (Tons)', 90, 90);
      doc.text('Precio Unit.', 130, 90);
      doc.text('Subtotal', 170, 90);
      doc.line(15, 92, 195, 92);

      // Items
      doc.setTextColor(50, 50, 50);
      doc.setFont('Helvetica', 'normal');
      let currentY = 98;
      
      if (order.items && order.items.length > 0) {
        order.items.forEach((item) => {
          const prodName = item.product?.name || 'Silo de maíz / Soya / Sorgo';
          doc.text(prodName, 15, currentY);
          doc.text(`${item.quantity_tons} T`, 90, currentY);
          doc.text(`${item.subtotal / item.quantity_tons} Bs.`, 130, currentY);
          doc.text(`${item.subtotal} Bs.`, 170, currentY);
          currentY += 8;
        });
      } else {
        // Fallback si no hay items cargados (por ejemplo, compra mock)
        doc.text('Productos Varios de Ensilado', 15, currentY);
        doc.text(`${order.total_weight_tons} T`, 90, currentY);
        doc.text('-', 130, currentY);
        doc.text(`${(order.total_amount - order.shipping_cost).toFixed(2)} Bs.`, 170, currentY);
        currentY += 8;
      }

      doc.line(15, currentY - 2, 195, currentY - 2);

      // Flete y Total
      doc.setFont('Helvetica', 'bold');
      doc.text('Costo de Envío (Flete):', 130, currentY + 2);
      doc.text(`${order.shipping_cost.toLocaleString()} Bs.`, 170, currentY + 2);

      doc.setFontSize(12);
      doc.setTextColor(27, 67, 50);
      doc.text('TOTAL GENERAL:', 130, currentY + 10);
      doc.text(`${order.total_amount.toLocaleString()} Bs.`, 170, currentY + 10);

      // Instrucciones de Pago Bancario
      currentY += 25;
      doc.setFillColor(245, 247, 245);
      doc.rect(15, currentY, 180, 32, 'F');
      
      doc.setTextColor(27, 67, 50);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('INSTRUCCIONES DE PAGO - TRANSFERENCIA', 20, currentY + 6);
      
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.setFontSize(8.5);
      doc.text('Banco: Banco Unión S.A.', 20, currentY + 12);
      doc.text('Nro. Cuenta: 120485763 (Moneda Nacional)', 20, currentY + 17);
      doc.text('Titular: Ensilados Santa Cruz S.R.L.', 20, currentY + 22);
      doc.text('Por favor, envíe el comprobante de transferencia bancaria por WhatsApp.', 20, currentY + 27);

      // Pie de Página
      doc.setFillColor(27, 67, 50);
      doc.rect(0, 275, 210, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('Helvetica', 'bold');
      doc.text('Este documento sirve como comprobante oficial para el chofer de entrega.', 35, 284);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Ensilados Santa Cruz - Logística Inteligente y Conectividad Rural', 60, 289);

      // Descargar el archivo
      doc.save(`Pedido_${order.order_code}.pdf`);
    } catch (error) {
      console.error('Error al generar PDF:', error);
      alert('Hubo un inconveniente al generar el PDF. Tome captura de pantalla de esta ventana.');
    }
  };

  // Enlace directo a WhatsApp con texto pre-cargado
  const getWhatsAppLink = () => {
    const defaultNumber = '59178945612'; // Número de la central de silos
    const message = encodeURIComponent(
      `Hola Ensilados Santa Cruz, realicé el pedido con código ${order.order_code}.\n` +
      `Cliente: ${order.customer_name}\n` +
      `Monto Total: ${order.total_amount} Bs.\n` +
      `Por favor coordinemos el despacho de las ${order.total_weight_tons} toneladas.`
    );
    return `https://wa.me/${defaultNumber}?text=${message}`;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
        
        {/* Banner Success */}
        <div className="bg-agro-600 text-white text-center py-10 px-6 space-y-3 relative">
          <div className="mx-auto w-16 h-16 bg-white/10 rounded-full flex items-center justify-center shadow-inner">
            <CheckCircle2 className="h-10 w-10 text-agro-accent animate-bounce" />
          </div>
          <h2 className="text-3xl font-extrabold tracking-wide">
            {order.pending_sync ? 'Pedido Guardado en su Dispositivo' : '¡Pedido Registrado con Éxito!'}
          </h2>
          <p className="text-agro-100 text-sm max-w-md mx-auto">
            {order.pending_sync
              ? 'No hay conexión con el servidor. Su pedido se enviará automáticamente cuando vuelva la señal (mantenga esta aplicación abierta o vuelva a abrirla). El flete y el total definitivos los confirma el servidor al enviarlo.'
              : 'Su cotización logística ha sido procesada de manera correcta. El chofer asignado utilizará su ubicación registrada para el despacho.'}
          </p>
        </div>

        {/* Order Details Body */}
        <div className="p-8 space-y-8">
          {/* Order Code & Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-gray-100">
            <div className="space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Código de Pedido Único</span>
              <span className="block text-3xl font-extrabold text-agro-600">{order.order_code}</span>
            </div>
            <div className="space-y-1 md:text-right">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Estado Inicial</span>
              <span className="inline-block bg-yellow-100 text-yellow-800 text-xs font-extrabold px-3 py-1.5 rounded-full uppercase tracking-wider">
                {order.status}
              </span>
            </div>
          </div>

          {/* Logistics Data cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center space-x-3">
              <User className="h-5 w-5 text-agro-500 shrink-0" />
              <div>
                <span className="block text-[10px] text-gray-400 uppercase font-bold">Cliente</span>
                <span className="font-bold text-sm text-gray-800 line-clamp-1">{order.customer_name}</span>
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center space-x-3">
              <Phone className="h-5 w-5 text-agro-500 shrink-0" />
              <div>
                <span className="block text-[10px] text-gray-400 uppercase font-bold">Contacto</span>
                <span className="font-bold text-sm text-gray-800">{order.customer_phone}</span>
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center space-x-3">
              <MapPin className="h-5 w-5 text-agro-500 shrink-0" />
              <div>
                <span className="block text-[10px] text-gray-400 uppercase font-bold">Ubicación GPS</span>
                <span className="font-bold text-xs text-gray-800">{order.lat.toFixed(4)}, {order.lng.toFixed(4)}</span>
              </div>
            </div>
          </div>

          {/* Pricing Summary */}
          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 space-y-3">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Peso Total Transportado:</span>
              <span className="font-bold">{order.total_weight_tons} Toneladas</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Método de Pago Seleccionado:</span>
              <span className="font-bold text-agro-600">{order.payment_method}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Costo de Flete Logístico:</span>
              <span className="font-bold text-gray-800">{order.shipping_cost.toLocaleString()} Bs.</span>
            </div>
            <div className="border-t border-gray-200 pt-3 flex justify-between text-xl font-extrabold text-gray-900">
              <span>Monto Total a Depositar:</span>
              <span className="text-agro-500">{order.total_amount.toLocaleString()} Bs.</span>
            </div>
          </div>

          {/* Bank details panel */}
          <div className="border border-agro-100 bg-agro-50/50 rounded-2xl p-6 space-y-4">
            <div className="flex items-center space-x-2 text-agro-600 pb-2 border-b border-agro-100">
              <Landmark className="h-5 w-5 text-agro-accent" />
              <h3 className="font-bold text-sm uppercase tracking-wide">Datos de Cuenta Bancaria (Bolivia)</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-gray-600">
              <div>
                <span className="block text-[10px] text-gray-400 font-bold uppercase">Banco</span>
                <span className="font-bold text-gray-800">Banco Unión S.A.</span>
              </div>
              <div>
                <span className="block text-[10px] text-gray-400 font-bold uppercase">Número de Cuenta</span>
                <span className="font-bold text-gray-800">120485763 (Bolivianos)</span>
              </div>
              <div>
                <span className="block text-[10px] text-gray-400 font-bold uppercase">Titular</span>
                <span className="font-bold text-gray-800">Ensilados Santa Cruz S.R.L.</span>
              </div>
              <div>
                <span className="block text-[10px] text-gray-400 font-bold uppercase">Nit</span>
                <span className="font-bold text-gray-800">348927021</span>
              </div>
            </div>
          </div>

          {/* Offline Warning banner */}
          <div className="text-xs text-gray-500 bg-amber-50 border border-amber-100 p-4 rounded-xl flex items-start space-x-2">
            <Sprout className="h-5 w-5 text-agro-accent shrink-0 animate-sway" />
            <div>
              <strong className="text-amber-800 block">¿Sin señal en el chaco o propiedad agrícola?</strong>
              <span className="block mt-0.5">
                No se preocupe. Presione el botón <strong>"Descargar Comprobante PDF"</strong> ahora. Este archivo se guardará en su celular y podrá mostrárselo físicamente al chofer del camión aun si pierde por completo el internet en su zona de cosecha.
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
            <button
              onClick={generatePDF}
              className="bg-white hover:bg-gray-50 text-agro-600 border-2 border-agro-500 py-3.5 px-6 rounded-xl font-extrabold text-sm transition-all shadow-sm flex items-center justify-center space-x-2 hover:scale-[1.01]"
            >
              <Download className="h-5 w-5" />
              <span>Descargar Comprobante PDF</span>
            </button>
            <a
              href={getWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-green-600 hover:bg-green-700 text-white py-3.5 px-6 rounded-xl font-extrabold text-sm transition-all shadow-md flex items-center justify-center space-x-2 hover:scale-[1.01]"
            >
              <MessageSquare className="h-5 w-5 text-white" />
              <span>Coordinar por WhatsApp</span>
            </a>
          </div>

        </div>

        {/* Back link */}
        <div className="bg-gray-50 py-5 px-8 border-t border-gray-100 flex justify-center">
          <button
            onClick={onBackToStart}
            className="text-xs font-bold text-gray-500 hover:text-agro-500 flex items-center space-x-1"
          >
            <span>Volver a la Página de Inicio</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
}
