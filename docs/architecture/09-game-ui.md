# 09: In-game UI language

The front end (title, main menu, boot) set the look: a painting of Westminster at dusk, flat ink
panels with a leaning edge and a red stripe, big condensed uppercase Archivo, the red slash, keycap
prompts. This document is the same language for the game itself: the HUD, the place screens, the
documents on the desk, modals and the end-week flow. Phase-2 screens (CHAMBER, TEA ROOM, PARTY HQ,
ARCHIVE) should be built from these parts. Copy follows [10-voice-and-copy.md](10-voice-and-copy.md).

**The idea in one line:** an MP's desk at night. Dark, flat surfaces (the HUD and the desk); paper
objects lying on them (diary pages, letters, newspapers); red for the things that move the game on.

## 1. Hard rules

- **Flat colour only.** No gradients (that includes `repeating-linear-gradient` for ruled lines;
  draw rules as elements), no glow, no blur, no `box-shadow`, no drop-shadow cards.
- **Hard edges.** Radius 0. Angles come from the slash: a lean of about 13°, done with
  `clip-path`, never `skew` on text.
- **No SaaS kit.** No rounded white cards with coloured left borders, no dashboard grid of
  identical panels, no pill badges. Hierarchy comes from type size, surface (ink vs paper) and
  rules, not from boxes.
- **The painting is used sparingly**: as a screen's header band under a flat ink veil
  (`bg-ink/86`, one solid layer). Never as a full-screen background in game.
- Texture comes from typography, rules, slashes, stamps and keycaps.

## 2. Tokens (`packages/ui/src/styles/tokens.css`)

| Token | Hex | Use |
|---|---|---|
| `ink` | `#0f1d1c` | HUD, modals, dark sheets (character sheet, division tally) |
| `desk` | `#172725` | The surface screens sit on (one step off ink) |
| `paper-bright` | `#faf8f5` | Diary pages, letters, active tab, primary text on ink |
| `paper` / `paper-deep` | `#f3eee3` / `#e7e0d0` | Newspapers, notes, legacy screen surface |
| `whip` / `whip-dark` | `#dd2928` / `#a91c16` | END WEEK, the slash, seals, confirms, stamps (bad) |
| `ember` `lamp` `dusk` `slate` | painting palette | Portrait skies; `lamp` for capital and highlights on ink |
| `good-strong`, `warning-strong` | | Stamp inks on paper |
| `aye` / `no` / `abstain` | | Division bars and markers; **never as text on ink** (contrast) |

Contrast: body text on ink is `paper` at 75%+; small red text is only allowed on paper. On ink,
use `lamp` for highlighted small text (≈6:1).

## 3. Type

Archivo (variable, width axis 62–125%) for display; Inter for body.

| Role | Class recipe |
|---|---|
| Screen title (`DisplayTitle size="xl"`) | Archivo 900, uppercase, `font-stretch:68%`, clamp(2.75rem, 5.5vw, 5rem), leading 0.86 |
| Section title (`DeskHeading`, `DisplayTitle size="md"`) | same, 1.6rem, with the slash |
| Card / plate title | Archivo 900 uppercase 70–72%, 1.1–1.45rem |
| Kicker (`Kicker`) | Inter 700, 11px, uppercase, tracking 0.08em, tabular |
| Body | Inter 13–15px; letters and dispatches 14px/1.6 |
| Numbers (`ResourceCounter`, tallies) | Archivo 900 condensed, `tabular-nums` |
| Masthead | Archivo at its widest (`font-stretch:125%`) or per paper (see §8) |

Tailwind-merge gotcha: a font-size class placed **after** a `leading-*` class drops the leading.
Put size before leading when composing class strings.

## 4. Primitives

`@whip/ui` (presentational, DTO-free):

- `Slash`: the red stroke. Cursor, title mark, seal, selection mark.
- `Plate`: flat block with a leaning right edge (or both edges), optional red stripe.
- `DisplayTitle`, `Kicker`: the type roles above.
- `PaperSheet`: a document on the desk. `tilt="left|right"` rotates 0.6° on md+; use on at most
  one or two sheets per screen (we tilt dispatches only).
- `Stamp`: rubber-stamped verdict (SUCCESS / PARTIAL / FAILED / PASSED / DEFEATED), rotated,
  tones good / warning / bad / ink / paper. Pair with `animate-stamp` and a staggered delay.
