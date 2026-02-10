import { env } from '../config.js';
import { z } from 'zod';

interface UserContextProfile {
  hrMax: number;
  age: number | null;
  weightKg: number | null;
  heightCm: number | null;
  goalType: string | null;
  goalDistanceKm: number | null;
  goalTimeSec: number | null;
  speedUnit: string;
  distanceUnit: string;
  elevationUnit: string;
  cadenceUnit: string;
}

interface AiAnalyzeInput {
  page: string;
  sectionKey: string;
  sectionTitle: string;
  sectionSubtitle?: string;
  question?: string;
  context: Record<string, unknown>;
  profile: UserContextProfile;
}

export interface TrainingPlanSession {
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

export interface TrainingPlanWeek {
  weekIndex: number;
  theme: string;
  focus: string;
  weeklyVolumeKm: number;
  sessions: TrainingPlanSession[];
}

export interface TrainingPlanSessionBlock {
  step: string;
  durationMin: number;
  paceTarget: string;
  hrTarget: string;
  repeat: number | null;
  notes: string;
}

interface TrainingPlanInput {
  objective: string;
  weeks: number;
  startDate: string;
  raceDate: string;
  daysToRace: number;
  context: Record<string, unknown>;
  profile: UserContextProfile;
}

interface AdaptTrainingSessionInput {
  objective: string;
  startDate: string;
  raceDate: string;
  daysToRace: number;
  weekIndex: number;
  sessionIndex: number;
  targetSession: TrainingPlanSession;
  siblingSessions: TrainingPlanSession[];
  context: Record<string, unknown>;
  profile: UserContextProfile;
  userRequest: string;
}

interface AdaptTrainingSessionOutput {
  model: string;
  generatedAt: string;
  session: TrainingPlanSession;
}

export interface TrainingPlanOutput {
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

interface HfChoice {
  message?: {
    content?: string | Array<{ type?: string; text?: string }>;
  };
  text?: string;
}

interface HfChatResponse {
  choices?: HfChoice[];
}

interface HfCompletionResponse {
  choices?: Array<{ text?: string }>;
}

export interface AiAnalyzeOutput {
  model: string;
  generatedAt: string;
  answer: string;
}

const FAST_MAX_TOKENS = env.HF_MAX_TOKENS;
const FAST_CONTEXT_MAX_CHARS = 16000;
const FAST_PROFILE_MAX_CHARS = 1000;
const FAST_RESPONSE_HARD_MAX_CHARS = 1900;
const TRAINING_PLAN_MAX_TOKENS = Math.min(
  Math.max(env.HF_MAX_TOKENS, 2600),
  4000,
);

interface PromptShrinkOptions {
  maxDepth: number;
  maxArrayItems: number;
  arrayHeadItems: number;
  arrayTailItems: number;
  maxObjectKeys: number;
}

const defaultPromptShrink: PromptShrinkOptions = {
  maxDepth: 4,
  maxArrayItems: 20,
  arrayHeadItems: 15,
  arrayTailItems: 10,
  maxObjectKeys: 28,
};

interface SafeJsonOptions {
  maxChars?: number;
  shrink?: Partial<PromptShrinkOptions>;
}

function shrinkForPrompt(
  value: unknown,
  depth = 0,
  options: PromptShrinkOptions = defaultPromptShrink,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth >= options.maxDepth) {
    return '[max-depth]';
  }

  if (
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const maxItems = options.maxArrayItems;
    if (value.length <= maxItems) {
      return value.map((item) => shrinkForPrompt(item, depth + 1, options));
    }
    const headCount = Math.min(options.arrayHeadItems, value.length);
    const remainingAfterHead = Math.max(value.length - headCount, 0);
    const tailCount = Math.min(options.arrayTailItems, remainingAfterHead);
    const head = value
      .slice(0, headCount)
      .map((item) => shrinkForPrompt(item, depth + 1, options));
    const tail =
      tailCount > 0 ?
        value
          .slice(-tailCount)
          .map((item) => shrinkForPrompt(item, depth + 1, options))
      : [];
    const omittedCount = value.length - headCount - tailCount;
    return [...head, `... ${Math.max(omittedCount, 0)} items omitted ...`, ...tail];
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const limited = entries.slice(0, options.maxObjectKeys);
    const result: Record<string, unknown> = {};
    for (const [key, entryValue] of limited) {
      result[key] = shrinkForPrompt(entryValue, depth + 1, options);
    }
    if (entries.length > limited.length) {
      result.__truncated__ = `${entries.length - limited.length} keys omitted`;
    }
    return result;
  }

  return String(value);
}

function safeJson(value: unknown, options?: SafeJsonOptions) {
  const shrinkOptions: PromptShrinkOptions = {
    ...defaultPromptShrink,
    ...(options?.shrink ?? {}),
  };
  const maxChars = options?.maxChars ?? 14000;
  const serialized = JSON.stringify(shrinkForPrompt(value, 0, shrinkOptions), null, 2);
  if (serialized.length <= maxChars) {
    return serialized;
  }
  return `${serialized.slice(0, maxChars)}\n...truncated...`;
}

function extractContent(response: HfChatResponse) {
  const firstChoice = response.choices?.[0];
  const raw = firstChoice?.message?.content;

  if (raw) {
    if (typeof raw === 'string') {
      return raw.trim();
    }

    if (Array.isArray(raw)) {
      const text = raw
        .map((chunk) => (chunk.type === 'text' ? chunk.text : ''))
        .filter(Boolean)
        .join('')
        .trim();
      return text || null;
    }
  }

  if (typeof firstChoice?.text === 'string') {
    return firstChoice.text.trim() || null;
  }

  return null;
}

function extractCompletionContent(response: HfCompletionResponse) {
  const raw = response.choices?.[0]?.text;
  if (typeof raw !== 'string') {
    return null;
  }
  return raw.trim() || null;
}

function isNotChatModelError(status: number, payloadText: string) {
  if (status !== 400) {
    return false;
  }
  const lowered = payloadText.toLowerCase();
  return (
    lowered.includes('not a chat model') ||
    lowered.includes('model_not_supported')
  );
}

function isContextLengthErrorMessage(message: string) {
  const lowered = message.toLowerCase();
  return (
    lowered.includes('context_length_exceeded') ||
    lowered.includes('maximum context length') ||
    lowered.includes('prompt has') && lowered.includes('exceeds')
  );
}

function parseModelAndProvider(model: string) {
  const idx = model.lastIndexOf(':');
  if (idx <= 0 || idx >= model.length - 1) {
    return { baseModel: model, provider: null as string | null };
  }
  return {
    baseModel: model.slice(0, idx),
    provider: model.slice(idx + 1),
  };
}

interface HuggingFaceTextRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature?: number;
  topP?: number;
}

interface HuggingFaceTextResponse {
  content: string;
  model: string;
}

