import { useState } from 'react';
import {
  Mail, Lock, Eye, EyeOff, Sprout, Shield,
  ArrowRight, Loader2, CheckCircle2, Wheat, Leaf, Tractor, Sun
} from 'lucide-react';
import { UserProfile, Toast } from '../types';
import { ApiError, iniciarSesion, verificar2FA, mensajeError } from '../api';

interface AuthScreenProps {
  onLogin: (user: UserProfile, token: string) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

export default function AuthScreen({ onLogin, addToast }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'login' | '2fa'>('login');
  const [twoFACode, setTwoFACode] = useState('');
  const [preAuthToken, setPreAuthToken] = useState('');
  const [twoFALoading, setTwoFALoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await iniciarSesion(email.trim(), password);
      if (r.requiere2fa) {
        setPreAuthToken(r.tokenPreauth);
        setPassword('');
        setStep('2fa');
        addToast({ type: 'info', title: 'Doble Factor Requerido', message: 'Ingrese el código de 6 dígitos de su aplicación autenticadora.' });
        return;
      }
      addToast({ type: 'success', title: '¡Bienvenido!', message: `Sesión iniciada como ${r.usuario.role}.` });
      onLogin(r.usuario, r.token);
    } catch (err) {
      addToast({ type: 'error', title: 'Error de Acceso', message: mensajeError(err, 'No se pudo iniciar sesión.') });
    } finally {
      setLoading(false);
    }
  };

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFALoading(true);
    try {
      const r = await verificar2FA(preAuthToken, twoFACode);
      addToast({ type: 'success', title: 'Verificado', message: 'Autenticación de doble factor correcta.' });
      onLogin(r.usuario, r.token);
    } catch (err) {
      addToast({ type: 'error', title: 'Código Inválido', message: mensajeError(err, 'No se pudo verificar el código.') });
      if (err instanceof ApiError && err.code === 'PREAUTH_INVALIDO') {
        setStep('login');
        setTwoFACode('');
      }
    } finally {
      setTwoFALoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-agro-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-gold-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-agro-600/5 rounded-full blur-3xl animate-spin-slow" />
        {/* Floating particles */}
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute animate-float opacity-20 flex items-center justify-center"
            style={{
              left: `${10 + i * 15}%`,
              top: `${20 + (i % 3) * 30}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${3 + i * 0.5}s`
            }}
          >
            {[<Wheat className="h-8 w-8 text-gold-400" />, <Leaf className="h-8 w-8 text-green-500" />, <Sprout className="h-8 w-8 text-green-400" />, <Tractor className="h-8 w-8 text-agro-500" />, <Wheat className="h-8 w-8 text-yellow-500" />, <Sun className="h-8 w-8 text-yellow-400" />][i]}
          </div>
        ))}
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-in-up">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-agro rounded-2xl shadow-agro-lg mb-4 animate-bounce-soft">
            <Sprout className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-4xl font-display font-black text-white mb-1">
            ENSILADOS
          </h1>
          <p className="text-gradient-gold font-bold tracking-widest text-sm uppercase">
            Santa Cruz
          </p>
          <p className="text-dark-300 text-sm mt-2">
            Panel de Administración — Acceso Seguro
          </p>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8 shadow-dark-lg">
          {step === 'login' ? (
            <>
              <h2 className="text-xl font-display font-bold text-white mb-6">
                Iniciar Sesión
              </h2>

              <form onSubmit={handleEmailLogin} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-dark-300 uppercase tracking-wider mb-1.5">
                    Correo Electrónico
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      placeholder="correo@empresa.com"
                      autoComplete="username"
                      className="w-full pl-10 pr-4 py-3 bg-dark-800 border border-dark-600 focus:border-agro-500 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:ring-1 focus:ring-agro-500 transition-all"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-bold text-dark-300 uppercase tracking-wider mb-1.5">
                    Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dark-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="w-full pl-10 pr-12 py-3 bg-dark-800 border border-dark-600 focus:border-agro-500 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:ring-1 focus:ring-agro-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-gold w-full py-3 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <span>Ingresar al Sistema</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            /* 2FA Verification Step */
            <div className="animate-fade-in-up">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gold-500/20 rounded-xl flex items-center justify-center">
                  <Shield className="h-6 w-6 text-gold-400 animate-pulse-glow" />
                </div>
                <div>
                  <h2 className="text-lg font-display font-bold text-white">
                    Verificación 2FA
                  </h2>
                  <p className="text-xs text-dark-400">Segundo paso de acceso</p>
                </div>
              </div>

              <p className="text-dark-300 text-sm mb-6">
                Abra <strong className="text-white">Google Authenticator</strong> o <strong className="text-white">Authy</strong> e ingrese el código de 6 dígitos para su cuenta.
              </p>

              <form onSubmit={handle2FAVerify} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-dark-300 uppercase tracking-wider mb-1.5">
                    Código de Verificación
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={twoFACode}
                    onChange={e => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full text-center text-3xl font-mono tracking-[0.8em] py-4 bg-dark-800 border border-dark-600 focus:border-gold-500 rounded-xl text-gold-300 focus:outline-none focus:ring-1 focus:ring-gold-500 transition-all"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={twoFALoading || twoFACode.length !== 6}
                  className="btn-gold w-full py-3 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {twoFALoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="h-5 w-5" />
                      <span>Verificar Código</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('login'); setTwoFACode(''); }}
                  className="w-full text-sm text-dark-400 hover:text-white transition-colors"
                >
                  ← Volver al inicio de sesión
                </button>
              </form>
            </div>
          )}
        </div>

        <p className="text-center text-dark-500 text-xs mt-6">
          Sistema Interno — Ensilados Santa Cruz © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
