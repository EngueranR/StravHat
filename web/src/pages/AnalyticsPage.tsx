import { useEffect, useMemo, useState } from 'react';
import ReactECharts from '../components/LocalizedECharts';
import { apiRequest } from '../api/client';
import { AIInsightButton } from '../components/AIInsightButton';
import { Card } from '../components/Card';
import { InfoHint } from '../components/InfoHint';
import { PageHeader } from '../components/PageHeader';
import { SectionHeader } from '../components/SectionHeader';
import { StatCard } from '../components/StatCard';
import { inputClass, selectClass } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { ActivityModal } from '../components/ActivityModal';
import type { Activity, ActivityListResponse } from '../api/types';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { CorrelationBuilderPage } from './CorrelationBuilderPage';
import {
  buildActivityFilterQuery,
  type ActivityFilterState,
} from '../utils/activityFilters';
import { bucketRange, type TimeBucket } from '../utils/bucket';
import { buildGithubHeatmapOption } from '../utils/githubHeatmap';
import { number } from '../utils/format';
import {
  cadenceUnitLabel,
  convertCadenceRpm,
  convertCorrelationMetricValue,
  convertDistanceKm,
  convertSpeedKmh,
  distanceUnitLabel,
  elevationUnitLabel,
  formatCadenceFromRpm,
  formatDistanceFromKm,
  formatElevationFromMeters,
  formatSpeedAxisValue,
  formatSpeedFromKmh,
  metricUnit,
  resolveUnitPreferences,
  speedUnitLabel,
} from '../utils/units';

type TrendMetric =
  | 'distance'
  | 'time'
  | 'elev'
  | 'avgHR'
  | 'maxHR'
  | 'avgSpeed'
  | 'maxSpeed'
  | 'avgWatts'
  | 'maxWatts'
  | 'cadence'
  | 'strideLength'
  | 'groundContactTime'
  | 'verticalOscillation'
  | 'kilojoules'
  | 'calories'
  | 'sufferScore';

type DistributionMetric =
  | 'distance'
  | 'time'
  | 'elev'
  | 'avgHR'
  | 'maxHR'
  | 'avgSpeed'
  | 'maxSpeed'
  | 'avgWatts'
  | 'maxWatts'
  | 'cadence'
  | 'strideLength'
  | 'groundContactTime'
  | 'verticalOscillation'
  | 'kilojoules'
  | 'calories'
  | 'sufferScore';

type CorrelationVarForAi =
  | 'distance'
  | 'movingTime'
  | 'elevGain'
  | 'avgSpeed'
  | 'maxSpeed'
  | 'avgHR'
  | 'maxHR'
  | 'avgWatts'
  | 'maxWatts'
  | 'cadence'
  | 'strideLength'
  | 'groundContactTime'
  | 'verticalOscillation'
  | 'sufferScore'
  | 'kilojoules'
  | 'calories'
  | 'charge';

interface TrendResponse {
  metric: string;
  aggregation: 'sum' | 'avg' | 'max';
  bucket: string;
  series: Array<{ bucket: string; value: number; samples?: number }>;
}

interface CorrelationCellResponse {
  x: string;
  y: string;
  value: number | null;
  n: number;
}

interface CorrelationResponseForAi {
  method: 'pearson' | 'spearman';
  matrix: CorrelationCellResponse[];
}

interface PivotResponse {
  row: string;
  metrics: string[];
  rows: Array<{ key: string; [key: string]: number | string }>;
}

interface DistributionResponse {
  metric: string;
  bins: Array<{ from: number; to: number; count: number }>;
  sampleSize: number;
}

interface LoadResponse {
  hrMax: number;
  series: Array<{
    date: string;
    charge: number;
    ctl: number;
    atl: number;
    tsb: number;
  }>;
}

interface SummaryResponse {
  count: number;
  totalDistanceKm: number;
  totalMovingTimeHours: number;
  totalElevationGain: number;
  totalKilojoules: number;
  totalCalories: number;
  avgDistanceKm: number;
  avgElevationPerKm: number;
  avgHeartrate: number | null;
  avgSpeedKmh: number | null;
  avgWatts: number | null;
  avgCadence: number | null;
  hrSamples: number;
  wattsSamples: number;
  cadenceSamples: number;
}

const trendMetrics: Array<{
  metric: TrendMetric;
  title: string;
  unit: string;
  color: string;
  description: string;
  linkHref?: string;
  linkLabel?: string;
}> = [
  {
    metric: 'distance',
    title: 'Distance',
    unit: 'km',
    color: '#0f766e',
    description: 'Volume total de kilometres par periode.',
  },
  {
    metric: 'time',
    title: 'Temps',
    unit: 'h',
    color: '#1f2937',
    description: "Somme des heures d'activite par periode.",
  },
  {
    metric: 'elev',
    title: 'D+',
    unit: 'm',
    color: '#b45309',
    description: 'Somme du denivele positif par periode.',
  },
  {
    metric: 'avgHR',
    title: 'FC moyenne',
    unit: 'bpm',
    color: '#dc2626',
    description: 'Moyenne des frequences cardiaques moyennes des activites.',
  },
  {
    metric: 'maxHR',
    title: 'FC max',
    unit: 'bpm',
    color: '#991b1b',
    description: 'Pic de frequence cardiaque observe sur la periode.',
  },
  {
    metric: 'avgSpeed',
    title: 'Vitesse moyenne',
    unit: 'km/h',
    color: '#2563eb',
    description: 'Moyenne des vitesses moyennes des activites.',
  },
  {
    metric: 'maxSpeed',
    title: 'Vitesse max',
    unit: 'km/h',
    color: '#0f172a',
    description: 'Vitesse maximale observee sur la periode.',
  },
  {
    metric: 'avgWatts',
    title: 'Watts moyens',
    unit: 'W',
    color: '#f59e0b',
    description: 'Moyenne des puissances moyennes quand la donnee existe.',
  },
  {
    metric: 'maxWatts',
    title: 'Watts max',
    unit: 'W',
    color: '#92400e',
    description: 'Pic de puissance sur la periode.',
  },
  {
    metric: 'cadence',
    title: 'Cadence moyenne',
    unit: 'rpm',
    color: '#0d9488',
    description: 'Moyenne de cadence sur la periode.',
  },
  {
    metric: 'strideLength',
    title: 'Longueur de foulee',
    unit: 'm',
    color: '#7c3aed',
    description:
      'Estimation (course a pied) de la longueur de foulee, derivee de la vitesse et de la cadence. A lire comme tendance.',
    linkHref: 'https://pubmed.ncbi.nlm.nih.gov/28263283/',
    linkLabel: 'Source: biomechanics running',
  },
  {
    metric: 'groundContactTime',
    title: 'Contact au sol',
    unit: 'ms',
    color: '#c2410c',
    description:
      "Estimation (course a pied) du temps de contact au sol a partir du profil vitesse/cadence et d'un modele biomecanique simplifie.",
    linkHref: 'https://pubmed.ncbi.nlm.nih.gov/38446400/',
    linkLabel: 'Source: running economy review',
  },
  {
    metric: 'verticalOscillation',
    title: 'Oscillation verticale',
    unit: 'cm',
    color: '#0f766e',
    description:
      "Estimation (course a pied) du deplacement vertical du centre de masse, utile pour suivre l'efficience de foulee.",
    linkHref: 'https://pubmed.ncbi.nlm.nih.gov/28263283/',
    linkLabel: 'Source: biomechanics running',
  },
  {
    metric: 'kilojoules',
    title: 'Energie',
    unit: 'kJ',
    color: '#0369a1',
    description: 'Energie mecanique depensee (kJ) quand disponible.',
  },
  {
    metric: 'calories',
    title: 'Calories',
    unit: 'kcal',
    color: '#be123c',
    description: 'Calories depensees sur la periode quand Strava les fournit.',
  },
  {
    metric: 'sufferScore',
    title: 'Suffer score',
    unit: 'pts',
    color: '#4d7c0f',
    description:
      "Indicateur d'intensite Strava; plus haut = effort plus intense.",
  },
];

const distributionMetrics: Array<{
  metric: DistributionMetric;
  title: string;
  unit: string;
  description: string;
  linkHref?: string;
  linkLabel?: string;
}> = [
  {
    metric: 'distance',
    title: 'Distance',
    unit: 'km',
    description: 'Distribution des distances par activite.',
  },
  {
    metric: 'time',
    title: 'Temps',
    unit: 'min',
    description: 'Distribution des durees en minutes.',
  },
  {
    metric: 'elev',
    title: 'D+',
    unit: 'm',
    description: 'Distribution du denivele positif par activite.',
  },
  {
    metric: 'avgHR',
    title: 'FC moyenne',
    unit: 'bpm',
    description: 'Distribution des FC moyennes.',
  },
  {
    metric: 'maxHR',
    title: 'FC max',
    unit: 'bpm',
    description: 'Distribution des FC max.',
  },
  {
    metric: 'avgSpeed',
    title: 'Vitesse moyenne',
    unit: 'km/h',
    description: 'Distribution des vitesses moyennes.',
  },
  {
    metric: 'maxSpeed',
    title: 'Vitesse max',
    unit: 'km/h',
    description: 'Distribution des vitesses max.',
  },
  {
    metric: 'avgWatts',
    title: 'Watts moyens',
    unit: 'W',
    description: 'Distribution des watts moyens.',
  },
  {
    metric: 'maxWatts',
    title: 'Watts max',
    unit: 'W',
    description: 'Distribution des watts max.',
  },
  {
    metric: 'cadence',
    title: 'Cadence',
    unit: 'rpm',
    description: 'Distribution des cadences moyennes.',
  },
  {
    metric: 'strideLength',
    title: 'Longueur de foulee',
    unit: 'm',
    description:
      'Distribution de la longueur de foulee estimee (courses), calculee depuis vitesse et cadence.',
    linkHref: 'https://pubmed.ncbi.nlm.nih.gov/28263283/',
    linkLabel: 'Source: biomechanics running',
  },
  {
    metric: 'groundContactTime',
    title: 'Contact au sol',
    unit: 'ms',
    description:
      'Distribution du temps de contact au sol estime (courses), indicateur de dynamique de foulee.',
    linkHref: 'https://pubmed.ncbi.nlm.nih.gov/38446400/',
    linkLabel: 'Source: running economy review',
  },
  {
    metric: 'verticalOscillation',
    title: 'Oscillation verticale',
    unit: 'cm',
    description:
      "Distribution de l'oscillation verticale estimee (courses), pour suivre la stabilite mecanique.",
    linkHref: 'https://pubmed.ncbi.nlm.nih.gov/28263283/',
    linkLabel: 'Source: biomechanics running',
  },
  {
    metric: 'kilojoules',
    title: 'Energie',
    unit: 'kJ',
    description: 'Distribution des energies par activite.',
  },
  {
    metric: 'calories',
    title: 'Calories',
    unit: 'kcal',
    description: 'Distribution des calories par activite.',
  },
  {
    metric: 'sufferScore',
    title: 'Suffer score',
    unit: 'pts',
    description: "Distribution de l'intensite Strava.",
  },
];

const trendMetricColorByMetric = trendMetrics.reduce(
  (acc, def) => {
    acc[def.metric] = def.color;
    return acc;
  },
  {} as Record<TrendMetric, string>,
);

const graphAuditBaseQuestion =
  'Fais un audit scientifique utile, en paragraphes (pas juste une liste), sans repetition. Priorise la comparaison intra-athlete (debut vs recent, mediane, dispersion, tendance) puis ajoute des reperes externes pertinents issus de benchmarks/litterature pour un profil proche. Chaque conclusion doit etre appuyee par des chiffres du contexte.';

const correlationVarsForAi: CorrelationVarForAi[] = [
  'distance',
  'movingTime',
  'elevGain',
  'avgSpeed',
  'maxSpeed',
  'avgHR',
  'maxHR',
  'avgWatts',
  'maxWatts',
  'cadence',
  'strideLength',
  'groundContactTime',
  'verticalOscillation',
  'sufferScore',
  'kilojoules',
  'calories',
  'charge',
];

const correlationVarLabels: Record<CorrelationVarForAi, string> = {
  distance: 'Distance',
  movingTime: 'Temps',
  elevGain: 'D+',
  avgSpeed: 'Vitesse moyenne',
  maxSpeed: 'Vitesse max',
  avgHR: 'FC moyenne',
  maxHR: 'FC max',
  avgWatts: 'Watts moyens',
  maxWatts: 'Watts max',
  cadence: 'Cadence',
  strideLength: 'Longueur de foulee',
  groundContactTime: 'Contact au sol',
  verticalOscillation: 'Oscillation verticale',
  sufferScore: 'Suffer score',
  kilojoules: 'Energie',
  calories: 'Calories',
  charge: 'Charge',
};

const analyticsMetricToCorrelationVar: Record<
  TrendMetric | DistributionMetric,
  CorrelationVarForAi
> = {
  distance: 'distance',
  time: 'movingTime',
  elev: 'elevGain',
  avgSpeed: 'avgSpeed',
  maxSpeed: 'maxSpeed',
  avgHR: 'avgHR',
  maxHR: 'maxHR',
  avgWatts: 'avgWatts',
  maxWatts: 'maxWatts',
  cadence: 'cadence',
  strideLength: 'strideLength',
  groundContactTime: 'groundContactTime',
  verticalOscillation: 'verticalOscillation',
  sufferScore: 'sufferScore',
  kilojoules: 'kilojoules',
  calories: 'calories',
};

const heartRateZones = [
  {
    zone: 'Z1',
    minPct: 0,
    maxPct: 70,
    label: 'Endurance fondamentale',
    colorClass: 'bg-sky-500',
  },
  {
    zone: 'Z2',
    minPct: 70,
    maxPct: 80,
    label: 'Endurance active',
    colorClass: 'bg-emerald-500',
  },
  {
    zone: 'Z3',
    minPct: 80,
    maxPct: 87,
    label: 'Tempo',
    colorClass: 'bg-amber-500',
  },
  {
    zone: 'Z4',
    minPct: 87,
    maxPct: 93,
    label: 'Seuil',
    colorClass: 'bg-orange-500',
  },
  {
    zone: 'Z5',
    minPct: 93,
    maxPct: 100,
    label: 'VO2max',
    colorClass: 'bg-rose-600',
  },
] as const;

type HeartRateZoneKey = (typeof heartRateZones)[number]['zone'];

const competencyRadarSplitAreaColors = [
  'rgba(19,19,19,0.012)',
  'rgba(19,19,19,0.02)',
  'rgba(19,19,19,0.028)',
  'rgba(19,19,19,0.036)',
  'rgba(19,19,19,0.044)',
];

const competencyRadarPalette = {
  line: '#0f766e',
  areaStart: 'rgba(15,118,110,0.28)',
  areaEnd: 'rgba(15,118,110,0.08)',
  point: '#115e59',
  splitLine: 'rgba(19,19,19,0.14)',
  axisLine: 'rgba(19,19,19,0.18)',
  axisLabel: '#2f2f2b',
  tooltipBg: '#131313',
  tooltipText: '#fdfcf7',
};

function buildCompetencyRadarOption(
  metrics: Array<{ name: string; value: number }>,
  profileLabel: string,
) {
  const wrapAxisLabel = (value: string, maxCharsPerLine = 12) => {
    const rawWords = value.split(/\s+/).filter((word) => word.length > 0);
    const words = rawWords.flatMap((word) => {
      if (word.length <= maxCharsPerLine) {
        return [word];
      }

      const chunks: string[] = [];
      for (let index = 0; index < word.length; index += maxCharsPerLine) {
        chunks.push(word.slice(index, index + maxCharsPerLine));
      }
      return chunks;
    });
    if (words.length <= 1 && value.length <= maxCharsPerLine) {
      return value;
    }

    const lines: string[] = [];
    let current = '';

    for (const word of words.length > 0 ? words : [value]) {
      if (!current) {
        current = word;
        continue;
      }

      if (`${current} ${word}`.length <= maxCharsPerLine) {
        current = `${current} ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }

    if (current) {
      lines.push(current);
    }

    return lines.join('\n');
  };

  return {
    backgroundColor: 'transparent',
    animationDuration: 350,
    animationEasing: 'cubicOut',
    tooltip: {
      confine: true,
      backgroundColor: competencyRadarPalette.tooltipBg,
      borderWidth: 0,
      textStyle: {
        color: competencyRadarPalette.tooltipText,
        fontSize: 11,
      },
      padding: [8, 10],
      extraCssText: 'max-width: min(260px, calc(100vw - 16px)); white-space: normal;',
      formatter: (params: { data: { value: number[] } }) => {
        const values = params.data.value ?? [];
        return metrics
          .map(
            (metric, index) =>
              `${metric.name}: ${Number(values[index] ?? 0).toFixed(0)}/100`,
          )
          .join('<br/>');
      },
    },
    radar: {
      shape: 'polygon',
      radius: '62%',
      splitNumber: 5,
      indicator: metrics.map((metric) => ({
        name: wrapAxisLabel(metric.name),
        max: 100,
      })),
      axisName: {
        color: competencyRadarPalette.axisLabel,
        fontSize: 11,
        fontWeight: 600,
      },
      splitArea: {
        areaStyle: {
          color: competencyRadarSplitAreaColors,
        },
      },
      splitLine: {
        lineStyle: { color: competencyRadarPalette.splitLine, width: 1 },
      },
      axisLine: {
        lineStyle: { color: competencyRadarPalette.axisLine, width: 1 },
      },
    },
    series: [
      {
        type: 'radar',
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: {
          width: 2.5,
          color: competencyRadarPalette.line,
          shadowBlur: 8,
          shadowColor: 'rgba(15,118,110,0.16)',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: competencyRadarPalette.areaStart },
              { offset: 1, color: competencyRadarPalette.areaEnd },
            ],
          },
        },
        itemStyle: {
          color: competencyRadarPalette.point,
          borderColor: '#fdfcf7',
          borderWidth: 2,
        },
        emphasis: {
          lineStyle: { width: 3 },
          itemStyle: { borderWidth: 3 },
        },
        data: [
          {
            value: metrics.map((metric) => Number(metric.value.toFixed(1))),
            name: profileLabel,
          },
        ],
      },
    ],
    media: [
      {
        query: {
          maxWidth: 430,
        },
        option: {
          radar: {
            radius: '54%',
            axisName: {
              fontSize: 10,
            },
          },
          series: [
            {
              symbolSize: 6,
            },
          ],
        },
      },
    ],
  };
}

function resolveHeartRateZone(pctHrMax: number): HeartRateZoneKey {
  for (const zoneDef of heartRateZones) {
    if (zoneDef.zone === 'Z5') {
      return zoneDef.zone;
    }
    if (pctHrMax < zoneDef.maxPct) {
      return zoneDef.zone;
    }
  }

  return 'Z5';
}

function zoneRangeLabel(zone: HeartRateZoneKey, hrMax: number) {
  const zoneDef = heartRateZones.find((item) => item.zone === zone);
  if (!zoneDef) {
    return 'n/a';
  }

  const minBpm = Math.round((zoneDef.minPct / 100) * hrMax);
  if (zoneDef.zone === 'Z5') {
    return `>= ${minBpm} bpm`;
  }

  const maxBpm = Math.round((zoneDef.maxPct / 100) * hrMax);
  return `${minBpm}-${maxBpm} bpm`;
}

function estimatedCountInRange(
  bins: Array<{ from: number; to: number; count: number }>,
  rangeStart: number,
  rangeEnd: number,
) {
  return bins.reduce((sum, bin) => {
    if (bin.count <= 0) {
      return sum;
    }

    const binStart = Math.min(bin.from, bin.to);
    const binEnd = Math.max(bin.from, bin.to);
    if (binEnd <= rangeStart || binStart >= rangeEnd) {
      return sum;
    }

    const overlapStart = Math.max(binStart, rangeStart);
    const overlapEnd = Math.min(binEnd, rangeEnd);
    const overlapWidth = overlapEnd - overlapStart;
    if (overlapWidth <= 0) {
      return sum;
    }

    const binWidth = Math.max(binEnd - binStart, 1e-9);
    const overlapRatio = overlapWidth / binWidth;
    return sum + bin.count * overlapRatio;
  }, 0);
}

function appendFilters(path: string, baseQuery: string) {
  if (!baseQuery) {
    return path;
  }

  if (path.includes('?')) {
    return `${path}&${baseQuery}`;
  }

  return `${path}?${baseQuery}`;
}

function buildTrendOption(
  metric: TrendMetric,
  data: TrendResponse | undefined,
  title: string,
  color: string,
  unitPreferences: ReturnType<typeof resolveUnitPreferences>,
) {
  const points = data?.series ?? [];
  const unit = metric === 'time' ? 'h' : metricUnit(metric, unitPreferences);
  const values = points.map((row) => {
    if (metric === 'time') {
      return Number(row.value.toFixed(2));
    }
    return Number(
      convertCorrelationMetricValue(metric, row.value, unitPreferences).toFixed(
        2,
      ),
    );
  });

  return {
    title: {
      text: title,
      left: 0,
      textStyle: {
        fontSize: 12,
        fontWeight: 600,
      },
    },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: number) =>
        metric === 'avgSpeed' || metric === 'maxSpeed' ?
          `${formatSpeedAxisValue(value, unitPreferences)} ${unit}`
        : `${value.toFixed(2)} ${unit}`,
    },
    grid: {
      left: 52,
      right: 16,
      top: 44,
      bottom: 58,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: points.map((row) => row.bucket),
      axisLabel: {
        rotate: 25,
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (value: number) =>
          metric === 'avgSpeed' || metric === 'maxSpeed' ?
            formatSpeedAxisValue(value, unitPreferences)
          : `${value}`,
      },
    },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 12, bottom: 8 }],
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        data: values,
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        areaStyle: { color: `${color}22` },
      },
    ],
  };
}

function buildDistributionOption(
  metric: DistributionMetric,
  data: DistributionResponse | undefined,
  title: string,
  color: string,
  unitPreferences: ReturnType<typeof resolveUnitPreferences>,
) {
  const bins = data?.bins ?? [];
  const unit = metric === 'time' ? 'min' : metricUnit(metric, unitPreferences);
  const convertedBins = bins.map((bin) => {
    if (metric === 'time') {
      return bin;
    }

    return {
      ...bin,
      from: convertCorrelationMetricValue(metric, bin.from, unitPreferences),
      to: convertCorrelationMetricValue(metric, bin.to, unitPreferences),
    };
  });

  return {
    title: {
      text: title,
      left: 0,
      textStyle: {
        fontSize: 12,
        fontWeight: 600,
      },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ axisValue: string; data: number }>) => {
        const point = params[0];
        return `${point.axisValue} ${unit}<br/>n=${point.data}`;
      },
    },
    grid: {
      left: 52,
      right: 16,
      top: 44,
      bottom: 64,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: convertedBins.map((bin) => {
        const from =
          metric === 'avgSpeed' || metric === 'maxSpeed' ?
            formatSpeedAxisValue(bin.from, unitPreferences, 2)
          : bin.from.toFixed(1);
        const to =
          metric === 'avgSpeed' || metric === 'maxSpeed' ?
            formatSpeedAxisValue(bin.to, unitPreferences, 2)
          : bin.to.toFixed(1);
        return `${from}-${to}`;
      }),
      axisLabel: {
        rotate: 35,
      },
    },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'bar',
        data: convertedBins.map((bin) => bin.count),
        itemStyle: {
          color,
        },
      },
    ],
  };
}

function pivotMetricLabel(
  metric: string,
  unitPreferences: ReturnType<typeof resolveUnitPreferences>,
) {
  if (metric === 'distance') {
    return `distance (${distanceUnitLabel(unitPreferences.distanceUnit)})`;
  }

  if (metric === 'elev') {
    return `elev (${elevationUnitLabel(unitPreferences.elevationUnit)})`;
  }

  if (metric === 'avgSpeed' || metric === 'maxSpeed') {
    return `${metric} (${speedUnitLabel(unitPreferences.speedUnit)})`;
  }

  if (metric === 'cadence') {
    return `cadence (${cadenceUnitLabel(unitPreferences.cadenceUnit)})`;
  }
  if (metric === 'strideLength') {
    return 'strideLength (m)';
  }
  if (metric === 'groundContactTime') {
    return 'groundContactTime (ms)';
  }
  if (metric === 'verticalOscillation') {
    return 'verticalOscillation (cm)';
  }

  return metric;
}

function formatPivotMetricValue(
  metric: string,
  value: number,
  unitPreferences: ReturnType<typeof resolveUnitPreferences>,
) {
  if (metric === 'distance') {
    return convertDistanceKm(value, unitPreferences.distanceUnit).toFixed(2);
  }

  if (metric === 'elev') {
    return convertCorrelationMetricValue(
      'elev',
      value,
      unitPreferences,
    ).toFixed(2);
  }

  if (metric === 'avgSpeed' || metric === 'maxSpeed') {
    const converted = convertSpeedKmh(value, unitPreferences.speedUnit);
    return unitPreferences.speedUnit === 'kmh' ?
        converted.toFixed(2)
      : formatSpeedAxisValue(converted, unitPreferences, 2);
  }

  if (metric === 'cadence') {
    return convertCadenceRpm(value, unitPreferences.cadenceUnit).toFixed(2);
  }

  if (metric === 'count') {
    return number(value, 0);
  }

  return value.toFixed(2);
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function startOfCurrentYearInputValue() {
  const year = new Date().getFullYear();
  return `${year}-01-01`;
}

function parseDay(day: string) {
  return new Date(`${day}T00:00:00Z`);
}

function addDay(day: string, amount: number) {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function startOfIsoWeek(day: string) {
  const date = parseDay(day);
  const weekDay = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekDay);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round(
    (parseDay(to).getTime() - parseDay(from).getTime()) / 86400000,
  );
}

function quantile(values: number[], q: number) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const low = Math.floor(index);
  const high = Math.ceil(index);

  if (low === high) {
    return sorted[low];
  }

  const weight = index - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

function weightedQuantile(
  rows: Array<{ value: number; weight: number }>,
  q: number,
) {
  if (rows.length === 0) {
    return null;
  }
  const safeQ = clamp(q, 0, 1);
  const sorted = rows
    .filter((row) => Number.isFinite(row.value) && row.weight > 0)
    .sort((a, b) => a.value - b.value);

  if (sorted.length === 0) {
    return null;
  }

  const totalWeight = sorted.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight <= 0) {
    return null;
  }

  const target = totalWeight * safeQ;
  let cumulative = 0;
  for (const row of sorted) {
    cumulative += row.weight;
    if (cumulative >= target) {
      return row.value;
    }
  }
  return sorted[sorted.length - 1]?.value ?? null;
}

function percentileRank(sortedValues: number[], value: number) {
  if (sortedValues.length === 0) {
    return null;
  }
  let lessOrEqual = 0;
  for (const entry of sortedValues) {
    if (entry <= value) {
      lessOrEqual += 1;
    }
  }
  return lessOrEqual / sortedValues.length;
}

function mean(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  const avg = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isRunLikeActivity(activity: Activity) {
  const sport = activity.sportType.toLowerCase();
  const type = activity.type.toLowerCase();
  return (
    sport.includes('run') ||
    sport.includes('trail') ||
    type.includes('run') ||
    type.includes('jog')
  );
}

function recommendedWeeklyKm(goalDistanceKm: number | null) {
  if (goalDistanceKm === null || !Number.isFinite(goalDistanceKm)) {
    return 42;
  }
  return clamp(goalDistanceKm * 1.25 + 10, 24, 95);
}

function recommendedLongRunKm(goalDistanceKm: number | null) {
  if (goalDistanceKm === null || !Number.isFinite(goalDistanceKm)) {
    return 18;
  }
  return clamp(goalDistanceKm * 0.62, 8, 32);
}

function reliabilityLabel(score: number) {
  if (score >= 80) {
    return 'Forte';
  }
  if (score >= 60) {
    return 'Moyenne';
  }
  return 'Faible';
}

type DayStateTone = 'good' | 'warn' | 'bad' | 'neutral';

interface DayStateStatus {
  label: string;
  range: string;
  tone: DayStateTone;
}

function classifyTsbState(tsb: number): DayStateStatus {
  if (tsb >= 10) {
    return {
      label: 'Bon',
      range: `TSB ${number(tsb, 1)} (>= +10: tres frais)`,
      tone: 'good',
    };
  }
  if (tsb >= 3) {
    return {
      label: 'Bon',
      range: `TSB ${number(tsb, 1)} (+3 a +10: frais)`,
      tone: 'good',
    };
  }
  if (tsb > -10) {
    return {
      label: 'OK',
      range: `TSB ${number(tsb, 1)} (-10 a +3: equilibre)`,
      tone: 'neutral',
    };
  }
  if (tsb > -20) {
    return {
      label: 'Mauvais',
      range: `TSB ${number(tsb, 1)} (-20 a -10: fatigue elevee)`,
      tone: 'warn',
    };
  }
  return {
    label: 'Mauvais',
    range: `TSB ${number(tsb, 1)} (<= -20: surcharge probable)`,
    tone: 'bad',
  };
}

function formatRatioWithPercent(ratio: number) {
  return `${number(ratio, 2)} (${number(ratio * 100, 0)}%)`;
}

function classifyAtlState(atl: number, ctl: number): DayStateStatus {
  const ratio = ctl > 0 ? atl / ctl : null;

  if (ratio !== null) {
    if (ratio <= 0.8) {
      return {
        label: 'Bon',
        range: `ATL/CTL ${formatRatioWithPercent(ratio)} (<= 0.80: fatigue basse)`,
        tone: 'good',
      };
    }
    if (ratio <= 1.05) {
      return {
        label: 'OK',
        range: `ATL/CTL ${formatRatioWithPercent(ratio)} (0.81-1.05: fatigue controlee)`,
        tone: 'neutral',
      };
    }
    if (ratio <= 1.25) {
      return {
        label: 'Mauvais',
        range: `ATL/CTL ${formatRatioWithPercent(ratio)} (1.06-1.25: fatigue elevee)`,
        tone: 'warn',
      };
    }
    return {
      label: 'Mauvais',
      range: `ATL/CTL ${formatRatioWithPercent(ratio)} (> 1.25: fatigue tres elevee)`,
      tone: 'bad',
    };
  }

  if (atl <= 8) {
    return {
      label: 'Bon',
      range: `ATL ${number(atl, 1)} (fallback ATL seul)`,
      tone: 'good',
    };
  }
  if (atl <= 15) {
    return {
      label: 'OK',
      range: `ATL ${number(atl, 1)} (fallback ATL seul)`,
      tone: 'neutral',
    };
  }
  if (atl <= 25) {
    return {
      label: 'Mauvais',
      range: `ATL ${number(atl, 1)} (fallback ATL seul)`,
      tone: 'warn',
    };
  }
  return {
    label: 'Mauvais',
    range: `ATL ${number(atl, 1)} (fallback ATL seul)`,
    tone: 'bad',
  };
}

function classifyChargeState(charge: number, ctl: number): DayStateStatus {
  const ratio = ctl > 0 ? charge / ctl : null;

  if (ratio !== null) {
    if (ratio <= 0.6) {
      return {
        label: 'Bon',
        range: `Charge/CTL ${formatRatioWithPercent(ratio)} (<= 0.60: charge legere)`,
        tone: 'good',
      };
    }
    if (ratio <= 1.1) {
      return {
        label: 'OK',
        range: `Charge/CTL ${formatRatioWithPercent(ratio)} (0.61-1.10: charge cible)`,
        tone: 'neutral',
      };
    }
    if (ratio <= 1.6) {
      return {
        label: 'Mauvais',
        range: `Charge/CTL ${formatRatioWithPercent(ratio)} (1.11-1.60: charge soutenue)`,
        tone: 'warn',
      };
    }
    return {
      label: 'Mauvais',
      range: `Charge/CTL ${formatRatioWithPercent(ratio)} (> 1.60: charge tres elevee)`,
      tone: 'bad',
    };
  }

  if (charge <= 8) {
    return {
      label: 'Bon',
      range: `Charge ${number(charge, 1)} (fallback charge seule)`,
      tone: 'good',
    };
  }
  if (charge <= 15) {
    return {
      label: 'OK',
      range: `Charge ${number(charge, 1)} (fallback charge seule)`,
      tone: 'neutral',
    };
  }
  if (charge <= 25) {
    return {
      label: 'Mauvais',
      range: `Charge ${number(charge, 1)} (fallback charge seule)`,
      tone: 'warn',
    };
  }
  return {
    label: 'Mauvais',
    range: `Charge ${number(charge, 1)} (fallback charge seule)`,
    tone: 'bad',
  };
}

function classifyCtlState(ctl: number, history: number[]): DayStateStatus {
  const validHistory = history.filter((value) => Number.isFinite(value));
  if (validHistory.length < 6) {
    return {
      label: 'OK',
      range: 'Historique CTL insuffisant (< 6 points)',
      tone: 'neutral',
    };
  }

  const q33 = quantile(validHistory, 0.33);
  const q66 = quantile(validHistory, 0.66);
  if (q33 === null || q66 === null) {
    return {
      label: 'OK',
      range: 'Intervalles CTL indisponibles',
      tone: 'neutral',
    };
  }

  const rangeText = `Repere perso CTL: ${number(q33, 1)} - ${number(q66, 1)}`;
  if (ctl < q33) {
    return {
      label: 'Mauvais',
      range: `${rangeText} (niveau actuel ${number(ctl, 1)}: bas)`,
      tone: 'warn',
    };
  }
  if (ctl < q66) {
    return {
      label: 'OK',
      range: `${rangeText} (niveau actuel ${number(ctl, 1)}: moyen)`,
      tone: 'neutral',
    };
  }
  return {
    label: 'Bon',
    range: `${rangeText} (niveau actuel ${number(ctl, 1)}: solide)`,
    tone: 'good',
  };
}

function formatDuration(mins: number | null) {
  if (mins === null || !Number.isFinite(mins) || mins <= 0) {
    return 'n/a';
  }

  const totalSeconds = Math.round(mins * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  }

  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function formatClock(mins: number) {
  const totalSeconds = Math.round(mins * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function ReliabilityGauge({ score }: { score: number }) {
  const safeScore = clamp(Math.round(score), 0, 100);
  const level = reliabilityLabel(safeScore);
  const color =
    safeScore >= 80 ? 'bg-emerald-600'
    : safeScore >= 60 ? 'bg-amber-500'
    : 'bg-red-500';

  return (
    <div className='w-44'>
      <div className='mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-muted'>
        <span>Fiabilite</span>
        <span>{safeScore}/100</span>
      </div>
      <div className='h-2 rounded-full bg-black/10'>
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${safeScore}%` }}
        />
      </div>
      <p className='mt-1 text-[11px] text-muted'>{level}</p>
    </div>
  );
}

