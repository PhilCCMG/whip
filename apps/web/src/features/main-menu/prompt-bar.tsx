import { cn, Keycap, ReturnKeyIcon } from '@whip/ui';
import { Fragment } from 'react';

export interface Prompt {
  keys: string[];
  label: string;
  /** Pointer/touch shortcut for the same action (e.g. Back). */
  onPress?: () => void;
}

/** Bottom-right button prompts, as on a console front end. Updated per screen. */
export function PromptBar({ prompts, className }: { prompts: Prompt[]; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-5 text-[11px] font-bold tracking-[0.06em] uppercase',
        className,
      )}
    >
      {prompts.map((p) => {
        const body = (
          <>
            <span className="flex gap-1">
              {p.keys.map((k) => (
                <Keycap key={k} className={k === 'Enter' ? 'gap-1 px-2' : undefined}>
                  {k === 'Enter' ? (
                    <>
                      <ReturnKeyIcon className="text-[12px]" />
                      Enter
                    </>
                  ) : (
                    k
                  )}
                </Keycap>
              ))}
            </span>
            <span>{p.label}</span>
          </>
        );
        return (
          <Fragment key={p.label}>
            {p.onPress ? (
              <button
                type="button"
                onClick={p.onPress}
                className="flex cursor-pointer items-center gap-2 uppercase text-paper/85 hover:text-paper-bright focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-whip"
              >
                {body}
              </button>
            ) : (
              <span className="flex items-center gap-2 text-paper/75" aria-hidden="true">
                {body}
              </span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
