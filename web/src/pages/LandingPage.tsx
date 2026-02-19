import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { apiRequest } from "../api/client";
import { Card } from "../components/Card";
import { SectionHeader } from "../components/SectionHeader";
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";

export function LandingPage() {
  const {
    isAuthenticated,
    loading,
    token,
    user,
    loginWithPassword,
    registerWithPassword,
  } = useAuth();
  const hasCustomStravaCredentials = !!user?.hasCustomStravaCredentials;

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!loading && isAuthenticated && user?.connectedToStrava) {
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

    setStravaLoading(true);
    setError(null);
    setInfo(null);

    try {
      const response = await apiRequest<{ url: string }>("/auth/strava/start", {
        token,
      });
      window.location.href = response.url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de lancer OAuth Strava",
      );
      setStravaLoading(false);
    }
  };

  const onLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitLoading(true);
    setError(null);
    setInfo(null);

    try {
      await loginWithPassword(email, password);
      setInfo("Connexion reussie.");
      setPassword("");
      setPasswordConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Echec de connexion");
    } finally {
      setSubmitLoading(false);
    }
  };

  const onRegisterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitLoading(true);
    setError(null);
    setInfo(null);

    if (password !== passwordConfirm) {
      setError("Les mots de passe ne correspondent pas.");
      setSubmitLoading(false);
      return;
    }

    try {
      const response = await registerWithPassword(email, password);
      setInfo(response.message);
      setPassword("");
      setPasswordConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Echec de creation de compte");
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card>
        <div className="mx-auto w-full max-w-xl space-y-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">StravHat</h1>
            <p className="text-xs text-muted">
              Acces securise a l application, puis connexion OAuth Strava.
            </p>
          </div>

          {loading ? (
            <div className="rounded-xl border border-black/10 bg-white/60 p-4 text-sm text-muted">
              Chargement session...
            </div>
          ) : null}

          {!loading && isAuthenticated ? (
            <div className="space-y-3 rounded-xl border border-black/10 bg-white/60 p-4">
              <SectionHeader
                title="Compte applicatif connecte"
                subtitle={`Utilisateur: ${user?.email ?? "inconnu"}`}
                className="mb-0"
              />
              <p className="text-xs text-muted">
                Etape suivante: connecter Strava. Tu peux aussi definir des credentials
                OAuth Strava personnalises.
              </p>
              {!hasCustomStravaCredentials ? (
                <p className="text-xs text-amber-700">
                  Credentials Strava non configures: complete la page Strava Credentials avant la connexion OAuth.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  className={`px-4 ${primaryButtonClass}`}
                  disabled={stravaLoading || !hasCustomStravaCredentials}
                  onClick={startStravaAuth}
                  type="button"
                >
                  {stravaLoading ? "Redirection..." : "Connecter Strava"}
                </button>
                <Link className={secondaryButtonClass} to="/strava-credentials">
                  Credentials Strava
                </Link>
              </div>
            </div>
          ) : null}

          {!loading && !isAuthenticated ? (
            <>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-black/10 bg-white/60 p-2">
                <button
                  className={`h-10 rounded-lg text-sm transition ${
                    mode === "login" ? "bg-ink text-white" : "hover:bg-black/5"
                  }`}
                  onClick={() => {
                    setMode("login");
                    setError(null);
                    setInfo(null);
                  }}
                  type="button"
                >
                  Login
                </button>
                <button
                  className={`h-10 rounded-lg text-sm transition ${
                    mode === "register" ? "bg-ink text-white" : "hover:bg-black/5"
                  }`}
                  onClick={() => {
                    setMode("register");
                    setError(null);
                    setInfo(null);
                  }}
                  type="button"
                >
                  Register
                </button>
              </div>

              {mode === "login" ? (
                <form className="space-y-3" onSubmit={onLoginSubmit}>
                  <SectionHeader
                    title="Connexion"
                    subtitle="Compte applicatif (independant de Strava)."
                    className="mb-0"
                  />
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted" htmlFor="login-email">
                      Email
                    </label>
                    <input
                      className={inputClass}
                      id="login-email"
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      type="email"
                      value={email}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted" htmlFor="login-password">
                      Mot de passe
                    </label>
                    <input
                      className={inputClass}
                      id="login-password"
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      type="password"
                      value={password}
                    />
                  </div>
                  <button
                    className={`w-full ${primaryButtonClass}`}
                    disabled={submitLoading}
                    type="submit"
                  >
                    {submitLoading ? "Connexion..." : "Se connecter"}
                  </button>
                </form>
              ) : (
                <form className="space-y-3" onSubmit={onRegisterSubmit}>
                  <SectionHeader
                    title="Inscription"
                    subtitle="Creation du compte. Validation manuelle par whitelist DB."
                    className="mb-0"
                  />
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted" htmlFor="register-email">
                      Email
                    </label>
                    <input
                      className={inputClass}
                      id="register-email"
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      type="email"
                      value={email}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted" htmlFor="register-password">
                      Mot de passe
                    </label>
                    <input
                      className={inputClass}
                      id="register-password"
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      type="password"
                      value={password}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted" htmlFor="register-password-confirm">
                      Confirmation mot de passe
                    </label>
                    <input
                      className={inputClass}
                      id="register-password-confirm"
                      onChange={(event) => setPasswordConfirm(event.target.value)}
                      required
                      type="password"
                      value={passwordConfirm}
                    />
                  </div>
                  <button
                    className={`w-full ${primaryButtonClass}`}
                    disabled={submitLoading}
                    type="submit"
                  >
                    {submitLoading ? "Creation..." : "Creer un compte"}
                  </button>
                </form>
              )}
            </>
          ) : null}

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {info ? <p className="text-sm text-emerald-700">{info}</p> : null}
        </div>
      </Card>
    </div>
  );
}
