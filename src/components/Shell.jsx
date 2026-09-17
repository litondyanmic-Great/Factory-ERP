import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutGrid, Factory, Boxes, Users, LogOut, Menu, ShieldCheck, Settings as SettingsIcon, Languages, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { can, departmentLabel } from '../lib/constants';
import { useLang } from '../lib/i18n';
import { useSettings } from '../lib/settingsContext';

export default function Shell() {
  const { profile, logout } = useAuth();
  const { t, lang, toggle } = useLang();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const showBack = location.pathname !== '/';

  const NAV = [
    { to: '/', label: t('ড্যাশবোর্ড', 'Dashboard'), icon: LayoutGrid, permission: null },
    { to: '/production', label: t('প্রোডাকশন', 'Production'), icon: Factory, permission: 'style:view' },
    { to: '/inventory', label: t('ইনভেন্টরি', 'Inventory'), icon: Boxes, permission: 'inventory:view' },
    { to: '/quality', label: t('কোয়ালিটি', 'Quality'), icon: ShieldCheck, permission: 'quality:view' },
    { to: '/admin/users', label: t('ইউজার ম্যানেজমেন্ট', 'User Management'), icon: Users, permission: 'admin:only' },
    { to: '/admin/settings', label: t('সেটিংস', 'Settings'), icon: SettingsIcon, permission: 'admin:only' },
  ];

  const deptLabel = departmentLabel(profile?.department, lang);
  const companyName = lang === 'en' ? settings?.companyNameEn || settings?.companyName : settings?.companyName;

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const items = NAV.filter((item) => {
    if (item.permission === 'admin:only') return profile?.role === 'admin';
    if (!item.permission) return true;
    return can(profile?.role, item.permission);
  });

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={`${open ? 'flex' : 'hidden'} md:flex fixed md:static inset-0 z-40 w-64 shrink-0 flex-col bg-indigo-deep text-white`}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-6 py-5">
          {settings?.logoDataUrl ? (
            <img src={settings.logoDataUrl} alt="logo" className="h-8 w-8 rounded object-contain bg-white/10" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded bg-amber font-display text-sm font-bold text-white">
              {companyName?.[0] || 'ও'}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-semibold leading-tight">{companyName}</p>
            <p className="text-[11px] text-white/50">{t('সোয়েটার ফ্যাক্টরি', 'Sweater Factory')}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-white/10 font-medium text-white'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <Icon size={18} strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 px-4 py-4">
          <button
            onClick={toggle}
            className="mb-3 flex w-full items-center gap-2 rounded-md border border-white/15 px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/5"
          >
            <Languages size={14} /> {lang === 'bn' ? 'English' : 'বাংলা'}
          </button>
          <p className="truncate text-sm font-medium">{profile?.name}</p>
          <p className="truncate text-xs text-white/50">{deptLabel}</p>
          <button
            onClick={handleLogout}
            className="mt-3 flex items-center gap-2 text-sm text-white/70 hover:text-white"
          >
            <LogOut size={16} /> {t('লগ আউট', 'Log out')}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex w-full flex-col">
        <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
          <button onClick={() => setOpen((o) => !o)} className="text-ink">
            <Menu size={22} />
          </button>
          <p className="font-display font-semibold">{companyName}</p>
          <button onClick={toggle} className="text-ink-soft">
            <Languages size={20} />
          </button>
        </div>
        {showBack && (
          <div className="border-b border-line bg-surface px-4 py-2.5 md:px-8">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
            >
              <ArrowLeft size={16} /> {t('পেছনে যান', 'Back')}
            </button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
