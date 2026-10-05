// Texture Generators
function createSvgTexture(frequency, octaves, slope = "2", intercept = "-0.4") {
  const svg = `
    <svg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'>
        <filter id='noise'>
            <feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='${octaves}' stitchTiles='stitch' result='noise'/>
            <feComponentTransfer in='noise' result='contrasted'>
                <feFuncR type='linear' slope='${slope}' intercept='${intercept}'/>
                <feFuncG type='linear' slope='${slope}' intercept='${intercept}'/>
                <feFuncB type='linear' slope='${slope}' intercept='${intercept}'/>
            </feComponentTransfer>
            <feColorMatrix type='matrix' values='0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0.6 0'/>
        </filter>
        <rect width='100%' height='100%' filter='url(#noise)'/>
    </svg>
  `;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function createStoneTexture(frequency = "0.03", octaves = "3", slope = "4.0", intercept = "-0.2") {
  const svg = `
    <svg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'>
        <filter id='stone_cracks'>
            <feTurbulence type='turbulence' baseFrequency='${frequency}' numOctaves='${octaves}' stitchTiles='stitch' result='turb'/>
            <feComponentTransfer in='turb' result='contrasted'>
                <feFuncR type='linear' slope='${slope}' intercept='${intercept}'/>
                <feFuncG type='linear' slope='${slope}' intercept='${intercept}'/>
                <feFuncB type='linear' slope='${slope}' intercept='${intercept}'/>
            </feComponentTransfer>
            <feColorMatrix type='matrix' values='0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0'/>
        </filter>
        <rect width='100%' height='100%' fill='white' filter='url(#stone_cracks)'/>
    </svg>
  `;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function createStarTexture(frequency = "0.15", density = "40", cutoff = "-20", glow_radius = "1.5") {
  const svg = `
    <svg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'>
        <filter id='stars' x='-20%' y='-20%' width='140%' height='140%'>
            <feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='3' stitchTiles='stitch' result='noise'/>
            <feColorMatrix type='matrix' in='noise' result='cores' values='
                0 0 0 0 1
                0 0 0 0 1
                0 0 0 0 1
                0 0 0 ${density} ${cutoff}'/>
            <feGaussianBlur in='cores' stdDeviation='${glow_radius}' result='glow'/>
            <feMerge>
                <feMergeNode in='glow'/>
                <feMergeNode in='cores'/>
            </feMerge>
        </filter>
        <rect width='100%' height='100%' fill='transparent' filter='url(#stars)'/>
    </svg>
  `;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

/* Frame textures.
   These sit on top of the printed frame colour, so they have to read as paper
   grain and mottling — not as weather. Each profile carries its own opacity
   because a multiply grain and a screen sparkle need very different strengths
   to land at the same subtlety. Keep these low: heavy texture is what made
   earlier renders look like concrete rather than cardstock. */
export const TEXTURES = {
  stone: { data: createStoneTexture("0.035", "4", "0.55", "-0.45"), blend: "multiply", opacity: 0.30 },
  parchment: { data: createSvgTexture("0.5", "4", "0.5", "-0.28"), blend: "multiply", opacity: 0.26 },
  stars: { data: createStarTexture("0.55", "60", "-52", "0.9"), blend: "screen", opacity: 0.55 },
  parchment_bg: { data: createSvgTexture("0.35", "3", "0.55", "-0.3"), blend: "multiply", opacity: 0.22 }
};

export const COLORS = {
  pale: "#b3a175",
  white: "#f8f0e3",
  blue: "#3E8BAA",
  black: "#585858",
  red: "#DA3A35",
  green: "#1E6E3D",
  artifact: "#8A99A8"
};

export const PALE_COLORS = {
  pale: "#f4f3eb",
  white: "#fcfaf5",
  blue: "#eaf2f8",
  black: "#e8e7e6",
  red: "#fcedec",
  green: "#eaf5ec",
  artifact: "#eef0f2"
};

/* Frame bevel colours.
   `vibrant` is the lit edge of the frame moulding, `dark` the shadow line beneath it.
   Printed Magic frames are pigment on cardstock, so these stay muted tints/shades of
   the base frame colour — a saturated "neon" edge is the fastest way to make a render
   read as fake. Keep every vibrant desaturated relative to its COLORS counterpart. */
export const THEME_COLORS = {
  pale: { vibrant: "#cdb98f", dark: "#4b3d26" },
  white: { vibrant: "#fffdf2", dark: "#a2977a" },
  blue: { vibrant: "#79b4cd", dark: "#15455c" },
  black: { vibrant: "#8f8c88", dark: "#1a1a1a" },
  red: { vibrant: "#ec8168", dark: "#6d1a14" },
  green: { vibrant: "#5d9b6c", dark: "#0d3d21" },
  artifact: { vibrant: "#b6c3ce", dark: "#3b4650" }
};

/* ------------------------------------------------------------------
   Set-scoped appearance

   Appearance resolves in layers, most specific last:

     hardcoded defaults
       -> global_settings.json      (palette, symbol rendering)
       -> templates_config.json     (per-template preset)
       -> sets_config[code].cardDefaults   <- set-wide look
       -> card.metadata             (per-card customisation, always wins)

   Set *rules* are policy rather than defaults — they describe how a set treats
   a whole class of cards ("multicolour cards here use gradients", "pick frame
   textures from this pool") — so they are not overridden by card metadata,
   only by a card setting the underlying field explicitly.
   ------------------------------------------------------------------ */

export const DEFAULT_SET_RULES = {
  // 'gradient' blends the card's colours, 'gold' uses the shared gold frame,
  // 'auto' keeps the historic behaviour (2 colours blend, 3+ go gold).
  multicolorFrame: 'auto',
  backgroundPool: [],
  palette: null
};

/* ------------------------------------------------------------------
   Multicolour frame treatment

   How a card with two or more colours in its cost is framed. This is a
   template-level policy (templates_config.json), and a set can still override
   the mode via its own `rules.multicolorFrame` (the older three-value control).

   Modes:
     'auto'         two colours blend 50/50, three or more collapse to gold
                    — the historic behaviour, matching printed Magic.
     'blend'        a full gradient across every colour on the card, no matter
                    how many.
     'blend-capped' like 'blend', but once the colour count passes
                    `multicolorCapThreshold` (default 3) the frame drops to a
                    gradient between two fixed template colours
                    (`multicolorCapColors`) instead of a busy 4–5 stop blend.
     'solid'        every multicolour card uses one flat colour
                    (`multicolorSolidColor`); blank falls back to the palette
                    gold. This is "gold, or any custom colour by template".
   ------------------------------------------------------------------ */
export const MULTICOLOR_MODES = ['auto', 'blend', 'blend-capped', 'solid'];

// A set's legacy rule vocabulary maps onto the richer template vocabulary.
const LEGACY_MULTICOLOR = { gold: 'solid', gradient: 'blend', auto: 'auto' };

/**
 * Resolve the multicolour policy for a card from its template preset, with the
 * set's own `rules.multicolorFrame` taking precedence when it names something
 * other than the default 'auto'.
 *
 * @returns {{mode: string, angle: number, capThreshold: number, capColors: string[]|null, solidColor: string|null}}
 */
export function resolveMulticolorRules(preset, setRules = null) {
  preset = preset || {};
  const setMode = setRules?.multicolorFrame && setRules.multicolorFrame !== 'auto'
    ? (LEGACY_MULTICOLOR[setRules.multicolorFrame] || setRules.multicolorFrame)
    : null;

  const presetMode = MULTICOLOR_MODES.includes(preset.multicolorFrame)
    ? preset.multicolorFrame
    : 'auto';

  const capColorsRaw = Array.isArray(preset.multicolorCapColors)
    ? preset.multicolorCapColors.filter(Boolean)
    : [];

  // Angle of every blended multicolour gradient (frame, boxes, bevels). A set
  // rule can override it too. 115° is the historic default.
  const rawAngle = setRules?.multicolorGradientAngle ?? preset.multicolorGradientAngle;
  const angle = rawAngle !== undefined && rawAngle !== null && rawAngle !== '' && !isNaN(Number(rawAngle))
    ? Number(rawAngle)
    : 115;

  return {
    mode: setMode || presetMode,
    angle,
    capThreshold: Number(preset.multicolorCapThreshold) > 0
      ? Number(preset.multicolorCapThreshold)
      : 3,
    capColors: capColorsRaw.length >= 2 ? capColorsRaw.slice(0, 2) : null,
    solidColor: (preset.multicolorSolidColor || '').trim() || null
  };
}

export function getSetDef(card = {}, setsConfig = null) {
  if (!setsConfig) return null;
  return setsConfig[card.set_symbol] || null;
}

export function resolveSetRules(card = {}, setsConfig = null) {
  const def = getSetDef(card, setsConfig);
  return { ...DEFAULT_SET_RULES, ...(def?.rules || {}) };
}

/**
 * Merge a template preset with the set's card defaults.
 * Set values win over the template; card.metadata is applied later by the
 * renderer and wins over both.
 */
export function resolveSetPreset(card = {}, setsConfig = null, templatePreset = {}) {
  const def = getSetDef(card, setsConfig);
  if (!def?.cardDefaults) return templatePreset;
  const merged = { ...templatePreset };
  Object.entries(def.cardDefaults).forEach(([k, v]) => {
    // Treat '' / null / undefined as "not set" so a blank field in the editor
    // falls through to the template rather than clobbering it.
    if (v !== undefined && v !== null && v !== '') merged[k] = v;
  });
  return merged;
}

/** Which template a card renders in, if it hasn't chosen one itself. */
export function resolveSetTemplate(card = {}, setsConfig = null) {
  return getSetDef(card, setsConfig)?.template || null;
}

// Small stable string hash, so a card always draws the same texture from a
// pool rather than changing between renders.
function hashString(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * The frame background texture for a card: an explicit per-card
 * `background_path` always wins; otherwise the set's texture pool assigns one
 * deterministically from the card's id.
 */
export function resolveBackgroundPath(card = {}, setsConfig = null) {
  if (card.background_path) return card.background_path;
  const pool = resolveSetRules(card, setsConfig).backgroundPool;
  if (!Array.isArray(pool) || pool.length === 0) return null;
  return pool[hashString(card.id || card.name || '') % pool.length];
}

// Derive MTG colors based on card details
export function deriveColors(manaCost = "", typeLine = "", name = "", rulesText = "", globalSettings = null) {
  const found = [];
  const cost = manaCost.toUpperCase();
  if (cost.includes("{W}")) found.push("white");
  if (cost.includes("{U}")) found.push("blue");
  if (cost.includes("{B}")) found.push("black");
  if (cost.includes("{R}")) found.push("red");
  if (cost.includes("{G}")) found.push("green");
  
  if (found.length === 0 && typeLine.toLowerCase().includes("land")) {
    const textLower = (rulesText || "").toLowerCase();
    const nameLower = (name || "").toLowerCase();
    const typeLower = (typeLine || "").toLowerCase();
    
    // Check if custom land autocolor rules are configured
    const landRules = globalSettings?.colorRules?.landRules || [
      { keyword: "mountain", symbol: "{r}", color: "red" },
      { keyword: "forest", symbol: "{g}", color: "green" },
      { keyword: "swamp", symbol: "{b}", color: "black" },
      { keyword: "island", symbol: "{u}", color: "blue" },
      { keyword: "plains", symbol: "{w}", color: "white" }
    ];

    for (const rule of landRules) {
      const kw = (rule.keyword || "").toLowerCase();
      const sym = (rule.symbol || "").toLowerCase();
      if ((kw && (typeLower.includes(kw) || nameLower.includes(kw))) || (sym && textLower.includes(sym))) {
        found.push(rule.color);
        break; // stop on first match
      }
    }
  }
  return found;
}

export function deriveBoxTint(manaCost = "", typeLine = "", name = "", rulesText = "", globalSettings = null, setRules = null, preset = null) {
  const customPalette = setRules?.palette?.PALE_COLORS ? setRules.palette : globalSettings?.palette;
  const activePale = customPalette?.PALE_COLORS || PALE_COLORS;

  const foundColors = deriveColors(manaCost, typeLine, name, rulesText, globalSettings);
  const found = foundColors.map(c => activePale[c] || c);

  const goldBox = () => {
    const start = customPalette?.goldBoxStart || "#f7f2e1";
    const end = customPalette?.goldBoxEnd || "#f0e6c8";
    return `linear-gradient(115deg, ${start}, ${end})`;
  };

  if (found.length > 1) {
    const mc = resolveMulticolorRules(preset, setRules);
    const a = `${mc.angle}deg`;
    if (mc.mode === 'solid') {
      return mc.solidColor || goldBox();
    }
    if (mc.mode === 'blend') {
      return `linear-gradient(${a}, ${found.join(', ')})`;
    }
    if (mc.mode === 'blend-capped') {
      if (found.length > mc.capThreshold && mc.capColors) {
        return `linear-gradient(${a}, ${mc.capColors[0]}, ${mc.capColors[1]})`;
      }
      return `linear-gradient(${a}, ${found.join(', ')})`;
    }
    // 'auto': two colours blend, three or more collapse to gold.
    if (found.length === 2) {
      return `linear-gradient(${a}, ${found[0]}, ${found[1]})`;
    }
    return goldBox();
  }

  if (found.length === 1) {
    return found[0];
  }

  if (typeLine.toLowerCase().includes("artifact")) {
    return activePale.artifact || PALE_COLORS.artifact;
  }
  return activePale.pale || PALE_COLORS.pale;
}

export function deriveFrameColor(manaCost = "", typeLine = "", name = "", rulesText = "", globalSettings = null, setRules = null, preset = null) {
  const customPalette = setRules?.palette?.COLORS ? setRules.palette : globalSettings?.palette;
  const activeColors = customPalette?.COLORS || COLORS;

  const foundColors = deriveColors(manaCost, typeLine, name, rulesText, globalSettings);
  const found = foundColors.map(c => activeColors[c] || c);

  const goldFrame = () => {
    const start = customPalette?.goldFrameStart || "#e4c96a";
    const end = customPalette?.goldFrameEnd || "#c5a342";
    return `linear-gradient(115deg, ${start} 45%, ${end} 55%)`;
  };

  // Multicolour treatment. The template preset picks the mode; a set's own
  // `rules.multicolorFrame` still overrides it. See resolveMulticolorRules.
  if (found.length > 1) {
    const mc = resolveMulticolorRules(preset, setRules);
    const a = `${mc.angle}deg`;
    if (mc.mode === 'solid') {
      if (!mc.solidColor) return goldFrame();
      return `linear-gradient(${a}, ${mc.solidColor} 45%, ${mc.solidColor} 55%)`;
    }
    if (mc.mode === 'blend') {
      return `linear-gradient(${a}, ${found.join(', ')})`;
    }
    if (mc.mode === 'blend-capped') {
      if (found.length > mc.capThreshold && mc.capColors) {
        return `linear-gradient(${a}, ${mc.capColors[0]} 30%, ${mc.capColors[1]} 70%)`;
      }
      return `linear-gradient(${a}, ${found.join(', ')})`;
    }
    // 'auto': two colours blend 50/50, three or more collapse to gold.
    if (found.length === 2) {
      return `linear-gradient(${a}, ${found[0]} 45%, ${found[1]} 55%)`;
    }
    return goldFrame();
  }

  if (found.length === 1) {
    return found[0];
  }

  if (typeLine.toLowerCase().includes("artifact")) {
    return activeColors.artifact || COLORS.artifact;
  }
  return activeColors.pale || COLORS.pale;
}

export function deriveThemeColors(manaCost = "", typeLine = "", name = "", rulesText = "", globalSettings = null, setRules = null, preset = null) {
  const customPalette = setRules?.palette?.THEME_COLORS ? setRules.palette : globalSettings?.palette;
  const activeTheme = customPalette?.THEME_COLORS || THEME_COLORS;

  const foundColors = deriveColors(manaCost, typeLine, name, rulesText, globalSettings);
  const goldTheme = {
    vibrant: customPalette?.goldThemeVibrant || "#e6cf83",
    dark: customPalette?.goldThemeDark || "#6d5719"
  };
  const vibrantOf = (k) => activeTheme[k]?.vibrant || THEME_COLORS[k]?.vibrant || '#ffffff';
  const darkOf = (k) => activeTheme[k]?.dark || THEME_COLORS[k]?.dark || '#000000';

  if (foundColors.length > 1) {
    const mc = resolveMulticolorRules(preset, setRules);
    const a = `${mc.angle}deg`;
    if (mc.mode === 'solid') {
      return mc.solidColor ? { vibrant: mc.solidColor, dark: goldTheme.dark } : goldTheme;
    }
    if (mc.mode === 'blend' || mc.mode === 'blend-capped') {
      if (mc.mode === 'blend-capped' && foundColors.length > mc.capThreshold && mc.capColors) {
        return { vibrant: `linear-gradient(${a}, ${mc.capColors[0]}, ${mc.capColors[1]})`, dark: darkOf(foundColors[0]) };
      }
      const stops = foundColors.map(vibrantOf).join(', ');
      return { vibrant: `linear-gradient(${a}, ${stops})`, dark: darkOf(foundColors[0]) };
    }
    // 'auto'
    if (foundColors.length === 2) {
      return { vibrant: `linear-gradient(${a}, ${vibrantOf(foundColors[0])}, ${vibrantOf(foundColors[1])})`, dark: darkOf(foundColors[0]) };
    }
    return goldTheme;
  }

  if (foundColors.length === 1) {
    return { vibrant: vibrantOf(foundColors[0]), dark: darkOf(foundColors[0]) };
  }
  
  if (typeLine.toLowerCase().includes("artifact")) {
    const vibrant = activeTheme.artifact?.vibrant || THEME_COLORS.artifact?.vibrant;
    const dark = activeTheme.artifact?.dark || THEME_COLORS.artifact?.dark;
    return { vibrant, dark };
  }
  
  const vibrant = activeTheme.pale?.vibrant || THEME_COLORS.pale?.vibrant;
  const dark = activeTheme.pale?.dark || THEME_COLORS.pale?.dark;
  return { vibrant, dark };
}

export function deriveTexture(typeLine = "") {
  const typeStr = typeLine.toLowerCase();
  if (typeStr.includes("enchantment")) {
    return "stars";
  } else if (typeStr.includes("land") || typeStr.includes("artifact")) {
    return "stone";
  }
  return "parchment";
}

export const WUBRG = ['W', 'U', 'B', 'R', 'G'];

/**
 * Reorder a mana cost into the sequence printed Magic uses.
 *
 * Variable costs first, then generic, then colourless/snow, then coloured
 * symbols grouped in WUBRG order — so `{U}{W}{2}` prints as `{2}{W}{U}`.
 * Hybrid and Phyrexian symbols sort by their first colour, and ties keep their
 * original order so repeated pips stay stable.
 *
 * Display-only: the stored `mana_cost` is left untouched. Anything that isn't a
 * clean run of brace tokens is returned unchanged rather than risking mangling.
 */
export function sortManaCost(cost) {
  if (!cost || typeof cost !== 'string') return cost;
  const tokens = cost.match(/\{[^}]+\}/g);
  if (!tokens || tokens.join('') !== cost.replace(/\s+/g, '')) return cost;

  const rank = (token) => {
    const body = token.slice(1, -1).toUpperCase();
    if (/^[XYZ]$/.test(body)) return [0, 0, 0];
    if (/^\d+$/.test(body)) return [1, 0, parseInt(body, 10)];
    if (body === 'C') return [2, 0, 0];
    if (body === 'S') return [2, 1, 0];
    // Coloured: plain pips before hybrid/Phyrexian of the same colour.
    const colors = body.split('/').filter(c => WUBRG.includes(c));
    const primary = colors.length ? WUBRG.indexOf(colors[0]) : WUBRG.length;
    return [3, primary, /^[WUBRG]$/.test(body) ? 0 : 1];
  };

  return tokens
    .map((token, index) => ({ token, r: rank(token), index }))
    .sort((a, b) => {
      for (let k = 0; k < 3; k++) if (a.r[k] !== b.r[k]) return a.r[k] - b.r[k];
      return a.index - b.index;
    })
    .map(x => x.token)
    .join('');
}

// Convert brace notation into HTML using mana font classes
export function formatMtgText(text) {
  if (!text) return "";
  
  let html = text.replace(/\n/g, '<br>');
  
  const hybridOrder = {
    'W/U': 'wu', 'U/W': 'wu',
    'W/B': 'wb', 'B/W': 'wb',
    'U/B': 'ub', 'B/U': 'ub',
    'U/R': 'ur', 'R/U': 'ur',
    'B/R': 'br', 'R/B': 'br',
    'B/G': 'bg', 'G/B': 'bg',
    'R/G': 'rg', 'G/R': 'rg',
    'R/W': 'rw', 'W/R': 'rw',
    'G/W': 'gw', 'W/G': 'gw',
    'G/U': 'gu', 'U/G': 'gu',
  };
  
  html = html.replace(/\{([A-Za-z0-9/]+)\}/g, (match, p1) => {
    const symbol = p1.toUpperCase();
    if (symbol === 'T') return '<i class="ms ms-cost ms-tap"></i>';
    if (symbol === 'Q') return '<i class="ms ms-cost ms-untap"></i>';
    if (symbol === 'C') return '<i class="ms ms-cost ms-c"></i>';
    if (symbol.includes('/')) {
      const parts = symbol.split('/');
      const left = parts[0];
      const right = parts[1];
      if (right === 'P') {
        return `<i class="ms ms-cost ms-${left.toLowerCase()}p"></i>`;
      } else {
        const orderKey = `${left}/${right}`;
        const className = hybridOrder[orderKey] || `${left.toLowerCase()}${right.toLowerCase()}`;
        return `<i class="ms ms-cost ms-${className}"></i>`;
      }
    }
    return `<i class="ms ms-cost ms-${symbol.toLowerCase()}"></i>`;
  });
  
  // Format *italic text* (typically rules reminder text)
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  return html;
}

/* ------------------------------------------------------------------
   Set symbols

   A card's `set_symbol` is a short code ("M", "JBA"). sets_config.json maps
   that code to the text actually printed and how it is styled, so every card
   in a set picks up the same look from one place. Anything not configured
   falls back to the previous behaviour: the raw code, tinted by rarity.
   ------------------------------------------------------------------ */

export const RARITY_COLORS = {
  C: '#151515', // Common — black
  U: '#6b8296', // Uncommon — silver-blue
  R: '#c5a342', // Rare — gold
  M: '#e86b24'  // Mythic — orange-red
};

export function getRarityColor(rarity, setDef = null) {
  const key = (rarity || 'R').toUpperCase();
  return setDef?.rarityColors?.[key] || RARITY_COLORS[key] || RARITY_COLORS.R;
}

export const RARITY_TIERS = ['C', 'U', 'R', 'M'];

export const RARITY_LABELS = { C: 'Common', U: 'Uncommon', R: 'Rare', M: 'Mythic' };

/**
 * Overlay a set's per-rarity tier on top of its base symbol style.
 *
 * A tier in `rarityStyles` may override any style field, so a set can print
 * (say) a flat black code at common and a full gradient at mythic. Only keys
 * actually present in the tier override; anything else inherits the base, and
 * an explicit empty `gradient: []` is how a tier opts out of a base gradient.
 */
export function resolveSetDefForRarity(def, rarity) {
  if (!def) return null;
  const tier = def.rarityStyles?.[(rarity || 'R').toUpperCase()];
  if (!tier) return def;
  const merged = { ...def };
  Object.entries(tier).forEach(([k, v]) => {
    if (v !== undefined && v !== null) merged[k] = v;
  });
  return merged;
}

/**
 * Resolve what to print for a card's set symbol and how to style it.
 *
 * @returns {{label: string, style: object, hasGradient: boolean}}
 *   `style` is a React style object ready to spread onto the element.
 */
export function resolveSetStyle(card = {}, setsConfig = null, fallbackColor = null) {
  const code = card.set_symbol || '';
  const baseDef = (setsConfig && setsConfig[code]) || null;
  const def = resolveSetDefForRarity(baseDef, card.rarity);

  const label = def?.label || code || 'M';
  const rarityColor = getRarityColor(card.rarity, def);

  const style = {};

  if (def?.fontFamily) style.fontFamily = def.fontFamily;
  if (def?.fontSize) style.fontSize = `${def.fontSize}px`;
  if (def?.fontWeight) style.fontWeight = def.fontWeight;
  if (def?.fontStyle) style.fontStyle = def.fontStyle;
  if (def?.letterSpacing) style.letterSpacing = def.letterSpacing;
  if (def?.textTransform) style.textTransform = def.textTransform;

  // Colour resolution, most specific first: gradient > solid > rarity tint.
  const gradient = Array.isArray(def?.gradient) ? def.gradient.filter(Boolean) : [];
  const hasGradient = gradient.length >= 2;

  if (hasGradient) {
    const angle = def.gradientAngle ?? 90;
    style.backgroundImage = `linear-gradient(${angle}deg, ${gradient.join(', ')})`;

    /* Gradient text is painted *through* the element's background box, so any
       glyph ink falling outside that box simply isn't painted — the letter looks
       sliced off. Two things push ink outside it:

         1. A negative letter-spacing. Letter-spacing is applied after every
            character including the last, so the box loses one trailing step
            that the ink still occupies.
         2. Display faces whose glyphs overhang their advance width — Bangers
            overhangs ~0.14em on the right and ~0.05em on the left even at zero
            letter-spacing.

       Grow the paint box on both sides, then pull the same amount back with
       negative margins so the symbol still occupies its original layout space. */
    const bleed = '0.18em';
    const spacing = String(def?.letterSpacing ?? '').trim();
    const negative = spacing.match(/^-([\d.]+)(em|rem|px|%)$/);
    const extra = negative ? `${negative[1]}${negative[2]}` : null;

    style.paddingLeft = bleed;
    style.marginLeft = `-${bleed}`;
    style.paddingRight = extra ? `calc(${bleed} + ${extra})` : bleed;
    style.marginRight = extra ? `calc(-1 * (${bleed} + ${extra}))` : `-${bleed}`;
  } else if (def?.color) {
    style.color = def.color;
  } else if (def?.useRarityColor === false) {
    style.color = fallbackColor || rarityColor;
  } else {
    style.color = rarityColor;
  }

  // An outline keeps light gradients legible against a pale type bar.
  if (def?.outlineColor && def?.outlineWidth) {
    style.WebkitTextStrokeWidth = `${def.outlineWidth}px`;
    style.WebkitTextStrokeColor = def.outlineColor;
    style.paintOrder = 'stroke fill';
  }

  if (def?.glowColor && def?.glowRadius) {
    style.filter = `drop-shadow(0 0 ${def.glowRadius}px ${def.glowColor})`;
  }

  return { label, style, hasGradient };
}

/**
 * Google Fonts families referenced by any configured set, so the app can load
 * them before rendering. Playwright waits on document.fonts.ready, so a font
 * listed here is guaranteed to be loaded before a card is captured.
 */
export function getSetFontFamilies(setsConfig) {
  if (!setsConfig) return [];
  const families = [];
  Object.values(setsConfig).forEach(s => {
    if (!s) return;
    // Base style, plus any font a per-rarity tier introduces.
    families.push(s.googleFont);
    Object.values(s.rarityStyles || {}).forEach(tier => families.push(tier?.googleFont));
  });
  return [...new Set(families.filter(f => typeof f === 'string' && f.trim() !== ''))];
}

// Helper: Get base64 or URL path for local art/background assets
export function getArtUrl(pathName) {
  if (!pathName) return '';
  if (pathName.startsWith('data:') || pathName.startsWith('http')) return pathName;
  return `/api/images/art/${pathName}`;
}

export function getBackgroundUrl(pathName) {
  if (!pathName) return '';
  if (pathName.startsWith('data:') || pathName.startsWith('http')) return pathName;
  return `/api/images/backgrounds/${pathName}`;
}

export function getWatermarkUrl(pathName) {
  if (!pathName) return '';
  return `/api/images/art/${pathName}`;
}