- `ResourceCounter` + `CapitalIcon`: big number, unit, weekly change.
- `CostChip`: diary-slot pips or ◆ capital; `short` turns it red when unaffordable.
- `PipMeter`: a stat as flat segments; signed scales fill out from the centre (red for negative).
- `Portrait`: procedural bust (§7). `Keycap`, `ReturnKeyIcon` from the front end.

`apps/web/src/game-ui/` (app-specific):

- `GameScreenHeader`: place header band (painting crop under ink veil, slash title, red rule).
  Pass `crop` (object-position) so each place shows a different part of the painting.
- `DeskHeading`: slash section heading on the desk, with meta line and actions.
- `DispatchFrame`: the in-game modal (Radix Dialog): ink sheet, red top rule, slash title, `Esc`
  keycap close, footer bar. Sizes `md`, `lg`, `full` (takeover with custom header).
- `HudBar`, `HudCalendar`, `HudResources`, `HudPlayer`, `PlaceTabs` (`strip` desktop / `bar` mobile).
- `EndWeekButton`, `EndWeekConfirm`, `WeekTransition`, `useEndWeek`.
- `PauseMenu`: reuses the main menu's `MenuList`, `QuitConfirm` and `SettingsScreen`.
- `DivisionTally`, `CountUp`: results reveal.
- `features/newspaper/`: `NewspaperPage`, `PaperMasthead`, `ArticleView`, `paperKind`.

## 5. The shell and HUD (`routes/campaign-layout.tsx`)

```
┌ W │ WEEK/03 │ MONDAY 17 SEP 2029 │ ◆ 3 CAPITAL +1/WK │ 14 INFLUENCE │ … portrait NAME │ 🔊 │ ☰ MENU Esc ┐
├ [1] OFFICE  [2] CHAMBER  [3] TEA ROOM  [4] PARTY HQ  [5] ARCHIVE ─────────── (paper rule) ┤
│                                  screen (scrolls)                                            │
├ NEXT  Wed 26 Sep  Housing Delivery Bill …        [1]–[5] Places [M] Sound [Esc] Menu ┌END WEEK┐┤
└──────────────────────────────────────────────────────────────────────────────────── └ 4 slots free ┘
```

- The shell is `h-dvh`; only `main` scrolls. HUD and footer never move.
- **Keys** (one capture-phase handler; steps aside when a modal or text field has focus):
  `1`–`5` places, `E` end week (press again to confirm), `Esc` pause / cancel confirm, `M` sound,
  `P` plan an action (Office). Every hotkey is shown as a keycap somewhere on screen.
- Routes that draw their own game screen set `handle: { gameScreen: true }` in `router.tsx`.
  Routes without it are wrapped in a generic frame: `GameScreenHeader` with the place name and a
  `paper-deep` surface (that is how CHAMBER / TEA ROOM / PARTY HQ / ARCHIVE look until phase 2).
  **Phase 2:** build the screen on the desk, add the handle, and drop the old page-level `h1`.
- Mobile (< md): HUD condenses (no influence, no name), tabs move to a bottom bar, END WEEK becomes
  a full-width red bar above it. The confirm pops above it.
- The game root is `inert` while paused or transitioning.

## 6. Screens and documents

- **Desk layout:** `px-4 md:px-8`, sections separated by `gap-9`; a main column and, from `xl`, a
  24–27rem side column. Narrow screens reorder to reading order with CSS `order`, never by
  rendering a component twice.
- **Diary pages** (Office): paper-bright pages Mon–Fri, weekday + big grey date numeral, fixtures
  printed in red, planned actions as ink cards "dealt" into the page (`animate-deal`), empty pages
  as ruled lines + "/ PLAN".
- **Dispatches** (pending events): letters with an ink head strip, red seal, title, body and one
  outlined button per response with its cost. Disabled options say why.
- **Character sheet:** ink, party colour top rule, portrait, three big readouts, `PipMeter`s.
- **Notes** (whispers): paper-deep slips with a red pin. **Inbox:** rows on the desk with a square
  severity mark (plus sr-only severity text).
- **Pickers** (`DispatchFrame size="lg"`): action cards on paper-bright; locked ones on
  `moss-900` with a lock icon and the reason in `lamp`. MPs as a portrait grid with search.

