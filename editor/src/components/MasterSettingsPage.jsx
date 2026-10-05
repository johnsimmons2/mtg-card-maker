import React, { useState } from 'react';
import { Save, Sparkles, Sliders, RefreshCw, Palette, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import {
  formatMtgText, deriveFrameColor, deriveBoxTint, deriveThemeColors,
  COLORS, PALE_COLORS, THEME_COLORS
} from '../utils/cardUtils';

const BASE_COLORS = [
  { id: 'pale', name: 'Colorless (Pale)' },
  { id: 'white', name: 'White (W)' },
  { id: 'blue', name: 'Blue (U)' },
  { id: 'black', name: 'Black (B)' },
  { id: 'red', name: 'Red (R)' },
  { id: 'green', name: 'Green (G)' },
  { id: 'artifact', name: 'Artifact' }
];

/* Shipped defaults, derived from cardUtils so this page can never drift from
   what the renderer actually uses. Previously these were hardcoded copies, so
   editing the palette in cardUtils left Reset restoring the old colours. */
const DEFAULT_PALETTE = {
  COLORS: { ...COLORS },
  PALE_COLORS: { ...PALE_COLORS },
  THEME_COLORS: JSON.parse(JSON.stringify(THEME_COLORS)),
  goldFrameStart: "#e4c96a",
  goldFrameEnd: "#c5a342",
  goldBoxStart: "#f7f2e1",
  goldBoxEnd: "#f0e6c8",
  goldThemeVibrant: "#e6cf83",
  goldThemeDark: "#6d5719"
};

const DEFAULT_LAND_RULES = [
  { keyword: "mountain", symbol: "{r}", color: "red" },
  { keyword: "forest", symbol: "{g}", color: "green" },
  { keyword: "swamp", symbol: "{b}", color: "black" },
  { keyword: "island", symbol: "{u}", color: "blue" },
  { keyword: "plains", symbol: "{w}", color: "white" }
];

const DEFAULT_SYMBOL_SETTINGS = {
  symbolVerticalAlign: 'middle',
  symbolSize: '0.95em',
  symbolSizeHeader: '0.95em',
  symbolSizeRules: '0.95em',
  symbolMarginLeft: '0.1em',
  symbolMarginRight: '0.1em',
  innerGlyphScale: '1.2',
  innerGlyphOffsetX: '0.01rem',
  innerGlyphOffsetY: '-0.03rem',
  innerGlyphScaleNumeric: '0.8',
  innerGlyphOffsetXNumeric: '0rem',
  innerGlyphOffsetYNumeric: '0rem'
};

export default function MasterSettingsPage({ globalSettings, onChange, onSave, onApply }) {
  const [activeTab, setActiveTab] = useState('symbols'); // 'symbols' | 'colors'
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [previewArchetype, setPreviewArchetype] = useState('gold');

  // Archetypes for sandbox rendering
  const ARCHETYPES = {
    white: { cost: '{W}{W}', type: 'Creature — Angel', name: 'Serra Angel', text: 'Flying, vigilance (Attacking doesn\'t cause this creature to tap.)' },
    blue: { cost: '{1}{U}{U}', type: 'Instant', name: 'Counterspell', text: 'Counter target spell.' },
    black: { cost: '{B}', type: 'Sorcery', name: 'Dark Ritual', text: 'Add {B}{B}{B} to your mana pool.' },
    red: { cost: '{R}', type: 'Creature — Goblin', name: 'Goblin Guide', text: 'Haste. Whenever this attacks, defending player reveals top card.' },
    green: { cost: '{G}', type: 'Creature — Elf', name: 'Llanowar Elves', text: '{T}: Add {G} to your mana pool.' },
    artifact: { cost: '{1}', type: 'Artifact', name: 'Sol Ring', text: '{T}: Add {C}{C} to your mana pool.' },
    gold: { cost: '{W}{U}{B}{R}{G}', type: 'Legendary Creature', name: 'Progenitus', text: 'Protection from everything. If Progenitus would be put into a graveyard, reveal it and shuffle.' }
  };

  // Setup defaults
  const settings = {
    ...DEFAULT_SYMBOL_SETTINGS,
    symbolSizeHeader: globalSettings?.symbolSizeHeader || globalSettings?.symbolSize || '0.95em',
    symbolSizeRules: globalSettings?.symbolSizeRules || globalSettings?.symbolSize || '0.95em',
    palette: DEFAULT_PALETTE,
    colorRules: { landRules: DEFAULT_LAND_RULES },
    ...globalSettings
  };

  const handleSliderChange = (key, val) => {
    const updated = { ...settings, [key]: val };
    onChange(updated);
    onApply(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/global-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (response.ok) {
        setMessage('Settings successfully saved to global_settings.json!');
        onSave(); // reload parent config
      } else {
        setMessage('Error: Failed to save configurations.');
      }
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const defaults = {
      ...DEFAULT_SYMBOL_SETTINGS,
      palette: DEFAULT_PALETTE,
      colorRules: { landRules: DEFAULT_LAND_RULES }
    };
    onChange(defaults);
    onApply(defaults);
  };

  const parseNum = (str, suffix) => {
    if (!str) return 0;
    return parseFloat(str.replace(suffix, '')) || 0;
  };

  // Color modification helper
  const handlePaletteColorChange = (group, key, val) => {
    const updatedPalette = {
      ...settings.palette,
      [group]: {
        ...settings.palette[group],
        [key]: val
      }
    };
    handleSliderChange('palette', updatedPalette);
  };

  // Gold colors helper
  const handleGoldColorChange = (key, val) => {
    const updatedPalette = {
      ...settings.palette,
      [key]: val
    };
    handleSliderChange('palette', updatedPalette);
  };

  // Land rules handlers
  const handleLandRuleChange = (index, field, val) => {
    const rules = [...settings.colorRules.landRules];
    rules[index] = { ...rules[index], [field]: val };
    handleSliderChange('colorRules', { ...settings.colorRules, landRules: rules });
  };

  const handleAddLandRule = () => {
    const rules = [...settings.colorRules.landRules, { keyword: "", symbol: "", color: "pale" }];
    handleSliderChange('colorRules', { ...settings.colorRules, landRules: rules });
  };

  const handleDeleteLandRule = (index) => {
    const rules = settings.colorRules.landRules.filter((_, i) => i !== index);
    handleSliderChange('colorRules', { ...settings.colorRules, landRules: rules });
  };

  const handleMoveLandRule = (index, direction) => {
    const rules = [...settings.colorRules.landRules];
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const temp = rules[index];
    rules[index] = rules[target];
    rules[target] = temp;
    handleSliderChange('colorRules', { ...settings.colorRules, landRules: rules });
  };

  // Compute sandbox colors dynamically based on dynamic palette and rules!
  const selectedArchetype = ARCHETYPES[previewArchetype] || ARCHETYPES.gold;
  const sandboxFrameColor = deriveFrameColor(selectedArchetype.cost, selectedArchetype.type, selectedArchetype.name, selectedArchetype.text, settings);
  const sandboxBoxTint = deriveBoxTint(selectedArchetype.cost, selectedArchetype.type, selectedArchetype.name, selectedArchetype.text, settings);
  const { vibrant: themeVibrant, dark: themeDark } = deriveThemeColors(selectedArchetype.cost, selectedArchetype.type, selectedArchetype.name, selectedArchetype.text, settings);

  return (
    <div className="panel animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 450px', gap: '2rem' }}>
      
      {/* Left Column: Sub-views (Tabs) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Sliders size={22} style={{ color: 'var(--border-focus)' }} />
              <span>Master Settings</span>
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Configure global symbol layouts and custom card frame color rules</p>
          </div>
          <button className="btn btn-secondary" onClick={handleReset} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', gap: '0.25rem' }}>
            <RefreshCw size={14} /> Reset Defaults
          </button>
        </div>

        {/* Tab Selection */}
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
          <button
            className={`btn ${activeTab === 'symbols' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.4rem 1.2rem', fontSize: '0.85rem', display: 'flex', gap: '0.25rem', alignItems: 'center', height: '36px' }}
            onClick={() => setActiveTab('symbols')}
          >
            <Sliders size={14} /> Symbols & Alignment
          </button>
          <button
            className={`btn ${activeTab === 'colors' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.4rem 1.2rem', fontSize: '0.85rem', display: 'flex', gap: '0.25rem', alignItems: 'center', height: '36px' }}
            onClick={() => setActiveTab('colors')}
          >
            <Palette size={14} /> Colors & Auto-rules
          </button>
        </div>

        {message && (
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            backgroundColor: message.includes('Error') ? 'rgba(218, 58, 53, 0.15)' : 'rgba(30, 110, 61, 0.15)',
            border: `1px solid ${message.includes('Error') ? 'var(--accent-red)' : 'var(--accent-green)'}`,
            color: message.includes('Error') ? 'var(--accent-red)' : '#8be9fd',
            fontSize: '0.9rem',
            fontWeight: '600'
          }}>
            {message}
          </div>
        )}

        {/* TAB 1: SYMBOLS */}
        {activeTab === 'symbols' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            
            {/* Section 1: Box Layout Spacing */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', color: 'var(--border-focus)', margin: 0 }}>
                Text Box Flow & Size
              </h3>

              <div className="form-group">
                <label className="form-label">Vertical Alignment</label>
                <select 
                  className="form-select"
                  value={settings.symbolVerticalAlign}
                  onChange={(e) => handleSliderChange('symbolVerticalAlign', e.target.value)}
                >
                  <option value="middle">Middle (Standard)</option>
                  <option value="baseline">Baseline</option>
                  <option value="sub">Subscript</option>
                  <option value="super">Superscript</option>
                  <option value="text-top">Text Top</option>
                  <option value="text-bottom">Text Bottom</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">
                  <span>Mana Cost Symbol Size ({settings.symbolSizeHeader})</span>
                </label>
                <input 
                  type="range" 
                  min="0.7" 
                  max="1.5" 
                  step="0.05"
                  value={parseNum(settings.symbolSizeHeader || settings.symbolSize, 'em')}
                  onChange={(e) => handleSliderChange('symbolSizeHeader', `${e.target.value}em`)}
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  <span>Rules Text Symbol Size ({settings.symbolSizeRules})</span>
                </label>
                <input 
                  type="range" 
                  min="0.7" 
                  max="1.5" 
                  step="0.05"
                  value={parseNum(settings.symbolSizeRules || settings.symbolSize, 'em')}
                  onChange={(e) => handleSliderChange('symbolSizeRules', `${e.target.value}em`)}
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  <span>Margin Left ({settings.symbolMarginLeft})</span>
                </label>
                <input 
                  type="range" 
                  min="-0.05" 
                  max="0.4" 
                  step="0.01"
                  value={parseNum(settings.symbolMarginLeft, 'em')}
                  onChange={(e) => handleSliderChange('symbolMarginLeft', `${e.target.value}em`)}
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  <span>Margin Right ({settings.symbolMarginRight})</span>
                </label>
                <input 
                  type="range" 
                  min="-0.05" 
                  max="0.4" 
                  step="0.01"
                  value={parseNum(settings.symbolMarginRight, 'em')}
                  onChange={(e) => handleSliderChange('symbolMarginRight', `${e.target.value}em`)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {/* Section 2: Glyph Inner Placement */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', color: 'var(--border-focus)', margin: 0 }}>
                Circle Inner Icon (Glyph)
              </h3>

              <div className="form-group">
                <label className="form-label">
                  <span>Inner Glyph Scale ({settings.innerGlyphScale})</span>
                </label>
                <input 
                  type="range" 
                  min="0.8" 
                  max="2.0" 
                  step="0.05"
                  value={parseFloat(settings.innerGlyphScale) || 1.2}
                  onChange={(e) => handleSliderChange('innerGlyphScale', `${e.target.value}`)}
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  <span>Inner X-Offset ({settings.innerGlyphOffsetX})</span>
                </label>
                <input 
                  type="range" 
                  min="-0.2" 
                  max="0.2" 
                  step="0.01"
                  value={parseNum(settings.innerGlyphOffsetX, 'rem')}
                  onChange={(e) => handleSliderChange('innerGlyphOffsetX', `${e.target.value}rem`)}
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  <span>Inner Y-Offset ({settings.innerGlyphOffsetY})</span>
                </label>
                <input 
                  type="range" 
                  min="-0.2" 
                  max="0.2" 
                  step="0.01"
                  value={parseNum(settings.innerGlyphOffsetY, 'rem')}
                  onChange={(e) => handleSliderChange('innerGlyphOffsetY', `${e.target.value}rem`)}
                  style={{ width: '100%' }}
                />
              </div>

              <h3 style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', color: 'var(--border-focus)', margin: '0.5rem 0 0' }}>
                Generic / Colourless (numerals)
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                Generic mana draws a numeral rather than a pictorial glyph, so it is tuned
                separately — the scale that makes a water drop fill its circle pushes a digit
                past the edge.
              </p>

              <div className="form-group">
                <label className="form-label">
                  <span>Numeral Scale ({settings.innerGlyphScaleNumeric})</span>
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1.4"
                  step="0.02"
                  value={parseFloat(settings.innerGlyphScaleNumeric) || 0.8}
                  onChange={(e) => handleSliderChange('innerGlyphScaleNumeric', `${e.target.value}`)}
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  <span>Numeral X-Offset ({settings.innerGlyphOffsetXNumeric})</span>
                </label>
                <input
                  type="range"
                  min="-0.2"
                  max="0.2"
                  step="0.01"
                  value={parseNum(settings.innerGlyphOffsetXNumeric, 'rem')}
                  onChange={(e) => handleSliderChange('innerGlyphOffsetXNumeric', `${e.target.value}rem`)}
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  <span>Numeral Y-Offset ({settings.innerGlyphOffsetYNumeric})</span>
                </label>
                <input
                  type="range"
                  min="-0.2"
                  max="0.2"
                  step="0.01"
                  value={parseNum(settings.innerGlyphOffsetYNumeric, 'rem')}
                  onChange={(e) => handleSliderChange('innerGlyphOffsetYNumeric', `${e.target.value}rem`)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: COLORS */}
        {activeTab === 'colors' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* Color Palette Grid */}
            <div>
              <h3 style={{ fontSize: '1.05rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', color: 'var(--border-focus)', margin: '0 0 1rem 0' }}>
                Archetype Color Palettes
              </h3>
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: '130px repeat(4, 1fr)',
                gap: '0.75rem',
                alignItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.02)',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)'
              }}>
                {/* Headers */}
                <strong style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Archetype</strong>
                <strong style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>Frame Border</strong>
                <strong style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>Box Tint</strong>
                <strong style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>Accent (Vibrant)</strong>
                <strong style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>Accent (Dark)</strong>

                {BASE_COLORS.map(c => {
                  const frameColor = settings.palette.COLORS[c.id] || '#ffffff';
                  const boxTint = settings.palette.PALE_COLORS[c.id] || '#ffffff';
                  const vibrant = settings.palette.THEME_COLORS[c.id]?.vibrant || '#ffffff';
                  const dark = settings.palette.THEME_COLORS[c.id]?.dark || '#000000';

                  return (
                    <React.Fragment key={c.id}>
                      <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>{c.name}</span>
                      
                      {/* Frame color */}
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <input 
                          type="color" 
                          value={frameColor} 
                          onChange={(e) => handlePaletteColorChange('COLORS', c.id, e.target.value)}
                          style={{ width: '40px', height: '28px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                        />
                      </div>

                      {/* Box Tint */}
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <input 
                          type="color" 
                          value={boxTint} 
                          onChange={(e) => handlePaletteColorChange('PALE_COLORS', c.id, e.target.value)}
                          style={{ width: '40px', height: '28px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                        />
                      </div>

                      {/* Vibrant Accent */}
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <input 
                          type="color" 
                          value={vibrant} 
                          onChange={(e) => {
                            const updatedTheme = { ...settings.palette.THEME_COLORS[c.id], vibrant: e.target.value };
                            handlePaletteColorChange('THEME_COLORS', c.id, updatedTheme);
                          }}
                          style={{ width: '40px', height: '28px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                        />
                      </div>

                      {/* Dark Accent */}
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <input 
                          type="color" 
                          value={dark} 
                          onChange={(e) => {
                            const updatedTheme = { ...settings.palette.THEME_COLORS[c.id], dark: e.target.value };
                            handlePaletteColorChange('THEME_COLORS', c.id, updatedTheme);
                          }}
                          style={{ width: '40px', height: '28px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                        />
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Gold (Multi-Color) Overrides */}
            <div>
              <h3 style={{ fontSize: '1.05rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', color: 'var(--border-focus)', margin: '0 0 1rem 0' }}>
                Multi-Color (Gold) Gradients
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Gold Frame Gradients</label>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '0.25rem' }}>
                    <input type="color" value={settings.palette.goldFrameStart || '#e4c96a'} onChange={(e) => handleGoldColorChange('goldFrameStart', e.target.value)} style={{ cursor: 'pointer' }} />
                    <input type="color" value={settings.palette.goldFrameEnd || '#c5a342'} onChange={(e) => handleGoldColorChange('goldFrameEnd', e.target.value)} style={{ cursor: 'pointer' }} />
                  </div>
                </div>

                <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Gold Box Tint Gradients</label>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '0.25rem' }}>
                    <input type="color" value={settings.palette.goldBoxStart || '#f7f2e1'} onChange={(e) => handleGoldColorChange('goldBoxStart', e.target.value)} style={{ cursor: 'pointer' }} />
                    <input type="color" value={settings.palette.goldBoxEnd || '#f0e6c8'} onChange={(e) => handleGoldColorChange('goldBoxEnd', e.target.value)} style={{ cursor: 'pointer' }} />
                  </div>
                </div>

                <div className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Gold Theme Accents (Vib / Dark)</label>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '0.25rem' }}>
                    <input type="color" value={settings.palette.goldThemeVibrant || DEFAULT_PALETTE.goldThemeVibrant} onChange={(e) => handleGoldColorChange('goldThemeVibrant', e.target.value)} style={{ cursor: 'pointer' }} />
                    <input type="color" value={settings.palette.goldThemeDark || DEFAULT_PALETTE.goldThemeDark} onChange={(e) => handleGoldColorChange('goldThemeDark', e.target.value)} style={{ cursor: 'pointer' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Land Auto-color Rules List */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.05rem', color: 'var(--border-focus)', margin: 0 }}>
                  Land Auto-Color Mappings (Precedence: Top-Down)
                </h3>
                <button 
                  className="btn btn-secondary" 
                  onClick={handleAddLandRule} 
                  style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', display: 'flex', gap: '0.25rem', alignItems: 'center' }}
                >
                  <Plus size={14} /> Add Rule
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {settings.colorRules.landRules.map((rule, idx) => (
                  <div 
                    key={idx} 
                    style={{ 
                      display: 'grid', 
                      gridTemplateColumns: '1fr 1fr 120px 70px 40px', 
                      gap: '0.5rem', 
                      alignItems: 'center', 
                      backgroundColor: 'rgba(255,255,255,0.02)', 
                      padding: '0.5rem', 
                      borderRadius: '6px', 
                      border: '1px solid var(--border-color)' 
                    }}
                  >
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Keyword (e.g. desert)" 
                      value={rule.keyword || ''} 
                      onChange={(e) => handleLandRuleChange(idx, 'keyword', e.target.value)}
                      style={{ height: '32px', fontSize: '0.85rem' }}
                    />
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Symbol (e.g. {c})" 
                      value={rule.symbol || ''} 
                      onChange={(e) => handleLandRuleChange(idx, 'symbol', e.target.value)}
                      style={{ height: '32px', fontSize: '0.85rem' }}
                    />
                    <select
                      className="form-select"
                      value={rule.color}
                      onChange={(e) => handleLandRuleChange(idx, 'color', e.target.value)}
                      style={{ height: '32px', fontSize: '0.85rem', padding: '0.25rem' }}
                    >
                      {BASE_COLORS.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>

                    {/* Precedence arrows */}
                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                      <button 
                        className="btn btn-secondary" 
                        disabled={idx === 0} 
                        onClick={() => handleMoveLandRule(idx, -1)}
                        style={{ padding: '0.25rem', height: '24px', width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button 
                        className="btn btn-secondary" 
                        disabled={idx === settings.colorRules.landRules.length - 1} 
                        onClick={() => handleMoveLandRule(idx, 1)}
                        style={{ padding: '0.25rem', height: '24px', width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>

                    {/* Delete button */}
                    <button 
                      className="btn btn-secondary"
                      onClick={() => handleDeleteLandRule(idx)}
                      style={{ padding: '0.25rem', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: 'var(--accent-red)' }}
                    >
                      <Trash2 size={14} style={{ color: 'var(--accent-red)' }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Global Save Trigger */}
        <button 
          className="btn btn-primary" 
          onClick={handleSave} 
          disabled={saving}
          style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-start', padding: '0.75rem 2rem', marginTop: '1rem' }}
        >
          {saving ? <div className="spinner" /> : <Save size={18} />}
          Save Global Settings
        </button>
      </div>

      {/* Right Column: Live Sandbox Preview */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: '#050811', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '1.5rem', boxShadow: 'var(--shadow-inset)' }}>
        <h3 style={{ fontSize: '1.1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
          <Sparkles size={16} style={{ color: 'var(--accent-gold)' }} />
          <span>Realtime Sandbox</span>
        </h3>
        
        {/* Archetype selector dropdown for sandbox preview */}
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Preview Archetype Layout</label>
          <select 
            className="form-select" 
            value={previewArchetype} 
            onChange={(e) => setPreviewArchetype(e.target.value)}
            style={{ height: '36px', fontSize: '0.85rem' }}
          >
            <option value="gold">Multi-Color (Gold)</option>
            <option value="white">White Archetype (W)</option>
            <option value="blue">Blue Archetype (U)</option>
            <option value="black">Black Archetype (B)</option>
            <option value="red">Red Archetype (R)</option>
            <option value="green">Green Archetype (G)</option>
            <option value="artifact">Artifact / Colorless</option>
          </select>
        </div>

        {/* Mock Title Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: sandboxBoxTint,
          border: '3px solid transparent',
          backgroundImage: `linear-gradient(${sandboxBoxTint}, ${sandboxBoxTint}), linear-gradient(115deg, ${themeVibrant}, ${themeVibrant})`,
          backgroundOrigin: 'padding-box, border-box',
          backgroundClip: 'padding-box, border-box',
          boxShadow: `0 0 0 1.5px ${themeDark}`,
          borderRadius: '16px',
          color: '#111',
          padding: '0.5rem 1rem',
          fontWeight: 'bold',
          fontFamily: 'var(--font-serif)',
          fontSize: '18px',
          marginTop: '0.5rem'
        }}>
          <span>{selectedArchetype.name}</span>
          <span 
            className="mana-cost" 
            style={{ display: 'flex', gap: '2px' }}
            dangerouslySetInnerHTML={{ __html: formatMtgText(selectedArchetype.cost) }} 
          />
        </div>

        {/* Mock Rules Text Area */}
        <div style={{
          background: sandboxBoxTint,
          border: '3px solid transparent',
          backgroundImage: `linear-gradient(${sandboxBoxTint}, ${sandboxBoxTint}), linear-gradient(115deg, ${themeVibrant}, ${themeVibrant})`,
          backgroundOrigin: 'padding-box, border-box',
          backgroundClip: 'padding-box, border-box',
          boxShadow: `0 0 0 1.5px ${themeDark}`,
          borderRadius: '8px',
          color: '#111',
          padding: '1rem',
          fontFamily: 'var(--font-serif)',
          fontSize: '15px',
          lineHeight: '1.4',
          minHeight: '120px'
        }}>
          <div className="rules-text" dangerouslySetInnerHTML={{ __html: formatMtgText(selectedArchetype.text) }} />
        </div>

        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          backgroundColor: 'rgba(57, 130, 246, 0.05)',
          border: '1px solid rgba(59, 130, 246, 0.15)',
          borderRadius: '8px',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          lineHeight: '1.3'
        }}>
          <strong>Note:</strong> Changes to dynamic frame colors and land auto-rules will reflect instantly in the card catalogue and editor preview once saved.
        </div>
      </div>

    </div>
  );
}
