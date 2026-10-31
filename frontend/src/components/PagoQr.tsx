import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, QrCode, RefreshCw, AlertTriangle } from 'lucide-react';
import { PagoQr as PagoQrDatos, consultarPagoQr, iniciarPagoQr, mensajeError } from '../api';

interface PagoQrProps {
  codigo: string;
  /** Se invoca una vez cuando el servidor confirma el pago */
  onPagado?: () => void;
}

const fmt = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Panel de pago por QR. El servidor solicita el cobro a la pasarela (con el monto exacto a pagar) y confirma el
 * pago cuando el banco lo notifica. El navegador solo muestra el estado: nunca decide si un pago es válido.
 */
export default function PagoQr({ codigo, onPagado }: PagoQrProps) {
  const [pago, setPago] = useState<PagoQrDatos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [restante, setRestante] = useState(0);
  const avisado = useRef(false);

  const aplicar = useCallback((p: PagoQrDatos) => {
    setPago(p);
    setRestante(p.segundos_restantes);
    if (p.pago_estado === 'Pagado' && !avisado.current) {
      avisado.current = true;
      onPagado?.();
    }
  }, [onPagado]);

  const generar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      aplicar(await iniciarPagoQr(codigo));
    } catch (e) {
      setError(mensajeError(e, 'No se pudo generar el cobro QR.'));
    } finally {
      setCargando(false);
    }
  }, [codigo, aplicar]);

  // Consulta periódica mientras el cobro está pendiente
  useEffect(() => {
    if (!pago || pago.pago_estado !== 'Pendiente') return undefined;
    const id = window.setInterval(async () => {
      try {
        aplicar(await consultarPagoQr(codigo));
      } catch {
        /* un fallo puntual de red no interrumpe la espera */
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [pago, codigo, aplicar]);

  // Cuenta regresiva local
  useEffect(() => {
    if (!pago || pago.pago_estado !== 'Pendiente') return undefined;
    const id = window.setInterval(() => setRestante((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [pago]);

  if (pago?.pago_estado === 'Pagado') {
    return (
      <div className="border border-green-200 bg-green-50 rounded-2xl p-6 flex items-center space-x-3" role="status">
        <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
        <div>
          <h3 className="font-bold text-green-800">Pago confirmado</h3>
          <p className="text-xs text-green-700">Recibimos su pago de Bs {fmt(pago.monto_a_pagar_bs ?? pago.total_bs)}. Su pedido continúa su proceso.</p>
        </div>
      </div>
    );
  }

  if (pago?.pago_estado === 'Revision') {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-2xl p-6 flex items-start space-x-3" role="status">
        <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
        <p className="text-xs text-amber-800">
          Detectamos su pago, pero necesita una revisión manual. Nuestro equipo lo confirmará y se comunicará con usted.
        </p>
      </div>
    );
  }

  const vigente = pago?.pago_estado === 'Pendiente' && !!pago.checkout_url && restante > 0;
  const mm = String(Math.floor(restante / 60)).padStart(2, '0');
  const ss = String(restante % 60).padStart(2, '0');

  return (
    <div className="border border-agro-100 bg-agro-50/50 rounded-2xl p-6 space-y-4">
      <div className="flex items-center space-x-2 text-agro-600 pb-2 border-b border-agro-100">
        <QrCode className="h-5 w-5 text-agro-accent" />
        <h3 className="font-bold text-sm uppercase tracking-wide">Pago con QR</h3>
      </div>

      {!vigente && (
        <>
          <p className="text-xs text-gray-600">
            {pago && pago.pago_estado !== 'Pendiente' || (pago && restante === 0)
              ? 'El cobro anterior venció. Genere uno nuevo para pagar.'
              : 'Genere el cobro para ver el monto exacto que debe pagar y el código QR del banco.'}
          </p>
          <button
            type="button"
            onClick={generar}
            disabled={cargando}
            className="w-full bg-agro-500 hover:bg-agro-600 disabled:opacity-60 text-white py-3 rounded-xl font-extrabold text-sm flex items-center justify-center space-x-2"
          >
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            <span>{cargando ? 'Generando…' : 'Generar cobro QR'}</span>
          </button>
        </>
      )}

      {vigente && pago && (
        <div className="space-y-3">
          <div className="text-center">
            <span className="block text-[10px] text-gray-400 uppercase font-bold">Pague exactamente</span>
            <span className="text-3xl font-extrabold text-agro-600">Bs {fmt(pago.monto_a_pagar_bs ?? pago.total_bs)}</span>
            <span className="block text-[11px] text-amber-700 mt-1">
              Incluya los centavos: así identificamos su pago automáticamente.
            </span>
          </div>
          <a
            href={pago.checkout_url ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-agro-500 hover:bg-agro-600 text-white py-3 rounded-xl font-extrabold text-sm flex items-center justify-center space-x-2"
          >
            <ExternalLink className="h-4 w-4" />
            <span>Abrir código QR y pagar</span>
          </a>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span className="flex items-center space-x-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Esperando su pago…</span>
            </span>
            <span className="font-mono font-bold text-gray-700">{mm}:{ss}</span>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-3 flex items-start space-x-2" role="alert">
          <RefreshCw className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
