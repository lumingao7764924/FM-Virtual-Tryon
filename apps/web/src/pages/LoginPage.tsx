import { useEffect, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import type { AuthConfig, SessionInfo } from '@tryon/shared';
import { apiFetch, errorMessage } from '@/api';
import { useAuth } from '@/hooks/use-auth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useI18n } from '@/i18n';
import { Card, CardContent } from '@/components/ui/card';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('script')), { once: true });
    if (!existing) {
      script.src = GSI_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/finders';
}

export function LoginPage() {
  const { session, loading, setSession } = useAuth();
  const { locale, t } = useI18n();
  const [params] = useSearchParams();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const googleButton = useRef<HTMLDivElement>(null);
  const next = safeNext(params.get('next'));

  useEffect(() => {
    apiFetch<AuthConfig>('/api/auth/config')
      .then(setConfig)
      .catch((err) => setError(t('login.backendError', { message: errorMessage(err) })));
  }, [t]);

  useEffect(() => {
    const clientId = config?.googleClientId;
    if (!clientId || !googleButton.current) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !googleButton.current || !window.google) return;
        googleButton.current.replaceChildren();
        window.google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: async ({ credential }) => {
            setError('');
            setBusy(true);
            try {
              const res = await apiFetch<{ session: SessionInfo }>('/api/auth/google', {
                method: 'POST',
                json: { credential },
              });
              setSession(res.session);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(googleButton.current, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 300,
          locale: locale === 'zh' ? 'zh-CN' : 'en',
        });
      })
      .catch((err) => setError(err instanceof Error && err.message === 'script' ? t('login.scriptError') : errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [config?.googleClientId, locale, setSession, t]);

  if (!loading && session) return <Navigate to={next} replace />;

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 py-8">
          <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
            T
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {config?.googleClientId ? (
            <div className="flex justify-center">
              <div ref={googleButton} className={busy ? 'pointer-events-none opacity-60' : undefined} />
            </div>
          ) : config ? (
            <p className="text-center text-sm text-muted-foreground">
              {t('login.missingClient')}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
