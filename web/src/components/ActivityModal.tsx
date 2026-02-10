import type { Activity } from "../api/types";
import { secondaryButtonCompactClass, subtlePanelClass } from "./ui";
import { useAuth } from "../contexts/AuthContext";
import { formatDate, formatHours, formatMinutes } from "../utils/format";
import {
  formatCadenceFromRpm,
  formatDistanceFromMeters,
  formatElevationFromMeters,
  formatSpeedFromMetersPerSecond,
  resolveUnitPreferences,
} from "../utils/units";

interface ActivityModalProps {
  activity: Activity;
  onClose: () => void;
}

export function ActivityModal({ activity, onClose }: ActivityModalProps) {
  const { user } = useAuth();
  const unitPreferences = resolveUnitPreferences(user);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-black/20 bg-panel p-6 shadow-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Activity</p>
            <h2 className="text-2xl font-semibold">{activity.name}</h2>
            <p className="mt-1 text-sm text-muted">{formatDate(activity.startDateLocal)}</p>
          </div>
          <button
            className={secondaryButtonCompactClass}
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Metric label="Type" value={activity.sportType || activity.type} />
          <Metric label="Distance" value={formatDistanceFromMeters(activity.distance, unitPreferences)} />
          <Metric label="Moving time" value={formatHours(activity.movingTime)} />
          <Metric label="Elapsed time" value={formatHours(activity.elapsedTime)} />
          <Metric label="D+" value={formatElevationFromMeters(activity.totalElevationGain, unitPreferences)} />
          <Metric label="Vitesse moyenne" value={formatSpeedFromMetersPerSecond(activity.averageSpeed, unitPreferences)} />
          <Metric label="Vitesse max" value={formatSpeedFromMetersPerSecond(activity.maxSpeed, unitPreferences)} />
          <Metric label="HR moyenne" value={activity.averageHeartrate ? `${activity.averageHeartrate.toFixed(0)} bpm` : "-"} />
          <Metric label="HR max" value={activity.maxHeartrate ? `${activity.maxHeartrate.toFixed(0)} bpm` : "-"} />
          <Metric label="Watts moyenne" value={activity.averageWatts ? `${activity.averageWatts.toFixed(0)} W` : "-"} />
          <Metric label="Watts max" value={activity.maxWatts ? `${activity.maxWatts.toFixed(0)} W` : "-"} />
          <Metric
            label="Watts ponderes"
            value={activity.weightedAverageWatts ? `${activity.weightedAverageWatts.toFixed(0)} W` : "-"}
          />
          <Metric
            label="Cadence"
            value={activity.averageCadence ? formatCadenceFromRpm(activity.averageCadence, unitPreferences, 0) : "-"}
          />
          <Metric
            label="Longueur de foulee"
            value={
              activity.strideLength !== null && activity.strideLength !== undefined ?
                `${activity.strideLength.toFixed(2)} m`
              : "-"
            }
          />
          <Metric
            label="Contact au sol"
            value={
              activity.groundContactTime !== null &&
              activity.groundContactTime !== undefined ?
                `${activity.groundContactTime.toFixed(0)} ms`
              : "-"
            }
          />
          <Metric
            label="Oscillation verticale"
            value={
              activity.verticalOscillation !== null &&
              activity.verticalOscillation !== undefined ?
                `${activity.verticalOscillation.toFixed(2)} cm`
              : "-"
            }
          />
          <Metric label="Suffer score" value={activity.sufferScore ? activity.sufferScore.toFixed(1) : "-"} />
          <Metric label="Energie" value={activity.kilojoules ? `${activity.kilojoules.toFixed(0)} kJ` : "-"} />
          <Metric label="Calories" value={activity.calories ? `${activity.calories.toFixed(0)} kcal` : "-"} />
          <Metric
            label="Flags"
            value={[activity.trainer && "trainer", activity.commute && "commute", activity.manual && "manual"]
              .filter(Boolean)
              .join(", ") || "-"}
          />
          <Metric label="Temps en minutes" value={formatMinutes(activity.movingTime)} />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={subtlePanelClass}>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}
