import { useEffect, useMemo, useState } from 'react';
import ReactECharts from '../components/LocalizedECharts';
import { apiRequest } from '../api/client';
import type { Activity, ActivityListResponse } from '../api/types';
import { ActivityModal } from '../components/ActivityModal';
import { AIInsightButton } from '../components/AIInsightButton';
import { Card } from '../components/Card';
import { FilterToggleButton } from '../components/FilterToggleButton';
import { PageHeader } from '../components/PageHeader';
import { roundIconButtonClass } from '../components/InfoHint';
import { SectionHeader } from '../components/SectionHeader';
import {
  inputClass,
  secondaryButtonCompactClass,
  selectClass,
} from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useI18n } from '../i18n/framework';
import {
  convertCorrelationMetricValue,
  convertDistanceKm,
  distanceUnitLabel,
  metricUnit,
  resolveUnitPreferences,
} from '../utils/units';

interface CorrelationResponse {
  method: 'pearson' | 'spearman';
  vars: string[];
  matrix: Array<{ x: string; y: string; value: number | null; n: number }>;
  scatter: {
    xVar: string;
    yVar: string;
    r: number | null;
    n: number;
    points: Array<{
      id: string;
      stravaActivityId: string;
      x: number;
      y: number;
      color?: number | null;
      label: string;
      date: string;
    }>;
  };
}

const metrics = [
  { value: 'distance', label: 'Distance' },
  { value: 'movingTime', label: 'Temps' },
  { value: 'elevGain', label: 'D+' },
  { value: 'avgSpeed', label: 'Vitesse moyenne' },
  { value: 'maxSpeed', label: 'Vitesse max' },
  { value: 'avgHR', label: 'FC moyenne' },
  { value: 'maxHR', label: 'FC max' },
  { value: 'avgWatts', label: 'Watts moyens' },
  { value: 'maxWatts', label: 'Watts max' },
  { value: 'cadence', label: 'Cadence' },
  { value: 'strideLength', label: 'Longueur de foulee (est.)' },
  { value: 'groundContactTime', label: 'Contact au sol (est.)' },
  { value: 'verticalOscillation', label: 'Oscillation verticale (est.)' },
  { value: 'sufferScore', label: 'Suffer score' },
  { value: 'kilojoules', label: 'Energie' },
  { value: 'calories', label: 'Calories' },
  { value: 'charge', label: 'Charge' },
];

const metricLabelByValue: Record<string, string> = metrics.reduce(
  (acc, metric) => {
    acc[metric.value] = metric.label;
    return acc;
  },
  {} as Record<string, string>,
);

const matrixMobileShortLabelByValue: Record<string, string> = {
  distance: 'Dist',
  movingTime: 'Temps',
  elevGain: 'D+',
  avgSpeed: 'Vit moy',
  maxSpeed: 'Vit max',
  avgHR: 'FC moy',
  maxHR: 'FC max',
  avgWatts: 'W moy',
  maxWatts: 'W max',
  cadence: 'Cad',
  strideLength: 'Foulee',
  groundContactTime: 'GCT',
  verticalOscillation: 'VOsc',
  sufferScore: 'Suffer',
  kilojoules: 'kJ',
  calories: 'Cal',
  charge: 'Charge',
};

const amateurFriendlyMetricValues = new Set([
  'distance',
  'movingTime',
  'elevGain',
  'avgSpeed',
  'avgHR',
  'cadence',
  'charge',
]);

const quickScatterPresets = [
  {
    id: 'endurance',
    label: 'Endurance',
    description: 'Vitesse vs FC, colore par cadence',
    xVar: 'avgSpeed',
    yVar: 'avgHR',
    colorVar: 'cadence',
  },
  {
    id: 'volume',
    label: 'Volume',
    description: 'Distance vs temps, sans couleur',
    xVar: 'distance',
    yVar: 'movingTime',
    colorVar: '',
  },
  {
    id: 'denivele',
    label: 'Denivele',
    description: 'Distance vs D+',
    xVar: 'distance',
    yVar: 'elevGain',
    colorVar: 'avgSpeed',
  },
];

const graphAuditBaseQuestion =
  "Agis comme un expert en sciences du sport et analyste de performance de haut niveau. Analyse les données de cette section avec une rigueur mathématique et scientifique sourcé par des documents prouvé et des thèses avec une neutralité absolue. Ton objectif est de produire un audit de performance et un rapport détaillé sans aucune complaisance (zéro 'sugar-coating') compare mes métriques aux autres athlètes similaires.";

function sampleForAi<T>(items: T[], maxItems = 50) {
  if (items.length <= maxItems) {
    return items;
  }
  const headCount = Math.ceil(maxItems / 2);
  const tailCount = Math.floor(maxItems / 2);
  return [...items.slice(0, headCount), ...items.slice(items.length - tailCount)];
}

type SectionKey =
  | 'activitySelection'
  | 'selectedActivities'
  | 'scatter'
  | 'matrix'
  | 'analysis';

interface CorrelationBuilderPageProps {
  embedded?: boolean;
}

