import { useState } from 'react';
import {
  Mail, Lock, Eye, EyeOff, Sprout, Shield, Chrome, Facebook,
  ArrowRight, Loader2, CheckCircle2, Key, Wheat, Leaf, Tractor, Sun
} from 'lucide-react';
import { UserProfile, Toast } from '../types';

interface AuthScreenProps {
  onLogin: (user: UserProfile, token: string) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

const API_BASE = 'http://localhost:3001/api';

export default function AuthScreen({ onLogin, addToast }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'login' | '2fa'>('login');
  const [twoFACode, setTwoFACode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [twoFALoading, setTwoFALoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (data.requires_2fa) {
        setPendingEmail(email);
        setStep('2fa');
        addToast({ type: 'info', title: 'Doble Factor Requerido', message: 'Ingrese el código de 6 dígitos de su aplicación autenticadora.' });
        return;
      }

      if (!res.ok) {
        addToast({ type: 'error', title: 'Error de Acceso', message: data.error || 'Credenciales inválidas.' });
        return;
      }

      addToast({ type: 'success', title: '¡Bienvenido!', message: `Sesión iniciada como ${data.user.role}.` });
      onLogin(data.user, data.token);
    } catch (_err) {
      // Offline/demo mode fallback
      handleDemoLogin(email, password);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = (em: string, pw: string) => {
    const demoAccounts: Record<string, { role: 'Admin' | 'Superadmin'; pw: string }> = {
      'superadmin@ensilados.com': { role: 'Superadmin', pw: 'superadmin123' },
      'admin@ensilados.com':      { role: 'Admin',      pw: 'admin123' },
    };
    const account = demoAccounts[em.toLowerCase()];
    if (account && account.pw === pw) {
      const mockUser: UserProfile = {
        id: em === 'superadmin@ensilados.com' ? '1' : '2',
        email: em, role: account.role, two_factor_enabled: false
      };
      const mockToken = btoa(JSON.stringify(mockUser) + ':demo');
      addToast({ type: 'success', title: 'Acceso Demo', message: `Sesión iniciada como ${account.role} (modo offline).` });
      onLogin(mockUser, mockToken);
    } else {
      addToast({
        type: 'error', title: 'Error de Acceso',
        message: 'Credenciales inválidas. Demo: superadmin@ensilados.com / superadmin123'
      });
    }
  };

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFALoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, totp_code: twoFACode })
      });
      const data = await res.json();

      if (!res.ok) {
        addToast({ type: 'error', title: 'Código Inválido', message: data.error || 'Código 2FA incorrecto.' });
        return;
      }

      addToast({ type: 'success', title: 'Verificado', message: 'Autenticación de doble factor correcta.' });
      onLogin(data.user, data.token);
    } catch (_err) {
      addToast({ type: 'error', title: 'Error', message: 'No se pudo conectar con el servidor.' });
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleSocialAuth = (provider: 'google' | 'facebook') => {
    addToast({
      type: 'info',
      title: `${provider === 'google' ? 'Google' : 'Facebook'} OAuth`,
      message: 'Configure las credenciales de OAuth en Supabase para habilitar el inicio de sesión social.'
    });
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

              {/* Demo Credentials hint */}
              <div className="mb-5 p-3 bg-gold-500/10 border border-gold-500/20 rounded-xl text-xs text-gold-300">
                <p className="font-bold mb-1 flex items-center gap-1.5"><Key className="h-4 w-4" /> Credenciales Demo:</p>
                <p>Superadmin: <span className="text-white font-mono">superadmin@ensilados.com</span> / <span className="text-white font-mono">superadmin123</span></p>
                <p>Admin: <span className="text-white font-mono">admin@ensilados.com</span> / <span className="text-white font-mono">admin123</span></p>
              </div>

              {/* Social login buttons */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <button
                  onClick={() => handleSocialAuth('google')}
                  className="flex items-center justify-center gap-2 glass py-2.5 px-4 rounded-xl text-sm font-semibold text-white hover:bg-white/10 transition-all hover:scale-[1.02]"
                >
                  <Chrome className="h-4 w-4 text-red-400" />
                  Google
                </button>
                <button
                  onClick={() => handleSocialAuth('facebook')}
                  className="flex items-center justify-center gap-2 glass py-2.5 px-4 rounded-xl text-sm font-semibold text-white hover:bg-white/10 transition-all hover:scale-[1.02]"
                >
                  <Facebook className="h-4 w-4 text-blue-400" />
                  Facebook
                </button>
              </div>

              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-dark-600" />
                <span className="text-dark-400 text-xs font-medium">o con correo</span>
                <div className="flex-1 h-px bg-dark-600" />
              </div>

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
                      placeholder="admin@ensilados.com"
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
                  <p className="text-xs text-dark-400">{pendingEmail}</p>
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