type AnalyticsView = 'lab' | 'historical' | 'correlations';
type HeartRateZoneBasis = 'avg' | 'max';
type LabTheme = 'health' | 'forecast' | 'load' | 'performance' | 'profile';
type HistoricalTheme = 'insights' | 'advanced' | 'report';
type AnalyticsSectionKey =
  | 'globalFilters'
  | 'labToday'
  | 'labSkillsRadar'
  | 'labReferenceTimes'
  | 'labHrZones'
  | 'labHeatmap'
  | 'labProfile'
  | 'labTrends'
  | 'labDistributions'
  | 'labPivot'
  | 'labLoad'
  | 'histSelection'
  | 'histSynthesis'
  | 'histSkills'
  | 'histSimple'
  | 'histAdvancedMap'
  | 'histAdvancedEvolution'
  | 'histNarrative'
  | 'histSessions';
type HistoricalPreset = 'strict' | 'balanced' | 'wide';
type HistoricalMainMetric = 'speedKmh' | 'hr' | 'cadence' | 'intensityProxy';

const labSectionsByTheme: Record<LabTheme, AnalyticsSectionKey[]> = {
  health: ['labToday', 'labSkillsRadar', 'labHrZones'],
  forecast: ['labReferenceTimes'],
  load: ['labLoad', 'labHeatmap', 'labPivot'],
  performance: ['labTrends', 'labDistributions'],
  profile: ['labProfile'],
};

const historicalSectionsByTheme: Record<HistoricalTheme, AnalyticsSectionKey[]> =
  {
    insights: ['histSelection', 'histSynthesis', 'histSkills', 'histSimple'],
    advanced: ['histAdvancedMap', 'histAdvancedEvolution'],
    report: ['histNarrative', 'histSessions'],
  };

type HistoricalFeature = 'speedKmh' | 'hr' | 'cadence' | 'durationMin';

interface HistoricalSession {
  id: string;
  day: string;
  timestamp: number;
  type: string;
  speedKmh: number | null;
  hr: number | null;
  cadence: number | null;
  durationMin: number;
  distanceKm: number;
  intensityProxy: number | null;
  activity: Activity;
}

interface HistoricalNeighbor {
  session: HistoricalSession;
  distance: number;
  similarity: number;
  usedFeatures: number;
}

interface HistoricalMetricSummary {
  label: string;
  unit: string;
  first: number | null;
  recent: number | null;
  changePct: number | null;
  slope: number | null;
  rho: number | null;
  effectSize: number | null;
}

interface SkillRadarMetric {
  name: string;
  value: number;
  detail: string;
}

interface ReferenceTimeEstimate {
  key: '5k' | '10k' | 'half' | 'marathon';
  label: string;
  distanceKm: number;
  estimatedSec: number | null;
  q25Sec: number | null;
  q75Sec: number | null;
  paceMinPerKm: number | null;
  speedKmh: number | null;
  reliability: number;
  supportRuns: number;
  nearRuns: number;
  recentNearRuns: number;
}

const referenceDistanceOrder: ReferenceTimeEstimate['key'][] = [
  '5k',
  '10k',
  'half',
  'marathon',
];

function enforceReferenceTimeCoherence(estimates: ReferenceTimeEstimate[]) {
  const rowsByKey = new Map(estimates.map((row) => [row.key, row]));
  const adjusted = new Set<ReferenceTimeEstimate['key']>();
  const requiredShorterFasterPctByLongKey: Partial<
    Record<ReferenceTimeEstimate['key'], number>
  > = {
    '10k': 0.03,
    half: 0.025,
    marathon: 0.018,
  };

  for (let index = referenceDistanceOrder.length - 1; index >= 1; index -= 1) {
    const longKey = referenceDistanceOrder[index];
    const shortKey = referenceDistanceOrder[index - 1];
    const long = rowsByKey.get(longKey);
    const short = rowsByKey.get(shortKey);
    const minFasterPct = requiredShorterFasterPctByLongKey[longKey] ?? 0;
    if (
      !long ||
      !short ||
      long.estimatedSec === null ||
      short.estimatedSec === null ||
      long.distanceKm <= 0 ||
      short.distanceKm <= 0 ||
      minFasterPct <= 0
    ) {
      continue;
    }

    const longPaceSecPerKm = long.estimatedSec / long.distanceKm;
    const shortPaceSecPerKm = short.estimatedSec / short.distanceKm;
    const maxAllowedShortPaceSecPerKm = longPaceSecPerKm * (1 - minFasterPct);

    if (shortPaceSecPerKm <= maxAllowedShortPaceSecPerKm) {
      continue;
    }

    const correctedShortSec = maxAllowedShortPaceSecPerKm * short.distanceKm;
    short.estimatedSec = Number(correctedShortSec.toFixed(1));
    short.paceMinPerKm = Number((maxAllowedShortPaceSecPerKm / 60).toFixed(4));
    short.speedKmh =
      correctedShortSec > 0 ?
        Number((short.distanceKm / (correctedShortSec / 3600)).toFixed(3))
      : short.speedKmh;
    short.reliability = Math.max(28, Math.round(short.reliability * 0.94));
    adjusted.add(shortKey);
  }

  return {
    estimates,
    adjustedKeys: [...adjusted],
  };
}

const historicalFeatureKeys: HistoricalFeature[] = [
  'speedKmh',
  'hr',
  'cadence',
  'durationMin',
];

function activityTypeLabel(activity: Activity) {
  return activity.sportType || activity.type || 'Other';
}

function asValidNumber(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) ?
      value
    : null;
}

function sessionFeatureValue(
  session: HistoricalSession,
  feature: HistoricalFeature,
) {
  return session[feature];
}

function linearRegression(xs: number[], ys: number[]) {
  if (xs.length < 2 || ys.length < 2 || xs.length !== ys.length) {
    return null;
  }

  const meanX = mean(xs);
  const meanY = mean(ys);
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - meanX;
    numerator += dx * (ys[i] - meanY);
    denominator += dx * dx;
  }

  if (denominator === 0) {
    return null;
  }

  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

function pearsonCorrelation(xs: number[], ys: number[]) {
  if (xs.length < 2 || ys.length < 2 || xs.length !== ys.length) {
    return null;
  }

  const meanX = mean(xs);
  const meanY = mean(ys);
  let numerator = 0;
  let sumX = 0;
  let sumY = 0;

  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    numerator += dx * dy;
    sumX += dx * dx;
    sumY += dy * dy;
  }

  if (sumX === 0 || sumY === 0) {
    return null;
  }

  return numerator / Math.sqrt(sumX * sumY);
}

function rankWithTies(values: number[]) {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  let i = 0;

  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].value === sorted[i].value) {
      j += 1;
    }

    const avgRank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k += 1) {
      ranks[sorted[k].index] = avgRank;
    }
    i = j;
  }

  return ranks;
}

function spearmanCorrelation(xs: number[], ys: number[]) {
  if (xs.length < 2 || ys.length < 2 || xs.length !== ys.length) {
    return null;
  }
  return pearsonCorrelation(rankWithTies(xs), rankWithTies(ys));
}

function cohenD(groupA: number[], groupB: number[]) {
  if (groupA.length < 2 || groupB.length < 2) {
    return null;
  }

  const meanA = mean(groupA);
  const meanB = mean(groupB);
  const varA =
    groupA.reduce((sum, value) => sum + (value - meanA) ** 2, 0) /
    (groupA.length - 1);
  const varB =
    groupB.reduce((sum, value) => sum + (value - meanB) ** 2, 0) /
    (groupB.length - 1);
  const pooled = Math.sqrt(
    ((groupA.length - 1) * varA + (groupB.length - 1) * varB) /
      (groupA.length + groupB.length - 2),
  );

  if (pooled === 0) {
    return null;
  }

  return (meanB - meanA) / pooled;
}

function formatSignedPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return 'n/a';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatSigned(value: number | null, decimals = 2) {
  if (value === null || !Number.isFinite(value)) {
    return 'n/a';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}`;
}

function formatMetric(
  value: number | null | undefined,
  unit?: string,
  digits = 2,
) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'n/a';
  }
  return `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
}

function percentileScore(
  values: number[],
  target: number,
  higherIsBetter = true,
) {
  const validValues = values.filter((value) => Number.isFinite(value));
  if (validValues.length === 0 || !Number.isFinite(target)) {
    return null;
  }

  const lessOrEqual = validValues.filter((value) => value <= target).length;
  const percentile = (lessOrEqual / validValues.length) * 100;

  return higherIsBetter ? percentile : 100 - percentile;
}

function meanAbsStep(values: number[]) {
  const validValues = values.filter((value) => Number.isFinite(value));
  if (validValues.length < 2) {
    return null;
  }

  let sum = 0;
  for (let i = 1; i < validValues.length; i += 1) {
    sum += Math.abs(validValues[i] - validValues[i - 1]);
  }

  return sum / (validValues.length - 1);
}

function sampleForAi<T>(items: T[], maxItems = 24) {
  if (items.length <= maxItems) {
    return items;
  }
  const headCount = Math.ceil(maxItems / 2);
  const tailCount = Math.floor(maxItems / 2);
  return [
    ...items.slice(0, headCount),
    ...items.slice(items.length - tailCount),
  ];
}

