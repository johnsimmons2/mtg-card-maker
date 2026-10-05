# MTG Card Editor & Generator

A unified, full-stack web application to view, search, edit, and custom-render Magic: The Gathering-style cards.

The project is **React + Vite** on the frontend, **Express** on the backend, and **Node.js Playwright** for capturing print-ready, high-resolution PNG renders. All rendering, styling, and scaling logic lives in modular JavaScript/React — the legacy Python rendering pipeline (`generate_cards.py`, `card.html`) has been removed in favor of this app.

---

## First-time Setup

### 1. Install Node.js
Go to [nodejs.org](https://nodejs.org/) and download the latest LTS release.

### 2. Install dependencies & browsers
Open your terminal inside the `editor/` directory and run:

```bash
npm install
npx playwright install chromium
```

---

## Everyday Usage

### Step 1 — Add art
Drop your card art images into `cards/art/` (JPG/PNG/WEBP/GIF/SVG). Custom full-frame background textures go in `cards/art/backgrounds/`. The `cards/` folder holds your own creations (`cards.json`, `sets_config.json`, art) and its contents are gitignored (only the empty `cards/art/` folder structure is tracked). The server creates any missing folders on first start, and a fresh clone with no `cards.json` simply starts with an empty collection.

### Step 2 — Run the web application
Open a terminal in the `editor/` folder and run:

```bash
npm run dev
```

This starts two local servers, both with hot reload:
- **Frontend Customizer UI**: [http://localhost:3000](http://localhost:3000) — Vite HMR, updates on save
- **Backend File API**: [http://localhost:3001](http://localhost:3001) — `node --watch` restarts it when `server.js` changes

(Use `npm run start:backend` for a plain, no-watch backend process.)

### Step 3 — Edit & Render in browser
1. Open [http://localhost:3000](http://localhost:3000) in your web browser.
2. Filter cards by color/rarity, or search by name in the card grid.
3. Click a card to drill down and open the interactive live-preview editor.
4. Customize the card fields, toggle frame templates (**Modern, Retro, Borderless, Glassmorphism**), upload new art or backgrounds, or use visual adjustment sliders to override font sizes, box dimensions, and art placement.
5. Click **Save JSON** to update `cards.json` on disk.
6. Click **Generate PNG** to trigger Playwright in the background and write a high-resolution PNG into `output/<SET>/<id>.png` — or use **Render All PNGs** to batch-render every card in one pass.

> **No browser dialogs.** The app never calls `alert()` or `confirm()`. Browsers can
> block native dialogs per-site, and a blocked `confirm()` silently returns *false* —
> which made destructive and long-running buttons look like they did nothing at all.
> Instead, results appear as a toast at the bottom of the screen, and actions that
> need confirming (**Render All PNGs**, and deleting a card, set or template) are
> two-step: the first click arms the button, the second carries it out. An armed
> button disarms itself after a few seconds.

### Other pages in the app
- **Card Metadata** — how expensive the cards are to cast, which color combinations they use, and how many symbols of each color each set spends, with set toggles that scope all three at once. See [Card Metadata](#card-metadata).
- **Template Config** — tune the per-template defaults (art height, box sizing, borders, fonts, security stamp, footer) that back `templates_config.json`, with a live preview. Font-size fields here act as a maximum; see [Auto-fit](#auto-fit).
- **Set Styles** — define each set's printed code and its colours, gradients, fonts and effects, plus set-wide card appearance and per-set rules, backed by `sets_config.json`. See [Set styles](#set-styles).
- **Master Settings** — global mana-symbol rendering (size, alignment, offsets) and per-color frame/box tint palette, backed by `global_settings.json`, with an archetype sandbox preview.
- **AI Card Generator** — optional integration with a local LLM/diffusion backend (e.g. LM Studio / Automatic1111-style endpoints) to:
  - Generate card art from a text prompt.
  - Generate a full card "wholesale" from a one-line concept.
  - Chain-generate a card step by step (concept → rules text → stats) with a live agent log/terminal view.
  - Import AI output directly into the card list or assign generated art to the active card.

---

## `cards.json` Field Reference

| Field | Required | Description |
|---|---|---|
| `id` | Yes | Unique snake_case identifier — becomes the output filename (`"my_card"` in set `"JBA"` → `output/JBA/my_card.png`) |
| `name` | Yes | The card's display name |
| `mana_cost` | Yes | Mana cost using MTG brace notation: `{W}` `{U}` `{B}` `{R}` `{G}` `{1}` etc. Use `""` for lands |
| `art_path` | Yes | Filename of the art image in `cards/art/` (e.g. `"dragon.jpg"`) |
| `type_line` | Yes | Full type line (e.g. `"Creature — Human Wizard"`, `"Instant"`, `"Land"`) |
| `set_symbol` | Yes | Short set code (e.g. `"M"`, `"JBA"`). Looked up in `sets_config.json` to decide what text is printed and how it's styled — see [Set styles](#set-styles) |
| `rules_text` | Yes | Rules text. Use MTG brace notation for symbols (`{T}`, `{2}`, etc.) and `\n` for line breaks |
| `power_toughness` | Yes | `"P/T"` for creatures (e.g. `"3/2"`). Use `""` for non-creatures |
| `rarity` | No | Rarity letter shown in footer: `"C"` `"U"` `"R"` `"M"`. Defaults to `"R"` |
| `artist` | No | Artist name shown in footer. |
| `watermark_path` | No | Filename of a watermark image in `cards/art/` to show behind rules text. Omit to inherit the set's/template's, or for none |
| `background_path` | No | Filename of a custom background image in `cards/art/backgrounds/` to use in place of procedural textures. Omit to draw from the set's texture pool, or auto-derive |
| `metadata` | No | Object containing custom settings (e.g., `template`, `rulesFontSize`, `artHeight`, `nameFontSize`, `artXOffset`/`artYOffset`, `manaSymbolSize`, `rulesSymbolSize`, `forceSolid`, `neonGlowIntensity`, `backgroundBlendMode`, `backgroundOpacity`, tags, etc.) |

---

## Project Layout

```
mtg-cards/
├── cards/                  # Your content (untracked): created on first run
│   ├── cards.json          #   The card database
│   ├── sets_config.json    #   Per-set symbol text, colors, fonts and effects
│   └── art/                #   Source art (+ art/backgrounds/ for full-frame textures)
├── output/                 # Rendered PNGs, filed by set
│   ├── JBA/                #   e.g. output/JBA/jotaro.png
│   └── M/                  #   cards with no set land in output/ directly
├── mana-master/            # Vendored mana/keyrune symbol font & SVG set
├── templates_config.json   # Per-template layout/style defaults
├── global_settings.json    # Global mana-symbol & color palette settings
└── editor/                 # The React + Express application
    ├── server.js            # Express API: cards, art, backgrounds, render, AI bridge
    └── src/
        ├── components/
        │   ├── CardGrid.jsx           # Browse/search/filter cards, scoped by set
        │   ├── CardForm.jsx           # Card field editor
        │   ├── CardMetadataPage.jsx   # Cost curves, color combinations and symbol totals (+ CardMetadataPage.css)
        │   ├── CardPreview.jsx        # Live-rendered card (also used by Playwright for PNG export)
        │   ├── TemplatesConfigPage.jsx
        │   ├── SetsConfigPage.jsx      # Set symbol styling, set-wide appearance, set rules
        │   ├── MasterSettingsPage.jsx
        │   └── AICardGenerator.jsx    # LLM/diffusion-assisted card & art generation
        ├── templates/templates.css    # All frame template styling
        └── utils/
            ├── cardUtils.js           # Color/texture derivation, MTG text formatting
            └── cardMetadata.js        # Mana-cost parsing and the Card Metadata counts (pure, no React)
```

---

## LLM Prompt: Convert Card Descriptions to JSON

Use this prompt to have any LLM (ChatGPT, Claude, etc.) format cards into the correct JSON:

---

> You are helping format custom Magic: The Gathering cards into a JSON array for a card-rendering script.
>
> Each card entry must have these exact fields:
> - `id`: lowercase snake_case unique identifier, no spaces or special characters (used as the output filename)
> - `name`: the card's display name
> - `mana_cost`: MTG brace notation — `{W}` white, `{U}` blue, `{B}` black, `{R}` red, `{G}` green, `{1}` / `{2}` / etc. generic. Use `""` for lands or free spells.
> - `art_path`: the filename of the art image in the `cards/art/` folder (e.g. `"dragon.jpg"`). I will provide these filenames.
> - `type_line`: the full type line as printed on the card (e.g. `"Creature — Elf Druid"`, `"Instant"`, `"Legendary Artifact"`)
> - `set_symbol`: a short set code for the footer, typically `"M"` unless I specify otherwise
> - `rules_text`: rules text as a single string. Use MTG brace notation for all symbols (`{T}` tap, `{2}` generic mana, etc.). Use `\n` between separate paragraphs or abilities.
> - `power_toughness`: `"P/T"` string for creatures (e.g. `"2/3"`). Use `""` for all non-creature types.
>
> Optional fields (include only if relevant):
> - `rarity`: one of `"C"`, `"U"`, `"R"`, `"M"` — omit to default to Rare
> - `artist`: artist name string
>
> Return only a valid JSON array. No explanation or text outside the JSON.
>
> Here are the cards to convert:
> [PASTE YOUR CARD LIST HERE]

---

## How the card frames are built

All four templates render from `editor/src/templates/templates.css` plus the layout
pass in `editor/src/components/CardPreview.jsx`. A few things are worth knowing
before editing them.

### Geometry
The card is a fixed **744 × 1039 px**, the same 1:1.397 ratio as a real 63 × 88 mm
Magic card (≈11.8 px per mm). Border widths, corner radii and band heights in the
Modern template are derived from that scale, so if you change the card size, scale
the rest with it.

### Typography
| Use | Font | Notes |
|---|---|---|
| Rules & flavor text | **MPlantin** | The genuine face used on printed Magic cards. Ships in `mana-master/fonts/` and is declared by its `mana.css` — no download needed. Always weight 400; printed rules text is never bold. |
| Names, type lines, P/T | **Beleren** → **Source Serif 4** | Real cards use Beleren Bold. The stack prefers it if you have it installed locally and falls back to Source Serif 4 from Google Fonts. |
| Editor chrome | Inter / Outfit | UI only, never on the card. |

### Mana symbols
Symbols come from the vendored **Mana** font (`mana-master/`). Each one is a glyph
drawn inside a circular plate, and the glyph is scaled up slightly so pictorial
shapes (the water drop, the fireball) fill their circle properly.

Generic/colourless mana is the exception: it draws a **numeral**, and the scale
that flatters a water drop pushes a digit past the circle's edge and clips it. So
numerals — along with X/Y/Z, ½ and ∞ — are scaled separately via
`--ms-inner-scale-numeric` (default `0.8`). Both sets of values are adjustable
under **Master Settings → Circle Inner Icon**, and persist to `global_settings.json`.

**Symbols in the mana cost and in the rules text size independently.** They are driven
by two separate variables, `--ms-size-header` and `--ms-size-rules` (each falling back
to `--ms-size`), exposed as *Mana Cost Symbol Size* and *Rules Text Symbol Size* under
**Master Settings → Symbols & Alignment**. Both are `em`-relative, so rules-text symbols
also track the auto-fit type size, while the cost symbols in the title stay put.

Either can also be overridden **per card** — *Cost Symbol Size* and *Rules Symbol Size*
under **Layout & Styling**, stored as `metadata.manaSymbolSize` / `metadata.rulesSymbolSize`.
This matters for costs with many pips: a ten-pip cost such as `{W}{W}{U}{U}{B}{B}{R}{R}{G}{G}`
leaves the card name barely any room, so the auto-fit shrinks the name to near its floor.
Dropping the cost symbols to ~0.6em hands that width back to the name.

### Mana cost ordering

Mana costs are printed in the order Magic uses, regardless of how they were typed:
variable costs (`{X}`) first, then generic, then colourless/snow, then coloured symbols
grouped in **WUBRG** order. Hybrid and Phyrexian symbols sort by their first colour.
So `{1}{R}{R}{U}` prints as `{1}{U}{R}{R}`.

This is **display-only** — `cards.json` keeps exactly what was authored — and applies to
the `mana_cost` field only. Symbols inside rules text keep their authored order, since a
rules string may contain deliberate sequences that reordering would corrupt.

### Auto-fit
Card names, type lines and rules text are all measured and shrunk to fit their
boxes. Font sizes set in `templates_config.json` or a card's `metadata` are treated
as a **starting (maximum) size**, not a fixed one — text is always scaled down from
there until it fits. Rules text additionally reclaims height from the art window
before it starts shrinking the type, which keeps text as large as possible.

Nothing can overflow a frame: the rules text lives inside a `.rules-text-clip`
wrapper that clips as a final backstop. If you add a new template, give its rules
box a **definite height** (not just `min-height`) — the clip sizes itself as a
percentage of that box, and an auto height silently disables fitting.

---

## Set styles

Sets are text, not icons. A card joins a set through its `set_symbol` code, and
`sets_config.json` maps that code to the text actually printed and how it looks —
so every card in a set picks up the same treatment from one place.

Edit these in the app under **Set Styles**, which gives you a live preview across
all four rarities, a card count per set, and colour/font pickers.

```json
{
  "JBA": {
    "name": "JoJo's Bizarre Adventure",
    "label": "JBA",
    "gradient": ["#ff2f2f", "#ff9a00", "#ffe600", "#38d430", "#2f8fff", "#a44cff"],
    "gradientAngle": 100,
    "googleFont": "Bangers",
    "fontFamily": "'Bangers', 'Impact', sans-serif",
    "fontSize": 31,
    "letterSpacing": "0.05em",
    "outlineColor": "#14141c",
    "outlineWidth": 1.1,
    "glowColor": "#ffffff",
    "glowRadius": 2,
    "useRarityColor": false
  }
}
```

| Field | Description |
|---|---|
| `name` | Human-readable set name. Editor only — never printed |
| `label` | The text printed on the card. Defaults to the set code itself |
| `color` | Solid colour for the text |
| `gradient` | Array of 2+ colours painted through the glyphs. Takes precedence over `color` |
| `gradientAngle` | Gradient direction in degrees (default `90`) |
| `fontFamily` | CSS font stack for the set code |
| `googleFont` | Google Fonts family to auto-load (e.g. `"Bangers"`). Loaded before rendering, so PNG exports get the right face |
| `fontSize` / `fontWeight` / `fontStyle` | Type settings for the code |
| `letterSpacing` / `textTransform` | Extra typographic control |
| `outlineColor` + `outlineWidth` | Text outline — keeps light gradients legible on a pale type bar |
| `glowColor` + `glowRadius` | Soft glow around the text |
| `useRarityColor` | When `true` (the default) and no colour/gradient is set, tint by rarity the way printed Magic does |
| `rarityColors` | Optional per-rarity colour overrides, e.g. `{"C":"#151515","M":"#e86b24"}`. For full per-rarity restyling use `rarityStyles` below |
| `rarityStyles` | Per-rarity overrides of any field in this table — see [Per-rarity symbol tiers](#per-rarity-symbol-tiers) |

Colour resolution runs most-specific-first: **gradient → solid colour → rarity tint**.
A set with no colour settings behaves exactly as before — the raw code, tinted by rarity.

### Per-rarity symbol tiers

Any of the fields above can be overridden per rarity through `rarityStyles`, so a
set can print a flat black code at common and a full gradient at mythic — the way
printed Magic escalates its set symbols.

```json
"JBA": {
  "gradient": ["#ff2f2f", "…"],
  "rarityStyles": {
    "C": { "gradient": [], "color": "#1b1b20", "outlineWidth": 0, "glowRadius": 0 },
    "U": { "gradient": ["#eef4f8", "#93a7b6", "#cfdae2"], "outlineWidth": 0.9 },
    "R": { "gradient": ["#ff2f2f", "#ff9a00", "#ffe600", "#38d430", "#2f8fff", "#a44cff"] },
    "M": { "gradient": ["…"], "glowColor": "#ffd76a", "glowRadius": 5 }
  }
}
```

A tier may override **any** style field — whether a gradient applies at all and its
colours and angle, the font, size and letter-spacing, and the outline and glow
colours and sizes. Only keys actually present in the tier override; everything else
inherits the set's base style, and an explicit empty `"gradient": []` is how a tier
opts *out* of a base gradient.

In **Set Styles → Set Symbol**, the *Editing* row switches between the base style and
each rarity tier (a ● marks tiers that override). The preview strip above always shows
all four rarities at once, so the escalation is visible while you edit.
**Apply classic rarity ramps** fills in the printed-Magic ladder — black, silver, gold,
orange-red — as a starting point.

### Set-wide card appearance

A set does more than style its symbol — it can restyle every card in it. Appearance
resolves in layers, most specific last:

```
hardcoded defaults
  → global_settings.json     palette, mana-symbol rendering
  → templates_config.json    per-template preset
  → sets_config cardDefaults SET-WIDE LOOK
  → card.metadata            per-card customisation — always wins
```

Because card metadata is applied last, **per-card work is never clobbered** by a set
change: art position, chosen art, custom backgrounds and font overrides all survive.

| Set field | Description |
|---|---|
| `template` | Default frame for cards in the set. A card's own `metadata.template` still wins |
| `cardDefaults` | Template-preset values applied to the whole set — `artHeight`, `rulesFontSize`, `nameFontSize`, `typeFontSize`, `rulesPadding`, `frameBorderWidth`, `titleBoxHeight`, `typeBoxHeight`, `footerFontSize`, `watermark_path`. Blank means inherit |

### Set rules

Rules are *policy* for a whole class of cards, rather than a default a single card
overrides:

```json
"rules": {
  "multicolorFrame": "gradient",
  "backgroundPool": ["jojo_1.png", "jojo_2.png"],
  "palette": { "COLORS": { "red": "#c0392b" } }
}
```

| Rule | Values | Effect |
|---|---|---|
| `multicolorFrame` | `auto` \| `gold` \| `gradient` | How multicolour cards are framed. `auto` keeps the old behaviour (two colours blend, three or more go gold); `gold` matches printed Magic; `gradient` blends all of the card's colours. This is what lets JBA use gradients while other sets use gold |
| `backgroundPool` | array of filenames in `cards/art/backgrounds/` | Cards with no `background_path` of their own are assigned one, chosen by hashing the card's `id` so it stays stable between renders |
| `palette` | `{COLORS, PALE_COLORS, THEME_COLORS, gold*}` | Optional per-set colour palette, overriding the global one |

### Where renders are written

Each card's PNG is filed under its set: `output/<SET>/<id>.png`, so a set's cards stay
together. A card with no `set_symbol` is written to `output/` directly, since there is no
folder name to use. Set codes and card ids are sanitised before use as path segments.

Re-rendering a card after it changes sets also removes the render left behind in the old
folder, so `output/` never accumulates two copies of the same card.

### Browsing by set

The **Card Catalog** shows a set bar across the top with per-set card counts, each
rendered in its own set styling. Selecting one scopes the catalog to that set, and any
card created while browsing it joins that set and inherits its default template.

Grid thumbnails render through the same resolver as the full-size export, so a set's
template, card defaults, rules and symbol styling show up in the catalog immediately —
without needing to open a card or re-render its PNG.

Each thumbnail also carries **set** and **rarity** dropdowns, so a card can be reassigned
straight from the catalog and restyles in place — changing rarity also switches which
[per-rarity symbol tier](#per-rarity-symbol-tiers) its set applies. Like other edits these
mark the catalog dirty; hit **Save JSON** to write them to disk.

### Stepping through cards

While editing a card, the **‹ / ›** controls beside *Back* move to the previous or next
card, with a position counter (`3 / 18`). The **←** and **→** arrow keys do the same,
except while typing in a field.

Navigation follows exactly what the catalog was showing — same set scope, search and
filters, in the same order — so stepping through a set stays inside that set. If there
are unsaved changes, you are prompted before moving on.

### Previewing a card in any template
Append `?template=` to the standalone preview route to render a card in a frame
other than its saved one, without editing its data:

```
http://localhost:3000/preview/counterfish?template=retro
```

---

## Card Metadata

The **Card Metadata** page answers three questions about the catalog. One row of set
toggles at the top scopes all of them, so you can look at the whole catalog, a single set,
or any combination of sets. The set selection and the Cards/Symbols and Chart/Table choices
are kept while you visit other pages.

Only `mana_cost` is read. Symbols in rules text, and the color a land is guessed to
produce, are ignored.

### Mana cost by color

Six charts (White, Blue, Black, Red, Green, Colorless) plot cost from 0 to 15, then an
**X** bar (any cost containing X) and an **Other** bar (any other cost above 15). They share
one y axis, so heights compare across colors. **Cards / Symbols** changes what a bar counts,
and **Chart / Table** swaps the charts for the same numbers as a table. Hover a bar, or
focus a chart and use the arrow keys, for its exact value.

| Count | A `{W}{W}{W}{W}{U}` card (cost 5) adds |
|---|---|
| **Cards** | 1 to White and 1 to Blue at cost 5. A card counts once for every color it has. |
| **Symbols** | 4 to White and 1 to Blue at cost 5. Every colored symbol counts. |

- A card with no colored symbol is **Colorless**. In Cards mode it counts once; in Symbols
  mode it counts its whole generic cost plus any `{C}`, so a `{3}` artifact adds 3. The `{2}`
  of `{2}{W}` is never counted as colorless. `{C}` symbols always count as colorless
  symbols, even on a colored card.
- Hybrid symbols belong to both colors: `{U/W}` is a white card and a blue card, and adds one
  symbol to each. Phyrexian symbols (`{U/P}`) belong to their color.
- `{0}` is a real cost, so those cards sit in the 0 bar (and add no symbols). Cards with *no*
  mana cost have no cost to chart and are left out.

### Color combinations

How many cards use each exact set of colors: colorless, the five single colors, then every
two-, three-, four- and five-color combination, with a column per selected set and a total.
A card counts once however many symbols it has, so `{W}{U}` and `{W}{W}{W}{W}{U}` are two
`{W}{U}` cards. Empty combinations are dimmed (or hidden with *Hide empty combinations*) so
gaps are easy to spot, and a final **No mana cost** row keeps the totals equal to the
catalog.

### Color symbols per set

The total of each color's symbols across the selected sets, one row per set plus a total. It
counts exactly as Symbols mode does, so each column equals the sum of that color's bars.

### Cost warnings

Custom cards can break the rules, so a card with no mana cost is allowed. But a cost that is
missing looks the same as one left out by accident, so **non-land cards with no mana cost
are flagged** in a warning above the charts (for the selected sets). Click a name to open
that card in the editor. Lands and tokens are never flagged. The warning also lists any
cost holding something other than mana symbols (a typo such as `{Q}`), which the counts
ignore.

---

## Roadmap

Planned work, roughly in priority order:

- **More frame templates** — additional layouts beyond the current four (e.g. full-art, showcase, extended-art style frames).
- **Smarter art placement** — more sophisticated art positioning/cropping controls than the current X/Y offset sliders (e.g. focal-point selection, auto-crop-to-frame, per-template safe zones).

---
