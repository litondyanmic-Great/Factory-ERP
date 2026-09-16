import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutGrid, Factory, Boxes, Users, LogOut, Menu } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { can, DEPARTMENTS } from '../lib/constants';

const NAV = [
  { to: '/', label: 'ড্যাশবোর্ড', icon: LayoutGrid, permission: null },
  { to: '/production', label: 'প্রোডাকশন', icon: Factory, permission: 'style:view' },
  { to: '/inventory', label: 'ইনভেন্টরি', icon: Boxes, permission: 'inventory:view' },
  { to: '/admin/users', label: 'ইউজার ম্যানেজমেন্ট', icon: Users, permission: 'admin:only' },
];

export default function Shell() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const deptLabel = DEPARTMENTS.find((d) => d.key === profile?.department)?.label || '';

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
          <div className="flex h-8 w-8 items-center justify-center rounded bg-amber font-display text-sm font-bold text-white">
            ও
          </div>
          <div>
            <p className="font-display text-[15px] font-semibold leading-tight">ওয়ার্মলুম ইআরপি</p>
            <p className="text-[11px] text-white/50">সোয়েটার ফ্যাক্টরি</p>
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
          <p className="truncate text-sm font-medium">{profile?.name}</p>
          <p className="truncate text-xs text-white/50">{deptLabel}</p>
          <button
            onClick={handleLogout}
            className="mt-3 flex items-center gap-2 text-sm text-white/70 hover:text-white"
          >
            <LogOut size={16} /> লগ আউট
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex w-full flex-col">
        <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
          <button onClick={() => setOpen((o) => !o)} className="text-ink">
            <Menu size={22} />
          </button>
          <p className="font-display font-semibold">ওয়ার্মলুম ইআরপি</p>
          <div className="w-[22px]" />
        </div>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
