import { useState, useEffect } from 'react';
import { Menu, X, Sprout, ShoppingCart, LogOut, ChevronDown, Leaf } from 'lucide-react';
import { UserProfile } from '../types';

interface HeaderProps {
  currentView: string;
  setView: (view: string) => void;
  cartCount: number;
  user: UserProfile | null;
  onLogout: () => void;
}

export default function Header({ currentView, setView, cartCount, user, onLogout }: HeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { id: 'landing', label: 'Inicio', icon: '🏠' },
    { id: 'catalog', label: 'Catálogo', icon: '🌾' },
    { id: 'admin', label: user ? `${user.role}` : 'Administración', icon: '⚙️' },
  ];

  const handleNavClick = (viewId: string) => {
    setView(viewId);
    setIsOpen(false);
  };

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'glass-dark shadow-dark-lg border-b border-agro-600/20'
          : 'bg-gradient-to-r from-agro-800/95 via-agro-700/95 to-agro-600/95 backdrop-blur-xl'
      }`}
    >
      {/* Top accent line */}
      <div className="h-[2px] w-full bg-gradient-to-r from-agro-400 via-gold-400 to-agro-400" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18">

          {/* ── Logo ── */}
          <button
            onClick={() => handleNavClick('landing')}
            className="flex items-center space-x-3 group focus:outline-none"
            aria-label="Ir al inicio"
          >
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-agro-400 to-agro-600 rounded-xl flex items-center justify-center shadow-glow-sm group-hover:shadow-glow transition-all duration-300 group-hover:scale-110">
                <Sprout className="h-5 w-5 text-white animate-sway" />
              </div>
              {/* Ping indicator */}
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-gold-400 rounded-full border-2 border-dark-900">
                <span className="absolute inset-0 rounded-full bg-gold-400 animate-ping opacity-75" />
              </span>
            </div>
            <div className="hidden sm:block text-left">
              <span className="font-display font-black text-lg text-white leading-none tracking-wide block group-hover:text-agro-200 transition-colors">
                ENSILADOS
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-gold-400 leading-none">
                Santa Cruz
              </span>
            </div>
          </button>

          {/* ── Desktop Nav ── */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Navegación principal">
            {navItems.map((item, i) => {
              const active = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`
                    relative px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300
                    animate-fade-in animation-delay-${(i + 1) * 100}
                    ${active
                      ? 'text-white bg-agro-500/30 border border-agro-400/30 shadow-glow-sm'
                      : 'text-white/70 hover:text-white hover:bg-white/8'}
                  `}
                  aria-current={active ? 'page' : undefined}
                >
                  {active && (
                    <span className="absolute inset-x-3 -bottom-px h-0.5 bg-gradient-to-r from-agro-400 to-gold-400 rounded-full" />
                  )}
                  <span className="relative z-10">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* ── Right Actions ── */}
          <div className="flex items-center gap-2 sm:gap-3">

            {/* Cart Button */}
            <button
              id="header-cart-btn"
              onClick={() => handleNavClick('catalog')}
              className="relative flex items-center gap-2 px-3 py-2 bg-agro-500/20 hover:bg-agro-500/35 border border-agro-400/25 rounded-xl transition-all duration-300 hover:scale-105 group"
              aria-label={`Carrito, ${cartCount} toneladas`}
            >
              <ShoppingCart className="h-4 w-4 text-agro-300 group-hover:text-white transition-colors" />
              <span
                className={`
                  min-w-[20px] h-5 flex items-center justify-center text-[11px] font-black rounded-full px-1
                  transition-all duration-300
                  ${cartCount > 0
                    ? 'bg-gradient-gold text-dark-900 shadow-gold animate-scale-in'
                    : 'bg-dark-700 text-dark-400'}
                `}
              >
                {cartCount}
              </span>
              <span className="hidden sm:block text-xs font-medium text-white/70 group-hover:text-white transition-colors">
                ton
              </span>
            </button>

            {/* User info / Logout */}
            {user ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 glass-green rounded-xl border border-agro-400/20">
                  <Leaf className="h-3.5 w-3.5 text-agro-300" />
                  <span className="text-xs font-bold text-agro-200">{user.role}</span>
                </div>
                <button
                  id="header-logout-btn"
                  onClick={onLogout}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-950/40 hover:bg-red-900/50 border border-red-700/30 rounded-xl text-red-300 hover:text-red-200 text-xs font-bold transition-all duration-300 hover:scale-105"
                  title="Cerrar Sesión"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:block">Salir</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleNavClick('admin')}
                className="hidden sm:flex items-center gap-2 btn-gold px-4 py-2 text-xs"
              >
                <span>Admin</span>
                <ChevronDown className="h-3 w-3" />
              </button>
            )}

            {/* Mobile hamburger */}
            <button
              id="mobile-menu-btn"
              onClick={() => setIsOpen(!isOpen)}
              className="md:hidden relative p-2 rounded-xl glass border border-white/10 text-white hover:border-agro-400/40 transition-all duration-200"
              aria-expanded={isOpen}
              aria-label="Menú"
            >
              <span className={`block transition-all duration-300 ${isOpen ? 'rotate-90 opacity-0 absolute' : 'rotate-0 opacity-100'}`}>
                <Menu className="h-5 w-5" />
              </span>
              <span className={`block transition-all duration-300 ${isOpen ? 'rotate-0 opacity-100' : '-rotate-90 opacity-0 absolute'}`}>
                <X className="h-5 w-5" />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile Menu ── */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-400 ease-smooth ${
          isOpen ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="glass-dark border-t border-agro-500/20 px-4 py-4 space-y-1">
          {navItems.map((item, i) => {
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold
                  transition-all duration-200 text-left
                  animate-fade-in-left animation-delay-${i * 100}
                  ${active
                    ? 'bg-agro-500/25 text-white border border-agro-400/30'
                    : 'text-white/70 hover:bg-white/6 hover:text-white'}
                `}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
                {active && <span className="ml-auto w-1.5 h-1.5 bg-agro-400 rounded-full" />}
              </button>
            );
          })}

          {user && (
            <button
              onClick={() => { onLogout(); setIsOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-red-300 hover:bg-red-950/30 transition-all"
            >
              <LogOut className="h-4 w-4" />
              <span>Cerrar Sesión</span>
              <span className="ml-auto text-xs text-dark-500">{user.email}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