export function CorrelationBuilderPage({
  embedded = false,
}: CorrelationBuilderPageProps) {
  const { t } = useI18n();
  const { token, user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const [xVar, setXVar] = useState('avgSpeed');
  const [yVar, setYVar] = useState('avgHR');
  const [colorVar, setColorVar] = useState('cadence');
  const [method, setMethod] = useState<'pearson' | 'spearman'>('pearson');
  const [showTrend, setShowTrend] = useState(true);
  const [nameQuery, setNameQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activitySort, setActivitySort] = useState('startDate:desc');
  const [collapsedSections, setCollapsedSections] = useState<
    Record<SectionKey, boolean>
  >({
    activitySelection: true,
    selectedActivities: true,
    scatter: false,
    matrix: true,
    analysis: true,
  });
  const [data, setData] = useState<CorrelationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null,
  );
  const [activityList, setActivityList] = useState<Activity[]>([]);
  const [totalActivities, setTotalActivities] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [isRemovingMissingColor, setIsRemovingMissingColor] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedActivities, setSelectedActivities] = useState<
    Record<string, Activity>
  >({});
  const [matrixVars, setMatrixVars] = useState<string[]>([
    'distance',
    'movingTime',
    'elevGain',
    'avgSpeed',
    'avgHR',
    'avgWatts',
    'cadence',
    'strideLength',
    'groundContactTime',
    'calories',
  ]);
  const [showAdvancedScatterMetrics, setShowAdvancedScatterMetrics] =
    useState(false);

  const selectedIdsQuery = useMemo(() => {
    return selectedIds.size > 0 ?
        `ids=${encodeURIComponent([...selectedIds].join(','))}`
      : '';
  }, [selectedIds]);
  const hasPinnedSelection = selectedIds.size > 0;

  const selectedList = useMemo(() => {
    return Object.values(selectedActivities).sort(
      (a, b) =>
        new Date(b.startDateLocal).getTime() -
        new Date(a.startDateLocal).getTime(),
    );
  }, [selectedActivities]);

  const varsParam = useMemo(() => {
    const base = new Set(
      matrixVars.length > 0 ?
        matrixVars
      : metrics.map((metric) => metric.value),
    );
    [xVar, yVar, colorVar].filter(Boolean).forEach((value) => base.add(value));
    return [...base].join(',');
  }, [matrixVars, xVar, yVar, colorVar]);
  const unitPreferences = useMemo(
    () => resolveUnitPreferences(user),
    [user],
  );
  const metricsWithUnit = useMemo(() => {
    return metrics.map((metric) => {
      const unit = metricUnit(metric.value, unitPreferences);
      return {
        ...metric,
        unit,
        label: unit ? `${metric.label} (${unit})` : metric.label,
      };
    });
  }, [unitPreferences]);

  const pointsCount = data?.scatter.points.length ?? 0;
  const colorMissingIds = useMemo(() => {
    const points = data?.scatter.points ?? [];
    if (!colorVar || points.length === 0) {
      return [] as string[];
    }
    return points
      .filter((point) => point.color === null || point.color === undefined)
      .map((point) => point.id);
  }, [data, colorVar]);
  const colorReadyIds = useMemo(() => {
    const points = data?.scatter.points ?? [];
    if (!colorVar || points.length === 0) {
      return [] as string[];
    }
    return points
      .filter((point) => point.color !== null && point.color !== undefined)
      .map((point) => point.id);
  }, [data, colorVar]);
  const colorMissingCount = colorMissingIds.length;
  const colorMeta = useMemo(
    () => metricsWithUnit.find((metric) => metric.value === colorVar),
    [metricsWithUnit, colorVar],
  );
  const tableCellClass = 'px-2 py-2';
  const tableTextClass = 'text-sm';
  const distanceColumnLabel = `Distance (${distanceUnitLabel(unitPreferences.distanceUnit)})`;
  const formatDistanceFromMeters = (distanceMeters: number) =>
    convertDistanceKm(distanceMeters / 1000, unitPreferences.distanceUnit).toFixed(2);
  const scatterMetrics = useMemo(() => {
    if (showAdvancedScatterMetrics) {
      return metricsWithUnit;
    }

    const selectedMetricValues = new Set(
      [xVar, yVar, colorVar].filter(Boolean),
    );

    return metricsWithUnit.filter(
      (metric) =>
        amateurFriendlyMetricValues.has(metric.value) ||
        selectedMetricValues.has(metric.value),
    );
  }, [metricsWithUnit, showAdvancedScatterMetrics, xVar, yVar, colorVar]);
  const resolvedMatrixVars = useMemo(
    () => (matrixVars.length > 0 ? matrixVars : (data?.vars ?? [])),
    [matrixVars, data],
  );

  const formatMatrixAxisLabel = (metricValue: string) => {
    const fullLabel = metricLabelByValue[metricValue] ?? metricValue;
    if (!isMobile) {
      return fullLabel;
    }
    return matrixMobileShortLabelByValue[metricValue] ?? fullLabel;
  };

  const matrixChartMinWidth = isMobile ? Math.max(520, resolvedMatrixVars.length * 80) : 0;
  const scatterChartMinWidth = isMobile ? 520 : 0;

  const matrixHighlights = useMemo(() => {
    if (resolvedMatrixVars.length === 0) {
      return [] as Array<{ x: string; y: string; r: number; n: number }>;
    }

    return (data?.matrix ?? [])
      .filter(
        (cell) =>
          cell.value !== null &&
          cell.x !== cell.y &&
          resolvedMatrixVars.includes(cell.x) &&
          resolvedMatrixVars.includes(cell.y),
      )
      .map((cell) => ({ x: cell.x, y: cell.y, r: cell.value as number, n: cell.n }))
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
      .slice(0, 8);
  }, [data, resolvedMatrixVars]);

  const baseAiContext = useMemo(
    () => ({
      filters: {
        nameQuery: nameQuery || null,
        typeFilter: typeFilter || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
        sort: activitySort,
      },
      metrics: {
        xVar,
        yVar,
        colorVar: colorVar || null,
        method,
        trendline: showTrend,
      },
      selection: {
        totalActivities,
        displayedPageCount: activityList.length,
        selectedCount: selectedIds.size,
      },
      scatter: {
        pointsCount,
        correlationR: data?.scatter.r ?? null,
        sampleSize: data?.scatter.n ?? 0,
      },
      units: {
        speed: unitPreferences.speedUnit,
        distance: unitPreferences.distanceUnit,
        elevation: unitPreferences.elevationUnit,
        cadence: unitPreferences.cadenceUnit,
      },
    }),
    [
      nameQuery,
      typeFilter,
      fromDate,
      toDate,
      activitySort,
      xVar,
      yVar,
      colorVar,
      method,
      showTrend,
      totalActivities,
      activityList.length,
      selectedIds.size,
      pointsCount,
      data?.scatter.r,
      data?.scatter.n,
      unitPreferences.speedUnit,
      unitPreferences.distanceUnit,
      unitPreferences.elevationUnit,
      unitPreferences.cadenceUnit,
    ],
  );

  const toggleSection = (section: SectionKey) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const analysis = useMemo(() => {
    const points = data?.scatter.points ?? [];
    if (points.length < 2) {
      return null;
    }
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const n = xs.length;
    const meanX = xs.reduce((sum, v) => sum + v, 0) / n;
    const meanY = ys.reduce((sum, v) => sum + v, 0) / n;
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i += 1) {
      const dx = xs[i] - meanX;
      numerator += dx * (ys[i] - meanY);
      denominator += dx * dx;
    }
    if (denominator === 0) {
      return { slope: null, intercept: null, r: data?.scatter.r ?? null, n };
    }
    const slope = numerator / denominator;
    const intercept = meanY - slope * meanX;
    return { slope, intercept, r: data?.scatter.r ?? null, n };
  }, [data]);
  const xMeta = useMemo(
    () => metricsWithUnit.find((metric) => metric.value === xVar),
    [metricsWithUnit, xVar],
  );
  const yMeta = useMemo(
    () => metricsWithUnit.find((metric) => metric.value === yVar),
    [metricsWithUnit, yVar],
  );
  const typeOptions = useMemo(() => {
    const types = new Set<string>();
    for (const activity of activityList) {
      const type = activity.sportType || activity.type;
      if (type) {
        types.add(type);
      }
    }
    return [...types].sort();
  }, [activityList]);

  useEffect(() => {
    if (!token) {
      return;
    }

    setError(null);

    const params = new URLSearchParams();
    params.set('method', method);
    params.set('vars', varsParam);
    params.set('scatterX', xVar);
    params.set('scatterY', yVar);
    params.set('scatterColor', colorVar);
    if (!hasPinnedSelection && nameQuery.trim()) {
      params.set('q', nameQuery.trim());
    }
    if (!hasPinnedSelection && fromDate) {
      params.set('localFrom', fromDate);
    }
    if (!hasPinnedSelection && toDate) {
      params.set('localTo', toDate);
    }
    if (!hasPinnedSelection && typeFilter) {
      params.set('type', typeFilter);
    }

    const url = `/analytics/correlations?${params.toString()}${selectedIdsQuery ? `&${selectedIdsQuery}` : ''}`;

    apiRequest<CorrelationResponse>(url, { token })
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Erreur correlations'),
      );
  }, [
    token,
    selectedIdsQuery,
    xVar,
    yVar,
    colorVar,
    method,
    nameQuery,
    typeFilter,
    fromDate,
    toDate,
    varsParam,
    hasPinnedSelection,
  ]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const params = new URLSearchParams();
    params.set('limit', '10');
    params.set('offset', String(offset));
    params.set('sort', activitySort);
    if (nameQuery.trim()) {
      params.set('q', nameQuery.trim());
    }
    if (fromDate) {
      params.set('localFrom', fromDate);
    }
    if (toDate) {
      params.set('localTo', toDate);
    }
    if (typeFilter) {
      params.set('type', typeFilter);
    }

    apiRequest<ActivityListResponse>(`/activities?${params.toString()}`, {
      token,
    })
      .then((res) => {
        setActivityList(res.items);
        setTotalActivities(res.total);
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : 'Erreur chargement activites',
        ),
      );
  }, [token, offset, nameQuery, typeFilter, fromDate, toDate, activitySort]);

  const handleSelectAllFiltered = async () => {
    if (!token || isSelectingAll) {
      return;
    }

    setError(null);
    setIsSelectingAll(true);

    try {
      const limit = 200;
      let currentOffset = 0;
      let total = Number.POSITIVE_INFINITY;
      const allActivities: Activity[] = [];

      while (currentOffset < total) {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        params.set('offset', String(currentOffset));
        params.set('sort', 'startDate:desc');
        if (nameQuery.trim()) {
          params.set('q', nameQuery.trim());
        }
        if (fromDate) {
          params.set('localFrom', fromDate);
        }
        if (toDate) {
          params.set('localTo', toDate);
        }
        if (typeFilter) {
          params.set('type', typeFilter);
        }

        const res = await apiRequest<ActivityListResponse>(
          `/activities?${params.toString()}`,
          { token },
        );
        allActivities.push(...res.items);
        total = res.total;
        currentOffset += res.items.length;

        if (res.items.length === 0) {
          break;
        }
      }

      const nextIds = new Set<string>();
      const nextActivities: Record<string, Activity> = {};
      allActivities.forEach((activity) => {
        nextIds.add(activity.id);
        nextActivities[activity.id] = activity;
      });

      setSelectedIds(nextIds);
      setSelectedActivities(nextActivities);
    } catch (err) {
      setError(
        err instanceof Error ?
          err.message
        : 'Erreur selection globale des activites',
      );
    } finally {
      setIsSelectingAll(false);
    }
  };

  const fetchActivitiesByIds = async (ids: string[]) => {
    if (!token || ids.length === 0) {
      return [] as Activity[];
    }

    const chunkSize = 100;
    const activities: Activity[] = [];

    for (let index = 0; index < ids.length; index += chunkSize) {
      const chunk = ids.slice(index, index + chunkSize);
      const params = new URLSearchParams();
      params.set('ids', chunk.join(','));
      params.set('limit', String(chunk.length));
      params.set('sort', 'startDate:desc');

      const res = await apiRequest<ActivityListResponse>(
        `/activities?${params.toString()}`,
        { token },
      );
      activities.push(...res.items);
    }

    return activities;
  };

  const handleRemoveActivitiesWithoutColor = async () => {
    if (
      !token ||
      isRemovingMissingColor ||
      !colorVar ||
      colorMissingIds.length === 0
    ) {
      return;
    }

    setError(null);
    setIsRemovingMissingColor(true);

    try {
      const nextIds = new Set<string>(
        selectedIds.size > 0 ? [...selectedIds] : [...new Set(colorReadyIds)],
      );

      colorMissingIds.forEach((activityId) => {
        nextIds.delete(activityId);
      });

      const nextActivities: Record<string, Activity> = {};
      const missingDetailsIds: string[] = [];

      nextIds.forEach((activityId) => {
        const existing = selectedActivities[activityId];
        if (existing) {
          nextActivities[activityId] = existing;
        } else {
          missingDetailsIds.push(activityId);
        }
      });

      if (missingDetailsIds.length > 0) {
        const fetched = await fetchActivitiesByIds(missingDetailsIds);
        fetched.forEach((activity) => {
          nextActivities[activity.id] = activity;
        });
      }

      setSelectedIds(nextIds);
      setSelectedActivities(nextActivities);
    } catch (err) {
      setError(
        err instanceof Error ?
          err.message
        : 'Erreur suppression des activites sans metrique couleur',
      );
    } finally {
      setIsRemovingMissingColor(false);
    }
  };

  const scatterOption = useMemo(() => {
    const points = (data?.scatter.points ?? []).map((point) => ({
      ...point,
      x: convertCorrelationMetricValue(xVar, point.x, unitPreferences),
      y: convertCorrelationMetricValue(yVar, point.y, unitPreferences),
      color:
        point.color === null || point.color === undefined || !colorVar ?
          point.color
        : convertCorrelationMetricValue(colorVar, point.color, unitPreferences),
    }));
    const colorValues = points
      .map((p) => p.color)
      .filter(
        (value): value is number => value !== null && value !== undefined,
      );
    const colorableCount = colorValues.length;
    const hasColor =
      colorVar && colorableCount > 0 && colorableCount === points.length;
    const xValues = points.map((p) => p.x);
    const yValues = points.map((p) => p.y);

    const computeRange = (values: number[]) => {
      if (values.length === 0) {
        return { min: undefined, max: undefined };
      }
      const min = Math.min(...values);
      const max = Math.max(...values);
      if (min === max) {
        const pad = Math.max(1, Math.abs(min) * 0.1);
        return { min: min - pad, max: max + pad };
      }
      const padding = (max - min) * 0.05;
      return { min: min - padding, max: max + padding };
    };

    const xRange = computeRange(xValues);
    const yRange = computeRange(yValues);
    const xSpan = (xRange.max ?? 0) - (xRange.min ?? 0);
    const ySpan = (yRange.max ?? 0) - (yRange.min ?? 0);
    const jitterBase = Math.max(
      0.01,
      Math.min(Math.abs(xSpan), Math.abs(ySpan)) * 0.005,
    );

    const keyCounts = new Map<string, number>();
    for (const point of points) {
      const key = `${point.x}|${point.y}`;
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }

    const trimUnit = (label: string) =>
      label.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const xAxisLabel = xMeta?.label ? trimUnit(xMeta.label) : (data?.scatter.xVar ?? 'x');
    const yAxisLabel = yMeta?.label ? trimUnit(yMeta.label) : (data?.scatter.yVar ?? 'y');
    const xLabel = xMeta?.label ?? data?.scatter.xVar ?? 'x';
    const yLabel = yMeta?.label ?? data?.scatter.yVar ?? 'y';
    const colorLabel =
      colorMeta?.unit ? `${colorMeta.label}`
      : colorVar ? colorVar
      : 'color';

    let trendLine: Array<[number, number]> = [];
    if (showTrend && points.length >= 2) {
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const n = xs.length;
      const meanX = xs.reduce((sum, v) => sum + v, 0) / n;
      const meanY = ys.reduce((sum, v) => sum + v, 0) / n;
      let numerator = 0;
      let denominator = 0;
      for (let i = 0; i < n; i += 1) {
        const dx = xs[i] - meanX;
        numerator += dx * (ys[i] - meanY);
        denominator += dx * dx;
      }
      if (denominator !== 0) {
        const slope = numerator / denominator;
        const intercept = meanY - slope * meanX;
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        trendLine = [
          [minX, slope * minX + intercept],
          [maxX, slope * maxX + intercept],
        ];
      }
    }

    return {
      tooltip: {
        formatter: (params: {
          data: [
            number,
            number,
            number | null,
            string,
            string,
            string,
            number,
            number,
          ];
        }) => {
          const [, , color, label, date, , rawX, rawY] = params.data;
          const colorLine =
            colorVar && color !== null && color !== undefined ?
              `<br/>${colorLabel}=${color.toFixed(2)}`
            : colorVar ? `<br/>${colorLabel}=n/a`
            : '';
          const xValue = Number.isFinite(rawX) ? rawX : params.data[0];
          const yValue = Number.isFinite(rawY) ? rawY : params.data[1];
          return `${label}<br/>${date}<br/>${xLabel}=${xValue.toFixed(2)}, ${yLabel}=${yValue.toFixed(2)}${colorLine}`;
        },
      },
      xAxis: {
        type: 'value',
        name: xAxisLabel,
        nameLocation: 'middle',
        nameGap: isMobile ? 26 : 32,
        min: xRange.min,
        max: xRange.max,
        scale: true,
        axisLabel: {
          formatter: (value: number) => `${value}`,
          fontSize: isMobile ? 10 : 11,
        },
      },
      yAxis: {
        type: 'value',
        name: yAxisLabel,
        nameLocation: 'middle',
        nameGap: isMobile ? 42 : 52,
        min: yRange.min,
        max: yRange.max,
        scale: true,
        axisLabel: {
          formatter: (value: number) => `${value}`,
          fontSize: isMobile ? 10 : 11,
        },
      },
      visualMap:
        colorVar && hasColor ?
          {
            min: Math.min(...colorValues),
            max: Math.max(...colorValues),
            dimension: 2,
            seriesIndex: 0,
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: 0,
            inRange: {
              color: ['#1d4ed8', '#0ea5e9', '#22c55e', '#eab308', '#dc2626'],
            },
            textStyle: {
              fontSize: isMobile ? 10 : 11,
            },
          }
        : undefined,
      grid: {
        top: 24,
        left: isMobile ? 62 : 84,
        right: isMobile ? 20 : 32,
        bottom: isMobile ? 76 : 84,
        containLabel: true,
      },
      dataZoom: [{ type: 'inside' }, ...(isMobile ? [] : [{ type: 'slider' }])],
      series: [
        {
          type: 'scatter',
          symbolSize: isMobile ? 10 : 9,
          itemStyle: { opacity: 0.85 },
          encode: {
            x: 0,
            y: 1,
            value: 2,
          },
          data: points.map((point) => {
            const key = `${point.x}|${point.y}`;
            const isDuplicate = (keyCounts.get(key) ?? 0) > 1;
            let plotX = point.x;
            let plotY = point.y;

            if (isDuplicate) {
              let hash = 0;
              for (let i = 0; i < point.id.length; i += 1) {
                hash = (hash * 31 + point.id.charCodeAt(i)) % 360;
              }
              const angle = (hash * Math.PI) / 180;
              plotX += Math.cos(angle) * jitterBase;
              plotY += Math.sin(angle) * jitterBase;
            }

            return [
              plotX,
              plotY,
              hasColor ? (point.color ?? null) : null,
              point.label,
              point.date,
              point.id,
              point.x,
              point.y,
            ];
          }),
        },
        ...(trendLine.length === 2 ?
          [
            {
              type: 'line',
              data: trendLine,
              showSymbol: false,
              lineStyle: { color: '#0f766e', width: 2 },
              emphasis: { disabled: true },
              tooltip: { show: false },
            },
          ]
        : []),
      ],
    };
  }, [data, colorVar, colorMeta, xMeta, yMeta, showTrend, xVar, yVar, unitPreferences, isMobile]);

  const matrixOption = useMemo(() => {
    if (resolvedMatrixVars.length === 0) {
      return null;
    }

    const matrix = (data?.matrix ?? []).filter(
      (cell) =>
        resolvedMatrixVars.includes(cell.x) &&
        resolvedMatrixVars.includes(cell.y) &&
        cell.value !== null,
    );
    return {
      tooltip: {
        formatter: (params: { data: [number, number, number, number] }) => {
          const [xIdx, yIdx, value, n] = params.data;
          const xVarName = resolvedMatrixVars[xIdx];
          const yVarName = resolvedMatrixVars[yIdx];
          const xLabel = metricLabelByValue[xVarName] ?? xVarName;
          const yLabel = metricLabelByValue[yVarName] ?? yVarName;
          return `${yLabel} vs ${xLabel}<br/>r=${value.toFixed(3)} / n=${n}`;
        },
      },
      grid: {
        top: isMobile ? 36 : 28,
        left: isMobile ? 70 : 72,
        right: isMobile ? 16 : 24,
        bottom: isMobile ? 92 : 48,
      },
      xAxis: {
        type: 'category',
        data: resolvedMatrixVars,
        axisLabel: {
          rotate: isMobile ? 52 : 35,
          interval: 0,
          fontSize: isMobile ? 10 : 11,
          hideOverlap: true,
          formatter: (value: string) => formatMatrixAxisLabel(value),
        },
      },
      yAxis: {
        type: 'category',
        data: resolvedMatrixVars,
        axisLabel: {
          fontSize: isMobile ? 10 : 11,
          formatter: (value: string) => formatMatrixAxisLabel(value),
        },
      },
      visualMap: {
        min: -1,
        max: 1,
        dimension: 2,
        seriesIndex: 0,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        inRange: {
          color: ['#1d4ed8', '#0ea5e9', '#22c55e', '#eab308', '#dc2626'],
        },
        textStyle: {
          fontSize: isMobile ? 10 : 11,
        },
      },
      series: [
        {
          type: 'heatmap',
          encode: {
            x: 0,
            y: 1,
            value: 2,
          },
          data: matrix.map((cell) => [
            resolvedMatrixVars.indexOf(cell.x),
            resolvedMatrixVars.indexOf(cell.y),
            cell.value as number,
            cell.n,
          ]),
          label: { show: false },
          emphasis: {
            itemStyle: { shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.15)' },
          },
        },
      ],
    };
  }, [data, resolvedMatrixVars, isMobile]);

  const handlePointClick = async (params: {
    data: [
      number,
      number,
      number | null,
      string,
      string,
      string,
      number,
      number,
    ];
  }) => {
    const activityId = params.data[5];

    if (!activityId || !token) {
      return;
    }

    try {
      const activity = await apiRequest<Activity>(`/activities/${activityId}`, {
        token,
      });
      setSelectedActivity(activity);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de charger l'activite",
      );
    }
  };

  return (
    <div>
      {!embedded ? (
        <PageHeader
          description='Selectionne des activites, puis clique sur les metriques a correler. Aucun champ manuel.'
          title={t('pages.correlationBuilder.title')}
        />
      ) : null}
      <Card>
        <SectionHeader
          title='1. Selection des activites'
          subtitle={`${selectedIds.size} selectionnees`}
          infoHint={{
            title: 'Selection',
            description:
              'Filtre la liste par nom, date et type puis selectionne une page ou toutes les activites filtrees.',
          }}
          rightActions={
            <FilterToggleButton
              collapsed={collapsedSections.activitySelection}
              onToggle={() => toggleSection('activitySelection')}
            />
          }
        />
        {hasPinnedSelection ? (
          <p className='mb-3 text-[11px] text-muted'>
            Mode selection actif: la recherche de la liste n'affecte pas le graphe tant que des activites restent selectionnees.
          </p>
        ) : null}
        {collapsedSections.activitySelection ?
          <p className='text-[11px] text-muted/80'>Filtres masques.</p>
        : <>
            <div className='mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5'>
              <input
                className={inputClass}
                type='text'
                value={nameQuery}
                placeholder='Nom de l activite'
                onChange={(event) => {
                  setNameQuery(event.target.value);
                  setOffset(0);
                }}
              />
              <input
                className={inputClass}
                type='date'
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  setOffset(0);
                }}
              />
              <input
                className={inputClass}
                type='date'
                value={toDate}
                onChange={(event) => {
                  setToDate(event.target.value);
                  setOffset(0);
                }}
              />
              <select
                className={selectClass}
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value);
                  setOffset(0);
                }}
              >
                <option value=''>Tous types</option>
                {typeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={activitySort}
                onChange={(event) => {
                  setActivitySort(event.target.value);
                  setOffset(0);
                }}
              >
                <option value='startDate:desc'>Tri: date desc</option>
                <option value='startDate:asc'>Tri: date asc</option>
                <option value='distance:desc'>Tri: distance desc</option>
                <option value='movingTime:desc'>Tri: temps desc</option>
                <option value='totalElevationGain:desc'>Tri: D+ desc</option>
              </select>
            </div>
            <div className='mb-3 flex flex-wrap gap-2 text-xs'>
              <button
                className={secondaryButtonCompactClass}
                type='button'
                onClick={() => {
                  const next = new Set(selectedIds);
                  const nextActivities = { ...selectedActivities };
                  activityList.forEach((activity) => {
                    next.add(activity.id);
                    nextActivities[activity.id] = activity;
                  });
                  setSelectedIds(next);
                  setSelectedActivities(nextActivities);
                }}
              >
                Selectionner la page
              </button>
              <button
                className={secondaryButtonCompactClass}
                type='button'
                onClick={handleSelectAllFiltered}
                disabled={isSelectingAll}
              >
                {isSelectingAll ?
                  'Selection en cours...'
                : 'Selectionner toutes les donnees filtrees'}
              </button>
              <button
                className={secondaryButtonCompactClass}
                type='button'
                onClick={() => {
                  setSelectedIds(new Set());
                  setSelectedActivities({});
                }}
              >
                Vider la selection
              </button>
            </div>
            {isMobile ?
              <div className='space-y-2'>
                {activityList.map((activity) => (
                  <article
                    key={activity.id}
                    className='rounded-xl border border-black/10 bg-black/[0.03] p-3'
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <p className='break-words text-sm font-medium'>
                          {activity.name}
                        </p>
                        <p className='mt-1 text-xs text-muted'>
                          {new Date(activity.startDateLocal).toLocaleDateString()}{' '}
                          · {activity.sportType || activity.type}
                        </p>
                        <p className='mt-1 text-xs text-muted'>
                          {distanceColumnLabel}:{' '}
                          {formatDistanceFromMeters(activity.distance)}
                        </p>
                      </div>
                      <label className='inline-flex items-center gap-2 text-xs font-medium'>
                        <input
                          type='checkbox'
                          checked={selectedIds.has(activity.id)}
                          onChange={() => {
                            const next = new Set(selectedIds);
                            const nextActivities = { ...selectedActivities };
                            if (next.has(activity.id)) {
                              next.delete(activity.id);
                              delete nextActivities[activity.id];
                            } else {
                              next.add(activity.id);
                              nextActivities[activity.id] = activity;
                            }
                            setSelectedIds(next);
                            setSelectedActivities(nextActivities);
                          }}
                        />
                        Select
                      </label>
                    </div>
                    <div className='mt-2 flex justify-end'>
                      <button
                        className={roundIconButtonClass}
                        type='button'
                        onClick={() => setSelectedActivity(activity)}
                        title='Voir le recap activite'
                      >
                        i
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            : <div className='overflow-x-auto'>
                <table className={`min-w-[800px] ${tableTextClass}`}>
                  <thead>
                    <tr className='border-b border-black/10 text-left'>
                      <th className={`${tableCellClass} whitespace-nowrap`}>
                        Select
                      </th>
                      <th className={`${tableCellClass} whitespace-nowrap`}>
                        Date
                      </th>
                      <th className={`${tableCellClass} whitespace-nowrap`}>
                        Nom
                      </th>
                      <th className={`${tableCellClass} whitespace-nowrap`}>
                        Type
                      </th>
                      <th className={`${tableCellClass} whitespace-nowrap`}>
                        {distanceColumnLabel}
                      </th>
                      <th className={`${tableCellClass} whitespace-nowrap`}>
                        Info
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityList.map((activity) => (
                      <tr
                        key={activity.id}
                        className='border-b border-black/5 hover:bg-black/5'
                      >
                        <td className={tableCellClass}>
                          <input
                            type='checkbox'
                            checked={selectedIds.has(activity.id)}
                            onChange={() => {
                              const next = new Set(selectedIds);
                              const nextActivities = {
                                ...selectedActivities,
                              };
                              if (next.has(activity.id)) {
                                next.delete(activity.id);
                                delete nextActivities[activity.id];
                              } else {
                                next.add(activity.id);
                                nextActivities[activity.id] = activity;
                              }
                              setSelectedIds(next);
                              setSelectedActivities(nextActivities);
                            }}
                          />
                        </td>
                        <td className={`${tableCellClass} whitespace-nowrap`}>
                          {new Date(
                            activity.startDateLocal,
                          ).toLocaleDateString()}
                        </td>
                        <td className={`${tableCellClass} whitespace-nowrap`}>
                          {activity.name}
                        </td>
                        <td className={`${tableCellClass} whitespace-nowrap`}>
                          {activity.sportType || activity.type}
                        </td>
                        <td className={`${tableCellClass} whitespace-nowrap`}>
                          {formatDistanceFromMeters(activity.distance)}
                        </td>
                        <td className={tableCellClass}>
                          <button
                            className={roundIconButtonClass}
                            type='button'
                            onClick={() => setSelectedActivity(activity)}
                            title='Voir le recap activite'
                          >
                            i
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
            <div className='mt-3 flex items-center justify-between text-xs text-muted'>
              <span>
                {offset + 1}-
                {Math.min(offset + activityList.length, totalActivities)} /{' '}
                {totalActivities}
              </span>
              <div className='flex gap-2'>
                <button
                  className='rounded-lg border border-black/20 px-3 py-1 hover:bg-black/5 disabled:opacity-40'
                  type='button'
                  disabled={offset === 0}
                  onClick={() => setOffset((prev) => Math.max(0, prev - 10))}
                >
                  Prev
                </button>
                <button
                  className='rounded-lg border border-black/20 px-3 py-1 hover:bg-black/5 disabled:opacity-40'
                  type='button'
                  disabled={offset + activityList.length >= totalActivities}
                  onClick={() => setOffset((prev) => prev + 10)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        }
      </Card>

      <Card>
        <SectionHeader
          title='2. Activites selectionnees'
          subtitle={`${selectedList.length} selectionnees`}
          infoHint={{
            title: 'Selection',
            description:
              'Liste des activites utilisees pour la correlation. Supprime une activite pour la retirer du calcul.',
          }}
          collapsed={collapsedSections.selectedActivities}
          onToggleCollapse={() => toggleSection('selectedActivities')}
        />
        {collapsedSections.selectedActivities ?
          <p className='text-xs text-muted'>Section repliee.</p>
        : selectedList.length === 0 ?
          <p className='text-sm text-muted'>Aucune activite selectionnee.</p>
        : isMobile ?
          <div className='space-y-2'>
            {selectedList.map((activity) => (
              <article
                key={activity.id}
                className='rounded-xl border border-black/10 bg-black/[0.03] p-3'
              >
                <p className='break-words text-sm font-medium'>
                  {activity.name}
                </p>
                <p className='mt-1 text-xs text-muted'>
                  {new Date(activity.startDateLocal).toLocaleDateString()} ·{' '}
                  {activity.sportType || activity.type}
                </p>
                <p className='mt-1 text-xs text-muted'>
                  {distanceColumnLabel}:{' '}
                  {formatDistanceFromMeters(activity.distance)}
                </p>
                <div className='mt-3 flex items-center justify-end gap-2'>
                  <button
                    className='rounded-lg border border-black/20 px-3 py-1 text-xs hover:bg-black/5'
                    type='button'
                    onClick={() => {
                      const next = new Set(selectedIds);
                      const nextActivities = { ...selectedActivities };
                      next.delete(activity.id);
                      delete nextActivities[activity.id];
                      setSelectedIds(next);
                      setSelectedActivities(nextActivities);
                    }}
                  >
                    Retirer
                  </button>
                  <button
                    className={roundIconButtonClass}
                    type='button'
                    onClick={() => setSelectedActivity(activity)}
                    title='Voir le recap activite'
                  >
                    i
                  </button>
                </div>
              </article>
            ))}
          </div>
        : <div className='overflow-x-auto'>
            <table className={`min-w-[800px] ${tableTextClass}`}>
              <thead>
                <tr className='border-b border-black/10 text-left'>
                  <th className={`${tableCellClass} whitespace-nowrap`}>
                    Date
                  </th>
                  <th className={`${tableCellClass} whitespace-nowrap`}>Nom</th>
                  <th className={`${tableCellClass} whitespace-nowrap`}>
                    Type
                  </th>
                  <th className={`${tableCellClass} whitespace-nowrap`}>
                    {distanceColumnLabel}
                  </th>
                  <th className={`${tableCellClass} whitespace-nowrap`}>
                    Action
                  </th>
                  <th className={`${tableCellClass} whitespace-nowrap`}>
                    Info
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedList.map((activity) => (
                  <tr
                    key={activity.id}
                    className='border-b border-black/5 hover:bg-black/5'
                  >
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {new Date(activity.startDateLocal).toLocaleDateString()}
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {activity.name}
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {activity.sportType || activity.type}
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatDistanceFromMeters(activity.distance)}
                    </td>
                    <td className={tableCellClass}>
                      <button
                        className='rounded-lg border border-black/20 px-3 py-1 text-xs hover:bg-black/5'
                        type='button'
                        onClick={() => {
                          const next = new Set(selectedIds);
                          const nextActivities = { ...selectedActivities };
                          next.delete(activity.id);
                          delete nextActivities[activity.id];
                          setSelectedIds(next);
                          setSelectedActivities(nextActivities);
                        }}
                      >
                        Retirer
                      </button>
                    </td>
                    <td className={tableCellClass}>
                      <button
                        className={roundIconButtonClass}
                        type='button'
                        onClick={() => setSelectedActivity(activity)}
                        title='Voir le recap activite'
                      >
                        i
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      </Card>

      {error ?
        <p className='text-sm text-red-700'>{error}</p>
      : null}

      <Card>
        <SectionHeader
          title='3. Nuage de points'
          subtitle={`Clique sur un point pour ouvrir l'activite. Points affiches: ${pointsCount} / ${selectedIds.size || 'toutes'}`}
          infoHint={{
            title: 'Lecture',
            description:
              'Chaque point represente une activite. La couleur correspond a la 3e metrique choisie.',
          }}
          collapsed={collapsedSections.scatter}
          onToggleCollapse={() => toggleSection('scatter')}
          className='mb-2'
        />
        {collapsedSections.scatter ?
          <p className='text-xs text-muted'>Section repliee.</p>
        : <>
            <div className='mb-3 rounded-xl border border-black/10 bg-black/[0.03] p-3'>
              <p className='text-xs font-semibold uppercase tracking-wide text-muted'>
                Mode simple
              </p>
              <p className='mt-1 text-xs text-muted'>
                Choisis un profil, puis ajuste seulement si besoin.
              </p>
              <div className='mt-2 flex flex-wrap gap-2'>
                {quickScatterPresets.map((preset) => {
                  const active =
                    xVar === preset.xVar &&
                    yVar === preset.yVar &&
                    colorVar === preset.colorVar;
                  return (
                    <button
                      key={preset.id}
                      type='button'
                      className={`rounded-lg border px-3 py-1 text-xs ${active ? 'border-ink bg-ink text-white' : 'border-black/20 hover:bg-black/5'}`}
                      onClick={() => {
                        setXVar(preset.xVar);
                        setYVar(preset.yVar);
                        setColorVar(preset.colorVar);
                      }}
                      title={preset.description}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <div className='mt-2 flex flex-wrap items-center gap-2'>
                <button
                  type='button'
                  className='rounded-lg border border-black/20 px-3 py-1 text-xs hover:bg-black/5'
                  onClick={() =>
                    setShowAdvancedScatterMetrics((prev) => !prev)
                  }
                >
                  {showAdvancedScatterMetrics ?
                    'Masquer les metriques avancees'
                  : 'Voir plus de metriques'}
                </button>
                <p className='text-[11px] text-muted'>
                  Conseille pour debuter: distance, temps, vitesse, FC.
                </p>
              </div>
            </div>
            <details className='mb-3 rounded-xl border border-black/10 p-3'>
              <summary className='cursor-pointer text-xs font-medium text-muted'>
                Options avancees (methode et trendline)
              </summary>
              <div className='mt-3 grid gap-2 lg:grid-cols-2'>
                <div>
                  <p className='text-xs uppercase tracking-wide text-muted'>
                    Methode de correlation
                  </p>
                  <div className='mt-2 flex flex-wrap gap-2'>
                    {(['pearson', 'spearman'] as const).map((value) => (
                      <button
                        key={value}
                        type='button'
                        className={`rounded-lg border px-3 py-1 text-xs ${method === value ? 'border-ink bg-ink text-white' : 'border-black/20 hover:bg-black/5'}`}
                        onClick={() => setMethod(value)}
                      >
                        {value === 'pearson' ? 'Lineaire' : 'Classement'}
                      </button>
                    ))}
                  </div>
                  <p className='mt-2 text-[11px] text-muted'>
                    Lineaire = simple. Classement = plus robuste si tes donnees
                    ont des extremes.
                  </p>
                </div>
                <div>
                  <p className='text-xs uppercase tracking-wide text-muted'>
                    Ligne de tendance
                  </p>
                  <div className='mt-2 flex flex-wrap items-center gap-2 text-xs text-muted'>
                    <label className='flex items-center gap-2'>
                      <input
                        type='checkbox'
                        checked={showTrend}
                        onChange={(event) => setShowTrend(event.target.checked)}
                      />
                      Afficher la tendance
                    </label>
                  </div>
                </div>
              </div>
            </details>
            <div className='mb-3 grid gap-2 lg:grid-cols-3'>
              <div>
                <p className='text-xs uppercase tracking-wide text-muted'>
                  Axe X
                </p>
                <div className='mt-2 flex flex-wrap gap-2'>
                  {scatterMetrics.map((metric) => (
                    <button
                      key={`x-${metric.value}`}
                      type='button'
                      className={`rounded-lg border px-3 py-1 text-xs ${xVar === metric.value ? 'border-ink bg-ink text-white' : 'border-black/20 hover:bg-black/5'}`}
                      onClick={() => setXVar(metric.value)}
                    >
                      {metric.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className='text-xs uppercase tracking-wide text-muted'>
                  Axe Y
                </p>
                <div className='mt-2 flex flex-wrap gap-2'>
                  {scatterMetrics.map((metric) => (
                    <button
                      key={`y-${metric.value}`}
                      type='button'
                      className={`rounded-lg border px-3 py-1 text-xs ${yVar === metric.value ? 'border-ink bg-ink text-white' : 'border-black/20 hover:bg-black/5'}`}
                      onClick={() => setYVar(metric.value)}
                    >
                      {metric.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className='text-xs uppercase tracking-wide text-muted'>
                  Couleur
                </p>
                <div className='mt-2 flex flex-wrap gap-2'>
                  <button
                    type='button'
                    className={`rounded-lg border px-3 py-1 text-xs ${colorVar === '' ? 'border-ink bg-ink text-white' : 'border-black/20 hover:bg-black/5'}`}
                    onClick={() => setColorVar('')}
                  >
                    Aucune couleur
                  </button>
                  {scatterMetrics.map((metric) => (
                    <button
                      key={`c-${metric.value}`}
                      type='button'
                      className={`rounded-lg border px-3 py-1 text-xs ${colorVar === metric.value ? 'border-ink bg-ink text-white' : 'border-black/20 hover:bg-black/5'}`}
                      onClick={() => setColorVar(metric.value)}
                    >
                      {metric.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {pointsCount === 0 ?
              <p className='mb-2 text-xs text-amber-700'>
                Aucune activite n'a les deux metriques choisies. Change X/Y ou
                selectionne des activites avec ces donnees.
              </p>
            : null}
            {colorMissingCount > 0 ?
              <div className='mb-2 flex flex-wrap items-center gap-2'>
                <p className='text-xs text-amber-700'>
                  {colorMissingCount} activite(s) n'ont pas la metrique de
                  couleur. Couleur desactivee pour afficher tous les points.
                </p>
                <button
                  type='button'
                  className='rounded-lg border border-amber-700/30 px-2 py-1 text-xs text-amber-800 hover:bg-amber-50 disabled:opacity-40'
                  onClick={handleRemoveActivitiesWithoutColor}
                  disabled={isRemovingMissingColor}
                >
                  {isRemovingMissingColor ?
                    'Retrait en cours...'
                  : 'Retirer automatiquement'}
                </button>
              </div>
            : null}
            <div className='mb-2 flex justify-end'>
              <AIInsightButton
                token={token}
                payload={{
                  page: 'correlation_graph',
                  sectionKey: 'scatter',
                  sectionTitle: 'Nuage de points',
                  sectionSubtitle: `${pointsCount} points · X:${xVar} · Y:${yVar}${colorVar ? ` · C:${colorVar}` : ''}`,
                  question: graphAuditBaseQuestion,
                  context: {
                    ...baseAiContext,
                    graph: {
                      type: 'scatter',
                      method,
                      xMetric: xVar,
                      yMetric: yVar,
                      colorMetric: colorVar || null,
                      trendline: showTrend,
                      pointCount: pointsCount,
                      correlationR: data?.scatter.r ?? null,
                      sampleSize: data?.scatter.n ?? 0,
                      displayedPoints: sampleForAi(
                        (data?.scatter.points ?? []).map((point) => ({
                          id: point.id,
                          date: point.date,
                          x: Number(
                            convertCorrelationMetricValue(
                              xVar,
                              point.x,
                              unitPreferences,
                            ).toFixed(3),
                          ),
                          y: Number(
                            convertCorrelationMetricValue(
                              yVar,
                              point.y,
                              unitPreferences,
                            ).toFixed(3),
                          ),
                          color:
                            !colorVar ||
                            point.color === null ||
                            point.color === undefined ?
                              null
                            : Number(
                                convertCorrelationMetricValue(
                                  colorVar,
                                  point.color,
                                  unitPreferences,
                                ).toFixed(3),
                              ),
                        })),
                        120,
                      ),
                      selectionProfile: {
                        selectedActivitiesPreview: sampleForAi(
                          selectedList.map((activity) => ({
                            id: activity.id,
                            date: activity.startDateLocal,
                            type: activity.sportType || activity.type,
                            distanceKm: Number(
                              convertDistanceKm(
                                activity.distance / 1000,
                                unitPreferences.distanceUnit,
                              ).toFixed(2),
                            ),
                            movingTimeMin: Number(
                              (activity.movingTime / 60).toFixed(1),
                            ),
                          })),
                          35,
                        ),
                      },
                    },
                  },
                }}
              />
            </div>
            <div className={isMobile ? 'overflow-x-auto pb-1' : ''}>
              <ReactECharts
                option={scatterOption}
                style={{
                  height: isMobile ? 520 : 560,
                  minWidth: scatterChartMinWidth,
                }}
                onEvents={{
                  click: handlePointClick,
                }}
              />
            </div>
          </>
        }
      </Card>

      <Card>
        <SectionHeader
          title='4. Matrice des correlations (avance)'
          subtitle='Vue experte des relations entre metriques'
          infoHint={{
            title: 'Lecture',
            description:
              'r proche de 1 = relation positive forte. r proche de -1 = relation negative forte.',
          }}
          collapsed={collapsedSections.matrix}
          onToggleCollapse={() => toggleSection('matrix')}
          className='mb-2'
        />
        {collapsedSections.matrix ?
          <p className='text-xs text-muted'>Section repliee.</p>
        : <>
            <div className='mb-3'>
              <div className='mb-2 flex items-center justify-between'>
                <p className='text-xs uppercase tracking-wide text-muted'>
                  Variables matrice
                </p>
                <AIInsightButton
                  token={token}
                  payload={{
                    page: 'correlation_graph',
                    sectionKey: 'matrix',
                    sectionTitle: 'Matrice des correlations',
                    sectionSubtitle: `${matrixVars.length || (data?.vars?.length ?? 0)} variables`,
                    question: graphAuditBaseQuestion,
                    context: {
                      ...baseAiContext,
                      graph: {
                        type: 'matrix',
                        method,
                        selectedVars: matrixVars,
                        strongestPairs: matrixHighlights,
                        matrixSample: sampleForAi(
                          (data?.matrix ?? [])
                            .filter(
                              (cell) =>
                                cell.value !== null &&
                                (matrixVars.length === 0 ||
                                  (matrixVars.includes(cell.x) &&
                                    matrixVars.includes(cell.y))),
                            )
                            .map((cell) => ({
                              x: cell.x,
                              y: cell.y,
                              r:
                                cell.value === null ?
                                  null
                                : Number(cell.value.toFixed(4)),
                              n: cell.n,
                            })),
                          140,
                        ),
                      },
                    },
                  }}
                />
              </div>
              <div className='mt-2 flex flex-wrap gap-2'>
                {metricsWithUnit.map((metric) => {
                  const active = matrixVars.includes(metric.value);
                  return (
                    <button
                      key={`m-${metric.value}`}
                      type='button'
                      className={`rounded-lg border px-3 py-1 text-xs ${active ? 'border-ink bg-ink text-white' : 'border-black/20 hover:bg-black/5'}`}
                      onClick={() => {
                        setMatrixVars((prev) => {
                          if (prev.includes(metric.value)) {
                            return prev.filter(
                              (value) => value !== metric.value,
                            );
                          }
                          return [...prev, metric.value];
                        });
                      }}
                    >
                      {metric.label}
                    </button>
                  );
                })}
                <button
                  type='button'
                  className='rounded-lg border border-black/20 px-3 py-1 text-xs hover:bg-black/5'
                  onClick={() =>
                    setMatrixVars(metricsWithUnit.map((metric) => metric.value))
                  }
                >
                  Tout
                </button>
                <button
                  type='button'
                  className='rounded-lg border border-black/20 px-3 py-1 text-xs hover:bg-black/5'
                  onClick={() => setMatrixVars([])}
                >
                  Aucun
                </button>
              </div>
            </div>
            {matrixOption ?
              <div className={isMobile ? 'overflow-x-auto pb-1' : ''}>
                <ReactECharts
                  option={matrixOption}
                  style={{
                    height: isMobile ? 460 : 420,
                    minWidth: matrixChartMinWidth,
                  }}
                />
              </div>
            : <p className='text-xs text-muted'>
                Selectionne des variables pour la matrice.
              </p>
            }
          </>
        }
      </Card>

      <Card>
        <SectionHeader
          title='5. Analyse (avancee)'
          subtitle='Resume automatique de la correlation'
          infoHint={{
            title: 'Interpretation',
            description:
              'r proche de 1 = forte correlation positive. r proche de -1 = forte correlation negative. r proche de 0 = faible relation.',
          }}
          collapsed={collapsedSections.analysis}
          onToggleCollapse={() => toggleSection('analysis')}
          className='mb-2'
        />
        {collapsedSections.analysis ?
          <p className='text-xs text-muted'>Section repliee.</p>
        : analysis ?
          <div className='grid gap-2 text-sm'>
            <p>
              Points: <strong>{analysis.n}</strong>. r:{' '}
              <strong>
                {analysis.r !== null && Number.isFinite(analysis.r) ?
                  analysis.r.toFixed(3)
                : 'n/a'}
              </strong>
              .
            </p>
            <p>
              Tendance:{' '}
              {analysis.slope === null || analysis.intercept === null ?
                'non calculable'
              : `y = ${analysis.slope.toFixed(3)}x + ${analysis.intercept.toFixed(2)}`
              }
              .
            </p>
            <p>
              Couleur:{' '}
              {colorVar ?
                `${colorMeta?.label ?? colorVar}${colorMeta?.unit ? ` (${colorMeta.unit})` : ''}`
              : 'aucune'}
              . Dans les tooltips: valeur de la couleur (ex: cadence = 160{" "}
              {colorMeta?.unit ?? "unite"}).
            </p>
          </div>
        : <p className='text-xs text-muted'>
            Ajoute au moins 2 activites pour calculer une tendance.
          </p>
        }
      </Card>

      {selectedActivity ?
        <ActivityModal
          activity={selectedActivity}
          onClose={() => setSelectedActivity(null)}
        />
      : null}
    </div>
  );
}
