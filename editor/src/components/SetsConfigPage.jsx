import React, { useState, useMemo } from 'react';
import { Save, Plus, Trash2, RefreshCw, Type, Palette } from 'lucide-react';
import { resolveSetStyle, getRarityColor, RARITY_TIERS, RARITY_LABELS } from '../utils/cardUtils';

/* A set definition controls the text printed in the set-symbol slot and how it
   is styled, so every card sharing a set code gets a consistent look from one
   place. Cards reference a set by their `set_symbol` field. */

const NEW_SET_TEMPLATE = {
  name: 'New Set',
  label: 'NEW',
  fontSize: 30,
  fontWeight: 700,
  useRarityColor: true,
  gradient: [],
  gradientAngle: 90
};

// Ready-made ramps, so a new set can look distinctive without colour-picking.
const GRADIENT_PRESETS = {
  'Rainbow': ['#ff2f2f', '#ff9a00', '#ffe600', '#38d430', '#2f8fff', '#a44cff'],
  'Gold foil': ['#f7e08a', '#c9a227', '#f7e08a'],
  'Sunset': ['#ff8f3c', '#ff3c78', '#8a2be2'],
  'Ocean': ['#7ce8ff', '#2f8fff', '#0b3a70'],
  'Toxic': ['#c8ff3c', '#39d353', '#00806b'],
  'Ember': ['#ffd43c', '#ff6a00', '#8c1414'],
  'Chrome': ['#ffffff', '#9aa7b4', '#e8eef4', '#5b6773']
};

// Symbol style fields a rarity tier may override.
const STYLE_KEYS = [
  'label', 'color', 'gradient', 'gradientAngle', 'fontFamily', 'googleFont',
  'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'textTransform',
  'outlineColor', 'outlineWidth', 'glowColor', 'glowRadius', 'useRarityColor'
];

// The rarity ladder printed Magic uses: flat black at common, then silver,
// gold and an orange-red mythic. A one-click starting point for a new set.
const CLASSIC_RARITY_RAMPS = {
  C: { gradient: [], color: '#151515', outlineWidth: 0, glowRadius: 0, useRarityColor: false },
  U: { gradient: ['#e8eef4', '#8fa3b3', '#c8d4dd'], gradientAngle: 100, outlineColor: '#3b4650', outlineWidth: 0.8, glowRadius: 0, useRarityColor: false },
  R: { gradient: ['#f9e9a0', '#c9a227', '#f7e08a'], gradientAngle: 100, outlineColor: '#5b4610', outlineWidth: 0.9, glowColor: '#ffe9a8', glowRadius: 1.5, useRarityColor: false },
  M: { gradient: ['#ffb43c', '#e8621f', '#a81f10'], gradientAngle: 100, outlineColor: '#4a1408', outlineWidth: 1, glowColor: '#ffb43c', glowRadius: 2, useRarityColor: false }
};

// Template-preset fields a set can override for every card it contains.
// Blank means "inherit from the template preset".
const CARD_DEFAULT_FIELDS = [
  { key: 'artHeight', label: 'Art height (px)' },
  { key: 'nameFontSize', label: 'Name size (max, px)' },
  { key: 'typeFontSize', label: 'Type size (max, px)' },
  { key: 'rulesFontSize', label: 'Rules size (max, px)' },
  { key: 'rulesPadding', label: 'Rules padding (px)' },
  { key: 'frameBorderWidth', label: 'Frame border (px)', step: 0.5 },
  { key: 'titleBoxHeight', label: 'Title bar height (px)' },
  { key: 'typeBoxHeight', label: 'Type bar height (px)' },
  { key: 'footerFontSize', label: 'Footer size (px)' }
];

// Display faces that suit a short set code. Loaded on demand from Google Fonts.
const FONT_PRESETS = [
  { label: 'Default (card title face)', family: '', google: '' },
  { label: 'Bangers — comic', family: "'Bangers', 'Impact', sans-serif", google: 'Bangers' },
  { label: 'Cinzel — classical', family: "'Cinzel', Georgia, serif", google: 'Cinzel' },
  { label: 'Orbitron — sci-fi', family: "'Orbitron', sans-serif", google: 'Orbitron' },
  { label: 'Press Start 2P — pixel', family: "'Press Start 2P', monospace", google: 'Press Start 2P' },
  { label: 'Pirata One — blackletter', family: "'Pirata One', serif", google: 'Pirata One' },
  { label: 'Righteous — bold deco', family: "'Righteous', sans-serif", google: 'Righteous' },
  { label: 'Creepster — horror', family: "'Creepster', cursive", google: 'Creepster' },
  { label: 'Monoton — retro neon', family: "'Monoton', cursive", google: 'Monoton' }
];

