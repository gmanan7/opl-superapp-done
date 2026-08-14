import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { loginWithEmail } from '../lib/auth';

export function Login() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const timedOut = searchParams.get('reason') === 'session_timeout';
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await loginWithEmail(identifier.trim(), password);
            navigate('/select-module', { replace: true });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : t('login.invalidCredentials'));
        }
        finally {
            setLoading(false);
        }
    }

    return (<div className="min-h-dvh flex flex-col items-center justify-center bg-stone-50 px-4 py-8">
      {/* Session-timeout banner */}
      {timedOut && (<div role="alert" className="mb-4 w-full max-w-sm rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-fg">
          ▲ {t('login.sessionTimeout')}
        </div>)}
      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
        {/* Header */}
        <div className="bg-stone-900 px-6 py-8 text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">{t('login.title')}</h1>
          <p className="text-stone-400 text-sm mt-1">{t('login.subtitle')}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              {t('login.email')} / {t('login.employeeId')}
            </label>
            <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Email or Employee ID" required autoComplete="username" className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              {t('login.password')}
            </label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('login.passwordPlaceholder')} required autoComplete="current-password" className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"/>
          </div>

          {error && (<p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>)}

          <button type="submit" disabled={loading} className="w-full bg-amber-600 text-white py-3 rounded-lg text-sm font-semibold hover:bg-amber-700 active:bg-amber-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            {loading ? t('login.signingIn') : t('login.signIn')}
          </button>
        </form>
      </div>
    </div>);
}

