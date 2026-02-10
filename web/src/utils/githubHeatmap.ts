import { heatmapTheme } from './heatmapTheme';

interface DayPoint {
  date: string;
  value: number;
}

function quantile(sortedValues: number[], q: number) {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = (sortedValues.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedValues[lower];
  }

  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export function buildGithubHeatmapOption(points: DayPoint[], unitLabel: string) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    return {
      title: {
        text: "Pas de donnees importees",
        left: 0,
        textStyle: { fontSize: 12, fontWeight: 600 },
      },
    };
  }

  const start = sorted[0].date;
  const end = sorted[sorted.length - 1].date;
  const positiveValues = sorted.map((point) => point.value).filter((value) => value > 0).sort((a, b) => a - b);

  const q1 = quantile(positiveValues, 0.25);
  const q2 = quantile(positiveValues, 0.5);
  const q3 = quantile(positiveValues, 0.75);
  const q4 = quantile(positiveValues, 0.9);
  const max = positiveValues.length > 0 ? positiveValues[positiveValues.length - 1] : 0;

  return {
    backgroundColor: heatmapTheme.chartBackground,
    tooltip: {
      formatter: (params: { data: [string, number] }) => {
        const [date, value] = params.data;
        return `${date}<br/>${value.toFixed(2)} ${unitLabel}`;
      },
    },
    calendar: {
      top: 34,
      left: 16,
      right: 16,
      bottom: 46,
      cellSize: [14, 14],
      range: [start, end],
      splitLine: {
        show: true,
        lineStyle: { color: heatmapTheme.gridLine, width: 1 },
      },
      yearLabel: { show: false },
      monthLabel: {
        nameMap: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        margin: 10,
        color: heatmapTheme.label,
      },
      dayLabel: {
        firstDay: 1,
        nameMap: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        color: heatmapTheme.label,
      },
      itemStyle: {
        color: heatmapTheme.panelBackground,
        borderColor: heatmapTheme.gridLine,
        borderWidth: 1,
      },
    },
    visualMap: {
      type: "piecewise",
      show: true,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      dimension: 1,
      pieces: [
        { lte: 0, color: heatmapTheme.zero, label: "0" },
        { gt: 0, lte: q1 || max || 1, color: heatmapTheme.warmScale[0], label: "Faible" },
        { gt: q1 || 0, lte: q2 || max || 1, color: heatmapTheme.warmScale[1] },
        { gt: q2 || 0, lte: q3 || max || 1, color: heatmapTheme.warmScale[2] },
        { gt: q3 || 0, lte: q4 || max || 1, color: heatmapTheme.warmScale[3] },
        { gt: q4 || 0, color: heatmapTheme.warmScale[4], label: "Fort" },
      ],
      textStyle: { color: heatmapTheme.label, fontSize: 11 },
    },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data: sorted.map((point) => [point.date, Number(point.value.toFixed(2))]),
        itemStyle: {
          borderColor: heatmapTheme.gridLine,
          borderWidth: 1,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 8,
            shadowColor: 'rgba(0,0,0,0.16)',
          },
        },
      },
    ],
  };
}
