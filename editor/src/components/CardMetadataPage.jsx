import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { formatMtgText, resolveSetStyle } from '../utils/cardUtils';
import {
  COLOR_COMBOS, COLOR_KEYS, COLOR_NAMES, COMBO_GROUP_LABELS, COST_BUCKETS, UNSET,
  bucketDescription, bucketLabel, findCostWarnings, groupBySet, niceScale, setCodeOf, summarizeCards
} from '../utils/cardMetadata';
import './CardMetadataPage.css';

/* Chart marks wear MTG's own colors so each panel reads at a glance, and a color
   keeps its hue whichever sets are switched on. White, black and colorless are
   achromatic by definition, so a panel never leans on hue alone: its title carries
   the mana symbol and name, every bar has a tooltip, and the cost chart has a table
   view. Checked against the panel surface (--bg-card, #1c1f26): every mark clears
   3:1 contrast and the normal-vision separation floor; the closest pair under
   protanopia is red against black (delta E 7.1). */
const SERIES_COLORS = {
  W: '#f3ead0', U: '#3a8ee6', B: '#86827c', R: '#e8564c', G: '#52c48a', C: '#a8bcd4'
};

const PLOT_HEIGHT = 160; // px, the height of the tallest possible bar

const COUNT_NOTES = {
  cards: 'Each card counts once for every color in its cost, so a {W}{U} card adds one to White and one to Blue at its cost. A cost with no colored symbol counts as Colorless.',
  symbols: 'Each colored mana symbol counts, so {W}{W}{U} adds two to White and one to Blue at its cost. Colorless counts {C} symbols plus the whole generic cost of a card with no colored symbol; the {2} in {2}{W} is not counted.'
};

const fmt = (n) => n.toLocaleString();
const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const manaOf = (colors) => colors.map(color => `{${color}}`).join('');

/** Text under a set's code in the tables: its name, or its code if the label hides it. */
function setSubtitle(code, setsConfig) {
  const def = setsConfig?.[code];
  const label = def?.label || code;
  if (def?.name && def.name !== label) return def.name;
  return code !== label ? code : '';
}

function Mana({ cost }) {
  return <span className="cm-mana" dangerouslySetInnerHTML={{ __html: formatMtgText(cost) }} />;
}

/** A set's code in its own styling, as the catalog's set bar shows it. */
function SetLabel({ code, setsConfig, size = '0.95rem' }) {
  if (code === UNSET) {
    return <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'none' }}>{UNSET}</span>;
  }
  const { label, style, hasGradient } = resolveSetStyle({ set_symbol: code, rarity: 'R' }, setsConfig);
  return (
    <span
      className={hasGradient ? 'set-symbol set-symbol-gradient' : 'set-symbol'}
      style={{ ...style, fontSize: size }}
    >{label}</span>
  );
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="cm-seg" role="group" aria-label={label}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >{option.label}</button>
      ))}
    </div>
  );
}

const Count = ({ value }) => <td className={value === 0 ? 'is-zero' : undefined}>{fmt(value)}</td>;

/** Rendered into <body> so a transformed or clipped ancestor can't displace it. */
function Tooltip({ tip }) {
  if (!tip) return null;
  return createPortal(
    <div className={`cm-tip${tip.below ? ' is-below' : ''}`} role="tooltip" style={{ left: tip.x, top: tip.y }}>
      <div className="cm-tip-value">{tip.value}</div>
      <div className="cm-tip-meta">
        <span className="cm-key" style={{ background: tip.color }} />
        {tip.text}
      </div>
    </div>,
    document.body
  );
}

/**
 * One color's cost curve. The chart is a single tab stop: the arrow keys walk the
 * bars and show the same tooltip a pointer does. Only the tallest bars carry a
 * number; the y axis, the tooltip and the table view hold the rest.
 */
