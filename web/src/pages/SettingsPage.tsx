import { useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import type { User } from "../api/types";
import { Card } from "../components/Card";
import { MobileTabs } from "../components/MobileTabs";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/SectionHeader";
import { dangerButtonClass, inputClass, primaryButtonClass, selectClass } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useMediaQuery } from "../hooks/useMediaQuery";

type SectionKey = "preferences" | "dangerZone";
type SettingsMobileTab = "preferences" | "danger";
type GoalType = Exclude<User["goalType"], null>;

const goalDistanceDefaults: Record<Exclude<GoalType, "custom">, number> = {
  "5k": 5,
  "10k": 10,
  half_marathon: 21.0975,
  marathon: 42.195,
};

function formatGoalTimeForInput(goalTimeSec: number | null) {
  if (goalTimeSec === null || !Number.isFinite(goalTimeSec) || goalTimeSec <= 0) {
    return "";
  }
  const totalMinutes = Math.floor(goalTimeSec / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}

function parseGoalTimeToSeconds(value: string) {
  const trimmed = value.trim();
  if (trimmed === "") {
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
  const { token, user, refreshMe, logout } = useAuth();
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const [mobileTab, setMobileTab] = useState<SettingsMobileTab>("preferences");
  const [hrMax, setHrMax] = useState(190);
  const [age, setAge] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [goalType, setGoalType] = useState<User["goalType"]>(null);
  const [goalDistanceKm, setGoalDistanceKm] = useState("");
  const [goalTargetTime, setGoalTargetTime] = useState("");
  const [speedUnit, setSpeedUnit] = useState<User["speedUnit"]>("kmh");
  const [distanceUnit, setDistanceUnit] = useState<User["distanceUnit"]>("km");
  const [elevationUnit, setElevationUnit] = useState<User["elevationUnit"]>("m");
  const [cadenceUnit, setCadenceUnit] = useState<User["cadenceUnit"]>("rpm");
  const [status, setStatus] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<SectionKey, boolean>>({
    preferences: false,
    dangerZone: false,
  });

  useEffect(() => {
    if (!user) {
      return;
    }

    setHrMax(user.hrMax);
    setAge(user.age === null ? "" : String(user.age));
    setWeightKg(user.weightKg === null ? "" : String(user.weightKg));
    setHeightCm(user.heightCm === null ? "" : String(user.heightCm));
    setGoalType(user.goalType);
    setGoalDistanceKm(user.goalDistanceKm === null ? "" : String(user.goalDistanceKm));
    setGoalTargetTime(formatGoalTimeForInput(user.goalTimeSec));
    setSpeedUnit(user.speedUnit);
    setDistanceUnit(user.distanceUnit);
    setElevationUnit(user.elevationUnit);
    setCadenceUnit(user.cadenceUnit === "spm" ? "ppm" : user.cadenceUnit);
  }, [user]);

  const save = async () => {
    if (!token) {
      return;
    }

    const parsedAge = age.trim() === "" ? null : Number(age);
    const parsedWeight = weightKg.trim() === "" ? null : Number(weightKg);
    const parsedHeight = heightCm.trim() === "" ? null : Number(heightCm);
    const parsedGoalTimeSec = parseGoalTimeToSeconds(goalTargetTime);
    const parsedGoalDistance = goalDistanceKm.trim() === "" ? null : Number(goalDistanceKm);

    if (
      (parsedAge !== null && !Number.isFinite(parsedAge)) ||
      (parsedWeight !== null && !Number.isFinite(parsedWeight)) ||
      (parsedHeight !== null && !Number.isFinite(parsedHeight))
    ) {
      setStatus("Age / poids / taille invalides.");
      return;
    }

    if (goalType !== null && Number.isNaN(parsedGoalTimeSec)) {
      setStatus("Objectif temps invalide. Format attendu: HH:MM (ex: 3:45).");
      return;
    }

    if (goalType !== null && (parsedGoalTimeSec === null || parsedGoalTimeSec < 600)) {
      setStatus("Renseigne un objectif temps valide (minimum 00:10).");
      return;
    }

    if (goalType === "custom" && (parsedGoalDistance === null || !Number.isFinite(parsedGoalDistance) || parsedGoalDistance <= 0)) {
      setStatus("Pour un objectif custom, renseigne une distance (km) valide.");
      return;
    }

    const resolvedGoalDistanceKm =
      goalType === null ? null
      : goalType === "custom" ? (parsedGoalDistance === null ? null : parsedGoalDistance)
      : goalDistanceDefaults[goalType as Exclude<GoalType, "custom">];

    const resolvedGoalTimeSec = goalType === null ? null : parsedGoalTimeSec;

    try {
      await apiRequest("/me/settings", {
        method: "PATCH",
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
        },
      });
      setStatus("Preferences mises a jour.");
      await refreshMe();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Erreur update settings");
    }
  };

  const deleteAccount = async () => {
    if (!token) {
      return;
    }

    if (!window.confirm("Supprimer compte + tokens + activites ?")) {
      return;
    }

    try {
      await apiRequest("/me", {
        method: "DELETE",
        token,
      });
      logout();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Erreur suppression");
    }
  };

  return (
    <div>
      <PageHeader description="HRmax, unites d'affichage, suppression des donnees, logout." title="Settings" />
      {isMobile ? (
        <MobileTabs
          activeKey={mobileTab}
          onChange={setMobileTab}
          tabs={[
            { key: "preferences", label: "Preferences" },
            { key: "danger", label: "Zone critique" },
          ]}
        />
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {!isMobile || mobileTab === "preferences" ? <Card>
          <SectionHeader
            title="Preferences utilisateur"
            subtitle="Profil sport + preferences d'unites d'affichage"
            infoHint={{
              title: "Preferences",
              description:
                "Les conversions sont calculees depuis les valeurs brutes pour eviter les erreurs de conversion en chaine.",
            }}
            collapsed={collapsedSections.preferences}
            onToggleCollapse={() =>
              setCollapsedSections((prev) => ({ ...prev, preferences: !prev.preferences }))
            }
          />
          {collapsedSections.preferences ? (
            <p className="text-xs text-muted">Section repliee.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-muted">
              HRmax
              <input
                className={inputClass}
                max={240}
                min={120}
                onChange={(event) => setHrMax(Number(event.target.value))}
                type="number"
                value={hrMax}
              />
            </label>

            <label className="grid gap-1 text-xs text-muted">
              Age
              <input
                className={inputClass}
                max={100}
                min={10}
                onChange={(event) => setAge(event.target.value)}
                placeholder="ex: 32"
                type="number"
                value={age}
              />
            </label>

            <label className="grid gap-1 text-xs text-muted">
              Poids (kg)
              <input
                className={inputClass}
                max={250}
                min={30}
                onChange={(event) => setWeightKg(event.target.value)}
                placeholder="ex: 68.5"
                step="0.1"
                type="number"
                value={weightKg}
              />
            </label>

            <label className="grid gap-1 text-xs text-muted">
              Taille (cm)
              <input
                className={inputClass}
                max={250}
                min={120}
                onChange={(event) => setHeightCm(event.target.value)}
                placeholder="ex: 178"
                type="number"
                value={heightCm}
              />
            </label>

            <label className="grid gap-1 text-xs text-muted">
              Objectif principal
              <select
                className={selectClass}
                value={goalType ?? ""}
                onChange={(event) => {
                  const value = event.target.value as GoalType | "";
                  const nextGoalType = value === "" ? null : value;
                  setGoalType(nextGoalType);
                  if (nextGoalType !== null && nextGoalType !== "custom") {
                    const presetDistance = goalDistanceDefaults[nextGoalType as Exclude<GoalType, "custom">];
                    setGoalDistanceKm(String(presetDistance));
                  }
                  if (nextGoalType === null) {
                    setGoalDistanceKm("");
                    setGoalTargetTime("");
                  }
                }}
              >
                <option value="">Aucun</option>
                <option value="marathon">Marathon</option>
                <option value="half_marathon">Semi-marathon</option>
                <option value="10k">10 km</option>
                <option value="5k">5 km</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            {goalType === "custom" ? (
              <label className="grid gap-1 text-xs text-muted">
                Distance objectif (km)
                <input
                  className={inputClass}
                  min={1}
                  step="0.1"
                  onChange={(event) => setGoalDistanceKm(event.target.value)}
                  placeholder="ex: 42.195"
                  type="number"
                  value={goalDistanceKm}
                />
              </label>
            ) : null}

            {goalType !== null ? (
              <label className="grid gap-1 text-xs text-muted">
                Temps objectif (HH:MM)
                <input
                  className={inputClass}
                  onChange={(event) => setGoalTargetTime(event.target.value)}
                  placeholder="ex: 3:45"
                  value={goalTargetTime}
                />
              </label>
            ) : null}

            <label className="grid gap-1 text-xs text-muted">
              Vitesse
              <select
                className={selectClass}
                value={speedUnit}
                onChange={(event) => setSpeedUnit(event.target.value as User["speedUnit"])}
              >
                <option value="kmh">km/h</option>
                <option value="pace_km">min/km</option>
                <option value="pace_mi">min/mi</option>
              </select>
            </label>

            <label className="grid gap-1 text-xs text-muted">
              Distance
              <select
                className={selectClass}
                value={distanceUnit}
                onChange={(event) => setDistanceUnit(event.target.value as User["distanceUnit"])}
              >
                <option value="km">km</option>
                <option value="mi">mi</option>
              </select>
            </label>

            <label className="grid gap-1 text-xs text-muted">
              Denivele
              <select
                className={selectClass}
                value={elevationUnit}
                onChange={(event) => setElevationUnit(event.target.value as User["elevationUnit"])}
              >
                <option value="m">m</option>
                <option value="ft">ft</option>
              </select>
            </label>

            <label className="grid gap-1 text-xs text-muted">
              Cadence
              <select
                className={selectClass}
                value={cadenceUnit}
                onChange={(event) => setCadenceUnit(event.target.value as User["cadenceUnit"])}
              >
                <option value="rpm">rpm</option>
                <option value="ppm">ppm</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-muted">
            Les conversions sont recalculees depuis les valeurs brutes (pas de conversion en chaine), precision max 2 decimales. L'objectif sauvegarde est aussi pris en compte dans les analyses IA.
          </p>
          <button className={`mt-4 w-full sm:w-auto ${primaryButtonClass}`} onClick={save} type="button">
            Sauvegarder
          </button>
            </>
          )}
        </Card> : null}

        {!isMobile || mobileTab === "danger" ? <Card>
          <SectionHeader
            title="Zone critique"
            subtitle="Actions irreversibles sur le compte"
            infoHint={{
              title: "Suppression compte",
              description:
                "Supprime le compte, les tokens et les activites locales. Cette action est definitive.",
            }}
            collapsed={collapsedSections.dangerZone}
            onToggleCollapse={() =>
              setCollapsedSections((prev) => ({ ...prev, dangerZone: !prev.dangerZone }))
            }
          />
          {collapsedSections.dangerZone ? (
            <p className="text-xs text-muted">Section repliee.</p>
          ) : (
            <button
              className={dangerButtonClass}
              onClick={deleteAccount}
              type="button"
            >
              Supprimer mon compte
            </button>
          )}
        </Card> : null}
      </div>
      {status ? <p className="mt-4 text-sm text-muted">{status}</p> : null}
    </div>
  );
}
