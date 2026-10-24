import { cn } from '@whip/ui';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import { useCreateCampaign } from '../../../api/hooks';
import { campaignPath } from '../../../lib/params';
import { toast } from '../../../stores/toast-store';
import { uiSound } from '../../audio/use-ui-sound';
import { CandidateCard } from '../candidate-card';
import { GENDERS, PRESETS, SEAT, STRENGTHS, type Player } from '../copy';
import { useBackKey } from '../keys';
import { primaryButton } from '../styles';
import { OptionTiles, ScreenHeader } from '../screen-kit';

const STEPS = [
  { id: 'member', label: 'Member' },
  { id: 'strength', label: 'Strength' },
  { id: 'leaning', label: 'Leaning' },
  { id: 'confirm', label: 'Swear in' },
] as const;

const inputClass = cn(
  'h-12 w-full min-w-0 border-0 border-b-2 border-paper/40 bg-transparent px-0 font-display text-2xl font-extrabold text-paper-bright [font-stretch:80%]',
  'placeholder:text-paper/30 focus:border-whip focus:outline-none aria-invalid:border-whip',
);

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-[13px] font-semibold text-paper/75">
        {label}
      </label>
      {children}
    </div>
  );
}

/** ↑/↓ move between the step's fields (text inputs have no use for them). */
function moveField(e: KeyboardEvent<HTMLElement>) {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const target = e.target as HTMLElement;
  const isText = target.tagName === 'INPUT';
  // In text fields only the arrow keys move; W/S are letters.
  const up = isText ? e.key === 'ArrowUp' : false;
  const down = isText ? e.key === 'ArrowDown' : false;
  if (!up && !down) return;
  const fields = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-field]')].filter(
    (el) => el.tabIndex >= 0,
  );
  const i = fields.indexOf(target);
  const next = fields[i + (up ? -1 : 1)];
  if (next) {
    e.preventDefault();
    next.focus();
  }
}

