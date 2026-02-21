import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { SectionHeader } from '../components/SectionHeader';
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonCompactClass,
  selectClass,
  textareaClass,
} from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { number } from '../utils/format';

interface TrainingPlanSession {
  weekIndex: number;
  sessionIndex: number;
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  title: string;
  objective: string;
  zone: string;
  durationMin: number;
  distanceKm: number;
  paceTarget: string;
  hrTarget: string;
  notes: string;
  rationale: string;
  blocks: TrainingPlanSessionBlock[];
}

interface TrainingPlanSessionBlock {
  step: string;
  durationMin: number;
  paceTarget: string;
  hrTarget: string;
  repeat: number | null;
  notes: string;
}

interface TrainingPlanWeek {
  weekIndex: number;
  theme: string;
  focus: string;
  weeklyVolumeKm: number;
  sessions: TrainingPlanSession[];
}

interface TrainingPlanResponse {
  id: string;
  model: string;
  generatedAt: string;
  title: string;
  goal: string;
  weeks: number;
  startDate: string;
  raceDate: string;
  daysToRace: number;
  overview: string;
  methodology: string;
  warnings: string[];
  plan: TrainingPlanWeek[];
}

type BuilderGoalType = 'marathon' | 'half_marathon' | '10k' | '5k' | 'custom';
type BuilderFocus = 'balanced' | 'performance' | 'safety';
type LongRunDay = 'sat' | 'sun';

const goalDistanceDefaults: Record<
  Exclude<BuilderGoalType, 'custom'>,
  number
> = {
  '5k': 5,
  '10k': 10,
  half_marathon: 21.0975,
  marathon: 42.195,
};

const goalTypeLabel: Record<BuilderGoalType, string> = {
  marathon: 'Marathon',
  half_marathon: 'Semi-marathon',
  '10k': '10 km',
  '5k': '5 km',
  custom: 'Objectif custom',
};

const focusLabel: Record<BuilderFocus, string> = {
  balanced: 'equilibre progression / recuperation',
  performance: 'performance maximale',
  safety: 'securite et reduction du risque de blessure',
};

const longRunDayLabel: Record<LongRunDay, string> = {
  sat: 'samedi',
  sun: 'dimanche',
};

function isRacePlanSession(session: TrainingPlanSession) {
  const title = session.title.toLowerCase();
  const zone = session.zone.toLowerCase();
  return (
    title.includes('course objectif') ||
    title.includes('jour j') ||
    zone === 'course'
  );
}

