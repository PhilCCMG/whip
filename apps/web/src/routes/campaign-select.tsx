import type { CreateCampaignRequest } from '@whip/contracts';
import { Button, cn, Input, Label, Select, WhipWordmark } from '@whip/ui';
import { Trash } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { isApiError } from '../api/errors';
import { useCampaigns, useCreateCampaign, useDeleteCampaign } from '../api/hooks';
import { isMockMode } from '../api/runtime';
import type { CampaignSummary } from '../api/types';
import { ErrorState, Loading } from '../components/states';
import { formatSimDate, formatTimestamp } from '../lib/format';
import { campaignPath } from '../lib/params';
import { toast } from '../stores/toast-store';

type Player = CreateCampaignRequest['player'];

const STRENGTHS: { value: Player['strength']; label: string; blurb: string }[] = [
  { value: 'oratory', label: 'Oratory', blurb: 'Speeches move votes and headlines.' },
  { value: 'negotiation', label: 'Negotiation', blurb: 'Meetings land better. Deals stick.' },
  { value: 'intrigue', label: 'Intrigue', blurb: 'You hear things. The whips hear less.' },
  { value: 'policy', label: 'Policy', blurb: 'You know the detail of every bill.' },
];

const PRESETS: { value: Player['ideologyPreset']; label: string; blurb: string }[] = [
  { value: 'moderniser', label: 'Moderniser', blurb: 'Close to the leadership and the bill.' },
  { value: 'heartlands', label: 'Heartlands', blurb: 'The party’s left. Wants social housing.' },
  { value: 'independent', label: 'Independent-minded', blurb: 'Your own view, your own seat.' },
];

function ChoiceGroup<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
  columns,
}: {
  legend: string;
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; blurb: string }[];
  columns: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-semibold text-paper/65">{legend}</legend>
      <div className={cn('grid gap-1.5', columns)}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'cursor-pointer border px-3 py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
              value === o.value
                ? 'border-whip bg-whip/15'
                : 'border-white/15 hover:border-white/40',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span className="block text-sm font-semibold">{o.label}</span>
            <span className="mt-0.5 block text-xs leading-snug text-paper/60">{o.blurb}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Field({ label, children, id }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-paper/65">
        {label}
      </Label>
      {children}
    </div>
  );
}

