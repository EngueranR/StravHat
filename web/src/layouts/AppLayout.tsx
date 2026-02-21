import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const fullLinks = [
  { to: '/import', label: 'Import Center' },
  { to: '/activities', label: 'Activities' },
  { to: '/analytics', label: 'Analytics Lab' },
  { to: '/training-plan', label: 'Training Plan' },
  { to: '/correlations', label: 'Correlation Builder' },
  { to: '/export', label: 'Export CSV' },
  { to: '/strava-credentials', label: 'Strava Credentials' },
  { to: '/settings', label: 'Settings' },
];

export function AppLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const isStravaConnected = !!user?.connectedToStrava;
  const links =
    isStravaConnected ?
      fullLinks
    : [
        { to: '/connect-strava', label: 'Connect Strava' },
        { to: '/strava-credentials', label: 'Strava Credentials' },
        { to: '/settings', label: 'Settings' },
      ];
  const mobileQuickLinks =
    isStravaConnected ?
      [
        { to: '/analytics', label: 'Analytics' },
        { to: '/import', label: 'Import' },
        { to: '/activities', label: 'Activities' },
        { to: '/settings', label: 'Settings' },
      ]
    : [
        { to: '/connect-strava', label: 'Connect' },
        { to: '/strava-credentials', label: 'Credentials' },
        { to: '/settings', label: 'Settings' },
      ];
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const desktopNavContent = (
    <nav className='grid grid-cols-1 gap-1'>
      {links.map((link) => {
        const active = location.pathname.startsWith(link.to);
        return (
          <Link
            className={`block truncate rounded-xl px-3 py-2 text-sm transition ${
              active ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'
            }`}
            key={link.to}
            to={link.to}
            onClick={() => setMobileMenuOpen(false)}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );

  const mobileDrawerNavContent = (
    <nav className='grid grid-cols-1 gap-1.5'>
      {links.map((link) => {
        const active = location.pathname.startsWith(link.to);
        return (
          <Link
            className={`block rounded-xl px-3 py-2.5 text-sm transition ${
              active ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'
            }`}
            key={link.to}
            to={link.to}
            onClick={() => setMobileMenuOpen(false)}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className='min-h-screen overflow-x-hidden bg-grain bg-[size:14px_14px]'>
      <div className='mx-auto max-w-[1400px] px-3 py-4 sm:px-4 sm:py-6 lg:px-8'>
        <header className='mb-4 flex items-center justify-between rounded-2xl border border-black/10 bg-panel p-3 shadow-panel lg:hidden'>
          <div>
            <p className='text-lg font-semibold'>StravHat</p>
            <p className='mt-1 text-xs text-muted'>
              Athlete ID: {user?.stravaAthleteId ?? 'not linked'}
            </p>
            {!isStravaConnected ? (
              <p className='mt-1 text-[11px] text-amber-700'>OAuth Strava requis</p>
            ) : null}
          </div>
          <button
            className='inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/20 text-xl hover:bg-black/5'
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            type='button'
            aria-label='Ouvrir le menu'
            title='Menu'
          >
            {mobileMenuOpen ? '×' : '☰'}
          </button>
        </header>

        {mobileMenuOpen ? (
          <>
            <button
              aria-label='Fermer le menu'
              className='fixed inset-0 z-40 bg-black/35 lg:hidden'
              onClick={() => setMobileMenuOpen(false)}
              type='button'
            />
            <aside className='fixed inset-y-0 left-0 z-50 w-[min(86vw,320px)] rounded-r-2xl border-r border-black/10 bg-panel p-4 shadow-panel lg:hidden'>
              <div className='mb-6'>
                <p className='text-lg font-semibold'>StravHat</p>
                <p className='mt-1 text-xs text-muted'>
                  Athlete ID: {user?.stravaAthleteId ?? 'not linked'}
                </p>
                {!isStravaConnected ? (
                  <p className='mt-1 text-[11px] text-amber-700'>OAuth Strava requis</p>
                ) : null}
              </div>
              {mobileDrawerNavContent}
              <button
                className='mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-black/20 px-3 text-sm hover:bg-black/5'
                onClick={logout}
                type='button'
              >
                Logout
              </button>
            </aside>
          </>
        ) : null}

        <div className='grid gap-4 sm:gap-6 lg:grid-cols-[250px_minmax(0,1fr)]'>
          <aside className='hidden min-w-0 rounded-2xl border border-black/10 bg-panel p-4 shadow-panel lg:sticky lg:top-6 lg:block lg:h-[calc(100vh-3rem)]'>
            <div className='mb-6'>
              <p className='text-xs uppercase tracking-wide text-muted'></p>
              <p className='text-lg font-semibold'>StravHat</p>
              <p className='mt-2 text-xs text-muted'>
                Athlete ID: {user?.stravaAthleteId ?? 'not linked'}
              </p>
              {!isStravaConnected ? (
                <p className='mt-1 text-[11px] text-amber-700'>OAuth Strava requis</p>
              ) : null}
            </div>
            {desktopNavContent}
            <button
              className='mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-black/20 px-3 text-sm hover:bg-black/5'
              onClick={logout}
              type='button'
            >
              Logout
            </button>
          </aside>
          <main className='min-w-0 space-y-6 overflow-x-hidden pb-28 lg:pb-8'>
            <Outlet />
          </main>
        </div>
      </div>

      <nav className='mobile-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-black/10 bg-panel/95 px-2 py-2 shadow-panel backdrop-blur lg:hidden'>
        <div className='mx-auto max-w-[1400px]'>
          <div
            className={`grid gap-1 ${
              mobileQuickLinks.length >= 4 ? 'grid-cols-5' : 'grid-cols-4'
            }`}
          >
            {mobileQuickLinks.map((link) => {
              const active = location.pathname.startsWith(link.to);
              return (
                <Link
                  key={`quick-${link.to}`}
                  to={link.to}
                  className={`inline-flex h-10 min-w-0 items-center justify-center rounded-lg px-2 text-center text-[11px] font-medium transition ${
                    active ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <button
              type='button'
              onClick={() => setMobileMenuOpen(true)}
              className='inline-flex h-10 min-w-0 items-center justify-center rounded-lg px-2 text-center text-[11px] font-medium text-ink transition hover:bg-black/5'
            >
              Menu
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
}
