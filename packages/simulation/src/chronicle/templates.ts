import type { ContentRegistry, HistoryTemplateKey } from '@whip/domain';

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

export const VOTE_LABEL: Record<'aye' | 'no' | 'abstain', string> = {
  aye: 'Aye',
  no: 'No',
  abstain: 'abstain',
};

export function stageLabel(stage: string): string {
  return stage.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