function computeLinearSlope(values: number[]) {
  if (values.length < 2) {
    return null;
  }

  const xs = values.map((_, index) => index + 1);
  const n = values.length;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    numerator += dx * (values[i] - meanY);
    denominator += dx * dx;
  }

  if (denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function approximateQuantilesFromBins(
  bins: Array<{ from: number; to: number; count: number }>,
) {
  return {
    q25: quantileFromBins(bins, 0.25),
    q50: quantileFromBins(bins, 0.5),
    q75: quantileFromBins(bins, 0.75),
  };
}

function quantileFromBins(
  bins: Array<{ from: number; to: number; count: number }>,
  ratio: number,
) {
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  if (total <= 0) {
    return null;
  }

  const safeRatio = clamp(ratio, 0, 1);
  const valueAt = (ratio: number) => {
    const target = total * ratio;
    let cumulative = 0;

    for (const bin of bins) {
      const next = cumulative + bin.count;
      if (target <= next) {
        if (bin.count <= 0) {
          return bin.from;
        }
        const localRatio = (target - cumulative) / bin.count;
        return bin.from + (bin.to - bin.from) * localRatio;
      }
      cumulative = next;
    }

    return bins[bins.length - 1]?.to ?? null;
  };

  return valueAt(safeRatio);
}

function weightedStatsFromBins(
  bins: Array<{ from: number; to: number; count: number }>,
) {
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  if (total <= 0) {
    return { mean: null, stdDev: null, cvPct: null };
  }

  const mean =
    bins.reduce((sum, bin) => {
      const midpoint = (bin.from + bin.to) / 2;
      return sum + midpoint * bin.count;
    }, 0) / total;
  const variance =
    bins.reduce((sum, bin) => {
      const midpoint = (bin.from + bin.to) / 2;
      return sum + (midpoint - mean) ** 2 * bin.count;
    }, 0) / total;
  const stdValue = Math.sqrt(Math.max(variance, 0));
  const cvPct =
    mean !== 0 && Number.isFinite(mean) ?
      (stdValue / Math.abs(mean)) * 100
    : null;

  return {
    mean: Number(mean.toFixed(3)),
    stdDev: Number(stdValue.toFixed(3)),
    cvPct: cvPct === null ? null : Number(cvPct.toFixed(1)),
  };
}

function percentileFromBins(
  bins: Array<{ from: number; to: number; count: number }>,
  target: number,
) {
  if (!Number.isFinite(target)) {
    return null;
  }

  const sortedBins = [...bins].sort(
    (a, b) => Math.min(a.from, a.to) - Math.min(b.from, b.to),
  );
  const total = sortedBins.reduce((sum, bin) => sum + bin.count, 0);
  if (total <= 0) {
    return null;
  }

  let cumulative = 0;
  for (const bin of sortedBins) {
    const start = Math.min(bin.from, bin.to);
    const end = Math.max(bin.from, bin.to);

    if (target >= end) {
      cumulative += bin.count;
      continue;
    }

    if (target <= start) {
      break;
    }

    const width = Math.max(end - start, 1e-9);
    const localRatio = clamp((target - start) / width, 0, 1);
    cumulative += bin.count * localRatio;
    break;
  }

  return (cumulative / total) * 100;
}

function convertDistributionBinsForMetric(
  metric: TrendMetric | DistributionMetric,
  bins: Array<{ from: number; to: number; count: number }>,
  unitPreferences: ReturnType<typeof resolveUnitPreferences>,
) {
  return bins.map((bin) => ({
    from:
      metric === 'time' ?
        Number(bin.from.toFixed(2))
      : Number(
          convertCorrelationMetricValue(
            metric,
            bin.from,
            unitPreferences,
          ).toFixed(2),
        ),
    to:
      metric === 'time' ?
        Number(bin.to.toFixed(2))
      : Number(
          convertCorrelationMetricValue(
            metric,
            bin.to,
            unitPreferences,
          ).toFixed(2),
        ),
    count: bin.count,
  }));
}

function buildDistributionDiagnostics(
  bins: Array<{ from: number; to: number; count: number }>,
  options: {
    summaryReferenceValue?: number | null;
    latestValue?: number | null;
  } = {},
) {
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  if (total <= 0) {
    return null;
  }

  const rangeMin = Math.min(...bins.map((bin) => Math.min(bin.from, bin.to)));
  const rangeMax = Math.max(...bins.map((bin) => Math.max(bin.from, bin.to)));
  const q10 = quantileFromBins(bins, 0.1);
  const q25 = quantileFromBins(bins, 0.25);
  const q50 = quantileFromBins(bins, 0.5);
  const q75 = quantileFromBins(bins, 0.75);
  const q90 = quantileFromBins(bins, 0.9);
  const stats = weightedStatsFromBins(bins);
  const sortedByCount = [...bins].sort((a, b) => b.count - a.count);
  const topBin = sortedByCount[0] ?? null;
  const top3Count = sortedByCount
    .slice(0, 3)
    .reduce((sum, bin) => sum + bin.count, 0);

  const lowTailPct =
    q10 === null ? null : (
      Number(
        ((estimatedCountInRange(bins, rangeMin, q10) / total) * 100).toFixed(1),
      )
    );
  const highTailPct =
    q90 === null ? null : (
      Number(
        ((estimatedCountInRange(bins, q90, rangeMax) / total) * 100).toFixed(1),
      )
    );

  const meanMinusMedian =
    stats.mean !== null && q50 !== null ? stats.mean - q50 : null;
  const asymmetryHint =
    meanMinusMedian === null || stats.stdDev === null ? null
    : Math.abs(meanMinusMedian) <= stats.stdDev * 0.1 ? 'plutot_symetrique'
    : meanMinusMedian > 0 ? 'queue_droite'
    : 'queue_gauche';

  const summaryPercentile =
    (
      options.summaryReferenceValue === null ||
      options.summaryReferenceValue === undefined
    ) ?
      null
    : percentileFromBins(bins, options.summaryReferenceValue);
  const latestPercentile =
    options.latestValue === null || options.latestValue === undefined ?
      null
    : percentileFromBins(bins, options.latestValue);

  return {
    sampleSize: total,
    spread: {
      p10: q10 === null ? null : Number(q10.toFixed(2)),
      p25: q25 === null ? null : Number(q25.toFixed(2)),
      p50: q50 === null ? null : Number(q50.toFixed(2)),
      p75: q75 === null ? null : Number(q75.toFixed(2)),
      p90: q90 === null ? null : Number(q90.toFixed(2)),
      iqr: q25 === null || q75 === null ? null : Number((q75 - q25).toFixed(2)),
      p90MinusP10:
        q10 === null || q90 === null ? null : Number((q90 - q10).toFixed(2)),
    },
    variability: {
      mean: stats.mean,
      stdDev: stats.stdDev,
      cvPct: stats.cvPct,
    },
    shape: {
      concentrationTopBinPct:
        topBin ? Number(((topBin.count / total) * 100).toFixed(1)) : null,
      concentrationTop3Pct: Number(((top3Count / total) * 100).toFixed(1)),
      dominantBin:
        topBin ?
          {
            from: topBin.from,
            to: topBin.to,
            count: topBin.count,
          }
        : null,
      asymmetryHint,
      meanMinusMedian:
        meanMinusMedian === null ? null : Number(meanMinusMedian.toFixed(2)),
    },
    extremes: {
      lowTailPct,
      highTailPct,
      tailImbalance:
        lowTailPct === null || highTailPct === null ?
          null
        : Number((highTailPct - lowTailPct).toFixed(1)),
    },
    referencePosition: {
      summaryReferenceValue:
        options.summaryReferenceValue === undefined ?
          null
        : options.summaryReferenceValue,
      summaryPercentile:
        summaryPercentile === null ? null : (
          Number(summaryPercentile.toFixed(1))
        ),
      latestValue:
        options.latestValue === undefined ? null : options.latestValue,
      latestPercentile:
        latestPercentile === null ? null : Number(latestPercentile.toFixed(1)),
    },
  };
}

export function AnalyticsPage() {
  const { token, user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const unitPreferences = useMemo(() => resolveUnitPreferences(user), [user]);

  const [filters, setFilters] = useState<ActivityFilterState>({
    q: '',
    from: '',
    to: '',
    type: '',
    minDistanceKm: '',
    maxDistanceKm: '',
    minTimeMin: '',
    maxTimeMin: '',
    minElev: '',
    maxElev: '',
    minAvgHR: '',
    maxAvgHR: '',
    minAvgSpeedKmh: '',
    maxAvgSpeedKmh: '',
    minAvgWatts: '',
    maxAvgWatts: '',
    minCadence: '',
    maxCadence: '',
    minCalories: '',
    maxCalories: '',
    minKilojoules: '',
    maxKilojoules: '',
  });

  const [activeView, setActiveView] = useState<AnalyticsView>('lab');
  const [labTheme, setLabTheme] = useState<LabTheme>('health');
  const [historicalTheme, setHistoricalTheme] =
    useState<HistoricalTheme>('insights');
  const [trendBucket, setTrendBucket] = useState('week');
  const distributionBins = 100;
  const [pivotRow, setPivotRow] = useState('type');
  const [historicalType, setHistoricalType] = useState('auto');
  const [historicalReference, setHistoricalReference] = useState('auto');
  const [historicalSampleSize, setHistoricalSampleSize] = useState(20);
  const [historicalPreset, setHistoricalPreset] =
    useState<HistoricalPreset>('balanced');
  const [historicalMainMetric, setHistoricalMainMetric] =
    useState<HistoricalMainMetric>('speedKmh');
  const [heartRateZoneBasis, setHeartRateZoneBasis] =
    useState<HeartRateZoneBasis>('avg');

  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null,
  );

  const [trendByMetric, setTrendByMetric] = useState<
    Record<string, TrendResponse>
  >({});
  const [distributionByMetric, setDistributionByMetric] = useState<
    Record<string, DistributionResponse>
  >({});
  const [pivotData, setPivotData] = useState<PivotResponse | null>(null);
  const [loadData, setLoadData] = useState<LoadResponse | null>(null);
  const [summaryData, setSummaryData] = useState<SummaryResponse | null>(null);
  const [dailyDistance, setDailyDistance] = useState<TrendResponse | null>(
    null,
  );
  const [correlationMatrix, setCorrelationMatrix] = useState<
    CorrelationCellResponse[]
  >([]);
  const [allActivitiesForSkills, setAllActivitiesForSkills] = useState<
    Activity[]
  >([]);
  const [allLoadForSkills, setAllLoadForSkills] = useState<LoadResponse | null>(
    null,
  );
  const [skillsRadarLoading, setSkillsRadarLoading] = useState(false);
  const [skillsRadarError, setSkillsRadarError] = useState<string | null>(null);
  const [historicalActivities, setHistoricalActivities] = useState<Activity[]>(
    [],
  );
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [earliestActivityDate, setEarliestActivityDate] = useState<
    string | null
  >(null);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<AnalyticsSectionKey, boolean>
  >({
    globalFilters: true,
    labToday: false,
    labSkillsRadar: false,
    labReferenceTimes: false,
    labHrZones: false,
    labHeatmap: false,
    labProfile: false,
    labTrends: false,
    labDistributions: false,
    labPivot: false,
    labLoad: false,
    histSelection: false,
    histSynthesis: false,
    histSkills: false,
    histSimple: false,
    histAdvancedMap: false,
    histAdvancedEvolution: false,
    histNarrative: false,
    histSessions: false,
  });

  const toggleSection = (section: AnalyticsSectionKey) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };
  const showLabSection = (section: AnalyticsSectionKey) =>
    activeView === 'lab' && labSectionsByTheme[labTheme].includes(section);
  const showHistoricalSection = (section: AnalyticsSectionKey) =>
    activeView === 'historical' &&
    historicalSectionsByTheme[historicalTheme].includes(section);

  const filterDateMin = useMemo(() => startOfCurrentYearInputValue(), []);
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    apiRequest<ActivityListResponse>(
      '/activities?limit=1&offset=0&sort=startDate:asc',
      { token },
    )
      .then((res) => {
        if (cancelled) {
          return;
        }
        const first = res.items[0];
        const firstDate =
          first ? dayKey(first.startDateLocal || first.startDate) : null;
        setEarliestActivityDate(firstDate);
      })
      .catch(() => {
        if (!cancelled) {
          setEarliestActivityDate(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const effectiveFilters = useMemo<ActivityFilterState>(() => {
    if ((filters.from ?? '') !== '' || !earliestActivityDate) {
      return filters;
    }
    return { ...filters, from: earliestActivityDate };
  }, [filters, earliestActivityDate]);

  const baseQuery = useMemo(
    () => buildActivityFilterQuery(effectiveFilters),
    [effectiveFilters],
  );

  useEffect(() => {
    const presetToSampleSize: Record<HistoricalPreset, number> = {
      strict: 12,
      balanced: 20,
      wide: 35,
    };
    setHistoricalSampleSize(presetToSampleSize[historicalPreset]);
  }, [historicalPreset]);

  useEffect(() => {
    if (!token || activeView !== 'lab') {
      return;
    }

    setError(null);

    Promise.all([
      Promise.all(
        trendMetrics.map(async (def) => {
          const data = await apiRequest<TrendResponse>(
            appendFilters(
              `/analytics/timeseries?metric=${def.metric}&bucket=${trendBucket}`,
              baseQuery,
            ),
            { token },
          );
          return [def.metric, data] as const;
        }),
      ),
      Promise.all(
        distributionMetrics.map(async (def) => {
          const data = await apiRequest<DistributionResponse>(
            appendFilters(
              `/analytics/distribution?metric=${def.metric}&bins=${distributionBins}`,
              baseQuery,
            ),
            {
              token,
            },
          );
          return [def.metric, data] as const;
        }),
      ),
      apiRequest<PivotResponse>(
        appendFilters(
          `/analytics/pivot?row=${pivotRow}&metrics=distance,time,elev,count,avgHR,avgSpeed,avgWatts,cadence,strideLength,groundContactTime,verticalOscillation,kilojoules,calories,sufferScore`,
          baseQuery,
        ),
        { token },
      ),
      apiRequest<LoadResponse>(appendFilters('/analytics/load', baseQuery), {
        token,
      }),
      apiRequest<SummaryResponse>(
        appendFilters('/analytics/summary', baseQuery),
        { token },
      ),
      apiRequest<TrendResponse>(
        appendFilters(
          '/analytics/timeseries?metric=distance&bucket=day',
          baseQuery,
        ),
        {
          token,
        },
      ),
      apiRequest<CorrelationResponseForAi>(
        appendFilters(
          `/analytics/correlations?vars=${correlationVarsForAi.join(',')}&method=spearman&scatterX=distance&scatterY=movingTime`,
          baseQuery,
        ),
        {
          token,
        },
      ),
    ])
      .then(
        ([
          trendRes,
          distributionRes,
          pivotRes,
          loadRes,
          summaryRes,
          dayDistanceRes,
          correlationRes,
        ]) => {
          const trendsMap: Record<string, TrendResponse> = {};
          for (const [metric, data] of trendRes) {
            trendsMap[metric] = data;
          }

          const distributionsMap: Record<string, DistributionResponse> = {};
          for (const [metric, data] of distributionRes) {
            distributionsMap[metric] = data;
          }

          setTrendByMetric(trendsMap);
          setDistributionByMetric(distributionsMap);
          setPivotData(pivotRes);
          setLoadData(loadRes);
          setSummaryData(summaryRes);
          setDailyDistance(dayDistanceRes);
          setCorrelationMatrix(correlationRes.matrix ?? []);
        },
      )
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur analytics');
      });
  }, [token, baseQuery, trendBucket, distributionBins, pivotRow, activeView]);

  useEffect(() => {
    if (!token) {
      setAllActivitiesForSkills([]);
      setAllLoadForSkills(null);
      return;
    }

    let cancelled = false;
    setSkillsRadarLoading(true);
    setSkillsRadarError(null);

    const fetchAllActivities = async () => {
      const limit = 200;
      const maxRows = 3000;
      let offset = 0;
      let total = Number.POSITIVE_INFINITY;
      const all: Activity[] = [];

      while (offset < total && all.length < maxRows) {
        const path = `/activities?limit=${limit}&offset=${offset}&sort=startDate:desc`;
        const res = await apiRequest<ActivityListResponse>(path, { token });
        all.push(...res.items);
        total = res.total;

        if (res.items.length === 0) {
          break;
        }
        offset += res.items.length;
      }

      return all;
    };

    Promise.all([
      fetchAllActivities(),
      apiRequest<LoadResponse>('/analytics/load', { token }),
    ])
      .then(([activities, load]) => {
        if (cancelled) {
          return;
        }
        setAllActivitiesForSkills(activities);
        setAllLoadForSkills(load);
      })
      .catch((err) => {
        if (!cancelled) {
          setSkillsRadarError(
            err instanceof Error ?
              err.message
            : 'Erreur chargement radar competences',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSkillsRadarLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || activeView !== 'historical') {
      return;
    }

    let cancelled = false;
    setHistoricalLoading(true);
    setHistoricalError(null);

    const fetchAll = async () => {
      const limit = 200;
      const maxRows = 2500;
      let offset = 0;
      let total = Number.POSITIVE_INFINITY;
      const all: Activity[] = [];

      while (offset < total && all.length < maxRows) {
        const path = `/activities?limit=${limit}&offset=${offset}&sort=startDate:desc`;
        const res = await apiRequest<ActivityListResponse>(
          appendFilters(path, baseQuery),
          { token },
        );
        all.push(...res.items);
        total = res.total;

        if (res.items.length === 0) {
          break;
        }
        offset += res.items.length;
      }

      if (!cancelled) {
        setHistoricalActivities(all);
      }
    };

    fetchAll()
      .catch((err) => {
        if (!cancelled) {
          setHistoricalError(
            err instanceof Error ? err.message : 'Erreur chargement historique',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHistoricalLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, baseQuery, activeView]);

  const loadOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      legend: { data: ['Charge', 'CTL', 'ATL', 'TSB'] },
      grid: { top: 42, left: 56, right: 18, bottom: 54 },
      xAxis: {
        type: 'category',
        data: loadData?.series.map((row) => row.date) ?? [],
        axisLabel: { rotate: 30 },
      },
      yAxis: [{ type: 'value' }],
      dataZoom: [{ type: 'inside' }, { type: 'slider' }],
      series: [
        {
          name: 'Charge',
          type: 'bar',
          data:
            loadData?.series.map((row) => Number(row.charge.toFixed(2))) ?? [],
          itemStyle: { color: '#0f766e99' },
        },
        {
          name: 'CTL',
          type: 'line',
          smooth: true,
          data: loadData?.series.map((row) => Number(row.ctl.toFixed(2))) ?? [],
        },
        {
          name: 'ATL',
          type: 'line',
          smooth: true,
          data: loadData?.series.map((row) => Number(row.atl.toFixed(2))) ?? [],
        },
        {
          name: 'TSB',
          type: 'line',
          smooth: true,
          data: loadData?.series.map((row) => Number(row.tsb.toFixed(2))) ?? [],
        },
      ],
    }),
    [loadData],
  );

  const calendarOption = useMemo(() => {
    const rawPoints =
      dailyDistance?.series.map((point) => ({
        date: point.bucket,
        value: convertDistanceKm(point.value, unitPreferences.distanceUnit),
      })) ?? [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 365);
    const points = rawPoints.filter((point) => new Date(point.date) >= cutoff);

    return buildGithubHeatmapOption(
      points,
      distanceUnitLabel(unitPreferences.distanceUnit),
    );
  }, [dailyDistance, unitPreferences.distanceUnit]);

  const todayLoadSummary = useMemo(() => {
    const series = loadData?.series ?? [];
    if (series.length === 0) {
      return null;
    }

    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    const todayKey = `${now.getFullYear()}-${month}-${day}`;
    const exactToday = series.find((row) => row.date === todayKey) ?? null;
    const latest = series[series.length - 1] ?? null;
    const row = exactToday ?? latest;

    if (!row) {
      return null;
    }

    const ctlHistory = series.map((entry) => entry.ctl);
    const chargeStatus = classifyChargeState(row.charge, row.ctl);
    const formeStatus = classifyCtlState(row.ctl, ctlHistory);
    const fatigueStatus = classifyAtlState(row.atl, row.ctl);
    const fraicheurStatus = classifyTsbState(row.tsb);
    const freshnessLabel =
      fraicheurStatus.tone === 'good' ? 'Bon niveau de fraicheur'
      : fraicheurStatus.tone === 'neutral' ? 'Zone equilibree'
      : 'Fatigue a surveiller';

    return {
      date: row.date,
      isToday: !!exactToday,
      charge: row.charge,
      forme: row.ctl,
      fatigue: row.atl,
      fraicheur: row.tsb,
      atlCtlRatio: row.ctl > 0 ? row.atl / row.ctl : null,
      chargeCtlRatio: row.ctl > 0 ? row.charge / row.ctl : null,
      chargeStatus,
      formeStatus,
      fatigueStatus,
      fraicheurStatus,
      freshnessLabel,
    };
  }, [loadData]);

  const skillsRadar = useMemo(() => {
    const runningSessions = allActivitiesForSkills
      .filter((activity) => isRunLikeActivity(activity))
      .map((activity) => {
        const distanceKm = activity.distance / 1000;
        const durationMin = activity.movingTime / 60;
        if (distanceKm <= 0 || durationMin <= 0) {
          return null;
        }

        const day = dayKey(activity.startDateLocal || activity.startDate);
        const paceMinPerKm = durationMin / distanceKm;
        const speedKmh = distanceKm / (durationMin / 60);
        const hr = activity.averageHeartrate;
        return {
          id: activity.id,
          day,
          timestamp: parseDay(day).getTime(),
          distanceKm,
          durationMin,
          paceMinPerKm,
          speedKmh,
          hr: hr === null || !Number.isFinite(hr) ? null : hr,
          cadence:
            (
              activity.averageCadence === null ||
              !Number.isFinite(activity.averageCadence)
            ) ?
              null
            : activity.averageCadence,
          hasRunDynamics:
            activity.strideLength !== null ||
            activity.groundContactTime !== null ||
            activity.verticalOscillation !== null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => a.timestamp - b.timestamp);

    const goalDistanceKm =
      (
        user?.goalDistanceKm !== null &&
        user?.goalDistanceKm !== undefined &&
        Number.isFinite(user.goalDistanceKm) &&
        user.goalDistanceKm > 0
      ) ?
        user.goalDistanceKm
      : null;
    const goalTimeSec =
      (
        user?.goalTimeSec !== null &&
        user?.goalTimeSec !== undefined &&
        Number.isFinite(user.goalTimeSec) &&
        user.goalTimeSec > 0
      ) ?
        user.goalTimeSec
      : null;
    const targetPaceMinPerKm =
      goalDistanceKm !== null && goalTimeSec !== null ?
        goalTimeSec / 60 / goalDistanceKm
      : null;
    const goalTimeHours =
      goalTimeSec === null ? null : Math.floor(goalTimeSec / 3600);
    const goalTimeMinutes =
      goalTimeSec === null ? null : Math.floor((goalTimeSec % 3600) / 60);

    const objectiveText =
      targetPaceMinPerKm === null ?
        'Objectif non defini dans Parametres.'
      : `Objectif: ${number(goalDistanceKm ?? 0, 2)} km en ${goalTimeHours ?? 0}:${(
          goalTimeMinutes ?? 0
        )
          .toString()
          .padStart(2, '0')} (${formatClock(targetPaceMinPerKm)} min/km)`;

    if (runningSessions.length < 6) {
      return {
        objectiveText,
        metrics: [] as SkillRadarMetric[],
        option: null as Record<string, unknown> | null,
        runCount: runningSessions.length,
        note: 'Pas assez de sorties course a pied pour etablir un radar robuste (minimum 6).',
        inputs: null as {
          avgWeeklyKm: number;
          avgWeeklyRuns: number;
          longestRunKm: number;
          targetPaceMinPerKm: number | null;
          tsb: number | null;
          atlCtlRatio: number | null;
        } | null,
      };
    }

    const weeklyMap = new Map<string, { km: number; runs: number }>();
    for (const session of runningSessions) {
      const weekKey = startOfIsoWeek(session.day);
      const current = weeklyMap.get(weekKey) ?? { km: 0, runs: 0 };
      current.km += session.distanceKm;
      current.runs += 1;
      weeklyMap.set(weekKey, current);
    }
    const weeklyRows = [...weeklyMap.entries()]
      .map(([week, values]) => ({ week, ...values }))
      .sort((a, b) => a.week.localeCompare(b.week));
    const recentWeeks = weeklyRows.slice(-12);
    const avgWeeklyKm = mean(recentWeeks.map((row) => row.km));
    const avgWeeklyRuns = mean(recentWeeks.map((row) => row.runs));
    const weeklyRunsStd = stdDev(recentWeeks.map((row) => row.runs));
    const longestRunKm = Math.max(
      ...runningSessions.map((session) => session.distanceKm),
    );

    const volumeScore = clamp(
      (avgWeeklyKm / recommendedWeeklyKm(goalDistanceKm)) * 100,
      0,
      100,
    );
    const longRunScore = clamp(
      (longestRunKm / recommendedLongRunKm(goalDistanceKm)) * 100,
      0,
      100,
    );
    const enduranceScore = clamp(
      volumeScore * 0.65 + longRunScore * 0.35,
      0,
      100,
    );

    const paceValues = runningSessions
      .map((session) => session.paceMinPerKm)
      .filter((value) => Number.isFinite(value));
    const q25Pace = quantile(paceValues, 0.25);
    const recentSessions = runningSessions.slice(-20);
    const recentPaceMean = mean(
      recentSessions.map((session) => session.paceMinPerKm),
    );
    const paceSpecificityScore =
      targetPaceMinPerKm !== null && q25Pace !== null ?
        (() => {
          const abilityScore = clamp(
            (targetPaceMinPerKm / q25Pace) * 100,
            0,
            100,
          );
          const densityScore =
            (runningSessions.filter(
              (session) => session.paceMinPerKm <= targetPaceMinPerKm * 1.1,
            ).length /
              runningSessions.length) *
            100;
          return clamp(abilityScore * 0.7 + densityScore * 0.3, 0, 100);
        })()
      : clamp(percentileScore(paceValues, recentPaceMean, false) ?? 50, 0, 100);

    const efficiencyValues = runningSessions
      .map((session) =>
        session.hr !== null && session.hr > 0 ?
          session.speedKmh / session.hr
        : null,
      )
      .filter((value): value is number => value !== null);
    const recentEfficiencyMean = mean(
      recentSessions
        .map((session) =>
          session.hr !== null && session.hr > 0 ?
            session.speedKmh / session.hr
          : null,
        )
        .filter((value): value is number => value !== null),
    );
    const cardioScore = clamp(
      percentileScore(efficiencyValues, recentEfficiencyMean, true) ?? 50,
      0,
      100,
    );

    const adherenceScore = clamp(
      100 - (Math.abs(avgWeeklyRuns - 4) / 4) * 100,
      0,
      100,
    );
    const stabilityScore = clamp(100 - weeklyRunsStd * 35, 0, 100);
    const consistencyScore = clamp(
      adherenceScore * 0.7 + stabilityScore * 0.3,
      0,
      100,
    );

    const latestAllLoad =
      allLoadForSkills?.series?.[allLoadForSkills.series.length - 1] ?? null;
    const atlCtlRatio =
      latestAllLoad && latestAllLoad.ctl > 0 ?
        latestAllLoad.atl / latestAllLoad.ctl
      : null;
    const tsb = latestAllLoad?.tsb ?? null;
    const freshnessScore =
      tsb === null ? 50 : clamp(100 - (Math.abs(tsb - 2) / 24) * 100, 0, 100);
    const fatigueRatioScore =
      atlCtlRatio === null ? 50 : (
        clamp(100 - (Math.abs(atlCtlRatio - 1) / 0.45) * 100, 0, 100)
      );
    const loadManagementScore = clamp(
      freshnessScore * 0.5 + fatigueRatioScore * 0.5,
      0,
      100,
    );

    const cadenceValues = runningSessions
      .map((session) => session.cadence)
      .filter((value): value is number => value !== null);
    const cadenceMedian = quantile(cadenceValues, 0.5);
    const cadenceScore =
      cadenceMedian === null ? 50 : (
        clamp(100 - (Math.abs(cadenceMedian - 82) / 24) * 100, 0, 100)
      );
    const dynamicsCoveragePct =
      (runningSessions.filter((session) => session.hasRunDynamics).length /
        runningSessions.length) *
      100;
    const techniqueScore = clamp(
      cadenceScore * 0.6 + dynamicsCoveragePct * 0.4,
      0,
      100,
    );

    const paceDetail =
      targetPaceMinPerKm === null ?
        `Sans objectif temps, score base sur la progression recente (${number(recentPaceMean, 2)} min/km).`
      : `Allure cible ${formatClock(targetPaceMinPerKm)} min/km, meilleur quartile observe ${q25Pace === null ? 'n/a' : formatClock(q25Pace)} min/km.`;
    const cadenceDisplay =
      cadenceMedian === null ? 'n/a' : (
        `${number(convertCadenceRpm(cadenceMedian, unitPreferences.cadenceUnit), 1)} ${cadenceUnitLabel(unitPreferences.cadenceUnit)}`
      );

    const metrics: SkillRadarMetric[] = [
      {
        name: 'Endurance',
        value: enduranceScore,
        detail: `${number(avgWeeklyKm, 1)} km/sem moyenne (12 sem) · sortie longue ${number(longestRunKm, 1)} km.`,
      },
      {
        name: 'Specificite objectif',
        value: paceSpecificityScore,
        detail: paceDetail,
      },
      {
        name: 'Efficacite cardio',
        value: cardioScore,
        detail: `Rendement vitesse/FC recent positionne au percentile ${number(cardioScore, 0)}.`,
      },
      {
        name: 'Regularite',
        value: consistencyScore,
        detail: `${number(avgWeeklyRuns, 1)} seances/sem sur 12 sem (cible 4).`,
      },
      {
        name: 'Gestion fatigue',
        value: loadManagementScore,
        detail:
          latestAllLoad ?
            `TSB ${number(latestAllLoad.tsb, 1)} · ATL/CTL ${atlCtlRatio === null ? 'n/a' : number(atlCtlRatio, 2)}.`
          : 'Charge indisponible.',
      },
      {
        name: 'Technique',
        value: techniqueScore,
        detail: `Cadence mediane ${cadenceDisplay} · couverture run dynamics ${number(dynamicsCoveragePct, 0)}%.`,
      },
    ];

    return {
      objectiveText,
      metrics,
      runCount: runningSessions.length,
      note: null as string | null,
      inputs: {
        avgWeeklyKm: Number(avgWeeklyKm.toFixed(2)),
        avgWeeklyRuns: Number(avgWeeklyRuns.toFixed(2)),
        longestRunKm: Number(longestRunKm.toFixed(2)),
        targetPaceMinPerKm:
          targetPaceMinPerKm === null ? null : (
            Number(targetPaceMinPerKm.toFixed(3))
          ),
        tsb: tsb === null ? null : Number(tsb.toFixed(2)),
        atlCtlRatio:
          atlCtlRatio === null ? null : Number(atlCtlRatio.toFixed(3)),
      },
      option: buildCompetencyRadarOption(metrics, 'Competences actuelles'),
    };
  }, [allActivitiesForSkills, allLoadForSkills, user, unitPreferences]);

  const referenceTimes = useMemo(() => {
    const targets: Array<{
      key: ReferenceTimeEstimate['key'];
      label: string;
      distanceKm: number;
    }> = [
      { key: '5k', label: '5 km', distanceKm: 5 },
      { key: '10k', label: '10 km', distanceKm: 10 },
      { key: 'half', label: 'Semi-marathon', distanceKm: 21.0975 },
      { key: 'marathon', label: 'Marathon', distanceKm: 42.195 },
    ];

    const hrMaxForEstimate =
      user?.hrMax && Number.isFinite(user.hrMax) && user.hrMax > 0 ?
        user.hrMax
      : 190;
    const todayDay = dayKey(new Date().toISOString());
    const runRows = allActivitiesForSkills
      .filter((activity) => isRunLikeActivity(activity))
      .map((activity) => {
        const day = dayKey(activity.startDateLocal || activity.startDate);
        const distanceKm = activity.distance / 1000;
        const movingTimeSec = activity.movingTime;
        const speedKmh =
          movingTimeSec > 0 ? distanceKm / (movingTimeSec / 3600) : Number.NaN;
        const maxSpeedKmh =
          activity.maxSpeed !== null && Number.isFinite(activity.maxSpeed) ?
            activity.maxSpeed * 3.6
          : null;
        const avgHr =
          (
            activity.averageHeartrate !== null &&
            Number.isFinite(activity.averageHeartrate)
          ) ?
            activity.averageHeartrate
          : null;
        const hrRatio =
          avgHr !== null ? clamp(avgHr / hrMaxForEstimate, 0.45, 1.1) : null;
        const paceMinPerKm = movingTimeSec / 60 / distanceKm;
        if (
          !Number.isFinite(distanceKm) ||
          !Number.isFinite(movingTimeSec) ||
          !Number.isFinite(speedKmh) ||
          !Number.isFinite(paceMinPerKm) ||
          distanceKm < 2 ||
          distanceKm > 90 ||
          movingTimeSec <= 0 ||
          speedKmh < 5 ||
          speedKmh > 24
        ) {
          return null;
        }
        const performanceIndex = movingTimeSec / distanceKm ** 1.06;
        return {
          id: activity.id,
          day,
          timestamp: parseDay(day).getTime(),
          distanceKm,
          movingTimeSec,
          speedKmh,
          paceMinPerKm,
          avgHr,
          hrRatio,
          maxSpeedKmh,
          performanceIndex,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 800);

    if (runRows.length === 0) {
      return {
        estimates: targets.map((target) => ({
          ...target,
          estimatedSec: null,
          q25Sec: null,
          q75Sec: null,
          paceMinPerKm: null,
          speedKmh: null,
          reliability: 0,
          supportRuns: 0,
          nearRuns: 0,
          recentNearRuns: 0,
        })) as ReferenceTimeEstimate[],
        runCount: 0,
        spanDays: null as number | null,
        oldestDay: null as string | null,
        latestDay: null as string | null,
        note: 'Aucune sortie running exploitable pour estimer des temps references.',
        option: null as Record<string, unknown> | null,
      };
    }

    const latestDay = runRows[0]?.day ?? null;
    const oldestDay = runRows[runRows.length - 1]?.day ?? null;
    const spanDays =
      oldestDay && latestDay ? daysBetween(oldestDay, latestDay) : null;
    const sortedPerformanceIndex = runRows
      .map((row) => row.performanceIndex)
      .sort((a, b) => a - b);

    const predictTimeSecFromRun = (
      run: (typeof runRows)[number],
      targetDistanceKm: number,
    ) => {
      const distanceRatio = targetDistanceKm / run.distanceKm;
      const exponent =
        distanceRatio > 1 ?
          run.distanceKm >= targetDistanceKm * 0.8 ?
            1.055
          : 1.065
        : 1.035;
      let predictedSec = run.movingTimeSec * distanceRatio ** exponent;
      if (
        targetDistanceKm <= 10 &&
        run.maxSpeedKmh !== null &&
        run.speedKmh > 0 &&
        run.distanceKm >= targetDistanceKm * 1.2
      ) {
        const speedReserve = clamp(run.maxSpeedKmh / run.speedKmh - 1, 0, 0.45);
        predictedSec *= 1 - speedReserve * 0.08;
      }
      return predictedSec;
    };

    const estimates: ReferenceTimeEstimate[] = targets.map((target) => {
      const projections = runRows
        .map((run) => {
          const distanceRatio = target.distanceKm / run.distanceKm;
          if (distanceRatio < 0.2 || distanceRatio > 4.2) {
            return null;
          }

          const predictedSec = predictTimeSecFromRun(run, target.distanceKm);
          const distanceGap = Math.abs(Math.log(Math.max(distanceRatio, 1e-6)));
          const ageDays = Math.max(0, daysBetween(run.day, todayDay));
          const closenessWeight = Math.exp(-distanceGap / 0.55);
          const recencyWeight = Math.exp(-ageDays / 220);
          const perfRank = percentileRank(
            sortedPerformanceIndex,
            run.performanceIndex,
          );
          const performanceScore =
            perfRank === null ? 0.5 : clamp(1 - perfRank, 0, 1);
          const hrScore =
            run.hrRatio === null ?
              0.55
            : clamp((run.hrRatio - 0.68) / 0.24, 0, 1);
          const intensityScore = clamp(
            performanceScore * 0.72 + hrScore * 0.28,
            0,
            1,
          );
          const performanceWeight = 0.55 + intensityScore * 0.95;
          const isEquivalentDistance =
            distanceRatio >= 0.94 && distanceRatio <= 1.06;
          const isNearDistance = distanceRatio >= 0.82 && distanceRatio <= 1.22;
          const nearBoost =
            isEquivalentDistance ?
              ageDays <= 180 ?
                2.4
              : 1.7
            : isNearDistance ?
              ageDays <= 180 ?
                1.7
              : 1.25
            : 1;
          const weight = Math.max(
            0.02,
            closenessWeight *
              (0.25 + 0.75 * recencyWeight) *
              performanceWeight *
              nearBoost,
          );
          return {
            predictedSec,
            distanceRatio,
            distanceGap,
            ageDays,
            intensityScore,
            isEquivalentDistance,
            isNearDistance,
            weight,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      const weightedPredictions = projections.map((row) => ({
        value: row.predictedSec,
        weight: row.weight,
      }));
      const baseMedianSec = weightedQuantile(weightedPredictions, 0.5);
      const q25Sec = weightedQuantile(weightedPredictions, 0.25);
      const q75Sec = weightedQuantile(weightedPredictions, 0.75);
      const equivalentRecentRows = projections.filter(
        (row) => row.isEquivalentDistance && row.ageDays <= 180,
      );
      const nearRows = projections.filter((row) => row.isNearDistance);
      const recentNearRows = nearRows.filter((row) => row.ageDays <= 180);
      const anchorRows =
        equivalentRecentRows.length > 0 ? equivalentRecentRows : recentNearRows;
      const anchorWeightedRows = anchorRows.map((row) => ({
        value: row.predictedSec,
        weight: row.weight * (0.7 + row.intensityScore * 0.6),
      }));
      const anchorSec =
        anchorRows.length >= 1 ?
          weightedQuantile(anchorWeightedRows, 0.25)
        : null;
      const bestRecentNearSec =
        recentNearRows.length > 0 ?
          weightedQuantile(
            recentNearRows.map((row) => ({
              value: row.predictedSec,
              weight: row.weight * (0.72 + row.intensityScore * 0.85),
            })),
            0.08,
          )
        : null;
      const bestEquivalentSec =
        equivalentRecentRows.length > 0 ?
          weightedQuantile(
            equivalentRecentRows.map((row) => ({
              value: row.predictedSec,
              weight: row.weight * (0.8 + row.intensityScore * 0.7),
            })),
            0.08,
          )
        : null;
      const bestEquivalentHardCapSec =
        equivalentRecentRows.length > 0 ?
          Math.min(...equivalentRecentRows.map((row) => row.predictedSec))
        : null;
      const competitiveRows = projections.filter((row) => {
        return (
          row.ageDays <= 365 &&
          row.distanceRatio >= 0.72 &&
          row.distanceRatio <= 1.45 &&
          row.intensityScore >= 0.35
        );
      });
      const competitiveAnchorSec =
        competitiveRows.length >= 2 ?
          weightedQuantile(
            competitiveRows.map((row) => ({
              value: row.predictedSec,
              weight:
                row.weight *
                (0.72 + row.intensityScore * 0.9) *
                (row.isEquivalentDistance ? 1.55
                : row.isNearDistance ? 1.24
                : 1),
            })),
            target.distanceKm <= 10 ? 0.16
            : target.distanceKm <= 21.0975 ? 0.2
            : 0.28,
          )
        : null;
      const totalWeight = projections.reduce((sum, row) => sum + row.weight, 0);
      const nearWeight = nearRows.reduce((sum, row) => sum + row.weight, 0);
      const anchorCoverage =
        totalWeight > 0 ? clamp((nearWeight / totalWeight) * 1.35, 0, 1) : 0;
      const anchorStrength =
        anchorSec === null ? 0
        : equivalentRecentRows.length > 0 ?
          clamp(0.7 + equivalentRecentRows.length * 0.05, 0.7, 0.88)
        : clamp(0.42 + recentNearRows.length * 0.04, 0.42, 0.62) *
          anchorCoverage;
      let estimatedSec: number | null =
        baseMedianSec === null && anchorSec !== null ? anchorSec
        : baseMedianSec !== null && anchorSec !== null ?
          baseMedianSec * (1 - anchorStrength) + anchorSec * anchorStrength
        : baseMedianSec !== null ? baseMedianSec
        : null;

      if (
        estimatedSec !== null &&
        bestEquivalentSec !== null &&
        equivalentRecentRows.length > 0
      ) {
        const bestEquivalentBlend =
          equivalentRecentRows.length >= 2 ? 0.62 : 0.48;
        estimatedSec =
          estimatedSec * (1 - bestEquivalentBlend) +
          bestEquivalentSec * bestEquivalentBlend;
      }
      if (estimatedSec !== null && competitiveAnchorSec !== null) {
        const competitiveBlend =
          target.distanceKm <= 10 ? 0.42
          : target.distanceKm <= 21.0975 ? 0.33
          : 0.22;
        estimatedSec =
          estimatedSec * (1 - competitiveBlend) +
          competitiveAnchorSec * competitiveBlend;
      }

      if (estimatedSec !== null && bestEquivalentHardCapSec !== null) {
        const optimismPct =
          target.distanceKm <= 10 ? 0.01
          : target.distanceKm <= 21.0975 ? 0.007
          : 0.004;
        const optimisticCapSec = bestEquivalentHardCapSec * (1 - optimismPct);
        estimatedSec = Math.min(estimatedSec, optimisticCapSec);
      } else if (
        estimatedSec !== null &&
        bestRecentNearSec !== null &&
        target.distanceKm <= 10
      ) {
        estimatedSec = Math.min(estimatedSec, bestRecentNearSec * 0.996);
      }

      if (
        estimatedSec !== null &&
        anchorSec !== null &&
        equivalentRecentRows.length > 0
      ) {
        estimatedSec = clamp(estimatedSec, anchorSec * 0.95, anchorSec * 1.12);
      }
      if (estimatedSec !== null && bestEquivalentSec !== null) {
        const bestEquivalentUpperBound =
          target.distanceKm <= 10 ? 1.03
          : target.distanceKm <= 21.0975 ? 1.06
          : 1.1;
        estimatedSec = clamp(
          estimatedSec,
          bestEquivalentSec * 0.95,
          bestEquivalentSec * bestEquivalentUpperBound,
        );
      }

      if (target.key === 'marathon') {
        const semiRows = runRows.filter((run) => {
          const ageDays = Math.max(0, daysBetween(run.day, todayDay));
          return run.distanceKm >= 18 && run.distanceKm <= 24 && ageDays <= 320;
        });
        const semiMarathonEstimates = semiRows
          .map((run) => {
            const ageDays = Math.max(0, daysBetween(run.day, todayDay));
            const semiTime = predictTimeSecFromRun(run, 21.0975);
            if (!Number.isFinite(semiTime) || semiTime <= 0) {
              return null;
            }
            const semiPaceMinPerKm = semiTime / 60 / 21.0975;
            const penaltySec = clamp(
              780 + (semiPaceMinPerKm - 5.0) * 300,
              600,
              1500,
            );
            const marathonSec = semiTime * 2 + penaltySec;
            const weight =
              Math.exp(-ageDays / 260) *
              (0.6 +
                (run.hrRatio === null ?
                  0.45
                : clamp((run.hrRatio - 0.68) / 0.24, 0, 1)) *
                  0.7);
            return {
              marathonSec,
              weight: Math.max(weight, 0.1),
            };
          })
          .filter(
            (
              row,
            ): row is {
              marathonSec: number;
              weight: number;
            } => row !== null,
          );
        const semiAnchor = weightedQuantile(
          semiMarathonEstimates.map((row) => ({
            value: row.marathonSec,
            weight: row.weight,
          })),
          0.3,
        );

        const longRows = runRows.filter((run) => {
          const ageDays = Math.max(0, daysBetween(run.day, todayDay));
          return run.distanceKm >= 26 && ageDays <= 260;
        });
        const longAnchors = longRows
          .map((run) => {
            const ageDays = Math.max(0, daysBetween(run.day, todayDay));
            const ratio = 42.195 / run.distanceKm;
            const marathonSec = run.movingTimeSec * ratio ** 1.06;
            const intensity =
              run.hrRatio === null ?
                0.45
              : clamp((run.hrRatio - 0.68) / 0.24, 0, 1);
            const weight = Math.exp(-ageDays / 240) * (0.55 + intensity * 0.6);
            return {
              marathonSec,
              weight: Math.max(weight, 0.1),
            };
          })
          .filter(
            (row) => Number.isFinite(row.marathonSec) && row.marathonSec > 0,
          );
        const longAnchor = weightedQuantile(
          longAnchors.map((row) => ({
            value: row.marathonSec,
            weight: row.weight,
          })),
          0.4,
        );

        if (estimatedSec === null) {
          estimatedSec = semiAnchor ?? longAnchor ?? null;
        } else {
          if (semiAnchor !== null) {
            estimatedSec = estimatedSec * 0.62 + semiAnchor * 0.38;
          }
          if (longAnchor !== null) {
            estimatedSec = estimatedSec * 0.78 + longAnchor * 0.22;
          }
        }
      }

      const spreadRatio =
        (
          q25Sec !== null &&
          q75Sec !== null &&
          estimatedSec !== null &&
          estimatedSec > 0
        ) ?
          (q75Sec - q25Sec) / estimatedSec
        : null;
      const medianDistanceGap = weightedQuantile(
        projections.map((row) => ({
          value: row.distanceGap,
          weight: row.weight,
        })),
        0.5,
      );
      const weightedAgeDays = weightedQuantile(
        projections.map((row) => ({ value: row.ageDays, weight: row.weight })),
        0.5,
      );

      const sampleScore = clamp((projections.length / 55) * 100, 15, 100);
      const proximityScore =
        medianDistanceGap === null ? 55 : (
          clamp(100 - medianDistanceGap * 120, 20, 100)
        );
      const spreadScore =
        spreadRatio === null ? 60 : clamp(100 - spreadRatio * 130, 25, 100);
      const recencyScore =
        weightedAgeDays === null ? 65 : (
          clamp(100 - Math.max(weightedAgeDays - 21, 0) * 0.35, 35, 100)
        );
      const equivalentScore = clamp(
        equivalentRecentRows.length * 22 + recentNearRows.length * 6,
        0,
        100,
      );
      let reliabilityRaw =
        sampleScore * 0.18 +
        proximityScore * 0.26 +
        spreadScore * 0.18 +
        recencyScore * 0.14 +
        equivalentScore * 0.24;
      if (target.key === 'marathon') {
        const hasSemiAnchor = runRows.some((run) => {
          const ageDays = Math.max(0, daysBetween(run.day, todayDay));
          return run.distanceKm >= 18 && run.distanceKm <= 24 && ageDays <= 320;
        });
        const hasLongAnchor = runRows.some((run) => {
          const ageDays = Math.max(0, daysBetween(run.day, todayDay));
          return run.distanceKm >= 26 && ageDays <= 260;
        });
        if (!hasSemiAnchor && !hasLongAnchor) {
          reliabilityRaw *= 0.82;
        }
      }
      const reliability =
        estimatedSec === null ? 0 : clamp(reliabilityRaw, 22, 98);

      const paceMinPerKm =
        estimatedSec === null ? null : estimatedSec / 60 / target.distanceKm;
      const speedKmh =
        estimatedSec === null || estimatedSec <= 0 ?
          null
        : target.distanceKm / (estimatedSec / 3600);

      return {
        key: target.key,
        label: target.label,
        distanceKm: target.distanceKm,
        estimatedSec:
          estimatedSec === null ? null : Number(estimatedSec.toFixed(1)),
        q25Sec: q25Sec === null ? null : Number(q25Sec.toFixed(1)),
        q75Sec: q75Sec === null ? null : Number(q75Sec.toFixed(1)),
        paceMinPerKm:
          paceMinPerKm === null ? null : Number(paceMinPerKm.toFixed(4)),
        speedKmh: speedKmh === null ? null : Number(speedKmh.toFixed(3)),
        reliability: Number(reliability.toFixed(0)),
        supportRuns: projections.length,
        nearRuns: nearRows.length,
        recentNearRuns: recentNearRows.length,
      };
    });
    const coherenceResult = enforceReferenceTimeCoherence(estimates);
    const coherentEstimates = coherenceResult.estimates;
    const coherenceAdjustedKeys = coherenceResult.adjustedKeys;

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: Array<{ dataIndex: number }>) => {
          const row = coherentEstimates[params?.[0]?.dataIndex ?? -1];
          if (!row || row.estimatedSec === null) {
            return 'n/a';
          }
          return [
            `<strong>${row.label}</strong>`,
            `Hypothese: ${formatDuration(row.estimatedSec / 60)}`,
            `Allure ref: ${row.paceMinPerKm === null ? 'n/a' : `${formatClock(row.paceMinPerKm)} /km`}`,
          ].join('<br/>');
        },
      },
      grid: { top: 24, left: 50, right: 20, bottom: 48 },
      xAxis: {
        type: 'category',
        data: coherentEstimates.map((row) => row.label),
        axisLabel: { color: '#6b7280', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        name: 'Temps (min)',
        nameTextStyle: { color: '#6b7280', fontSize: 11 },
        axisLabel: { color: '#6b7280', fontSize: 11 },
        splitLine: { lineStyle: { color: 'rgba(19,19,19,0.08)' } },
      },
      series: [
        {
          type: 'bar',
          data: coherentEstimates.map((row) =>
            row.estimatedSec === null ?
              null
            : Number((row.estimatedSec / 60).toFixed(2)),
          ),
          barMaxWidth: 34,
          itemStyle: {
            color: '#0f766e',
            borderRadius: [8, 8, 0, 0],
          },
        },
      ],
    };

    const noteParts: string[] = [];

    return {
      estimates: coherentEstimates,
      runCount: runRows.length,
      spanDays,
      oldestDay,
      latestDay,
      note: noteParts.length > 0 ? noteParts.join(' ') : null,
      option,
    };
  }, [allActivitiesForSkills, user?.hrMax]);

  const heartRateZonesSummary = useMemo(() => {
    const hrMax = user?.hrMax ?? null;
    const avgBins = distributionByMetric.avgHR?.bins ?? [];
    const maxBins = distributionByMetric.maxHR?.bins ?? [];
    const avgSampleSize =
      distributionByMetric.avgHR?.sampleSize ??
      avgBins.reduce((sum, bin) => sum + bin.count, 0);
    const maxSampleSize =
      distributionByMetric.maxHR?.sampleSize ??
      maxBins.reduce((sum, bin) => sum + bin.count, 0);

    if (!hrMax || hrMax <= 0) {
      return {
        hrMax: null,
        avgSampleSize,
        maxSampleSize,
        zones: [],
        dominantAvgZone: null as HeartRateZoneKey | null,
        dominantMaxZone: null as HeartRateZoneKey | null,
      };
    }

    const zones = heartRateZones.map((zoneDef) => {
      const rangeStart = (zoneDef.minPct / 100) * hrMax;
      const rangeEnd =
        zoneDef.zone === 'Z5' ?
          Number.POSITIVE_INFINITY
        : (zoneDef.maxPct / 100) * hrMax;
      const avgCountEstimate = estimatedCountInRange(
        avgBins,
        rangeStart,
        rangeEnd,
      );
      const maxCountEstimate = estimatedCountInRange(
        maxBins,
        rangeStart,
        rangeEnd,
      );

      return {
        ...zoneDef,
        rangeLabel: zoneRangeLabel(zoneDef.zone, hrMax),
        avgCountEstimate,
        maxCountEstimate,
        avgPct:
          avgSampleSize > 0 ? (avgCountEstimate / avgSampleSize) * 100 : null,
        maxPct:
          maxSampleSize > 0 ? (maxCountEstimate / maxSampleSize) * 100 : null,
      };
    });

    const dominantAvgZone =
      zones
        .filter((zone) => zone.avgPct !== null)
        .sort((a, b) => (b.avgPct ?? 0) - (a.avgPct ?? 0))[0]?.zone ?? null;
    const dominantMaxZone =
      zones
        .filter((zone) => zone.maxPct !== null)
        .sort((a, b) => (b.maxPct ?? 0) - (a.maxPct ?? 0))[0]?.zone ?? null;

    return {
      hrMax,
      avgSampleSize,
      maxSampleSize,
      zones,
      dominantAvgZone,
      dominantMaxZone,
    };
  }, [distributionByMetric, user?.hrMax]);

  const activeHeartRateZonesView = useMemo(() => {
    const isAverageMode = heartRateZoneBasis === 'avg';
    const sampleSize =
      isAverageMode ?
        heartRateZonesSummary.avgSampleSize
      : heartRateZonesSummary.maxSampleSize;
    const dominantZone =
      isAverageMode ?
        heartRateZonesSummary.dominantAvgZone
      : heartRateZonesSummary.dominantMaxZone;
    const rows = heartRateZonesSummary.zones.map((zone) => ({
      ...zone,
      pct: isAverageMode ? zone.avgPct : zone.maxPct,
      countEstimate:
        isAverageMode ? zone.avgCountEstimate : zone.maxCountEstimate,
    }));

    return {
      basis: heartRateZoneBasis,
      basisLabel: isAverageMode ? 'FC moyenne' : 'FC max',
      sampleSize,
      dominantZone,
      rows,
      alternateBasisLabel: isAverageMode ? 'FC max' : 'FC moyenne',
      alternateSampleSize:
        isAverageMode ?
          heartRateZonesSummary.maxSampleSize
        : heartRateZonesSummary.avgSampleSize,
    };
  }, [heartRateZoneBasis, heartRateZonesSummary]);

  useEffect(() => {
    if (
      heartRateZoneBasis === 'avg' &&
      heartRateZonesSummary.avgSampleSize <= 0 &&
      heartRateZonesSummary.maxSampleSize > 0
    ) {
      setHeartRateZoneBasis('max');
      return;
    }

    if (
      heartRateZoneBasis === 'max' &&
      heartRateZonesSummary.maxSampleSize <= 0 &&
      heartRateZonesSummary.avgSampleSize > 0
    ) {
      setHeartRateZoneBasis('avg');
    }
  }, [
    heartRateZoneBasis,
    heartRateZonesSummary.avgSampleSize,
    heartRateZonesSummary.maxSampleSize,
  ]);

  const relatedMetricsByCorrelationVar = useMemo(() => {
    const map: Record<
      CorrelationVarForAi,
      Array<{
        metricVar: CorrelationVarForAi;
        metricLabel: string;
        r: number;
        n: number;
      }>
    > = {
      distance: [],
      movingTime: [],
      elevGain: [],
      avgSpeed: [],
      maxSpeed: [],
      avgHR: [],
      maxHR: [],
      avgWatts: [],
      maxWatts: [],
      cadence: [],
      strideLength: [],
      groundContactTime: [],
      verticalOscillation: [],
      sufferScore: [],
      kilojoules: [],
      calories: [],
      charge: [],
    };

    for (const sourceVar of correlationVarsForAi) {
      const topRelated = correlationMatrix
        .filter(
          (cell) =>
            cell.x === sourceVar &&
            cell.y !== sourceVar &&
            cell.value !== null &&
            correlationVarsForAi.includes(cell.y as CorrelationVarForAi) &&
            cell.n >= 8,
        )
        .sort(
          (a, b) =>
            Math.abs((b.value ?? 0) as number) -
            Math.abs((a.value ?? 0) as number),
        )
        .slice(0, 5)
        .map((cell) => {
          const relatedVar = cell.y as CorrelationVarForAi;
          return {
            metricVar: relatedVar,
            metricLabel: correlationVarLabels[relatedVar] ?? relatedVar,
            r: Number((cell.value ?? 0).toFixed(3)),
            n: cell.n,
          };
        });

      map[sourceVar] = topRelated;
    }

    return map;
  }, [correlationMatrix]);

  const athleteInsightsRows = useMemo(() => {
    const weightKg = user?.weightKg ?? null;
    const heightCm = user?.heightCm ?? null;
    const age = user?.age ?? null;

    const bmi =
      weightKg !== null && heightCm !== null && heightCm > 0 ?
        weightKg / (heightCm / 100) ** 2
      : null;

    const calories = summaryData?.totalCalories ?? null;
    const distanceKm = summaryData?.totalDistanceKm ?? null;
    const distanceValue =
      distanceKm === null ? null : (
        convertDistanceKm(distanceKm, unitPreferences.distanceUnit)
      );
    const distanceLabel = distanceUnitLabel(unitPreferences.distanceUnit);
    const hours = summaryData?.totalMovingTimeHours ?? null;
    const sessions = summaryData?.count ?? null;

    const kcalPerDistance =
      calories !== null && distanceValue !== null && distanceValue > 0 ?
        calories / distanceValue
      : null;
    const kcalPerHour =
      calories !== null && hours !== null && hours > 0 ?
        calories / hours
      : null;
    const kcalPerSession =
      calories !== null && sessions !== null && sessions > 0 ?
        calories / sessions
      : null;
    const kcalPerKg =
      calories !== null && weightKg !== null && weightKg > 0 ?
        calories / weightKg
      : null;

    return [
      {
        key: 'age',
        label: 'Age',
        value: age === null ? 'n/a' : `${age} ans`,
        hint: 'Utilise pour contextualiser certains indicateurs de charge et progression.',
        linkHref: 'https://en.wikipedia.org/wiki/Physiology_of_exercise',
      },
      {
        key: 'weight',
        label: 'Poids',
        value: formatMetric(weightKg, 'kg', 1),
        hint: 'Poids utilise dans les estimations energetiques quand Strava ne fournit pas les calories.',
        linkHref: 'https://en.wikipedia.org/wiki/Metabolic_equivalent_of_task',
      },
      {
        key: 'height',
        label: 'Taille',
        value: formatMetric(heightCm, 'cm', 0),
        hint: 'Taille stockee pour enrichir les analyses de profil athlete.',
        linkHref: 'https://en.wikipedia.org/wiki/Anthropometry',
      },
      {
        key: 'bmi',
        label: 'IMC',
        value: formatMetric(bmi, '', 2),
        hint: 'IMC = poids / taille^2. Indicateur general, pas une mesure de performance sportive.',
        linkHref: 'https://en.wikipedia.org/wiki/Body_mass_index',
      },
      {
        key: 'kcalPerKm',
        label: `Depense par ${distanceLabel}`,
        value: formatMetric(kcalPerDistance, `kcal/${distanceLabel}`, 1),
        hint: 'Total calories / total distance sur la periode filtree.',
        linkHref: 'https://en.wikipedia.org/wiki/Energy_expenditure',
      },
      {
        key: 'kcalPerHour',
        label: 'Depense par heure',
        value: formatMetric(kcalPerHour, 'kcal/h', 0),
        hint: "Total calories / total heures d'effort sur la periode filtree.",
        linkHref: 'https://en.wikipedia.org/wiki/Energy_expenditure',
      },
      {
        key: 'kcalPerSession',
        label: 'Depense par activite',
        value: formatMetric(kcalPerSession, 'kcal', 0),
        hint: "Total calories / nombre d'activites sur la periode filtree.",
        linkHref: 'https://en.wikipedia.org/wiki/Energy_expenditure',
      },
      {
        key: 'kcalPerKg',
        label: 'Charge relative',
        value: formatMetric(kcalPerKg, 'kcal/kg', 1),
        hint: 'Total calories normalisees par le poids corporel.',
        linkHref: 'https://en.wikipedia.org/wiki/Training_load',
      },
    ];
  }, [
    summaryData,
    unitPreferences.distanceUnit,
    user?.age,
    user?.weightKg,
    user?.heightCm,
  ]);

  const historicalSessions = useMemo(() => {
    const hrMax = user?.hrMax ?? loadData?.hrMax ?? 190;
    return historicalActivities
      .map((activity) => {
        const durationMin = activity.movingTime / 60;
        const distanceKm = activity.distance / 1000;
        const hr = asValidNumber(activity.averageHeartrate);
        const speedKmh =
          activity.averageSpeed > 0 ? activity.averageSpeed * 3.6 : null;
        const cadence = asValidNumber(activity.averageCadence);
        const intensityProxy =
          hr !== null && hrMax > 0 ? (hr / hrMax) * durationMin : null;
        return {
          id: activity.id,
          day: dayKey(activity.startDateLocal || activity.startDate),
          timestamp: new Date(activity.startDate).getTime(),
          type: activityTypeLabel(activity),
          speedKmh,
          hr,
          cadence,
          durationMin,
          distanceKm,
          intensityProxy,
          activity,
        } satisfies HistoricalSession;
      })
      .filter((session) => session.durationMin > 0 && session.distanceKm > 0);
  }, [historicalActivities, user?.hrMax, loadData?.hrMax]);

  const historicalTypeStats = useMemo(() => {
    const map = new Map<string, HistoricalSession[]>();
    for (const session of historicalSessions) {
      const existing = map.get(session.type) ?? [];
      existing.push(session);
      map.set(session.type, existing);
    }

    return [...map.entries()]
      .map(([type, sessions]) => {
        const sortedSessions = [...sessions].sort(
          (a, b) => b.timestamp - a.timestamp,
        );
        const count = sortedSessions.length;
        const coverage =
          (sortedSessions.filter((item) => item.speedKmh !== null).length +
            sortedSessions.filter((item) => item.hr !== null).length +
            sortedSessions.filter((item) => item.cadence !== null).length) /
          (count * 3);
        const score = count * (0.65 + coverage * 0.35);
        return { type, count, coverage, score, sessions: sortedSessions };
      })
      .sort((a, b) => b.score - a.score);
  }, [historicalSessions]);

  const recommendedHistoricalType = historicalTypeStats[0]?.type ?? null;
  const resolvedHistoricalType =
    historicalType === 'auto' ? recommendedHistoricalType : historicalType;
  const selectedHistoricalType = useMemo(
    () =>
      historicalTypeStats.find((row) => row.type === resolvedHistoricalType) ??
      null,
    [historicalTypeStats, resolvedHistoricalType],
  );
  const selectedTypeSessions = selectedHistoricalType?.sessions ?? [];

  useEffect(() => {
    if (historicalReference === 'auto') {
      return;
    }
    if (
      !selectedTypeSessions.some(
        (session) => session.id === historicalReference,
      )
    ) {
      setHistoricalReference('auto');
    }
  }, [historicalReference, selectedTypeSessions]);

  const referenceSession = useMemo(() => {
    if (selectedTypeSessions.length === 0) {
      return null;
    }

    if (historicalReference !== 'auto') {
      return (
        selectedTypeSessions.find(
          (session) => session.id === historicalReference,
        ) ?? null
      );
    }

    const ranked = selectedTypeSessions
      .map((session) => ({
        session,
        quality: [session.speedKmh, session.hr, session.cadence].filter(
          (value) => value !== null,
        ).length,
      }))
      .sort(
        (a, b) =>
          b.quality - a.quality || b.session.timestamp - a.session.timestamp,
      );

    return ranked[0]?.session ?? null;
  }, [selectedTypeSessions, historicalReference]);

  const historicalComparison = useMemo(() => {
    if (!referenceSession || selectedTypeSessions.length === 0) {
      return null;
    }

    const stdByFeature: Partial<Record<HistoricalFeature, number>> = {};
    for (const feature of historicalFeatureKeys) {
      const values = selectedTypeSessions
        .map((session) => sessionFeatureValue(session, feature))
        .filter((value): value is number => value !== null);
      const featureStd = stdDev(values);
      if (featureStd > 0) {
        stdByFeature[feature] = featureStd;
      }
    }

    const referenceAvailableFeatures = historicalFeatureKeys.filter(
      (feature) => sessionFeatureValue(referenceSession, feature) !== null,
    ).length;

    const neighbors: HistoricalNeighbor[] = [];
    for (const session of selectedTypeSessions) {
      if (session.id === referenceSession.id) {
        continue;
      }

      let sumSquared = 0;
      let usedFeatures = 0;
      for (const feature of historicalFeatureKeys) {
        const std = stdByFeature[feature];
        if (!std) {
          continue;
        }

        const refValue = sessionFeatureValue(referenceSession, feature);
        const sampleValue = sessionFeatureValue(session, feature);
        if (refValue === null || sampleValue === null) {
          continue;
        }

        const z = (sampleValue - refValue) / std;
        sumSquared += z * z;
        usedFeatures += 1;
      }

      if (usedFeatures < 2) {
        continue;
      }

      const distance = Math.sqrt(sumSquared / usedFeatures);
      neighbors.push({
        session,
        distance,
        similarity: 1 / (1 + distance),
        usedFeatures,
      });
    }

    neighbors.sort((a, b) => a.distance - b.distance);
    const sampleCap = Math.round(clamp(historicalSampleSize, 8, 60));
    const keptNeighbors = neighbors.slice(0, Math.max(0, sampleCap - 1));
    const rows: HistoricalNeighbor[] = [
      {
        session: referenceSession,
        distance: 0,
        similarity: 1,
        usedFeatures: referenceAvailableFeatures,
      },
      ...keptNeighbors,
    ].sort((a, b) => a.session.timestamp - b.session.timestamp);

    const coverage = mean(
      rows.map((row) => row.usedFeatures / historicalFeatureKeys.length),
    );
    const spanDays =
      rows.length >= 2 ?
        Math.max(
          0,
          daysBetween(rows[0].session.day, rows[rows.length - 1].session.day),
        )
      : 0;
    const sampleScore = clamp(((rows.length - 3) / 25) * 45, 0, 45);
    const coverageScore = clamp(coverage * 35, 0, 35);
    const spanScore = clamp((spanDays / 180) * 20, 0, 20);
    const reliability = sampleScore + coverageScore + spanScore;

    return {
      reference: referenceSession,
      rows,
      poolSize: selectedTypeSessions.length,
      candidates: neighbors.length,
      coverage,
      spanDays,
      reliability,
      thresholdDistance:
        keptNeighbors.length > 0 ?
          keptNeighbors[keptNeighbors.length - 1].distance
        : null,
    };
  }, [referenceSession, selectedTypeSessions, historicalSampleSize]);

  const historicalMetrics = useMemo(() => {
    if (!historicalComparison) {
      return [] as HistoricalMetricSummary[];
    }

    const buildMetric = (
      label: string,
      unit: string,
      accessor: (session: HistoricalSession) => number | null,
    ): HistoricalMetricSummary => {
      const points = historicalComparison.rows
        .map((row, index) => {
          const value = accessor(row.session);
          return value === null ? null : { x: index + 1, value };
        })
        .filter(
          (point): point is { x: number; value: number } => point !== null,
        );

      if (points.length < 3) {
        return {
          label,
          unit,
          first: null,
          recent: null,
          changePct: null,
          slope: null,
          rho: null,
          effectSize: null,
        };
      }

      const values = points.map((point) => point.value);
      const xs = points.map((point) => point.x);
      const chunkSize = Math.max(2, Math.floor(values.length / 3));
      const firstSlice = values.slice(0, chunkSize);
      const recentSlice = values.slice(-chunkSize);
      const first = mean(firstSlice);
      const recent = mean(recentSlice);
      const changePct = first !== 0 ? ((recent - first) / first) * 100 : null;
      const regression = linearRegression(xs, values);
      const rho = spearmanCorrelation(xs, values);

      return {
        label,
        unit,
        first,
        recent,
        changePct,
        slope: regression?.slope ?? null,
        rho,
        effectSize: cohenD(firstSlice, recentSlice),
      };
    };

    return [
      buildMetric(
        unitPreferences.speedUnit === 'kmh' ? 'Vitesse' : 'Allure',
        speedUnitLabel(unitPreferences.speedUnit),
        (session) =>
          session.speedKmh === null ?
            null
          : convertSpeedKmh(session.speedKmh, unitPreferences.speedUnit),
      ),
      buildMetric('FC', 'bpm', (session) => session.hr),
      buildMetric(
        'Cadence',
        cadenceUnitLabel(unitPreferences.cadenceUnit),
        (session) =>
          session.cadence === null ?
            null
          : convertCadenceRpm(session.cadence, unitPreferences.cadenceUnit),
      ),
      buildMetric('Intensite', 'a.u.', (session) => session.intensityProxy),
    ];
  }, [
    historicalComparison,
    unitPreferences.cadenceUnit,
    unitPreferences.speedUnit,
  ]);

  const historicalNarrative = useMemo(() => {
    if (!historicalComparison || historicalMetrics.length === 0) {
      return [] as string[];
    }

    const [speed, hr, cadence, intensity] = historicalMetrics;
    const notes: string[] = [];
    const speedIsPace =
      unitPreferences.speedUnit === 'pace_km' ||
      unitPreferences.speedUnit === 'pace_mi';
    const speedLabel = speedIsPace ? "l'allure moyenne" : 'la vitesse moyenne';
    const speedProgress =
      speed.changePct !== null &&
      (speedIsPace ? speed.changePct <= -2 : speed.changePct >= 2);
    const speedDecline =
      speed.changePct !== null &&
      (speedIsPace ? speed.changePct >= 2 : speed.changePct <= -2);

    if (speed.changePct !== null) {
      if (speedProgress) {
        notes.push(
          `Sur les sessions comparables, ${speedLabel} progresse (${formatSignedPercent(speed.changePct)}).`,
        );
      } else if (speedDecline) {
        notes.push(
          `${speedLabel.charAt(0).toUpperCase()}${speedLabel.slice(1)} recule (${formatSignedPercent(speed.changePct)}), a verifier avec la charge recente et la recuperation.`,
        );
      } else {
        notes.push(
          `${speedLabel.charAt(0).toUpperCase()}${speedLabel.slice(1)} reste globalement stable sur les sessions similaires.`,
        );
      }
    }

    if (hr.changePct !== null && speed.changePct !== null) {
      if (
        (speedIsPace ? speed.changePct < 0 : speed.changePct > 0) &&
        hr.changePct <= 0
      ) {
        notes.push(
          'Le couple vitesse/FC va dans le bon sens: meilleur rendement cardio a effort comparable.',
        );
      } else if (
        (speedIsPace ? speed.changePct > 0 : speed.changePct < 0) &&
        hr.changePct > 0
      ) {
        notes.push(
          'Le couple vitesse/FC se degrade: plus de FC pour moins de vitesse.',
        );
      }
    }

    if (cadence.rho !== null) {
      if (cadence.rho >= 0.25) {
        notes.push(
          'La cadence suit une tendance haussiere moderee dans les sessions retenues.',
        );
      } else if (cadence.rho <= -0.25) {
        notes.push(
          'La cadence suit une tendance baissiere; utile de verifier technique et fatigue.',
        );
      }
    }

    if (intensity.changePct !== null && Math.abs(intensity.changePct) > 5) {
      notes.push(
        `L'intensite proxy varie de ${formatSignedPercent(intensity.changePct)} entre debut et recent.`,
      );
    }

    if (historicalComparison.thresholdDistance !== null) {
      notes.push(
        `Filtre auto: sessions conservees avec distance normalisee <= ${historicalComparison.thresholdDistance.toFixed(2)}.`,
      );
    }

    if (notes.length === 0) {
      notes.push('Pas assez de signal pour une interpretation robuste.');
    }

    return notes;
  }, [historicalComparison, historicalMetrics, unitPreferences.speedUnit]);

  const progressRadar = useMemo(() => {
    if (!historicalComparison || selectedTypeSessions.length < 6) {
      return null;
    }

    const rows = historicalComparison.rows;
    const speedIsPace =
      unitPreferences.speedUnit === 'pace_km' ||
      unitPreferences.speedUnit === 'pace_mi';

    const poolDuration = selectedTypeSessions.map(
      (session) => session.durationMin,
    );
    const rowDuration = rows.map((row) => row.session.durationMin);
    const enduranceScore = percentileScore(
      poolDuration,
      mean(rowDuration),
      true,
    );

    const mapSpeedMetric = (value: number) =>
      speedIsPace ? convertSpeedKmh(value, unitPreferences.speedUnit) : value;
    const poolSpeed = selectedTypeSessions
      .map((session) => session.speedKmh)
      .filter((value): value is number => value !== null)
      .map(mapSpeedMetric);
    const rowSpeed = rows
      .map((row) => row.session.speedKmh)
      .filter((value): value is number => value !== null)
      .map(mapSpeedMetric);
    const speedScore = percentileScore(poolSpeed, mean(rowSpeed), !speedIsPace);

    const poolEfficiency = selectedTypeSessions
      .map((session) =>
        session.speedKmh !== null && session.hr !== null && session.hr > 0 ?
          session.speedKmh / session.hr
        : null,
      )
      .filter((value): value is number => value !== null);
    const rowEfficiency = rows
      .map((row) =>
        (
          row.session.speedKmh !== null &&
          row.session.hr !== null &&
          row.session.hr > 0
        ) ?
          row.session.speedKmh / row.session.hr
        : null,
      )
      .filter((value): value is number => value !== null);
    const cardioScore = percentileScore(
      poolEfficiency,
      mean(rowEfficiency),
      true,
    );

    const poolCadence = selectedTypeSessions
      .map((session) => session.cadence)
      .filter((value): value is number => value !== null)
      .map((value) => convertCadenceRpm(value, unitPreferences.cadenceUnit));
    const rowCadence = rows
      .map((row) => row.session.cadence)
      .filter((value): value is number => value !== null)
      .map((value) => convertCadenceRpm(value, unitPreferences.cadenceUnit));
    const cadenceScore = percentileScore(poolCadence, mean(rowCadence), true);

    const rowSpeedSteps = meanAbsStep(rowSpeed);
    const windowSize = Math.max(4, Math.min(10, rowSpeed.length));
    const poolSpeedChrono = [...selectedTypeSessions]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((session) => session.speedKmh)
      .filter((value): value is number => value !== null)
      .map(mapSpeedMetric);
    const poolStepDistribution: number[] = [];
    if (poolSpeedChrono.length >= windowSize) {
      for (let i = 0; i + windowSize <= poolSpeedChrono.length; i += 1) {
        const stepValue = meanAbsStep(poolSpeedChrono.slice(i, i + windowSize));
        if (stepValue !== null) {
          poolStepDistribution.push(stepValue);
        }
      }
    }
    const consistencyScore =
      rowSpeedSteps === null ? null : (
        percentileScore(poolStepDistribution, rowSpeedSteps, false)
      );

    const freshnessScore =
      todayLoadSummary ?
        clamp(((todayLoadSummary.fraicheur + 25) / 50) * 100, 0, 100)
      : clamp(historicalComparison.reliability, 0, 100);

    const metrics = [
      { name: 'Endurance', value: clamp(enduranceScore ?? 50, 0, 100) },
      {
        name: speedIsPace ? 'Allure' : 'Vitesse',
        value: clamp(speedScore ?? 50, 0, 100),
      },
      { name: 'Efficacite cardio', value: clamp(cardioScore ?? 50, 0, 100) },
      { name: 'Cadence', value: clamp(cadenceScore ?? 50, 0, 100) },
      { name: 'Regularite', value: clamp(consistencyScore ?? 50, 0, 100) },
      { name: 'Fraicheur', value: clamp(freshnessScore, 0, 100) },
    ];

    return {
      metrics,
      option: buildCompetencyRadarOption(metrics, 'Profil actuel'),
    };
  }, [
    historicalComparison,
    selectedTypeSessions,
    todayLoadSummary,
    unitPreferences.cadenceUnit,
    unitPreferences.speedUnit,
  ]);

  const historicalSimilarityOption = useMemo(() => {
    if (!historicalComparison) {
      return {
        title: {
          text: 'Sessions similaires',
          left: 0,
          textStyle: { fontSize: 12, fontWeight: 600 },
        },
      };
    }

    const points = historicalComparison.rows
      .map((row) => {
        if (row.session.hr === null || row.session.speedKmh === null) {
          return null;
        }

        const isReference =
          row.session.id === historicalComparison.reference.id;
        return {
          value: [
            Number(row.session.hr.toFixed(1)),
            Number(
              convertSpeedKmh(
                row.session.speedKmh,
                unitPreferences.speedUnit,
              ).toFixed(2),
            ),
            Number(row.similarity.toFixed(4)),
            Number(row.session.durationMin.toFixed(1)),
          ],
          name: row.session.activity.name,
          date: row.session.day,
          activityId: row.session.activity.id,
          isReference,
          symbol: isReference ? 'diamond' : 'circle',
          itemStyle:
            isReference ?
              {
                color: '#111827',
                borderColor: '#f59e0b',
                borderWidth: 2,
              }
            : undefined,
        };
      })
      .filter((point): point is NonNullable<typeof point> => point !== null);

    if (points.length === 0) {
      return {
        title: {
          text: `Sessions similaires: FC vs ${unitPreferences.speedUnit === 'kmh' ? 'vitesse' : 'allure'}`,
          left: 0,
          textStyle: { fontSize: 12, fontWeight: 600 },
        },
      };
    }

    const xValues = points.map((point) => point.value[0]);
    const yValues = points.map((point) => point.value[1]);
    const xMinRaw = quantile(xValues, 0.05) ?? Math.min(...xValues);
    const xMaxRaw = quantile(xValues, 0.95) ?? Math.max(...xValues);
    const yMinRaw = quantile(yValues, 0.05) ?? Math.min(...yValues);
    const yMaxRaw = quantile(yValues, 0.95) ?? Math.max(...yValues);
    const xPad = Math.max(0.5, (xMaxRaw - xMinRaw) * 0.1);
    const yPad = Math.max(0.2, (yMaxRaw - yMinRaw) * 0.1);
    const xMin = xMinRaw - xPad;
    const xMax = xMaxRaw + xPad;
    const yMin = yMinRaw - yPad;
    const yMax = yMaxRaw + yPad;

    return {
      title: {
        text: 'Sessions similaires: FC vs vitesse',
        left: 0,
        textStyle: { fontSize: 12, fontWeight: 600 },
      },
      tooltip: {
        formatter: (params: {
          data?: {
            name?: string;
            date?: string;
            value?: number[];
            isReference?: boolean;
          };
        }) => {
          const point = params.data;
          if (!point?.value) {
            return 'n/a';
          }
          const refTag = point.isReference ? ' (reference)' : '';
          return `${point.name ?? 'Session'}${refTag}<br/>${point.date ?? ''}<br/>FC: ${point.value[0]} bpm<br/>${
            unitPreferences.speedUnit === 'kmh' ? 'Vitesse' : 'Allure'
          }: ${formatSpeedAxisValue(point.value[1], unitPreferences, 2)} ${speedUnitLabel(
            unitPreferences.speedUnit,
          )}<br/>Similarite: ${point.value[2].toFixed(2)}`;
        },
      },
      grid: { top: 44, left: 56, right: 56, bottom: 72 },
      xAxis: {
        type: 'value',
        name: 'FC moyenne (bpm)',
        scale: true,
        min: xMin,
        max: xMax,
      },
      yAxis: {
        type: 'value',
        name: `${unitPreferences.speedUnit === 'kmh' ? 'Vitesse moyenne' : 'Allure moyenne'} (${speedUnitLabel(unitPreferences.speedUnit)})`,
        scale: true,
        min: yMin,
        max: yMax,
        axisLabel: {
          formatter: (value: number) =>
            formatSpeedAxisValue(value, unitPreferences),
        },
      },
      visualMap: {
        type: 'continuous',
        min: 0,
        max: 1,
        dimension: 2,
        right: 0,
        top: 10,
        text: ['similaire', 'eloigne'],
        inRange: {
          color: ['#fee2e2', '#f59e0b', '#10b981'],
        },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
        { type: 'inside', yAxisIndex: 0, filterMode: 'none' },
        { type: 'slider', xAxisIndex: 0, bottom: 10, height: 12 },
        { type: 'slider', yAxisIndex: 0, right: 8, width: 12 },
      ],
      series: [
        {
          type: 'scatter',
          data: points,
          symbolSize: (value: number[]) =>
            clamp(Math.sqrt(value[3]) * 2.8, 8, 26),
        },
      ],
    };
  }, [historicalComparison, unitPreferences]);

  const historicalEvolutionOption = useMemo(() => {
    if (!historicalComparison) {
      return {
        title: {
          text: 'Evolution indexee (base 100)',
          left: 0,
          textStyle: { fontSize: 12, fontWeight: 600 },
        },
      };
    }

    const categories = historicalComparison.rows.map((row) => row.session.day);
    const buildSeries = (
      name: string,
      color: string,
      accessor: (session: HistoricalSession) => number | null,
    ) => {
      const baseline = historicalComparison.rows
        .map((row) => accessor(row.session))
        .find((value): value is number => value !== null && value > 0);
      const data = historicalComparison.rows.map((row) => {
        const value = accessor(row.session);
        if (value === null || baseline === undefined || baseline === 0) {
          return null;
        }
        return Number(((value / baseline) * 100).toFixed(2));
      });

      return {
        name,
        type: 'line',
        smooth: true,
        connectNulls: false,
        data,
        lineStyle: { color, width: 2 },
        itemStyle: { color },
      };
    };

    const series = [
      buildSeries(
        unitPreferences.speedUnit === 'kmh' ? 'Vitesse' : 'Allure',
        '#2563eb',
        (session) =>
          session.speedKmh === null ?
            null
          : convertSpeedKmh(session.speedKmh, unitPreferences.speedUnit),
      ),
      buildSeries('FC', '#dc2626', (session) => session.hr),
      buildSeries('Cadence', '#0d9488', (session) =>
        session.cadence === null ?
          null
        : convertCadenceRpm(session.cadence, unitPreferences.cadenceUnit),
      ),
      buildSeries('Intensite', '#7c3aed', (session) => session.intensityProxy),
    ].filter((serie) => serie.data.some((value) => value !== null));

    return {
      title: {
        text: 'Evolution comparee (base 100)',
        left: 0,
        textStyle: { fontSize: 12, fontWeight: 600 },
      },
      tooltip: { trigger: 'axis' },
      legend: { data: series.map((serie) => serie.name), top: 18 },
      grid: { top: 58, left: 56, right: 18, bottom: 60 },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: { rotate: 25 },
      },
      yAxis: {
        type: 'value',
        name: 'Index',
      },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 12, bottom: 8 }],
      series,
    };
  }, [
    historicalComparison,
    unitPreferences.cadenceUnit,
    unitPreferences.speedUnit,
  ]);

  const historicalMainMetricMeta = useMemo(() => {
    const map: Record<
      HistoricalMainMetric,
      {
        label: string;
        unit: string;
        color: string;
        accessor: (session: HistoricalSession) => number | null;
      }
    > = {
      speedKmh: {
        label: unitPreferences.speedUnit === 'kmh' ? 'Vitesse' : 'Allure',
        unit: speedUnitLabel(unitPreferences.speedUnit),
        color: '#2563eb',
        accessor: (session) =>
          session.speedKmh === null ?
            null
          : convertSpeedKmh(session.speedKmh, unitPreferences.speedUnit),
      },
      hr: {
        label: 'FC',
        unit: 'bpm',
        color: '#dc2626',
        accessor: (session) => session.hr,
      },
      cadence: {
        label: 'Cadence',
        unit: cadenceUnitLabel(unitPreferences.cadenceUnit),
        color: '#0d9488',
        accessor: (session) =>
          session.cadence === null ?
            null
          : convertCadenceRpm(session.cadence, unitPreferences.cadenceUnit),
      },
      intensityProxy: {
        label: 'Intensite',
        unit: 'a.u.',
        color: '#7c3aed',
        accessor: (session) => session.intensityProxy,
      },
    };

    return map[historicalMainMetric];
  }, [
    historicalMainMetric,
    unitPreferences.cadenceUnit,
    unitPreferences.speedUnit,
  ]);

  const historicalSimpleOption = useMemo(() => {
    if (!historicalComparison) {
      return {
        title: {
          text: 'Evolution simple',
          left: 0,
          textStyle: { fontSize: 12, fontWeight: 600 },
        },
      };
    }

    const categories = historicalComparison.rows.map((row) => row.session.day);
    const values = historicalComparison.rows.map((row) => {
      const value = historicalMainMetricMeta.accessor(row.session);
      return value === null ? null : Number(value.toFixed(2));
    });

    const regressionPoints = historicalComparison.rows
      .map((row, index) => {
        const value = historicalMainMetricMeta.accessor(row.session);
        return value === null ? null : { x: index + 1, y: value };
      })
      .filter((point): point is { x: number; y: number } => point !== null);

    const regression =
      regressionPoints.length >= 2 ?
        linearRegression(
          regressionPoints.map((point) => point.x),
          regressionPoints.map((point) => point.y),
        )
      : null;

    const trendData = historicalComparison.rows.map((_, index) => {
      if (!regression) {
        return null;
      }
      return Number(
        (regression.slope * (index + 1) + regression.intercept).toFixed(2),
      );
    });

    return {
      title: {
        text: `${historicalMainMetricMeta.label}: evolution simple`,
        left: 0,
        textStyle: { fontSize: 12, fontWeight: 600 },
      },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: number) =>
          `${value.toFixed(2)} ${historicalMainMetricMeta.unit}`,
      },
      legend: { data: [historicalMainMetricMeta.label, 'Tendance'], top: 18 },
      grid: { top: 56, left: 56, right: 18, bottom: 62 },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: { rotate: 30 },
      },
      yAxis: {
        type: 'value',
        name: historicalMainMetricMeta.unit,
        scale: true,
        axisLabel: {
          formatter: (value: number) =>
            historicalMainMetric === 'speedKmh' ?
              formatSpeedAxisValue(value, unitPreferences)
            : `${value}`,
        },
      },
      dataZoom: [
        { type: 'inside' },
        { type: 'slider', height: 12, bottom: 10 },
      ],
      series: [
        {
          name: historicalMainMetricMeta.label,
          type: 'line',
          smooth: true,
          connectNulls: false,
          data: values,
          lineStyle: { color: historicalMainMetricMeta.color, width: 2 },
          itemStyle: { color: historicalMainMetricMeta.color },
        },
        {
          name: 'Tendance',
          type: 'line',
          smooth: false,
          showSymbol: false,
          connectNulls: true,
          data: trendData,
          lineStyle: { color: '#111827', width: 1.5, type: 'dashed' },
          itemStyle: { color: '#111827' },
        },
      ],
    };
  }, [
    historicalComparison,
    historicalMainMetric,
    historicalMainMetricMeta,
    unitPreferences,
  ]);

  const historicalActivityById = useMemo(() => {
    const map = new Map<string, Activity>();
    for (const activity of historicalActivities) {
      map.set(activity.id, activity);
    }
    return map;
  }, [historicalActivities]);

  const openHistoricalActivity = (activityId: string | undefined) => {
    if (!activityId) {
      return;
    }
    const activity = historicalActivityById.get(activityId);
    if (activity) {
      setSelectedActivity(activity);
    }
  };

  const fetchActivityForBucket = async (
    metric: TrendMetric,
    bucket: string,
  ) => {
    if (!token) {
      return;
    }

    const sortMap: Record<TrendMetric, string> = {
      distance: 'distance',
      time: 'movingTime',
      elev: 'totalElevationGain',
      avgHR: 'averageHeartrate',
      maxHR: 'maxHeartrate',
      avgSpeed: 'averageSpeed',
      maxSpeed: 'maxSpeed',
      avgWatts: 'averageWatts',
      maxWatts: 'maxWatts',
      cadence: 'averageCadence',
      strideLength: 'strideLength',
      groundContactTime: 'groundContactTime',
      verticalOscillation: 'verticalOscillation',
      kilojoules: 'kilojoules',
      calories: 'calories',
      sufferScore: 'sufferScore',
    };

    const range = bucketRange(bucket, trendBucket as TimeBucket);
    const params = new URLSearchParams();
    params.set('localFrom', range.localFrom);
    params.set('localTo', range.localTo);
    params.set('limit', '1');
    params.set('offset', '0');
    params.set('sort', `${sortMap[metric]}:desc`);

    try {
      const res = await apiRequest<ActivityListResponse>(
        `/activities?${params.toString()}`,
        { token },
      );
      if (res.items[0]) {
        setSelectedActivity(res.items[0]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de charger l'activite",
      );
    }
  };

  const handleTrendClick = (metric: TrendMetric, bucket: string) => {
    fetchActivityForBucket(metric, bucket);
  };

  const handleCalendarClick = (day: string) => {
    if (!token) {
      return;
    }

    const range = bucketRange(day, 'day');
    const params = new URLSearchParams();
    params.set('localFrom', range.localFrom);
    params.set('localTo', range.localTo);
    params.set('limit', '1');
    params.set('offset', '0');
    params.set('sort', 'distance:desc');

    apiRequest<ActivityListResponse>(
      appendFilters(`/activities?${params.toString()}`, baseQuery),
      { token },
    )
      .then((res) => {
        if (res.items[0]) {
          setSelectedActivity(res.items[0]);
        }
      })
      .catch((err) =>
        setError(
          err instanceof Error ?
            err.message
          : "Impossible de charger l'activite",
        ),
      );
  };

  const pivotMetrics = pivotData?.metrics ?? [];
  const pivotRows = pivotData?.rows ?? [];
  const historicalRowsForTable = (historicalComparison?.rows ?? [])
    .slice()
    .sort((a, b) => b.similarity - a.similarity);
  const referenceId = historicalComparison?.reference.id ?? null;
  const hasLoadSeries = (loadData?.series.length ?? 0) > 0;
  const hasSkillsRadarData =
    skillsRadar.option !== null && skillsRadar.metrics.length > 0;
  const hasReferenceTimesData =
    referenceTimes.runCount > 0 &&
    referenceTimes.option !== null &&
    referenceTimes.estimates.some((row) => row.estimatedSec !== null);
  const hasHeartRateZonesData =
    heartRateZonesSummary.hrMax !== null &&
    activeHeartRateZonesView.sampleSize > 0 &&
    activeHeartRateZonesView.rows.some((zone) => zone.pct !== null);
  const hasHeatmapData = (dailyDistance?.series.length ?? 0) > 0;
  const hasTrendData = trendMetrics.some(
    (metricDef) => (trendByMetric[metricDef.metric]?.series.length ?? 0) > 0,
  );
  const hasDistributionData = distributionMetrics.some((metricDef) => {
    const metricDistribution = distributionByMetric[metricDef.metric];
    return (
      (metricDistribution?.sampleSize ?? 0) > 0 &&
      (metricDistribution?.bins.length ?? 0) > 0
    );
  });
  const hasPivotData = pivotRows.length > 0 && pivotMetrics.length > 0;
  const hasHistoricalSynthesisData = historicalMetrics.some(
    (metric) => metric.first !== null && metric.recent !== null,
  );
  const hasHistoricalSkillsData =
    progressRadar !== null && progressRadar.metrics.length > 0;
  const hasHistoricalSimpleData =
    historicalComparison !== null &&
    historicalComparison.rows.some(
      (row) => historicalMainMetricMeta.accessor(row.session) !== null,
    );
  const hasHistoricalMapData =
    historicalComparison !== null &&
    historicalComparison.rows.some(
      (row) => row.session.hr !== null && row.session.speedKmh !== null,
    );
  const hasHistoricalEvolutionData =
    historicalComparison !== null &&
    historicalComparison.rows.some(
      (row) =>
        row.session.speedKmh !== null ||
        row.session.hr !== null ||
        row.session.cadence !== null ||
        row.session.intensityProxy !== null,
    );
  const hasHistoricalNarrativeData =
    historicalNarrative.length > 1 ||
    (historicalNarrative[0] !== undefined &&
      historicalNarrative[0] !== 'Pas assez de signal pour une interpretation robuste.');
  const hasHistoricalSessionsData = historicalRowsForTable.length > 0;
  const historicalMetricHintByLabel: Record<
    string,
    { description: string; linkHref: string; linkLabel: string }
  > = {
    Vitesse: {
      description:
        'Tendance estimee par regression lineaire sur sessions proches. Le changement debut vs recent utilise la moyenne de premiers/derniers tiers.',
      linkHref: 'https://en.wikipedia.org/wiki/Linear_regression',
      linkLabel: 'Methode: linear regression',
    },
    Allure: {
      description:
        'Tendance estimee par regression lineaire sur sessions proches. Le changement debut vs recent utilise la moyenne de premiers/derniers tiers.',
      linkHref: 'https://en.wikipedia.org/wiki/Linear_regression',
      linkLabel: 'Methode: linear regression',
    },
    FC: {
      description:
        'Trend monotone mesure avec rho de Spearman, robuste aux non-linearites. Permet de suivre la derive cardio sur sessions comparables.',
      linkHref:
        'https://en.wikipedia.org/wiki/Spearman%27s_rank_correlation_coefficient',
      linkLabel: 'Methode: Spearman rho',
    },
    Cadence: {
      description:
        "Cadence comparee sur les memes profils de sortie. La taille d'effet (Cohen d) quantifie l'ampleur du changement recent.",
      linkHref: "https://en.wikipedia.org/wiki/Effect_size#Cohen's_d",
      linkLabel: 'Methode: Cohen d',
    },
    Intensite: {
      description:
        "Indice intensite proxy = (FC / FCmax) * duree. Sert de repere relatif d'effort quand puissance normalisee n'est pas disponible.",
      linkHref: 'https://en.wikipedia.org/wiki/Heart_rate#Exercise',
      linkLabel: 'Principe: FC relative',
    },
  };

  const analyticsAiBaseContext = useMemo(
    () => ({
      view: activeView,
      filters: {
        q: filters.q || null,
        from: filters.from || null,
        to: filters.to || null,
        type: filters.type || null,
      },
      profile: {
        hrMax: user?.hrMax ?? null,
        age: user?.age ?? null,
        weightKg: user?.weightKg ?? null,
        heightCm: user?.heightCm ?? null,
      },
      units: {
        speed: unitPreferences.speedUnit,
        distance: unitPreferences.distanceUnit,
        elevation: unitPreferences.elevationUnit,
        cadence: unitPreferences.cadenceUnit,
      },
      summary:
        summaryData ?
          {
            count: summaryData.count,
            totalDistanceKm: summaryData.totalDistanceKm,
            totalMovingTimeHours: summaryData.totalMovingTimeHours,
            totalElevationGain: summaryData.totalElevationGain,
            totalCalories: summaryData.totalCalories,
            avgHeartrate: summaryData.avgHeartrate,
            avgSpeedKmh: summaryData.avgSpeedKmh,
            avgCadence: summaryData.avgCadence,
          }
        : null,
      historical:
        historicalComparison ?
          {
            poolSize: historicalComparison.poolSize,
            rows: historicalComparison.rows.length,
            reliability: historicalComparison.reliability,
            spanDays: historicalComparison.spanDays,
            type: resolvedHistoricalType,
          }
        : null,
      comparators: {
        intraAthleteHistory: true,
        externalAthleteDatasetAvailable: false,
      },
    }),
    [
      activeView,
      filters.q,
      filters.from,
      filters.to,
      filters.type,
      user?.hrMax,
      user?.age,
      user?.weightKg,
      user?.heightCm,
      unitPreferences.speedUnit,
      unitPreferences.distanceUnit,
      unitPreferences.elevationUnit,
      unitPreferences.cadenceUnit,
      summaryData,
      historicalComparison,
      resolvedHistoricalType,
    ],
  );

  const buildAiInsight = (
    sectionKey: string,
    sectionTitle: string,
    sectionSubtitle: string,
    extraContext: Record<string, unknown> = {},
  ) => ({
    token,
    payload: {
      page: 'analytics_lab',
      sectionKey,
      sectionTitle,
      sectionSubtitle,
      question:
        "Agis comme un expert en sciences du sport et analyste de performance de haut niveau. Analyse les données de cette section avec une rigueur mathématique et scientifique sourcé par des documents prouvé et des thèses avec une neutralité absolue. Ton objectif est de produire un audit de performance et un rapport détaillé sans aucune complaisance (zéro 'sugar-coating') compare mes métriques aux autres athlètes similaires.",
      context: {
        ...analyticsAiBaseContext,
        ...extraContext,
      },
    },
  });

  return (
    <div className='min-w-0 overflow-x-clip'>
      <PageHeader
        description='Analyse organisee par themes: sante, pronostic, charge, performance et progres.'
        title='Analyse'
      />

      <div className='mb-4 flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-black/15 bg-black/[0.03] p-1'>
        <button
          className={`inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm ${activeView === 'lab' ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'}`}
          onClick={() => setActiveView('lab')}
          type='button'
        >
          Analyse
        </button>
        <button
          className={`inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm ${activeView === 'historical' ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'}`}
          onClick={() => setActiveView('historical')}
          type='button'
        >
          Progres
        </button>
        <button
          className={`inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm ${activeView === 'correlations' ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'}`}
          onClick={() => setActiveView('correlations')}
          type='button'
        >
          Correlations
        </button>
      </div>

      {activeView === 'lab' ? (
        <div className='mb-4 flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-black/15 bg-black/[0.03] p-1'>
          {(
            [
              { key: 'health', label: 'Sante' },
              { key: 'forecast', label: 'Pronostic' },
              { key: 'load', label: 'Charge' },
              { key: 'performance', label: 'Performance' },
              { key: 'profile', label: 'Profil' },
            ] as Array<{ key: LabTheme; label: string }>
          ).map((theme) => (
            <button
              key={theme.key}
              className={`inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs ${labTheme === theme.key ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'}`}
              onClick={() => setLabTheme(theme.key)}
              type='button'
            >
              {theme.label}
            </button>
          ))}
        </div>
      ) : null}

      {activeView === 'historical' ? (
        <div className='mb-4 flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-black/15 bg-black/[0.03] p-1'>
          {(
            [
              { key: 'insights', label: 'Configuration + signaux' },
              { key: 'advanced', label: 'Avance' },
              { key: 'report', label: 'Rapport' },
            ] as Array<{ key: HistoricalTheme; label: string }>
          ).map((theme) => (
            <button
              key={theme.key}
              className={`inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs ${historicalTheme === theme.key ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'}`}
              onClick={() => setHistoricalTheme(theme.key)}
              type='button'
            >
              {theme.label}
            </button>
          ))}
        </div>
      ) : null}

      {activeView !== 'correlations' ? <Card>
        <SectionHeader
          title='Filtres analytiques'
          subtitle="Recherche, periode, type d'activite et contraintes avancees."
          aiInsight={buildAiInsight(
            'globalFilters',
            'Filtres analytiques',
            "Recherche, periode, type d'activite et contraintes avancees.",
            {
              activeView,
              trendBucket,
              distributionBins,
              pivotRow,
              fullFilters: effectiveFilters,
            },
          )}
          collapsed={collapsedSections.globalFilters}
          onToggleCollapse={() => toggleSection('globalFilters')}
        />
        {collapsedSections.globalFilters ?
          <p className='text-[11px] text-muted/80'>Filtres masques.</p>
        : <>
            <div
              className={`grid gap-3 ${activeView === 'lab' ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6' : 'sm:grid-cols-2 lg:grid-cols-4'}`}
            >
              <label className='grid content-start gap-1 text-xs text-muted'>
                <span className='min-h-[1rem]'>Recherche activite</span>
                <input
                  className={inputClass}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, q: event.target.value }))
                  }
                  placeholder='Rechercher...'
                  value={filters.q ?? ''}
                />
              </label>
              <label className='grid content-start gap-1 text-xs text-muted'>
                <span className='min-h-[1rem]'>Date debut</span>
                <input
                  className={inputClass}
                  min={filterDateMin}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      from: event.target.value,
                    }))
                  }
                  type='date'
                  value={filters.from ?? ''}
                />
              </label>
              <label className='grid content-start gap-1 text-xs text-muted'>
                <span className='min-h-[1rem]'>Date fin</span>
                <input
                  className={inputClass}
                  min={filters.from || filterDateMin}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, to: event.target.value }))
                  }
                  type='date'
                  value={filters.to ?? ''}
                />
              </label>
              <label className='grid content-start gap-1 text-xs text-muted'>
                <span className='min-h-[1rem]'>Type d&apos;activite</span>
                <input
                  className={inputClass}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      type: event.target.value,
                    }))
                  }
                  placeholder='Run, Ride...'
                  value={filters.type ?? ''}
                />
              </label>
              {activeView === 'lab' ?
                <label className='grid content-start gap-1 text-xs text-muted'>
                  <span className='min-h-[1rem]'>Periode graphiques</span>
                  <select
                    className={selectClass}
                    onChange={(event) => setTrendBucket(event.target.value)}
                    value={trendBucket}
                  >
                    <option value='day'>Jour</option>
                    <option value='week'>Semaine</option>
                    <option value='month'>Mois</option>
                  </select>
                </label>
              : null}
            </div>
            <p className='mt-2 text-xs text-muted'>
              Par defaut, les analyses utilisent toutes les activites depuis la
              premiere session
              {earliestActivityDate ? ` (${earliestActivityDate})` : ''}. Les
              champs date manuels commencent au minimum au 1er janvier{' '}
              {currentYear}.
            </p>
            <details className='mt-3 rounded-lg border border-black/10 bg-black/[0.03] p-2.5'>
              <summary className='cursor-pointer text-[11px] uppercase tracking-wide text-muted'>
                Plus de filtres
              </summary>
              <div className='mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                <label className='grid gap-1 text-xs text-muted'>
                  Distance min (km)
                  <input
                    className={inputClass}
                    placeholder='ex: 5'
                    value={filters.minDistanceKm ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        minDistanceKm: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  Distance max (km)
                  <input
                    className={inputClass}
                    placeholder='ex: 30'
                    value={filters.maxDistanceKm ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        maxDistanceKm: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  Temps min (min)
                  <input
                    className={inputClass}
                    placeholder='ex: 30'
                    value={filters.minTimeMin ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        minTimeMin: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  Temps max (min)
                  <input
                    className={inputClass}
                    placeholder='ex: 180'
                    value={filters.maxTimeMin ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        maxTimeMin: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  D+ min (m)
                  <input
                    className={inputClass}
                    placeholder='ex: 0'
                    value={filters.minElev ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        minElev: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  D+ max (m)
                  <input
                    className={inputClass}
                    placeholder='ex: 800'
                    value={filters.maxElev ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        maxElev: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  FC moyenne min (bpm)
                  <input
                    className={inputClass}
                    placeholder='ex: 120'
                    value={filters.minAvgHR ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        minAvgHR: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  FC moyenne max (bpm)
                  <input
                    className={inputClass}
                    placeholder='ex: 180'
                    value={filters.maxAvgHR ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        maxAvgHR: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  Vitesse moyenne min (km/h)
                  <input
                    className={inputClass}
                    placeholder='ex: 8'
                    value={filters.minAvgSpeedKmh ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        minAvgSpeedKmh: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  Vitesse moyenne max (km/h)
                  <input
                    className={inputClass}
                    placeholder='ex: 16'
                    value={filters.maxAvgSpeedKmh ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        maxAvgSpeedKmh: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  Watts moyens min (W)
                  <input
                    className={inputClass}
                    placeholder='ex: 120'
                    value={filters.minAvgWatts ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        minAvgWatts: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  Watts moyens max (W)
                  <input
                    className={inputClass}
                    placeholder='ex: 320'
                    value={filters.maxAvgWatts ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        maxAvgWatts: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  Cadence min
                  <input
                    className={inputClass}
                    placeholder='ex: 75'
                    value={filters.minCadence ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        minCadence: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  Cadence max
                  <input
                    className={inputClass}
                    placeholder='ex: 95'
                    value={filters.maxCadence ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        maxCadence: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  Calories min (kcal)
                  <input
                    className={inputClass}
                    placeholder='ex: 200'
                    value={filters.minCalories ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        minCalories: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  Calories max (kcal)
                  <input
                    className={inputClass}
                    placeholder='ex: 1500'
                    value={filters.maxCalories ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        maxCalories: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  Energie min (kJ)
                  <input
                    className={inputClass}
                    placeholder='ex: 200'
                    value={filters.minKilojoules ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        minKilojoules: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className='grid gap-1 text-xs text-muted'>
                  Energie max (kJ)
                  <input
                    className={inputClass}
                    placeholder='ex: 3000'
                    value={filters.maxKilojoules ?? ''}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        maxKilojoules: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            </details>
          </>
        }
      </Card> : null}

      {error ?
        <p className='mt-4 text-sm text-red-700'>{error}</p>
      : null}

      {activeView === 'lab' ?
        <div className='mt-6 grid gap-6'>
          {labTheme === 'health' && summaryData ?
            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-5'>
              <StatCard
                label='Activites'
                value={number(summaryData.count, 0)}
              />
              <StatCard
                label='Distance totale'
                value={formatDistanceFromKm(
                  summaryData.totalDistanceKm,
                  unitPreferences,
                  1,
                )}
              />
              <StatCard
                label='Temps total'
                value={`${number(summaryData.totalMovingTimeHours, 1)} h`}
              />
              <StatCard
                label='D+ total'
                value={formatElevationFromMeters(
                  summaryData.totalElevationGain,
                  unitPreferences,
                  0,
                )}
              />
              <StatCard
                label='Calories totales'
                value={`${number(summaryData.totalCalories, 0)} kcal`}
              />
              <StatCard
                label='Energie totale'
                value={`${number(summaryData.totalKilojoules, 0)} kJ`}
              />
              <StatCard
                label='FC moyenne'
                value={
                  summaryData.avgHeartrate === null ?
                    'n/a'
                  : `${number(summaryData.avgHeartrate, 0)} bpm`
                }
              />
              <StatCard
                label='Vitesse moyenne'
                value={
                  summaryData.avgSpeedKmh === null ?
                    'n/a'
                  : formatSpeedFromKmh(summaryData.avgSpeedKmh, unitPreferences)
                }
              />
              <StatCard
                label='Watts moyens'
                value={
                  summaryData.avgWatts === null ?
                    'n/a'
                  : `${number(summaryData.avgWatts, 0)} W`
                }
              />
              <StatCard
                label='Cadence moyenne'
                value={
                  summaryData.avgCadence === null ?
                    'n/a'
                  : formatCadenceFromRpm(
                      summaryData.avgCadence,
                      unitPreferences,
                      0,
                    )
                }
              />
            </div>
          : null}

          {showLabSection('labToday') && todayLoadSummary ?
            <Card>
              <SectionHeader
                title='Etat du jour'
                subtitle="Forme, charge et fatigue pour aujourd'hui"
                infoHint={{
                  title: 'Etat du jour',
                  description:
                    'Lecture du jour basee sur CTL/ATL/TSB. Important: Charge, CTL et ATL sont des points de charge (pas des pourcentages), donc 83 = 83 points. Les ratios ATL/CTL et Charge/CTL sont sans unite: 1.00 = 100%, 1.30 = 130%. Modeles utilises: CTL (EMA 42j), ATL (EMA 7j), TSB = CTL - ATL. Intervalles pratiques: TSB >= +10 tres frais, +3 a +10 frais, -10 a +3 equilibre, -20 a -10 fatigue elevee, <= -20 surcharge probable. ATL/CTL: <= 0.80 faible fatigue, 0.81-1.05 fatigue controlee, 1.06-1.25 fatigue elevee, > 1.25 fatigue tres elevee. Charge/CTL: <= 0.60 legere, 0.61-1.10 cible, 1.11-1.60 soutenue, > 1.60 tres elevee.',
                  linkHref: 'https://pubmed.ncbi.nlm.nih.gov/24410871/',
                  linkLabel: 'Source: CTL/ATL/TSB et monitoring charge',
                }}
                aiInsight={buildAiInsight(
                  'labToday',
                  'Etat du jour',
                  "Forme, charge et fatigue pour aujourd'hui",
                  {
                    todayLoadSummary,
                    loadLatest:
                      loadData?.series?.[loadData.series.length - 1] ?? null,
                  },
                )}
                collapsed={collapsedSections.labToday}
                onToggleCollapse={() => toggleSection('labToday')}
              />
              {collapsedSections.labToday ?
                <p className='text-xs text-muted'>Section repliee.</p>
              : <>
                  <p className='mb-3 text-xs text-muted'>
                    {todayLoadSummary.isToday ?
                      'Lecture sur la date du jour.'
                    : `Pas de point exact aujourd'hui, dernier calcul disponible: ${todayLoadSummary.date}.`
                    }
                  </p>
                  <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-5'>
                    <StatCard
                      label='Charge du jour'
                      value={number(todayLoadSummary.charge, 1)}
                      statusLabel={todayLoadSummary.chargeStatus.label}
                      statusRange={todayLoadSummary.chargeStatus.range}
                      statusTone={todayLoadSummary.chargeStatus.tone}
                    />
                    <StatCard
                      label='Forme du jour (CTL)'
                      value={number(todayLoadSummary.forme, 1)}
                      statusLabel={todayLoadSummary.formeStatus.label}
                      statusRange={todayLoadSummary.formeStatus.range}
                      statusTone={todayLoadSummary.formeStatus.tone}
                    />
                    <StatCard
                      label='FATIGUE DU JOUR (ATL)'
                      value={number(todayLoadSummary.fatigue, 1)}
                      statusLabel={todayLoadSummary.fatigueStatus.label}
                      statusRange={todayLoadSummary.fatigueStatus.range}
                      statusTone={todayLoadSummary.fatigueStatus.tone}
                    />
                    <StatCard
                      label='Fraicheur (TSB)'
                      value={number(todayLoadSummary.fraicheur, 1)}
                      statusLabel={todayLoadSummary.fraicheurStatus.label}
                      statusRange={todayLoadSummary.fraicheurStatus.range}
                      statusTone={todayLoadSummary.fraicheurStatus.tone}
                    />
                    <StatCard
                      label='Etat'
                      value={todayLoadSummary.freshnessLabel}
                      statusLabel={todayLoadSummary.fraicheurStatus.label}
                      statusRange={todayLoadSummary.fraicheurStatus.range}
                      statusTone={todayLoadSummary.fraicheurStatus.tone}
                    />
                  </div>
                </>
              }
            </Card>
          : null}

          {showLabSection('labSkillsRadar') &&
          (skillsRadarLoading || skillsRadarError || hasSkillsRadarData) ?
            <Card>
              <SectionHeader
                title='Radar des competences'
                subtitle='Profil global base sur toutes les seances + objectif defini dans Parametres'
                infoHint={{
                  title: 'Radar des competences',
                  description:
                    "Le radar combine volume, specificite objectif, efficacite cardio, regularite, gestion de fatigue et technique. Calcul sur l'ensemble des seances course a pied disponibles.",
                  linkHref: 'https://pubmed.ncbi.nlm.nih.gov/30551042/',
                  linkLabel: 'Source: monitoring performance running',
                }}
                aiInsight={buildAiInsight(
                  'labSkillsRadar',
                  'Radar des competences',
                  'Profil global base sur toutes les seances + objectif',
                  {
                    skillsRadar: {
                      objective: skillsRadar.objectiveText,
                      runCount: skillsRadar.runCount,
                      metrics: skillsRadar.metrics.map((metric) => ({
                        name: metric.name,
                        value: Number(metric.value.toFixed(1)),
                        detail: metric.detail,
                      })),
                      inputs: skillsRadar.inputs,
                      basedOnAllSessions: true,
                    },
                  },
                )}
                collapsed={collapsedSections.labSkillsRadar}
                onToggleCollapse={() => toggleSection('labSkillsRadar')}
              />
              {collapsedSections.labSkillsRadar ?
                <p className='text-xs text-muted'>Section repliee.</p>
              : skillsRadarLoading ?
                <p className='text-xs text-muted'>
                  Chargement du radar sur toutes les seances...
                </p>
              : skillsRadarError ?
                <p className='text-xs text-red-700'>{skillsRadarError}</p>
              : <>
                  <p className='mb-3 break-words text-xs text-muted'>
                    {skillsRadar.objectiveText}
                  </p>
                  <ReactECharts
                    notMerge
                    option={skillsRadar.option!}
                    style={{ height: isMobile ? 360 : 320 }}
                  />
                  <div className='mt-3 grid gap-3 md:grid-cols-2'>
                    {skillsRadar.metrics.map((metric) => (
                      <div
                        key={`skill-radar-${metric.name}`}
                        className='rounded-lg border border-black/10 bg-black/[0.02] p-3'
                      >
                        <p className='break-words text-xs font-semibold uppercase tracking-wide text-muted'>
                          {metric.name}
                        </p>
                        <p className='mt-1 text-lg font-semibold'>
                          {number(metric.value, 0)}/100
                        </p>
                        <p className='mt-1 break-words text-xs text-muted'>
                          {metric.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              }
            </Card>
          : null}

          {showLabSection('labReferenceTimes') && hasReferenceTimesData ?
            <Card>
              <SectionHeader
                title='Temps de reference (hypothese)'
                subtitle='Estimation 5 km, 10 km, semi et marathon avec ancrage optimiste sur les meilleures perfs equivalentes recentes'
                infoHint={{
                  title: 'Temps de reference',
                  description:
                    "Estimation calculee sur un historique running elargi avec projection Riegel personnalisee et ancrage optimiste sur les meilleures seances equivalentes recentes (6 mois). Pour le marathon, l'estimation est aussi stabilisee via les semis/longues sorties recents.",
                  linkHref:
                    'https://en.wikipedia.org/wiki/Peter_Riegel#Riegel_formula',
                  linkLabel: 'Methode: formule de Riegel',
                }}
                aiInsight={buildAiInsight(
                  'labReferenceTimes',
                  'Temps de reference (hypothese)',
                  'Estimation actuelle 5 km, 10 km, semi et marathon',
                  {
                    referenceTimes: {
                      method:
                        'Personalized Riegel + optimistic best-equivalent recent anchor + marathon semi/long-run anchor',
                      runCount: referenceTimes.runCount,
                      spanDays: referenceTimes.spanDays,
                      oldestDay: referenceTimes.oldestDay,
                      latestDay: referenceTimes.latestDay,
                      estimates: referenceTimes.estimates.map((row) => ({
                        key: row.key,
                        label: row.label,
                        distanceKm: row.distanceKm,
                        estimatedSec: row.estimatedSec,
                        q25Sec: row.q25Sec,
                        q75Sec: row.q75Sec,
                        paceMinPerKm: row.paceMinPerKm,
                        speedKmh: row.speedKmh,
                        reliability: row.reliability,
                        supportRuns: row.supportRuns,
                        nearRuns: row.nearRuns,
                        recentNearRuns: row.recentNearRuns,
                      })),
                    },
                  },
                )}
                collapsed={collapsedSections.labReferenceTimes}
                onToggleCollapse={() => toggleSection('labReferenceTimes')}
              />
              {collapsedSections.labReferenceTimes ?
                <p className='text-xs text-muted'>Section repliee.</p>
              : <>
                  <p className='mb-3 text-xs text-muted'>
                    Hypothese sur {number(referenceTimes.runCount, 0)} courses
                    running exploitables
                    {referenceTimes.oldestDay && referenceTimes.latestDay ?
                      ` (${referenceTimes.oldestDay} -> ${referenceTimes.latestDay}).`
                    : '.'}
                  </p>
                  {referenceTimes.note ?
                    <p className='mb-3 text-xs text-amber-700'>
                      {referenceTimes.note}
                    </p>
                  : null}
                  <ReactECharts
                    notMerge
                    option={referenceTimes.option!}
                    style={{ height: 240 }}
                  />
                  <div className='mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
                    {referenceTimes.estimates.map((row) => (
                      <div
                        key={`reference-time-${row.key}`}
                        className='rounded-lg border border-black/10 bg-black/[0.02] p-3'
                      >
                        <p className='text-xs font-semibold uppercase tracking-wide text-muted'>
                          {row.label}
                        </p>
                        <p className='mt-1 text-lg font-semibold'>
                          {row.estimatedSec === null ?
                            'n/a'
                          : formatDuration(row.estimatedSec / 60)}
                        </p>
                        <p className='mt-1 text-xs text-muted'>
                          Allure/vitesse ref:{' '}
                          {row.speedKmh === null ?
                            'n/a'
                          : formatSpeedFromKmh(row.speedKmh, unitPreferences)}
                        </p>
                        <p className='mt-1 text-xs text-muted'>
                          Intervalle interquartile:{' '}
                          {row.q25Sec === null || row.q75Sec === null ?
                            'n/a'
                          : `${formatDuration(row.q25Sec / 60)} - ${formatDuration(row.q75Sec / 60)}`
                          }
                        </p>
                        <p className='mt-1 text-xs text-muted'>
                          Base: {number(row.supportRuns, 0)} seances projetees ·
                          proches: {number(row.nearRuns, 0)} · recentes proches:{' '}
                          {number(row.recentNearRuns, 0)}
                        </p>
                        <div className='mt-3'>
                          <ReliabilityGauge score={row.reliability} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              }
            </Card>
          : null}

          {showLabSection('labHrZones') && hasHeartRateZonesData ?
            <Card>
              <SectionHeader
                title='Zones cardiaques'
                subtitle='Repartition des activites en % de FC max (Z1 a Z5)'
                infoHint={{
                  title: 'Zones cardiaques',
                  description:
                    'Lecture basee sur la FC moyenne et la FC max des activites filtrees. Seuils utilises: Z1 < 70%, Z2 70-80%, Z3 80-87%, Z4 87-93%, Z5 >= 93% de FC max.',
                  linkHref:
                    'https://www.garmin.com/en-US/garmin-technology/running-science/physiological-measurements/heart-rate-zones/',
                  linkLabel: 'Source: zones FC',
                }}
                aiInsight={buildAiInsight(
                  'labHrZones',
                  'Zones cardiaques',
                  'Repartition des activites en % de FC max (Z1 a Z5)',
                  {
                    heartRateZones: {
                      hrMax: heartRateZonesSummary.hrMax,
                      selectedBasis: activeHeartRateZonesView.basis,
                      selectedBasisLabel: activeHeartRateZonesView.basisLabel,
                      avgSampleSize: heartRateZonesSummary.avgSampleSize,
                      maxSampleSize: heartRateZonesSummary.maxSampleSize,
                      dominantAvgZone: heartRateZonesSummary.dominantAvgZone,
                      dominantMaxZone: heartRateZonesSummary.dominantMaxZone,
                      rows: heartRateZonesSummary.zones.map((zone) => ({
                        zone: zone.zone,
                        label: zone.label,
                        range: zone.rangeLabel,
                        avgPct:
                          zone.avgPct === null ?
                            null
                          : Number(zone.avgPct.toFixed(1)),
                        maxPct:
                          zone.maxPct === null ?
                            null
                          : Number(zone.maxPct.toFixed(1)),
                      })),
                    },
                  },
                )}
                collapsed={collapsedSections.labHrZones}
                onToggleCollapse={() => toggleSection('labHrZones')}
              />
              {collapsedSections.labHrZones ?
                <p className='text-xs text-muted'>Section repliee.</p>
              : <>
                  <p className='mb-3 text-xs text-muted'>
                    FC max de reference:{' '}
                    {number(heartRateZonesSummary.hrMax, 0)} bpm. Repartition
                    estimee a partir des histogrammes FC des activites filtrees.
                    Choisis une seule lecture pour eviter les doublons visuels.
                  </p>
                  <div className='mb-3 inline-flex rounded-lg border border-black/15 bg-black/[0.03] p-1'>
                    <button
                      className={`rounded-md px-3 py-1.5 text-xs ${heartRateZoneBasis === 'avg' ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'}`}
                      type='button'
                      onClick={() => setHeartRateZoneBasis('avg')}
                    >
                      Lecture FC moyenne
                    </button>
                    <button
                      className={`rounded-md px-3 py-1.5 text-xs ${heartRateZoneBasis === 'max' ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'}`}
                      type='button'
                      onClick={() => setHeartRateZoneBasis('max')}
                    >
                      Lecture FC max
                    </button>
                  </div>
                  <div className='mb-4 grid gap-4 md:grid-cols-3'>
                    <StatCard
                      label='FC max reference'
                      value={`${number(heartRateZonesSummary.hrMax, 0)} bpm`}
                    />

                    <StatCard
                      label='Zone dominante'
                      value={
                        activeHeartRateZonesView.dominantZone ?
                          `${activeHeartRateZonesView.dominantZone} · ${heartRateZonesSummary.zones.find((zone) => zone.zone === activeHeartRateZonesView.dominantZone)?.label ?? ''}`
                        : 'n/a'
                      }
                    />
                  </div>
                  <div className='space-y-3'>
                    {activeHeartRateZonesView.rows.map((zone) => (
                      <div
                        className='rounded-xl border border-black/10 bg-black/[0.02] p-3'
                        key={zone.zone}
                      >
                        <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                          <p className='text-sm font-semibold'>
                            {zone.zone} · {zone.label}
                          </p>
                          <p className='text-xs text-muted'>
                            {zone.rangeLabel}
                          </p>
                        </div>
                        <div>
                          <p className='mb-1 text-[11px] uppercase tracking-wide text-muted'>
                            {activeHeartRateZonesView.basisLabel} (
                            {number(activeHeartRateZonesView.sampleSize, 0)}{' '}
                            activites)
                          </p>
                          <div className='h-2 rounded-full bg-black/10'>
                            <div
                              className={`h-2 rounded-full ${zone.colorClass}`}
                              style={{
                                width: `${zone.pct === null ? 0 : clamp(zone.pct, 0, 100)}%`,
                              }}
                            />
                          </div>
                          <p className='mt-1 text-xs text-muted'>
                            {zone.pct === null ?
                              'n/a'
                            : `${number(zone.pct, 1)}% (~${number(zone.countEstimate, 1)} activites)`
                            }
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              }
            </Card>
          : null}

          {showLabSection('labHeatmap') && hasHeatmapData ?
            <Card>
              <SectionHeader
                title='Heatmap calendrier distance/jour'
                subtitle='Vision jour par jour de la regularite'
                infoHint={{
                  title: 'Heatmap calendrier',
                  description:
                    'Chaque case represente un jour. Plus la case est coloree, plus la distance de ce jour est elevee.',
                }}
                aiInsight={buildAiInsight(
                  'labHeatmap',
                  'Heatmap calendrier distance/jour',
                  'Vision jour par jour de la regularite',
                  {
                    dailyDistanceSample: sampleForAi(
                      (dailyDistance?.series ?? []).map((point) => ({
                        bucket: point.bucket,
                        value: point.value,
                      })),
                      56,
                    ),
                  },
                )}
                collapsed={collapsedSections.labHeatmap}
                onToggleCollapse={() => toggleSection('labHeatmap')}
              />
              {collapsedSections.labHeatmap ?
                <p className='text-xs text-muted'>Section repliee.</p>
              : <ReactECharts
                  notMerge
                  option={calendarOption}
                  style={{ height: 260 }}
                  onEvents={{
                    click: (params: { data?: [string, number] }) => {
                      if (params?.data?.[0]) {
                        handleCalendarClick(params.data[0]);
                      }
                    },
                  }}
                />
              }
            </Card>
          : null}

          {showLabSection('labProfile') ?
            <Card>
              <SectionHeader
                title='Profil athlete & indicateurs derives'
                subtitle='Base: donnees profil (Parametres) + activites filtrees de la periode.'
                infoHint={{
                  title: 'Calculs derives',
                  description:
                    'Ces indicateurs combinent profil athlete et charge observee pour fournir des ratios exploitables.',
                }}
                aiInsight={buildAiInsight(
                  'labProfile',
                  'Profil athlete & indicateurs derives',
                  'Indicateurs derives du profil athlete et des activites',
                  {
                    athleteRows: athleteInsightsRows.map((row) => ({
                      key: row.key,
                      label: row.label,
                      value: row.value,
                    })),
                  },
                )}
                collapsed={collapsedSections.labProfile}
                onToggleCollapse={() => toggleSection('labProfile')}
              />
              {collapsedSections.labProfile ?
                <p className='text-xs text-muted'>Section repliee.</p>
              : isMobile ?
                <div className='space-y-2'>
                  {athleteInsightsRows.map((row) => (
                    <article
                      className='rounded-xl border border-black/10 bg-black/[0.03] p-3'
                      key={row.key}
                    >
                      <div className='flex items-start justify-between gap-2'>
                        <p className='text-sm font-medium'>{row.label}</p>
                        <InfoHint
                          title={row.label}
                          description={row.hint}
                          linkHref={row.linkHref}
                          linkLabel='Source'
                        />
                      </div>
                      <p className='mt-2 text-sm text-muted'>{row.value}</p>
                    </article>
                  ))}
                </div>
              : <div className='overflow-x-auto'>
                  <table className='min-w-full text-sm'>
                    <thead>
                      <tr className='border-b border-black/10'>
                        <th className='px-2 py-2 text-left'>Indicateur</th>
                        <th className='px-2 py-2 text-left'>Valeur</th>
                        <th className='px-2 py-2 text-left'>Methode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {athleteInsightsRows.map((row) => (
                        <tr className='border-b border-black/5' key={row.key}>
                          <td className='px-2 py-2'>{row.label}</td>
                          <td className='px-2 py-2'>{row.value}</td>
                          <td className='px-2 py-2'>
                            <InfoHint
                              title={row.label}
                              description={row.hint}
                              linkHref={row.linkHref}
                              linkLabel='Source'
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            </Card>
          : null}

          {showLabSection('labTrends') && hasTrendData ?
            <Card>
              <SectionHeader
                title='Tendances par metrique'
                subtitle='Un graphe par metrique pour eviter la confusion visuelle'
                infoHint={{
                  title: 'Tendances',
                  description:
                    'Chaque graphe utilise une seule unite. Cela evite les doubles axes et rend la lecture plus directe.',
                }}
                collapsed={collapsedSections.labTrends}
                onToggleCollapse={() => toggleSection('labTrends')}
              />
              {collapsedSections.labTrends ?
                <p className='text-xs text-muted'>Section repliee.</p>
              : <div className='grid gap-6 lg:grid-cols-2'>
                  {trendMetrics
                    .filter(
                      (metricDef) =>
                        (trendByMetric[metricDef.metric]?.series.length ?? 0) >
                        0,
                    )
                    .map((metricDef) => {
                    const series =
                      trendByMetric[metricDef.metric]?.series ?? [];
                    const convertedSeries = series.map((point) => ({
                      bucket: point.bucket,
                      value:
                        metricDef.metric === 'time' ?
                          Number(point.value.toFixed(2))
                        : Number(
                            convertCorrelationMetricValue(
                              metricDef.metric,
                              point.value,
                              unitPreferences,
                            ).toFixed(2),
                          ),
                      rawValue: Number(point.value.toFixed(4)),
                      samples: point.samples ?? null,
                    }));
                    const numericSeriesValues = convertedSeries
                      .map((point) => point.value)
                      .filter((value) => Number.isFinite(value));
                    const comparisonWindowSize = Math.max(
                      3,
                      Math.floor(numericSeriesValues.length * 0.2),
                    );
                    const firstWindow = numericSeriesValues.slice(
                      0,
                      comparisonWindowSize,
                    );
                    const lastWindow =
                      numericSeriesValues.slice(-comparisonWindowSize);
                    const firstWindowMean =
                      firstWindow.length > 0 ? mean(firstWindow) : null;
                    const lastWindowMean =
                      lastWindow.length > 0 ? mean(lastWindow) : null;
                    const deltaAbs =
                      firstWindowMean !== null && lastWindowMean !== null ?
                        lastWindowMean - firstWindowMean
                      : null;
                    const deltaPct =
                      (
                        deltaAbs !== null &&
                        firstWindowMean !== null &&
                        firstWindowMean !== 0
                      ) ?
                        (deltaAbs / Math.abs(firstWindowMean)) * 100
                      : null;
                    const q25 = quantile(numericSeriesValues, 0.25);
                    const q50 = quantile(numericSeriesValues, 0.5);
                    const q75 = quantile(numericSeriesValues, 0.75);
                    const latestValue =
                      numericSeriesValues.length > 0 ?
                        numericSeriesValues[numericSeriesValues.length - 1]
                      : null;
                    const overallMean =
                      numericSeriesValues.length > 0 ?
                        mean(numericSeriesValues)
                      : null;
                    const overallStd =
                      numericSeriesValues.length > 1 ?
                        stdDev(numericSeriesValues)
                      : null;
                    const latestZScore =
                      (
                        latestValue !== null &&
                        overallMean !== null &&
                        overallStd !== null &&
                        overallStd > 0
                      ) ?
                        (latestValue - overallMean) / overallStd
                      : null;
                    const summaryReferenceValue = (() => {
                      if (!summaryData) {
                        return null;
                      }

                      if (metricDef.metric === 'avgHR') {
                        return summaryData.avgHeartrate === null ?
                            null
                          : Number(summaryData.avgHeartrate.toFixed(1));
                      }

                      if (metricDef.metric === 'avgSpeed') {
                        return summaryData.avgSpeedKmh === null ?
                            null
                          : Number(
                              convertSpeedKmh(
                                summaryData.avgSpeedKmh,
                                unitPreferences.speedUnit,
                              ).toFixed(2),
                            );
                      }

                      if (metricDef.metric === 'cadence') {
                        return summaryData.avgCadence === null ?
                            null
                          : Number(
                              convertCadenceRpm(
                                summaryData.avgCadence,
                                unitPreferences.cadenceUnit,
                              ).toFixed(1),
                            );
                      }

                      return null;
                    })();
                    const heartRateSpecificContext =
                      (
                        metricDef.metric === 'avgHR' ||
                        metricDef.metric === 'maxHR'
                      ) ?
                        (() => {
                          const hrMax = user?.hrMax ?? null;
                          if (!hrMax || hrMax <= 0) {
                            return {
                              hrMax: null,
                              zoneReference: null,
                              pctHrMaxSeries: null,
                              latestPctHrMax: null,
                            };
                          }

                          const pctHrMaxSeries = sampleForAi(
                            convertedSeries.map((point) => {
                              const pct = (point.value / hrMax) * 100;
                              return {
                                bucket: point.bucket,
                                pctHrMax: Number(pct.toFixed(1)),
                                zone: resolveHeartRateZone(pct),
                              };
                            }),
                            64,
                          );
                          const latestPctHrMax =
                            latestValue === null ? null : (
                              Number(((latestValue / hrMax) * 100).toFixed(1))
                            );

                          return {
                            hrMax,
                            zoneReference: heartRateZones.map((zoneDef) => ({
                              zone: zoneDef.zone,
                              minPct: zoneDef.minPct,
                              maxPct: zoneDef.maxPct,
                            })),
                            pctHrMaxSeries,
                            latestPctHrMax,
                          };
                        })()
                      : null;
                    const correlationSourceMetric =
                      analyticsMetricToCorrelationVar[metricDef.metric];
                    const matrixTopRelatedMetrics =
                      relatedMetricsByCorrelationVar[correlationSourceMetric] ??
                      [];

                    return (
                      <div key={metricDef.metric}>
                        <div className='mb-2 flex items-center justify-between'>
                          <p className='text-xs font-semibold uppercase tracking-wide text-muted'>
                            {metricDef.title}
                          </p>
                          <div className='flex items-center gap-2'>
                            <InfoHint
                              title={metricDef.title}
                              description={metricDef.description}
                              linkHref={metricDef.linkHref}
                              linkLabel={metricDef.linkLabel}
                            />
                            <AIInsightButton
                              token={token}
                              payload={{
                                page: 'analytics_graph',
                                sectionKey: `trend:${metricDef.metric}`,
                                sectionTitle: `Tendance - ${metricDef.title}`,
                                sectionSubtitle: `Bucket ${trendBucket} · ${series.length} points`,
                                question: graphAuditBaseQuestion,
                                context: {
                                  ...analyticsAiBaseContext,
                                  graph: {
                                    type: 'trend',
                                    metric: metricDef.metric,
                                    metricTitle: metricDef.title,
                                    bucket: trendBucket,
                                    aggregation:
                                      trendByMetric[metricDef.metric]
                                        ?.aggregation ?? null,
                                    unit: metricUnit(
                                      metricDef.metric,
                                      unitPreferences,
                                    ),
                                    displayedSeries: sampleForAi(
                                      convertedSeries,
                                      120,
                                    ),
                                    coverage: {
                                      totalBuckets: series.length,
                                      nonZeroBuckets: convertedSeries.filter(
                                        (point) => point.value > 0,
                                      ).length,
                                      firstBucket: series[0]?.bucket ?? null,
                                      lastBucket:
                                        series[series.length - 1]?.bucket ??
                                        null,
                                    },
                                    trendMath: {
                                      slopePerBucket: computeLinearSlope(
                                        convertedSeries.map(
                                          (point) => point.value,
                                        ),
                                      ),
                                    },
                                    comparisonBaseline: {
                                      dataPoints: numericSeriesValues.length,
                                      windowSize: comparisonWindowSize,
                                      firstWindowMean:
                                        firstWindowMean === null ? null : (
                                          Number(firstWindowMean.toFixed(2))
                                        ),
                                      recentWindowMean:
                                        lastWindowMean === null ? null : (
                                          Number(lastWindowMean.toFixed(2))
                                        ),
                                      deltaAbs:
                                        deltaAbs === null ? null : (
                                          Number(deltaAbs.toFixed(2))
                                        ),
                                      deltaPct:
                                        deltaPct === null ? null : (
                                          Number(deltaPct.toFixed(1))
                                        ),
                                      overallMean:
                                        overallMean === null ? null : (
                                          Number(overallMean.toFixed(2))
                                        ),
                                      median:
                                        q50 === null ? null : (
                                          Number(q50.toFixed(2))
                                        ),
                                      iqr:
                                        q25 === null || q75 === null ?
                                          null
                                        : Number((q75 - q25).toFixed(2)),
                                      latestValue:
                                        latestValue === null ? null : (
                                          Number(latestValue.toFixed(2))
                                        ),
                                      latestVsMedian:
                                        latestValue === null || q50 === null ?
                                          null
                                        : Number(
                                            (latestValue - q50).toFixed(2),
                                          ),
                                      latestZScore:
                                        latestZScore === null ? null : (
                                          Number(latestZScore.toFixed(2))
                                        ),
                                    },
                                    referenceSignals: {
                                      summaryPeriodReference:
                                        summaryReferenceValue,
                                      externalAthleteComparisonAvailable: false,
                                    },
                                    matrixTopRelatedMetrics,
                                    matrixContext: {
                                      sourceMetric: correlationSourceMetric,
                                      sourceMetricLabel:
                                        correlationVarLabels[
                                          correlationSourceMetric
                                        ] ?? correlationSourceMetric,
                                      method: 'spearman',
                                    },
                                    heartRateSpecific: heartRateSpecificContext,
                                    distributionDiagnostics: (() => {
                                      const bins =
                                        distributionByMetric[metricDef.metric]
                                          ?.bins ?? [];
                                      if (bins.length === 0) {
                                        return null;
                                      }
                                      const convertedBinsForMetric =
                                        convertDistributionBinsForMetric(
                                          metricDef.metric,
                                          bins,
                                          unitPreferences,
                                        );
                                      return buildDistributionDiagnostics(
                                        convertedBinsForMetric,
                                        {
                                          summaryReferenceValue,
                                          latestValue,
                                        },
                                      );
                                    })(),
                                    complementarySignals: [
                                      'distance',
                                      'time',
                                      'avgHR',
                                      'avgSpeed',
                                      'cadence',
                                      'calories',
                                    ]
                                      .filter(
                                        (metricName) =>
                                          metricName !== metricDef.metric &&
                                          trendByMetric[
                                            metricName as TrendMetric
                                          ]?.series?.length,
                                      )
                                      .slice(0, 4)
                                      .map((metricName) => {
                                        const metricSeries =
                                          trendByMetric[
                                            metricName as TrendMetric
                                          ]?.series ?? [];
                                        const last =
                                          metricSeries[metricSeries.length - 1];
                                        return {
                                          metric: metricName,
                                          lastBucket: last?.bucket ?? null,
                                          lastValue:
                                            !last ? null : (
                                              Number(
                                                convertCorrelationMetricValue(
                                                  metricName as TrendMetric,
                                                  last.value,
                                                  unitPreferences,
                                                ).toFixed(2),
                                              )
                                            ),
                                        };
                                      }),
                                    readinessContext: {
                                      todayLoadSummary,
                                    },
                                  },
                                },
                              }}
                            />
                          </div>
                        </div>
                        <ReactECharts
                          option={buildTrendOption(
                            metricDef.metric,
                            trendByMetric[metricDef.metric],
                            metricDef.title,
                            metricDef.color,
                            unitPreferences,
                          )}
                          style={{ height: 260 }}
                          onEvents={{
                            click: (params: { name?: string }) => {
                              if (params?.name) {
                                handleTrendClick(metricDef.metric, params.name);
                              }
                            },
                          }}
                        />
                      </div>
                    );
                    })}
                </div>
              }
            </Card>
          : null}

          {showLabSection('labDistributions') && hasDistributionData ?
            <Card>
              <SectionHeader
                title='Distributions'
                subtitle='Histogrammes par metrique'
                infoHint={{
                  title: 'Distributions',
                  description:
                    'Chaque barre represente une plage de valeurs. Cela montre ou se concentre la majorite de tes activites.',
                }}
                collapsed={collapsedSections.labDistributions}
                onToggleCollapse={() => toggleSection('labDistributions')}
              />
              {collapsedSections.labDistributions ?
                <p className='text-xs text-muted'>Section repliee.</p>
              : <div className='grid gap-6 lg:grid-cols-2'>
                  {distributionMetrics
                    .filter((metricDef) => {
                      const metricDistribution =
                        distributionByMetric[metricDef.metric];
                      return (
                        (metricDistribution?.sampleSize ?? 0) > 0 &&
                        (metricDistribution?.bins.length ?? 0) > 0
                      );
                    })
                    .map((metricDef) => {
                    const bins =
                      distributionByMetric[metricDef.metric]?.bins ?? [];
                    const convertedBins = convertDistributionBinsForMetric(
                      metricDef.metric,
                      bins,
                      unitPreferences,
                    );
                    const totalBinCount = convertedBins.reduce(
                      (sum, bin) => sum + bin.count,
                      0,
                    );
                    const convertedQuantiles =
                      approximateQuantilesFromBins(convertedBins);
                    const summaryReferenceValue = (() => {
                      if (!summaryData) {
                        return null;
                      }

                      if (metricDef.metric === 'avgHR') {
                        return summaryData.avgHeartrate === null ?
                            null
                          : Number(summaryData.avgHeartrate.toFixed(1));
                      }

                      if (metricDef.metric === 'avgSpeed') {
                        return summaryData.avgSpeedKmh === null ?
                            null
                          : Number(
                              convertSpeedKmh(
                                summaryData.avgSpeedKmh,
                                unitPreferences.speedUnit,
                              ).toFixed(2),
                            );
                      }

                      if (metricDef.metric === 'cadence') {
                        return summaryData.avgCadence === null ?
                            null
                          : Number(
                              convertCadenceRpm(
                                summaryData.avgCadence,
                                unitPreferences.cadenceUnit,
                              ).toFixed(1),
                            );
                      }

                      return null;
                    })();
                    const distributionHeartRateContext =
                      (
                        metricDef.metric === 'avgHR' ||
                        metricDef.metric === 'maxHR'
                      ) ?
                        (() => {
                          const hrMax = user?.hrMax ?? null;
                          const medianPctHrMax =
                            (
                              hrMax &&
                              hrMax > 0 &&
                              convertedQuantiles.q50 !== null
                            ) ?
                              Number(
                                (
                                  (convertedQuantiles.q50 / hrMax) *
                                  100
                                ).toFixed(1),
                              )
                            : null;

                          return {
                            hrMax: hrMax && hrMax > 0 ? hrMax : null,
                            medianPctHrMax,
                            q25PctHrMax:
                              (
                                hrMax &&
                                hrMax > 0 &&
                                convertedQuantiles.q25 !== null
                              ) ?
                                Number(
                                  (
                                    (convertedQuantiles.q25 / hrMax) *
                                    100
                                  ).toFixed(1),
                                )
                              : null,
                            q75PctHrMax:
                              (
                                hrMax &&
                                hrMax > 0 &&
                                convertedQuantiles.q75 !== null
                              ) ?
                                Number(
                                  (
                                    (convertedQuantiles.q75 / hrMax) *
                                    100
                                  ).toFixed(1),
                                )
                              : null,
                            zoneReference: heartRateZones.map((zoneDef) => ({
                              zone: zoneDef.zone,
                              minPct: zoneDef.minPct,
                              maxPct: zoneDef.maxPct,
                            })),
                          };
                        })()
                      : null;
                    const correlationSourceMetric =
                      analyticsMetricToCorrelationVar[metricDef.metric];
                    const matrixTopRelatedMetrics =
                      relatedMetricsByCorrelationVar[correlationSourceMetric] ??
                      [];
                    const distributionDiagnostics =
                      buildDistributionDiagnostics(convertedBins, {
                        summaryReferenceValue,
                      });

                    return (
                      <div key={metricDef.metric}>
                        <div className='mb-2 flex items-center justify-between'>
                          <p className='text-xs font-semibold uppercase tracking-wide text-muted'>
                            {metricDef.title}
                          </p>
                          <div className='flex items-center gap-2'>
                            <InfoHint
                              title={metricDef.title}
                              description={metricDef.description}
                              linkHref={metricDef.linkHref}
                              linkLabel={metricDef.linkLabel}
                            />
                            <AIInsightButton
                              token={token}
                              payload={{
                                page: 'analytics_graph',
                                sectionKey: `distribution:${metricDef.metric}`,
                                sectionTitle: `Distribution - ${metricDef.title}`,
                                sectionSubtitle: `${distributionByMetric[metricDef.metric]?.sampleSize ?? 0} echantillons`,
                                question: graphAuditBaseQuestion,
                                context: {
                                  ...analyticsAiBaseContext,
                                  graph: {
                                    type: 'distribution',
                                    metric: metricDef.metric,
                                    metricTitle: metricDef.title,
                                    bins: distributionBins,
                                    unit: metricUnit(
                                      metricDef.metric,
                                      unitPreferences,
                                    ),
                                    sampleSize:
                                      distributionByMetric[metricDef.metric]
                                        ?.sampleSize ?? 0,
                                    displayedBins: sampleForAi(
                                      convertedBins,
                                      80,
                                    ),
                                    comparisonBaseline: {
                                      sampleSize:
                                        distributionByMetric[metricDef.metric]
                                          ?.sampleSize ?? 0,
                                      totalCount: totalBinCount,
                                      median:
                                        convertedQuantiles.q50 === null ?
                                          null
                                        : Number(
                                            convertedQuantiles.q50.toFixed(2),
                                          ),
                                      iqr:
                                        (
                                          convertedQuantiles.q25 === null ||
                                          convertedQuantiles.q75 === null
                                        ) ?
                                          null
                                        : Number(
                                            (
                                              convertedQuantiles.q75 -
                                              convertedQuantiles.q25
                                            ).toFixed(2),
                                          ),
                                      summaryPeriodReference:
                                        summaryReferenceValue,
                                      externalAthleteComparisonAvailable: false,
                                    },
                                    matrixTopRelatedMetrics,
                                    matrixContext: {
                                      sourceMetric: correlationSourceMetric,
                                      sourceMetricLabel:
                                        correlationVarLabels[
                                          correlationSourceMetric
                                        ] ?? correlationSourceMetric,
                                      method: 'spearman',
                                    },
                                    distributionDiagnostics,
                                    heartRateSpecific:
                                      distributionHeartRateContext,
                                    distributionShape: (() => {
                                      const total = totalBinCount;
                                      if (total <= 0) {
                                        return null;
                                      }
                                      const sorted = [...convertedBins].sort(
                                        (a, b) => b.count - a.count,
                                      );
                                      const topBin = sorted[0] ?? null;
                                      const top3Count = sorted
                                        .slice(0, 3)
                                        .reduce(
                                          (sum, bin) => sum + bin.count,
                                          0,
                                        );
                                      return {
                                        totalCount: total,
                                        concentrationTop3Pct: Number(
                                          ((top3Count / total) * 100).toFixed(
                                            1,
                                          ),
                                        ),
                                        dominantBin: topBin,
                                      };
                                    })(),
                                    trendCompanion: (() => {
                                      const trend =
                                        trendByMetric[
                                          metricDef.metric as TrendMetric
                                        ]?.series ?? [];
                                      return {
                                        bucket: trendBucket,
                                        sample: sampleForAi(
                                          trend.map((point) => ({
                                            bucket: point.bucket,
                                            value:
                                              metricDef.metric === 'time' ?
                                                Number(point.value.toFixed(2))
                                              : Number(
                                                  convertCorrelationMetricValue(
                                                    metricDef.metric,
                                                    point.value,
                                                    unitPreferences,
                                                  ).toFixed(2),
                                                ),
                                          })),
                                          28,
                                        ),
                                      };
                                    })(),
                                    readinessContext: {
                                      todayLoadSummary,
                                    },
                                  },
                                },
                              }}
                            />
                          </div>
                        </div>
                        <ReactECharts
                          option={buildDistributionOption(
                            metricDef.metric,
                            distributionByMetric[metricDef.metric],
                            metricDef.title,
                            trendMetricColorByMetric[metricDef.metric],
                            unitPreferences,
                          )}
                          style={{ height: 260 }}
                        />
                      </div>
                    );
                    })}
                </div>
              }
            </Card>
          : null}

          {showLabSection('labPivot') && hasPivotData ?
            <Card>
              <SectionHeader
                title='Tableau pivot'
                subtitle='Agregats par type/semaine/mois'
                infoHint={{
                  title: 'Pivot',
                  description:
                    'Le pivot synthese les metriques par regroupement. Les colonnes avg* sont des moyennes, les autres des sommes.',
                }}
                aiInsight={buildAiInsight(
                  'labPivot',
                  'Tableau pivot',
                  'Agregats par type/semaine/mois',
                  {
                    pivotRow,
                    metrics: pivotMetrics,
                    rowsPreview: sampleForAi(pivotRows, 20),
                  },
                )}
                collapsed={collapsedSections.labPivot}
                onToggleCollapse={() => toggleSection('labPivot')}
              />
              {collapsedSections.labPivot ?
                <p className='text-xs text-muted'>Section repliee.</p>
              : <>
                  <div className='mb-3 flex gap-2'>
                    <select
                      className={selectClass}
                      onChange={(event) => setPivotRow(event.target.value)}
                      value={pivotRow}
                    >
                      <option value='type'>Par type</option>
                      <option value='week'>Par semaine</option>
                      <option value='month'>Par mois</option>
                    </select>
                  </div>

                  {isMobile ?
                    <div className='space-y-2'>
                      {pivotRows.map((row) => (
                        <article
                          className='rounded-xl border border-black/10 bg-black/[0.03] p-3'
                          key={row.key}
                        >
                          <p className='text-sm font-medium'>{row.key}</p>
                          <div className='mt-2 grid gap-1 text-xs'>
                            {pivotMetrics.map((metric) => (
                              <p key={metric}>
                                <span className='text-muted'>
                                  {pivotMetricLabel(metric, unitPreferences)}:
                                </span>{' '}
                                {formatPivotMetricValue(
                                  metric,
                                  Number(row[metric] ?? 0),
                                  unitPreferences,
                                )}
                              </p>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  : <div className='overflow-x-auto'>
                      <table className='min-w-full text-sm'>
                        <thead>
                          <tr className='border-b border-black/10'>
                            <th className='px-2 py-2 text-left'>Row</th>
                            {pivotMetrics.map((metric) => (
                              <th className='px-2 py-2 text-left' key={metric}>
                                {pivotMetricLabel(metric, unitPreferences)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {pivotRows.map((row) => (
                            <tr
                              className='border-b border-black/5'
                              key={row.key}
                            >
                              <td className='px-2 py-2'>{row.key}</td>
                              {pivotMetrics.map((metric) => (
                                <td className='px-2 py-2' key={metric}>
                                  {formatPivotMetricValue(
                                    metric,
                                    Number(row[metric] ?? 0),
                                    unitPreferences,
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  }
                </>
              }
            </Card>
          : null}

          {showLabSection('labLoad') && hasLoadSeries ?
            <Card>
              <SectionHeader
                title='Forme / charge'
                subtitle='Charge journaliere + CTL / ATL / TSB'
                infoHint={{
                  title: 'CTL / ATL / TSB',
                  description:
                    'Charge, CTL et ATL sont affiches en points de charge (ex: 83 points), alors que ATL/CTL est un ratio sans unite (ex: 1.30 = 130%). Calculs: CTL = EMA 42 jours, ATL = EMA 7 jours, TSB = CTL - ATL. Repere TSB: >= +10 tres frais, +3 a +10 frais, -10 a +3 equilibre, -20 a -10 fatigue elevee, <= -20 surcharge probable. Repere ATL/CTL: <= 0.80 faible fatigue, 0.81-1.05 controlee, 1.06-1.25 elevee, > 1.25 tres elevee.',
                  linkHref: 'https://pubmed.ncbi.nlm.nih.gov/24410871/',
                  linkLabel: 'Source: CTL/ATL/TSB et monitoring charge',
                }}
                aiInsight={buildAiInsight(
                  'labLoad',
                  'Forme / charge',
                  'Charge journaliere + CTL / ATL / TSB',
                  {
                    loadSeriesSample: sampleForAi(loadData?.series ?? [], 40),
                    todayLoadSummary,
                  },
                )}
                collapsed={collapsedSections.labLoad}
                onToggleCollapse={() => toggleSection('labLoad')}
              />
              {collapsedSections.labLoad ?
                <p className='text-xs text-muted'>Section repliee.</p>
              : <ReactECharts option={loadOption} style={{ height: 360 }} />}
            </Card>
          : null}
        </div>
      : activeView === 'historical' ?
        <div className='mt-6 grid gap-6'>
          {showHistoricalSection('histSelection') ?
            <Card>
              <SectionHeader
                title='Selection automatique des sessions comparables'
                subtitle="Aucun reglage obligatoire: l'app choisit automatiquement les sorties les plus proches."
                infoHint={{
                  title: 'Methode de similarite',
                  description:
                    'Distance euclidienne sur variables standardisees (z-score) pour comparer des sessions sur une echelle commune.',
                  linkHref: 'https://en.wikipedia.org/wiki/Standard_score',
                  linkLabel: 'Methode: z-score',
                }}
                aiInsight={buildAiInsight(
                  'histSelection',
                  'Selection automatique des sessions comparables',
                  'Configuration du pool de sessions similaires',
                  {
                    historicalType,
                    recommendedHistoricalType,
                    historicalPreset,
                    historicalSampleSize,
                    selectedTypeSessionCount: selectedTypeSessions.length,
                    historicalActivitiesCount: historicalActivities.length,
                    typeStatsPreview: sampleForAi(
                      historicalTypeStats.map((row) => ({
                        type: row.type,
                        count: row.count,
                        coverage: row.coverage,
                        score: row.score,
                      })),
                      16,
                    ),
                  },
                )}
                className='mb-4'
                collapsed={collapsedSections.histSelection}
                onToggleCollapse={() => toggleSection('histSelection')}
              />
              {collapsedSections.histSelection ?
                <p className='text-xs text-muted'>Section repliee.</p>
              : <>
                  <p className='text-xs text-muted'>
                    Mode simple: laisse <strong>Type auto</strong> et{' '}
                    <strong>Echantillon standard</strong>.
                  </p>
                  <div className='grid gap-3 md:grid-cols-2'>
                    <select
                      className={selectClass}
                      onChange={(event) =>
                        setHistoricalType(event.target.value)
                      }
                      value={historicalType}
                    >
                      <option value='auto'>
                        Type auto{' '}
                        {recommendedHistoricalType ?
                          `(reco: ${recommendedHistoricalType})`
                        : ''}
                      </option>
                      {historicalTypeStats.map((row) => (
                        <option key={row.type} value={row.type}>
                          {row.type} ({row.count})
                        </option>
                      ))}
                    </select>
                    <div className='flex items-center gap-2 rounded-lg border border-black/10 bg-black/[0.03] px-2 py-2'>
                      {(
                        [
                          { key: 'strict', label: 'Strict' },
                          { key: 'balanced', label: 'Standard' },
                          { key: 'wide', label: 'Large' },
                        ] as Array<{ key: HistoricalPreset; label: string }>
                      ).map((preset) => (
                        <button
                          key={preset.key}
                          type='button'
                          className={`rounded-lg px-3 py-1 text-xs ${historicalPreset === preset.key ? 'bg-ink text-white' : 'border border-black/20 hover:bg-black/5'}`}
                          onClick={() => setHistoricalPreset(preset.key)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <details className='mt-3 rounded-lg border border-black/10 bg-black/[0.03] p-3'>
                    <summary className='cursor-pointer text-xs uppercase tracking-wide text-muted'>
                      Options avancees (facultatif)
                    </summary>
                    <div className='mt-3 grid gap-3 md:grid-cols-2'>
                      <select
                        className={selectClass}
                        onChange={(event) =>
                          setHistoricalReference(event.target.value)
                        }
                        value={historicalReference}
                      >
                        <option value='auto'>Reference auto</option>
                        {selectedTypeSessions.slice(0, 120).map((session) => (
                          <option key={session.id} value={session.id}>
                            {session.day} - {session.activity.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className={inputClass}
                        max={60}
                        min={8}
                        onChange={(event) =>
                          setHistoricalSampleSize(Number(event.target.value))
                        }
                        type='number'
                        value={historicalSampleSize}
                      />
                    </div>
                  </details>

                  <div className='mt-3 flex flex-wrap items-center gap-4 text-xs text-muted'>
                    <span>
                      Echantillon utilise: {historicalSampleSize} sessions max
                    </span>
                    <span>Pool type: {selectedTypeSessions.length}</span>
                    <span>
                      Activites chargees: {historicalActivities.length}
                    </span>
                    <span>
                      Type recommande: {recommendedHistoricalType ?? 'n/a'}
                    </span>
                    {historicalComparison ?
                      <ReliabilityGauge
                        score={historicalComparison.reliability}
                      />
                    : null}
                  </div>
                </>
              }
            </Card>
          : null}

          {historicalError ?
            <p className='text-sm text-red-700'>{historicalError}</p>
          : null}

          {historicalLoading ?
            <Card>
              <p className='text-sm text-muted'>
                Chargement historique des activites...
              </p>
            </Card>
          : null}

          {!historicalLoading && !historicalError && historicalComparison ?
            <>
              {showHistoricalSection('histSynthesis') &&
              hasHistoricalSynthesisData ?
                <Card>
                <SectionHeader
                  title="Synthese d'evolution"
                  subtitle={`Comparaison debut vs recent sur ${historicalComparison.rows.length} sessions similaires.`}
                  infoHint={{
                    title: 'Interpretation',
                    description:
                      "Delta debut/recent + rho de Spearman + taille d'effet Cohen d pour qualifier direction et ampleur.",
                    linkHref:
                      "https://en.wikipedia.org/wiki/Effect_size#Cohen's_d",
                    linkLabel: 'Methode: effect size',
                  }}
                  aiInsight={buildAiInsight(
                    'histSynthesis',
                    "Synthese d'evolution",
                    `Comparaison debut vs recent sur ${historicalComparison.rows.length} sessions similaires.`,
                    {
                      historicalMetrics,
                      narrative: historicalNarrative,
                    },
                  )}
                  collapsed={collapsedSections.histSynthesis}
                  onToggleCollapse={() => toggleSection('histSynthesis')}
                />
                {collapsedSections.histSynthesis ?
                  <p className='text-xs text-muted'>Section repliee.</p>
                : <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
                    {historicalMetrics.map((metric) => {
                      const hint = historicalMetricHintByLabel[metric.label];
                      return (
                        <div
                          className='rounded-xl border border-black/10 bg-black/[0.03] p-3'
                          key={metric.label}
                        >
                          <div className='mb-1 flex items-center justify-between gap-2'>
                            <p className='text-xs font-semibold uppercase tracking-wide text-muted'>
                              {metric.label}
                            </p>
                            <InfoHint
                              title={metric.label}
                              description={
                                hint?.description ?? 'Statistique de tendance.'
                              }
                              linkHref={hint?.linkHref}
                              linkLabel={hint?.linkLabel}
                            />
                          </div>
                          <p className='text-lg font-semibold'>
                            {metric.recent === null ?
                              'n/a'
                            : `${metric.recent.toFixed(2)} ${metric.unit}`}
                          </p>
                          <p className='mt-1 text-xs text-muted'>
                            debut:{' '}
                            {metric.first === null ?
                              'n/a'
                            : `${metric.first.toFixed(2)} ${metric.unit}`}
                          </p>
                          <p className='mt-1 text-xs text-muted'>
                            delta: {formatSignedPercent(metric.changePct)}
                          </p>
                          <p className='mt-1 text-xs text-muted'>
                            rho: {formatSigned(metric.rho, 2)}
                          </p>
                          <p className='mt-1 text-xs text-muted'>
                            Cohen d: {formatSigned(metric.effectSize, 2)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                }
                </Card>
              : null}

              {showHistoricalSection('histSkills') && hasHistoricalSkillsData ?
                <Card>
                <SectionHeader
                  title='Radar des competences'
                  subtitle='Profil en croix sur 6 dimensions'
                  infoHint={{
                    title: 'Radar competences',
                    description:
                      'Scores relatifs (0-100) estimes sur endurance, vitesse/allure, efficacite cardio, cadence, regularite et fraicheur.',
                  }}
                  aiInsight={buildAiInsight(
                    'histSkills',
                    'Radar des competences',
                    'Profil en croix sur 6 dimensions',
                    {
                      radarMetrics: progressRadar?.metrics ?? [],
                    },
                  )}
                  collapsed={collapsedSections.histSkills}
                  onToggleCollapse={() => toggleSection('histSkills')}
                />
                {collapsedSections.histSkills ?
                  <p className='text-xs text-muted'>Section repliee.</p>
                : <>
                    <p className='mb-3 text-xs text-muted'>
                      Base: sessions comparables + charge du jour (si
                      disponible).
                    </p>
                    <ReactECharts
                      option={progressRadar!.option}
                      style={{ height: isMobile ? 380 : 360 }}
                    />
                    <div className='mt-3 grid gap-2 md:grid-cols-3'>
                      {progressRadar!.metrics.map((metric) => (
                        <div
                          className='rounded-lg border border-black/10 bg-black/[0.03] px-3 py-2 text-xs'
                          key={metric.name}
                        >
                          <p className='break-words text-muted'>{metric.name}</p>
                          <p className='mt-1 break-words'>
                            <strong>{metric.value.toFixed(0)}/100</strong>
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                }
                </Card>
              : null}

              {showHistoricalSection('histSimple') && hasHistoricalSimpleData ?
                <Card>
                <SectionHeader
                  title='Graphique simple (zoomable)'
                  subtitle='Une seule metrique a la fois pour une lecture claire. Zoom avec la molette ou le slider.'
                  infoHint={{
                    title: 'Graphique simple',
                    description:
                      'Vue simplifiee: courbe principale + ligne de tendance. Utile pour voir rapidement la direction.',
                    linkHref: 'https://en.wikipedia.org/wiki/Trend_estimation',
                    linkLabel: 'Principe: trend',
                  }}
                  aiInsight={buildAiInsight(
                    'histSimple',
                    'Graphique simple',
                    "Evolution d'une metrique principale",
                    {
                      historicalMainMetric,
                      seriesSample: sampleForAi(
                        (historicalComparison?.rows ?? []).map((row) => ({
                          date: row.session.day,
                          speedKmh: row.session.speedKmh,
                          hr: row.session.hr,
                          cadence: row.session.cadence,
                          intensityProxy: row.session.intensityProxy,
                          similarity: row.similarity,
                        })),
                        36,
                      ),
                    },
                  )}
                  collapsed={collapsedSections.histSimple}
                  onToggleCollapse={() => toggleSection('histSimple')}
                />
                {collapsedSections.histSimple ?
                  <p className='text-xs text-muted'>Section repliee.</p>
                : <>
                    <div className='mb-3 flex flex-wrap gap-2'>
                      {(
                        [
                          {
                            key: 'speedKmh',
                            label:
                              unitPreferences.speedUnit === 'kmh' ?
                                'Vitesse'
                              : 'Allure',
                          },
                          { key: 'hr', label: 'FC' },
                          { key: 'cadence', label: 'Cadence' },
                          { key: 'intensityProxy', label: 'Intensite' },
                        ] as Array<{ key: HistoricalMainMetric; label: string }>
                      ).map((metric) => (
                        <button
                          key={metric.key}
                          type='button'
                          className={`rounded-lg border px-3 py-1 text-xs ${historicalMainMetric === metric.key ? 'border-ink bg-ink text-white' : 'border-black/20 hover:bg-black/5'}`}
                          onClick={() => setHistoricalMainMetric(metric.key)}
                        >
                          {metric.label}
                        </button>
                      ))}
                    </div>
                    <ReactECharts
                      option={historicalSimpleOption}
                      style={{ height: 400 }}
                    />
                  </>
                }
                </Card>
              : null}

              {(showHistoricalSection('histAdvancedMap') &&
                hasHistoricalMapData) ||
              (showHistoricalSection('histAdvancedEvolution') &&
                hasHistoricalEvolutionData) ?
                <Card>
                <details>
                  <summary className='cursor-pointer text-sm font-semibold'>
                    Vue avancee (optionnelle)
                  </summary>
                  <div className='mt-3 space-y-6'>
                    {showHistoricalSection('histAdvancedMap') &&
                    hasHistoricalMapData ?
                      <div>
                        <SectionHeader
                          title='Carte des sessions proches'
                          subtitle="Click sur un point pour ouvrir l'activite."
                          infoHint={{
                            title: 'Carte de proximite',
                            description:
                              'Chaque point est une session; couleur = similarite au profil de reference, taille = duree.',
                            linkHref:
                              'https://en.wikipedia.org/wiki/Euclidean_distance',
                            linkLabel: 'Methode: distance euclidienne',
                          }}
                          aiInsight={buildAiInsight(
                            'histAdvancedMap',
                            'Carte des sessions proches',
                            'Projection FC vs vitesse/allure avec similarite',
                            {
                              referenceId,
                              rowsSample: sampleForAi(
                                (historicalComparison?.rows ?? []).map(
                                  (row) => ({
                                    id: row.session.id,
                                    date: row.session.day,
                                    similarity: row.similarity,
                                    hr: row.session.hr,
                                    speedKmh: row.session.speedKmh,
                                    durationMin: row.session.durationMin,
                                  }),
                                ),
                                42,
                              ),
                            },
                          )}
                          collapsed={collapsedSections.histAdvancedMap}
                          onToggleCollapse={() =>
                            toggleSection('histAdvancedMap')
                          }
                        />
                        {collapsedSections.histAdvancedMap ?
                          <p className='text-xs text-muted'>Section repliee.</p>
                        : <ReactECharts
                            option={historicalSimilarityOption}
                            style={{ height: 420 }}
                            onEvents={{
                              click: (params: {
                                data?: { activityId?: string };
                              }) => {
                                openHistoricalActivity(params.data?.activityId);
                              },
                            }}
                          />
                        }
                      </div>
                    : null}
                    {showHistoricalSection('histAdvancedEvolution') &&
                    hasHistoricalEvolutionData ?
                      <div>
                        <SectionHeader
                          title='Evolution comparee (indexee)'
                          subtitle='Index base 100 pour comparer toutes les dimensions.'
                          infoHint={{
                            title: 'Index base 100',
                            description:
                              'Chaque metrique est normalisee par sa premiere valeur disponible pour comparer les trajectoires.',
                            linkHref:
                              'https://en.wikipedia.org/wiki/Normalization_(statistics)',
                            linkLabel: 'Principe: normalization',
                          }}
                          aiInsight={buildAiInsight(
                            'histAdvancedEvolution',
                            'Evolution comparee indexee',
                            'Comparaison multi-metriques en base 100',
                            {
                              historicalMetrics,
                            },
                          )}
                          collapsed={collapsedSections.histAdvancedEvolution}
                          onToggleCollapse={() =>
                            toggleSection('histAdvancedEvolution')
                          }
                        />
                        {collapsedSections.histAdvancedEvolution ?
                          <p className='text-xs text-muted'>Section repliee.</p>
                        : <ReactECharts
                            option={historicalEvolutionOption}
                            style={{ height: 380 }}
                          />
                        }
                      </div>
                    : null}
                  </div>
                </details>
                </Card>
              : null}

              {showHistoricalSection('histNarrative') &&
              hasHistoricalNarrativeData ?
                <Card>
                <SectionHeader
                  title='Analyse automatique'
                  subtitle='Lecture textuelle des signaux detectes.'
                  infoHint={{
                    title: 'Analyse',
                    description:
                      "Regles d'interpretation sur deltas et tendances monotones. Utile pour triage rapide, pas diagnostic medical.",
                  }}
                  aiInsight={buildAiInsight(
                    'histNarrative',
                    'Analyse automatique',
                    'Synthese textuelle des signaux',
                    {
                      notes: historicalNarrative,
                      historicalMetrics,
                    },
                  )}
                  collapsed={collapsedSections.histNarrative}
                  onToggleCollapse={() => toggleSection('histNarrative')}
                />
                {collapsedSections.histNarrative ?
                  <p className='text-xs text-muted'>Section repliee.</p>
                : <ol className='space-y-2 text-sm'>
                    {historicalNarrative.map((note, index) => (
                      <li
                        className='rounded-lg border border-black/10 bg-black/[0.03] px-3 py-2'
                        key={`${index}-${note}`}
                      >
                        {index + 1}. {note}
                      </li>
                    ))}
                  </ol>
                }
                </Card>
              : null}

              {showHistoricalSection('histSessions') && hasHistoricalSessionsData ?
                <Card>
                <SectionHeader
                  title='Sessions retenues'
                  subtitle='Top par similarite au profil de reference.'
                  infoHint={{
                    title: 'Sessions retenues',
                    description:
                      'Les lignes sont triees par similarite; la reference apparait en premier.',
                  }}
                  aiInsight={buildAiInsight(
                    'histSessions',
                    'Sessions retenues',
                    'Top par similarite au profil de reference',
                    {
                      referenceId,
                      sessionsSample: sampleForAi(
                        historicalRowsForTable.map((row) => ({
                          id: row.session.id,
                          date: row.session.day,
                          similarity: row.similarity,
                          distanceKm: row.session.distanceKm,
                          durationMin: row.session.durationMin,
                          speedKmh: row.session.speedKmh,
                          hr: row.session.hr,
                          cadence: row.session.cadence,
                        })),
                        30,
                      ),
                    },
                  )}
                  collapsed={collapsedSections.histSessions}
                  onToggleCollapse={() => toggleSection('histSessions')}
                />
                {collapsedSections.histSessions ?
                  <p className='text-xs text-muted'>Section repliee.</p>
                : isMobile ?
                  <div className='space-y-2'>
                    {historicalRowsForTable.map((row) => (
                      <article
                        className={`cursor-pointer rounded-xl border border-black/10 p-3 ${row.session.id === referenceId ? 'bg-amber-50/60' : 'bg-black/[0.03]'}`}
                        key={row.session.id}
                        onClick={() =>
                          setSelectedActivity(row.session.activity)
                        }
                      >
                        <p className='break-words text-sm font-medium'>
                          {row.session.activity.name}
                        </p>
                        <p className='mt-1 text-xs text-muted'>
                          {row.session.day} · Sim {row.similarity.toFixed(2)}
                        </p>
                        <div className='mt-2 grid grid-cols-2 gap-2 text-xs'>
                          <p>
                            <span className='text-muted'>
                              Dist (
                              {distanceUnitLabel(unitPreferences.distanceUnit)}
                              ):
                            </span>{' '}
                            {formatDistanceFromKm(
                              row.session.distanceKm,
                              unitPreferences,
                              2,
                            )}
                          </p>
                          <p>
                            <span className='text-muted'>Temps:</span>{' '}
                            {formatDuration(row.session.durationMin)}
                          </p>
                          <p>
                            <span className='text-muted'>
                              {unitPreferences.speedUnit === 'kmh' ?
                                'Vit'
                              : 'Allure'}{' '}
                              ({speedUnitLabel(unitPreferences.speedUnit)}):
                            </span>{' '}
                            {row.session.speedKmh === null ?
                              'n/a'
                            : formatSpeedFromKmh(
                                row.session.speedKmh,
                                unitPreferences,
                                2,
                              )
                            }
                          </p>
                          <p>
                            <span className='text-muted'>FC:</span>{' '}
                            {row.session.hr === null ?
                              'n/a'
                            : row.session.hr.toFixed(0)}
                          </p>
                          <p className='col-span-2'>
                            <span className='text-muted'>
                              Cadence (
                              {cadenceUnitLabel(unitPreferences.cadenceUnit)}):
                            </span>{' '}
                            {row.session.cadence === null ?
                              'n/a'
                            : formatCadenceFromRpm(
                                row.session.cadence,
                                unitPreferences,
                                0,
                              )
                            }
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                : <div className='overflow-x-auto'>
                    <table className='min-w-full text-sm'>
                      <thead>
                        <tr className='border-b border-black/10'>
                          <th className='px-2 py-2 text-left'>Date</th>
                          <th className='px-2 py-2 text-left'>Activite</th>
                          <th className='px-2 py-2 text-left'>Sim</th>
                          <th className='px-2 py-2 text-left'>
                            Dist (
                            {distanceUnitLabel(unitPreferences.distanceUnit)})
                          </th>
                          <th className='px-2 py-2 text-left'>Temps</th>
                          <th className='px-2 py-2 text-left'>
                            {unitPreferences.speedUnit === 'kmh' ?
                              'Vit'
                            : 'Allure'}{' '}
                            ({speedUnitLabel(unitPreferences.speedUnit)})
                          </th>
                          <th className='px-2 py-2 text-left'>FC</th>
                          <th className='px-2 py-2 text-left'>
                            Cadence (
                            {cadenceUnitLabel(unitPreferences.cadenceUnit)})
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicalRowsForTable.map((row) => (
                          <tr
                            className={`cursor-pointer border-b border-black/5 ${row.session.id === referenceId ? 'bg-amber-50/60' : 'hover:bg-black/[0.03]'}`}
                            key={row.session.id}
                            onClick={() =>
                              setSelectedActivity(row.session.activity)
                            }
                          >
                            <td className='px-2 py-2'>{row.session.day}</td>
                            <td className='px-2 py-2'>
                              {row.session.activity.name}
                            </td>
                            <td className='px-2 py-2'>
                              {row.similarity.toFixed(2)}
                            </td>
                            <td className='px-2 py-2'>
                              {formatDistanceFromKm(
                                row.session.distanceKm,
                                unitPreferences,
                                2,
                              )}
                            </td>
                            <td className='px-2 py-2'>
                              {formatDuration(row.session.durationMin)}
                            </td>
                            <td className='px-2 py-2'>
                              {row.session.speedKmh === null ?
                                'n/a'
                              : formatSpeedFromKmh(
                                  row.session.speedKmh,
                                  unitPreferences,
                                  2,
                                )
                              }
                            </td>
                            <td className='px-2 py-2'>
                              {row.session.hr === null ?
                                'n/a'
                              : row.session.hr.toFixed(0)}
                            </td>
                            <td className='px-2 py-2'>
                              {row.session.cadence === null ?
                                'n/a'
                              : formatCadenceFromRpm(
                                  row.session.cadence,
                                  unitPreferences,
                                  0,
                                )
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                }
                </Card>
              : null}
            </>
          : null}
        </div>
      : <CorrelationBuilderPage embedded />
      }

      {selectedActivity ?
        <ActivityModal
          activity={selectedActivity}
          onClose={() => setSelectedActivity(null)}
        />
      : null}
    </div>
  );
}
