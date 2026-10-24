import { useEffect } from 'react';
import menuTrack from '../../assets/audio/main-menu.mp3';
import { useSettingsStore } from '../../stores/settings-store';
import { createMusicController, type MusicController } from './music';

let shared: MusicController | null = null;

/** The app-wide menu music controller (created lazily, so nothing loads before the menu). */
export function menuMusic(): MusicController {
  if (!shared) {
    shared = createMusicController({ src: menuTrack });
    const { sound, musicVolume } = useSettingsStore.getState();
    shared.setEnabled(sound);
    shared.setVolume(musicVolume);
    useSettingsStore.subscribe((s, prev) => {
      if (s.sound !== prev.sound) shared?.setEnabled(s.sound);
      if (s.musicVolume !== prev.musicVolume) shared?.setVolume(s.musicVolume);
    });
  }
  return shared;
}

/** Play the menu music while the calling screen is mounted; fade it out when it unmounts. */
export function useMenuMusic(active = true) {
  useEffect(() => {
    if (!active) return;
    const music = menuMusic();
    music.prepare();
    music.enter();
    return () => music.leave();
  }, [active]);
}
