import { cn, CostChip, PartyChip, Portrait, Slash } from '@whip/ui';
import { ArrowLeft, Lock, Search } from 'lucide-react';
import { useDeferredValue, useId, useState, type ReactNode } from 'react';
import { isApiError } from '../api/errors';
import {
  useCampaignState,
  useCatalogue,
  usePlanAction,
  usePolitician,
  usePoliticianSearch,
} from '../api/hooks';
import type { ActionCatalogueItem, ActionParam } from '../api/types';
import { KIND_LABEL } from '../features/office/model';
import { DispatchFrame } from '../game-ui/dispatch-frame';
import { plural } from '../lib/format';
import { toast } from '../stores/toast-store';
import { useUiStore, type PlannerPrefill } from '../stores/ui-store';
import { ErrorState, Loading } from './states';

/** Actions answered elsewhere in the UI (dispatches on the desk), not from the planner. */
const HIDDEN_KINDS = new Set(['respond_to_event']);

/**
 * The action planner: a game picker. Step one deals the catalogue as cards (locked ones show
 * why); step two asks for targets, with MPs as a portrait grid.
 */
export function ActionPlanner({ campaignId }: { campaignId: string }) {
  const open = useUiStore((s) => s.plannerOpen);
  const prefill = useUiStore((s) => s.plannerPrefill);
  const close = useUiStore((s) => s.closePlanner);
  if (!open) return null;
  return (
    <PlannerBody
      key={JSON.stringify(prefill)}
      campaignId={campaignId}
      prefill={prefill}
      onDone={close}
    />
  );
}

function isRequired(p: ActionParam) {
  return p.type !== 'politicians';
}

function isFilled(p: ActionParam, v: unknown) {
  if (p.type === 'politicians') return Array.isArray(v);
  return typeof v === 'string' && v.length > 0;
}

function Budget({ free, capital }: { free: number | undefined; capital: number | undefined }) {
  if (free === undefined) return 'This week';
  return `${plural(free, 'diary slot')} free · ${capital ?? 0} political capital`;
}

