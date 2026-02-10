import { Card } from "./Card";
import { InfoHint } from "./InfoHint";

type StatTone = "good" | "warn" | "bad" | "neutral";

interface StatCardProps {
  label: string;
  value: string;
  statusLabel?: string;
  statusRange?: string;
  statusTone?: StatTone;
}

const toneClassByStatus: Record<StatTone, string> = {
  good: "border-emerald-300 bg-emerald-50 text-emerald-700",
  warn: "border-amber-300 bg-amber-50 text-amber-700",
  bad: "border-red-300 bg-red-50 text-red-700",
  neutral: "border-black/15 bg-black/[0.03] text-ink",
};

export function StatCard({
  label,
  value,
  statusLabel,
  statusRange,
  statusTone = "neutral",
}: StatCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
        {statusRange ? (
          <InfoHint
            title={`Interpretation - ${label}`}
            description={statusRange}
            linkHref="https://pubmed.ncbi.nlm.nih.gov/24410871/"
            linkLabel="Source: CTL/ATL/TSB"
          />
        ) : null}
      </div>
      {statusLabel ? (
        <div className="mt-2">
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${toneClassByStatus[statusTone]}`}
          >
            {statusLabel}
          </span>
        </div>
      ) : null}
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </Card>
  );
}
