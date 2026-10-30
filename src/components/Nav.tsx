import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, LogIn, LogOut, User as UserIcon, LayoutDashboard, ShieldCheck, GraduationCap,
  Gamepad2, Map, Clock, Users, BookOpen, Trophy, Award, Volume2, VolumeX,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { soundPrefs, playSfx, primeAudio } from '../lib/sound';
import { rankFor } from '@shared/gamification';

export const NAV_ITEMS = [
  { to: '/', label: 'Басты бет', icon: LayoutDashboard },
  { to: '/oyyndar', label: 'Ойындар әлемі', icon: Gamepad2 },
  { to: '/map', label: 'Интерактивті карта', icon: Map },
  { to: '/timeline', label: 'Уақыт шкаласы', icon: Clock },
  { to: '/tulgalar', label: 'Тарихи тұлғалар', icon: Users },
  { to: '/entsiklopediya', label: 'Энциклопедия', icon: BookOpen },
  { to: '/reiting', label: 'Рейтинг', icon: Trophy },
  { to: '/zhetistikter', label: 'Жетістіктер', icon: Award },
];

export function Nav() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(soundPrefs.muted);
  const loc = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [loc.pathname]);

  const rank = user ? rankFor(user.xp) : null;

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#070b14]/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-3 sm:px-5 h-14 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            <span className="w-9 h-9 rounded-xl grid place-items-center bg-gradient-to-br from-gold/25 to-teal/20 border border-gold/35 group-hover:border-gold/60 transition-colors">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M12 2.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 15.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="#d9a94a" />
              </svg>
            </span>
            <span className="leading-none hidden sm:block">
              <span className="block font-display text-[13px] text-parchment tracking-wide">ҚАЗАҚСТАН ТАРИХЫ</span>
              <span className="block text-[9px] tracking-[0.22em] text-gold/70 mt-0.5">HISTORY GAME ARENA</span>
            </span>
          </Link>

          <nav className="hidden xl:flex items-center gap-0.5 ml-2">
            {NAV_ITEMS.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                className={({ isActive }) =>
                  `px-2.5 py-1.5 rounded-lg text-[12.5px] transition-colors ${
                    isActive ? 'text-gold bg-gold/10' : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`
                }
              >
                {it.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => {
                const next = !muted;
                soundPrefs.muted = next;
                setMuted(next);
                if (!next) { primeAudio(); playSfx('click'); }
              }}
              className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5"
              aria-label={muted ? 'Дыбысты қосу' : 'Дыбысты өшіру'}
              title={muted ? 'Дыбыс өшірулі' : 'Дыбыс қосулы'}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>

            {user ? (
              <div className="flex items-center gap-1.5">
                <Link
                  to="/profil"
                  className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5"
                  title="Менің профилім"
                >
                  <span className="w-7 h-7 rounded-full bg-gradient-to-br from-teal/30 to-gold/25 border border-white/15 grid place-items-center text-[10px] font-semibold text-parchment">
                    {user.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="leading-none">
                    <span className="block text-[11.5px] text-parchment max-w-[110px] truncate">{user.name}</span>
                    <span className="block text-[9px] text-gold/70 mt-0.5">{rank?.title} · {user.xp} XP</span>
                  </span>
                </Link>
                {(user.role === 'teacher' || user.role === 'admin') && (
                  <Link to="/oqytushy" className="p-2 rounded-lg text-white/55 hover:text-teal hover:bg-white/5" title="Оқытушы кабинеті">
                    <GraduationCap size={16} />
                  </Link>
                )}
                {user.role === 'admin' && (
                  <Link to="/admin" className="p-2 rounded-lg text-white/55 hover:text-gold hover:bg-white/5" title="Әкімшілік панель">
                    <ShieldCheck size={16} />
                  </Link>
                )}
                <button
                  onClick={() => void logout().then(() => navigate('/'))}
                  className="p-2 rounded-lg text-white/50 hover:text-[#e08a6a] hover:bg-white/5"
                  aria-label="Шығу"
                  title="Шығу"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <Link to="/kiru" className="btn btn-gold px-3.5 py-1.5 text-xs">
                <LogIn size={14} /> Кіру
              </Link>
            )}

            <button className="xl:hidden p-2 rounded-lg text-white/70 hover:bg-white/5" onClick={() => setOpen((o) => !o)} aria-label="Мәзір">
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {open && (
          <div className="xl:hidden border-t border-white/8 bg-[#0a0f1c]/98 px-3 py-2 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-1.5">
              {NAV_ITEMS.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                      isActive ? 'text-gold bg-gold/10' : 'text-white/65 hover:bg-white/5'
                    }`
                  }
                >
                  <it.icon size={15} /> {it.label}
                </NavLink>
              ))}
              <NavLink to="/profil" className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-white/65 hover:bg-white/5">
                <UserIcon size={15} /> Менің профилім
              </NavLink>
              {(user?.role === 'teacher' || user?.role === 'admin') && (
                <NavLink to="/oqytushy" className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-white/65 hover:bg-white/5">
                  <GraduationCap size={15} /> Оқытушы кабинеті
                </NavLink>
              )}
              {user?.role === 'admin' && (
                <NavLink to="/admin" className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-white/65 hover:bg-white/5">
                  <ShieldCheck size={15} /> Әкімшілік панель
                </NavLink>
              )}
            </div>
          </div>
        )}
      </header>
    </>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/8 mt-12 py-8 px-4">
      <div className="max-w-7xl mx-auto grid sm:grid-cols-3 gap-6 text-xs text-white/40">
        <div>
          <p className="font-display text-sm text-parchment mb-2">ҚАЗАҚСТАН ТАРИХЫ | HISTORY GAME ARENA</p>
          <p className="leading-relaxed">
            Қазақстан тарихы бойынша интерактивті білім беру платформасы. Алты ойын, 60 деңгей,
            тарихи карта, уақыт шкаласы және тұлғалар базасы.
          </p>
        </div>
        <div>
          <p className="text-white/60 mb-2 font-semibold">Тарихи дәлдік</p>
          <p className="leading-relaxed">
            Мәліметтер академиялық басылымдарға, Қазақстан Ұлттық энциклопедиясына, e-history.kz
            порталына және мұражай материалдарына сүйенеді. Даулы мәселелер ерекше белгіленеді.
          </p>
        </div>
        <div>
          <p className="text-white/60 mb-2 font-semibold">Ескерту</p>
          <p className="leading-relaxed">
            Барлық бейнелер — стильденген иллюстрациялар, тарихи фотосурет емес. Карта шекаралары
            схемалық сипатта берілген. Ойын сценарийлері ойдан шығарылған және тарихи оқиға
            ретінде көрсетілмейді.
          </p>
        </div>
      </div>
      <p className="text-center text-[10px] text-white/25 mt-6">
        © 2026 ҚАЗАҚСТАН ТАРИХЫ | HISTORY GAME ARENA · білім беру мақсатындағы жоба
      </p>
    </footer>
  );
}
