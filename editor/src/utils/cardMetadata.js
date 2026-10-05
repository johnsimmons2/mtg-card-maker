import { WUBRG } from './cardUtils';

/* ------------------------------------------------------------------
   Card metadata

   Three questions about a pile of cards, each counted differently:

     cost curve     per color, per cost: how expensive are the cards?
                    Counted as cards *or* as symbols (see `summarizeCards`).
     color combos   how many cards use each exact combination of colors?
                    A card is counted once, however many symbols it has.
     symbol totals  how many symbols of each color do the cards spend?

   Only `mana_cost` is read. Symbols in rules text and the color a land is
   guessed to produce (`deriveColors`) are ignored: those describe what a card
   does, not what it costs.

   Hybrid symbols belong to both of their colors ({U/W} is a white card and a
   blue card, and adds one symbol to each), as they do in the rules. Phyrexian
   symbols belong to their color. `X` costs are tallied apart from fixed costs.
   ------------------------------------------------------------------ */

// Chart and table column order. 'C' is colorless: no color of its own, but the
// thing a cost with no colored symbol is made of, so it gets a slot.
export const COLOR_KEYS = [...WUBRG, 'C'];

export const COLOR_NAMES = {
  W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless'
};

// The cost axis: every exact cost from 0 to 15, then X costs, then anything above.
export const MAX_NUMERIC_COST = 15;
export const COST_BUCKETS = [
  ...Array.from({ length: MAX_NUMERIC_COST + 1 }, (_, i) => String(i)),
  'X',
  'other'
];

export const bucketLabel = (bucket) => (bucket === 'other' ? 'Other' : bucket);

export function bucketDescription(bucket) {
  if (bucket === 'X') return 'X cost';
  if (bucket === 'other') return `cost above ${MAX_NUMERIC_COST}`;
  return `cost ${bucket}`;
}

/** Placeholder code for cards that belong to no set, as the catalog's set bar shows them. */
export const UNSET = '(unset)';
export const setCodeOf = (card) => card.set_symbol || UNSET;

/** Group cards by set, biggest set first (the catalog's set bar order). */
export function groupBySet(cards) {
  const byCode = {};
  for (const card of cards) {
    const code = setCodeOf(card);
    if (!byCode[code]) byCode[code] = [];
    byCode[code].push(card);
  }
  const codes = Object.keys(byCode).sort((a, b) => byCode[b].length - byCode[a].length);
  return { codes, byCode };
}

const isNumber = (text) => /^\d+$/.test(text);

/**
 * Read a `mana_cost` string such as "{2}{W}{U/B}".
 *
 * @returns {{
 *   hasCost: boolean,   at least one symbol is present ('' means no mana cost)
 *   hasX: boolean,      the cost contains X (or Y/Z)
 *   value: number,      mana value, with X counted as 0
 *   generic: number,    total generic mana, e.g. 3 for {3}{R}
 *   colors: string[],   colors in the cost, WUBRG order
 *   symbols: object,    per-color symbol count: { W, U, B, R, G, C }
 *   unknown: string[],  symbols (or stray text) that could not be read
 * }}
 */
export function analyzeManaCost(manaCost) {
  const text = typeof manaCost === 'string' ? manaCost : '';
  const tokens = text.match(/\{[^}]*\}/g) || [];
  const symbols = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const colors = new Set();
  const unknown = [];
  let generic = 0;
  let value = 0;
  let hasX = false;

  const stray = text.replace(/\{[^}]*\}/g, '').trim();
  if (stray) unknown.push(stray);

  for (const token of tokens) {
    const body = token.slice(1, -1).trim().toUpperCase();

    if (/^[XYZ]$/.test(body)) { hasX = true; continue; }
    if (isNumber(body)) { generic += Number(body); value += Number(body); continue; }
    if (body === 'C') { symbols.C += 1; value += 1; continue; }
    if (body === 'S') { generic += 1; value += 1; continue; } // snow is paid like generic mana

    // Colored, hybrid ({W/U}), Phyrexian ({W/P}) and two-brid ({2/W}) symbols.
    const parts = body.split('/');
    const readable = parts.every(p => WUBRG.includes(p) || p === 'P' || p === 'C' || isNumber(p));
    const hues = parts.filter(p => WUBRG.includes(p));
    if (!readable || hues.length === 0) { unknown.push(token); continue; }

    hues.forEach(hue => { symbols[hue] += 1; colors.add(hue); });
    const fixed = parts.filter(isNumber).map(Number);
    value += fixed.length ? Math.max(...fixed) : 1;
  }

  return {
    hasCost: tokens.length > 0,
    hasX,
    value,
    generic,
    colors: WUBRG.filter(color => colors.has(color)),
    symbols,
    unknown
  };
}

