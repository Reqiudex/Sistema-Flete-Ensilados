import { Phone, MapPin, Mail, Sprout, ExternalLink, Heart, ArrowUpRight } from 'lucide-react';

export default function Footer() {
  const year = new Date().getFullYear();

  const services = [
    { icon: '🚜', text: 'Preparación y Siembra' },
    { icon: '💧', text: 'Sistemas de Riego Rural' },
    { icon: '🌾', text: 'Cosecha Mecanizada' },
    { icon: '🚁', text: 'Fumigación Terrestre y Aérea' },
    { icon: '🏗️', text: 'Almacenamiento en Silos' },
  ];

  const contactItems = [
    { icon: MapPin, text: 'San Ramón, Santa Cruz, Bolivia', href: 'https://maps.google.com/?q=San+Ramon+Santa+Cruz+Bolivia' },
    { icon: Phone, text: '+591 789 45612', href: 'tel:+59178945612' },
    { icon: Mail, text: 'info@ensiladossantacruz.com', href: 'mailto:info@ensiladossantacruz.com' },
  ];

  return (
    <footer className="relative bg-dark-950 border-t border-agro-600/20 overflow-hidden">

      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-agro-600/5 rounded-full blur-3xl" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gold-500/3 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-dot-pattern opacity-30" />
      </div>

      {/* Top gradient border */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-agro-500/40 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">

          {/* ── Brand Block ── */}
          <div className="lg:col-span-1 space-y-5 animate-fade-in-up">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-agro rounded-xl flex items-center justify-center shadow-glow-sm">
                <Sprout className="h-5 w-5 text-white animate-sway" />
              </div>
              <div>
                <span className="font-display font-black text-lg text-white leading-none tracking-wide block">
                  ENSILADOS
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-gold-400">
                  Santa Cruz
                </span>
              </div>
            </div>

            <p className="text-sm text-dark-300 leading-relaxed">
              Líderes en nutrición ganadera y logística agrícola en el departamento de Santa Cruz. Eliminamos la gestión manual con tecnología de punta.
            </p>

            {/* Status badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 glass-green rounded-full border border-agro-400/20">
              <span className="relative w-2 h-2">
                <span className="absolute inset-0 bg-green-400 rounded-full animate-ping opacity-60" />
                <span className="absolute inset-0 bg-green-400 rounded-full" />
              </span>
              <span className="text-xs text-agro-200 font-medium">Operando 24/7 — Temporada Cosecha</span>
            </div>
          </div>

          {/* ── Contact ── */}
          <div className="space-y-4 animate-fade-in-up animation-delay-100">
            <h4 className="font-display font-bold text-white text-base flex items-center gap-2">
              <span className="w-6 h-6 bg-agro-500/30 rounded-lg flex items-center justify-center text-xs">📍</span>
              Central de Silos
            </h4>
            <ul className="space-y-3">
              {contactItems.map(({ icon: Icon, text, href }) => (
                <li key={text}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 text-sm text-dark-300 hover:text-agro-300 transition-colors duration-200 group"
                  >
                    <Icon className="h-4 w-4 text-agro-500 shrink-0 mt-0.5 group-hover:text-gold-400 transition-colors" />
                    <span className="leading-snug">{text}</span>
                    <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0 mt-0.5" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Services ── */}
          <div className="space-y-4 animate-fade-in-up animation-delay-200">
            <h4 className="font-display font-bold text-white text-base flex items-center gap-2">
              <span className="w-6 h-6 bg-agro-500/30 rounded-lg flex items-center justify-center text-xs">⚡</span>
              Nuestros Servicios
            </h4>
            <ul className="space-y-2">
              {services.map(({ icon, text }) => (
                <li
                  key={text}
                  className="flex items-center gap-2 text-sm text-dark-300 hover:text-white transition-colors cursor-default group"
                >
                  <span className="text-base group-hover:scale-110 transition-transform">{icon}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Hours & CTA ── */}
          <div className="space-y-4 animate-fade-in-up animation-delay-300">
            <h4 className="font-display font-bold text-white text-base flex items-center gap-2">
              <span className="w-6 h-6 bg-agro-500/30 rounded-lg flex items-center justify-center text-xs">🕐</span>
              Horario de Atención
            </h4>
            <ul className="space-y-2 text-sm text-dark-300">
              <li className="flex justify-between">
                <span>Lun – Vie</span>
                <span className="text-agro-300 font-semibold">07:00 – 18:00</span>
              </li>
              <li className="flex justify-between">
                <span>Sábado</span>
                <span className="text-agro-300 font-semibold">07:00 – 13:00</span>
              </li>
              <li className="flex justify-between">
                <span>Domingo</span>
                <span className="text-dark-500">Cerrado</span>
              </li>
            </ul>

            <div className="p-3 glass-gold rounded-xl">
              <p className="text-xs text-gold-300 font-semibold">
                🌙 Despacho logístico 24/7 durante época de cosecha
              </p>
            </div>

            {/* WhatsApp CTA */}
            <a
              href="https://wa.me/59178945612"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 w-full btn-agro px-4 py-2.5 text-xs justify-center rounded-xl"
            >
              <span className="text-base">💬</span>
              <span>WhatsApp Directo</span>
              <ExternalLink className="h-3 w-3 ml-auto" />
            </a>
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="divider-agro mb-6" />

        {/* ── Bottom Bar ── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-dark-500">
          <p>© {year} Ensilados Santa Cruz — Todos los derechos reservados.</p>
          <p className="flex items-center gap-1.5">
            <span>Desarrollado con</span>
            <Heart className="h-3 w-3 text-red-500 animate-heartbeat" />
            <span>para la agricultura boliviana</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
