import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client';
import type { User } from '../api/types';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { SectionHeader } from '../components/SectionHeader';
import {
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  selectClass,
  subtlePanelClass,
} from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../i18n/framework';
import type { AppLanguage } from '../i18n/language';
import { normalizeLanguage, setAppLanguage } from '../i18n/language';

type SectionKey = 'preferences' | 'importCenter' | 'dangerZone';
type GoalType = Exclude<User['goalType'], null>;

interface ImportResult {
  ok: boolean;
  imported: number;
  pages: number;
}

const importStepLabels = [
  'Verification de session et du token',
  "Requete vers l'API Strava (pagination)",
  'Transformation des activites recuperees',
  'Upsert en base locale',
];

const goalDistanceDefaults: Record<Exclude<GoalType, 'custom'>, number> = {
  '5k': 5,
  '10k': 10,
  half_marathon: 21.0975,
  marathon: 42.195,
};

function formatGoalTimeForInput(goalTimeSec: number | null) {
  if (
    goalTimeSec === null ||
    !Number.isFinite(goalTimeSec) ||
    goalTimeSec <= 0
  ) {
    return '';
  }
  const totalMinutes = Math.floor(goalTimeSec / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

function parseGoalTimeToSeconds(value: string) {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const match = trimmed.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) {
    return Number.NaN;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 3600 + minutes * 60;
}

export function SettingsPage() {
  const { t } = useI18n();
  const { token, user, refreshMe, logout } = useAuth();
  const [hrMax, setHrMax] = useState(190);
  const [age, setAge] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [goalType, setGoalType] = useState<User['goalType']>(null);
  const [goalDistanceKm, setGoalDistanceKm] = useState('');
  const [goalTargetTime, setGoalTargetTime] = useState('');
  const [speedUnit, setSpeedUnit] = useState<User['speedUnit']>('kmh');
  const [distanceUnit, setDistanceUnit] = useState<User['distanceUnit']>('km');
  const [elevationUnit, setElevationUnit] =
    useState<User['elevationUnit']>('m');
  const [cadenceUnit, setCadenceUnit] = useState<User['cadenceUnit']>('rpm');
  const [language, setLanguage] = useState<AppLanguage>('fr');
  const [status, setStatus] = useState<string | null>(null);
  const [showRavitoModal, setShowRavitoModal] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<SectionKey, boolean>
  >({
    preferences: false,
    importCenter: false,
    dangerZone: false,
  });
  const [importRunning, setImportRunning] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importActiveStepIndex, setImportActiveStepIndex] = useState(0);
  const [importElapsedSeconds, setImportElapsedSeconds] = useState(0);
  const paypalRavitoUrl = (import.meta.env.VITE_PAYPAL_RAVITO_URL ?? '').trim();
  const isAdminUnlimited = !!user?.isAdmin;
  const planTier = user?.subscription?.tier ?? user?.subscriptionTier ?? 'FREE';
  const planName =
    isAdminUnlimited ? 'Administration'
    : user?.subscription?.name ??
    (planTier === 'SUPPORTER' ? 'Ravito' : 'Gratuit');
  const planLimits =
    isAdminUnlimited ?
      {
        stravaImportsPerDay: Number.MAX_SAFE_INTEGER,
        aiRequestsPerDay: Number.MAX_SAFE_INTEGER,
        trainingPlansPerWindow: Number.MAX_SAFE_INTEGER,
        trainingPlanWindow: 'day' as 'day',
      }
    : (user?.subscription?.limits ?? {
        stravaImportsPerDay: planTier === 'SUPPORTER' ? 5 : 1,
        aiRequestsPerDay: planTier === 'SUPPORTER' ? 20 : 5,
        trainingPlansPerWindow: 1,
        trainingPlanWindow: (planTier === 'SUPPORTER' ? 'day' : 'week') as
          | 'day'
          | 'week',
      });

  const displayLimit = (value: number) =>
    isAdminUnlimited || value >= Number.MAX_SAFE_INTEGER / 2 ? 'Illimite' : String(value);

  useEffect(() => {
    if (!user) {
      return;
    }

    setHrMax(user.hrMax);
    setAge(user.age === null ? '' : String(user.age));
    setWeightKg(user.weightKg === null ? '' : String(user.weightKg));
    setHeightCm(user.heightCm === null ? '' : String(user.heightCm));
    setGoalType(user.goalType);
    setGoalDistanceKm(
      user.goalDistanceKm === null ? '' : String(user.goalDistanceKm),
    );
    setGoalTargetTime(formatGoalTimeForInput(user.goalTimeSec));
    setSpeedUnit(user.speedUnit);
    setDistanceUnit(user.distanceUnit);
    setElevationUnit(user.elevationUnit);
    setCadenceUnit(user.cadenceUnit === 'spm' ? 'ppm' : user.cadenceUnit);
    setLanguage(normalizeLanguage(user.language));
  }, [user]);

  useEffect(() => {
    if (!importRunning) {
      setImportActiveStepIndex(0);
      setImportElapsedSeconds(0);
      return;
    }

    const stepTimer = window.setInterval(() => {
      setImportActiveStepIndex((current) =>
        Math.min(current + 1, importStepLabels.length - 1),
      );
    }, 3200);

    const elapsedTimer = window.setInterval(() => {
      setImportElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(stepTimer);
      window.clearInterval(elapsedTimer);
    };
  }, [importRunning]);

  const save = async () => {
    if (!token) {
      return;
    }

    const parsedAge = age.trim() === '' ? null : Number(age);
    const parsedWeight = weightKg.trim() === '' ? null : Number(weightKg);
    const parsedHeight = heightCm.trim() === '' ? null : Number(heightCm);
    const parsedGoalTimeSec = parseGoalTimeToSeconds(goalTargetTime);
    const parsedGoalDistance =
      goalDistanceKm.trim() === '' ? null : Number(goalDistanceKm);

    if (
      (parsedAge !== null && !Number.isFinite(parsedAge)) ||
      (parsedWeight !== null && !Number.isFinite(parsedWeight)) ||
      (parsedHeight !== null && !Number.isFinite(parsedHeight))
    ) {
      setStatus('Age / poids / taille invalides.');
      return;
    }

    if (goalType !== null && Number.isNaN(parsedGoalTimeSec)) {
      setStatus('Objectif temps invalide. Format attendu: HH:MM (ex: 3:45).');
      return;
    }

    if (
      goalType !== null &&
      (parsedGoalTimeSec === null || parsedGoalTimeSec < 600)
    ) {
      setStatus('Renseigne un objectif temps valide (minimum 00:10).');
      return;
    }

    if (
      goalType === 'custom' &&
      (parsedGoalDistance === null ||
        !Number.isFinite(parsedGoalDistance) ||
        parsedGoalDistance <= 0)
    ) {
      setStatus('Pour un objectif custom, renseigne une distance (km) valide.');
      return;
    }

    const resolvedGoalDistanceKm =
      goalType === null ? null
      : goalType === 'custom' ?
        parsedGoalDistance === null ?
          null
        : parsedGoalDistance
      : goalDistanceDefaults[goalType as Exclude<GoalType, 'custom'>];

    const resolvedGoalTimeSec = goalType === null ? null : parsedGoalTimeSec;

    try {
      await apiRequest('/me/settings', {
        method: 'PATCH',
        token,
        body: {
          hrMax,
          age: parsedAge,
          weightKg: parsedWeight,
          heightCm: parsedHeight,
          goalType,
          goalDistanceKm: resolvedGoalDistanceKm,
          goalTimeSec: resolvedGoalTimeSec,
          speedUnit,
          distanceUnit,
          elevationUnit,
          cadenceUnit,
          language,
        },
      });
      setStatus('Preferences mises a jour.');
      await refreshMe();
      setAppLanguage(language);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Erreur update settings');
    }
  };

  const deleteAccount = async () => {
    if (!token) {
      return;
    }

    if (!window.confirm('Supprimer compte + tokens + activites ?')) {
      return;
    }

    try {
      await apiRequest('/me', {
        method: 'DELETE',
        token,
      });
      logout();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Erreur suppression');
    }
  };

  const launchImport = async () => {
    if (!token) {
      return;
    }

    setImportRunning(true);
    setImportError(null);
    setImportResult(null);

    try {
      const data = await apiRequest<ImportResult>('/import/basic', {
        method: 'POST',
        token,
      });
      await refreshMe();
      setImportResult(data);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import impossible');
    } finally {
      setImportRunning(false);
    }
  };

  return (
    <div>
      <PageHeader
        description={t('pages.settings.description')}
        title={t('pages.settings.title')}
      />
      <div className='grid gap-6 lg:grid-cols-2'>
        <Card>
            <SectionHeader
              title='Preferences utilisateur'
              subtitle="Profil sport + preferences d'unites d'affichage"
              infoHint={{
                title: 'Preferences',
                description:
                  'Les conversions sont calculees depuis les valeurs brutes pour eviter les erreurs de conversion en chaine.',
              }}
              collapsed={collapsedSections.preferences}
              onToggleCollapse={() =>
                setCollapsedSections((prev) => ({
                  ...prev,
                  preferences: !prev.preferences,
                }))
              }
            />
            {collapsedSections.preferences ?
              <p className='text-xs text-muted'>Section repliee.</p>
            : <>
                <div className='mb-4 rounded-xl border border-black/10 bg-black/[0.03] p-3'>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <div>
                      <p className='text-xs uppercase tracking-wide text-muted'>
                        Plan actuel
                      </p>
                      <p className='text-lg font-semibold'>{planName}</p>
                      <p className='text-xs text-muted'>
                        {isAdminUnlimited ?
                          'Mode administrateur: quotas illimites sur import Strava, requetes IA et plans.'
                        : user?.subscription?.tagline ??
                          'Le plan est gere en base de donnees par le gestionnaire.'}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        planTier === 'SUPPORTER' ?
                          'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border border-black/15 bg-white text-ink'
                      }`}
                    >
                      {isAdminUnlimited ?
                        'Mode Admin illimite'
                      : planTier === 'SUPPORTER' ?
                        'Mode Ravito'
                      : 'Mode Gratuit'}
                    </span>
                  </div>
                  <div className='mt-3 grid gap-2 text-xs text-muted sm:grid-cols-3'>
                    <p>
                      Import Strava:{' '}
                      <strong>{displayLimit(planLimits.stravaImportsPerDay)}/jour</strong>
                    </p>
                    <p>
                      Requetes IA:{' '}
                      <strong>{displayLimit(planLimits.aiRequestsPerDay)}/jour</strong>
                    </p>
                    <p>
                      Plans entrainement:{' '}
                      <strong>
                        {displayLimit(planLimits.trainingPlansPerWindow)}/
                        {planLimits.trainingPlanWindow === 'day' ?
                          'jour'
                        : 'semaine'}
                      </strong>
                    </p>
                  </div>
                  {!isAdminUnlimited ? (
                    <div className='mt-3 flex flex-wrap gap-2'>
                      <button
                        className={secondaryButtonClass}
                        onClick={() => setShowRavitoModal(true)}
                        type='button'
                      >
                        Offrir un ravitaillement (merci !)
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <label className='grid gap-1 text-xs text-muted'>
                    HRmax
                    <input
                      className={inputClass}
                      max={240}
                      min={120}
                      onChange={(event) => setHrMax(Number(event.target.value))}
                      type='number'
                      value={hrMax}
                    />
                  </label>

                  <label className='grid gap-1 text-xs text-muted'>
                    Age
                    <input
                      className={inputClass}
                      max={100}
                      min={10}
                      onChange={(event) => setAge(event.target.value)}
                      placeholder='ex: 32'
                      type='number'
                      value={age}
                    />
                  </label>

                  <label className='grid gap-1 text-xs text-muted'>
                    Poids (kg)
                    <input
                      className={inputClass}
                      max={250}
                      min={30}
                      onChange={(event) => setWeightKg(event.target.value)}
                      placeholder='ex: 68.5'
                      step='0.1'
                      type='number'
                      value={weightKg}
                    />
                  </label>

                  <label className='grid gap-1 text-xs text-muted'>
                    Taille (cm)
                    <input
                      className={inputClass}
                      max={250}
                      min={120}
                      onChange={(event) => setHeightCm(event.target.value)}
                      placeholder='ex: 178'
                      type='number'
                      value={heightCm}
                    />
                  </label>

                  <label className='grid gap-1 text-xs text-muted'>
                    Objectif principal
                    <select
                      className={selectClass}
                      value={goalType ?? ''}
                      onChange={(event) => {
                        const value = event.target.value as GoalType | '';
                        const nextGoalType = value === '' ? null : value;
                        setGoalType(nextGoalType);
                        if (
                          nextGoalType !== null &&
                          nextGoalType !== 'custom'
                        ) {
                          const presetDistance =
                            goalDistanceDefaults[
                              nextGoalType as Exclude<GoalType, 'custom'>
                            ];
                          setGoalDistanceKm(String(presetDistance));
                        }
                        if (nextGoalType === null) {
                          setGoalDistanceKm('');
                          setGoalTargetTime('');
                        }
                      }}
                    >
                      <option value=''>Aucun</option>
                      <option value='marathon'>Marathon</option>
                      <option value='half_marathon'>Semi-marathon</option>
                      <option value='10k'>10 km</option>
                      <option value='5k'>5 km</option>
                      <option value='custom'>Custom</option>
                    </select>
                  </label>

                  {goalType === 'custom' ?
                    <label className='grid gap-1 text-xs text-muted'>
                      Distance objectif (km)
                      <input
                        className={inputClass}
                        min={1}
                        step='0.1'
                        onChange={(event) =>
                          setGoalDistanceKm(event.target.value)
                        }
                        placeholder='ex: 42.195'
                        type='number'
                        value={goalDistanceKm}
                      />
                    </label>
                  : null}

                  {goalType !== null ?
                    <label className='grid gap-1 text-xs text-muted'>
                      Temps objectif (HH:MM)
                      <input
                        className={inputClass}
                        onChange={(event) =>
                          setGoalTargetTime(event.target.value)
                        }
                        placeholder='ex: 3:45'
                        value={goalTargetTime}
                      />
                    </label>
                  : null}

                  <label className='grid gap-1 text-xs text-muted'>
                    Vitesse
                    <select
                      className={selectClass}
                      value={speedUnit}
                      onChange={(event) =>
                        setSpeedUnit(event.target.value as User['speedUnit'])
                      }
                    >
                      <option value='kmh'>km/h</option>
                      <option value='pace_km'>min/km</option>
                      <option value='pace_mi'>min/mi</option>
                    </select>
                  </label>

                  <label className='grid gap-1 text-xs text-muted'>
                    Distance
                    <select
                      className={selectClass}
                      value={distanceUnit}
                      onChange={(event) =>
                        setDistanceUnit(
                          event.target.value as User['distanceUnit'],
                        )
                      }
                    >
                      <option value='km'>km</option>
                      <option value='mi'>mi</option>
                    </select>
                  </label>

                  <label className='grid gap-1 text-xs text-muted'>
                    Denivele
                    <select
                      className={selectClass}
                      value={elevationUnit}
                      onChange={(event) =>
                        setElevationUnit(
                          event.target.value as User['elevationUnit'],
                        )
                      }
                    >
                      <option value='m'>m</option>
                      <option value='ft'>ft</option>
                    </select>
                  </label>

                  <label className='grid gap-1 text-xs text-muted'>
                    Cadence
                    <select
                      className={selectClass}
                      value={cadenceUnit}
                      onChange={(event) =>
                        setCadenceUnit(
                          event.target.value as User['cadenceUnit'],
                        )
                      }
                    >
                      <option value='rpm'>rpm</option>
                      <option value='ppm'>ppm</option>
                    </select>
                  </label>

                  <label className='grid gap-1 text-xs text-muted'>
                    Langue / Language
                    <select
                      className={selectClass}
                      value={language}
                      onChange={(event) => {
                        const nextLanguage = normalizeLanguage(
                          event.target.value,
                        );
                        setLanguage(nextLanguage);
                        void setAppLanguage(nextLanguage);
                      }}
                    >
                      <option value='fr'>Francais</option>
                      <option value='en'>English</option>
                    </select>
                  </label>
                </div>
                <p className='mt-3 text-xs text-muted'>
                  Les conversions sont recalculees depuis les valeurs brutes
                  (pas de conversion en chaine), precision max 2 decimales.
                  L'objectif sauvegarde est aussi pris en compte dans les
                  analyses IA.
                </p>
                <button
                  className={`mt-4 w-full sm:w-auto ${primaryButtonClass}`}
                  onClick={save}
                  type='button'
                >
                  Sauvegarder
                </button>
              </>
            }
          </Card>

        <div id='import-center' className='scroll-mt-24'>
          <Card>
            <SectionHeader
              title='Import Strava'
              subtitle='Recupere les seances de course a pied puis met a jour la base locale'
              infoHint={{
                title: 'Import',
                description:
                  "L'import lit les pages Strava (200 activites/page), garde seulement la course a pied, puis met a jour les activites existantes.",
              }}
              collapsed={collapsedSections.importCenter}
              onToggleCollapse={() =>
                setCollapsedSections((prev) => ({
                  ...prev,
                  importCenter: !prev.importCenter,
                }))
              }
            />
            {collapsedSections.importCenter ?
              <p className='text-xs text-muted'>Section repliee.</p>
            : <div className='space-y-4'>
                <p className='text-sm text-muted'>
                  Lance l&apos;import pour synchroniser tes seances de course a
                  pied depuis Strava.
                </p>

                <button
                  className={primaryButtonClass}
                  disabled={importRunning}
                  onClick={() => {
                    void launchImport();
                  }}
                  type='button'
                >
                  {importRunning ? 'Import en cours...' : 'Lancer import'}
                </button>

                {importRunning ?
                  <div className={`${subtlePanelClass} space-y-3`}>
                    <div className='flex items-center gap-2 text-sm'>
                      <span className='inline-flex h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-ink' />
                      <span>Import en cours ({importElapsedSeconds}s)</span>
                    </div>
                    <ul className='space-y-1 text-xs'>
                      {importStepLabels.map((label, index) => {
                        const done = index < importActiveStepIndex;
                        const active = index === importActiveStepIndex;
                        return (
                          <li className='flex items-center gap-2' key={label}>
                            <span
                              className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
                                done ?
                                  'border-emerald-700 bg-emerald-700 text-white'
                                : active ?
                                  'border-ink bg-ink text-white'
                                : 'border-black/20 bg-white text-muted'
                              }`}
                            >
                              {done ? '✓' : index + 1}
                            </span>
                            <span
                              className={
                                active ?
                                  'text-ink'
                                : done ?
                                  'text-emerald-700'
                                : 'text-muted'
                              }
                            >
                              {label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                : null}

                {!importResult && !importError && !importRunning ?
                  <p className='text-xs text-muted'>
                    Aucun import lance pour le moment.
                  </p>
                : null}

                {importResult ?
                  <div className={`${subtlePanelClass} space-y-2 text-sm`}>
                    <p>Pages importees: {importResult.pages}</p>
                    <p>Activites mises a jour: {importResult.imported}</p>
                    <div className='rounded-lg border border-black/10 bg-white/70 p-2 text-xs text-muted'>
                      <p className='font-medium text-ink'>Actions API effectuees</p>
                      <p>1. Authentification et verification du token: OK</p>
                      <p>
                        2. Lecture API Strava: {importResult.pages} page(s)
                        traitee(s)
                      </p>
                      <p>
                        3. Filtre course a pied + upsert base locale:{' '}
                        {importResult.imported} element(s)
                      </p>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      <Link className={secondaryButtonClass} to='/activities'>
                        Voir mes activites
                      </Link>
                      {user?.hasImportedActivities ?
                        <Link className={secondaryButtonClass} to='/analytics'>
                          Ouvrir les analyses
                        </Link>
                      : null}
                    </div>
                  </div>
                : null}

                {importError ? <p className='text-sm text-red-700'>{importError}</p> : null}
              </div>
            }
          </Card>
        </div>

        <Card>
            <SectionHeader
              title='Zone critique'
              subtitle='Actions irreversibles sur le compte'
              infoHint={{
                title: 'Suppression compte',
                description:
                  'Supprime le compte, les tokens et les activites locales. Cette action est definitive.',
              }}
              collapsed={collapsedSections.dangerZone}
              onToggleCollapse={() =>
                setCollapsedSections((prev) => ({
                  ...prev,
                  dangerZone: !prev.dangerZone,
                }))
              }
            />
            {collapsedSections.dangerZone ?
              <p className='text-xs text-muted'>Section repliee.</p>
            : <div className='flex flex-wrap gap-2'>
                <button
                  className={secondaryButtonClass}
                  onClick={logout}
                  type='button'
                >
                  {t('common.logout')}
                </button>
                <button
                  className={dangerButtonClass}
                  onClick={deleteAccount}
                  type='button'
                >
                  Supprimer mon compte
                </button>
              </div>
            }
          </Card>
      </div>
      {status ?
        <p className='mt-4 text-sm text-muted'>{status}</p>
      : null}
      {showRavitoModal ?
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4'
          onClick={() => setShowRavitoModal(false)}
          role='presentation'
        >
          <div
            className='w-full max-w-md rounded-2xl border border-black/10 bg-white p-4 shadow-xl'
            onClick={(event) => event.stopPropagation()}
            role='dialog'
            aria-modal='true'
            aria-label='Offrir un ravitaillement (merci !)'
          >
            <p className='text-sm font-semibold text-ink'>
              Offrir un ravitaillement (merci !)
            </p>
            <p className='mt-2 text-sm text-muted'>
              Montant libre via PayPal. Une fois confirme, le gestionnaire peut
              activer ton mode Ravito en base.
            </p>
            <div className='mt-4 flex flex-wrap gap-2'>
              <button
                className={secondaryButtonClass}
                onClick={() => setShowRavitoModal(false)}
                type='button'
              >
                Fermer
              </button>
              <a
                className={primaryButtonClass}
                href={paypalRavitoUrl || '#'}
                onClick={(event) => {
                  if (!paypalRavitoUrl) {
                    event.preventDefault();
                    setStatus(
                      'Lien PayPal non configure. Ajoute VITE_PAYPAL_RAVITO_URL.',
                    );
                  }
                }}
                rel='noreferrer'
                target='_blank'
              >
                Aller sur PayPal
              </a>
            </div>
            {!paypalRavitoUrl ?
              <p className='mt-3 text-xs text-amber-700'>
                Lien PayPal manquant: configure{' '}
                <code>VITE_PAYPAL_RAVITO_URL</code>.
              </p>
            : null}
          </div>
        </div>
      : null}
    </div>
  );
}