async function callHuggingFaceText(
  input: HuggingFaceTextRequest,
): Promise<HuggingFaceTextResponse> {
  if (!env.HF_API_KEY) {
    throw new Error(
      'HF_API_KEY manquant dans server/.env (token HuggingFace requis)',
    );
  }

  const baseHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.HF_API_KEY}`,
  };

  const callChatCompletion = (model: string) =>
    fetch(env.HF_ROUTER_URL, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userPrompt },
        ],
        temperature: input.temperature ?? 0.1,
        top_p: input.topP ?? 0.85,
        max_tokens: input.maxTokens,
        stream: false,
      }),
    });

  const { baseModel, provider } = parseModelAndProvider(env.HF_MODEL);
  let response = await callChatCompletion(env.HF_MODEL);
  let usedCompletionsFallback = false;

  if (!response.ok) {
    const chatErrorText = await response.text();
    if (
      isNotChatModelError(response.status, chatErrorText) ||
      response.status === 404
    ) {
      if (provider === 'featherless-ai') {
        const completionPrompt = [
          '[SYSTEM]',
          input.systemPrompt,
          '',
          '[USER]',
          input.userPrompt,
          '',
          '[ASSISTANT]',
        ].join('\n');

        const completionsUrl =
          'https://router.huggingface.co/featherless-ai/v1/completions';
        usedCompletionsFallback = true;
        response = await fetch(completionsUrl, {
          method: 'POST',
          headers: baseHeaders,
          body: JSON.stringify({
            model: baseModel,
            prompt: completionPrompt,
            max_tokens: input.maxTokens,
            temperature: input.temperature ?? 0.1,
            top_p: input.topP ?? 0.85,
            stream: false,
          }),
        });

        if (!response.ok) {
          const completionErrorText = await response.text();
          throw new Error(
            `HuggingFace failed (${response.status}) on Featherless completions (${baseModel}): ${completionErrorText.slice(0, 700)}`,
          );
        }
      } else {
        const suggestedModel =
          env.HF_MODEL.includes(':') ?
            env.HF_MODEL
          : `${env.HF_MODEL}:featherless-ai`;
        throw new Error(
          [
            `Modele indisponible sur le router chat HuggingFace: ${env.HF_MODEL}.`,
            `Essaie un modele/provider supporte, par ex: HF_MODEL=${suggestedModel}`,
            'Le modele Mistral choisi doit etre deployee par un Inference Provider pour fonctionner via le router.',
            `Detail HF (${response.status}): ${chatErrorText.slice(0, 260)}`,
          ].join(' '),
        );
      }
    } else {
      throw new Error(
        `HuggingFace failed (${response.status}): ${chatErrorText.slice(0, 700)}`,
      );
    }
  }

  const payload = (await response.json()) as
    | HfChatResponse
    | HfCompletionResponse;
  const content =
    usedCompletionsFallback ?
      extractCompletionContent(payload as HfCompletionResponse)
    : extractContent(payload as HfChatResponse);

  if (!content) {
    throw new Error('Reponse IA vide ou invalide');
  }

  return {
    content,
    model:
      usedCompletionsFallback ?
        `${baseModel}:featherless-ai (completions)`
      : env.HF_MODEL,
  };
}

const trainingPlanDayEnum = z.enum([
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
]);

const rawTrainingPlanSessionBlockSchema = z.object({
  step: z.string().max(80).optional(),
  durationMin: z.coerce.number().optional(),
  paceTarget: z.string().max(120).optional(),
  hrTarget: z.string().max(120).optional(),
  repeat: z.coerce.number().int().min(1).max(20).optional(),
  notes: z.string().max(180).optional(),
});

const rawTrainingPlanSessionSchema = z.object({
  day: z.string().max(16).optional(),
  title: z.string().max(120).optional(),
  objective: z.string().max(260).optional(),
  zone: z.string().max(48).optional(),
  durationMin: z.coerce.number().optional(),
  distanceKm: z.coerce.number().optional(),
  paceTarget: z.string().max(120).optional(),
  hrTarget: z.string().max(120).optional(),
  notes: z.string().max(220).optional(),
  rationale: z.string().max(320).optional(),
  blocks: z.array(rawTrainingPlanSessionBlockSchema).max(8).optional(),
});

const rawTrainingPlanSchema = z.object({
  title: z.string().max(140).optional(),
  overview: z.string().max(1500).optional(),
  methodology: z.string().max(1200).optional(),
  warnings: z.array(z.string().min(2).max(220)).default([]),
  weeks: z
    .array(
      z.object({
        weekIndex: z.coerce.number().int().min(1).max(30).optional(),
        theme: z.string().max(120).optional(),
        focus: z.string().max(220).optional(),
        weeklyVolumeKm: z.coerce.number().min(0).max(300).optional(),
        sessions: z.array(rawTrainingPlanSessionSchema).min(1),
      }),
    )
    .min(1),
});

const dayNormalizationMap: Record<string, z.infer<typeof trainingPlanDayEnum>> = {
  mon: 'Mon',
  monday: 'Mon',
  lundi: 'Mon',
  tue: 'Tue',
  tuesday: 'Tue',
  mardi: 'Tue',
  wed: 'Wed',
  wednesday: 'Wed',
  mercredi: 'Wed',
  thu: 'Thu',
  thursday: 'Thu',
  jeudi: 'Thu',
  fri: 'Fri',
  friday: 'Fri',
  vendredi: 'Fri',
  sat: 'Sat',
  saturday: 'Sat',
  samedi: 'Sat',
  sun: 'Sun',
  sunday: 'Sun',
  dimanche: 'Sun',
};

const fallbackDayOrder: z.infer<typeof trainingPlanDayEnum>[] = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Sat',
  'Sun',
  'Fri',
];

const dayRank: Record<z.infer<typeof trainingPlanDayEnum>, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

function trainingDayFromIsoDate(isoDate: string) {
  const [yearRaw, monthRaw, dayRaw] = isoDate.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return 'Sun' as z.infer<typeof trainingPlanDayEnum>;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekDay = date.getUTCDay();
  if (weekDay === 1) {
    return 'Mon' as z.infer<typeof trainingPlanDayEnum>;
  }
  if (weekDay === 2) {
    return 'Tue' as z.infer<typeof trainingPlanDayEnum>;
  }
  if (weekDay === 3) {
    return 'Wed' as z.infer<typeof trainingPlanDayEnum>;
  }
  if (weekDay === 4) {
    return 'Thu' as z.infer<typeof trainingPlanDayEnum>;
  }
  if (weekDay === 5) {
    return 'Fri' as z.infer<typeof trainingPlanDayEnum>;
  }
  if (weekDay === 6) {
    return 'Sat' as z.infer<typeof trainingPlanDayEnum>;
  }
  return 'Sun' as z.infer<typeof trainingPlanDayEnum>;
}

function inferObjectiveDistanceKm(objective: string) {
  const kmMatch = /sur\s+([0-9]+(?:[.,][0-9]+)?)\s*km/i.exec(objective);
  if (!kmMatch) {
    return null;
  }
  const parsed = Number(kmMatch[1].replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function raceSessionHrTarget(distanceKm: number) {
  if (distanceKm <= 5.1) {
    return '88-95% FCmax';
  }
  if (distanceKm <= 10.5) {
    return '85-92% FCmax';
  }
  if (distanceKm <= 22) {
    return '80-88% FCmax';
  }
  return '74-84% FCmax';
}

function isRaceSessionLike(session: TrainingPlanSession) {
  const text = normalizeForComparison(
    `${session.title} ${session.objective} ${session.zone}`,
  );
  return (
    text.includes('course objectif') ||
    text.includes('jour j') ||
    (text.includes('course') && text.includes('objectif')) ||
    text.includes('race day')
  );
}

function buildRaceDaySession(input: {
  weekIndex: number;
  objective: string;
  raceDate: string;
  profile: UserContextProfile;
}) {
  const raceDay = trainingDayFromIsoDate(input.raceDate);
  const objectiveDistance =
    inferObjectiveDistanceKm(input.objective) ??
    (input.profile.goalDistanceKm && input.profile.goalDistanceKm > 0 ?
      input.profile.goalDistanceKm
    : null);
  const distanceKm = clampNumber(objectiveDistance ?? 10, 1, 80);
  const objectivePaceSec = parsePaceSecPerKm(input.objective);
  const profilePaceSec =
    input.profile.goalTimeSec !== null &&
    input.profile.goalDistanceKm !== null &&
    input.profile.goalTimeSec > 0 &&
    input.profile.goalDistanceKm > 0 ?
      input.profile.goalTimeSec / input.profile.goalDistanceKm
    : null;
  const racePaceSec =
    objectivePaceSec !== null ?
      clampNumber(objectivePaceSec, 175, 900)
    : profilePaceSec !== null ?
      clampNumber(profilePaceSec, 175, 900)
    : null;
  const raceDurationMin =
    input.profile.goalTimeSec !== null && input.profile.goalTimeSec > 0 ?
      clampNumber(input.profile.goalTimeSec / 60, 20, 360)
    : racePaceSec !== null ?
      clampNumber((distanceKm * racePaceSec) / 60, 20, 360)
    : clampNumber(distanceKm * 6.1, 20, 360);

  const warmupMin = distanceKm >= 21 ? 10 : 14;
  const cooldownMin = distanceKm >= 21 ? 6 : 8;
  const raceBlockMin = Math.max(
    12,
    Number((raceDurationMin - warmupMin - cooldownMin).toFixed(1)),
  );
  const racePaceTarget =
    racePaceSec !== null ?
      formatPaceRange(racePaceSec - 3, racePaceSec + 4)
    : 'Allure objectif stabilisee';
  const preRacePace =
    racePaceSec !== null ?
      formatPaceRange(racePaceSec + 60, racePaceSec + 85)
    : 'Allure tres facile';
  const postRacePace =
    racePaceSec !== null ?
      formatPaceRange(racePaceSec + 75, racePaceSec + 110)
    : 'Allure retour au calme';
  const hrTarget = raceSessionHrTarget(distanceKm);

  return {
    weekIndex: input.weekIndex,
    sessionIndex: 4,
    day: raceDay,
    title: 'Course objectif',
    objective:
      "Executer la course objectif avec gestion d'allure progressive et controle de l'effort.",
    zone: 'Course',
    durationMin: Number(raceDurationMin.toFixed(1)),
    distanceKm: Number(distanceKm.toFixed(2)),
    paceTarget: racePaceTarget,
    hrTarget,
    notes:
      "Jour J: echauffement bref, allures stables, ravitaillement anticipe et gestion reguliere de l'effort.",
    rationale:
      "La derniere semaine conserve 3 entrainements courts puis la course cible le jour exact de l'objectif.",
    blocks: [
      {
        step: 'Activation pre-course',
        durationMin: warmupMin,
        paceTarget: preRacePace,
        hrTarget: '<= 78% FCmax',
        repeat: null,
        notes: 'Mise en route progressive + mobilite dynamique.',
      },
      {
        step: 'Course objectif',
        durationMin: Number(raceBlockMin.toFixed(1)),
        paceTarget: racePaceTarget,
        hrTarget,
        repeat: null,
        notes: 'Strategie negative split si sensations stables.',
      },
      {
        step: 'Retour au calme',
        durationMin: cooldownMin,
        paceTarget: postRacePace,
        hrTarget: '<= 75% FCmax',
        repeat: null,
        notes: 'Recuperation active et hydratation immediate.',
      },
    ],
  } satisfies TrainingPlanSession;
}

function enforceFinalWeekRaceStructure(
  plan: TrainingPlanWeek[],
  input: Pick<TrainingPlanInput, 'raceDate' | 'objective' | 'profile'>,
) {
  if (plan.length === 0) {
    return plan;
  }
  const finalWeek = plan[plan.length - 1];
  const nonRace = finalWeek.sessions.filter((session) => !isRaceSessionLike(session));
  const selectedTrainings = [...nonRace];
  while (selectedTrainings.length > 3) {
    let removeIndex = 0;
    for (let index = 1; index < selectedTrainings.length; index += 1) {
      const current = selectedTrainings[index];
      const selected = selectedTrainings[removeIndex];
      if (current.durationMin > selected.durationMin) {
        removeIndex = index;
      }
    }
    selectedTrainings.splice(removeIndex, 1);
  }

  while (selectedTrainings.length < 3) {
    const fallbackIdx = selectedTrainings.length;
    selectedTrainings.push({
      weekIndex: finalWeek.weekIndex,
      sessionIndex: fallbackIdx + 1,
      day: fallbackDayOrder[fallbackIdx],
      title: 'Footing d activation',
      objective: 'Activer la foullee et conserver la fraicheur.',
      zone: 'Z1-Z2',
      durationMin: 35,
      distanceKm: 5.5,
      paceTarget: 'Allure facile conversationnelle',
      hrTarget: '65-75% FCmax',
      notes: "Seance courte de maintien, sans fatigue residuelle.",
      rationale:
        "Completer la semaine course avec 3 entrainements legers, sans ajouter de charge excessive.",
      blocks: buildFallbackSessionBlocks({
        title: 'Footing d activation',
        zone: 'Z1-Z2',
        objective: 'Activer la foullee et conserver la fraicheur.',
        notes: "Seance courte de maintien, sans fatigue residuelle.",
        durationMin: 35,
        paceTarget: 'Allure facile conversationnelle',
        hrTarget: '65-75% FCmax',
      }),
    });
  }

  selectedTrainings.forEach((session, index) => {
    session.weekIndex = finalWeek.weekIndex;
    session.sessionIndex = index + 1;
  });

  const raceSession = buildRaceDaySession({
    weekIndex: finalWeek.weekIndex,
    objective: input.objective,
    raceDate: input.raceDate,
    profile: input.profile,
  });
  const nextSessions = [...selectedTrainings.slice(0, 3), raceSession];
  const weeklyVolumeKm = Number(
    nextSessions.reduce((sum, row) => sum + row.distanceKm, 0).toFixed(1),
  );

  const nextPlan = [...plan];
  nextPlan[nextPlan.length - 1] = {
    ...finalWeek,
    theme: 'Semaine course',
    focus:
      "Trois seances d'entretien leger puis course objectif le jour J, sans imposer les jours d'entrainement.",
    weeklyVolumeKm,
    sessions: nextSessions,
  };
  return nextPlan;
}

const defaultTrainingRationale =
  "Justifie la charge et l'intensite de la seance dans la progression hebdomadaire.";
const defaultTrainingFocus = 'Progression controlee et recuperation active.';
const defaultTrainingOverview =
  "Plan periodise en francais, avec progression controlee et variation des intensites.";
const defaultTrainingMethodology =
  'Surcharge progressive, specificite objectif et alternance charge/recuperation.';

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function meanValue(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeOptionalText(
  value: string | undefined,
  fallback: string,
  minLen = 2,
) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const cleaned = value.trim();
  if (cleaned.length < minLen) {
    return fallback;
  }
  return cleaned;
}

function normalizeTrainingDay(value: string | undefined, fallbackIndex = 0) {
  if (typeof value !== 'string') {
    return fallbackDayOrder[fallbackIndex % fallbackDayOrder.length];
  }

  const exact = value.trim();
  const normalizedKey = value.trim().toLowerCase();
  if ((trainingPlanDayEnum.options as readonly string[]).includes(exact)) {
    return exact as z.infer<typeof trainingPlanDayEnum>;
  }

  if (dayNormalizationMap[normalizedKey]) {
    return dayNormalizationMap[normalizedKey];
  }

  return fallbackDayOrder[fallbackIndex % fallbackDayOrder.length];
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toOptionalFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (normalized.length === 0) {
      return undefined;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeOptionalNotes(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, 220);
}

function normalizeWarnings(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length >= 2)
    .slice(0, 8);
}

function normalizeSessionBlockNotes(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, 180);
}

function isIntervalLikeSession(input: {
  title: string;
  zone: string;
  objective: string;
  notes: string;
}) {
  const text = `${input.title} ${input.zone} ${input.objective} ${input.notes}`.toLowerCase();
  return /interv|fraction|vo2|vma|seuil|tempo|repet|cote|pyramide/.test(text);
}

function buildFallbackSessionBlocks(input: {
  title: string;
  zone: string;
  objective: string;
  notes: string;
  durationMin: number;
  paceTarget: string;
  hrTarget: string;
}) {
  const total = clampNumber(input.durationMin, 20, 300);
  const intervalLike = isIntervalLikeSession(input);

  if (intervalLike) {
    const warmup = clampNumber(Math.round(total * 0.24), 10, 22);
    const cooldown = clampNumber(Math.round(total * 0.16), 8, 16);
    const availableMain = Math.max(total - warmup - cooldown, 12);
    const repeat = availableMain >= 24 ? 4 : availableMain >= 18 ? 3 : 2;
    const repDuration = clampNumber(
      Math.round((availableMain - (repeat - 1) * 2) / repeat),
      2,
      8,
    );
    const mainDuration = repeat * repDuration + (repeat - 1) * 2;
    const adjustedCooldown = Math.max(6, total - warmup - mainDuration);

    return [
      {
        step: 'Echauffement',
        durationMin: Number(warmup.toFixed(1)),
        paceTarget: 'Allure facile',
        hrTarget: '<= 75% FCmax',
        repeat: null,
        notes: 'Mise en route progressive + mobilite dynamique.',
      },
      {
        step: 'Bloc intervalle',
        durationMin: Number(mainDuration.toFixed(1)),
        paceTarget: input.paceTarget,
        hrTarget: input.hrTarget,
        repeat,
        notes: `${repeat} x ${repDuration} min effort / 2 min recuperation trottinee.`,
      },
      {
        step: 'Retour au calme',
        durationMin: Number(adjustedCooldown.toFixed(1)),
        paceTarget: 'Allure facile relachee',
        hrTarget: '<= 72% FCmax',
        repeat: null,
        notes: 'Retour progressif et relachement technique.',
      },
    ] satisfies TrainingPlanSessionBlock[];
  }

  const warmup = clampNumber(Math.round(total * 0.2), 8, 18);
  const main = clampNumber(Math.round(total * 0.62), 12, 220);
  const cooldown = Math.max(5, total - warmup - main);
  return [
    {
      step: 'Echauffement',
      durationMin: Number(warmup.toFixed(1)),
      paceTarget: 'Allure facile',
      hrTarget: '<= 75% FCmax',
      repeat: null,
      notes: 'Mise en route progressive.',
    },
    {
      step: 'Bloc principal',
      durationMin: Number(main.toFixed(1)),
      paceTarget: input.paceTarget,
      hrTarget: input.hrTarget,
      repeat: null,
      notes:
        input.objective.length >= 4 ?
          input.objective
        : 'Travail specifique de la seance.',
    },
    {
      step: 'Retour au calme',
      durationMin: Number(cooldown.toFixed(1)),
      paceTarget: 'Allure facile relachee',
      hrTarget: '<= 72% FCmax',
      repeat: null,
      notes: 'Relacher sans monter en intensite.',
    },
  ] satisfies TrainingPlanSessionBlock[];
}

function normalizeSessionBlocks(
  rawBlocks: unknown,
  defaults: {
    title: string;
    zone: string;
    objective: string;
    notes: string;
    durationMin: number;
    paceTarget: string;
    hrTarget: string;
  },
) {
  const rawArray = Array.isArray(rawBlocks) ? rawBlocks : [];
  const blocks: TrainingPlanSessionBlock[] = rawArray
    .slice(0, 6)
    .map((rawBlock, index) => {
      const block = toRecord(rawBlock) ?? {};
      const step = normalizeOptionalText(
        toOptionalString(block.step),
        `Bloc ${index + 1}`,
      );
      const parsedDuration = toOptionalFiniteNumber(block.durationMin);
      const durationMin =
        parsedDuration === undefined ?
          null
        : Number(clampNumber(parsedDuration, 2, 240).toFixed(1));
      const repeatRaw = toOptionalFiniteNumber(block.repeat);
      const repeat =
        repeatRaw === undefined ? null : clampNumber(Math.round(repeatRaw), 1, 20);
      const paceTarget = normalizeOptionalText(
        toOptionalString(block.paceTarget),
        defaults.paceTarget,
      );
      const hrTarget = normalizeOptionalText(
        toOptionalString(block.hrTarget),
        defaults.hrTarget,
      );
      const notes = normalizeSessionBlockNotes(block.notes);
      return {
        step,
        durationMin,
        paceTarget,
        hrTarget,
        repeat,
        notes,
      };
    })
    .filter((block) => block.durationMin !== null)
    .map((block) => ({
      step: block.step,
      durationMin: block.durationMin as number,
      paceTarget: block.paceTarget,
      hrTarget: block.hrTarget,
      repeat: block.repeat,
      notes: block.notes,
    }));

  if (blocks.length > 0) {
    return blocks;
  }

  return buildFallbackSessionBlocks(defaults);
}

function normalizeSessionSignature(input: {
  title: string;
  objective: string;
  zone: string;
}) {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${normalize(input.title)}|${normalize(input.objective)}|${normalize(input.zone)}`;
}

