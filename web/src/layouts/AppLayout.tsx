import { useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import type { I18nMessageKey } from '../i18n/catalog';
import { useI18n } from '../i18n/framework';
import { useAuth } from '../contexts/AuthContext';

type NavIconName =
  | 'settings'
  | 'activities'
  | 'analytics'
  | 'training'
  | 'export'
  | 'admin';

type LinkDef = {
  to: string;
  labelKey: I18nMessageKey;
  icon: NavIconName;
};

const setupLinkDefs: LinkDef[] = [
  { to: '/settings', labelKey: 'nav.settings', icon: 'settings' },
  { to: '/activities', labelKey: 'nav.activities', icon: 'activities' },
];

const analysisLinkDefs: LinkDef[] = [
  { to: '/analytics', labelKey: 'nav.analytics', icon: 'analytics' },
  { to: '/training-plan', labelKey: 'nav.trainingPlan', icon: 'training' },
  { to: '/export', labelKey: 'nav.exportCsv', icon: 'export' },
];

function isActivePath(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavIcon({ name, active }: { name: NavIconName; active: boolean }) {
  const commonClass = `h-4 w-4 ${active ? 'text-white' : 'text-ink'}`;

  switch (name) {
    case 'settings':
      return (
        <svg
          aria-hidden='true'
          className={commonClass}
          fill='none'
          stroke='currentColor'
          strokeWidth='1.8'
          viewBox='0 0 24 24'
        >
          <path
            d='M12 3v2.5m0 13V21m9-9h-2.5M5.5 12H3m14.86-6.36-1.77 1.77M7.91 16.09l-1.77 1.77m0-12.22 1.77 1.77m8.18 8.18 1.77 1.77M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </svg>
      );
    case 'activities':
      return (
        <svg
          aria-hidden='true'
          className={commonClass}
          fill='none'
          stroke='currentColor'
          strokeWidth='1.8'
          viewBox='0 0 24 24'
        >
          <path
            d='M4 6h16M4 12h16M4 18h16M7 6v12'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </svg>
      );
    case 'analytics':
      return (
        <svg
          aria-hidden='true'
          className={commonClass}
          fill='none'
          stroke='currentColor'
          strokeWidth='1.8'
          viewBox='0 0 24 24'
        >
          <path
            d='M4 19h16M7 16v-5m5 5V7m5 9v-3'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </svg>
      );
    case 'training':
      return (
        <svg
          aria-hidden='true'
          className={commonClass}
          fill='none'
          stroke='currentColor'
          strokeWidth='1.8'
          viewBox='0 0 24 24'
        >
          <path
            d='M6 4h10l2 2v14H6V4Zm4 3h5M9 11h6m-6 4h6'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </svg>
      );
    case 'export':
      return (
        <svg
          aria-hidden='true'
          className={commonClass}
          fill='none'
          stroke='currentColor'
          strokeWidth='1.8'
          viewBox='0 0 24 24'
        >
          <path
            d='M12 4v10m0 0 4-4m-4 4-4-4M5 19h14'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </svg>
      );
    case 'admin':
      return (
        <svg
          aria-hidden='true'
          className={commonClass}
          fill='none'
          stroke='currentColor'
          strokeWidth='1.8'
          viewBox='0 0 24 24'
        >
          <path
            d='M12 3 5 6v5c0 4.2 2.9 8.1 7 9 4.1-.9 7-4.8 7-9V6l-7-3Zm0 6v7m0 0-3-3m3 3 3-3'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </svg>
      );
  }
}

export function AppLayout() {
  const location = useLocation();
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const isStravaConnected = !!user?.connectedToStrava;
  const hasImportedActivities = !!user?.hasImportedActivities;

  const fullLinks = useMemo(() => {
    const links = [
      ...setupLinkDefs,
      ...(hasImportedActivities ? analysisLinkDefs : []),
    ].map((link) => ({
      to: link.to,
      label: t(link.labelKey),
      icon: link.icon,
    }));

    if (user?.isAdmin) {
      links.push({ to: '/admin', label: t('nav.admin'), icon: 'admin' });
    }

    return links;
  }, [hasImportedActivities, t, user?.isAdmin]);

  if (!isStravaConnected) {
    return (
      <div className='min-h-screen overflow-x-hidden bg-grain bg-[size:14px_14px]'>
        <div className='mx-auto max-w-[980px] px-3 py-4 sm:px-4 sm:py-6 lg:px-8'>
          <header className='mb-4 flex items-start justify-between gap-3 rounded-2xl border border-black/10 bg-panel p-3 shadow-panel'>
            <div>
              <p className='text-lg font-semibold'>StravHat</p>
              <p className='mt-1 text-xs text-muted'>
                {t('layout.stravaSetupRequired')}
              </p>
            </div>
            <button
              className='inline-flex h-9 items-center justify-center rounded-lg border border-black/20 px-3 text-xs hover:bg-black/5'
              onClick={logout}
              type='button'
            >
              {t('common.logout')}
            </button>
          </header>
          {user?.isAdmin ? (
            <div className='mb-4'>
              <Link
                className='inline-flex h-9 items-center justify-center rounded-lg border border-black/20 px-3 text-xs hover:bg-black/5'
                to='/admin'
              >
                {t('nav.admin')}
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

  const desktopNavContent = (
    <nav className='grid grid-cols-1 gap-1'>
      {fullLinks.map((link) => {
        const active = isActivePath(location.pathname, link.to);
        return (
          <Link
            className={`block truncate rounded-xl px-3 py-2 text-sm transition ${
              active ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'
            }`}
            key={link.to}
            to={link.to}
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
        <header className='mb-4 rounded-2xl border border-black/10 bg-panel p-3 shadow-panel lg:hidden'>
          <p className='text-lg font-semibold'>StravHat</p>
          <p className='mt-1 text-xs text-muted'>
            {t('common.athleteId')}: {user?.stravaAthleteId ?? t('common.notLinked')}
          </p>
        </header>

        <div className='grid gap-4 sm:gap-6 lg:grid-cols-[250px_minmax(0,1fr)]'>
          <aside className='hidden min-w-0 rounded-2xl border border-black/10 bg-panel p-4 shadow-panel lg:sticky lg:top-6 lg:block lg:h-[calc(100vh-3rem)]'>
            <div className='mb-6'>
              <p className='text-lg font-semibold'>StravHat</p>
              <p className='mt-2 text-xs text-muted'>
                {t('common.athleteId')}: {user?.stravaAthleteId ?? t('common.notLinked')}
              </p>
            </div>
            {desktopNavContent}
            <button
              className='mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-black/20 px-3 text-sm hover:bg-black/5'
              onClick={logout}
              type='button'
            >
              {t('common.logout')}
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
              gridTemplateColumns: `repeat(${fullLinks.length}, minmax(0, 1fr))`,
            }}
          >
            {fullLinks.map((link) => {
              const active = isActivePath(location.pathname, link.to);
              return (
                <Link
                  key={`mobile-${link.to}`}
                  to={link.to}
                  title={link.label}
                  className={`inline-flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 transition ${
                    active ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'
                  }`}
                >
                  <NavIcon active={active} name={link.icon} />
                  <span className='block w-full truncate text-center text-[9px] font-medium leading-none'>
                    {link.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
