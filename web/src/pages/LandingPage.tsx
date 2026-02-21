import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { inputClass, primaryButtonClass } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';

type AuthMode = 'login' | 'register';

export function LandingPage() {
  const { isAuthenticated, loading, user, loginWithPassword, registerWithPassword } =
    useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
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

  return (
    <div className='flex min-h-screen items-center justify-center p-4'>
      <Card>
        <div className='mx-auto w-full max-w-xl space-y-5'>
          <div className='space-y-1'>
            <h1 className='text-2xl font-semibold tracking-tight'>StravHat</h1>
            <p className='text-xs text-muted'>
              Connecte-toi a ton compte applicatif, puis configure Strava sur une
              page unique (credentials + OAuth).
            </p>
          </div>

          {loading ? (
            <div className='rounded-xl border border-black/10 bg-white/60 p-4 text-sm text-muted'>
              Chargement session...
            </div>
          ) : (
            <>
              <div className='grid grid-cols-2 gap-2 rounded-xl border border-black/10 bg-white/60 p-2'>
                <button
                  className={`h-10 rounded-lg text-sm transition ${
                    mode === 'login' ? 'bg-ink text-white' : 'hover:bg-black/5'
                  }`}
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setInfo(null);
                  }}
                  type='button'
                >
                  Login
                </button>
                <button
                  className={`h-10 rounded-lg text-sm transition ${
                    mode === 'register' ? 'bg-ink text-white' : 'hover:bg-black/5'
                  }`}
                  onClick={() => {
                    setMode('register');
                    setError(null);
                    setInfo(null);
                  }}
                  type='button'
                >
                  Register
                </button>
              </div>

              {mode === 'login' ? (
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
              )}
            </>
          )}

          {error ? <p className='text-sm text-red-700'>{error}</p> : null}
          {info ? <p className='text-sm text-emerald-700'>{info}</p> : null}
        </div>
      </Card>
    </div>
  );
}