function isSessionDuplicateAgainstWeek(
  candidate: TrainingPlanSession,
  siblings: TrainingPlanSession[],
) {
  const candidateSignature = normalizeSessionSignature(candidate);
  return siblings.some(
    (sibling) => normalizeSessionSignature(sibling) === candidateSignature,
  );
}

function normalizeTrainingSessionFromUnknown(
  rawSessionValue: unknown,
  fallback: TrainingPlanSession,
) {
  const rawSession = toRecord(rawSessionValue) ?? {};
  const normalizedRationale =
    typeof rawSession.rationale === 'string' &&
    rawSession.rationale.trim().length >= 2 ?
      rawSession.rationale.trim()
    : fallback.rationale || defaultTrainingRationale;
  const parsedDuration = toOptionalFiniteNumber(rawSession.durationMin);
  const normalizedDuration =
    typeof parsedDuration === 'number' ?
      clampNumber(parsedDuration, 20, 300)
    : fallback.durationMin;
  const parsedDistance = toOptionalFiniteNumber(rawSession.distanceKm);
  const normalizedDistance =
    typeof parsedDistance === 'number' ?
      clampNumber(parsedDistance, 1, 80)
    : fallback.distanceKm;
  const normalizedTitle = normalizeOptionalText(
    toOptionalString(rawSession.title),
    fallback.title,
  );
  const normalizedObjective = normalizeOptionalText(
    toOptionalString(rawSession.objective),
    fallback.objective,
  );
  const normalizedZone = normalizeOptionalText(
    toOptionalString(rawSession.zone),
    fallback.zone,
  );
  const normalizedPace = normalizeOptionalText(
    toOptionalString(rawSession.paceTarget),
    fallback.paceTarget,
  );
  const normalizedHr = normalizeOptionalText(
    toOptionalString(rawSession.hrTarget),
    fallback.hrTarget,
  );
  const normalizedNotes =
    normalizeOptionalNotes(rawSession.notes) || fallback.notes || '';
  const blocks = normalizeSessionBlocks(rawSession.blocks, {
    title: normalizedTitle,
    zone: normalizedZone,
    objective: normalizedObjective,
    notes: normalizedNotes,
    durationMin: Number(normalizedDuration.toFixed(1)),
    paceTarget: normalizedPace,
    hrTarget: normalizedHr,
  });

  return {
    weekIndex: fallback.weekIndex,
    sessionIndex: fallback.sessionIndex,
    day: fallback.day,
    title: normalizedTitle,
    objective: normalizedObjective,
    zone: normalizedZone,
    durationMin: Number(normalizedDuration.toFixed(1)),
    distanceKm: Number(normalizedDistance.toFixed(2)),
    paceTarget: normalizedPace,
    hrTarget: normalizedHr,
    notes: normalizedNotes,
    rationale: normalizedRationale,
    blocks,
  } satisfies TrainingPlanSession;
}

function enforceSessionDifferentiation(
  candidate: TrainingPlanSession,
  siblings: TrainingPlanSession[],
) {
  if (!isSessionDuplicateAgainstWeek(candidate, siblings)) {
    return candidate;
  }

  return {
    ...candidate,
    title: `${candidate.title} (variante)`,
    notes:
      candidate.notes.trim().length > 0 ?
        `${candidate.notes} Variante forcee pour eviter un doublon dans la semaine.`
      : 'Variante forcee pour eviter un doublon dans la semaine.',
  };
}

type TrainingSessionRole = 'easy' | 'quality' | 'long';
type TrainingWeekPhase = 'build' | 'deload' | 'taper';
interface TrainingPlanWeekRules {
  peakWeek: number;
  taperMinus14Week: number;
  taperMinus7Week: number;
  raceWeek: number;
}

function normalizeForComparison(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isQualityLikeSession(session: TrainingPlanSession) {
  const text =
    `${session.title} ${session.objective} ${session.zone} ${session.paceTarget} ${session.notes}`.toLowerCase();
  return /interv|fraction|vma|vo2|tempo|seuil|fartlek|cote|z3|z4|z5/.test(text);
}

function buildPlanWeekRules(totalWeeks: number): TrainingPlanWeekRules {
  const raceWeek = Math.max(1, totalWeeks);
  const taperMinus7Week = Math.max(1, raceWeek - 1);
  const taperMinus14Week = Math.max(1, raceWeek - 2);
  const peakWeek = Math.max(1, raceWeek - 3);
  return {
    peakWeek,
    taperMinus14Week,
    taperMinus7Week,
    raceWeek,
  };
}

function isThreeOneRecoveryWeek(
  weekIndex: number,
  rules: TrainingPlanWeekRules,
) {
  return weekIndex < rules.peakWeek && weekIndex % 4 === 0;
}

function detectWeekPhase(
  weekIndex: number,
  totalWeeks: number,
  rules = buildPlanWeekRules(totalWeeks),
): TrainingWeekPhase {
  if (weekIndex >= rules.taperMinus14Week) {
    return 'taper';
  }
  if (isThreeOneRecoveryWeek(weekIndex, rules)) {
    return 'deload';
  }
  return 'build';
}

function buildWeeklyVolumeTargets(
  baselineVolumeKm: number,
  totalWeeks: number,
  rules: TrainingPlanWeekRules,
) {
  const base = clampNumber(baselineVolumeKm, 20, 110);
  const weekly = new Array<number>(totalWeeks).fill(base);
  weekly[0] = base;

  for (let weekIndex = 2; weekIndex <= rules.peakWeek; weekIndex += 1) {
    const prev = weekly[weekIndex - 2];
    if (isThreeOneRecoveryWeek(weekIndex, rules) && weekIndex !== rules.peakWeek) {
      weekly[weekIndex - 1] = Number((prev * 0.75).toFixed(1));
      continue;
    }
    const plannedRise = weekIndex % 4 === 1 ? 0.1 : 0.07;
    weekly[weekIndex - 1] = Number((prev * (1 + plannedRise)).toFixed(1));
  }

  if (rules.peakWeek >= 2) {
    const prev = weekly[rules.peakWeek - 2];
    const peakTarget = Number((prev * 1.08).toFixed(1));
    weekly[rules.peakWeek - 1] = Math.min(
      peakTarget,
      Number((prev * 1.1).toFixed(1)),
    );
  }

  const peakVolume = weekly[rules.peakWeek - 1] ?? base;
  if (rules.taperMinus14Week >= 1 && rules.taperMinus14Week <= totalWeeks) {
    weekly[rules.taperMinus14Week - 1] = Number((peakVolume * 0.8).toFixed(1));
  }
  if (rules.taperMinus7Week >= 1 && rules.taperMinus7Week <= totalWeeks) {
    weekly[rules.taperMinus7Week - 1] = Number((peakVolume * 0.5).toFixed(1));
  }
  if (rules.raceWeek >= 1 && rules.raceWeek <= totalWeeks) {
    weekly[rules.raceWeek - 1] = Number((peakVolume * 0.35).toFixed(1));
  }

  for (let i = 1; i < weekly.length; i += 1) {
    const prev = weekly[i - 1];
    if (weekly[i] > prev * 1.1) {
      weekly[i] = Number((prev * 1.1).toFixed(1));
    }
  }

  return weekly.map((value) => clampNumber(value, 15, 160));
}

function detectSessionRolesForWeek(sessions: TrainingPlanSession[]) {
  const roles: TrainingSessionRole[] = sessions.map(() => 'easy');
  if (sessions.length === 0) {
    return roles;
  }

  const longestIdx = sessions.reduce((bestIdx, row, idx, list) =>
    row.distanceKm > list[bestIdx].distanceKm ? idx : bestIdx,
  0);
  roles[longestIdx] = 'long';

  const qualityCandidates = sessions
    .map((session, idx) => ({ idx, qualityLike: isQualityLikeSession(session) }))
    .filter((row) => row.idx !== longestIdx && row.qualityLike)
    .map((row) => row.idx);

  for (const idx of qualityCandidates) {
    roles[idx] = 'quality';
  }

  if (qualityCandidates.length < 2) {
    const fillCandidates = sessions
      .map((session, idx) => ({ idx, day: dayRank[session.day] }))
      .filter((row) => row.idx !== longestIdx && roles[row.idx] !== 'quality')
      .sort((a, b) => a.day - b.day);
    const needed = 2 - qualityCandidates.length;
    for (let i = 0; i < needed && i < fillCandidates.length; i += 1) {
      roles[fillCandidates[i].idx] = 'quality';
    }
  }

  return roles;
}

function weekNeedsStructuralVariation(
  sessions: TrainingPlanSession[],
  roles: TrainingSessionRole[],
) {
  if (sessions.length <= 1) {
    return false;
  }

  const titleCount = new Set(
    sessions.map((session) => normalizeForComparison(session.title)),
  ).size;
  const objectiveCount = new Set(
    sessions.map((session) => normalizeForComparison(session.objective)),
  ).size;
  const zoneCount = new Set(
    sessions.map((session) => normalizeForComparison(session.zone)),
  ).size;
  const qualityRoleCount = roles.filter((role) => role === 'quality').length;
  const qualityLikeCount = sessions.filter((session) =>
    isQualityLikeSession(session),
  ).length;
  const mostlyEasyCount = sessions.filter((session) => {
    const text = normalizeForComparison(
      `${session.title} ${session.objective} ${session.zone} ${session.notes}`,
    );
    return /footing|facile|endurance|z1|z2/.test(text);
  }).length;

  return (
    titleCount <= 2 ||
    objectiveCount <= 2 ||
    zoneCount <= 1 ||
    (qualityRoleCount >= 1 && qualityLikeCount === 0) ||
    mostlyEasyCount >= sessions.length - 1
  );
}

function isSessionTooSimilarToPreviousWeek(
  current: TrainingPlanSession,
  previous: TrainingPlanSession,
) {
  const sameTitle =
    normalizeForComparison(current.title) === normalizeForComparison(previous.title);
  const sameObjective =
    normalizeForComparison(current.objective) ===
    normalizeForComparison(previous.objective);
  const samePace =
    normalizeForComparison(current.paceTarget) ===
    normalizeForComparison(previous.paceTarget);
  const sameZone =
    normalizeForComparison(current.zone) === normalizeForComparison(previous.zone);
  const nearDistance = Math.abs(current.distanceKm - previous.distanceKm) <= 0.35;
  const nearDuration = Math.abs(current.durationMin - previous.durationMin) <= 4;

  return (
    ((sameTitle || sameObjective) && samePace && nearDistance && nearDuration) ||
    (sameZone && samePace && nearDistance && nearDuration)
  );
}

function shiftPaceTargetBySeconds(text: string, deltaSeconds: number) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) {
    return text;
  }
  let replaced = false;
  const updated = text.replace(
    /(\d{1,2}):(\d{2})\s*\/\s*(km|mi)/gi,
    (_match, minRaw: string, secRaw: string, unitRaw: string) => {
      const min = Number(minRaw);
      const sec = Number(secRaw);
      if (!Number.isFinite(min) || !Number.isFinite(sec)) {
        return _match;
      }
      const totalSec = min * 60 + sec;
      const shifted = clampNumber(totalSec + deltaSeconds, 120, 900);
      const shiftedMin = Math.floor(shifted / 60);
      const shiftedSec = shifted % 60;
      replaced = true;
      return `${shiftedMin}:${shiftedSec.toString().padStart(2, '0')}/${String(unitRaw).toLowerCase()}`;
    },
  );
  return replaced ? updated : text;
}

