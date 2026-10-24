import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  PartyChip,
} from '@whip/ui';
import { ArrowLeft, Check, Search } from 'lucide-react';
import { useDeferredValue, useId, useState } from 'react';
import { isApiError } from '../api/errors';
import { useCampaignState, useCatalogue, usePlanAction, usePoliticianSearch } from '../api/hooks';
import type { ActionCatalogueItem, ActionParam } from '../api/types';
import { plural } from '../lib/format';
import { toast } from '../stores/toast-store';
import { useUiStore, type PlannerPrefill } from '../stores/ui-store';
import { ErrorState, Loading } from './states';

/** Actions answered elsewhere in the UI (pending event cards), not from the planner. */
const HIDDEN_KINDS = new Set(['respond_to_event']);

export function ActionPlanner({ campaignId }: { campaignId: string }) {
  const open = useUiStore((s) => s.plannerOpen);
  const prefill = useUiStore((s) => s.plannerPrefill);
  const close = useUiStore((s) => s.closePlanner);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-2xl" aria-describedby={undefined}>
        {open && (
          <PlannerBody
            key={JSON.stringify(prefill)}
            campaignId={campaignId}
            prefill={prefill}
            onDone={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CostChips({ item }: { item: Pick<ActionCatalogueItem, 'slots' | 'capitalCost'> }) {
  return (
    <span className="flex shrink-0 gap-1">
      <Badge tone="outline">{item.slots === 0 ? 'No slot' : plural(item.slots, 'slot')}</Badge>
      <Badge tone={item.capitalCost > 0 ? 'ink' : 'outline'}>{item.capitalCost} PC</Badge>
    </span>
  );
}

function isRequired(p: ActionParam) {
  return p.type !== 'politicians';
}

function isFilled(p: ActionParam, v: unknown) {
  if (p.type === 'politicians') return Array.isArray(v);
  return typeof v === 'string' && v.length > 0;
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
  const capital = state.data?.standing.politicalCapital;

  const choose = (item: ActionCatalogueItem) => {
    setKind(item.kind);
    plan.reset();
  };
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

  const header = (
    <DialogHeader>
      <p className="text-xs font-semibold opacity-65">
        {diary
          ? `${plural(diary.slotsTotal - diary.slotsUsed, 'slot')} free this week · ${capital ?? 0} political capital`
          : 'This week'}
      </p>
      <DialogTitle className="mt-1">{selected ? selected.label : 'Plan an action'}</DialogTitle>
      {selected && <DialogDescription>{selected.description}</DialogDescription>}
    </DialogHeader>
  );

  if (catalogue.isPending) {
    return (
      <>
        {header}
        <Loading label="Loading your options" />
      </>
    );
  }
  if (catalogue.isError) {
    return (
      <>
        {header}
        <DialogBody>
          <ErrorState error={catalogue.error} onRetry={() => void catalogue.refetch()} />
        </DialogBody>
      </>
    );
  }

  if (!selected) {
    return (
      <>
        {header}
        <DialogBody className="p-0">
          <ul className="divide-y divide-border" aria-label="Available actions">
            {items.map((item) => (
              <li key={item.kind}>
                <button
                  type="button"
                  disabled={!item.eligible}
                  onClick={() => choose(item)}
                  className={cn(
                    'grid w-full cursor-pointer gap-1 px-5 py-3 text-left',
                    'hover:bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                    'disabled:cursor-not-allowed disabled:hover:bg-transparent',
                  )}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        'font-display text-lg leading-tight font-extrabold font-stretch-condensed',
                        !item.eligible && 'opacity-45',
                      )}
                    >
                      {item.label}
                    </span>
                    <CostChips item={item} />
                  </span>
                  <span
                    className={cn(
                      'text-[13px] leading-snug opacity-75',
                      !item.eligible && 'opacity-45',
                    )}
                  >
                    {item.description}
                  </span>
                  {!item.eligible && item.reasons.length > 0 && (
                    <span className="text-xs font-semibold text-whip">
                      {item.reasons.join(' ')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </DialogBody>
      </>
    );
  }

  const failure = plan.error;
  return (
    <>
      {header}
      <DialogBody className="grid gap-5">
        {!selected.eligible && (
          <p role="alert" className="border-l-4 border-whip pl-3 text-sm">
            {selected.reasons.join(' ') || 'You can’t take this action right now.'}
          </p>
        )}
        {selected.params.length === 0 && (
          <p className="text-sm opacity-70">No choices needed. Add it to your diary.</p>
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
          <div role="alert" className="border-l-4 border-whip pl-3 text-sm">
            <p className="font-semibold">
              {isApiError(failure, 'ACTION_INELIGIBLE')
                ? 'You can’t do that this week'
                : 'Couldn’t add this to your diary'}
            </p>
            {isApiError(failure) && failure.reasons.length > 0 ? (
              <ul className="mt-1 list-disc pl-4 opacity-80">
                {failure.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-0.5 opacity-80">{failure.message}</p>
            )}
          </div>
        )}
      </DialogBody>
      <DialogFooter className="justify-between">
        <Button variant="ghost" size="sm" onClick={back}>
          <ArrowLeft /> All actions
        </Button>
        <div className="flex items-center gap-3">
          <CostChips item={selected} />
          <Button variant="whip" disabled={!ready || plan.isPending} onClick={submit}>
            {plan.isPending ? 'Adding…' : 'Add to diary'}
          </Button>
        </div>
      </DialogFooter>
    </>
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

function OptionField({ param, value, onChange }: ParamFieldProps) {
  const name = useId();
  const options = param.options ?? [];
  const multi = param.type === 'politicians';
  const selected = new Set(
    Array.isArray(value) ? (value as string[]) : typeof value === 'string' && value ? [value] : [],
  );
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold opacity-70">{param.label}</legend>
      {options.length === 0 ? (
        <p className="text-sm opacity-60">Nothing to choose from right now.</p>
      ) : (
        <div
          className={cn(
            'grid gap-1.5',
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
                  'flex cursor-pointer items-start gap-2.5 border px-3 py-2 text-sm',
                  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
                  checked
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:border-foreground/60',
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
                <span className="min-w-0">
                  <span className="block leading-tight font-semibold">{o.label}</span>
                  {o.hint && <span className="mt-0.5 block text-xs opacity-70">{o.hint}</span>}
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
    <div className="grid gap-2">
      <label htmlFor={inputId} className="text-xs font-semibold opacity-70">
        {param.label}
        {multi && ` (up to ${max}, optional)`}
      </label>
      {selectedIds.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected">
          {selectedIds.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => toggle(id, labels[id] ?? id)}
                className="inline-flex cursor-pointer items-center gap-1.5 bg-foreground px-2 py-1 text-xs font-semibold text-background focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                aria-label={`Remove ${labels[id] ?? id}`}
              >
                {labels[id] ?? id} <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 opacity-50"
        />
        <Input
          id={inputId}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search MPs by name"
          className="pl-9"
          autoComplete="off"
        />
      </div>
      <ul
        className="max-h-60 divide-y divide-border overflow-y-auto border border-border"
        aria-label="Search results"
        aria-busy={results.isFetching}
      >
        {results.isPending ? (
          <li className="px-3 py-2 text-sm opacity-60">Searching…</li>
        ) : rows.length === 0 ? (
          <li className="px-3 py-2 text-sm opacity-60">No MPs match “{deferred}”.</li>
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
                    'flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm',
                    'hover:bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                    checked && 'bg-secondary',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block truncate text-xs opacity-65">
                      {p.offices[0] ?? p.constituencyName ?? ''}
                      {p.factionName ? ` · ${p.factionName}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <PartyChip colour={p.partyColour} label={p.partyShort ?? 'Ind'} />
                    <span
                      aria-hidden="true"
                      className={cn(
                        'inline-flex size-5 items-center justify-center border',
                        checked
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border',
                      )}
                    >
                      {checked && <Check className="size-3.5" />}
                    </span>
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
