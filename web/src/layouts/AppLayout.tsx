import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const setupLinks = [
  { to: '/settings', label: 'Parametres' },
  { to: '/activities', label: 'Activites' },
];

const analysisLinks = [
  { to: '/analytics', label: 'Analyse' },
  { to: '/training-plan', label: "Plan d'entrainement" },
  { to: '/export', label: 'Export CSV' },
];

export function AppLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const isStravaConnected = !!user?.connectedToStrava;
  const hasImportedActivities = !!user?.hasImportedActivities;
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const fullLinks = useMemo(() => {
    const links = [
      ...setupLinks,
      ...(hasImportedActivities ? analysisLinks : []),
    ];
    return user?.isAdmin ? [...links, { to: '/admin', label: 'Administration' }] : links;
  }, [hasImportedActivities, user?.isAdmin]);

  useEffect(() => {
    setMobileSheetOpen(false);
  }, [location.pathname]);

  if (!isStravaConnected) {
    return (
      <div className='min-h-screen overflow-x-hidden bg-grain bg-[size:14px_14px]'>
        <div className='mx-auto max-w-[980px] px-3 py-4 sm:px-4 sm:py-6 lg:px-8'>
          <header className='mb-4 flex items-start justify-between gap-3 rounded-2xl border border-black/10 bg-panel p-3 shadow-panel'>
            <div>
              <p className='text-lg font-semibold'>StravHat</p>
              <p className='mt-1 text-xs text-muted'>
                Configuration Strava requise pour debloquer l'application.
              </p>
            </div>
            <button
              className='inline-flex h-9 items-center justify-center rounded-lg border border-black/20 px-3 text-xs hover:bg-black/5'
              onClick={logout}
              type='button'
            >
              Deconnexion
            </button>
          </header>
          {user?.isAdmin ? (
            <div className='mb-4'>
              <Link
                className='inline-flex h-9 items-center justify-center rounded-lg border border-black/20 px-3 text-xs hover:bg-black/5'
                to='/admin'
              >
                Administration
              </Link>
            </div>
          ) : null}
          <main className='min-w-0 space-y-6 overflow-x-hidden'>
            <Outlet />
          </main>
        </div>
      </div>
    );
  }

  const mobileQuickLinks =
    hasImportedActivities ?
      [
        { to: '/analytics', label: 'Analyse' },
        { to: '/activities', label: 'Activites' },
        { to: '/settings', label: 'Parametres' },
      ]
    : [
        { to: '/settings', label: 'Parametres' },
        { to: '/activities', label: 'Activites' },
      ];
  const mobileMoreLinks = fullLinks.filter(
    (link) => !mobileQuickLinks.some((quickLink) => quickLink.to === link.to),
  );
  const hasMobileMoreLinks = mobileMoreLinks.length > 0;

  const desktopNavContent = (
    <nav className='grid grid-cols-1 gap-1'>
      {fullLinks.map((link) => {
        const active = location.pathname.startsWith(link.to);
        return (
          <Link
            className={`block truncate rounded-xl px-3 py-2 text-sm transition ${
              active ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'
            }`}
            key={link.to}
            to={link.to}
            onClick={() => setMobileSheetOpen(false)}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );

  const mobileSheetNavContent =
    mobileMoreLinks.length > 0 ? (
      <nav className='grid grid-cols-1 gap-1.5'>
        {mobileMoreLinks.map((link) => {
          const active = location.pathname.startsWith(link.to);
          return (
            <Link
              className={`block rounded-xl px-3 py-2.5 text-sm transition ${
                active ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'
              }`}
              key={link.to}
              to={link.to}
              onClick={() => setMobileSheetOpen(false)}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    ) : (
      <p className='text-xs text-muted'>Aucune section supplementaire.</p>
    );

  return (
    <div className='min-h-screen overflow-x-hidden bg-grain bg-[size:14px_14px]'>
      <div className='mx-auto max-w-[1400px] px-3 py-4 sm:px-4 sm:py-6 lg:px-8'>
        <header className='mb-4 rounded-2xl border border-black/10 bg-panel p-3 shadow-panel lg:hidden'>
          <p className='text-lg font-semibold'>StravHat</p>
          <p className='mt-1 text-xs text-muted'>
            ID athlete: {user?.stravaAthleteId ?? 'non lie'}
          </p>
        </header>

        {mobileSheetOpen ? (
          <>
            <button
              aria-label='Fermer le panneau'
              className='fixed inset-0 z-40 bg-black/35 lg:hidden'
              onClick={() => setMobileSheetOpen(false)}
              type='button'
            />
            <section className='fixed inset-x-0 bottom-0 z-50 max-h-[76vh] rounded-t-2xl border border-black/10 bg-panel p-4 shadow-panel lg:hidden'>
              <div className='mb-4 flex items-center justify-between gap-3'>
                <div>
                  <p className='text-sm font-semibold'>Menu mobile</p>
                  <p className='text-xs text-muted'>
                    Sections secondaires et compte
                  </p>
                </div>
                <button
                  className='inline-flex h-9 items-center justify-center rounded-lg border border-black/20 px-3 text-xs hover:bg-black/5'
                  onClick={() => setMobileSheetOpen(false)}
                  type='button'
                >
                  Fermer
                </button>
              </div>
              {mobileSheetNavContent}
              <button
                className='mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-black/20 px-3 text-sm hover:bg-black/5'
                onClick={logout}
                type='button'
              >
                Deconnexion
              </button>
            </section>
          </>
        ) : null}

        <div className='grid gap-4 sm:gap-6 lg:grid-cols-[250px_minmax(0,1fr)]'>
          <aside className='hidden min-w-0 rounded-2xl border border-black/10 bg-panel p-4 shadow-panel lg:sticky lg:top-6 lg:block lg:h-[calc(100vh-3rem)]'>
            <div className='mb-6'>
              <p className='text-lg font-semibold'>StravHat</p>
              <p className='mt-2 text-xs text-muted'>
                ID athlete: {user?.stravaAthleteId ?? 'non lie'}
              </p>
            </div>
            {desktopNavContent}
            <button
              className='mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-black/20 px-3 text-sm hover:bg-black/5'
              onClick={logout}
              type='button'
            >
              Deconnexion
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
            className='grid gap-1'
            style={{
              gridTemplateColumns: `repeat(${mobileQuickLinks.length + (hasMobileMoreLinks ? 1 : 0)}, minmax(0, 1fr))`,
            }}
          >
            {mobileQuickLinks.map((link) => {
              const active = location.pathname.startsWith(link.to);
              return (
                <Link
                  key={`quick-${link.to}`}
                  to={link.to}
                  className={`inline-flex h-10 min-w-0 items-center justify-center rounded-lg px-1 text-center text-[10px] font-medium leading-none whitespace-nowrap transition ${
                    active ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            {hasMobileMoreLinks ? (
              <button
                type='button'
                onClick={() => setMobileSheetOpen(true)}
                className='inline-flex h-10 min-w-0 items-center justify-center rounded-lg px-1 text-center text-[10px] font-medium leading-none whitespace-nowrap text-ink transition hover:bg-black/5'
              >
                Plus
              </button>
            ) : null}
          </div>
        </div>
      </nav>
    </div>
  );
}