function ActionCard({
  item,
  capital,
  free,
  onChoose,
}: {
  item: ActionCatalogueItem;
  capital: number;
  free: number;
  onChoose: () => void;
}) {
  const locked = !item.eligible;
  return (
    <button
      type="button"
      disabled={locked}
      onClick={onChoose}
      data-tutorial={`action-${item.kind}`}
      className={cn(
        'group relative flex h-full w-full cursor-pointer flex-col gap-2 p-4 text-left',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-whip',
        locked
          ? 'cursor-not-allowed bg-moss-900 text-paper/60 outline-1 -outline-offset-1 outline-paper/15'
          : 'bg-paper-bright text-ink hover:bg-white hover:outline-3 hover:-outline-offset-3 hover:outline-ink',
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col-reverse">
          {/* Title first in the DOM so the button is named by it; the kind sits above it visually. */}
          <span className="mt-1.5 block font-display text-[1.45rem] leading-[0.92] font-black uppercase [font-stretch:70%]">
            {item.label}
          </span>
          <span
            className={cn(
              'text-[11px] leading-none font-bold tracking-[0.08em] uppercase',
              locked ? 'text-paper/55' : 'text-whip',
            )}
          >
            {KIND_LABEL[item.kind]}
          </span>
        </span>
        {locked ? (
          <Lock aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        ) : (
          <Slash className="h-7 w-auto shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        )}
      </span>
      <span className="text-[13px] leading-snug opacity-85">{item.description}</span>
      {locked && item.reasons.length > 0 && (
        <span className="text-[12.5px] leading-snug font-bold text-lamp">
          <span className="sr-only">Locked: </span>
          {item.reasons.join(' ')}
        </span>
      )}
      <span className="mt-auto flex flex-wrap gap-1 pt-1">
        <CostChip
          kind="slots"
          value={item.slots}
          short={!locked && item.slots > free}
          tone={locked ? 'paper' : 'ink'}
          className={locked ? 'bg-paper/15 text-paper/70' : undefined}
        />
        <CostChip
          kind="capital"
          value={item.capitalCost}
          short={!locked && item.capitalCost > capital}
          tone={locked ? 'paper' : 'ink'}
          className={locked ? 'bg-paper/15 text-paper/70' : undefined}
        />
      </span>
    </button>
  );
}

function PlannerBody({
  campaignId,
  prefill,
  onDone,
}: {
  campaignId: string;
  prefill: PlannerPrefill | null;
  onDone: () => void;
}) {
  const catalogue = useCatalogue(campaignId);
  const state = useCampaignState(campaignId);
  const plan = usePlanAction(campaignId);
  const [kind, setKind] = useState(prefill?.kind ?? null);
  const [params, setParams] = useState<Record<string, unknown>>(prefill?.params ?? {});
  const [labels, setLabels] = useState<Record<string, string>>(prefill?.labels ?? {});

  const items = (catalogue.data?.items ?? []).filter((i) => !HIDDEN_KINDS.has(i.kind));
  const selected = items.find((i) => i.kind === kind) ?? null;
  const diary = state.data?.diary;
  const free = diary ? diary.slotsTotal - diary.slotsUsed : undefined;
  const capital = state.data?.standing.politicalCapital;

  const back = () => {
    setKind(null);
    setParams({});
    plan.reset();
  };

  const ready =
    selected?.eligible === true &&
    selected.params.every((p) => !isRequired(p) || isFilled(p, params[p.name]));

  const submit = () => {
    if (!selected || !ready) return;
    const clean = Object.fromEntries(
      selected.params
        .filter((p) => params[p.name] !== undefined)
        .map((p) => [p.name, params[p.name]]),
    );
    plan.mutate(
      { kind: selected.kind, params: clean },
      {
        onSuccess: (res) => {
          toast({ title: 'Added to diary', description: res.planned.label, tone: 'good' });
          onDone();
        },
      },
    );
  };

  const failure = plan.error;
  let body;
  if (catalogue.isPending)
    body = <Loading label="Asking what you’re allowed to do" className="text-paper" />;
  else if (catalogue.isError)
    body = (
      <div className="p-5">
        <ErrorState
          error={catalogue.error}
          onRetry={() => void catalogue.refetch()}
          className="bg-paper text-ink"
        />
      </div>
    );
  else if (!selected)
    body = (
      <ul
        aria-label="Available actions"
        className="grid gap-2 px-5 pb-5 sm:grid-cols-2 md:px-6 lg:grid-cols-3"
      >
        {[...items]
          .sort((a, b) => Number(b.eligible) - Number(a.eligible))
          .map((item) => (
            <li key={item.kind}>
              <ActionCard
                item={item}
                capital={capital ?? 0}
                free={free ?? 0}
                onChoose={() => {
                  setKind(item.kind);
                  plan.reset();
                }}
              />
            </li>
          ))}
      </ul>
    );
  else
    body = (
      <div className="grid gap-6 px-5 pb-5 md:px-6">
        {!selected.eligible && (
          <p role="alert" className="bg-whip px-3 py-2 text-sm font-semibold text-white">
            {selected.reasons.join(' ') || 'You can’t take this action right now.'}
          </p>
        )}
        {selected.params.length === 0 && (
          <p className="text-sm text-paper/80">No choices needed. Add it to your diary.</p>
        )}
        {selected.params.map((p) => (
          <ParamField
            key={p.name}
            campaignId={campaignId}
            param={p}
            value={params[p.name]}
            labels={labels}
            onChange={(v, newLabels) => {
              setParams((prev) => ({ ...prev, [p.name]: v }));
              if (newLabels) setLabels((prev) => ({ ...prev, ...newLabels }));
            }}
          />
        ))}
        {failure && (
          <div role="alert" className="bg-whip px-3 py-2 text-sm text-white">
            <p className="font-bold">
              {isApiError(failure, 'ACTION_INELIGIBLE')
                ? 'You can’t do that this week'
                : 'It did not go as planned'}
            </p>
            {isApiError(failure) && failure.reasons.length > 0 ? (
              <ul className="mt-1 list-disc pl-4">
                {failure.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-0.5">{failure.message}</p>
            )}
          </div>
        )}
      </div>
    );

  return (
    <DispatchFrame
      open
      onOpenChange={(o) => !o && onDone()}
      size="lg"
      kicker={<Budget free={free} capital={capital} />}
      title={selected ? selected.label : 'Plan an action'}
      description={selected ? selected.description : undefined}
      footer={
        selected ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={back}
              className="flex h-11 cursor-pointer items-center gap-2 px-2 text-[12px] font-bold tracking-[0.06em] text-paper/85 uppercase hover:text-paper-bright focus-visible:outline-2 focus-visible:outline-whip"
            >
              <ArrowLeft aria-hidden="true" className="size-4" /> All actions
            </button>
            <div className="flex items-center gap-3">
              <span className="flex gap-1">
                <CostChip kind="slots" value={selected.slots} tone="paper" />
                <CostChip kind="capital" value={selected.capitalCost} tone="paper" />
              </span>
              <button
                type="button"
                disabled={!ready || plan.isPending}
                onClick={submit}
                className="h-12 min-w-44 cursor-pointer bg-whip px-6 font-display text-xl font-black text-white uppercase [font-stretch:72%] hover:bg-whip-dark focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-paper-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                {plan.isPending ? 'Adding…' : 'Add to diary'}
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      {body}
    </DispatchFrame>
  );
}

interface ParamFieldProps {
  campaignId: string;
  param: ActionParam;
  value: unknown;
  labels: Record<string, string>;
  onChange: (value: unknown, labels?: Record<string, string>) => void;
}

function ParamField(props: ParamFieldProps) {
  const { param } = props;
  if ((param.type === 'politician' || param.type === 'politicians') && !param.options) {
    return <PoliticianPicker {...props} />;
  }
  return <OptionField {...props} />;
}

function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  const Tag = htmlFor ? 'label' : 'span';
  return (
    <Tag
      htmlFor={htmlFor}
      className="mb-2 block text-[11px] font-bold tracking-[0.08em] text-paper/80 uppercase"
    >
      {children}
    </Tag>
  );
}

function OptionField({ param, value, onChange }: ParamFieldProps) {
  const name = useId();
  const options = param.options ?? [];
  const multi = param.type === 'politicians';
  const selected = new Set(
    Array.isArray(value) ? (value as string[]) : typeof value === 'string' && value ? [value] : [],
  );
  return (
    <fieldset>
      <legend className="mb-2 text-[11px] font-bold tracking-[0.08em] text-paper/80 uppercase">
        {param.label}
      </legend>
      {options.length === 0 ? (
        <p className="text-sm text-paper/70">Nothing to choose from right now.</p>
      ) : (
        <div
          className={cn(
            'grid gap-2',
            options.length <= 3 && options.every((o) => o.label.length < 14)
              ? 'grid-cols-3'
              : 'sm:grid-cols-2',
          )}
        >
          {options.map((o) => {
            const checked = selected.has(o.id);
            return (
              <label
                key={o.id}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 border-2 px-3 py-2.5',
                  'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-whip',
                  checked
                    ? 'border-paper-bright bg-paper-bright text-ink'
                    : 'border-paper/25 text-paper hover:border-paper/60',
                )}
              >
                <input
                  type={multi ? 'checkbox' : 'radio'}
                  name={name}
                  value={o.id}
                  checked={checked}
                  onChange={() => {
                    if (!multi) return onChange(o.id);
                    const next = new Set(selected);
                    if (next.has(o.id)) next.delete(o.id);
                    else if (next.size < (param.max ?? Infinity)) next.add(o.id);
                    onChange([...next]);
                  }}
                  className="sr-only"
                />
                {checked && <Slash className="h-6 w-auto shrink-0" />}
                <span className="min-w-0">
                  <span className="block font-display text-lg leading-none font-black uppercase [font-stretch:72%]">
                    {o.label}
                  </span>
                  {o.hint && <span className="mt-1 block text-xs opacity-75">{o.hint}</span>}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

function PoliticianPicker({ campaignId, param, value, labels, onChange }: ParamFieldProps) {
  const inputId = useId();
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search.trim());
  const results = usePoliticianSearch(campaignId, deferred);
  const multi = param.type === 'politicians';
  const max = multi ? (param.max ?? 3) : 1;
  const selectedIds: string[] = multi
    ? Array.isArray(value)
      ? (value as string[])
      : []
    : typeof value === 'string' && value
      ? [value]
      : [];

  const toggle = (id: string, name: string) => {
    const has = selectedIds.includes(id);
    if (!multi) return onChange(has ? undefined : id, { [id]: name });
    if (has) return onChange(selectedIds.filter((x) => x !== id));
    if (selectedIds.length >= max) return;
    onChange([...selectedIds, id], { [id]: name });
  };

  const rows = (results.data?.items ?? []).filter((p) => !p.isPlayer);
  return (
    <div>
      <FieldLabel htmlFor={inputId}>
        {param.label}
        {multi && ` (up to ${max}, optional)`}
      </FieldLabel>
      {selectedIds.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Selected">
          {selectedIds.map((id) => (
            <SelectedTarget
              key={id}
              campaignId={campaignId}
              id={id}
              known={labels[id] ?? param.options?.find((o) => o.id === id)?.label}
              onRemove={(name) => toggle(id, name)}
            />
          ))}
        </ul>
      )}
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink/60"
        />
        <input
          id={inputId}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Members by name"
          autoComplete="off"
          className="h-11 w-full bg-paper-bright pr-3 pl-9 text-[15px] text-ink outline-none placeholder:text-ink/50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-whip"
        />
      </div>
      <ul
        className="mt-3 grid max-h-[22rem] grid-cols-2 gap-2 overflow-y-auto scrollbar-thin sm:grid-cols-3 lg:grid-cols-4"
        aria-label="Search results"
        aria-busy={results.isFetching}
      >
        {results.isPending ? (
          <li className="col-span-full py-3 text-sm text-paper/70">Searching…</li>
        ) : rows.length === 0 ? (
          <li className="col-span-full py-3 text-sm text-paper/70">
            No Member answers to “{deferred}”.
          </li>
        ) : (
          rows.map((p) => {
            const checked = selectedIds.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggle(p.id, p.name)}
                  className={cn(
                    'flex h-full w-full cursor-pointer items-start gap-2.5 p-2 text-left',
                    'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-whip',
                    checked
                      ? 'bg-paper-bright text-ink'
                      : 'bg-moss-900 text-paper hover:bg-moss-800',
                  )}
                >
                  <Portrait seed={p.id} partyColour={p.partyColour} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[1.05rem] leading-[0.95] font-black uppercase [font-stretch:72%]">
                      {p.name}
                    </span>
                    <PartyChip
                      colour={p.partyColour}
                      label={p.partyShort ?? 'Ind'}
                      className="mt-1"
                    />
                    <span className="mt-0.5 block truncate text-[11px] opacity-75">
                      {p.offices[0] ?? p.constituencyName ?? ''}
                    </span>
                  </span>
                  {checked && <Slash className="h-6 w-auto shrink-0" />}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

/**
 * A chosen target, shown above the results whatever the current search page holds (a target
 * prefilled from a dossier may not be among the first results). The name comes from the
 * prefill labels or the param's options; the profile (usually cached) supplies the rest.
 */
function SelectedTarget({
  campaignId,
  id,
  known,
  onRemove,
}: {
  campaignId: string;
  id: string;
  known: string | undefined;
  onRemove: (name: string) => void;
}) {
  const profile = usePolitician(campaignId, id);
  const name = known ?? profile.data?.name ?? 'Consulting the whips…';
  const detail = profile.data
    ? [profile.data.partyShort, profile.data.offices[0] ?? profile.data.constituencyName]
        .filter(Boolean)
        .join(' · ')
    : null;
  return (
    <li>
      <button
        type="button"
        onClick={() => onRemove(name)}
        className="inline-flex cursor-pointer items-center gap-2 bg-paper-bright py-1 pr-2 pl-1 text-left text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-whip"
        aria-label={`Remove ${name}`}
      >
        <Portrait seed={id} partyColour={profile.data?.partyColour} size="sm" />
        <span className="min-w-0">
          <span className="block font-display text-[1rem] leading-[0.95] font-black uppercase [font-stretch:72%]">
            {name}
          </span>
          {detail && <span className="block text-[11px] text-ink/70">{detail}</span>}
        </span>
        <span aria-hidden="true" className="ml-1 text-sm font-bold">
          ×
        </span>
      </button>
    </li>
  );
}