## 7. Portraits

`<Portrait seed={politicianId} partyColour size="xs|sm|md|lg|xl" />` (24/32/48/72/120 px). A
deterministic flat bust from an FNV-1a hash of the id: sky from the painting palette, six skin
tones lit as two flat halves (light from left or right), eight hair silhouettes, brows (the only
facial mark), suit, shirt with tie / open collar / scoop neck, optional glasses, and a party
colour band along the bottom. Faceless on purpose: it reads at 24 px, never goes uncanny, and suits
the silhouetted figure in the painting. Decorative by default; pass `name` when no name is printed
beside it. (The DTOs have no gender or age on summaries, so the seed alone decides hair and dress.)

## 8. The newspaper

`NewspaperPage` renders the `Newspaper` DTO (`TurnReport.newspaper`, `briefing.newspaper`):
masthead, lead story, Politics in two ruled columns, a narrow column (And Finally, Letters,
Weather) with an optional **insert** at the top, and back pages (Around the Constituencies,
Sport, Classifieds, Corrections) under a heavy rule. On phones the insert comes straight after
the lead (CSS `order`), so the mechanics are never below the fold of gossip. Without a `newspaper`, `paperFromHeadlines`
builds one from the plain headlines. Each title has its own style (`paperKind`):

| Paper | Kind | Look |
|---|---|---|
| The Morning Whip | broadsheet | mixed-case title at normal width, ears with slogan and price, mixed-case headlines, `paper` |
| The Daily Clarion | tabloid | red masthead block with a leaning edge, price box, reversed lead, capitals at 62–66%, black section bars, `paper-bright` |
| The Westminster Gazette | record | widest spaced capitals between heavy/thin rules, centred section labels with rules, `paper-deep` |

Mechanics are never left to the prose: the turn report puts **Your week** (stamped outcomes,
capital change) as the insert, and the division tally as its own ink sheet after the paper.

## 9. Motion

Motion answers the player. Nothing loops in game.

| Moment | Motion |
|---|---|
| Card placed in diary | `animate-deal` (fade + 10px drop, 220ms) |
| Modal open | `animate-in-rise`; pause panel `animate-in-right` |
| END WEEK | `WeekTransition`: slash wipe (520ms), days dealt Mon–Fri, held ≥1.3s |
| Turn report | stamps slam in sequence (`animate-stamp`), division counts up (`CountUp`) then the verdict stamp |

Reduced motion (setting or OS): the global rules cut animations to ~0; `CountUp` shows the final
number; the transition does not hold. Check `useReducedMotion()` for any JS-driven motion.

## 10. Sound

Use `use-ui-sound`. The shell root has `useClickSounds` (any button, link, tab or menu item ticks).

- **click:** tab switches (also via number keys), confirms, cancel, opening the planner via `P`.
- **whoosh:** only two moments in the whole game: entering a career, and END WEEK starting the
  transition. Buttons that whoosh carry `data-sfx="off"` so they don't also click.

## 11. Accessibility

- Visible focus on everything: `outline-whip` (on paper) or `outline-paper-bright` (on red).
  Clip-pathed elements clip outlines; draw an inner ring (`-outline-offset-*`) or a bar instead.
- Modals trap focus (Radix) and restore it; the END WEEK confirm focuses **Keep planning**; the
  turn report focuses **Continue**.
- Animated numbers are `aria-hidden` while moving, with the final value in `sr-only`.
- Titles that sit visually under a kicker come first in the DOM (`flex-col-reverse`) so controls
  are named by their title.

## 12. Do / don't

| Do | Don't |
|---|---|
| Put documents (paper) on the desk (dark) | Make every region a white card |
| Use one red action per screen region | Use red for decoration |
| Use the slash for marks and selection | Add icons to every heading |
| Use rules and type size for hierarchy | Use shadows, gradients or rounded corners |
| Keep mechanics in plain numbers and stamps | Let flavour copy hide a cost or an outcome |

Mock mode prints the engine-generated editions in `mocks/newspaper-fixture.ts` (opening edition
first, then the division edition in a division week and the quiet one otherwise), re-dated to the
mock calendar. When the narrow column outruns the news, back-page sections move up under the
Politics column, then a house advert fills any gap that is left: never a blank sheet.
The office briefing uses `compact` (four politics stories, no back pages).