/** Which bar on the cost axis a cost belongs to: 0-15, X, or other. */
export function costBucket({ hasX, value }) {
  if (hasX) return 'X';
  return value <= MAX_NUMERIC_COST ? String(value) : 'other';
}

/** The colors a costed card counts toward. A card with no colored symbol is colorless. */
export const cardColors = (cost) => (cost.colors.length ? cost.colors : ['C']);

/**
 * Symbols a cost spends, per color.
 *
 * A card with no colored symbol is paid entirely in colorless/generic mana, so its
 * generic cost counts as colorless symbols. The {2} of {2}{W} does not: on a card
 * that has a color, generic mana is just "any mana".
 */
export function symbolCounts(cost) {
  const counts = { ...cost.symbols };
  if (cost.colors.length === 0) counts.C += cost.generic;
  return counts;
}

const emptyByColor = (make) => Object.fromEntries(COLOR_KEYS.map(key => [key, make()]));
const emptyCurve = () => emptyByColor(() => Object.fromEntries(COST_BUCKETS.map(b => [b, 0])));

/**
 * Tally a list of cards.
 *
 * - `curve.cards[color][bucket]`   cards of that color at that cost; a multicolor
 *                                  card counts once for each of its colors.
 * - `curve.symbols[color][bucket]` symbols of that color on cards at that cost.
 * - `combos[key]`                  cards using exactly that set of colors ('WU',
 *                                  'C' for colorless) and `none` for cards with no
 *                                  mana cost. Each card is in exactly one.
 * - `symbols[color]`               total symbols of that color; for every color this
 *                                  equals the sum of its `curve.symbols` bars.
 *
 * Cards with no mana cost have no cost and no symbols, so they are left out of
 * the curve and the symbol totals and only show up as `combos.none`.
 */
export function summarizeCards(cards) {
  const curve = { cards: emptyCurve(), symbols: emptyCurve() };
  const combos = { none: 0 };
  const symbols = emptyByColor(() => 0);
  let withCost = 0;

  for (const card of cards) {
    const cost = analyzeManaCost(card.mana_cost);
    if (!cost.hasCost) { combos.none += 1; continue; }

    withCost += 1;
    const bucket = costBucket(cost);
    const colors = cardColors(cost);

    colors.forEach(color => { curve.cards[color][bucket] += 1; });

    const counts = symbolCounts(cost);
    COLOR_KEYS.forEach(color => {
      curve.symbols[color][bucket] += counts[color];
      symbols[color] += counts[color];
    });

    const key = cost.colors.join('') || 'C';
    combos[key] = (combos[key] || 0) + 1;
  }

  return { total: cards.length, withCost, withoutCost: cards.length - withCost, curve, combos, symbols };
}

function combinations(items, size, start = 0) {
  if (size === 0) return [[]];
  const out = [];
  for (let i = start; i <= items.length - size; i++) {
    for (const rest of combinations(items, size - 1, i + 1)) out.push([items[i], ...rest]);
  }
  return out;
}

/** Every color combination a card can have: colorless, then 5 mono, 10 two-color, ... 1 five-color. */
export const COLOR_COMBOS = [
  { key: 'C', colors: [], size: 0 },
  ...[1, 2, 3, 4, 5].flatMap(size =>
    combinations(WUBRG, size).map(colors => ({ key: colors.join(''), colors, size }))
  )
];

export const COMBO_GROUP_LABELS = [
  'Colorless', 'One color', 'Two colors', 'Three colors', 'Four colors', 'Five colors'
];

export const isLand = (card) => /\bland\b/i.test(card.type_line || '');
export const isToken = (card) => /\btoken\b/i.test(card.type_line || '');

/**
 * Costs that deserve a second look.
 *
 * Custom cards are free to have no mana cost, but a cost that is simply missing
 * looks the same as one left out on purpose, so non-land cards without one are
 * flagged. Lands and tokens never have a cost and are not. `unreadable` lists
 * costs holding something other than mana symbols.
 */
export function findCostWarnings(cards) {
  const missing = [];
  const unreadable = [];
  for (const card of cards) {
    const cost = analyzeManaCost(card.mana_cost);
    if (cost.unknown.length) unreadable.push({ card, symbols: cost.unknown });
    else if (!cost.hasCost && !isLand(card) && !isToken(card)) missing.push(card);
  }
  return { missing, unreadable };
}

/**
 * Round a chart maximum up to a clean top tick and list the ticks to draw
 * (step, 2*step, ... top). Never less than 4, so a few cards don't fill a chart.
 */
export function niceScale(max, maxTicks = 5) {
  const target = Math.max(max, 4);
  for (let power = 1; ; power *= 10) {
    for (const multiple of [1, 2, 5]) {
      const step = multiple * power;
      const count = Math.ceil(target / step);
      if (count <= maxTicks) {
        return { top: count * step, ticks: Array.from({ length: count }, (_, i) => (i + 1) * step) };
      }
    }
  }
}
