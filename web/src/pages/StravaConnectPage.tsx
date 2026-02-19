import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { apiRequest } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { primaryButtonClass, secondaryButtonClass } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";

export function StravaConnectPage() {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasCustomStravaCredentials = !!user?.hasCustomStravaCredentials;

  if (user?.connectedToStrava) {
    return <Navigate replace to="/analytics" />;
  }

  const startStravaAuth = async () => {
    if (!token) {
      setError("Session expiree. Reconnecte-toi.");
      return;
    }

    if (!hasCustomStravaCredentials) {
      setError(
        "Configure d'abord les credentials Strava (Client ID / Secret / Redirect URI).",
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest<{ url: string }>("/auth/strava/start", {
        token,
      });
      window.location.href = response.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de lancer OAuth Strava");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Connexion Strava requise"
        description="Pour debloquer les imports, analyses et plans IA, connecte d'abord ton compte Strava."
      />

      <Card>
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Tant que Strava n'est pas lie, seules les sections de configuration restent
            accessibles.
          </p>

          {!hasCustomStravaCredentials ? (
            <p className="text-xs text-amber-700">
              Credentials Strava non configures: complete d'abord la page Strava Credentials.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              className={`px-4 ${primaryButtonClass}`}
              disabled={loading || !hasCustomStravaCredentials}
              onClick={startStravaAuth}
              type="button"
            >
              {loading ? "Redirection..." : "Connecter Strava (OAuth)"}
            </button>
            <Link className={secondaryButtonClass} to="/strava-credentials">
              Strava Credentials
            </Link>
            <Link className={secondaryButtonClass} to="/settings">
              Settings
            </Link>
          </div>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
      </Card>
    </div>
  );
}