function paceDeltaForSession(
  role: TrainingSessionRole,
  phase: TrainingWeekPhase,
  weekIndex: number,
  totalWeeks: number,
) {
  if (phase === 'build') {
    if (role === 'quality') {
      return -2 - ((weekIndex + totalWeeks) % 2);
    }
    if (role === 'long') {
      return weekIndex % 2 === 0 ? -1 : 0;
    }
    return 1;
  }
  if (phase === 'deload') {
    return role === 'quality' ? 6 : role === 'long' ? 4 : 2;
  }
  return weekIndex === totalWeeks ?
      role === 'quality' ? 8
      : role === 'long' ? 6
      : 3
    : role === 'quality' ? 4
    : role === 'long' ? 2
    : 1;
}

interface PaceModel {
  goalPaceSecPerKm: number;
  longRunPaceMinSec: number;
  longRunPaceMaxSec: number;
  easyPaceMinSec: number;
  easyPaceMaxSec: number;
  thresholdPaceMinSec: number;
  thresholdPaceMaxSec: number;
  intervalPaceMinSec: number;
  intervalPaceMaxSec: number;
}

function parsePaceSecPerKm(text: string) {
  const match = /(\d{1,2}):(\d{2})\s*\/\s*(km|mi)/i.exec(text);
  if (!match) {
    return null;
  }
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  const total = minutes * 60 + seconds;
  if (match[3].toLowerCase() === 'mi') {
    return total / 1.60934;
  }
  return total;
}