function CostChart({ colorKey, counts, metric, scale, onTip }) {
  const colRefs = useRef([]);
  const [focused, setFocused] = useState(null);

  const values = COST_BUCKETS.map(bucket => counts[bucket]);
  const sum = values.reduce((a, b) => a + b, 0);
  const peak = Math.max(...values);
  const color = SERIES_COLORS[colorKey];
  const name = COLOR_NAMES[colorKey];
  const unit = metric === 'cards' ? 'card' : 'symbol';

  const barHeight = (n) => (n > 0 ? Math.max(2, Math.round((n / scale.top) * PLOT_HEIGHT)) : 0);
  const describe = (i) => ({
    value: plural(values[i], unit),
    text: `${name} · ${bucketDescription(COST_BUCKETS[i])}`
  });

  const reveal = (i) => {
    setFocused(i);
    // The peak bar's number sits just above it, so the tooltip must clear that too.
    const labeled = values[i] > 0 && values[i] === peak;
    onTip({
      ...describe(i),
      color,
      rect: colRefs.current[i].getBoundingClientRect(),
      markHeight: barHeight(values[i]) + (labeled ? 14 : 0)
    });
  };
  const clear = () => {
    setFocused(null);
    onTip(null);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') return clear();
    const last = values.length - 1;
    const next = {
      ArrowRight: focused == null ? 0 : Math.min(focused + 1, last),
      ArrowLeft: focused == null ? last : Math.max(focused - 1, 0),
      Home: 0,
      End: last
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    reveal(next);
  };

  return (
    <div
      className="cm-chart"
      role="group"
      tabIndex={0}
      aria-label={`${name}: ${unit}s by mana cost, ${fmt(sum)} in total. Use the arrow keys to move between costs.`}
      style={{ '--cm-plot-height': `${PLOT_HEIGHT}px` }}
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        // Keyboard focus starts on the tallest bar; a mouse click shouldn't pop a tooltip.
        if (e.target === e.currentTarget && e.currentTarget.matches(':focus-visible')) {
          reveal(Math.max(0, values.indexOf(peak)));
        }
      }}
      onBlur={clear}
    >
      <div className="cm-chart-head">
        <div className="cm-chart-title"><Mana cost={`{${colorKey}}`} />{name}</div>
        <div className="cm-chart-total">{plural(sum, unit)}</div>
      </div>

      <div className="cm-area">
        <span className="cm-tick cm-tick-zero">0</span>
        {scale.ticks.map(tick => (
          <div key={tick} className="cm-gridline" style={{ bottom: `${(tick / scale.top) * 100}%` }}>
            <span className="cm-tick">{fmt(tick)}</span>
          </div>
        ))}

        <div className="cm-bars">
          {COST_BUCKETS.map((bucket, i) => {
            const n = values[i];
            const height = barHeight(n);
            return (
              <React.Fragment key={bucket}>
                {bucket === 'X' && <div className="cm-sep" aria-hidden="true" />}
                <div
                  ref={(el) => { colRefs.current[i] = el; }}
                  className={`cm-col${focused === i ? ' is-focused' : ''}`}
                  onPointerEnter={() => reveal(i)}
                  onPointerLeave={clear}
                >
                  {n > 0 && <div className="cm-bar" style={{ height, background: color }} />}
                  {n > 0 && n === peak && <span className="cm-peak" style={{ bottom: height + 3 }}>{fmt(n)}</span>}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="cm-xaxis" aria-hidden="true">
        {COST_BUCKETS.map((bucket, i) => (
          <React.Fragment key={bucket}>
            {bucket === 'X' && <div />}
            <div className={`cm-xlabel${focused === i ? ' is-focused' : ''}`}>{bucketLabel(bucket)}</div>
          </React.Fragment>
        ))}
      </div>

      <span className="cm-sr" aria-live="polite">
        {focused == null ? '' : `${describe(focused).text}: ${describe(focused).value}`}
      </span>
    </div>
  );
}

/** The cost chart as numbers: the table twin of the six charts. */
function CostTable({ curve, metric }) {
  return (
    <div className="cm-table-wrap">
      <table className="cm-table cm-table-narrow">
        <caption className="cm-sr">{`Number of ${metric} at each mana cost, by color`}</caption>
        <thead>
          <tr>
            <th scope="col">Cost</th>
            {COLOR_KEYS.map(key => (
              <th key={key} scope="col"><Mana cost={`{${key}}`} />{COLOR_NAMES[key]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COST_BUCKETS.map(bucket => (
            <tr key={bucket}>
              <th scope="row">{bucketLabel(bucket)}</th>
              {COLOR_KEYS.map(key => <Count key={key} value={curve[key][bucket]} />)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            {COLOR_KEYS.map(key => (
              <td key={key}>{fmt(Object.values(curve[key]).reduce((a, b) => a + b, 0))}</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function CombosTable({ codes, perSet, total, setsConfig, hideEmpty }) {
  const span = codes.length + 2;
  const countFor = (summary, key) => summary.combos[key] || 0;

  const renderRow = (key, label, className) => {
    const sum = countFor(total, key);
    const classes = [className, sum === 0 ? 'is-empty' : ''].filter(Boolean).join(' ');
    return (
      <tr key={key} className={classes || undefined}>
        <th scope="row">{label}</th>
        {codes.map(code => <Count key={code} value={countFor(perSet[code], key)} />)}
        <td className="is-total">{fmt(sum)}</td>
      </tr>
    );
  };

  return (
    <div className="cm-table-wrap">
      <table className="cm-table">
        <caption className="cm-sr">Number of cards using each combination of colors, by set</caption>
        <thead>
          <tr>
            <th scope="col">Colors</th>
            {codes.map(code => (
              <th key={code} scope="col"><SetLabel code={code} setsConfig={setsConfig} size="0.9rem" /></th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {COMBO_GROUP_LABELS.map((label, size) => {
            const rows = COLOR_COMBOS
              .filter(combo => combo.size === size)
              .filter(combo => !hideEmpty || countFor(total, combo.key) > 0);
            if (rows.length === 0) return null;
            return (
              <React.Fragment key={label}>
                <tr className="cm-group"><th colSpan={span}>{label}</th></tr>
                {rows.map(combo => renderRow(combo.key, <Mana cost={combo.size === 0 ? '{C}' : manaOf(combo.colors)} />))}
              </React.Fragment>
            );
          })}
          {renderRow('none', 'No mana cost', 'cm-row-break')}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">All cards</th>
            {codes.map(code => <td key={code}>{fmt(perSet[code].total)}</td>)}
            <td>{fmt(total.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SymbolsTable({ codes, perSet, total, setsConfig }) {
  return (
    <div className="cm-table-wrap">
      <table className="cm-table">
        <caption className="cm-sr">Number of mana symbols of each color in mana costs, by set</caption>
        <thead>
          <tr>
            <th scope="col">Set</th>
            {COLOR_KEYS.map(key => (
              <th key={key} scope="col"><Mana cost={`{${key}}`} />{COLOR_NAMES[key]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {codes.map(code => {
            const subtitle = setSubtitle(code, setsConfig);
            return (
              <tr key={code}>
                <th scope="row">
                  <SetLabel code={code} setsConfig={setsConfig} />
                  {subtitle && <span className="cm-set-name">{subtitle}</span>}
                </th>
                {COLOR_KEYS.map(key => <Count key={key} value={perSet[code].symbols[key]} />)}
              </tr>
            );
          })}
        </tbody>
        {codes.length > 1 && (
          <tfoot>
            <tr>
              <th scope="row">All selected sets</th>
              {COLOR_KEYS.map(key => <td key={key}>{fmt(total.symbols[key])}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/**
 * Custom cards may have no mana cost on purpose, but a missing cost looks the same
 * as one left out by accident, so non-land cards without one are called out.
 */
function CostWarnings({ warnings, setsConfig, onOpenCard }) {
  const [open, setOpen] = useState(false);
  const { missing, unreadable } = warnings;
  const count = missing.length + unreadable.length;
  if (count === 0) return null;

  const row = (card, note) => (
    <li key={card.id}>
      <button type="button" className="cm-link" onClick={() => onOpenCard(card.id)} title="Open this card in the editor">
        {card.name || card.id}
      </button>
      <SetLabel code={setCodeOf(card)} setsConfig={setsConfig} size="0.85rem" />
      <span className="cm-meta">{note}</span>
    </li>
  );

  return (
    <div className="cm-warning">
      <AlertTriangle size={18} className="cm-warning-icon" aria-hidden="true" />
      <div>
        <h3>Check these mana costs</h3>
        {missing.length > 0 && (
          <p>
            {plural(missing.length, 'non-land card has', 'non-land cards have')} no mana cost in the selected sets.
            That is fine when it is deliberate, but it may be a cost that was left out by accident.
            Lands and tokens are never flagged.
          </p>
        )}
        {unreadable.length > 0 && (
          <p>
            {plural(unreadable.length, 'card has', 'cards have')} a mana cost with symbols this page cannot read.
            Those symbols are ignored in the counts.
          </p>
        )}
        <button type="button" className="cm-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {open ? 'Hide cards' : `Show ${plural(count, 'card')}`}
        </button>
        {open && (
          <ul className="cm-warning-list">
            {missing.map(card => row(card, card.type_line || 'No type line'))}
            {unreadable.map(({ card, symbols }) => row(card, `Unreadable: ${symbols.join(' ')}`))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Card Metadata: how expensive the cards are, which color combinations exist, and
 * how many symbols of each color the sets spend. One set filter scopes all three.
 *
 * `view` ({ hiddenSets, metric, costView }) is owned by App so the selection
 * survives switching to another page and back.
 */
export default function CardMetadataPage({ cards, setsConfig, view, onViewChange, onOpenCard }) {
  const { hiddenSets, metric, costView } = view;
  const patchView = (patch) => onViewChange({ ...view, ...patch });
  const [hideEmpty, setHideEmpty] = useState(false);
  const [tip, setTip] = useState(null);

  const { codes, byCode } = useMemo(() => groupBySet(cards), [cards]);
  const perSet = useMemo(
    () => Object.fromEntries(codes.map(code => [code, summarizeCards(byCode[code])])),
    [codes, byCode]
  );

  // Sets are tracked by what is switched *off*, so a set that appears later starts on.
  const hidden = useMemo(() => new Set(hiddenSets), [hiddenSets]);
  const selectedCodes = codes.filter(code => !hidden.has(code));
  const selectedCards = useMemo(() => cards.filter(card => !hidden.has(setCodeOf(card))), [cards, hidden]);
  const total = useMemo(() => summarizeCards(selectedCards), [selectedCards]);
  const warnings = useMemo(() => findCostWarnings(selectedCards), [selectedCards]);

  // One y scale for all six charts, so heights compare across colors.
  const scale = useMemo(() => {
    const curve = total.curve[metric];
    const peak = Math.max(0, ...COLOR_KEYS.flatMap(key => COST_BUCKETS.map(bucket => curve[key][bucket])));
    return niceScale(peak);
  }, [total, metric]);

  // A tooltip belongs to the data it was opened on.
  useEffect(() => { setTip(null); }, [metric, costView, hiddenSets]);

  const showTip = (info) => {
    if (!info) { setTip(null); return; }
    const { rect, markHeight, ...content } = info;
    const x = Math.min(Math.max(rect.left + rect.width / 2, 110), window.innerWidth - 110);
    const above = rect.bottom - markHeight - 10;
    // Near the top of the window, drop below the chart so the sticky header can't cover it.
    setTip(above < 130 ? { ...content, x, y: rect.bottom + 10, below: true } : { ...content, x, y: above });
  };

  const toggleSet = (code) => patchView({
    hiddenSets: hidden.has(code) ? hiddenSets.filter(c => c !== code) : [...hiddenSets, code]
  });
  const allOn = selectedCodes.length === codes.length;
  const chipStyle = { padding: '0.3rem 0.8rem', fontSize: '0.82rem' };

  return (
    <div className="cm-page">
      <div>
        <h2 style={{ fontSize: '1.5rem' }}>Card Metadata</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          How expensive the cards are to cast, which color combinations they use, and how much of each color the sets spend
        </p>
      </div>

      {/* One filter row above everything it scopes: every chart and table below follows it. */}
      <div className="filters-bar" style={{ marginBottom: 0, gap: '0.75rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
          <span className="cm-label">Sets</span>
          <button
            type="button"
            className={`btn ${allOn ? 'btn-primary' : 'btn-secondary'}`}
            style={chipStyle}
            onClick={() => patchView({ hiddenSets: [] })}
          >All cards ({cards.length})</button>
          <button
            type="button"
            className="btn btn-secondary"
            style={chipStyle}
            disabled={selectedCodes.length === 0}
            onClick={() => patchView({ hiddenSets: codes })}
          >None</button>
          {codes.map(code => {
            const on = !hidden.has(code);
            return (
              <button
                key={code}
                type="button"
                aria-pressed={on}
                className={`btn ${on ? 'btn-primary' : 'btn-secondary'}`}
                style={{ ...chipStyle, display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: on ? 1 : 0.65 }}
                onClick={() => toggleSet(code)}
                title={`${on ? 'Hide' : 'Show'} ${setsConfig?.[code]?.name || code}`}
              >
                <SetLabel code={code} setsConfig={setsConfig} />
                <span>{byCode[code].length}</span>
              </button>
            );
          })}
        </div>
        <div className="cm-scope">
          {selectedCodes.length === 0
            ? 'No sets selected'
            : `${plural(total.total, 'card')} in ${plural(selectedCodes.length, 'set')} · ${fmt(total.withCost)} with a mana cost · ${fmt(total.withoutCost)} without`}
        </div>
      </div>

      {selectedCodes.length === 0 ? (
        <div className="panel">
          <p className="cm-empty">No sets selected. Turn on at least one set above to see its metadata.</p>
        </div>
      ) : (
        <>
          <CostWarnings warnings={warnings} setsConfig={setsConfig} onOpenCard={onOpenCard} />

          <section className="panel" aria-labelledby="cm-cost-title">
            <div className="cm-section-head">
              <div>
                <h3 id="cm-cost-title" className="cm-section-title">Mana cost by color</h3>
                <p className="cm-section-note" dangerouslySetInnerHTML={{ __html: formatMtgText(COUNT_NOTES[metric]) }} />
              </div>
              <div className="cm-controls">
                <Segmented
                  label="What to count"
                  value={metric}
                  onChange={(value) => patchView({ metric: value })}
                  options={[
                    { value: 'cards', label: 'Cards', title: 'Count cards: a multicolor card counts once for each of its colors' },
                    { value: 'symbols', label: 'Symbols', title: 'Count colored mana symbols' }
                  ]}
                />
                <Segmented
                  label="How to show it"
                  value={costView}
                  onChange={(value) => patchView({ costView: value })}
                  options={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]}
                />
              </div>
            </div>

            {costView === 'chart' ? (
              <div className="cm-charts">
                {COLOR_KEYS.map(key => (
                  <CostChart key={key} colorKey={key} counts={total.curve[metric][key]} metric={metric} scale={scale} onTip={showTip} />
                ))}
              </div>
            ) : (
              <CostTable curve={total.curve[metric]} metric={metric} />
            )}

            <p className="cm-section-note">
              X is every cost containing X, and Other is any other cost above 15. Cards with no mana cost have no cost to chart and are left out.
            </p>
          </section>

          <section className="panel" aria-labelledby="cm-combos-title">
            <div className="cm-section-head">
              <div>
                <h3 id="cm-combos-title" className="cm-section-title">Color combinations</h3>
                <p
                  className="cm-section-note"
                  dangerouslySetInnerHTML={{ __html: formatMtgText('How many cards use each exact set of colors. A card counts once however many symbols it has, so {W}{U} and {W}{W}{W}{W}{U} are two {W}{U} cards. A hybrid symbol counts for both of its colors, and colorless means a cost with no colored symbol.') }}
                />
              </div>
              <label className="cm-check">
                <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
                Hide empty combinations
              </label>
            </div>
            <CombosTable codes={selectedCodes} perSet={perSet} total={total} setsConfig={setsConfig} hideEmpty={hideEmpty} />
          </section>

          <section className="panel" aria-labelledby="cm-symbols-title">
            <div>
              <h3 id="cm-symbols-title" className="cm-section-title">Color symbols per set</h3>
              <p
                className="cm-section-note"
                style={{ marginTop: '0.3rem' }}
                dangerouslySetInnerHTML={{ __html: formatMtgText('Every colored symbol in the mana costs: {U/W} adds one to White and one to Blue. Colorless counts {C} symbols plus the generic cost of cards with no colored symbol, so the {2} in {2}{W} is not counted. Symbols in rules text are not counted.') }}
              />
            </div>
            <SymbolsTable codes={selectedCodes} perSet={perSet} total={total} setsConfig={setsConfig} />
          </section>
        </>
      )}

      <Tooltip tip={tip} />
    </div>
  );
}
