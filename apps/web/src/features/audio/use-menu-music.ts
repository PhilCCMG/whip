import { useEffect } from 'react';
import backbenchBalletMp3 from '../../assets/audio/music/backbench-ballet.mp3';
import backbenchBalletWebm from '../../assets/audio/music/backbench-ballet.webm';
import menuMp3 from '../../assets/audio/music/main-menu.mp3';
import menuWebm from '../../assets/audio/music/main-menu.webm';
import { useSettingsStore } from '../../stores/settings-store';
import { pickTrackSource, type TrackSources } from './format';
import { createMusicController, type MusicController } from './music';

/**
 * The game's two music tracks: the menu theme on the title/menu screens, and "Backbench Ballet"
 * inside a career. Each is its own looping controller; a screen asks for its track while it is
 * mounted, so going between the menu and a career fades one out as the other fades in (never
 * both at full), and moving between career tabs leaves the career track playing.
 */
export type TrackName = 'menu' | 'career';

/** The career track sits under play, a touch below the menu theme. */
export const CAREER_TRACK_GAIN = 0.8;

const TRACKS: Record<TrackName, { sources: TrackSources; gain: number }> = {
  menu: { sources: { webm: menuWebm, mp3: menuMp3 }, gain: 1 },
  career: {
    sources: { webm: backbenchBalletWebm, mp3: backbenchBalletMp3 },
    gain: CAREER_TRACK_GAIN,
  },
};

const shared = new Map<TrackName, MusicController>();
let subscribed = false;

/** One track's controller, created lazily (nothing loads until a screen asks for it). */
export function musicTrack(name: TrackName): MusicController {
  let music = shared.get(name);
  if (!music) {
    const track = TRACKS[name];
    music = createMusicController({ src: pickTrackSource(track.sources), gain: track.gain });
    const { sound, musicVolume } = useSettingsStore.getState();
    music.setEnabled(sound);
    music.setVolume(musicVolume);
    shared.set(name, music);
    if (!subscribed) {
      subscribed = true;
      useSettingsStore.subscribe((s, prev) => {
        for (const m of shared.values()) {
          if (s.sound !== prev.sound) m.setEnabled(s.sound);
          if (s.musicVolume !== prev.musicVolume) m.setVolume(s.musicVolume);
        }
      });
    }
  }
  return music;
}

/** The app-wide menu music controller. */
export const menuMusic = () => musicTrack('menu');
/** The in-career music controller ("Backbench Ballet"). */
export const careerMusic = () => musicTrack('career');

/** Scale whatever music exists (e.g. under the whoosh or the division bell); 1 restores it. */
export function duckMusic(factor: number, fadeMs?: number) {
  for (const m of shared.values()) m.duck(factor, fadeMs);
}

/** Play a track while the calling screen is mounted; fade it out when it unmounts. */
export function useMusicTrack(name: TrackName, active = true) {
  useEffect(() => {
    if (!active) return;
    const music = musicTrack(name);
    music.prepare();
    music.enter();
    return () => music.leave();
  }, [name, active]);
}

/** Play the menu music while the calling screen is mounted. */
export function useMenuMusic(active = true) {
  useMusicTrack('menu', active);
}

/** Play the career music while the campaign layout is mounted (it survives tab changes). */
export function useCareerMusic(active = true) {
  useMusicTrack('career', active);
}
