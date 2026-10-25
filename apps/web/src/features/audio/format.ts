/** A music track shipped twice: Opus in WebM (smaller) and MP3 (plays everywhere). */
export interface TrackSources {
  webm: string;
  mp3: string;
}

export const OPUS_TYPE = 'audio/webm; codecs="opus"';

/** `canPlayType` on a throwaway element; '' when there is no media support at all. */
function defaultCanPlay(type: string): string {
  try {
    return typeof Audio === 'undefined' ? '' : new Audio().canPlayType(type);
  } catch {
    return '';
  }
}

/**
 * The URL to play: the WebM/Opus file when the browser says it can ("maybe" or "probably"),
 * otherwise the MP3 (older Safari, and anything that can't tell).
 */
export function pickTrackSource(
  sources: TrackSources,
  canPlayType: (type: string) => string = defaultCanPlay,
): string {
  let answer: string;
  try {
    answer = canPlayType(OPUS_TYPE);
  } catch {
    answer = '';
  }
  return answer ? sources.webm : sources.mp3;
}
