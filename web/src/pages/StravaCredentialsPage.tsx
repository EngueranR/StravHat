import { useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";

interface StravaCredentialStatus {
  hasCustomCredentials: boolean;
  clientId: string | null;
  redirectUri: string | null;
}

export function StravaCredentialsPage() {
  const { token, refreshMe } = useAuth();
  const defaultRedirectUri = `${window.location.origin}/auth/callback`;
  const callbackDomain = window.location.host;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState<StravaCredentialStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await apiRequest<StravaCredentialStatus>("/me/strava-credentials", {
          token,
        });

        setStatus(data);
        setClientId(data.clientId ?? "");
        setRedirectUri(data.redirectUri ?? defaultRedirectUri);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Impossible de charger les credentials Strava",
        );
      } finally {
        setLoading(false);
      }
    };

    run().catch(() => {
      setLoading(false);
      setError("Erreur inconnue");
    });
  }, [defaultRedirectUri, token]);

  const refreshStatus = async () => {
    if (!token) {
      return;
    }

    const data = await apiRequest<StravaCredentialStatus>("/me/strava-credentials", {
      token,
    });

    setStatus(data);
    setClientId(data.clientId ?? "");
    setRedirectUri(data.redirectUri ?? defaultRedirectUri);
  };

  const onSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setError("Session expiree.");
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      await apiRequest<{ ok: boolean; requiresReconnect: boolean }>("/me/strava-credentials", {
        method: "PATCH",
        token,
        body: {
          clientId,
          clientSecret,
          redirectUri: redirectUri.trim(),
          currentPassword,
        },
      });
      await refreshStatus();
      await refreshMe();
      setClientSecret("");
      setCurrentPassword("");
      setInfo(
        "Credentials sauvegardes. Reconnecte Strava pour emettre un nouveau token OAuth.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Echec de sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    if (!token) {
      setError("Session expiree.");
      return;
    }

    if (!currentPassword) {
      setError("Saisis ton mot de passe courant pour confirmer la reinitialisation.");
      return;
    }

    setResetting(true);
    setError(null);
    setInfo(null);

    try {
      await apiRequest<{ ok: boolean; credentialsCleared: boolean; requiresReconnect: boolean }>(
        "/me/strava-credentials/reset",
        {
          method: "POST",
          token,
          body: {
            currentPassword,
          },
        },
      );
      await refreshStatus();
      await refreshMe();
      setClientSecret("");
      setCurrentPassword("");
      setInfo(
        "Credentials supprimes. Renseigne de nouveaux credentials Strava puis reconnecte Strava.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Echec de reinitialisation");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Credentials Strava"
        description="Configuration OAuth Strava par utilisateur (chiffree en base)."
      />

      <Card>
        <div className="space-y-3">
          <p className="text-sm font-semibold">Tutoriel Strava API</p>
          <p className="text-xs text-muted">
            1) Ouvre{" "}
            <a
              className="underline"
              href="https://www.strava.com/settings/api"
              rel="noreferrer"
              target="_blank"
            >
              https://www.strava.com/settings/api
            </a>{" "}
            et cree ton application.
          </p>
          <p className="text-xs text-muted">
            2) Dans Strava, mets <span className="font-semibold">Authorization Callback Domain</span>{" "}
            sur <span className="font-mono">{callbackDomain}</span>.
          </p>
          <p className="text-xs text-muted">
            3) Recopie le <span className="font-semibold">Client ID</span> et le{" "}
            <span className="font-semibold">Client Secret</span>.
          </p>
          <p className="text-xs text-muted">
            4) Mets la Redirect URI exactement a{" "}
            <span className="font-mono">{defaultRedirectUri}</span>.
          </p>
          <p className="text-xs text-muted">
            5) Sauvegarde ici, puis va sur <span className="font-semibold">Connect Strava</span> pour lancer l OAuth.
          </p>
        </div>
      </Card>

      <Card>
        {loading ? (
          <p className="text-sm text-muted">Chargement...</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-black/10 bg-black/[0.03] p-3 text-xs text-muted">
              Etat actuel: {status?.hasCustomCredentials ? "custom" : "non configure"}
            </div>

            <form className="space-y-3" onSubmit={onSave}>
              <div className="space-y-1.5">
                <label className="text-xs text-muted" htmlFor="strava-client-id">
                  Strava Client ID
                </label>
                <input
                  className={inputClass}
                  id="strava-client-id"
                  onChange={(event) => setClientId(event.target.value)}
                  required
                  value={clientId}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted" htmlFor="strava-client-secret">
                  Strava Client Secret
                </label>
                <input
                  className={inputClass}
                  id="strava-client-secret"
                  onChange={(event) => setClientSecret(event.target.value)}
                  placeholder={
                    status?.hasCustomCredentials ?
                      "Laisse vide pour conserver le secret deja stocke"
                    : "Renseigne le secret a stocker"
                  }
                  type="password"
                  value={clientSecret}
                />
                {status?.hasCustomCredentials ? (
                  <p className="text-[11px] text-muted">
                    Le secret n'est jamais re-affiche. Si tu laisses ce champ vide, le
                    secret en base est conserve.
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted" htmlFor="strava-redirect-uri">
                  Redirect URI
                </label>
                <input
                  className={inputClass}
                  id="strava-redirect-uri"
                  onChange={(event) => setRedirectUri(event.target.value)}
                  placeholder="https://ton-domaine/auth/callback"
                  required
                  value={redirectUri}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted" htmlFor="current-password">
                  Mot de passe courant (confirmation)
                </label>
                <input
                  className={inputClass}
                  id="current-password"
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  type="password"
                  value={currentPassword}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className={`px-4 ${primaryButtonClass}`}
                  disabled={saving}
                  type="submit"
                >
                  {saving ? "Sauvegarde..." : "Sauvegarder"}
                </button>
                <button
                  className={secondaryButtonClass}
                  disabled={resetting || !status?.hasCustomCredentials}
                  onClick={onReset}
                  type="button"
                >
                  {resetting ? "Reinitialisation..." : "Supprimer credentials"}
                </button>
              </div>
            </form>

            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            {info ? <p className="text-sm text-emerald-700">{info}</p> : null}
          </div>
        )}
      </Card>
    </div>
  );
}
