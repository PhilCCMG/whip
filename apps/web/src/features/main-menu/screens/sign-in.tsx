import { cn } from '@whip/ui';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useSendSignInCode, useSignIn } from '../../../api/hooks';
import { toast } from '../../../stores/toast-store';
import { useBackKey } from '../keys';
import { ScreenHeader } from '../screen-kit';
import { primaryButton } from '../styles';

const inputClass = cn(
  'h-14 w-full min-w-0 border-0 border-b-2 border-paper/40 bg-transparent px-0 font-display text-3xl font-extrabold text-paper-bright [font-stretch:80%]',
  'placeholder:text-paper/30 focus:border-whip focus:outline-none aria-invalid:border-whip',
);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ErrorLine({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} role="alert" className="text-sm font-semibold text-paper-bright">
      <span className="mr-2 inline-block h-3 w-1.5 bg-whip align-middle" aria-hidden="true" />
      {children}
    </p>
  );
}

export function SignInScreen({
  onBack,
  onSignedIn,
}: {
  onBack: () => void;
  onSignedIn: () => void;
}) {
  const ids = { title: useId(), email: useId(), code: useId(), err: useId() };
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const send = useSendSignInCode();
  const signIn = useSignIn();
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (stage === 'email' ? emailRef : codeRef).current?.focus();
  }, [stage]);

  useBackKey(() => {
    if (stage === 'code') {
      setStage('email');
      setCode('');
      signIn.reset();
    } else onBack();
  });

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault();
    const value = email.trim();
    if (!EMAIL.test(value)) {
      setLocalError('Enter the email address you play with.');
      return;
    }
    setLocalError(null);
    send.mutate(value, {
      onSuccess: () => {
        setStage('code');
        setCode('');
      },
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setLocalError('Enter the 6-digit code from the email.');
      return;
    }
    setLocalError(null);
    signIn.mutate(
      { email: email.trim(), otp: code },
      {
        onSuccess: () => {
          toast({ title: 'Signed in', description: email.trim(), tone: 'good' });
          onSignedIn();
        },
      },
    );
  };

  const error =
    localError ?? (stage === 'email' ? send.error?.message : signIn.error?.message) ?? null;

  return (
    <section aria-labelledby={ids.title} className="flex w-full max-w-[34rem] flex-col">
      <ScreenHeader id={ids.title} title="Sign in" onBack={onBack}>
        <p className="mt-3 max-w-[44ch] text-[15px] text-paper/80">
          {stage === 'email'
            ? 'Your careers are saved to your account. We’ll email you a 6-digit code. No password.'
            : `Enter the 6-digit code sent to ${email.trim()}. It lasts 10 minutes.`}
        </p>
      </ScreenHeader>

      {stage === 'email' ? (
        <form
          key="email"
          onSubmit={sendCode}
          noValidate
          className="mt-8 grid animate-in-left gap-5"
        >
          <div className="grid gap-1">
            <label htmlFor={ids.email} className="text-[13px] font-semibold text-paper/75">
              Email address
            </label>
            <input
              ref={emailRef}
              id={ids.email}
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              placeholder="you@example.com"
              value={email}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? ids.err : undefined}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          {error && <ErrorLine id={ids.err}>{error}</ErrorLine>}
          <div>
            <button type="submit" disabled={send.isPending} className={primaryButton}>
              {send.isPending ? 'Sending…' : 'Email me a code'}
            </button>
          </div>
        </form>
      ) : (
        <form key="code" onSubmit={verify} noValidate className="mt-8 grid animate-in-left gap-5">
          <div className="grid gap-1">
            <label htmlFor={ids.code} className="text-[13px] font-semibold text-paper/75">
              6-digit code
            </label>
            <input
              ref={codeRef}
              id={ids.code}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? ids.err : undefined}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className={cn(inputClass, 'max-w-[12ch] text-5xl tracking-[0.3em] tabular-nums')}
            />
          </div>
          {error && <ErrorLine id={ids.err}>{error}</ErrorLine>}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <button type="submit" disabled={signIn.isPending} className={primaryButton}>
              {signIn.isPending ? 'Checking…' : 'Sign in'}
            </button>
            <button
              type="button"
              disabled={send.isPending}
              onClick={() => sendCode()}
              className="min-h-11 cursor-pointer text-[13px] font-bold tracking-[0.05em] text-paper/80 uppercase underline decoration-paper/40 underline-offset-4 hover:text-paper-bright focus-visible:outline-2 focus-visible:outline-whip"
            >
              {send.isPending ? 'Sending…' : 'Send a new code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStage('email');
                signIn.reset();
              }}
              className="min-h-11 cursor-pointer text-[13px] font-bold tracking-[0.05em] text-paper/80 uppercase underline decoration-paper/40 underline-offset-4 hover:text-paper-bright focus-visible:outline-2 focus-visible:outline-whip"
            >
              Use a different email
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