export function NewCareerScreen({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const create = useCreateCampaign();
  const ids = { title: useId(), first: useId(), last: useId(), save: useId(), err: useId() };
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [name, setName] = useState<string>(SEAT.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [player, setPlayer] = useState<Player>({
    firstName: '',
    lastName: '',
    gender: 'female',
    strength: 'negotiation',
    ideologyPreset: 'moderniser',
  });
  const set = <K extends keyof Player>(k: K, v: Player[K]) => setPlayer((p) => ({ ...p, [k]: v }));
  const firstRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);

  const goTo = (i: number) => {
    setStep(i);
    setReached((r) => Math.max(r, i));
  };

  useEffect(() => {
    if (step === 0) firstRef.current?.focus();
    if (step === 3) confirmRef.current?.focus();
  }, [step]);

  useBackKey(() => {
    if (create.isPending) return false;
    if (step > 0) goTo(step - 1);
    else onBack();
    return true;
  });

  const validateMember = () => {
    if (!player.firstName.trim() || !player.lastName.trim()) {
      setNameError('Enter a first and last name for your Member.');
      return false;
    }
    if (!name.trim()) {
      setNameError('Give this career a save name.');
      return false;
    }
    setNameError(null);
    return true;
  };

  const nextFromMember = (e: FormEvent) => {
    e.preventDefault();
    if (validateMember()) goTo(1);
  };

  const submit = () => {
    if (!validateMember()) {
      goTo(0);
      return;
    }
    create.mutate(
      {
        name: name.trim(),
        scenarioKey: 'first_weeks',
        player: { ...player, firstName: player.firstName.trim(), lastName: player.lastName.trim() },
      },
      {
        onSuccess: (c) => {
          toast({
            title: 'Career started',
            description: `${c.playerName} takes their seat.`,
            tone: 'good',
          });
          uiSound.whoosh();
          void navigate(campaignPath(c.id));
        },
      },
    );
  };

  const apiError = create.isError ? create.error.message : null;

  return (
    <section
      aria-labelledby={ids.title}
      className="flex min-h-0 flex-1 flex-col gap-8 lg:flex-row lg:gap-12"
    >
      <div className="flex min-h-0 w-full max-w-[30rem] flex-col">
        <ScreenHeader id={ids.title} title="New career" onBack={onBack}>
          <ol aria-label="Steps" className="mt-5 flex flex-wrap gap-x-5 gap-y-1">
            {STEPS.map((s, i) => {
              const current = i === step;
              const canJump = i <= reached && !current;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={!canJump}
                    aria-current={current ? 'step' : undefined}
                    onClick={() => goTo(i)}
                    className={cn(
                      'flex min-h-8 items-center gap-2 text-[13px] font-bold tracking-[0.05em] uppercase tabular-nums',
                      current
                        ? 'text-paper-bright'
                        : i <= reached
                          ? 'cursor-pointer text-paper/70 hover:text-paper-bright'
                          : 'text-paper/35',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-whip',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-6 place-items-center border text-[11px]',
                        current ? 'border-whip bg-whip text-white' : 'border-current',
                      )}
                    >
                      {i + 1}
                    </span>
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ol>
        </ScreenHeader>

        <div
          ref={stepRef}
          key={step}
          className="mt-7 min-h-0 flex-1 animate-in-left overflow-y-auto pr-1 pb-2 scrollbar-thin"
          onKeyDown={moveField}
        >
          {step === 0 && (
            <form
              onSubmit={nextFromMember}
              noValidate
              className="grid gap-5"
              aria-describedby={nameError ? ids.err : undefined}
            >
              <p className="text-[15px] text-paper/80">
                The new Member for {SEAT.name}. Majority {SEAT.majority.toLocaleString('en-GB')}.
                Who are they?
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="First name" id={ids.first}>
                  <input
                    ref={firstRef}
                    id={ids.first}
                    data-field
                    required
                    maxLength={40}
                    autoComplete="off"
                    placeholder="Rachel"
                    aria-invalid={(!!nameError && !player.firstName.trim()) || undefined}
                    value={player.firstName}
                    onChange={(e) => set('firstName', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Last name" id={ids.last}>
                  <input
                    id={ids.last}
                    data-field
                    required
                    maxLength={40}
                    autoComplete="off"
                    placeholder="Danby"
                    aria-invalid={(!!nameError && !player.lastName.trim()) || undefined}
                    value={player.lastName}
                    onChange={(e) => set('lastName', e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="grid gap-2">
                <span className="text-[13px] font-semibold text-paper/75" id={`${ids.first}-g`}>
                  Gender
                </span>
                <OptionTiles
                  label="Gender"
                  orientation="horizontal"
                  options={GENDERS}
                  value={player.gender}
                  onChange={(v) => set('gender', v)}
                  onEscapeEdge={(d) => {
                    const fields = [
                      ...(stepRef.current?.querySelectorAll<HTMLElement>('[data-field]') ?? []),
                    ].filter((el) => el.tabIndex >= 0);
                    const i = fields.indexOf(document.activeElement as HTMLElement);
                    fields[i + d]?.focus();
                  }}
                />
              </div>
              <Field label="Save name" id={ids.save}>
                <input
                  id={ids.save}
                  data-field
                  required
                  maxLength={80}
                  value={name}
                  aria-invalid={(!!nameError && !name.trim()) || undefined}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </Field>
              {nameError && (
                <p id={ids.err} role="alert" className="text-sm font-semibold text-paper-bright">
                  <span
                    className="mr-2 inline-block h-3 w-1.5 bg-whip align-middle"
                    aria-hidden="true"
                  />
                  {nameError}
                </p>
              )}
              <div>
                <button type="submit" data-field className={primaryButton}>
                  Next: strength
                </button>
              </div>
            </form>
          )}

          {step === 1 && (
            <div className="grid gap-4">
              <p className="text-[15px] text-paper/80">What are you known for in the tea room?</p>
              <OptionTiles
                label="Your strength"
                options={STRENGTHS}
                value={player.strength}
                onChange={(v) => set('strength', v)}
                onConfirm={() => goTo(2)}
                autoFocus
              />
              <div>
                <button type="button" onClick={() => goTo(2)} className={primaryButton}>
                  Next: leaning
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4">
              <p className="text-[15px] text-paper/80">Where do you sit in the party?</p>
              <OptionTiles
                label="Where you sit in the party"
                options={PRESETS}
                value={player.ideologyPreset}
                onChange={(v) => set('ideologyPreset', v)}
                onConfirm={() => goTo(3)}
                autoFocus
              />
              <div>
                <button type="button" onClick={() => goTo(3)} className={primaryButton}>
                  Next: swear in
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-5">
              <p className="max-w-[44ch] text-[15px] leading-relaxed text-paper/80">
                The Housing Delivery Bill reaches second reading in four weeks. The whips want your
                vote, your faction wants your voice, and {SEAT.name} wants its green belt.
              </p>
              {apiError && (
                <p role="alert" className="text-sm font-semibold text-paper-bright">
                  <span
                    className="mr-2 inline-block h-3 w-1.5 bg-whip align-middle"
                    aria-hidden="true"
                  />
                  {apiError}
                </p>
              )}
              <div>
                <button
                  ref={confirmRef}
                  type="button"
                  onClick={submit}
                  disabled={create.isPending}
                  className={cn(primaryButton, 'h-16 px-8 text-3xl')}
                >
                  {create.isPending ? 'Counting the votes…' : 'Take your seat'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 lg:mt-28">
        <CandidateCard player={player} saveName={name} className="lg:-rotate-2" />
      </div>
    </section>
  );
}