function formatPaceSecPerKm(secondsPerKm: number) {
  const safe = clampNumber(Math.round(secondsPerKm), 180, 780);
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${min}:${sec.toString().padStart(2, '0')}/km`;
}

function formatPaceRange(minSecPerKm: number, maxSecPerKm: number) {
  const lower = clampNumber(Math.min(minSecPerKm, maxSecPerKm), 180, 780);
  const upper = clampNumber(Math.max(minSecPerKm, maxSecPerKm), 180, 780);
  return `${formatPaceSecPerKm(lower)}-${formatPaceSecPerKm(upper)}`;
}

function hasExplicitNumericPace(value: string) {
  return /(\d{1,2}):(\d{2})\s*\/\s*(km|mi)/i.test(value);
}

function hasExplicitHrTarget(value: string) {
  return /fcmax|%|bpm/i.test(value);
}

function buildPaceModelFromContext(
  context: Record<string, unknown>,
  objective: string,
): PaceModel {
  const runningProfile = toRecord(context.runningProfile) ?? {};
  const medianPaceMinPerKm = toOptionalFiniteNumber(
    runningProfile.medianPaceMinPerKm,
  );
  const q25PaceMinPerKm = toOptionalFiniteNumber(runningProfile.q25PaceMinPerKm);
  const objectivePaceSec = parsePaceSecPerKm(objective);
  const medianSec =
    medianPaceMinPerKm !== undefined ?
      clampNumber(medianPaceMinPerKm * 60, 190, 760)
    : null;
  const q25Sec =
    q25PaceMinPerKm !== undefined ?
      clampNumber(q25PaceMinPerKm * 60, 180, 740)
    : null;
  let goalPaceSecPerKm =
    objectivePaceSec !== null ?
      clampNumber(objectivePaceSec, 180, 760)
    : q25Sec ?? (medianSec !== null ? medianSec * 0.95 : 320);

  if (medianSec !== null) {
    goalPaceSecPerKm = clampNumber(goalPaceSecPerKm, medianSec * 0.7, medianSec * 1.15);
  }

  const longRunPaceMinSec = clampNumber(goalPaceSecPerKm + 32, 205, 780);
  const longRunPaceMaxSec = clampNumber(goalPaceSecPerKm + 62, 225, 780);
  const easyPaceMinSec = clampNumber(goalPaceSecPerKm + 48, 220, 780);
  const easyPaceMaxSec = clampNumber(goalPaceSecPerKm + 78, 240, 780);
  const thresholdPaceMinSec = clampNumber(goalPaceSecPerKm - 18, 180, 700);
  const thresholdPaceMaxSec = clampNumber(goalPaceSecPerKm - 6, 188, 720);
  const intervalPaceMinSec = clampNumber(goalPaceSecPerKm - 42, 175, 660);
  const intervalPaceMaxSec = clampNumber(goalPaceSecPerKm - 24, 180, 680);

  return {
    goalPaceSecPerKm,
    longRunPaceMinSec,
    longRunPaceMaxSec,
    easyPaceMinSec,
    easyPaceMaxSec,
    thresholdPaceMinSec,
    thresholdPaceMaxSec,
    intervalPaceMinSec,
    intervalPaceMaxSec,
  };
}

function choosePaceTarget(base: string, fallback: string) {
  const cleaned = base.trim();
  if (
    cleaned.length >= 4 &&
    !/^allure facile conversationnelle$/i.test(cleaned)
  ) {
    return cleaned;
  }
  return fallback;
}

function chooseRolePaceTarget(
  session: TrainingPlanSession,
  role: TrainingSessionRole,
  phase: TrainingWeekPhase,
  paceModel: PaceModel,
) {
  if (phase === 'taper' && role === 'quality') {
    return formatPaceRange(
      paceModel.goalPaceSecPerKm - 3,
      paceModel.goalPaceSecPerKm + 4,
    );
  }

  if (role === 'long') {
    return formatPaceRange(
      paceModel.longRunPaceMinSec,
      paceModel.longRunPaceMaxSec,
    );
  }
  if (role === 'easy') {
    return formatPaceRange(paceModel.easyPaceMinSec, paceModel.easyPaceMaxSec);
  }

  const text = normalizeForComparison(
    `${session.title} ${session.objective} ${session.notes}`,
  );
  if (/interv|fraction|vma|vo2|cote/.test(text)) {
    return formatPaceRange(
      paceModel.intervalPaceMinSec,
      paceModel.intervalPaceMaxSec,
    );
  }
  return formatPaceRange(
    paceModel.thresholdPaceMinSec,
    paceModel.thresholdPaceMaxSec,
  );
}

function chooseRoleHrTarget(
  role: TrainingSessionRole,
  phase: TrainingWeekPhase,
  session: TrainingPlanSession,
) {
  if (phase === 'taper' && role === 'quality') {
    return '78-86% FCmax';
  }
  if (role === 'long') {
    return '70-83% FCmax';
  }
  if (role === 'easy') {
    return '65-76% FCmax';
  }
  const text = normalizeForComparison(
    `${session.title} ${session.objective} ${session.notes}`,
  );
  if (/interv|fraction|vma|vo2|cote/.test(text)) {
    return '88-95% FCmax';
  }
  return '82-90% FCmax';
}

function buildTaperMarathonTuneupBlocks(
  session: TrainingPlanSession,
  paceModel: PaceModel,
) {
  const total = clampNumber(session.durationMin, 30, 75);
  const warmup = clampNumber(Math.round(total * 0.35), 10, 20);
  const cooldown = clampNumber(Math.round(total * 0.25), 8, 16);
  const middle = Math.max(total - warmup - cooldown, 12);
  const repeat = middle >= 18 ? 3 : 2;
  const repDuration = clampNumber(Math.round((middle - (repeat - 1) * 2) / repeat), 4, 8);
  const mainDuration = repeat * repDuration + (repeat - 1) * 2;
  const finalCooldown = Math.max(6, total - warmup - mainDuration);

  return [
    {
      step: 'Echauffement',
      durationMin: Number(warmup.toFixed(1)),
      paceTarget: formatPaceRange(
        paceModel.easyPaceMinSec,
        paceModel.easyPaceMaxSec,
      ),
      hrTarget: '<= 76% FCmax',
      repeat: null,
      notes: 'Mise en route progressive.',
    },
    {
      step: 'Rappel allure objectif',
      durationMin: Number(mainDuration.toFixed(1)),
      paceTarget: formatPaceRange(
        paceModel.goalPaceSecPerKm - 3,
        paceModel.goalPaceSecPerKm + 4,
      ),
      hrTarget: '78-86% FCmax',
      repeat,
      notes: `${repeat} x ${repDuration} min allure objectif / 2 min tres facile.`,
    },
    {
      step: 'Retour au calme',
      durationMin: Number(finalCooldown.toFixed(1)),
      paceTarget: formatPaceRange(
        paceModel.easyPaceMinSec,
        paceModel.easyPaceMaxSec,
      ),
      hrTarget: '<= 74% FCmax',
      repeat: null,
      notes: 'Fin souple sans accumuler de fatigue.',
    },
  ] satisfies TrainingPlanSessionBlock[];
}

function applySessionVariationTemplate(
  session: TrainingPlanSession,
  role: TrainingSessionRole,
  weekIndex: number,
) {
  const variant = (weekIndex + session.sessionIndex) % 4;
  if (role === 'long') {
    const presets = [
      {
        title: 'Sortie longue progressive',
        objective: "Construire l'endurance specifique avec une fin legerement active.",
        zone: 'Z2',
        paceTarget: 'Allure endurance stable',
        hrTarget: '70-82% FCmax',
        notes: 'Finir les 15-20 dernieres minutes en controle actif.',
      },
      {
        title: 'Sortie longue endurance',
        objective: "Augmenter la tolerance au volume en restant economique.",
        zone: 'Z1-Z2',
        paceTarget: 'Allure endurance relachee',
        hrTarget: '68-80% FCmax',
        notes: 'Hydratation reguliere et allure stable.',
      },
      {
        title: 'Sortie longue vallonnee',
        objective: "Renforcer l'endurance musculaire sur terrain varie.",
        zone: 'Z2',
        paceTarget: 'Allure endurance en terrain vallonne',
        hrTarget: '70-83% FCmax',
        notes: 'Garder la maitrise cardio dans les faux plats.',
      },
      {
        title: 'Sortie longue negative split',
        objective: 'Ameliorer la gestion de course et la progression finale.',
        zone: 'Z2-Z3',
        paceTarget: 'Allure progressive',
        hrTarget: '72-84% FCmax',
        notes: 'Deuxieme moitie legerement plus rapide que la premiere.',
      },
    ] as const;
    const preset = presets[variant];
    return {
      ...session,
      title: preset.title,
      objective: preset.objective,
      zone: preset.zone,
      paceTarget: choosePaceTarget(session.paceTarget, preset.paceTarget),
      hrTarget: preset.hrTarget,
      notes: preset.notes,
    };
  }

  if (role === 'quality') {
    const presets = [
      {
        title: 'Seuil progressif',
        objective: 'Elever le seuil lactique et stabiliser l allure cible.',
        zone: 'Z3-Z4',
        paceTarget: 'Allure seuil controlee',
        hrTarget: '82-90% FCmax',
        notes: 'Bloc principal progressif sans depasser le controle technique.',
      },
      {
        title: 'Intervalles courts',
        objective: 'Stimuler VO2max avec repetitions courtes et propres.',
        zone: 'Z4-Z5',
        paceTarget: 'Allure intense sur repetitions courtes',
        hrTarget: '88-95% FCmax',
        notes: 'Recuperations courtes trottinees, qualite avant quantite.',
      },
      {
        title: 'Fartlek controle',
        objective: 'Travailler les changements de rythme en continu.',
        zone: 'Z3-Z4',
        paceTarget: 'Alternance allure soutenue / relachee',
        hrTarget: '84-92% FCmax',
        notes: 'Alternance effort/reprise sans rupture complete.',
      },
      {
        title: 'Cotes courtes',
        objective: 'Renforcer la puissance specifique et la foulee.',
        zone: 'Z4',
        paceTarget: 'Efforts en cote courts',
        hrTarget: '86-94% FCmax',
        notes: 'Montees explosives, retour calme en descente.',
      },
    ] as const;
    const preset = presets[variant];
    return {
      ...session,
      title: preset.title,
      objective: preset.objective,
      zone: preset.zone,
      paceTarget: choosePaceTarget(session.paceTarget, preset.paceTarget),
      hrTarget: preset.hrTarget,
      notes: preset.notes,
    };
  }

  const easyPresets = [
    {
      title: 'Footing endurance',
      objective: 'Consolider la base aerobie sans fatigue residuelle.',
      zone: 'Z1-Z2',
      paceTarget: 'Allure facile conversationnelle',
      hrTarget: '65-75% FCmax',
      notes: 'Allure conversationnelle constante.',
    },
    {
      title: 'Footing + educatifs',
      objective: 'Stabiliser la technique de course en endurance facile.',
      zone: 'Z1-Z2',
      paceTarget: 'Allure facile + educatifs',
      hrTarget: '65-76% FCmax',
      notes: 'Ajouter quelques educatifs courts en fin de seance.',
    },
    {
      title: 'Footing progressif',
      objective: 'Monter legerement en intensite sans basculer en qualite.',
      zone: 'Z2',
      paceTarget: 'Allure progressive controlee',
      hrTarget: '70-80% FCmax',
      notes: 'Dernier tiers legerement plus soutenu, toujours controle.',
    },
    {
      title: 'Footing recuperation',
      objective: 'Absorber la charge precedente et maintenir la frequence.',
      zone: 'Z1',
      paceTarget: 'Allure tres facile',
      hrTarget: '<= 72% FCmax',
      notes: 'Relache et facile, focus recuperation.',
    },
  ] as const;
  const easyPreset = easyPresets[variant];
  return {
    ...session,
    title: easyPreset.title,
    objective: easyPreset.objective,
    zone: easyPreset.zone,
    paceTarget: choosePaceTarget(session.paceTarget, easyPreset.paceTarget),
    hrTarget: easyPreset.hrTarget,
    notes: easyPreset.notes,
  };
}

function scaleSessionBlocksToDuration(
  session: TrainingPlanSession,
): TrainingPlanSessionBlock[] {
  if (!Array.isArray(session.blocks) || session.blocks.length === 0) {
    return buildFallbackSessionBlocks({
      title: session.title,
      zone: session.zone,
      objective: session.objective,
      notes: session.notes,
      durationMin: session.durationMin,
      paceTarget: session.paceTarget,
      hrTarget: session.hrTarget,
    });
  }

  const totalBlocks = session.blocks.reduce((sum, block) => sum + block.durationMin, 0);
  if (!Number.isFinite(totalBlocks) || totalBlocks <= 0) {
    return buildFallbackSessionBlocks({
      title: session.title,
      zone: session.zone,
      objective: session.objective,
      notes: session.notes,
      durationMin: session.durationMin,
      paceTarget: session.paceTarget,
      hrTarget: session.hrTarget,
    });
  }

  const ratio = session.durationMin / totalBlocks;
  const scaled = session.blocks.map((block) => ({
    ...block,
    durationMin: Number(clampNumber(block.durationMin * ratio, 2, 180).toFixed(1)),
  }));

  const scaledTotal = scaled.reduce((sum, block) => sum + block.durationMin, 0);
  const delta = Number((session.durationMin - scaledTotal).toFixed(1));
  if (Math.abs(delta) >= 0.1) {
    const lastIdx = scaled.length - 1;
    scaled[lastIdx] = {
      ...scaled[lastIdx],
      durationMin: Number(clampNumber(scaled[lastIdx].durationMin + delta, 2, 200).toFixed(1)),
    };
  }
  return scaled;
}

function weekThemeAndFocus(weekIndex: number, totalWeeks: number) {
  const phase = detectWeekPhase(weekIndex, totalWeeks);
  if (phase === 'taper') {
    if (weekIndex === totalWeeks) {
      return {
        theme: 'Affutage final',
        focus:
          "Reduire la charge, garder de la tonicite et arriver frais le jour de course.",
      };
    }
    return {
      theme: 'Debut affutage',
      focus:
        "Conserver l'intensite utile en diminuant le volume pour faire monter la fraicheur.",
    };
  }
  if (phase === 'deload') {
    return {
      theme: 'Assimilation',
      focus:
        "Semaine allegee pour absorber la charge precedente sans perdre les acquis.",
    };
  }
  return {
    theme: 'Developpement specifique',
    focus:
      "Progression controlee du volume et de la qualite selon l'objectif cible.",
  };
}

function enforcePlanProgressionAndVariation(
  rawPlan: TrainingPlanWeek[],
  totalWeeks: number,
  context: Record<string, unknown>,
  objective: string,
) {
  if (rawPlan.length === 0) {
    return rawPlan;
  }

  const firstWeeks = rawPlan.slice(0, Math.min(rawPlan.length, 2));
  const baselineCandidate = meanValue(
    firstWeeks.map((week) => {
      const volume = week.sessions.reduce((sum, row) => sum + row.distanceKm, 0);
      return Number.isFinite(volume) && volume > 0 ? volume : week.weeklyVolumeKm;
    }),
  );
  const baselineVolumeKm = clampNumber(
    Number.isFinite(baselineCandidate) && baselineCandidate > 0 ?
      baselineCandidate
    : 42,
    24,
    95,
  );
  const planRules = buildPlanWeekRules(totalWeeks);
  const weeklyVolumeTargets = buildWeeklyVolumeTargets(
    baselineVolumeKm,
    totalWeeks,
    planRules,
  );
  const paceModel = buildPaceModelFromContext(context, objective);

  const result: TrainingPlanWeek[] = [];
  for (let weekIdx = 0; weekIdx < rawPlan.length; weekIdx += 1) {
    const sourceWeek = rawPlan[weekIdx];
    const weekIndex = weekIdx + 1;
    const previousWeek = result[weekIdx - 1] ?? null;
    const orderedSessions = [...sourceWeek.sessions].sort(
      (a, b) => dayRank[a.day] - dayRank[b.day],
    );
    const roles = detectSessionRolesForWeek(orderedSessions);
    const forceWeekVariation = weekNeedsStructuralVariation(orderedSessions, roles);
    const currentWeekVolume = orderedSessions.reduce(
      (sum, session) => sum + session.distanceKm,
      0,
    );
    const targetVolumeKm =
      weeklyVolumeTargets[weekIdx] ?? weeklyVolumeTargets[weeklyVolumeTargets.length - 1] ?? baselineVolumeKm;
    const scaleBase =
      currentWeekVolume > 0 ? targetVolumeKm / currentWeekVolume : 1;

    let adjustedSessions = orderedSessions.map((session, idx) => {
      const role = roles[idx] ?? 'easy';
      const phase = detectWeekPhase(weekIndex, totalWeeks, planRules);
      let roleScale = 1;
      if (phase === 'build') {
        roleScale *= 1 + (((weekIndex + idx) % 3) - 1) * 0.025;
        if (role === 'long') {
          roleScale *= 1.05;
        } else if (role === 'quality') {
          roleScale *= 1.03;
        }
      } else if (phase === 'deload') {
        roleScale *= role === 'quality' ? 0.88 : role === 'long' ? 0.9 : 0.94;
      } else {
        roleScale *=
          weekIndex === totalWeeks ?
            role === 'quality' ? 0.62
            : role === 'long' ? 0.58
            : 0.72
          : role === 'quality' ? 0.82
          : role === 'long' ? 0.78
          : 0.9;
      }

      const distanceRange =
        role === 'long' ? [12, 38]
        : role === 'quality' ? [6, 18]
        : [5, 16];
      const durationRange =
        role === 'long' ? [70, 240]
        : role === 'quality' ? [35, 110]
        : [30, 90];
      const nextDistance = clampNumber(
        session.distanceKm * scaleBase * roleScale,
        distanceRange[0],
        distanceRange[1],
      );
      const nextDuration = clampNumber(
        session.durationMin * scaleBase * roleScale,
        durationRange[0],
        durationRange[1],
      );

      let nextSession: TrainingPlanSession = {
        ...session,
        distanceKm: Number(nextDistance.toFixed(2)),
        durationMin: Number(nextDuration.toFixed(1)),
      };
      let templateApplied = false;
      const roleText = normalizeForComparison(
        `${nextSession.title} ${nextSession.objective} ${nextSession.zone}`,
      );
      const roleMismatch =
        (role === 'quality' && !isQualityLikeSession(nextSession)) ||
        (role === 'long' && !/long|sortie longue|endurance/.test(roleText));
      if (forceWeekVariation || roleMismatch) {
        nextSession = applySessionVariationTemplate(nextSession, role, weekIndex);
        templateApplied = true;
      }
      const previousSession = previousWeek?.sessions[idx] ?? null;
      const repeated =
        previousSession !== null &&
        isSessionTooSimilarToPreviousWeek(nextSession, previousSession);
      const looksGeneric = /^seance\s+\d+/i.test(nextSession.title);
      if (repeated || looksGeneric) {
        nextSession = applySessionVariationTemplate(nextSession, role, weekIndex);
        templateApplied = true;
      }

      const paceDelta = paceDeltaForSession(role, phase, weekIndex, totalWeeks);
      const shiftedExistingPace = shiftPaceTargetBySeconds(
        nextSession.paceTarget,
        paceDelta,
      );
      const rolePace = chooseRolePaceTarget(nextSession, role, phase, paceModel);
      nextSession.paceTarget =
        hasExplicitNumericPace(shiftedExistingPace) ? shiftedExistingPace : rolePace;
      const roleHr = chooseRoleHrTarget(role, phase, nextSession);
      if (!hasExplicitHrTarget(nextSession.hrTarget)) {
        nextSession.hrTarget = roleHr;
      }
      if (templateApplied) {
        nextSession.blocks = buildFallbackSessionBlocks({
          title: nextSession.title,
          zone: nextSession.zone,
          objective: nextSession.objective,
          notes: nextSession.notes,
          durationMin: nextSession.durationMin,
          paceTarget: nextSession.paceTarget,
          hrTarget: nextSession.hrTarget,
        });
      }

      if (phase === 'taper' && role === 'quality') {
        nextSession.title = 'Rappel allure objectif';
        nextSession.objective =
          'Conserver le tonus avec des blocs courts a allure objectif.';
        nextSession.zone = 'Z2-Z3';
        nextSession.notes =
          'Volume reduit, intensite conservee via rappels courts a allure objectif.';
        nextSession.paceTarget = rolePace;
        nextSession.hrTarget = roleHr;
        nextSession.blocks = buildTaperMarathonTuneupBlocks(nextSession, paceModel);
        return nextSession;
      }

      const mainBlocks =
        nextSession.blocks.length > 2 ?
          nextSession.blocks.slice(1, -1)
        : nextSession.blocks;
      const hasMainNumericPace = mainBlocks.some((block) =>
        hasExplicitNumericPace(block.paceTarget),
      );
      const hasMainHr = mainBlocks.some((block) =>
        hasExplicitHrTarget(block.hrTarget),
      );
      if (!hasMainNumericPace || !hasMainHr) {
        nextSession.blocks = buildFallbackSessionBlocks({
          title: nextSession.title,
          zone: nextSession.zone,
          objective: nextSession.objective,
          notes: nextSession.notes,
          durationMin: nextSession.durationMin,
          paceTarget: nextSession.paceTarget,
          hrTarget: nextSession.hrTarget,
        });
      }
      nextSession.blocks = scaleSessionBlocksToDuration(nextSession);
      return nextSession;
    });

    const adjustedVolume = adjustedSessions.reduce(
      (sum, session) => sum + session.distanceKm,
      0,
    );
    if (adjustedVolume > 0) {
      const correction = targetVolumeKm / adjustedVolume;
      adjustedSessions = adjustedSessions.map((session, idx) => {
        const role = roles[idx] ?? 'easy';
        const distanceRange =
          role === 'long' ? [12, 38]
          : role === 'quality' ? [6, 18]
          : [5, 16];
        const durationRange =
          role === 'long' ? [70, 240]
          : role === 'quality' ? [35, 110]
          : [30, 90];
        const nextDistance = clampNumber(
          session.distanceKm * correction,
          distanceRange[0],
          distanceRange[1],
        );
        const nextDuration = clampNumber(
          session.durationMin * correction,
          durationRange[0],
          durationRange[1],
        );
        const nextSession = {
          ...session,
          distanceKm: Number(nextDistance.toFixed(2)),
          durationMin: Number(nextDuration.toFixed(1)),
        };
        return {
          ...nextSession,
          blocks: scaleSessionBlocksToDuration(nextSession),
        };
      });
    }

    let differentiatedSessions = adjustedSessions.map((session, idx) => {
      const siblings = adjustedSessions.filter((_, rowIdx) => rowIdx !== idx);
      return enforceSessionDifferentiation(session, siblings);
    });

    differentiatedSessions.forEach((session, idx) => {
      session.weekIndex = weekIndex;
      session.sessionIndex = idx + 1;
    });

    let weeklyVolumeKm = Number(
      differentiatedSessions
        .reduce((sum, session) => sum + session.distanceKm, 0)
        .toFixed(1),
    );
    const enforceTowardTarget =
      weeklyVolumeKm > 0 && Math.abs(weeklyVolumeKm - targetVolumeKm) > 0.4;
    if (enforceTowardTarget) {
      const factor = targetVolumeKm / weeklyVolumeKm;
      differentiatedSessions = differentiatedSessions.map((session, idx) => {
        const role = roles[idx] ?? 'easy';
        const distanceRange =
          role === 'long' ? [12, 38]
          : role === 'quality' ? [6, 18]
          : [5, 16];
        const durationRange =
          role === 'long' ? [70, 240]
          : role === 'quality' ? [35, 110]
          : [30, 90];
        const nextDistance = clampNumber(
          session.distanceKm * factor,
          distanceRange[0],
          distanceRange[1],
        );
        const nextDuration = clampNumber(
          session.durationMin * factor,
          durationRange[0],
          durationRange[1],
        );
        const nextSession = {
          ...session,
          distanceKm: Number(nextDistance.toFixed(2)),
          durationMin: Number(nextDuration.toFixed(1)),
        };
        return {
          ...nextSession,
          blocks: scaleSessionBlocksToDuration(nextSession),
        };
      });
      weeklyVolumeKm = Number(
        differentiatedSessions
          .reduce((sum, session) => sum + session.distanceKm, 0)
          .toFixed(1),
      );
    }
    const phaseMeta = weekThemeAndFocus(weekIndex, totalWeeks);
    const theme =
      sourceWeek.theme.trim().length < 4 ||
      /^semaine\s+\d+/i.test(sourceWeek.theme) ||
      (previousWeek !== null && sourceWeek.theme === previousWeek.theme) ?
        phaseMeta.theme
      : sourceWeek.theme;
    const focus =
      sourceWeek.focus.trim().length < 6 ||
      sourceWeek.focus === defaultTrainingFocus ||
      (previousWeek !== null && sourceWeek.focus === previousWeek.focus) ?
        phaseMeta.focus
      : sourceWeek.focus;

    result.push({
      ...sourceWeek,
      weekIndex,
      theme,
      focus,
      weeklyVolumeKm,
      sessions: differentiatedSessions,
    });
  }

  return result;
}

function collectFencedJsonBlocks(raw: string) {
  const blocks: string[] = [];
  const regex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null = regex.exec(raw);
  while (match) {
    if (match[1]) {
      blocks.push(match[1].trim());
    }
    match = regex.exec(raw);
  }
  return blocks;
}

function collectBalancedJsonObjects(raw: string) {
  const candidates: string[] = [];
  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (startIndex < 0) {
      if (char === '{') {
        startIndex = index;
        depth = 1;
        inString = false;
        escaped = false;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        candidates.push(raw.slice(startIndex, index + 1).trim());
        startIndex = -1;
      }
    }
  }

  return candidates;
}

function normalizeJsonCandidate(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
}

function autoCloseJsonCandidate(value: string) {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (const char of value) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      stack.push('}');
      continue;
    }
    if (char === '[') {
      stack.push(']');
      continue;
    }
    if ((char === '}' || char === ']') && stack[stack.length - 1] === char) {
      stack.pop();
    }
  }

  let fixed = value;
  if (inString) {
    fixed = `${fixed}"`;
  }
  while (stack.length > 0) {
    fixed += stack.pop();
  }
  return normalizeJsonCandidate(fixed);
}