function NewCareerForm() {
  const navigate = useNavigate();
  const create = useCreateCampaign();
  const ids = { name: useId(), first: useId(), last: useId(), gender: useId() };
  const [name, setName] = useState('Ashby & Wold');
  const [player, setPlayer] = useState<Player>({
    firstName: '',
    lastName: '',
    gender: 'female',
    strength: 'negotiation',
    ideologyPreset: 'moderniser',
  });
  const set = <K extends keyof Player>(k: K, v: Player[K]) => setPlayer((p) => ({ ...p, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name: name.trim(), scenarioKey: 'first_weeks', player },
      {
        onSuccess: (c) => {
          toast({
            title: 'Career started',
            description: `${c.playerName} takes their seat.`,
            tone: 'good',
          });
          void navigate(campaignPath(c.id));
        },
      },
    );
  };

  const fieldError = isApiError(create.error, 'VALIDATION_FAILED') ? create.error.message : null;
  const fieldClass = 'border-white/20 bg-white/5 text-paper placeholder:text-paper/35';

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-[minmax(0,1fr)] gap-4"
      aria-labelledby="new-career-title"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" id={ids.first}>
          <Input
            id={ids.first}
            required
            maxLength={40}
            autoComplete="off"
            value={player.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            className={fieldClass}
            placeholder="Rachel"
          />
        </Field>
        <Field label="Last name" id={ids.last}>
          <Input
            id={ids.last}
            required
            maxLength={40}
            autoComplete="off"
            value={player.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            className={fieldClass}
            placeholder="Danby"
          />
        </Field>
        <Field label="Gender" id={ids.gender}>
          <Select
            id={ids.gender}
            value={player.gender}
            onChange={(e) => set('gender', e.target.value as Player['gender'])}
            className={fieldClass}
          >
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="nonbinary">Non-binary</option>
          </Select>
        </Field>
        <Field label="Save name" id={ids.name}>
          <Input
            id={ids.name}
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
          />
        </Field>
      </div>
      <ChoiceGroup
        legend="Your strength"
        name="strength"
        value={player.strength}
        onChange={(v) => set('strength', v)}
        options={STRENGTHS}
        columns="grid-cols-2"
      />
      <ChoiceGroup
        legend="Where you sit in the party"
        name="ideology"
        value={player.ideologyPreset}
        onChange={(v) => set('ideologyPreset', v)}
        options={PRESETS}
        columns="sm:grid-cols-3"
      />
      {create.isError && (
        <p role="alert" className="border-l-4 border-whip pl-3 text-sm">
          {fieldError ?? create.error.message}
        </p>
      )}
      <Button
        type="submit"
        variant="whip"
        size="lg"
        disabled={create.isPending}
        className="justify-self-start font-display text-lg font-extrabold font-stretch-condensed"
      >
        {create.isPending ? 'Counting the votes…' : 'Take your seat'}
      </Button>
    </form>
  );
}

function SavedCareers({ campaigns }: { campaigns: CampaignSummary[] }) {
  const del = useDeleteCampaign();
  if (campaigns.length === 0) {
    return <p className="text-sm text-paper/60">No saved careers yet. Start one above.</p>;
  }
  return (
    <ul className="divide-y divide-white/10 border-y border-white/10">
      {campaigns.map((c) => (
        <li key={c.id} className="flex items-center gap-3 py-2.5">
          <Link
            to={campaignPath(c.id)}
            className="min-w-0 flex-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="block truncate font-semibold hover:underline">{c.name}</span>
            <span className="block truncate text-xs text-paper/60">
              {c.playerName} · Week {c.turn}, {formatSimDate(c.simDate)} · saved{' '}
              {formatTimestamp(c.updatedAt)}
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="text-paper/60 hover:text-whip"
            aria-label={`Delete ${c.name}`}
            disabled={del.isPending}
            onClick={() => {
              if (window.confirm(`Delete “${c.name}”? This can’t be undone.`)) {
                del.mutate(c.id, {
                  onSuccess: () => toast({ title: 'Career deleted', description: c.name }),
                });
              }
            }}
          >
            <Trash aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function Component() {
  const campaigns = useCampaigns();
  const list = [...(campaigns.data?.items ?? [])].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const latest = list[0];

  return (
    <div className="min-h-dvh bg-ink text-paper">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14 lg:pt-10">
        <header className="lg:sticky lg:top-10 lg:self-start">
          <div className="flex items-center justify-between border-b-[3px] border-whip pb-2">
            <span className="text-xs font-semibold text-paper/60">
              House of Commons · September 2029
            </span>
            {isMockMode && <span className="text-xs font-semibold text-warning">Demo data</span>}
          </div>
          <h1 className="mt-6 text-paper">
            <WhipWordmark title="WHIP" className="h-auto w-full max-w-[34rem]" />
          </h1>
          <p className="mt-6 max-w-[34ch] font-display text-[clamp(1.6rem,3.4vw,2.4rem)] leading-[0.98] font-extrabold font-stretch-condensed">
            You are the new Member for a marginal seat. Your majority is 1,840.
          </p>
          <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-paper/70">
            The government’s Housing Delivery Bill reaches second reading in four weeks. The whips
            want your vote, your faction wants your voice, and your constituents want their green
            belt. Plan each week, read the room, and decide when loyalty stops paying.
          </p>
          {latest && (
            <div className="mt-8 border-l-4 border-whip bg-white/[0.04] px-4 py-3">
              <p className="text-xs font-semibold text-paper/60">Continue</p>
              <p className="mt-0.5 font-display text-2xl leading-tight font-extrabold font-stretch-condensed">
                {latest.name}
              </p>
              <p className="text-sm text-paper/70">
                {latest.playerName} · Week {latest.turn}, {formatSimDate(latest.simDate)}
              </p>
              <Button asChild variant="whip" className="mt-3">
                <Link to={campaignPath(latest.id)}>Continue career</Link>
              </Button>
            </div>
          )}
        </header>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-10">
          <section aria-labelledby="new-career-title" className="border-t-[3px] border-paper pt-3">
            <h2
              id="new-career-title"
              className="mb-4 font-display text-3xl leading-none font-black font-stretch-condensed"
            >
              New career
            </h2>
            <NewCareerForm />
          </section>

          <section aria-labelledby="saved-title" className="border-t-[3px] border-paper pt-3">
            <h2
              id="saved-title"
              className="mb-3 font-display text-3xl leading-none font-black font-stretch-condensed"
            >
              Saved careers
            </h2>
            {campaigns.isPending ? (
              <Loading label="Loading careers" className="px-0" />
            ) : campaigns.isError ? (
              <ErrorState error={campaigns.error} onRetry={() => void campaigns.refetch()} />
            ) : (
              <SavedCareers campaigns={list} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