export default function SetsConfigPage({ setsConfig, cards, onSave, backgrounds = [], showToast = () => {}}) {
  const [config, setConfig] = useState(() => JSON.parse(JSON.stringify(setsConfig || {})));
  const [activeCode, setActiveCode] = useState(() => Object.keys(setsConfig || {})[0] || null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [section, setSection] = useState('symbol'); // 'symbol' | 'appearance' | 'rules'
  // null = editing the set's base style; 'C'|'U'|'R'|'M' = that rarity tier.
  const [editingRarity, setEditingRarity] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const codes = Object.keys(config);
  const active = activeCode ? config[activeCode] : null;

  /* --- Style editing target -------------------------------------------
     Symbol controls edit either the set's base style or one rarity tier.
     Reads show the EFFECTIVE value (tier value if overridden, else the base)
     so the controls always reflect what will actually print; writes go to
     whichever target is selected. */
  const tierOverride = editingRarity ? (active?.rarityStyles?.[editingRarity] || {}) : null;
  const isTier = Boolean(editingRarity);
  const tierEnabled = isTier && Boolean(active?.rarityStyles?.[editingRarity]);

  // Effective value for a style field under the current editing target.
  const sv = (key) => {
    if (isTier && tierOverride[key] !== undefined) return tierOverride[key];
    return active?.[key];
  };

  // Write a style patch to the base set or to the active rarity tier.
  const updateStyle = (patch) => {
    if (!isTier) return update(patch);
    setConfig(prev => {
      const set = prev[activeCode];
      return {
        ...prev,
        [activeCode]: {
          ...set,
          rarityStyles: {
            ...(set.rarityStyles || {}),
            [editingRarity]: { ...(set.rarityStyles?.[editingRarity] || {}), ...patch }
          }
        }
      };
    });
  };

  // Start a tier off as a copy of the base so edits have a sensible starting point.
  const enableTier = (code) => {
    setConfig(prev => {
      const set = prev[activeCode];
      const seed = {};
      STYLE_KEYS.forEach(k => { if (set[k] !== undefined) seed[k] = set[k]; });
      return {
        ...prev,
        [activeCode]: { ...set, rarityStyles: { ...(set.rarityStyles || {}), [code]: seed } }
      };
    });
  };

  const clearTier = (code) => {
    setConfig(prev => {
      const set = prev[activeCode];
      const next = { ...(set.rarityStyles || {}) };
      delete next[code];
      return { ...prev, [activeCode]: { ...set, rarityStyles: next } };
    });
  };

  // One click to the classic Magic rarity ladder: black, silver, gold, orange-red.
  const applyClassicRarityRamps = () => {
    setConfig(prev => ({
      ...prev,
      [activeCode]: { ...prev[activeCode], rarityStyles: JSON.parse(JSON.stringify(CLASSIC_RARITY_RAMPS)) }
    }));
    setEditingRarity('M');
  };

  // Nested updaters for the cardDefaults / rules sub-objects.
  const updateCardDefault = (key, value) => {
    setConfig(prev => ({
      ...prev,
      [activeCode]: {
        ...prev[activeCode],
        cardDefaults: { ...(prev[activeCode].cardDefaults || {}), [key]: value }
      }
    }));
  };

  const updateRule = (key, value) => {
    setConfig(prev => ({
      ...prev,
      [activeCode]: {
        ...prev[activeCode],
        rules: { ...(prev[activeCode].rules || {}), [key]: value }
      }
    }));
  };

  // How many cards actually carry each set code — the basis for set insights.
  const usage = useMemo(() => {
    const counts = {};
    (cards || []).forEach(c => {
      const code = c.set_symbol || '(unset)';
      counts[code] = (counts[code] || 0) + 1;
    });
    return counts;
  }, [cards]);

  const update = (patch) => {
    setConfig(prev => ({ ...prev, [activeCode]: { ...prev[activeCode], ...patch } }));
  };

  const addSet = () => {
    let code = 'SET';
    let n = 1;
    while (config[code]) code = `SET${n++}`;
    setConfig(prev => ({ ...prev, [code]: { ...NEW_SET_TEMPLATE, label: code } }));
    setActiveCode(code);
  };

  const deleteSet = (code) => {
    const inUse = usage[code] || 0;
    // Two-step instead of window.confirm(), which a per-site dialog block turns
    // into an automatic "no", making the delete button look inert.
    if (pendingDelete !== code) {
      setPendingDelete(code);
      showToast('info',
        inUse
          ? `Click delete again to remove "${code}" — ${inUse} card${inUse === 1 ? '' : 's'} will fall back to plain text styling.`
          : `Click delete again to remove "${code}".`,
        6000);
      window.setTimeout(() => setPendingDelete(null), 6000);
      return;
    }
    setPendingDelete(null);
    setConfig(prev => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
    if (activeCode === code) setActiveCode(Object.keys(config).filter(c => c !== code)[0] || null);
  };

  // Renaming the key is how a set code changes; card `set_symbol` values must be
  // updated separately, so warn rather than silently orphaning cards.
  const renameCode = (nextCode) => {
    const trimmed = (nextCode || '').trim();
    if (!trimmed || trimmed === activeCode) return;
    if (config[trimmed]) {
      setMessage(`A set with code "${trimmed}" already exists.`);
      return;
    }
    setConfig(prev => {
      const next = {};
      // Preserve insertion order so the list does not jump around on rename.
      Object.entries(prev).forEach(([k, v]) => { next[k === activeCode ? trimmed : k] = v; });
      return next;
    });
    setActiveCode(trimmed);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await onSave(config);
      setMessage('Saved to sets_config.json');
    } catch (err) {
      setMessage(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const gradient = Array.isArray(sv('gradient')) ? sv('gradient') : [];

  const setGradientStop = (i, value) => {
    const next = [...gradient];
    next[i] = value;
    updateStyle({ gradient: next });
  };

  // Live preview uses the exact same resolver the card renderer uses, so what
  // is shown here is what gets printed.
  const previewFor = (rarity) => {
    if (!active) return null;
    const fake = { set_symbol: activeCode, rarity };
    const { label, style, hasGradient } = resolveSetStyle(fake, config);
    return (
      <div key={rarity} style={{ textAlign: 'center' }}>
        <div
          className={hasGradient ? 'set-symbol set-symbol-gradient' : 'set-symbol'}
          style={{ ...style, fontSize: `${(active.fontSize || 30) * 1.5}px` }}
        >
          {label}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>{rarity}</div>
      </div>
    );
  };

  return (
    <div className="panel animate-fade-in" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <Palette size={20} style={{ color: 'var(--border-focus)' }} /> Set Styles
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            A card joins a set through its <code>set_symbol</code> field. Everything below controls
            how that code is printed on every card in the set.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw size={16} className="spinner" /> : <Save size={16} />}
          &nbsp;Save Sets
        </button>
      </div>

      {message && (
        <div style={{
          padding: '0.6rem 0.9rem', marginBottom: '1rem', borderRadius: '6px',
          background: 'var(--bg-input)', color: 'var(--text-secondary)', fontSize: '0.85rem'
        }}>{message}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Set list */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span className="form-label" style={{ margin: 0 }}>Sets</span>
            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem' }} onClick={addSet}>
              <Plus size={14} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {codes.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No sets defined yet.</div>
            )}
            {codes.map(code => {
              const def = config[code];
              const { label, style, hasGradient } = resolveSetStyle({ set_symbol: code, rarity: 'R' }, config);
              return (
                <div
                  key={code}
                  onClick={() => setActiveCode(code)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
                    padding: '0.5rem 0.65rem', borderRadius: '6px', cursor: 'pointer',
                    background: code === activeCode ? 'var(--bg-card-hover)' : 'var(--bg-card)',
                    border: `1px solid ${code === activeCode ? 'var(--border-focus)' : 'var(--border-color)'}`
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      className={hasGradient ? 'set-symbol set-symbol-gradient' : 'set-symbol'}
                      style={{ ...style, fontSize: '1.1rem' }}
                    >{label}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {def.name || code} · {usage[code] || 0} card{(usage[code] || 0) === 1 ? '' : 's'}
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.2rem 0.4rem' }}
                    onClick={(e) => { e.stopPropagation(); deleteSet(code); }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>

          {usage['(unset)'] > 0 && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {usage['(unset)']} card(s) have no <code>set_symbol</code>.
            </div>
          )}
        </div>

        {/* Editor */}
        {!active ? (
          <div style={{ color: 'var(--text-muted)' }}>Select a set, or add one to begin.</div>
        ) : (
          <div>
            {/* Live preview */}
            <div style={{
              display: 'flex', gap: '2rem', alignItems: 'center', justifyContent: 'center',
              padding: '1.25rem', marginBottom: '1.25rem', borderRadius: '8px',
              background: 'linear-gradient(#f4f2ea, #e9e6db)',
              border: '1px solid var(--border-color)'
            }}>
              {['C', 'U', 'R', 'M'].map(previewFor)}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              {[
                ['symbol', 'Set Symbol'],
                ['appearance', 'Card Appearance'],
                ['rules', 'Set Rules']
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={`btn ${section === key ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.35rem 0.9rem', fontSize: '0.82rem' }}
                  onClick={() => setSection(key)}
                >{label}</button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Set code (cards reference this)</label>
                <input
                  className="form-input"
                  defaultValue={activeCode}
                  key={activeCode}
                  onBlur={(e) => renameCode(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Set name (editor only)</label>
                <input
                  className="form-input"
                  value={active.name || ''}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </div>
            </div>

            {section === 'symbol' && (
            <>
            {/* Which style is being edited: the set's base, or one rarity tier. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
              padding: '0.7rem 0.85rem', marginBottom: '1rem', borderRadius: '8px',
              background: 'var(--bg-card)', border: '1px solid var(--border-color)'
            }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Editing
              </span>
              <button
                className={`btn ${!editingRarity ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.28rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => setEditingRarity(null)}
              >Base style</button>
              {RARITY_TIERS.map(code => {
                const overridden = Boolean(active.rarityStyles?.[code]);
                return (
                  <button
                    key={code}
                    className={`btn ${editingRarity === code ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.28rem 0.75rem', fontSize: '0.8rem', opacity: overridden || editingRarity === code ? 1 : 0.6 }}
                    onClick={() => setEditingRarity(code)}
                    title={overridden ? `${RARITY_LABELS[code]} — overridden` : `${RARITY_LABELS[code]} — inheriting base`}
                  >
                    {code}{overridden ? ' ●' : ''}
                  </button>
                );
              })}
              <button
                className="btn btn-secondary"
                style={{ padding: '0.28rem 0.75rem', fontSize: '0.8rem', marginLeft: 'auto' }}
                onClick={applyClassicRarityRamps}
                title="Black / silver / gold / orange-red, as printed Magic uses"
              >Apply classic rarity ramps</button>
            </div>

            {isTier && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                padding: '0.7rem 0.85rem', marginBottom: '1rem', borderRadius: '8px',
                background: 'var(--bg-input)', border: '1px solid var(--border-color)'
              }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {tierEnabled
                    ? <>Editing the <strong>{RARITY_LABELS[editingRarity]}</strong> tier. Cards of other rarities are unaffected.</>
                    : <><strong>{RARITY_LABELS[editingRarity]}</strong> currently inherits the base style.</>}
                </div>
                {tierEnabled ? (
                  <button className="btn btn-secondary" style={{ padding: '0.28rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                    onClick={() => clearTier(editingRarity)}>
                    <Trash2 size={13} />&nbsp;Reset to base
                  </button>
                ) : (
                  <button className="btn btn-primary" style={{ padding: '0.28rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                    onClick={() => enableTier(editingRarity)}>
                    <Plus size={13} />&nbsp;Override this rarity
                  </button>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', opacity: isTier && !tierEnabled ? 0.45 : 1, pointerEvents: isTier && !tierEnabled ? 'none' : 'auto' }}>
              <div className="form-group">
                <label className="form-label">Printed text</label>
                <input
                  className="form-input"
                  value={sv('label') || ''}
                  onChange={(e) => updateStyle({ label: e.target.value })}
                  placeholder={activeCode}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Font</label>
                <select
                  className="form-select"
                  value={sv('fontFamily') || ''}
                  onChange={(e) => {
                    const p = FONT_PRESETS.find(f => f.family === e.target.value);
                    updateStyle({ fontFamily: e.target.value, googleFont: p ? p.google : '' });
                  }}
                >
                  {FONT_PRESETS.map(f => <option key={f.label} value={f.family}>{f.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Font size ({sv('fontSize') || 30}px)</label>
                <input
                  type="range" min="14" max="52" step="1"
                  value={sv('fontSize') || 30}
                  onChange={(e) => updateStyle({ fontSize: parseInt(e.target.value, 10) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Letter spacing</label>
                <input
                  className="form-input"
                  value={sv('letterSpacing') || ''}
                  onChange={(e) => updateStyle({ letterSpacing: e.target.value })}
                  placeholder="e.g. 0.05em"
                />
              </div>
            </div>

            {/* Colour */}
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '1rem 0 0.6rem' }}>
              <Type size={16} /> Colour
            </h3>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={sv('useRarityColor') !== false && gradient.length < 2 && !sv('color')}
                  onChange={(e) => updateStyle({ useRarityColor: e.target.checked, gradient: [], color: '' })}
                />
                Tint by rarity (the standard Magic behaviour)
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Solid colour</label>
                <input
                  type="color"
                  className="form-input"
                  value={sv('color') || '#c5a342'}
                  onChange={(e) => updateStyle({ color: e.target.value, useRarityColor: false, gradient: [] })}
                  style={{ height: '38px', padding: '2px' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Gradient preset</label>
                <select
                  className="form-select"
                  value=""
                  onChange={(e) => {
                    const stops = GRADIENT_PRESETS[e.target.value];
                    if (stops) updateStyle({ gradient: [...stops], useRarityColor: false, color: '' });
                  }}
                >
                  <option value="">Choose a ramp…</option>
                  {Object.keys(GRADIENT_PRESETS).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
            </div>

            {gradient.length > 0 && (
              <div className="form-group">
                <label className="form-label">
                  Gradient stops — angle {sv('gradientAngle') ?? 90}°
                </label>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {gradient.map((c, i) => (
                    <input
                      key={i}
                      type="color"
                      value={c}
                      onChange={(e) => setGradientStop(i, e.target.value)}
                      style={{ width: '42px', height: '32px', padding: '2px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                    />
                  ))}
                  <button
                    className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem' }}
                    onClick={() => updateStyle({ gradient: [...gradient, '#ffffff'] })}
                  ><Plus size={13} /></button>
                  <button
                    className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem' }}
                    onClick={() => updateStyle({ gradient: gradient.slice(0, -1) })}
                    disabled={gradient.length === 0}
                  ><Trash2 size={13} /></button>
                </div>
                <input
                  type="range" min="0" max="360" step="5"
                  value={sv('gradientAngle') ?? 90}
                  onChange={(e) => updateStyle({ gradientAngle: parseInt(e.target.value, 10) })}
                  style={{ marginTop: '0.6rem', width: '100%' }}
                />
              </div>
            )}

            {/* Effects */}
            <h3 style={{ margin: '1rem 0 0.6rem' }}>Effects</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Outline colour</label>
                <input
                  type="color" className="form-input" style={{ height: '38px', padding: '2px' }}
                  value={sv('outlineColor') || '#14141c'}
                  onChange={(e) => updateStyle({ outlineColor: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Outline width ({sv('outlineWidth') || 0}px)</label>
                <input
                  type="range" min="0" max="4" step="0.1"
                  value={sv('outlineWidth') || 0}
                  onChange={(e) => updateStyle({ outlineWidth: parseFloat(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Glow colour</label>
                <input
                  type="color" className="form-input" style={{ height: '38px', padding: '2px' }}
                  value={sv('glowColor') || '#ffffff'}
                  onChange={(e) => updateStyle({ glowColor: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Glow radius ({sv('glowRadius') || 0}px)</label>
                <input
                  type="range" min="0" max="12" step="0.5"
                  value={sv('glowRadius') || 0}
                  onChange={(e) => updateStyle({ glowRadius: parseFloat(e.target.value) })}
                />
              </div>
            </div>
            </>
            )}

            {/* ---------------- Card appearance ---------------- */}
            {section === 'appearance' && (
            <div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Set-wide look for every card in <strong>{activeCode}</strong>. These sit on top of the
                template preset, and a card's own settings still win — so per-card art position,
                images and backgrounds are preserved. Leave a field blank to inherit the template.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Default template for this set</label>
                  <select
                    className="form-select"
                    value={active.template || ''}
                    onChange={(e) => update({ template: e.target.value })}
                  >
                    <option value="">(none — use each card's own)</option>
                    <option value="modern">Modern</option>
                    <option value="retro">Retro</option>
                    <option value="borderless">Borderless</option>
                    <option value="glass">Glass</option>
                  </select>
                </div>
                {CARD_DEFAULT_FIELDS.map(f => (
                  <div className="form-group" key={f.key}>
                    <label className="form-label">{f.label}</label>
                    <input
                      className="form-input"
                      type="number"
                      step={f.step || 1}
                      value={active.cardDefaults?.[f.key] ?? ''}
                      placeholder="inherit"
                      onChange={(e) => updateCardDefault(f.key, e.target.value === '' ? '' : parseFloat(e.target.value))}
                    />
                  </div>
                ))}
                <div className="form-group">
                  <label className="form-label">Watermark image (in cards/art/)</label>
                  <input
                    className="form-input"
                    value={active.cardDefaults?.watermark_path ?? ''}
                    placeholder="e.g. jba_logo.png"
                    onChange={(e) => updateCardDefault('watermark_path', e.target.value)}
                  />
                </div>

                {/* Security stamp acorn colour. Blank = inherit each card's
                    rarity colour (the standard behaviour); a fixed colour makes
                    every card in the set print the same acorn (e.g. gold). */}
                <div className="form-group">
                  <label className="form-label">Security stamp acorn colour</label>
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <label style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={!active.cardDefaults?.stampAcornColor}
                        onChange={(e) => updateCardDefault('stampAcornColor', e.target.checked ? '' : (active.cardDefaults?.stampAcornColor || '#c5a342'))}
                      />
                      Inherit rarity colour
                    </label>
                    {active.cardDefaults?.stampAcornColor && (
                      <input
                        type="color"
                        className="form-input"
                        style={{ height: '38px', padding: '2px', maxWidth: '80px' }}
                        value={active.cardDefaults.stampAcornColor}
                        onChange={(e) => updateCardDefault('stampAcornColor', e.target.value)}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* ---------------- Set rules ---------------- */}
            {section === 'rules' && (
            <div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Policies that apply to a whole class of cards in <strong>{activeCode}</strong>,
                rather than defaults a single card overrides.
              </p>

              <div className="form-group">
                <label className="form-label">Multicolour cards use</label>
                <select
                  className="form-select"
                  value={active.rules?.multicolorFrame || 'auto'}
                  onChange={(e) => updateRule('multicolorFrame', e.target.value)}
                >
                  <option value="auto">Auto — two colours blend, three or more go gold</option>
                  <option value="gold">Gold — any multicolour card, like printed Magic</option>
                  <option value="gradient">Gradient — blend all of the card's colours</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Frame texture pool ({(active.rules?.backgroundPool || []).length} selected)
                </label>
                <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>
                  Cards in this set with no background of their own are assigned one of these,
                  chosen from the card's id so it stays the same between renders.
                </p>
                {backgrounds.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    No images in <code>cards/art/backgrounds/</code> yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {backgrounds.map(bg => {
                      const pool = active.rules?.backgroundPool || [];
                      const on = pool.includes(bg);
                      return (
                        <button
                          key={bg}
                          onClick={() => updateRule('backgroundPool', on ? pool.filter(x => x !== bg) : [...pool, bg])}
                          title={bg}
                          style={{
                            width: '84px', height: '84px', padding: 0, cursor: 'pointer',
                            borderRadius: '6px', overflow: 'hidden',
                            border: `2px solid ${on ? 'var(--border-focus)' : 'var(--border-color)'}`,
                            opacity: on ? 1 : 0.5,
                            background: `center/cover no-repeat url(/api/images/backgrounds/${encodeURIComponent(bg)})`
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