function parseJsonCandidate(candidate: string) {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  const slices = new Set<string>();
  slices.add(trimmed);
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0) {
    slices.add(trimmed.slice(firstBrace));
  }
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    slices.add(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const rawSlice of slices) {
    const cleaned = normalizeJsonCandidate(rawSlice);
    if (!cleaned.startsWith('{')) {
      continue;
    }
    try {
      return JSON.parse(cleaned);
    } catch {
      const repaired = autoCloseJsonCandidate(cleaned);
      try {
        return JSON.parse(repaired);
      } catch {
        continue;
      }
    }
  }

  return null;
}

function parseLooseJsonObject(raw: string) {
  const candidates: string[] = [];
  candidates.push(...collectFencedJsonBlocks(raw));
  candidates.push(...collectBalancedJsonObjects(raw));
  const firstBrace = raw.indexOf('{');
  if (firstBrace >= 0) {
    candidates.push(raw.slice(firstBrace));
  }
  candidates.push(raw);

  const uniqueCandidates = [...new Set(candidates.map((item) => item.trim()).filter(Boolean))];
  for (const candidate of uniqueCandidates) {
    const parsed = parseJsonCandidate(candidate);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  }

  throw new Error(
    "Impossible d'extraire un JSON objet valide depuis la reponse IA",
  );
}

function trimByWords(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }

  const sliced = value.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace < 0) {
    return `${sliced.trim()}…`;
  }

  return `${sliced.slice(0, lastSpace).trim()}…`;
}

function splitSentences(text: string) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return [];
  }

  const matches = cleaned.match(/[^.!?]+[.!?]?/g);
  if (!matches || matches.length === 0) {
    return [cleaned];
  }

  return matches.map((item) => item.trim()).filter(Boolean);
}

function shortenSectionText(text: string, maxSentences: number, maxChars: number) {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return '';
  }

  const kept = sentences.slice(0, maxSentences).join(' ');
  return trimByWords(kept, maxChars);
}

