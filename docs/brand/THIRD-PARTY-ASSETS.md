# Assets and licences

Everything in the game that isn't original code, with its rights status.

Audio masters live in `apps/web/audio-src/` (music masters are git-ignored: too large). The app ships
only the compressed outputs in `apps/web/src/assets/audio/`, built by `node scripts/build-audio.mjs`.
Any sound whose source file name carries a Freesound number (`NNNNNN__author__name.wav`) is credited
on the Credits screen, whatever its licence.

| Asset | Shipped file (master) | Rights | Credit in game |
|---|---|---|---|
| UI click | `sfx/click.mp3` (`audio-src/sfx/click.wav`) | **CC BY 4.0**: "Click" by complex_waveform, https://freesound.org/s/213148/ | **Yes (required)**: "Click" by complex_waveform (freesound.org), CC BY 4.0 |
| End Week / result stamp | `sfx/stamp-heavy.mp3` (`audio-src/sfx/347325__newagesoup__thick-stamp-nosub.wav`) | **CC BY 4.0**: "thick-stamp-nosub.wav" by newagesoup, https://freesound.org/s/347325/ | **Yes (required)**: "thick-stamp-nosub.wav" by newagesoup (freesound.org), CC BY 4.0 |
| Outcome stamp | `sfx/stamp.mp3` (`audio-src/sfx/470710__ifekry__traditional-stamp.wav`, first 0.48s trimmed) | CC0: "traditional stamp.wav" by I.fekry, https://freesound.org/s/470710/ | Yes (courtesy): "traditional stamp.wav" by I.fekry (freesound.org), CC0 |
| Page turn | `sfx/page-turn.mp3` (`audio-src/sfx/397548__lilmati__page-turn-01.wav`) | CC0: "Page Turn 01" by LilMati, https://freesound.org/s/397548/ | Yes (courtesy): "Page Turn 01" by LilMati (freesound.org), CC0 |
| Division bells | `sfx/division-bell.mp3` (`audio-src/sfx/division_bells.wav`) | CheatCode Media Group (owner's own recording/edit) | No |
| Transition whoosh | `sfx/whoosh.mp3` (`audio-src/sfx/whoosh.wav`) | CheatCode Media Group (confirmed by owner, 2026-10-24). Note: the public Freesound listing (s/241146, Speedenza) shows CC BY-NC; keep the licence record that covers CCMG's use on file | No |
| Main menu music | `music/main-menu.webm` + `.mp3` (`audio-src/music/main-menu.mp3`) | CheatCode Media Group | No |
| In-game music, "Backbench Ballet" | `music/backbench-ballet.webm` + `.mp3` (`audio-src/music/Backbench Ballet.wav`) | CheatCode Media Group | No |
| Location backdrops (Office, Chamber, Division Lobby, Tea Room, Party HQ, Archive) | `apps/web/src/assets/art/bg/*.webp` (masters `apps/web/art-src/backdrops/`) | CheatCode Media Group (commissioned via image generation, 2026-10-25) | No |
| Newspaper photos (press scrum, lobby, reshuffle door, podium, hustings, Commons exterior) | `apps/web/src/assets/art/news/*.webp` (masters `apps/web/art-src/news/`) | CheatCode Media Group (image generation, 2026-10-25). No real people depicted; faces are generic or blurred | No |
| Newspaper mastheads (The Morning Whip, The Daily Clarion, The Westminster Gazette) | `apps/web/src/assets/art/mastheads/*.webp` (masters `apps/web/art-src/mastheads/`) | CheatCode Media Group (image generation, 2026-10-25). The Gazette's generated crowned-portcullis crest is removed in the build (too close to Parliament's emblem) | No |
| Newspaper filler spot art (10) | `apps/web/src/assets/art/spots/*.webp` (masters `apps/web/art-src/spots/`) | CheatCode Media Group (image generation, 2026-10-25) | No |
| Rubber stamps (11) | `apps/web/src/assets/art/stamps/*.webp` (cut from `apps/web/art-src/stamps/sheet.png` and `round.png`) | CheatCode Media Group (image generation, 2026-10-25). The first sheet's round stamps (portcullis crest) are deliberately not used | No |
| Paper and leather textures (5) | `apps/web/src/assets/art/textures/*.webp` (cut from `apps/web/art-src/textures/atlas.png`, mirrored 2×2) | CheatCode Media Group (image generation, 2026-10-25) | No |
| Menu background painting | `apps/web/src/assets/menu-bg.jpg` (master `docs/brand/menu-background.png`) | CheatCode Media Group | No |
| Fonts: Archivo, Inter | `@fontsource-variable/*` | SIL Open Font License 1.1 | No (licence travels with the font files) |

Studio and game marks (`docs/brand/`) are owned by CheatCode Media Group Ltd.

Desktop: the app icon (`apps/desktop/src-tauri/icons/*`, source `icons/source/app-icon.png`) and
the NSIS installer sidebar/header (`icons/installer/*.bmp`) are CheatCode Media Group artwork
(image generation, 2026-10-25), built from `apps/web/art-src/desktop/` by `pnpm images:build`.
