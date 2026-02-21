import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import type { I18nMessageKey } from '../i18n/catalog';
import { useI18n } from '../i18n/framework';
import { useAuth } from '../contexts/AuthContext';

type LinkDef = {
  to: string;
  labelKey: I18nMessageKey;
};

const setupLinkDefs: LinkDef[] = [
  { to: '/settings', labelKey: 'nav.settings' },
  { to: '/activities', labelKey: 'nav.activities' },
];

const analysisLinkDefs: LinkDef[] = [
  { to: '/analytics', labelKey: 'nav.analytics' },
  { to: '/training-plan', labelKey: 'nav.trainingPlan' },
  { to: '/export', labelKey: 'nav.exportCsv' },
];

export function AppLayout() {
  const location = useLocation();
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const isStravaConnected = !!user?.connectedToStrava;
  const hasImportedActivities = !!user?.hasImportedActivities;
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const fullLinks = useMemo(() => {
    const links = [
      ...setupLinkDefs,
      ...(hasImportedActivities ? analysisLinkDefs : []),
    ].map((link) => ({
      to: link.to,
      label: t(link.labelKey),
    }));

    if (user?.isAdmin) {
      links.push({ to: '/admin', label: t('nav.admin') });
    }

    return links;
  }, [hasImportedActivities, t, user?.isAdmin]);

  const mobileQuickLinks = useMemo(() => {
    return hasImportedActivities ?
        [
          { to: '/analytics', label: t('nav.analytics') },
          { to: '/activities', label: t('nav.activities') },
          { to: '/settings', label: t('nav.settings') },
        ]
      : [
          { to: '/settings', label: t('nav.settings') },
          { to: '/activities', label: t('nav.activities') },
        ];
  }, [hasImportedActivities, t]);

  const mobileMoreLinks = useMemo(
    () =>
      fullLinks.filter(
        (link) => !mobileQuickLinks.some((quickLink) => quickLink.to === link.to),
      ),
    [fullLinks, mobileQuickLinks],
  );
  const hasMobileMoreLinks = mobileMoreLinks.length > 0;

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
      <p className='text-xs text-muted'>{t('common.noExtraSections')}</p>
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

        {mobileSheetOpen ? (
          <>
            <button
              aria-label={t('layout.closePanelAria')}
              className='fixed inset-0 z-40 bg-black/35 lg:hidden'
              onClick={() => setMobileSheetOpen(false)}
              type='button'
            />
            <section className='fixed inset-x-0 bottom-0 z-50 max-h-[76vh] rounded-t-2xl border border-black/10 bg-panel p-4 shadow-panel lg:hidden'>
              <div className='mb-4 flex items-center justify-between gap-3'>
                <div>
                  <p className='text-sm font-semibold'>{t('layout.mobileMenuTitle')}</p>
                  <p className='text-xs text-muted'>
                    {t('layout.mobileMenuSubtitle')}
                  </p>
                </div>
                <button
                  className='inline-flex h-9 items-center justify-center rounded-lg border border-black/20 px-3 text-xs hover:bg-black/5'
                  onClick={() => setMobileSheetOpen(false)}
                  type='button'
                >
                  {t('layout.closePanelAria')}
                </button>
              </div>
              {mobileSheetNavContent}
              <button
                className='mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-black/20 px-3 text-sm hover:bg-black/5'
                onClick={logout}
                type='button'
              >
                {t('common.logout')}
              </button>
            </section>
          </>
        ) : null}

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
                {t('common.more')}
              </button>
            ) : null}
          </div>
        </div>
      </nav>
    </div>
  );
}
