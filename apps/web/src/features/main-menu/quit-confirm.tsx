import { useEffect, useRef } from 'react';
import { uiSound } from '../audio/use-ui-sound';

/**
 * In-menu "Quit WHIP?" confirm (desktop only), in the same red block as the delete-save confirm.
 * "Keep playing" has focus, so a stray Enter never quits. Esc cancels.
 */
export function QuitConfirm({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  }, [onCancel]);
  useEffect(() => {
    keepRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      cancelRef.current();
      uiSound.click();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div
      role="alertdialog"
      aria-label="Quit WHIP?"
      className="flex w-full max-w-md animate-in-fade flex-col gap-4 bg-whip px-5 py-4 text-white"
    >
      <div>
        <p className="font-display text-2xl leading-none font-black uppercase [font-stretch:70%]">
          Quit WHIP?
        </p>
        <p className="mt-1 text-[13px] font-semibold text-white/90">
          Your careers are saved on the server. Pick up where you left off next time.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          ref={keepRef}
          type="button"
          onClick={onCancel}
          className="h-11 min-w-24 cursor-pointer border-2 border-white px-4 font-bold uppercase hover:bg-white hover:text-whip focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Keep playing
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="h-11 min-w-24 cursor-pointer bg-ink px-4 font-bold text-paper-bright uppercase hover:bg-moss-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Quit to desktop
        </button>
      </div>
    </div>
  );
}
