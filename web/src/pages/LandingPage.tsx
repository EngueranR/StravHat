import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import {
  inputClass,
  primaryButtonClass,
} from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useMediaQuery } from '../hooks/useMediaQuery';

type AuthMode = 'login' | 'register';
type MobilePanel = 'auth' | 'steps' | 'security';

const onboardingSteps = [
  '1. Cree ton compte applicatif.',
  '2. Attends la validation whitelist (DB admin).',
  '3. Configure tes credentials Strava puis connecte OAuth.',
];

const securityHighlights = [
  'Compte bloque 1h apres 5 tentatives de connexion ratees.',
  'Validation manuelle des comptes via whitelist DB.',
  'Isolation des credentials Strava par utilisateur.',
];

export function LandingPage() {
  const { isAuthenticated, loading, user, loginWithPassword, registerWithPassword } =
    useAuth();
  const isMobile = useMediaQuery('(max-width: 1023px)');

  const [mode, setMode] = useState<AuthMode>('login');
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!loading && isAuthenticated) {
    return (
      <Navigate
        replace
        to={user?.connectedToStrava ? '/analytics' : '/connect-strava'}
      />
    );
  }

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setMobilePanel('auth');
    setError(null);
    setInfo(null);
  };

  const onLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitLoading(true);
    setError(null);
    setInfo(null);

    try {
      await loginWithPassword(email, password);
      setInfo('Connexion reussie.');
      setPassword('');
      setPasswordConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Echec de connexion');
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
      setError('Les mots de passe ne correspondent pas.');
      setSubmitLoading(false);
      return;
    }

    try {
      const response = await registerWithPassword(email, password);
      setInfo(response.message);
      setPassword('');
      setPasswordConfirm('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Echec de creation de compte',
      );
    } finally {
      setSubmitLoading(false);
    }
  };

  const authSwitcher = (
    <div className='grid grid-cols-2 gap-2 rounded-xl border border-black/10 bg-white/60 p-2'>
      <button
        className={`h-10 rounded-lg text-sm transition ${
          mode === 'login' ? 'bg-ink text-white' : 'hover:bg-black/5'
        }`}
        onClick={() => switchMode('login')}
        type='button'
      >
        Login
      </button>
      <button
        className={`h-10 rounded-lg text-sm transition ${
          mode === 'register' ? 'bg-ink text-white' : 'hover:bg-black/5'
        }`}
        onClick={() => switchMode('register')}
        type='button'
      >
        Register
      </button>
    </div>
  );

  const authForm =
    mode === 'login' ? (
      <form className='space-y-3' onSubmit={onLoginSubmit}>
        <SectionHeader
          title='Connexion'
          subtitle='Compte applicatif (independant de Strava).'
          className='mb-0'
        />
        <div className='space-y-1.5'>
          <label className='text-xs text-muted' htmlFor='login-email'>
            Email
          </label>
          <input
            autoComplete='email'
            className={inputClass}
            id='login-email'
            onChange={(event) => setEmail(event.target.value)}
            required
            type='email'
            value={email}
          />
        </div>
        <div className='space-y-1.5'>
          <label className='text-xs text-muted' htmlFor='login-password'>
            Mot de passe
          </label>
          <input
            autoComplete='current-password'
            className={inputClass}
            id='login-password'
            onChange={(event) => setPassword(event.target.value)}
            required
            type='password'
            value={password}
          />
        </div>
        <button
          className={`w-full ${primaryButtonClass}`}
          disabled={submitLoading}
          type='submit'
        >
          {submitLoading ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    ) : (
      <form className='space-y-3' onSubmit={onRegisterSubmit}>
        <SectionHeader
          title='Inscription'
          subtitle='Creation du compte. Validation manuelle par whitelist DB.'
          className='mb-0'
        />
        <div className='space-y-1.5'>
          <label className='text-xs text-muted' htmlFor='register-email'>
            Email
          </label>
          <input
            autoComplete='email'
            className={inputClass}
            id='register-email'
            onChange={(event) => setEmail(event.target.value)}
            required
            type='email'
            value={email}
          />
        </div>
        <div className='space-y-1.5'>
          <label className='text-xs text-muted' htmlFor='register-password'>
            Mot de passe
          </label>
          <input
            autoComplete='new-password'
            className={inputClass}
            id='register-password'
            onChange={(event) => setPassword(event.target.value)}
            required
            type='password'
            value={password}
          />
        </div>
        <div className='space-y-1.5'>
          <label
            className='text-xs text-muted'
            htmlFor='register-password-confirm'
          >
            Confirmation mot de passe
          </label>
          <input
            autoComplete='new-password'
            className={inputClass}
            id='register-password-confirm'
            onChange={(event) => setPasswordConfirm(event.target.value)}
            required
            type='password'
            value={passwordConfirm}
          />
        </div>
        <button
          className={`w-full ${primaryButtonClass}`}
          disabled={submitLoading}
          type='submit'
        >
          {submitLoading ? 'Creation...' : 'Creer un compte'}
        </button>
      </form>
    );

  const statusBlock =
    error || info ? (
      <div className='space-y-2'>
        {error ? <p className='text-sm text-red-700'>{error}</p> : null}
        {info ? <p className='text-sm text-emerald-700'>{info}</p> : null}
      </div>
    ) : null;

  if (isMobile) {
    return (
      <div className='min-h-screen overflow-x-hidden bg-grain bg-[size:14px_14px]'>
        <div className='mx-auto w-full max-w-xl space-y-4 px-3 pb-28 pt-4'>
          <Card>
            <div className='space-y-1'>
              <h1 className='text-2xl font-semibold tracking-tight'>StravHat</h1>
              <p className='text-xs text-muted'>
                Interface mobile simplifiee: compte, etapes, securite.
              </p>
            </div>
          </Card>

          {loading ? (
            <Card>
              <p className='text-sm text-muted'>Chargement session...</p>
            </Card>
          ) : null}

          {!loading && mobilePanel === 'auth' ? (
            <Card>
              <div className='space-y-4'>
                {authSwitcher}
                {authForm}
                {statusBlock}
              </div>
            </Card>
          ) : null}

          {!loading && mobilePanel === 'steps' ? (
            <Card>
              <SectionHeader
                title='Etapes'
                subtitle='Flux simple pour demarrer.'
                className='mb-0'
              />
              <ul className='mt-3 space-y-2 text-sm'>
                {onboardingSteps.map((step) => (
                  <li
                    className='rounded-lg border border-black/10 bg-black/[0.03] px-3 py-2'
                    key={step}
                  >
                    {step}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {!loading && mobilePanel === 'security' ? (
            <Card>
              <SectionHeader
                title='Securite'
                subtitle='Protections actives sur les donnees sensibles.'
                className='mb-0'
              />
              <ul className='mt-3 space-y-2 text-sm'>
                {securityHighlights.map((item) => (
                  <li
                    className='rounded-lg border border-black/10 bg-black/[0.03] px-3 py-2'
                    key={item}
                  >
                    {item}
                  </li>
                ))}
              </ul>
              {statusBlock}
            </Card>
          ) : null}
        </div>

        <nav className='mobile-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-black/10 bg-panel/95 px-2 py-2 shadow-panel backdrop-blur lg:hidden'>
          <div className='mx-auto max-w-xl'>
            <div className='grid grid-cols-3 gap-1 rounded-xl border border-black/10 bg-white/70 p-1'>
              <button
                className={`h-10 rounded-lg text-xs font-medium transition ${
                  mobilePanel === 'auth' ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'
                }`}
                onClick={() => setMobilePanel('auth')}
                type='button'
              >
                Compte
              </button>
              <button
                className={`h-10 rounded-lg text-xs font-medium transition ${
                  mobilePanel === 'steps' ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'
                }`}
                onClick={() => setMobilePanel('steps')}
                type='button'
              >
                Etapes
              </button>
              <button
                className={`h-10 rounded-lg text-xs font-medium transition ${
                  mobilePanel === 'security' ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'
                }`}
                onClick={() => setMobilePanel('security')}
                type='button'
              >
                Securite
              </button>
            </div>
          </div>
        </nav>
      </div>
    );
  }

  return (
    <div className='flex min-h-screen items-center justify-center p-4'>
      <Card>
        <div className='mx-auto w-full max-w-xl space-y-5'>
          <div className='space-y-1'>
            <h1 className='text-2xl font-semibold tracking-tight'>StravHat</h1>
            <p className='text-xs text-muted'>
              Analyse des données, visualisations de la performances et
              améliorations de l'expérience.
            </p>
          </div>

          {loading ? (
            <div className='rounded-xl border border-black/10 bg-white/60 p-4 text-sm text-muted'>
              Chargement session...
            </div>
          ) : (
            <>
              {authSwitcher}
              {authForm}
              {statusBlock}
            </>
          )}

          {!loading ? (
            <div className='rounded-xl border border-black/10 bg-white/60 p-3 text-xs text-muted'>
              Apres inscription, le compte doit etre valide en whitelist DB.
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
