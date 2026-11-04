import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, QrCode, RefreshCw, XCircle } from 'lucide-react';
import { PagoQr as PagoQrDatos, consultarPagoQr, iniciarPagoQr, mensajeError } from '../api';

interface PagoQrProps {
  codigo: string;
  /** Datos del cobro devueltos al registrar el pedido (evita una consulta inicial) */
  inicial?: PagoQrDatos | null;
  /** Se invoca una vez cuando el servidor confirma el pago */
  onPagado?: () => void;
}

const fmt = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CONFIRMADO = ['Pagado', 'Pagado en efectivo'];
const INTERVALO_MS = 4000;

/**
 * Panel de pago por QR. El servidor crea el cobro en la pasarela (con el monto exacto a pagar) y confirma el pago
 * cuando la pasarela lo notifica por webhook firmado. El navegador solo muestra el estado: nunca decide si un pago
 * es válido ni envía importes.
 */
export default function PagoQr({ codigo, inicial = null, onPagado }: PagoQrProps) {
  const [pago, setPago] = useState<PagoQrDatos | null>(inicial);
  const [error, setError] = useState<string | null>(inicial?.error?.mensaje ?? null);
  const [cargando, setCargando] = useState(!inicial);
  const [restante, setRestante] = useState(inicial?.segundos_restantes ?? 0);
  const avisado = useRef(false);

  const aplicar = useCallback((p: PagoQrDatos) => {
    setPago(p);
    setRestante(p.segundos_restantes);
    if (CONFIRMADO.includes(p.pago_estado) && !avisado.current) {
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

  // Estado inicial: si no vino con el pedido (p. ej. al volver desde el checkout), se consulta
  useEffect(() => {
    if (inicial) return;
    let vivo = true;
    consultarPagoQr(codigo)
      .then((p) => { if (vivo) aplicar(p); })
      .catch((e) => { if (vivo) setError(mensajeError(e, 'No se pudo consultar el pago.')); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [codigo, inicial, aplicar]);

  // Consulta periódica mientras el cobro está pendiente (el servidor contrasta con la pasarela)
  const esperando = pago?.pago_estado === 'Pendiente' && pago.tiene_cobro;
  useEffect(() => {
    if (!esperando) return undefined;
    const id = window.setInterval(async () => {
      if (document.hidden) return;
      try {
        aplicar(await consultarPagoQr(codigo));
      } catch {
        /* un fallo puntual de red no interrumpe la espera */
      }
    }, INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [esperando, codigo, aplicar]);

  // Cuenta regresiva local
  useEffect(() => {
    if (!esperando) return undefined;
    const id = window.setInterval(() => setRestante((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [esperando]);

  if (pago && CONFIRMADO.includes(pago.pago_estado)) {
    return (
      <div className="border border-green-200 bg-green-50 rounded-2xl p-6 flex items-center space-x-3" role="status">
        <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
        <div>
          <h3 className="font-bold text-green-800">Pago confirmado</h3>
          <p className="text-xs text-green-700">
            Recibimos su pago de Bs {fmt(pago.monto_a_pagar_bs ?? pago.total_bs)}. Su pedido continúa su proceso.
          </p>
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

  if (pago?.pago_estado === 'Cancelado' || pago?.pedido_estado === 'Cancelado') {
    return (
      <div className="border border-gray-200 bg-gray-50 rounded-2xl p-6 flex items-start space-x-3" role="status">
        <XCircle className="h-6 w-6 text-gray-500 shrink-0" />
        <p className="text-xs text-gray-700">El cobro de este pedido fue cancelado. No realice ningún pago.</p>
      </div>
    );
  }

  const vigente = esperando && !!pago?.checkout_url && restante > 0;
  const mm = String(Math.floor(restante / 60)).padStart(2, '0');
  const ss = String(restante % 60).padStart(2, '0');
  const vencido = pago?.pago_estado === 'Vencido' || (esperando && restante === 0);

  return (
    <div className="border border-agro-100 bg-agro-50/50 rounded-2xl p-6 space-y-4" aria-live="polite">
      <div className="flex items-center space-x-2 text-agro-600 pb-2 border-b border-agro-100">
        <QrCode className="h-5 w-5 text-agro-accent" />
        <h3 className="font-bold text-sm uppercase tracking-wide">Pago con QR</h3>
        <span className="ml-auto text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
          Pendiente de pago
        </span>
      </div>

      {cargando && (
        <p className="text-xs text-gray-500 flex items-center space-x-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{pago ? 'Generando el cobro…' : 'Preparando su cobro…'}</span>
        </p>
      )}

      {!vigente && !cargando && (
        <>
          <p className="text-xs text-gray-600">
            {vencido
              ? 'El cobro anterior venció. Genere uno nuevo para pagar (el monto exacto puede cambiar en centavos).'
              : error
                ? 'Su pedido quedó registrado como "Pendiente de pago". La pasarela no respondió; puede reintentar ahora o en unos minutos.'
                : 'Genere el cobro para ver el monto exacto que debe pagar y el código QR del banco.'}
          </p>
          <button
            type="button"
            onClick={generar}
            disabled={cargando}
            className="w-full bg-agro-500 hover:bg-agro-600 disabled:opacity-60 text-white py-3 rounded-xl font-extrabold text-sm flex items-center justify-center space-x-2"
          >
            {error || vencido ? <RefreshCw className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
            <span>{error ? 'Reintentar pago' : vencido ? 'Generar nuevo cobro' : 'Generar cobro QR'}</span>
          </button>
        </>
      )}

      {vigente && pago && (
        <div className="space-y-4">
          <div className="text-center">
            <span className="block text-[11px] text-gray-500 uppercase font-bold tracking-wide">Pague exactamente</span>
            <span className="block text-4xl sm:text-5xl font-extrabold text-agro-600 tabular-nums" data-testid="monto-exacto">
              Bs {fmt(pago.monto_a_pagar_bs ?? pago.total_bs)}
            </span>
            <span className="block text-xs text-amber-800 mt-1 font-semibold">
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
            <span>Abrir el QR del banco y pagar</span>
          </a>
          <div className="hidden sm:flex flex-col items-center space-y-2">
            <div className="bg-white p-3 rounded-xl border border-gray-200">
              <QRCodeSVG value={pago.checkout_url!} size={148} level="M" aria-label="Código para abrir el pago en el celular" />
            </div>
            <span className="text-[11px] text-gray-500 text-center">¿Está en la computadora? Escanee con su celular para abrir el pago.</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span className="flex items-center space-x-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Esperando su pago…</span>
            </span>
            <span className="font-mono font-bold text-gray-800" aria-label={`Vence en ${mm} minutos ${ss} segundos`}>
              Vence en {mm}:{ss}
            </span>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-3 flex items-start space-x-2" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
