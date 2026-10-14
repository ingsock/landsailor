# Landsailor — a music video

A code-rendered, word-synced typographic music video for **"Landsailor"** (words and music by
Vienna Teng; the recording is `../LandSailor.webm`, as supplied). 3:45, 1920×1080, 60 fps.
Every frame is a function of the song's time; every chart is real data.

## The film in one sentence

She calls the world's infrastructure by its kennings, and each one answers by lighting up the
night as the chart of what it gave us; when the storm takes the power, a flash shows the lines
that were hidden behind it all, and at dawn the gift and the price are seen together, in ink.

### Candidates weighed (the first is the one everyone has)

1. A tour of human progress in charts, each chart set to the line that loves the thing behind it.
2. **Taken:** night lit only by the infrastructure: every chart drawn in the light of the thing it
   measures (headlights for trade, runway lights for flights, windows for electrification, a
   heart monitor for lifespan); the storm takes the power, lightning shows the hidden lines,
   dawn turns light into ink.
3. Every chart is a city seen from the side: bars are towers, lines are roads, points are lights;
   at the split the city is cut open and the chart of its cost is underneath.
4. One second of song is one year of history, 1800 to 2025 (the song is 225 seconds long); the
   home city grows with the film. Left: the song's lines are not in history's order.

### The one formal idea, and the turn

**At night we only see what the infrastructure lights.** Every word is a lamp that lights when
it is sung, in the light of its scene (a sodium lamp warms from red, a filament flares, an LED
snaps on, a fluorescent tube flickers, a runway strobe flashes, a heart monitor glows green).
Every chart is drawn with the same lights. **The turn** is the instrumental hit at 2:10: after
the blackout, lightning shows every street, rail line and the lake shore of Chicago at once, the
lines nobody notices, and they stay. **The state change** is the sunrise at "Shield my eyes no
more": the film turns from light on dark to ink on paper. The last picture is the first one,
changed: Chicago's street grid as the chart it already is (its address grid's zero is State &
Madison), now in daylight with every line drawn.

### What was taken from the reference ([mexicat/pdoom-video](https://github.com/mexicat/pdoom-video)) and what was left

- **Taken (standard, not script):** per-word karaoke sync that never runs ahead of the voice;
  lyrics integrated into each picture's objects instead of subtitles; a three-voice type system;
  hairline precision and small annotations beside big display type; strong eases, holds and
  snaps; cuts on the music; a deterministic time → frame engine with a live preview and an
  offline export with motion blur from averaged sub-frames.
- **Left:** its spark/fuse, mask, eyes, P(doom) readout, prompts, hook slams, plates conceit,
  engraving shaders, fonts (Archivo, Plex Mono, Cormorant), palette and crop marks. No code or
  asset of the reference is used.

## Type and colour

| voice | face | where |
| --- | --- | --- |
| her voice, the sung lines | **Mona Sans** (GitHub; variable width 75–125, weight 200–900, "inspired by industrial-era grotesques") | widths and weights move with the words |
| the infrastructure's voice | **Overpass** and **Overpass Mono** (descended from Highway Gothic, the US road-sign face) | charts, signs, the outro's echoes |
| the vow | **Instrument Serif Italic** | *born*, *king*, *bride in full*, *for good* |
| the price | **Climate Crisis** (Helsingin Sanomat; its weight axis is a year of Arctic sea ice, 1979–2050) | STORM, THE PRICE: the letters thin as the temperature line rises |

Colours are lights: sodium amber, metal-halide white, filament warm white, tail-light red,
taxiway blue, monitor green, on a night of blue-black. After the sunrise: ink on paper.

## Media: what each part is seen through

The light is always the subject. What it is seen through changes with what the light belongs to,
and each medium keeps something alive behind the chart (haze, stars, motes, warm air, paper):

