import { useState, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, ScanFace, Users } from 'lucide-react';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { FinderAnalyticsPage } from '@/pages/FinderAnalyticsPage';
import { FinderEditorPage } from '@/pages/FinderEditorPage';
import { FindersPage } from '@/pages/FindersPage';
import { LoginPage } from '@/pages/LoginPage';
import { UsersPage } from '@/pages/UsersPage';
import { ThemeToggle } from '@/components/theme-toggle';
import { useI18n, type Locale } from '@/i18n';
import { ToastHost } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/finders', label: 'nav.finders', icon: ScanFace, adminOnly: false },
  { to: '/settings/users', label: 'nav.users', icon: Users, adminOnly: true },
] as const;

function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
        T
      </div>
      <p className="text-sm font-semibold">FM Try-On</p>
    </div>
  );
}

function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const options: { value: Locale; label: string }[] = [
    { value: 'zh', label: '中' },
    { value: 'en', label: 'EN' },
  ];
  return (
    <div className="flex rounded-md border p-0.5" role="group" aria-label={t('nav.language')}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            'h-7 rounded px-2 text-xs',
            locale === option.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setLocale(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { isAdmin } = useAuth();
  const { t } = useI18n();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors',
              isActive
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          }
        >
          <item.icon className="size-4 shrink-0" />
          {t(item.label)}
        </NavLink>
      ))}
    </nav>
  );
}

function UserFooter({ onLogout }: { onLogout: () => void }) {
  const { session } = useAuth();
  const { t } = useI18n();
  if (!session) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {session.picture ? (
          <img src={session.picture} alt="" className="size-7 rounded-full" referrerPolicy="no-referrer" />
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-xs" title={session.email}>
            {session.email}
          </p>
          <p className="text-xs text-muted-foreground">{t(`role.${session.role}`)}</p>
        </div>
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={onLogout}>
        {t('nav.logout')}
      </Button>
    </div>
  );
}

function Shell() {
  const nav = useNavigate();
  const { logout } = useAuth();
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function onLogout() {
    setMobileOpen(false);
    await logout();
    nav('/login');
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden md:flex-row">
      <aside className="hidden h-full w-60 shrink-0 flex-col border-r bg-background md:flex">
        <div className="flex h-12 shrink-0 items-center border-b px-4">
          <BrandMark />
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <NavLinks />
          <div className="mt-auto space-y-3 pt-6">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{t('nav.language')}</span>
              <LanguageToggle />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{t('nav.appearance')}</span>
              <ThemeToggle />
            </div>
            <UserFooter onLogout={() => void onLogout()} />
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden">
          <BrandMark />
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="icon" aria-label={t('nav.openMenu')}>
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-full">
                <SheetHeader className="items-start border-b px-4 py-4">
                  <SheetTitle className="sr-only">{t('nav.menu')}</SheetTitle>
                  <BrandMark />
                </SheetHeader>
                <div className="flex h-full flex-1 flex-col p-4">
                  <NavLinks onNavigate={() => setMobileOpen(false)} />
                  <Separator className="my-4" />
                  <div className="mt-auto">
                    <UserFooter onLogout={() => void onLogout()} />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto bg-muted/30">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { loading, session, isAdmin } = useAuth();
  const location = useLocation();
  const { t } = useI18n();
  if (loading) return <p className="p-6 text-sm text-muted-foreground">{t('auth.checking')}</p>;
  if (!session) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} replace />;
  }
  if (admin && !isAdmin) return <Navigate to="/finders" replace />;
  return <>{children}</>;
}

function Root() {
  return (
    <AuthProvider>
      <Outlet />
      <ToastHost />
    </AuthProvider>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        element: (
          <RequireAuth>
            <Shell />
          </RequireAuth>
        ),
        children: [
          { path: '/', element: <Navigate to="/finders" replace /> },
          { path: '/finders', element: <FindersPage /> },
          { path: '/finders/:id', element: <FinderEditorPage /> },
          { path: '/finders/:id/analytics', element: <FinderAnalyticsPage /> },
          {
            path: '/settings/users',
            element: (
              <RequireAuth admin>
                <UsersPage />
              </RequireAuth>
            ),
          },
          { path: '*', element: <Navigate to="/finders" replace /> },
        ],
      },
    ],
  },
]);
