import type { ContentRegistry, HeadlineTemplateKey, HistoryTemplateKey } from '@whip/domain';
import { hashInt } from '../rng';

export type TemplateVars = Record<string, string | number>;

/** Replace `{name}` placeholders; unknown placeholders are left untouched. */
export function fillTemplate(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{(\w+)\}/g, (m: string, key: string) => {
      const v = vars[key];
      return v === undefined ? m : String(v);
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function historyText(
  content: ContentRegistry,
  key: HistoryTemplateKey,
  vars: TemplateVars,
): { title: string; summary: string } {
  const t = content.templates.history[key];
  return { title: fillTemplate(t.title, vars), summary: fillTemplate(t.summary, vars) };
}

/** Deterministic variant choice: hash of the key and the given parts (no RNG stream consumed). */
export function headlineText(
  content: ContentRegistry,
  key: HeadlineTemplateKey,
  vars: TemplateVars,
  ...parts: (string | number)[]
): { text: string; standfirst: string } {
  const variants = content.templates.headlines[key];
  const v = variants[hashInt(key, ...parts) % variants.length] ?? variants[0];
  if (!v) return { text: key, standfirst: '' };
  return { text: fillTemplate(v.text, vars), standfirst: fillTemplate(v.standfirst, vars) };
}

export const VOTE_LABEL: Record<'aye' | 'no' | 'abstain', string> = {
  aye: 'Aye',
  no: 'No',
  abstain: 'abstain',
};

export function stageLabel(stage: string): string {
  return stage.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