function formatRaceDateLabel(isoDay: string) {
  const date = new Date(`${isoDay}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return isoDay;
  }
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function zoneToneClass(zone: string, raceSession: boolean) {
  if (raceSession) {
    return 'border-sky-300 bg-sky-50 text-sky-700';
  }
  const normalized = zone.toLowerCase();
  if (normalized.includes('z5')) {
    return 'border-red-300 bg-red-50 text-red-700';
  }
  if (normalized.includes('z4')) {
    return 'border-orange-300 bg-orange-50 text-orange-700';
  }
  if (normalized.includes('z3')) {
    return 'border-amber-300 bg-amber-50 text-amber-700';
  }
  if (normalized.includes('z2')) {
    return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  }
  if (normalized.includes('z1')) {
    return 'border-teal-300 bg-teal-50 text-teal-700';
  }
  return 'border-black/20 bg-black/[0.04] text-ink';
}

function blockVolumeLabel(block: TrainingPlanSessionBlock) {
  if (block.repeat !== null && block.repeat > 1) {
    return `${block.repeat} x ${number(block.durationMin, 0)} min`;
  }
  return `${number(block.durationMin, 0)} min`;
}

function futureDateInputValue(daysFromNow: number) {
  const now = new Date();
  now.setDate(now.getDate() + daysFromNow);
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatGoalTimeClock(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

function parseGoalTimeToSeconds(hoursValue: string, minutesValue: string) {
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return Number.NaN;
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return Number.NaN;
  }
  return hours * 3600 + minutes * 60;
}

function sessionEditorKey(weekIndex: number, sessionIndex: number) {
  return `w${weekIndex}-s${sessionIndex}`;
}

function buildObjectiveFromSelections(input: {
  goalType: BuilderGoalType;
  distanceKm: number;
  goalTimeSec: number;
  focus: BuilderFocus;
  longRunDay: LongRunDay;
}) {
  const totalMinutes = input.goalTimeSec / 60;
  const paceMinPerKm = totalMinutes / input.distanceKm;
  const paceMin = Math.floor(paceMinPerKm);
  const paceSec = Math.round((paceMinPerKm - paceMin) * 60);
  const paceLabel = `${paceMin}:${Math.min(paceSec, 59)
    .toString()
    .padStart(2, '0')}`;

  return `${goalTypeLabel[input.goalType]} en ${formatGoalTimeClock(input.goalTimeSec) ?? 'n/a'} sur ${number(
    input.distanceKm,
    2,
  )} km (allure cible ${paceLabel}/km), priorite ${
    focusLabel[input.focus]
  }, 4 seances hebdo a jours libres (preference sortie longue: ${longRunDayLabel[input.longRunDay]}).`;
}

function resolveDistanceKm(
  goalType: BuilderGoalType,
  customDistanceKm: string,
) {
  if (goalType !== 'custom') {
    return goalDistanceDefaults[goalType];
  }

  const parsed = Number(customDistanceKm);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

const hourOptions = Array.from({ length: 24 }, (_, index) =>
  index.toString().padStart(2, '0'),
);
const minuteOptions = Array.from({ length: 60 }, (_, index) =>
  index.toString().padStart(2, '0'),
);

export function TrainingPlanPage() {
  const { token, user } = useAuth();
  const [goalType, setGoalType] = useState<BuilderGoalType>('marathon');
  const [customDistanceKm, setCustomDistanceKm] = useState('');
  const [goalTargetHour, setGoalTargetHour] = useState('03');
  const [goalTargetMinute, setGoalTargetMinute] = useState('45');
  const [trainingFocus, setTrainingFocus] = useState<BuilderFocus>('balanced');
  const [longRunDay, setLongRunDay] = useState<LongRunDay>('sun');
  const [raceDate, setRaceDate] = useState(() => futureDateInputValue(84));
  const [trainingPlan, setTrainingPlan] = useState<TrainingPlanResponse | null>(
    null,
  );
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [trainingError, setTrainingError] = useState<string | null>(null);
  const [trainingAdaptResult, setTrainingAdaptResult] = useState<string | null>(
    null,
  );
  const [adaptingSessionKey, setAdaptingSessionKey] = useState<string | null>(
    null,
  );
  const [editingSessionKey, setEditingSessionKey] = useState<string | null>(
    null,
  );
  const [sessionAdaptRequest, setSessionAdaptRequest] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (user.goalType) {
      setGoalType(user.goalType);
    }
    if (user.goalType === 'custom' && user.goalDistanceKm !== null) {
      setCustomDistanceKm(String(user.goalDistanceKm));
    }
    if (
      user.goalTimeSec !== null &&
      Number.isFinite(user.goalTimeSec) &&
      user.goalTimeSec > 0
    ) {
      const totalMinutes = Math.floor(user.goalTimeSec / 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      setGoalTargetHour(
        Math.max(0, Math.min(23, hours)).toString().padStart(2, '0'),
      );
      setGoalTargetMinute(minutes.toString().padStart(2, '0'));
    }
  }, [user]);

  useEffect(() => {
    if (!token) {
      setTrainingPlan(null);
      return;
    }

    let cancelled = false;
    apiRequest<TrainingPlanResponse>('/ai/training-plan/latest', { token })
      .then((plan) => {
        if (!cancelled) {
          setTrainingPlan(plan);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTrainingPlan(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const resolvedDistanceKm = useMemo(
    () => resolveDistanceKm(goalType, customDistanceKm),
    [goalType, customDistanceKm],
  );
  const parsedGoalTimeSec = useMemo(
    () => parseGoalTimeToSeconds(goalTargetHour, goalTargetMinute),
    [goalTargetHour, goalTargetMinute],
  );
  const objectivePreview = useMemo(() => {
    if (
      resolvedDistanceKm === null ||
      parsedGoalTimeSec === null ||
      Number.isNaN(parsedGoalTimeSec)
    ) {
      return null;
    }

    return buildObjectiveFromSelections({
      goalType,
      distanceKm: resolvedDistanceKm,
      goalTimeSec: parsedGoalTimeSec,
      focus: trainingFocus,
      longRunDay,
    });
  }, [
    resolvedDistanceKm,
    parsedGoalTimeSec,
    goalType,
    trainingFocus,
    longRunDay,
  ]);

  const raceDateInsights = useMemo(() => {
    if (!raceDate) {
      return null;
    }
    const today = new Date();
    const todayAtMidnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const race = new Date(`${raceDate}T00:00:00`);
    if (Number.isNaN(race.getTime())) {
      return null;
    }
    const daysToRace = Math.ceil(
      (race.getTime() - todayAtMidnight.getTime()) / (1000 * 60 * 60 * 24),
    );
    const weeksToRace = Math.ceil(daysToRace / 7);
    return {
      daysToRace,
      weeksToRace,
    };
  }, [raceDate]);
  const runTrainingPlanGeneration = async () => {
    if (!token) {
      setTrainingError('Session utilisateur manquante.');
      return;
    }

    if (resolvedDistanceKm === null) {
      setTrainingError(
        'Distance objectif invalide. Renseigne une distance > 0 km.',
      );
      return;
    }
    if (Number.isNaN(parsedGoalTimeSec)) {
      setTrainingError('Temps cible invalide.');
      return;
    }
    if (parsedGoalTimeSec === null || parsedGoalTimeSec < 600) {
      setTrainingError('Renseigne un temps cible valide (minimum 00:10).');
      return;
    }
    if (!raceDate) {
      setTrainingError('Renseigne une date de course.');
      return;
    }

    const objective = buildObjectiveFromSelections({
      goalType,
      distanceKm: resolvedDistanceKm,
      goalTimeSec: parsedGoalTimeSec,
      focus: trainingFocus,
      longRunDay,
    });

    setTrainingLoading(true);
    setTrainingError(null);
    setTrainingAdaptResult(null);
    setEditingSessionKey(null);
    setSessionAdaptRequest('');
    try {
      const response = await apiRequest<TrainingPlanResponse>(
        '/ai/training-plan',
        {
          method: 'POST',
          token,
          body: {
            objective,
            raceDate,
          },
        },
      );
      setTrainingPlan(response);
    } catch (err) {
      setTrainingError(
        err instanceof Error ? err.message : 'Erreur generation plan',
      );
    } finally {
      setTrainingLoading(false);
    }
  };

  const runSessionAdaptation = async (
    weekIndex: number,
    sessionIndex: number,
  ) => {
    if (!token) {
      setTrainingError('Session utilisateur manquante.');
      return;
    }
    if (!trainingPlan) {
      setTrainingError("Aucun plan d'entrainement charge.");
      return;
    }
    const requestText = sessionAdaptRequest.trim();
    if (requestText.length < 8) {
      setTrainingError(
        'Ajoute une demande plus precise (minimum 8 caracteres).',
      );
      return;
    }

    const key = sessionEditorKey(weekIndex, sessionIndex);
    setAdaptingSessionKey(key);
    setTrainingError(null);
    setTrainingAdaptResult(null);
    try {
      const updated = await apiRequest<TrainingPlanResponse>(
        `/ai/training-plan/${trainingPlan.id}/adapt-session`,
        {
          method: 'PATCH',
          token,
          body: {
            weekIndex,
            sessionIndex,
            request: requestText,
          },
        },
      );
      setTrainingPlan(updated);
      setTrainingAdaptResult(
        `Seance S${weekIndex}-${sessionIndex} adaptee avec succes.`,
      );
      setEditingSessionKey(null);
      setSessionAdaptRequest('');
    } catch (err) {
      setTrainingError(
        err instanceof Error ? err.message : 'Erreur adaptation seance',
      );
    } finally {
      setAdaptingSessionKey(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Plan d'entrainement"
        description="Generation IA d'un plan running detaille et adapte automatiquement au delai reel jusqu'a ta course."
      />

      <Card>
        <SectionHeader
          title="Plan d'entrainement"
          subtitle="Generation IA automatisee jusqu'a ta course: jours libres a placer par l'athlete, avec semaine finale a 3 seances + course."
          infoHint={{
            title: "Plan d'entrainement",
            description:
              'Le plan combine ton historique complet, ta fatigue actuelle (CTL/ATL/TSB) et ton objectif. Chaque seance est detaillee en blocs (echauffement, bloc principal, retour au calme).',
            linkHref: 'https://pubmed.ncbi.nlm.nih.gov/20861519/',
            linkLabel: 'Source: periodisation et distribution des intensites',
          }}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((prev) => !prev)}
        />
        {collapsed ?
          <p className='text-xs text-muted'>Section repliee.</p>
        : <>
            <div className='grid gap-3 md:grid-cols-2 lg:grid-cols-3'>
                  <div className='grid content-start gap-1 text-xs text-muted'>
                    <label htmlFor='plan-goal-type'>Objectif cible</label>
                    <select
                      id='plan-goal-type'
                      className={selectClass}
                      value={goalType}
                      onChange={(event) => {
                        setGoalType(event.target.value as BuilderGoalType);
                        setTrainingPlan(null);
                      }}
                    >
                      <option value='5k'>5 km</option>
                      <option value='10k'>10 km</option>
                      <option value='half_marathon'>Semi-marathon</option>
                      <option value='marathon'>Marathon</option>
                      <option value='custom'>Custom</option>
                    </select>
                    <div aria-hidden className='min-h-[1rem]' />
                  </div>

                  <div className='grid content-start gap-1 text-xs text-muted'>
                    <label htmlFor='plan-goal-distance'>
                      Distance objectif (km)
                    </label>
                    <input
                      id='plan-goal-distance'
                      className={inputClass}
                      type='number'
                      min={1}
                      step='0.1'
                      value={
                        goalType === 'custom' ? customDistanceKm : (
                          `${goalDistanceDefaults[goalType]}`
                        )
                      }
                      onChange={(event) => {
                        setCustomDistanceKm(event.target.value);
                        setTrainingPlan(null);
                      }}
                      disabled={goalType !== 'custom'}
                      placeholder='ex: 42.195'
                    />
                    {goalType !== 'custom' ?
                      <p className='min-h-[1rem] text-[11px] text-muted'>
                        Valeur automatique selon l&apos;objectif choisi.
                      </p>
                    : <div aria-hidden className='min-h-[1rem]' />}
                  </div>

                  <div className='grid content-start gap-1 text-xs text-muted'>
                    <label htmlFor='plan-goal-hours'>Temps cible</label>
                    <div className='grid grid-cols-2 gap-2'>
                      <div>
                        <select
                          id='plan-goal-hours'
                          aria-label='Heures cible'
                          className={selectClass}
                          value={goalTargetHour}
                          onChange={(event) => {
                            setGoalTargetHour(event.target.value);
                            setTrainingPlan(null);
                          }}
                        >
                          {hourOptions.map((hour) => (
                            <option key={hour} value={hour}>
                              {hour} h
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <select
                          id='plan-goal-minutes'
                          aria-label='Minutes cible'
                          className={selectClass}
                          value={goalTargetMinute}
                          onChange={(event) => {
                            setGoalTargetMinute(event.target.value);
                            setTrainingPlan(null);
                          }}
                        >
                          {minuteOptions.map((minute) => (
                            <option key={minute} value={minute}>
                              {minute} min
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div aria-hidden className='min-h-[1rem]' />
                  </div>

                  <div className='grid gap-1 text-xs text-muted'>
                    <label htmlFor='plan-focus'>Priorite du plan</label>
                    <select
                      id='plan-focus'
                      className={selectClass}
                      value={trainingFocus}
                      onChange={(event) => {
                        setTrainingFocus(event.target.value as BuilderFocus);
                        setTrainingPlan(null);
                      }}
                    >
                      <option value='balanced'>Equilibre</option>
                      <option value='performance'>Performance</option>
                      <option value='safety'>Securite</option>
                    </select>
                  </div>

                  <div className='grid gap-1 text-xs text-muted'>
                    <label htmlFor='plan-long-run-day'>Sortie longue</label>
                    <select
                      id='plan-long-run-day'
                      className={selectClass}
                      value={longRunDay}
                      onChange={(event) => {
                        setLongRunDay(event.target.value as LongRunDay);
                        setTrainingPlan(null);
                      }}
                    >
                      <option value='sat'>Plutot samedi</option>
                      <option value='sun'>Plutot dimanche</option>
                    </select>
                  </div>

                  <div className='grid gap-1 text-xs text-muted'>
                    <label htmlFor='plan-race-date'>Date de course</label>
                    <input
                      id='plan-race-date'
                      className={inputClass}
                      type='date'
                      value={raceDate}
                      onChange={(event) => {
                        setRaceDate(event.target.value);
                        setTrainingPlan(null);
                      }}
                    />
                  </div>
            </div>
            <p className='mt-2 text-xs text-muted'>
              {objectivePreview ??
                "Complete les selections ci-dessus pour generer l'objectif automatiquement."}
            </p>
            {raceDateInsights ?
              <p className='mt-1 text-xs text-muted'>
                Il reste {number(raceDateInsights.daysToRace, 0)} jours avant
                la course, soit environ{' '}
                {number(raceDateInsights.weeksToRace, 0)} semaines.
              </p>
            : null}

            <div className='mt-3 flex flex-wrap gap-2'>
              <button
                className={primaryButtonClass}
                type='button'
                onClick={() => {
                  void runTrainingPlanGeneration();
                }}
                disabled={trainingLoading}
              >
                {trainingLoading ? 'Generation IA...' : 'Generer le plan'}
              </button>
            </div>

            {trainingError ?
              <p className='mt-3 text-sm text-red-700'>{trainingError}</p>
            : null}
            {trainingAdaptResult ?
              <p className='mt-2 text-sm text-emerald-700'>
                {trainingAdaptResult}
              </p>
            : null}

            {!trainingPlan ?
              <p className='mt-4 text-xs text-muted'>
                Aucun plan genere pour le moment. Lance la generation dans la
                section parametres.
              </p>
            : <div className='mt-4 space-y-3'>
                    <div className='rounded-xl border border-black/10 bg-black/[0.02] p-3'>
                      <p className='text-sm font-semibold'>
                        {trainingPlan.title}
                      </p>
                      <p className='mt-1 break-words text-xs text-muted'>
                        Objectif: {trainingPlan.goal} · {trainingPlan.weeks}{' '}
                        semaines · Depart: {trainingPlan.startDate} · Course:{' '}
                        {trainingPlan.raceDate} ({trainingPlan.daysToRace}{' '}
                        jours)
                      </p>
                    </div>

                    {trainingPlan.plan.map((week) => (
                      <details
                        key={`plan-week-${week.weekIndex}`}
                        className='rounded-xl border border-black/10 bg-black/[0.02] p-3'
                        open={week.weekIndex <= 1}
                      >
                        <summary className='cursor-pointer list-none'>
                          <div className='flex flex-wrap items-center gap-2 text-sm font-semibold'>
                            <span>Semaine {week.weekIndex}</span>
                            <span className='rounded-full border border-black/15 bg-black/[0.03] px-2 py-0.5 text-[11px] font-semibold text-muted'>
                              {week.theme}
                            </span>
                            <span className='rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700'>
                              {number(week.weeklyVolumeKm, 1)} km
                            </span>
                          </div>
                        </summary>
                        <p className='mt-2 text-xs text-muted'>{week.focus}</p>
                        <div className='mt-3 grid gap-3 xl:grid-cols-2'>
                          {week.sessions.map((session) => {
                            const editorKey = sessionEditorKey(
                              week.weekIndex,
                              session.sessionIndex,
                            );
                            const raceSession = isRacePlanSession(session);
                            const isEditing = editingSessionKey === editorKey;
                            const isAdapting = adaptingSessionKey === editorKey;
                            const slotLabel =
                              raceSession ?
                                `Course objectif · ${formatRaceDateLabel(trainingPlan.raceDate)}`
                              : `Seance libre ${session.sessionIndex}`;
                            const zoneClass = zoneToneClass(
                              session.zone,
                              raceSession,
                            );
                            return (
                              <div
                                key={`plan-week-${week.weekIndex}-${session.sessionIndex}`}
                                className='rounded-xl border border-black/10 bg-panel p-3 sm:p-4'
                              >
                                <div className='flex flex-wrap items-start justify-between gap-2'>
                                  <div className='min-w-0 flex-1'>
                                    <p className='text-[11px] uppercase tracking-wide text-muted'>
                                      {slotLabel}
                                    </p>
                                    <p className='mt-1 text-sm font-semibold leading-snug text-ink'>
                                      {session.title}
                                    </p>
                                  </div>
                                  <span
                                    className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${zoneClass}`}
                                  >
                                    {session.zone}
                                  </span>
                                </div>
                                <div className='mt-3 grid gap-2 sm:grid-cols-3'>
                                  <div className='rounded-lg border border-black/10 bg-black/[0.03] px-2.5 py-2'>
                                    <p className='text-[10px] uppercase tracking-wide text-muted'>
                                      Distance
                                    </p>
                                    <p className='mt-1 text-sm font-semibold text-ink'>
                                      {number(session.distanceKm, 1)} km
                                    </p>
                                  </div>
                                  <div className='rounded-lg border border-black/10 bg-black/[0.03] px-2.5 py-2'>
                                    <p className='text-[10px] uppercase tracking-wide text-muted'>
                                      Duree
                                    </p>
                                    <p className='mt-1 text-sm font-semibold text-ink'>
                                      {number(session.durationMin, 0)} min
                                    </p>
                                  </div>
                                  <div className='rounded-lg border border-black/10 bg-black/[0.03] px-2.5 py-2'>
                                    <p className='text-[10px] uppercase tracking-wide text-muted'>
                                      Cible FC
                                    </p>
                                    <p className='mt-1 text-sm font-semibold text-ink'>
                                      {session.hrTarget}
                                    </p>
                                  </div>
                                </div>

                                <div className='mt-3 rounded-lg border border-black/10 bg-black/[0.02] p-2.5'>
                                  <p className='text-[10px] uppercase tracking-wide text-muted'>
                                    Objectif seance
                                  </p>
                                  <p className='mt-1 text-sm leading-relaxed text-ink'>
                                    {session.objective}
                                  </p>
                                  <p className='mt-1 text-xs text-muted'>
                                    Allure cible: {session.paceTarget}
                                  </p>
                                </div>

                                <details className='mt-3 rounded-lg border border-black/10 bg-black/[0.02] p-2.5'>
                                  <summary className='cursor-pointer text-xs font-semibold text-ink'>
                                    Voir le detail des blocs (
                                    {session.blocks.length})
                                  </summary>
                                  <div className='mt-2 space-y-2'>
                                    {session.blocks.map((block, blockIndex) => (
                                      <div
                                        key={`plan-week-${week.weekIndex}-${session.sessionIndex}-block-${blockIndex + 1}`}
                                        className='rounded-lg border border-black/10 bg-panel px-2.5 py-2'
                                      >
                                        <div className='flex flex-wrap items-center justify-between gap-2'>
                                          <p className='text-xs font-semibold text-ink'>
                                            {block.step}
                                          </p>
                                          <span className='rounded-full border border-black/15 bg-black/[0.03] px-2 py-0.5 text-[10px] font-semibold text-muted'>
                                            {blockVolumeLabel(block)}
                                          </span>
                                        </div>
                                        <p className='mt-1 text-xs text-muted'>
                                          Allure {block.paceTarget}
                                        </p>
                                        <p className='mt-1 text-xs text-muted'>
                                          FC {block.hrTarget}
                                        </p>
                                        {block.notes ?
                                          <p className='mt-1 text-xs text-muted'>
                                            {block.notes}
                                          </p>
                                        : null}
                                      </div>
                                    ))}
                                  </div>
                                </details>

                                <div className='mt-3 space-y-1 text-xs text-muted'>
                                  <p>
                                    <span className='font-semibold text-ink'>
                                      Pourquoi:
                                    </span>{' '}
                                    {session.rationale}
                                  </p>
                                </div>

                                {isEditing && !raceSession ?
                                  <div className='mt-2 space-y-2 rounded-lg border border-black/10 bg-black/[0.03] p-2.5'>
                                    <label className='grid gap-1 text-xs text-muted'>
                                      Ce qui ne va pas / ce que tu veux changer
                                      <textarea
                                        className={textareaClass}
                                        value={sessionAdaptRequest}
                                        onChange={(event) =>
                                          setSessionAdaptRequest(
                                            event.target.value,
                                          )
                                        }
                                        placeholder='Ex: trop intense apres la sortie longue, je veux une variante plus progressive avec fractionnes courts.'
                                      />
                                    </label>
                                    <div className='flex flex-wrap gap-2'>
                                      <button
                                        className={primaryButtonClass}
                                        type='button'
                                        disabled={isAdapting}
                                        onClick={() => {
                                          void runSessionAdaptation(
                                            week.weekIndex,
                                            session.sessionIndex,
                                          );
                                        }}
                                      >
                                        {isAdapting ?
                                          'Adaptation IA...'
                                        : 'Valider adaptation'}
                                      </button>
                                      <button
                                        className={secondaryButtonCompactClass}
                                        type='button'
                                        disabled={isAdapting}
                                        onClick={() => {
                                          setEditingSessionKey(null);
                                          setSessionAdaptRequest('');
                                        }}
                                      >
                                        Annuler
                                      </button>
                                    </div>
                                  </div>
                                : null}
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    ))}
                  </div>
            }
          </>
        }
      </Card>
    </div>
  );
}
