# WHIP image-generation prompts

Prompts for GPT image generation for every art need **except character portraits**, which get their
own design pass (see the end). Each prompt is written to be pasted whole. Every prompt starts with the
**style block**, so the whole set matches the main menu painting.

## How to use these

- **Attach the menu painting as a style reference** on every generation:
  `docs/brand/menu-background.png` (or `apps/web/src/assets/menu-bg.jpg`). Say "match the painting
  style of the attached image" alongside the style block. This does more for consistency than any
  wording.
- **Sizes:** use 1536×1024 for landscape (backdrops, lead-story art), 1024×1536 for tall, and
  1024×1024 for square. Generate large and we downscale and compress (WebP/AVIF) in the build. Never
  ship the raw PNG.
- **Transparency:** spot art, stamps and icons ask for a transparent background. If the tool won't do
  that, ask for flat pure white and we key it out.
- **Text:** keep text out of paintings. Where lettering is wanted (mastheads, stamps), generate it,
  then we redraw or vectorise the winner so it stays crisp at every size.
- **Iterate in one conversation per set** (all backdrops in one thread, all spot art in another), so
  the look carries across.
- Save picks as `docs/art/source/<set>/<name>.png` and I'll wire them in.

## Style block (prefix for every prompt)

> Painterly digital illustration in the style of the attached reference: bold, visible palette-knife
> and gouache brushstrokes, chunky expressive texture, cinematic graphic-novel composition, strong
> silhouettes and high-contrast chiaroscuro. Restricted palette: deep inky teal-green and near-black
> shadows (#0f1d1c), a hot vermilion red (#dd2928) used as the accent, warm amber/sodium lamplight
> highlights, and touches of muted cream. Moody British dusk or lamplit-interior atmosphere, slightly
> rain-damp. Painterly, not photographic; simplified forms, no fine photoreal detail. No text, no
> logos, no real people, no real political party branding.

**Avoid in everything:** recognisable real politicians or journalists, real party logos or rosette
colours used as branding, real newspaper mastheads, gradients that look like UI, lens flare,
glossy 3D render, anime style, watermarks, and gibberish text.

---

## 1. Location backdrops (one per tab)

These sit **faded behind the UI panels**. Compose them with:
- the interest at the **edges and upper third**;
- a calm, lower-detail **centre and lower band** (panels cover these);
- dark overall values, so cream and white UI reads on top.

Size 1536×1024, landscape. Name `bg-<tab>.png`.

### 1a. Office: `bg-office.png`
> [Style block] A cramped backbench MP's office in Portcullis House, Westminster, at night. A
> low-ceilinged room with a narrow window looking onto wet rooftops and a distant lit Gothic spire.
> A desk buried in red ministerial-style folders, constituency letters, a half-drunk mug of tea, a
> desk lamp throwing a warm amber pool, and a corkboard of pinned papers. A coat over the chair and a
> rain-streaked window with a vermilion sky glow beyond. The composition frames the desk lamp on the
> left and the window on the right. The centre of the image is a soft, dim wall with little detail.
> Quiet, overworked, slightly melancholy.

### 1b. Chamber: `bg-chamber.png`
> [Style block] The House of Commons chamber seen from the end, with no people, just after dusk. Rows
> of deep green leather benches facing each other across the floor, the carpet's red lines, the
> Speaker's canopied chair glowing in the distance, dark carved oak panelling, and the dispatch boxes
> on the central table. Warm amber light falls from above into deep teal shadows. The benches recede
> toward the vanishing point. The lower half is dim and simple. Grand, tense, and slightly
> theatrical, like a stage before the curtain.

### 1c. Chamber, division lobby: `bg-division-lobby.png`
> [Style block] A House of Commons division lobby during a vote: a long wood-panelled corridor
> lined with tall Gothic windows, desks where the clerks tick names, and a crowd of MPs in dark suits
> filing through as blurred, faceless painterly silhouettes. Vermilion light spills through the
> windows. There is a sense of hurry and pressure, with a single tall door at the end glowing amber.
> No faces are readable.

### 1d. Tea Room: `bg-tea-room.png`
> [Style block] The Members' Tea Room at the Palace of Westminster: a long, wood-panelled room with
> a tall Gothic window, worn leather armchairs, small tables with china cups and saucers, a teapot,
> a plate of biscuits, and newspapers folded on a chair. In the background, two or three faceless
> silhouettes lean together in conspiratorial conversation. A warm amber lamp glow sits against
> teal shadow. Cosy, but a place where careers are quietly ended. The centre is a calm, softly lit
> middle distance.

### 1e. Party HQ: `bg-party-hq.png`
> [Style block] A fictional political party's campaign headquarters at night: an open-plan room
> with desks of ringing old-fashioned telephones, stacks of leaflets, a whiteboard covered in
> scrawled constituency targets, campaign posters with bold red and cream blocks of colour but **no
> legible words or real logos**, takeaway boxes, and a wall map of Britain dotted with pins. Harsh
> overhead strip light mixes with a red glow from a window. Frantic, exhausted energy, captured
> mid-crisis. Keep the centre uncluttered.

### 1f. Archive: `bg-archive.png`
> [Style block] A dusty parliamentary records room in a basement: towering wooden shelves of bound
> ledgers and red-ribboned files, rolling library ladders, archive boxes, a single green-shaded desk
> lamp on a reading table, and dust motes caught in an amber light shaft from a high narrow window.
> Deep teal darkness recedes between the stacks. Quiet and secretive; everything you've done is
> written down here. The centre is a soft, dark aisle.

---

## 2. Newspaper art

### 2a. Mastheads (lettering)
Generate each at 1536×512 on a transparent background. Pick a winner, then **redraw it as vector**.
The newspapers are fictional; don't imitate a real masthead.

**The Morning Whip** (broadsheet, establishment): `masthead-morning-whip.png`
> Newspaper masthead lettering reading exactly "The Morning Whip". Classic British broadsheet
> blackletter (Old English) title type, crisp black ink on transparent background, with a small
> engraved emblem between "Morning" and "Whip" of a crossed whip and quill inside a laurel. Elegant,
> traditional and slightly pompous. Flat ink, no colour, no shading, no gradients.

**The Daily Clarion** (red-top tabloid): `masthead-daily-clarion.png`
> Tabloid newspaper masthead reading exactly "The Daily Clarion". Heavy condensed sans-serif capitals
> reversed out in white on a solid vermilion red (#dd2928) rectangle with slightly rough printed
> edges, and a small trumpet/clarion icon at the left. Loud, cheap, brash, British red-top energy.
> Flat colour, print texture, no gradients.

**The Westminster Gazette** (paper of record): `masthead-westminster-gazette.png`
> Newspaper masthead reading exactly "The Westminster Gazette". Refined high-contrast serif capitals
> with generous letterspacing in deep teal-black ink (#0f1d1c), a thin double rule above and below,
> and a tiny engraved portcullis-style gate emblem (fictional, not the real parliamentary
> portcullis) centred above. Sober, dignified and dull on purpose. Flat ink, transparent background.

### 2b. Lead-story illustrations ("photo" slot)
These are 1536×1024. They should feel like a **painted press photo**: the same style block, but with
a press-photography composition, slightly desaturated, with a hint of halftone grain.

- `news-commons-exterior.png`
  > [Style block] Rendered like a painted press photograph with faint halftone grain. The Palace of
  > Westminster and the clock tower seen from across the Thames on a grey drizzly morning, red buses
  > blurred on the bridge, and a few umbrellas on the embankment. Muted and newsy, with the vermilion
  > of the buses as the only strong colour.
- `news-press-scrum.png`
  > [Style block] Rendered like a painted press photograph. A chaotic press scrum outside a black
  > Georgian front door at night, with microphones, boom poles, camera flashes as harsh white bursts
  > and a dozen faceless reporters jostling. A single faceless figure in a dark suit is hurrying
  > through with a red folder held up. Every face is unreadable painterly blur.
- `news-wet-hustings.png`
  > [Style block] Rendered like a painted press photograph. A rain-soaked hustings in a draughty
  > English village hall: rows of plastic chairs, about nine damp attendees, a trestle table with a
  > jug of water, a sagging bunting line, and a candidate as a faceless figure standing at a lectern
  > under a flickering strip light. Comic bleakness.
- `news-podium.png`
  > [Style block] Rendered like a painted press photograph. An empty lectern on a stage in a
  > conference hall, lit by a hard spotlight, with a backdrop of blank red and cream panels (no
  > words, no logos). A single glass of water sits on the lectern, and rows of empty seats fade into
  > darkness. Anticipation, or an aftermath.
- `news-reshuffle-door.png`
  > [Style block] Rendered like a painted press photograph. A long Whitehall corridor at night, with
  > a line of faceless figures in suits waiting outside a single closed panelled door that has a
  > strip of amber light beneath it. Nervous and comic.
- `news-the-lobby.png`
  > [Style block] Rendered like a painted press photograph. Two faceless MPs whispering behind a
  > stone Gothic pillar in a Westminster corridor while a third, out of focus, pretends not to
  > listen. Conspiratorial.

### 2c. Filler spot art ("And Finally", "Around the Constituencies")
These are 1024×1024 on a transparent background. Each is a **single object or creature, isolated**.
Use the same painterly style, but lighter and more affectionate: a sunlit cream key light instead of
dusk. They print small, so keep the silhouette clear.

Shared add-on for this set:
> Single subject isolated on a transparent background, a clear readable silhouette, the warm comic
> dignity of a British local-paper photo, painted in the reference style but in daylight.

- `spot-marrow.png`
  > A prize-winning giant marrow on a village show trestle table, wearing an oversized red first-prize
  > rosette (a plain rosette, with no text or party colours), treated as solemnly as a state portrait.
- `spot-llama.png`
  > An escaped llama standing defiantly on a suburban British pavement next to a wheelie bin, looking
  > unimpressed.
- `spot-pothole.png`
  > An enormous rain-filled pothole in a British B-road with a single traffic cone, a tiny hand-made
  > commemorative plaque on a stick, and a rubber duck floating in it.
- `spot-cat-ministerial-car.png`
  > A smug ginger tabby cat sitting on the back seat of a sleek black ministerial car, looking out of
  > the window as if it owns the place.
- `spot-parish-council.png`
  > A wooden parish-council trestle table with an overturned teacup, scattered agenda papers and a
  > gavel, after an argument, with nobody there.
- `spot-scarecrow.png`
  > A village scarecrow dressed in a tatty suit and tie with a red folder under one arm, standing in
  > a field like a candidate.
- `spot-bus-shelter.png`
  > A lonely, much-graffitied rural bus shelter (the graffiti is illegible squiggles) at dusk, with a
  > single bench and an absurdly ornate brass dedication plaque.
- `spot-swan.png`
  > An indignant mute swan blocking a towpath, wings half raised, while a bicycle lies abandoned
  > nearby.
- `spot-tortoise.png`
  > An elderly tortoise wearing a tiny knitted jumper, crossing a village green very slowly.
- `spot-weather.png` (weather box)
  > A single grey British raincloud with rain falling on a lone, slightly bent umbrella. Compact, in
  > a weather-icon composition.

---

## 3. Stamps and paper

### 3a. Rubber-stamp marks
These are 1024×512 on a transparent background. Pair them with the new stamp sounds. For each:

> A single scanned rubber-stamp impression reading exactly "[WORD]", in bold condensed slab-serif
> capitals inside a rectangular double-line border, slightly rotated about 4 degrees. Realistic inked
> rubber-stamp texture: uneven ink density, speckled gaps, slightly heavier ink at one edge, a faint
> smudge. [COLOUR] ink. Transparent background, flat with no shadow, as if scanned off paper.

| File | WORD | COLOUR |
|---|---|---|
| `stamp-success.png` | SUCCESS | deep teal-green #1f4d47 |
| `stamp-partial.png` | PARTIAL | dark amber-brown #8a5a12 |
| `stamp-backfired.png` | BACKFIRED | vermilion red #dd2928 |
| `stamp-failed.png` | FAILED | vermilion red #dd2928 |
| `stamp-noted.png` | NOTED | faded blue-black #22303a |
| `stamp-division.png` | DIVISION | near-black #0f1d1c |
| `stamp-carried.png` | CARRIED | deep teal-green #1f4d47 |
| `stamp-defeated.png` | DEFEATED | vermilion red #dd2928 |
| `stamp-confidential.png` | CONFIDENTIAL | vermilion red #dd2928 |

Variant: also ask for a **circular** version of NOTED and DIVISION ("inside a circular border with a
small portcullis-style gate in the centre, fictional, not the real parliamentary emblem").

### 3b. Paper and card textures
These are 1024×1024 and **seamlessly tileable**. They must be flat-lit and low in contrast, so text
on top stays readable.

- `tex-newsprint.png`
  > Seamless tileable texture of cheap off-white newsprint paper, with subtle fibres, faint grey
  > mottling and very slight yellowing. Flat even lighting, very low contrast, no folds, no text.
- `tex-dispatch-card.png`
  > Seamless tileable texture of heavy cream government card stock with a fine laid-paper line
  > pattern and soft fibre flecks. Flat even lighting, very low contrast, no text.
- `tex-diary-page.png`
  > Seamless tileable texture of a slightly worn cream diary page with faint pale blue ruled lines
  > and a soft vintage tone. Flat lighting, low contrast, no text.
- `tex-red-folder.png`
  > Seamless tileable texture of a worn red leather ministerial dispatch folder (vermilion #dd2928
  > toward oxblood), with fine grain and gentle scuffing. Flat lighting, no emblem, no text.
- `tex-green-leather.png`
  > Seamless tileable texture of the deep green buttoned leather of Commons benches, a close-up of
  > the grain only, with no buttons. Flat lighting, low contrast.

Also make one **non-tiling** extra:
- `paper-edge-torn.png`
  > A strip of torn cream paper edge on a transparent background, 1536×256, for the top of
  > dispatches.

---

## 4. Icons

These are **engraved or hand-inked**, not stock UI. Generate each at 1024×1024 on a transparent
background as a single-colour line engraving, then vectorise and recolour them in code. Generating
the whole set in one conversation keeps the line weight consistent.

Prompt template:
> A single icon of [SUBJECT], drawn as a Victorian banknote-style engraving: fine cross-hatched ink
> lines, a bold clean outer silhouette, solid black ink only, on a transparent background, centred
> with generous padding, readable at 24 pixels. No text, no colour, no frame.

**Actions**
| File | SUBJECT |
|---|---|
| `icon-meet.png` | two teacups facing each other on saucers |
| `icon-build-relationship.png` | two hands in a firm handshake |
| `icon-promise.png` | a fountain pen signing above a dotted line |
| `icon-rebel.png` | a snapped riding whip |
| `icon-support-bill.png` | a rolled parliamentary bill tied with ribbon beside a tick |
| `icon-oppose-bill.png` | a rolled parliamentary bill tied with ribbon beside a cross |
| `icon-endorsement.png` | a rosette ribbon with a blank centre |
| `icon-promotion.png` | a ladder leaning against a column |
| `icon-respond.png` | an envelope with a wax seal, opened |
| `icon-abstain.png` | an empty chair |

**Resources**
| File | SUBJECT |
|---|---|
| `icon-political-capital.png` | a stack of old coins stamped with a portcullis-like gate (fictional) |
| `icon-influence.png` | a hand holding marionette strings |
| `icon-week.png` | a desk calendar page |
| `icon-diary-slot.png` | an open diary with a ribbon bookmark |

**Faction badges** (for the in-game factions: Modernisers, Heartlands, Shire & Suburbs)
> A circular enamel-style lapel badge engraving of [SUBJECT], a solid black ink engraving on a
> transparent background, bold and readable at 32 pixels, with no text.

| File | SUBJECT |
|---|---|
| `badge-modernisers.png` | a stylised sunrise over a city skyline of glass towers |
| `badge-heartlands.png` | a pithead winding wheel above rolling terraced rooftops |
| `badge-shire-suburbs.png` | an oak tree above a neat semi-detached house |

---

## 5. Desktop and store assets

**App icon:** build this from the existing WHIP mark in `docs/brand/` rather than generating it,
so it stays on-brand. I can produce the `.ico` (16–256 px), `.icns` and PNG sizes from the SVG. If
you want a painted variant for store listings:
- `app-icon-painted.png` (1024×1024)
  > [Style block] An app icon: a single coiled red leather riding whip on a deep teal-black
  > background, lit by warm amber rim light, bold and simple. Reads clearly at 32 pixels. No text.

**Installer images** (NSIS and WiX/MSI; we crop to exact pixel sizes):
- `installer-sidebar.png`: generate 1024×1536 portrait. It's cropped to NSIS 164×314 and WiX
  493×312 dialog.
  > [Style block] A tall, narrow composition: the clock tower of the Palace of Westminster
  > silhouetted against a vermilion and teal dusk sky, with a lamplit embankment below and a lone
  > figure in a dark coat holding a red folder at the bottom. The lower 40% is dark and simple.
- `installer-banner.png`: generate 1536×1024. It's cropped to NSIS 150×57 and WiX 493×58.
  > [Style block] A very wide, shallow strip of Westminster rooftops and spires at dusk, with
  > vermilion clouds. The right-hand side holds the detail, and the left is calm dark sky for text.

**Steam capsules** (later, if Steam happens). Generate the key art once, then crop it:
- `key-art.png` (1536×1024)
  > [Style block] Key art: a lone figure in a dark overcoat, seen from behind and holding a red
  > ministerial folder, stands at the end of the Commons chamber's green benches, which are packed
  > with faceless painterly silhouettes of MPs all turning to look at him. Amber light comes from
  > above and vermilion from the windows. Leave clear dark space in the upper third for the logo.

---

## 6. Character portraits: separate design pass

Not prompted here on purpose. Portraits need a system before any prompts, so that hundreds of MPs
look like one cast. Decisions to make together:

1. **Approach:** hand-picked painted portraits for the named cast, plus either (a) a large
   pre-generated library of generic MPs, or (b) layered parts (heads, hair, glasses, ties, collars)
   assembled in code. (b) scales to hundreds and matches the procedural portraits we have now, but
   is much harder to get from an image model consistently.
2. **Framing and format:** bust or head-and-shoulders; a background plate, either flat colour per
   faction or a painted Westminster backdrop; aspect ratio; the sizes used in the dossier, meeting
   and HUD.
3. **Diversity and fiction rules:** a varied, believable Commons. No resemblance to real MPs, which
   means checking for accidental lookalikes of well-known figures.
4. **Expressions:** neutral, pleased and furious. Image models drift between expressions, so we
   probably need a reference-sheet workflow (one character, three expressions, one image).
5. **Cast list:** Ken Bramley, Daniel Osei, the Chief Whip, the party leader and the rivals, with a
   short visual brief per character drawn from their traits in `packages/content`.

I'll draft this as a portrait spec when you're ready.