| part | seen as | why |
| --- | --- | --- |
| the city, the road, the sky, the storm, the dark, the dawn | night as a long exposure sees it: bloom, haze, motes, stars | the infrastructure, lit |
| Bend, Part (Chicago's year of temperature) | a thermal camera: iron palette, sensor noise, warm air rising | the heat is the chart |
| Flow (energy), Headless, Behind (the data hall, the wall) | a blueprint: cyanotype blue, the drawing grid | the grid and the walls as drawn before they were built |
| Turn, Shop, Rise, Plough, Grow, Overflow (food, people, land) | a risograph print: two inks, halftone, out of register, on cream | the plenty as a poster, printed and handed round |
| Decode, Beat | CRT screens: an amber terminal, a green monitor | the screens we read, and the one that reads us |
| after the sunrise | ink on paper | the state change, kept for the end |

Each shot is graded in its own medium (`app/src/engine/post.ts`, `GRADE_FS`), and only then joined
to the next.

## Joins

No shot ends in a hard cut, and no camera comes to rest before its shot is over: every shot is
drawn past both of its ends while its neighbour comes in, the camera still moving (the `glide`
and `easeOn` curves in `app/src/engine/math.ts` keep a share of their speed at both ends and carry
on beyond them). The joins (`joins` in `app/src/edit.ts`, drawn by `COMP_FS` in post.ts):

- **dissolve** between views of one place; **zoom** through a point (into the far end of the trade
  chart, into the board's destination, into the lit Earth, into the transistors' seam), with a burst of
  light where the two pictures meet; **push**, a whip pan carried along the motion (the climb, the
  wire running off right, a page scrolling);
- a **line of light** that wipes (a drafting line drawing the blueprint in; the dawn rising);
- **ink** soaking through, for every change of medium (into the thermal camera, into print);
- **light**: the next picture comes first where the last one is brightest (the countries' lights
  become a tower's windows);
- **split-flap** slats for the departures board; a **CRT** switching on and off; a **melt** into
  THE PRICE; and **white**, twice: the lightning, and the sunrise's flood onto paper.

## Motion: each chart moves the way its subject does

| chart | motion |
| --- | --- |
| trade (merchandise exports / world GDP) | **convoy**: the road is the chart; traffic at one constant speed, in long-exposure trails |
| air passengers | **takeoff**: a roll that accelerates, rotation, climb; a shudder in 2020 |
| routes out of O'Hare | **burst**: launched on the beat, outward |
| departures board | **split-flap**: mechanical, discrete, landing on the sung word |
| electricity access | **switch**: countries snap on in staccato with a tube's flicker |
| hours after dark | **bloom**: petals unfolding with overshoot |
| Chicago's 2023 temperature | **oscillation → damping**: a spring settling to 21 °C |
| primary energy by source | **flow**: particles carried along each layer |
| child mortality | **birth**: a hundred lights pop in; the lost ones go dark, fewer each generation |
| fruit supply | **rotation**: a year's wheel turning |
| calories | **glide**: the bars run out to their lengths, then the camera swings down from the plan and glides along the aisles they are |
| extreme poverty | **elevation**: people lifted out of the band on springs |
| cereal yield | **plough, then growth**: furrows cut, stalks sprout and sway |
| population (Malthus) | **overflow**: the line breaks out of the chart's frame |
| urbanization | **construction**: towers floor by floor |
| world cities | **eruption**: towers of population rising in a wave |
| CO₂ and temperature | **turbulence**: gusts, rain, the temperature drawn by lightning |
| the grid's failure | **cascade**: a ragged front running out along the power lines, a spark on each line as it dies |
| energy, run back | **rewind**: a cursor running back along history while the fire rises to the share of its year |
| child mortality, run back | **extinguish**: candles going out one by one, each leaving a thread of smoke |
| median age | **aging**: slow, heavy, settling |
| data hall / internet | **blink**, then **packets** through a fibre in a wall |
| all of the above | **small multiples**, each in its own manner, then fading into streets |
| the ground | **fracture** |
| transistors | **exponential dive** through orders of magnitude |
| literacy | **decode**: scramble resolving into sense |
| life expectancy | **heartbeat**: lub-dub steps on a monitor |
| the city's return | **cascade**: relighting outward |
| cumulative CO₂ | **sedimentation**: decades laid down as strata |
| the city's layers | **explode**: everything apart along one axis |
| temperature and wildlife | **melt** |
| sources | **reveal**: a footnote unrolling |
| the gift and the price | **braid** |
| sunrise | **flood** |
| decoupling (UK GDP up, CO₂ down) | **diverge**: scissors opening |

## Storyboard

| time | part | what happens | how it becomes the next |
| --- | --- | --- | --- |
| 0:00 | **Wake** | Chicago at dusk from straight above, its address grid's axes ticked every mile (800 N, 1600 N…); cut on bar 3 to the city at a slant as the lamps light in rings from State & Madison, a ring a beat; cut on bar 5 to high above, traffic on every expressway | the camera tips down onto the Kennedy |
| 0:12 | **Drive** | the expressway as a long exposure: rivers of white and red light on wet asphalt, sodium lamps, overpasses, the skyline on the horizon; LANDSAILOR painted across the lanes, lit as sung | the camera rises along the road |
| 0:14 | **Climb** | LANDSAILOR / SAIL ON TIME painted further on; the road begins to drift | a message sign comes up over the road |
| 0:17 | **Sign** | the variable-message sign: RAIN OR SHINE → I KNOW YOU CAN, in amber dots, mirrored in the wet road | the camera rises until the road reads as the trade chart, 1827–2014, and dives to its far end |
| 0:22 | **Land** | O'Hare runway 28C on approach; the strobes run in; CLOUDRAKER painted past the threshold | cut on the next "Cloudraker" to the runway's own line |
| 0:24 | **Take off** | air passengers 1970–2023 flown as a climb, with a radar data block: CLOUDRAKER / SHARE YOUR FINDS / passengers | the board |
| 0:27 | **Board** | split-flap departures: ALL / YOUR / WONDERS land in the destination column | "at": the globe |
| 0:29 | **Burst** | every route out of O'Hare arcs away at once over NASA's night lights and the lights of every town of 10,000 or more; AT MY DEMAND | the globe turns into the chorus |
| 0:32 | **Switch** | LIGHTBRINGER in filament outlines; countries, and their towns with them, light in staccato by their share with electricity | to a tower's windows |
| 0:34 | **Spell** | a dark office slab spells TAMER / OF NIGHT in fluorescent windows; pull back past Chicago's skyline drawn as a poster (Willis, Hancock, Aon, Marina City), the moon over it | into the moon: a dial |
| 0:36 | **Bloom** | a day's 24 petals; the hours after dark bloom, lit | the dial unrolls into a year |
| 0:40 | **Bend** | Chicago's 2023 daily temperature, wild; LAWBENDER rides it; ALL EQUALIZED presses it flat to 21 °C | the flat line |
| 0:44 | **Part** | SAFE FROM THE CHILL AND HEAT: chill pushed down, heat up | the energy river |
| 0:48 | **Flow** | primary energy by source flows in; THROUGH ME into a transformer; TRANSFORMED comes out wide and heavy | the high-voltage line runs off… |
| 0:52 | **Dive** | …into Chicago; on HERE'S a ring opens at State & Madison and the camera pulls back to the whole lit Earth, the ring drawn round the planet; HERE'S WHERE I WAS *born* | the Earth's lights become a hundred lights |
| 0:56 | **Births** | of every hundred children born, how many live to five, 1800 → 2024 (57 → 96) | to the year's wheel |
| 1:03 | **Turn** | LANDSAILOR around a wheel of months, its ring as thick as the fruit supply; cut close and down its face from DEEPWINTER (the winter months light) to STRAWBERRY (June); cut wide, the wheel turning, for ENDLESS SUMMER: all amber | a supermarket plan |
| 1:13 | **Shop** | a supermarket printed in two inks: its floor plan is the calorie chart, each gondola as long as a country's daily supply per person; the camera swings down and glides along the stocked aisles; signs on cables carry AISLE / AFTER / AISLE / IN / REACH | to a hundred people |
| 1:18 | **Rise** | Isotype: a hundred pictogram people, 76 in the band of extreme poverty in 1820; each springs out of it as the share falls past it (and back when it rises), 10 left in 2018; COMMONER in mono, *king* in the serif, and a wave of crowns | the downbeat |
| 1:23 | **Plough** | a plough cuts the field; EARTHBREAKER in furrows | the stalks |
| 1:25 | **Grow** | cereal yields, 1961–2024, as rows of stalks | to Malthus |
| 1:27 | **Overflow** | population breaks out of the chart's frame; BEYOND MY MEANS out past it | the skyline |
| 1:30 | **Build** | the urban share as towers by a river, one per decade, a floor per percentage point, cranes riding them; WORLDMAKER built slab by slab; NEVER DENY on the newest roof | the world's cities |
| 1:35 | **Erupt** | every city of 300,000 or more rises on a board of the world, a tower as tall as its population, in a wave from west to east | the storm behind |
| 1:39 | **Storm** | CO₂ as a dark mass, temperature by lightning, STORM melting | the median age |
| 1:44 | **Age** | I'M A CHILD NO MORE: median age 22 → 30; the city's lights fail | blackout |
| 1:50 | **Fail** | the storm takes the power: a fault runs out from a substation along Chicago's real power lines (OSM), sparking along each line it kills, and the lamps go out behind it, street by street | low over the dark city |
| 1:52 | **Fire** | over the dark roofs, the world's energy runs back from 2025 to 1800: the share that is fire (wood, straw, dung) rises from 6% to 98%; candles appear in the windows | the candles become the hundred |
| 1:56 | **Candles** | the hundred children of the births as a hundred candles; the years run back to 1800 and a candle goes out, smoking, for each child who would not live to five (57 of 100 do) | through the window: the sky |
| 2:00 | **Stars** | the clouds part over the Loop, the camera looks up, and the Milky Way is there: the sky of 1800, which our light now hides from a third of humanity | the storm closes again |
| 2:04 | **Storm** | the clouds come back, lower, forked lightning over the lake; every flash shows the city's streets and power lines for an instant, the strike foretold; the rain in gusts; the last bar low over the streets | THE TURN: the hit |
| 2:10 | **Lightning** | THE TURN: lightning strikes the tallest tower and for an instant every hidden line of Chicago is lit at once: streets, rail, power lines, the lake shore; the bolt stays burned in; a ring of current runs out through the streets; downtown stands dark among the lines; the storm passes and the first stars show | the data hall |
| 2:22 | **Headless** | a data hall in cutaway, drawn as a blueprint: the section through the slab and the raised floor, the rows of racks with every server, status lights blinking each at its own rate, light running along the fibre trays, cold-aisle mist, dimension strings and callouts; nobody in it; HEADLESS AND FACELESS is the sheet's title | the wall |
| 2:24 | **Behind** | section B–B through a wall, every layer drawn as architects draw it; internet use 1990–2025 draws itself in the service cavity behind a T-square; on BEHIND, the detail sheet: along the fibre in its conduit, its packets of light, to 74% in 2025 | all the charts |
| 2:31 | **Progress** | every chart of the film as eighteen small multiples, each set in a real Chicago block with the lit streets between them, each redrawing in its own scene's motion | pull back |
| 2:32 | **Unnoticed** | the camera rises past the West Side, up through cloud lit from below, until the charts are a few blocks of the whole lit city; the lines and the words thin to nothing, and the city's lights go quiet | the ground |
| 2:39 | **Split** | the plan cracks along Madison Street and breaks into two slabs that spring apart; their cut faces show the ground in layers (street crust, pipes, fibre, clay, bedrock) glowing white-hot toward a floor of light; rock and street fall in; SPLIT THE / WORLD OPEN carried apart on the slabs | down into the crack |
| 2:41 | **Delve** | the fall, a power of ten a beat, through chip dies of 10³ to 10¹⁰ transistors (seal ring, pads, logic, memory, buses), each finer, past the real chips by their years (2,308 in 1971 … 58.2 billion in 2021), into the silicon crystal itself | the cipher |
| 2:46 | **Decode** | an amber terminal: a reader's page of cipher decodes down to the share of the world that can read (12% in 1820 … 87% now), the chart's labels and a table of the real values decode with it, the line typed at a prompt as sung | the monitor |
| 2:49 | **Beat** | a green heart monitor: life expectancy, 1770 → 2023 (29 → 73 years), steps up a notch on each beat of the song, lub then dub, with the readouts and a sweeping beat strip | the city relights |
| 2:53 | **Relight** | down through a hole in the last of the storm onto State & Madison, where the monitor's last point went out: the lamps come back on, a ring a beat, each with its pool of light; the glow returns to the haze, the cars wake and move off, downtown's windows come on, and the lightning's cold current fades from the rails as the warm light wins; then low and north over the lit city under the cloud | the outro's downbeat |
| 2:59 | **Answer** | the road again, at the first blue of morning: LANDSAILOR painted, and the sign answers I'M YOUR / LANDSAILOR | the bed |
| 3:01 | **Settle** | the world's CO₂, 1750–2024, as a block of rock over a sea of cloud at first light: a bed per decade, each exactly as thick as its decade's emissions, landing hot on the half beats and cooling, to 1,849 billion tonnes | the city's layers |
| 3:04 | **Explode** | MAY EVERY NAIL BE SHOWN: the bed carries 13 × 8 km of Chicago, which lifts into six glass plates, an exploded drawing numbered like a manual (lake and river, streets, lamps, arterials with their traffic, rail, power lines), each with its length as mapped | life |
| 3:07 | **Gather** | GREAT LIFEBRINGER: life expectancy, sixteen countries and the world | the price |
| 3:10 | **Melt** | THE PRICE in Climate Crisis; temperature and wildlife | the sources |
| 3:12 | **Credit** | every source of the film unrolls | the vow |
| 3:15 | **Braid** | the gift and the price twist into one; *bride in full* | the sun |
| 3:20 | **Sunrise** | the sun over Lake Michigan floods the frame; lamps become ink | daylight |
| 3:23 | **Diverge** | UK GDP up, CO₂ down since 1990; *for good* | the first picture |
| 3:28 | **Return** | Chicago's address grid in ink, every line, the camera rising to the end; SHIELD THESE EYES NO MORE; the music fades to paper | — |

## How it is made

```text
LandSailor.webm ──► analysis/separate.py (Demucs) ──► stems ──► analysis/align.py (MMS_FA CTC, one Viterbi pass)
                                                        │          + whisper_words.py (cross-check)
                                                        └─► analysis/analyze_audio.py ──► data/audio.json (118 BPM grid)
                                                             analysis/build_lyrics.py ──► data/lyrics.json (word times)
OWID / NASA / Natural Earth / OSM / OpenFlights / Open-Meteo ──► analysis/prep_*.py ──► data/*.json, data/geo/*
app/ (TypeScript, WebGL2, HarfBuzz) ──► scripts/render.mjs (headless Edge on the GPU) ──► FFmpeg (x264) ──► out/
```

- **One clock:** every time in the film comes from `data/lyrics.json` and `data/audio.json`;
  `app/src/edit.ts` finds lines by their words and bars by number; `frameOf(t) = round(t × 60)`.
- **Engine** (`app/src/engine`): anti-aliased lines with round caps (screen or world widths),
  stencil-then-cover fills for every glyph and shape, instanced lamps, a multisampled HDR canvas,
  bloom with a hue-preserving tone curve, sub-frame motion blur clamped inside each shot.
- **Type** is shaped by HarfBuzz (kerning, variable axes); nothing is laid out by adding widths.

### What this repository leaves out

The recording and the lyrics are Vienna Teng's, so they are not here: no `build/` (the master,
the separated stems, the alignment), no `media/audio/`, and no `data/lyrics.json` (the lyric with
its word times). To run the film, supply the recording at `media/audio/song.webm` and rebuild them
with the scripts in `analysis/` (`separate.py`, `align.py`, `build_lyrics.py`, `master.py`). The
rendered film is not committed either (it is over GitHub's file size limit).

### Running it

```bash
npm install --prefix app
```

```bash
npm run dev --prefix app
```

Then open `http://localhost:5177/?t=32` (space plays with the song; arrows seek; `[` `]` jump shots).

```bash
node app/scripts/render.mjs stills --t 32.7,100.5
```

```bash
node app/scripts/render.mjs video --samples 8 --out ../out/landsailor.mp4
```

## Credits and licences

- **Song:** "Landsailor", Vienna Teng. Not covered by anything here; the recording was supplied.
- **Charts:** [Our World in Data](https://ourworldindata.org) (CC BY 4.0) and its sources:
  Fouquin & Hugot (CEPII 2016); ICAO via World Bank; World Bank; Energy Institute and Smil (2017);
  Gapminder and UN IGME; FAO; Moatsos (2021); HYDE, UN WPP and UN WUP; Global Carbon Budget;
  Met Office HadCRUT5; ITU via World Bank; Karl Rupp; van Zanden et al. and UNESCO;
  Riley (2005), Zijdeman et al.; WWF/ZSL Living Planet Index.
- **Night lights:** NASA Earth Observatory, Black Marble 2016 (Joshua Stevens; Suomi NPP VIIRS
  data from Miguel Román, NASA GSFC). Public domain.
- **Countries and cities:** Natural Earth. Public domain.
- **Chicago and O'Hare** (streets, rail, water, power lines and substations, downtown's buildings and their heights, runways): © OpenStreetMap contributors, ODbL 1.0.
- **The hidden Milky Way:** Falchi et al., "The new world atlas of artificial night sky brightness", *Science Advances* 2, e1600377 (2016): a third of humanity, and nearly 80% of North Americans, cannot see it from home.
- **Air routes** (from O'Hare, and the world's): OpenFlights.org, ODbL 1.0.
- **Chicago temperature 2023:** Open-Meteo.com (ERA5, Copernicus), CC BY 4.0.
- **Fonts (SIL Open Font License 1.1):** Mona Sans (GitHub), Overpass and Overpass Mono
  (Delve Withrington, Red Hat), Instrument Serif (Instrument), Climate Crisis (Helsingin Sanomat).
- **Tools:** HarfBuzz (harfbuzzjs), Demucs, torchaudio MMS_FA, faster-whisper, Vite,
  Playwright, FFmpeg/x264.

Every borrowed file has its note (source, licence, SHA-1, date) beside it:
`media/fonts/_sources.txt`, `media/raw/_sources.txt`, `media/raw/osm/_sources.txt`,
`data/owid/raw/_fetched.jsonl`, `data/weather_chicago.json`.

## What could not be checked

- **Nobody making this has heard it.** The word timings come from a forced alignment of the
  lyric to the separated vocal, checked against the vocal's own level and against Whisper,
  but not by ear. The outro's echoes are sung over their calls; their word times are spread
  evenly over the call's span and marked `estimated` in `data/lyrics.json`.
- The beat grid (118 BPM, first beat 0.199 s) was fitted to the kick drum; the joins are
  centred on it and on the sung words, but whether each one *feels* on the beat is unheard.
- The media are imitations made by shaders, not scans: the risograph's inks, screens and
  misregistration, the thermal camera's palette and noise, the cyanotype, the CRTs.
- Decoration is drawn so it cannot be read as data: stars, motes, warm air, clouds, the
  strawberries behind the year's wheel, the lights that run along the world's air routes
  (real routes, but not real flights), the traffic on the expressway (constant, not counted).
- Downtown's buildings are OpenStreetMap footprints extruded to their tagged heights (12 m where
  none is tagged); their windows are a drawn grid, lit by rule, not by any record of lit rooms.
- The lightning strikes Willis Tower because the tallest tower is where it strikes; that it did on
  this night is invented.
- In the relight, the lamps beyond the mapped streets (a suburb grid on the horizon), the cloud
  decks and the waking cars are decoration, not data; the lamp spacing is a rule, not a count.
- The chip dies in the dive are invented layouts (only the counts and the years are data), and
  the beat strip on the heart monitor follows the song, not any heart.
- The blackout is staged on real things: the streets, power lines and substations are
  Chicago's (OpenStreetMap), but the fault's path, the candles in the windows and the lightning
  are invented; the two charts it runs back (energy, child mortality) are data.
- Every frame was rendered and watched as a contact sheet; the frames that carry text or a join
  were opened at full size, but not every one of the 13,530.