function compactAiAnswer(answer: string) {
  const normalized = answer
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (normalized.length <= FAST_RESPONSE_HARD_MAX_CHARS) {
    return normalized;
  }

  const sectionRegex = /(^##\s+[^\n]+)\n([\s\S]*?)(?=^##\s+[^\n]+|\Z)/gm;
  const sections: Array<{ heading: string; body: string }> = [];

  let match: RegExpExecArray | null = sectionRegex.exec(normalized);
  while (match) {
    sections.push({
      heading: match[1].trim(),
      body: match[2].trim(),
    });
    match = sectionRegex.exec(normalized);
  }

  if (sections.length === 0) {
    return trimByWords(normalized, FAST_RESPONSE_HARD_MAX_CHARS);
  }

  const compact = sections
    .map((section) => {
      const headingLower = section.heading.toLowerCase();
      const sentenceCap =
        headingLower.includes('analyse detaillee') ? 3 : 2;
      const charCap =
        headingLower.includes('analyse detaillee') ? 900 : 420;
      const shortened = shortenSectionText(section.body, sentenceCap, charCap);
      return `${section.heading}\n${shortened}`;
    })
    .join('\n\n')
    .trim();

  if (compact.length <= FAST_RESPONSE_HARD_MAX_CHARS) {
    return compact;
  }

  return trimByWords(compact, FAST_RESPONSE_HARD_MAX_CHARS);
}

export async function analyzeSectionWithHuggingFace(
  input: AiAnalyzeInput,
): Promise<AiAnalyzeOutput> {
  if (!env.HF_API_KEY) {
    throw new Error(
      'HF_API_KEY manquant dans server/.env (token HuggingFace requis)',
    );
  }

  const contextJson = safeJson(input.context, {
    maxChars: FAST_CONTEXT_MAX_CHARS,
  });
  const profileJson = safeJson(input.profile, {
    maxChars: FAST_PROFILE_MAX_CHARS,
  });

  const systemPrompt = [
    'You are a sports-endurance performance analyst for StravHat.',
    'Goal: produce a clear, scientific, highly relevant and concise analysis.',
    'Critical constraints:',
    '1) Use only provided data; explicitly flag inferences.',
    '2) Never invent measurements or sources.',
    '3) Strict anti-repetition: never restate the same metric comparison twice; each section must add non-overlapping information.',
    '4) Prioritize quantitative comparison: recent vs baseline, median, IQR, z-score, trend slope when available.',
    '5) You may add cautious external benchmarks from scientific literature and common endurance references.',
    "6) If exact benchmark is missing, use broad ranges and label them as 'repere general'.",
    '7) Explain limits (sample size, missing data, selection bias).',
    '8) No generic health advice and no diagnosis.',
    '9) Final answer must be in French.',
    '10) Never conclude fatigue/surentraînement from one metric alone; require at least 2 convergent signals or label as low-confidence hypothesis.',
    "11) Forbidden sections/headings: 'Synthese rapide', 'Fiabilite', 'Actions', 'Sources', 'References'.",
    "12) If athlete profile includes a goal (goalType/goalDistanceKm/goalTimeSec), explicitly evaluate whether the current data supports this goal and quantify the gap to target pace/intensity when possible.",
    '13) Keep the answer compact and readable on mobile.',
    '14) Hard length cap: 900-1500 characters total.',
    '15) Keep only the most decision-useful signals; remove any low-value detail.',
    "16) If context indicates global mode (analysisScope.mode='global' or sectionType contains 'global'), analyze aggregate trends only and avoid centering the narrative on one specific session.",
    'Required output format:',
    '## Analyse detaillee',
    '- 1 seul paragraphe, 3 phrases maximum.',
    '## Comparaison',
    '- 1 paragraphe tres court, 2 phrases maximum.',
    '## Implications entrainement',
    '- 1 paragraphe tres court, 2 phrases maximum.',
    "- No bullet list, no repetition, no filler text.",
    "Do not generate any section other than these three.",
    "Ne genere pas de section 'Sources' ou de bibliographie.",
  ].join('\n');

  const userPrompt = [
    `Page: ${input.page}`,
    `Section key: ${input.sectionKey}`,
    `Section title: ${input.sectionTitle}`,
    `Section subtitle: ${input.sectionSubtitle ?? 'n/a'}`,
    `User question: ${input.question ?? 'Provide a scientific and practical assessment for this section.'}`,
    '',
    'Athlete profile (settings):',
    profileJson,
    '',
    'Section data (JSON):',
    contextJson,
    '',
    'Priority for analysis:',
    '- If present, use graph.comparisonBaseline and graph.heartRateSpecific first.',
    '- Then use graph.distributionDiagnostics, graph.matrixTopRelatedMetrics and graph.distributionShape.',
    '- Avoid repeating static profile data unless needed for a numeric ratio.',
  ].join('\n');
  const completion = await callHuggingFaceText({
    systemPrompt,
    userPrompt,
    maxTokens: FAST_MAX_TOKENS,
    temperature: 0.1,
    topP: 0.85,
  });

  return {
    model: completion.model,
    generatedAt: new Date().toISOString(),
    answer: compactAiAnswer(completion.content),
  };
}

export async function generateTrainingPlanWithHuggingFace(
  input: TrainingPlanInput,
): Promise<TrainingPlanOutput> {
  const systemPrompt = [
    'You are an elite running coach and exercise-physiology analyst.',
    'Task: build a scientifically grounded running training plan.',
    'Constraints:',
    '1) Exactly 4 sessions per week. In final week: exactly 3 training sessions + 1 race session.',
    '2) Exactly requested number of weeks.',
    '3) Progressive overload with at least one deload week every 4 weeks.',
    '4) Cover all intensity domains over the cycle (easy, tempo/threshold, VO2, long run).',
    '5) Use realistic pace targets based on provided athlete history and current fatigue context.',
    '6) Keep sessions varied to reduce monotony and overuse risk.',
    '7) Every session must include: day, title, objective, zone, durationMin, distanceKm, paceTarget, hrTarget, notes, rationale, blocks.',
    '8) blocks must contain 2 to 4 items with: step, durationMin, paceTarget, hrTarget, repeat, notes.',
    '9) For interval sessions, blocks must explicitly show repeats and recovery logic.',
    '10) All user-facing strings MUST be in French.',
    '11) No medical diagnosis.',
    '12) Return STRICT JSON only. No markdown, no prose outside JSON.',
    '13) Output must start with "{" and end with "}".',
    '14) Do not add any explanation before or after the JSON object.',
    '15) Keep strings concise and actionable.',
    '16) Use compact JSON (no long prose, no redundant whitespace).',
    '17) Avoid generic safety/legal disclaimers and keep warnings as an empty array unless a concrete data issue exists.',
    '18) Strict anti-monotony: no two consecutive weeks may contain the same 4 sessions with same title/pace/duration/distance.',
    '19) Enforce week-to-week progression: each week must evolve (volume, block structure, intensity focus, or pacing targets) according to periodization.',
    '20) Use athlete historical progression from context to calibrate realistic changes.',
    '21) Peak week volume must occur at D-21 from race day.',
    '22) Use 3:1 loading rule before taper: 3 build weeks then 1 recovery week with 20-30% lower volume.',
    '23) Taper must apply: D-14 volume = -20% from peak, D-7 volume = -50% from peak, keep short race-pace reminders.',
    '24) Never increase weekly volume by more than 10% versus previous week.',
    '25) Training days are flexible placeholders; do not impose rigid weekday obligations in text.',
    '26) The race session day must match the provided race date.',
  ].join('\n');

  const promptCompressionConfigs = [
    {
      contextMaxChars: 56000,
      contextShrink: {
        maxDepth: 5,
        maxArrayItems: 1200,
        arrayHeadItems: 1000,
        arrayTailItems: 80,
        maxObjectKeys: 70,
      },
      profileMaxChars: 2200,
      profileShrink: {
        maxDepth: 4,
        maxArrayItems: 60,
        arrayHeadItems: 50,
        arrayTailItems: 10,
        maxObjectKeys: 50,
      },
      maxTokens: Math.min(TRAINING_PLAN_MAX_TOKENS, 2800),
    },
    {
      contextMaxChars: 36000,
      contextShrink: {
        maxDepth: 4,
        maxArrayItems: 700,
        arrayHeadItems: 620,
        arrayTailItems: 40,
        maxObjectKeys: 56,
      },
      profileMaxChars: 1800,
      profileShrink: {
        maxDepth: 4,
        maxArrayItems: 45,
        arrayHeadItems: 40,
        arrayTailItems: 5,
        maxObjectKeys: 42,
      },
      maxTokens: Math.min(TRAINING_PLAN_MAX_TOKENS, 2300),
    },
    {
      contextMaxChars: 24000,
      contextShrink: {
        maxDepth: 4,
        maxArrayItems: 420,
        arrayHeadItems: 360,
        arrayTailItems: 20,
        maxObjectKeys: 40,
      },
      profileMaxChars: 1300,
      profileShrink: {
        maxDepth: 3,
        maxArrayItems: 28,
        arrayHeadItems: 24,
        arrayTailItems: 4,
        maxObjectKeys: 34,
      },
      maxTokens: Math.min(TRAINING_PLAN_MAX_TOKENS, 1800),
    },
  ] as const;

  let completion: HuggingFaceTextResponse | null = null;
  let lastContextError: string | null = null;

  for (const compression of promptCompressionConfigs) {
    const contextJson = safeJson(input.context, {
      maxChars: compression.contextMaxChars,
      shrink: compression.contextShrink,
    });
    const profileJson = safeJson(input.profile, {
      maxChars: compression.profileMaxChars,
      shrink: compression.profileShrink,
    });
    const userPrompt = [
      `Objective: ${input.objective}`,
      `Weeks requested: ${input.weeks}`,
      `Plan start date (local): ${input.startDate}`,
      `Race date (local): ${input.raceDate}`,
      `Days to race: ${input.daysToRace}`,
      '',
      'Athlete profile (settings):',
      profileJson,
      '',
      'Context computed from all past sessions + current load/fatigue:',
      contextJson,
      '',
      'Return JSON with this exact shape:',
      '{',
      '  "title": "string",',
      '  "overview": "string",',
      '  "methodology": "string",',
      '  "warnings": ["string", "..."],',
      '  "weeks": [',
      '    {',
      '      "weekIndex": 1,',
      '      "theme": "string",',
      '      "focus": "string",',
      '      "weeklyVolumeKm": 42.5,',
      '      "sessions": [',
      '        {',
      '          "day": "Mon|Tue|Wed|Thu|Fri|Sat|Sun",',
      '          "title": "string",',
      '          "objective": "string",',
      '          "zone": "string",',
      '          "durationMin": 55,',
      '          "distanceKm": 10.2,',
      '          "paceTarget": "string",',
      '          "hrTarget": "string",',
      '          "notes": "string",',
      '          "rationale": "string",',
      '          "blocks": [',
      '            {',
      '              "step": "Echauffement",',
      '              "durationMin": 12,',
      '              "paceTarget": "6:20/km",',
      '              "hrTarget": "<= 75% FCmax",',
      '              "repeat": 1,',
      '              "notes": "mise en route progressive"',
      '            }',
      '          ]',
      '        }',
      '      ]',
      '    }',
      '  ]',
      '}',
      '',
      'Critical: each week must contain exactly 4 sessions.',
      'Critical: each session must include 2-4 detailed blocks.',
      'Critical: output text must be in French.',
      'Critical: weeks cannot be copy-pasted; each week must show concrete evolution from previous week.',
      'Critical: respect D-21 peak, 3:1 loading, D-14 -20%, D-7 -50%, and max +10% weekly increase.',
      'Critical: final week = 3 entrainements + 1 course objectif le jour exact de la date de course.',
    ].join('\n');

    try {
      completion = await callHuggingFaceText({
        systemPrompt,
        userPrompt,
        maxTokens: compression.maxTokens,
        temperature: 0.15,
        topP: 0.9,
      });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isContextLengthErrorMessage(message)) {
        lastContextError = message;
        continue;
      }
      throw error;
    }
  }

  if (!completion) {
    throw new Error(
      `Prompt trop long pour le modele apres compression automatique. ${lastContextError ?? ''}`.trim(),
    );
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = parseLooseJsonObject(completion.content);
  } catch (error) {
    throw new Error(
      `Plan IA invalide (JSON non parseable): ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }

  const parsedPlanResult = rawTrainingPlanSchema.safeParse(parsedUnknown);
  const parsedRoot = toRecord(parsedUnknown) ?? {};
  const rawWeeksSource =
    parsedPlanResult.success ?
      parsedPlanResult.data.weeks
    : Array.isArray(parsedRoot.weeks) ?
      parsedRoot.weeks
    : [];

  const normalizedPlan: TrainingPlanWeek[] = Array.from(
    { length: input.weeks },
    (_, weekIndexZero) => {
      const weekIndex = weekIndexZero + 1;
      const rawWeekValue = rawWeeksSource[weekIndexZero];
      const rawWeek = toRecord(rawWeekValue) ?? {};
      const rawSessionsSource =
        Array.isArray(rawWeek.sessions) ? rawWeek.sessions : [];
      const normalizedSessions = rawSessionsSource
        .slice(0, 4)
        .map((sessionValue, sessionIndexZero) => {
          const session = toRecord(sessionValue) ?? {};
          const parsedDuration = toOptionalFiniteNumber(session.durationMin);
          const normalizedDuration =
            typeof parsedDuration === 'number' ?
              clampNumber(parsedDuration, 20, 300)
            : 45;
          const parsedDistance = toOptionalFiniteNumber(session.distanceKm);
          const normalizedDistance =
            typeof parsedDistance === 'number' ?
              clampNumber(parsedDistance, 1, 80)
            : 7.5;
          const normalizedTitle = normalizeOptionalText(
            toOptionalString(session.title),
            `Seance ${sessionIndexZero + 1}`,
          );
          const normalizedObjective = normalizeOptionalText(
            toOptionalString(session.objective),
            'Consolider la base aerobie et la tolerance a la charge.',
          );
          const normalizedZone = normalizeOptionalText(
            toOptionalString(session.zone),
            'Z1-Z2',
          );
          const normalizedPace = normalizeOptionalText(
            toOptionalString(session.paceTarget),
            'Allure facile conversationnelle',
          );
          const normalizedHr = normalizeOptionalText(
            toOptionalString(session.hrTarget),
            '65-75% FCmax',
          );
          const normalizedNotes = normalizeOptionalNotes(session.notes);
          const fallbackSession = {
            weekIndex,
            sessionIndex: sessionIndexZero + 1,
            day: normalizeTrainingDay(
              toOptionalString(session.day),
              sessionIndexZero,
            ),
            title: normalizedTitle,
            objective: normalizedObjective,
            zone: normalizedZone,
            durationMin: Number(normalizedDuration.toFixed(1)),
            distanceKm: Number(normalizedDistance.toFixed(2)),
            paceTarget: normalizedPace,
            hrTarget: normalizedHr,
            notes: normalizedNotes,
            rationale: defaultTrainingRationale,
            blocks: buildFallbackSessionBlocks({
              title: normalizedTitle,
              zone: normalizedZone,
              objective: normalizedObjective,
              notes: normalizedNotes,
              durationMin: Number(normalizedDuration.toFixed(1)),
              paceTarget: normalizedPace,
              hrTarget: normalizedHr,
            }),
          } satisfies TrainingPlanSession;
          return normalizeTrainingSessionFromUnknown(session, fallbackSession);
        })
        .sort((a, b) => dayRank[a.day] - dayRank[b.day]);

      while (normalizedSessions.length < 4) {
        const fallbackIdx = normalizedSessions.length;
        const fallbackRole: TrainingSessionRole =
          fallbackIdx === 3 ? 'long'
          : fallbackIdx === 1 || fallbackIdx === 2 ? 'quality'
          : 'easy';
        const fallbackBase =
          fallbackRole === 'long' ?
            {
              title: 'Sortie longue',
              objective: "Developper l'endurance specifique.",
              zone: 'Z2',
              durationMin: 85,
              distanceKm: 14,
              paceTarget: 'Allure endurance stable',
              hrTarget: '70-83% FCmax',
            }
          : fallbackRole === 'quality' ?
            {
              title: 'Seance qualite',
              objective: 'Stimuler la vitesse et la tolerance a l effort.',
              zone: 'Z3-Z4',
              durationMin: 52,
              distanceKm: 9,
              paceTarget: 'Allure seuil controlee',
              hrTarget: '84-92% FCmax',
            }
          : {
              title: 'Footing endurance',
              objective: 'Consolider la base aerobie',
              zone: 'Z1-Z2',
              durationMin: 45,
              distanceKm: 7.5,
              paceTarget: 'Allure facile conversationnelle',
              hrTarget: '65-75% FCmax',
            };
        const autoFilled = applySessionVariationTemplate(
          {
            weekIndex,
            sessionIndex: fallbackIdx + 1,
            day: fallbackDayOrder[fallbackIdx],
            title: fallbackBase.title,
            objective: fallbackBase.objective,
            zone: fallbackBase.zone,
            durationMin: fallbackBase.durationMin,
            distanceKm: fallbackBase.distanceKm,
            paceTarget: fallbackBase.paceTarget,
            hrTarget: fallbackBase.hrTarget,
            notes:
              'Seance auto-completee pour garantir un microcycle varie (endurance, qualite, longue).',
            rationale:
              "Completer le volume hebdomadaire sans perte de specificite des intensites.",
            blocks: buildFallbackSessionBlocks({
              title: fallbackBase.title,
              zone: fallbackBase.zone,
              objective: fallbackBase.objective,
              notes:
                'Seance auto-completee pour garantir un microcycle varie (endurance, qualite, longue).',
              durationMin: fallbackBase.durationMin,
              paceTarget: fallbackBase.paceTarget,
              hrTarget: fallbackBase.hrTarget,
            }),
          },
          fallbackRole,
          weekIndex,
        );
        normalizedSessions.push({
          weekIndex,
          sessionIndex: fallbackIdx + 1,
          day: autoFilled.day,
          title: autoFilled.title,
          objective: autoFilled.objective,
          zone: autoFilled.zone,
          durationMin: autoFilled.durationMin,
          distanceKm: autoFilled.distanceKm,
          paceTarget: autoFilled.paceTarget,
          hrTarget: autoFilled.hrTarget,
          notes: autoFilled.notes,
          rationale: autoFilled.rationale,
          blocks: buildFallbackSessionBlocks({
            title: autoFilled.title,
            zone: autoFilled.zone,
            objective: autoFilled.objective,
            notes: autoFilled.notes,
            durationMin: autoFilled.durationMin,
            paceTarget: autoFilled.paceTarget,
            hrTarget: autoFilled.hrTarget,
          }),
        });
      }

      normalizedSessions.forEach((session, index) => {
        session.sessionIndex = index + 1;
      });

      const parsedWeeklyVolume = toOptionalFiniteNumber(rawWeek.weeklyVolumeKm);
      const weeklyVolumeKm =
        parsedWeeklyVolume === undefined ?
          normalizedSessions.reduce((sum, session) => sum + session.distanceKm, 0)
        : clampNumber(parsedWeeklyVolume, 0, 300);

      return {
        weekIndex,
        theme: normalizeOptionalText(
          toOptionalString(rawWeek.theme),
          `Semaine ${weekIndex}`,
        ),
        focus: normalizeOptionalText(
          toOptionalString(rawWeek.focus),
          defaultTrainingFocus,
        ),
        weeklyVolumeKm: Number(weeklyVolumeKm.toFixed(1)),
        sessions: normalizedSessions,
      };
    },
  );

  const parsedTitle =
    parsedPlanResult.success ?
      parsedPlanResult.data.title
    : toOptionalString(parsedRoot.title);
  const parsedOverview =
    parsedPlanResult.success ?
      parsedPlanResult.data.overview
    : toOptionalString(parsedRoot.overview);
  const parsedMethodology =
    parsedPlanResult.success ?
      parsedPlanResult.data.methodology
    : toOptionalString(parsedRoot.methodology);
  const parsedWarnings =
    parsedPlanResult.success ?
      parsedPlanResult.data.warnings.slice(0, 8)
    : normalizeWarnings(parsedRoot.warnings);
  const progressedPlan = enforcePlanProgressionAndVariation(
    normalizedPlan,
    input.weeks,
    input.context,
    input.objective,
  );
  const finalPlan = enforceFinalWeekRaceStructure(progressedPlan, {
    raceDate: input.raceDate,
    objective: input.objective,
    profile: input.profile,
  });

  return {
    model: completion.model,
    generatedAt: new Date().toISOString(),
    title: normalizeOptionalText(
      parsedTitle,
      `Plan ${input.weeks} semaines`,
      4,
    ),
    goal: input.objective,
    weeks: input.weeks,
    startDate: input.startDate,
    raceDate: input.raceDate,
    daysToRace: input.daysToRace,
    overview: normalizeOptionalText(parsedOverview, defaultTrainingOverview, 10),
    methodology: normalizeOptionalText(
      parsedMethodology,
      defaultTrainingMethodology,
      10,
    ),
    warnings: parsedWarnings,
    plan: finalPlan,
  };
}

export async function adaptTrainingSessionWithHuggingFace(
  input: AdaptTrainingSessionInput,
): Promise<AdaptTrainingSessionOutput> {
  const systemPrompt = [
    'You are an elite running coach and exercise-physiology analyst.',
    'Task: adapt exactly one running session inside an existing week plan.',
    'Constraints:',
    '1) Keep the same session day as the original target session.',
    '2) Return only one session object (not full plan).',
    '3) Respect weekly coherence with sibling sessions.',
    '4) Avoid duplicate session intent versus sibling sessions.',
    '5) Include concrete workout blocks (2 to 4 blocks) with durations and intensity targets.',
    '6) For interval workouts, include explicit repeats and recoveries.',
    '7) Use realistic paces/HR targets from athlete context.',
    '8) All user-facing text must be in French.',
    '9) Return STRICT JSON only, no markdown or extra text.',
    '10) JSON keys required: day,title,objective,zone,durationMin,distanceKm,paceTarget,hrTarget,notes,rationale,blocks.',
    '11) Each block keys required: step,durationMin,paceTarget,hrTarget,repeat,notes.',
  ].join('\n');

  const compressionConfigs = [
    {
      contextMaxChars: 16000,
      contextShrink: {
        maxDepth: 4,
        maxArrayItems: 240,
        arrayHeadItems: 180,
        arrayTailItems: 30,
        maxObjectKeys: 42,
      },
      profileMaxChars: 1500,
      profileShrink: {
        maxDepth: 3,
        maxArrayItems: 28,
        arrayHeadItems: 22,
        arrayTailItems: 6,
        maxObjectKeys: 32,
      },
      maxTokens: Math.min(TRAINING_PLAN_MAX_TOKENS, 1600),
    },
    {
      contextMaxChars: 9000,
      contextShrink: {
        maxDepth: 3,
        maxArrayItems: 120,
        arrayHeadItems: 90,
        arrayTailItems: 20,
        maxObjectKeys: 30,
      },
      profileMaxChars: 900,
      profileShrink: {
        maxDepth: 3,
        maxArrayItems: 20,
        arrayHeadItems: 16,
        arrayTailItems: 4,
        maxObjectKeys: 26,
      },
      maxTokens: Math.min(TRAINING_PLAN_MAX_TOKENS, 1200),
    },
  ] as const;

  let completion: HuggingFaceTextResponse | null = null;
  let lastContextError: string | null = null;

  for (const compression of compressionConfigs) {
    const contextJson = safeJson(input.context, {
      maxChars: compression.contextMaxChars,
      shrink: compression.contextShrink,
    });
    const profileJson = safeJson(input.profile, {
      maxChars: compression.profileMaxChars,
      shrink: compression.profileShrink,
    });

    const userPrompt = [
      `Objectif global: ${input.objective}`,
      `Date debut plan: ${input.startDate}`,
      `Date course: ${input.raceDate}`,
      `Jours restants: ${input.daysToRace}`,
      `Semaine cible: ${input.weekIndex}`,
      `Session cible index: ${input.sessionIndex}`,
      `Demande utilisateur: ${input.userRequest}`,
      '',
      'Session cible actuelle (a adapter):',
      safeJson(input.targetSession, { maxChars: 2400 }),
      '',
      'Autres sessions de la semaine (a conserver, ne pas dupliquer):',
      safeJson(input.siblingSessions, { maxChars: 3400 }),
      '',
      'Profil athlete:',
      profileJson,
      '',
      'Contexte entrainement (historique + charge):',
      contextJson,
      '',
      'Return JSON session with this shape only:',
      '{',
      '  "day": "Mon|Tue|Wed|Thu|Fri|Sat|Sun",',
      '  "title": "string",',
      '  "objective": "string",',
      '  "zone": "string",',
      '  "durationMin": 55,',
      '  "distanceKm": 10.2,',
      '  "paceTarget": "string",',
      '  "hrTarget": "string",',
      '  "notes": "string",',
      '  "rationale": "string",',
      '  "blocks": [',
      '    {',
      '      "step": "Echauffement",',
      '      "durationMin": 12,',
      '      "paceTarget": "6:20/km",',
      '      "hrTarget": "<= 75% FCmax",',
      '      "repeat": 1,',
      '      "notes": "string"',
      '    }',
      '  ]',
      '}',
      '',
      'Critical: keep day identical to current target session.',
      'Critical: no duplicate session intent with sibling sessions.',
      'Critical: answer in French.',
    ].join('\n');

    try {
      completion = await callHuggingFaceText({
        systemPrompt,
        userPrompt,
        maxTokens: compression.maxTokens,
        temperature: 0.15,
        topP: 0.9,
      });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isContextLengthErrorMessage(message)) {
        lastContextError = message;
        continue;
      }
      throw error;
    }
  }

  if (!completion) {
    throw new Error(
      `Prompt trop long pour adapter la seance. ${lastContextError ?? ''}`.trim(),
    );
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = parseLooseJsonObject(completion.content);
  } catch (error) {
    throw new Error(
      `Adaptation IA invalide (JSON non parseable): ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }

  const parsedRoot = toRecord(parsedUnknown) ?? {};
  const rawSession =
    toRecord(parsedRoot.session) ?? (toRecord(parsedUnknown) ?? {});
  const normalized = normalizeTrainingSessionFromUnknown(
    rawSession,
    input.targetSession,
  );
  const differentiated = enforceSessionDifferentiation(
    normalized,
    input.siblingSessions,
  );

  return {
    model: completion.model,
    generatedAt: new Date().toISOString(),
    session: differentiated,
  };
}
