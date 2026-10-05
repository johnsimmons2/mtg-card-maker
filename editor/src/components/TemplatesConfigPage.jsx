import React, { useState, useEffect } from 'react';
import { Save, Layers, RefreshCw, Eye, Plus, Trash2, Copy, Anchor, Palette } from 'lucide-react';
import CardPreview from './CardPreview';

const DEFAULT_TEMPLATE_IDS = ['modern', 'retro', 'borderless', 'glass'];

// Every template carries a multicolour policy — how a card with two or more
// colours in its cost is framed. Shared defaults, spread into each base below.
const MULTICOLOR_DEFAULTS = {
  multicolorFrame: 'auto',
  multicolorGradientAngle: 115,
  multicolorCapThreshold: 3,
  multicolorCapColors: ['#6d5dd3', '#3a86ff'],
  multicolorSolidColor: ''
};

const BASE_DEFAULTS = {
  modern: {
    name: 'Modern Classic',
    baseType: 'modern',
    artHeight: 440,
    rulesPadding: 24,
    frameBorderWidth: 18,
    nameFontSize: 36,
    rulesFontSize: 26,
    titleBoxHeight: 60,
    titleBoxWidth: 100,
    typeBoxHeight: 60,
    typeBoxWidth: 100,
    showStamp: true,
    stampOffsetY: -21,
    footerFontSize: 10,
    footerTextColor: '#e6e6e6',
    ...MULTICOLOR_DEFAULTS,
    // Modern archetype knobs
    cornerRadius: 16,
    panelGap: 8,
    bevelStrength: 1
  },
  retro: {
    name: 'Retro Vintage',
    baseType: 'retro',
    artHeight: 380,
    rulesPadding: 16,
    frameBorderWidth: 3,
    nameFontSize: 32,
    rulesFontSize: 24,
    titleBoxHeight: 52,
    titleBoxWidth: 100,
    typeBoxHeight: 46,
    typeBoxWidth: 100,
    showStamp: false,
    footerFontSize: 10,
    footerTextColor: '#111111',
    ...MULTICOLOR_DEFAULTS,
    // Retro archetype knobs
    forceSolid: false,
    cornerRadius: 12,
    retroBorderInk: '#111111',
    retroPlateTop: '#f2edd9',
    retroPlateBottom: '#c3baa5'
  },
  borderless: {
    name: 'Borderless Full-Bleed',
    baseType: 'borderless',
    artHeight: 500,
    rulesPadding: 24,
    frameBorderWidth: 10,
    nameFontSize: 36,
    rulesFontSize: 26,
    titleBoxHeight: 60,
    titleBoxWidth: 100,
    typeBoxHeight: 54,
    typeBoxWidth: 100,
    showStamp: false,
    footerFontSize: 10,
    footerTextColor: '#e6e6e6',
    ...MULTICOLOR_DEFAULTS,
    // Borderless archetype knobs
    overlayGradientOpacity: 0.6,
    cornerRadius: 12,
    borderlessPanelOpacity: 0.7,
    borderlessPanelBlur: 8,
    borderlessShowFrame: true
  },
  glass: {
    name: 'Glassmorphism',
    baseType: 'glass',
    artHeight: 440,
    rulesPadding: 24,
    frameBorderWidth: 2.5,
    nameFontSize: 36,
    rulesFontSize: 24,
    titleBoxHeight: 60,
    titleBoxWidth: 100,
    typeBoxHeight: 52,
    typeBoxWidth: 100,
    showStamp: false,
    footerFontSize: 10,
    footerTextColor: '#e6e6e6',
    ...MULTICOLOR_DEFAULTS,
    // Glass archetype knobs
    neonGlowIntensity: 1.0,
    glassTintOpacity: 0.45,
    glassPanelBlur: 20,
    showOrbs: true,
    neonColorOverride: ''
  }
};

// The four base layouts other templates inherit from. Shown with an anchor
// icon in the tab strip and a badge in the editor header.
const BASE_TEMPLATE_META = {
  modern: 'The official M15 look — printed colour moulding, recessed panels.',
  retro: 'The 1997 card face — heavy black keylines on parchment.',
  borderless: 'Full-bleed art with floating glass panels for the text.',
  glass: 'Sleek dark UI with neon edge lighting and glow orbs.'
};

export default function TemplatesConfigPage({ templatesConfig, onChange, onSave, cards, showToast = () => {}}) {
  const [activeTemplateId, setActiveTemplateId] = useState('modern');
  const [pendingDeleteTemplate, setPendingDeleteTemplate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [sampleCardId, setSampleCardId] = useState(cards?.[0]?.id || '');
  const [artList, setArtList] = useState([]);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateId, setNewTemplateId] = useState('');
  const [newTemplateBaseType, setNewTemplateBaseType] = useState('modern');
  const [newTemplateSource, setNewTemplateSource] = useState('');

  // The app header is `position: sticky; top: 0`, so the sticky preview column
  // has to be offset by its height (which changes as the nav wraps) to sit
  // just below it rather than tucking underneath.
  const [headerOffset, setHeaderOffset] = useState(88);
  useEffect(() => {
    const header = document.querySelector('.app-header');
    if (!header) return;
    const measure = () => setHeaderOffset(header.getBoundingClientRect().height + 16);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  // Fetch illustrations on mount for watermarking
  useEffect(() => {
    fetchArtFiles();
  }, []);

  const fetchArtFiles = async () => {
    try {
      const response = await fetch('/api/art');
      const data = await response.json();
      if (Array.isArray(data)) {
        setArtList(data);
      }
    } catch (err) {
      console.error('Error fetching art list:', err);
    }
  };

  const activeConfig = templatesConfig?.[activeTemplateId] || {};
  const baseType = activeConfig.baseType || (DEFAULT_TEMPLATE_IDS.includes(activeTemplateId) ? activeTemplateId : 'modern');

  // Compute active preset combining base layout defaults and overrides
  const activePreset = {
    ...(BASE_DEFAULTS[baseType] || BASE_DEFAULTS.modern),
    name: DEFAULT_TEMPLATE_IDS.includes(activeTemplateId) 
      ? BASE_DEFAULTS[activeTemplateId].name 
      : (activeConfig.name || activeTemplateId),
    baseType: baseType,
    ...activeConfig
  };

  const handleFieldChange = (key, val) => {
    const updatedPreset = { ...activePreset, [key]: val };
    const updatedConfig = {
      ...templatesConfig,
      [activeTemplateId]: updatedPreset
    };
    onChange(updatedConfig);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/templates-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templatesConfig)
      });
      if (response.ok) {
        setMessage('Template presets successfully saved to templates_config.json!');
        onSave(); // reload parent config
      } else {
        setMessage('Error: Failed to save template presets.');
      }
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetTemplate = () => {
    const baseline = BASE_DEFAULTS[activePreset.baseType || 'modern'];
    const updatedConfig = {
      ...templatesConfig,
      [activeTemplateId]: {
        ...baseline,
        name: activePreset.name || activeTemplateId,
        baseType: activePreset.baseType || 'modern'
      }
    };
    onChange(updatedConfig);
  };

  const handleNameChange = (name) => {
    setNewTemplateName(name);
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, '')
      .replace(/\s+/g, '_');
    setNewTemplateId(slug);
  };

  const handleCreateTemplate = () => {
    if (!newTemplateId.trim() || !newTemplateName.trim()) return;

    if (templatesConfig[newTemplateId]) {
      showToast('error', `A template with ID "${newTemplateId}" already exists — choose a unique ID.`);
      return;
    }

    const baseline = newTemplateSource 
      ? (templatesConfig[newTemplateSource] || BASE_DEFAULTS[newTemplateBaseType])
      : BASE_DEFAULTS[newTemplateBaseType];

    const newPreset = {
      ...baseline,
      name: newTemplateName,
      baseType: newTemplateBaseType
    };

    const updatedConfig = {
      ...templatesConfig,
      [newTemplateId]: newPreset
    };

    onChange(updatedConfig);
    setActiveTemplateId(newTemplateId);
    setShowAddModal(false);
    
    // Clear inputs
    setNewTemplateName('');
    setNewTemplateId('');
    setNewTemplateBaseType('modern');
    setNewTemplateSource('');
    
    setMessage('New template draft created! Click "Save Style Presets" to persist changes.');
  };

  const handleDeleteTemplate = (id) => {
    if (DEFAULT_TEMPLATE_IDS.includes(id)) {
      showToast('error', 'Cannot delete default system templates.');
      return;
    }

    // Two-step instead of confirm(), which a per-site dialog block turns into an
    // automatic "no", making the delete button appear to do nothing.
    if (pendingDeleteTemplate !== id) {
      setPendingDeleteTemplate(id);
      showToast('info', `Click delete again to remove the "${templatesConfig[id]?.name || id}" template.`, 6000);
      window.setTimeout(() => setPendingDeleteTemplate(null), 6000);
      return;
    }
    setPendingDeleteTemplate(null);

    const updatedConfig = { ...templatesConfig };
    delete updatedConfig[id];

    onChange(updatedConfig);
    setActiveTemplateId('modern');
    setMessage('Template deleted! Click "Save Style Presets" to finalize.');
  };

  const previewCard = cards.find(c => c.id === sampleCardId) || cards?.[0];

  return (
    <div className="panel animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 500px', gap: '2.5rem' }}>
      
      {/* Left Column: Editor Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Layers size={22} style={{ color: 'var(--border-focus)' }} />
              <span>Template Styles</span>
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
              Configure custom card frame bounds, typography defaults, watermarks, stamps, and footers.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={handleResetTemplate} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', gap: '0.25rem' }}>
            <RefreshCw size={14} /> Reset Preset
          </button>
        </div>

        {/* Template Selector Tabs with Add Template Action */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem', alignItems: 'center' }}>
          {Object.keys(templatesConfig || {}).map((id) => {
            const name = templatesConfig[id]?.name || {
              modern: 'Modern Classic',
              retro: 'Retro Vintage',
              borderless: 'Borderless Full-Bleed',
              glass: 'Glassmorphism'
            }[id] || id;

            const isBase = DEFAULT_TEMPLATE_IDS.includes(id);

            return (
              <button
                key={id}
                title={isBase ? `Base style — new templates can inherit from this.\n${BASE_TEMPLATE_META[id] || ''}` : undefined}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTemplateId === id ? '2px solid var(--border-focus)' : '2px solid transparent',
                  color: activeTemplateId === id ? 'var(--text-primary)' : 'var(--text-muted)',
                  padding: '0.5rem 0.75rem',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}
                onClick={() => setActiveTemplateId(id)}
              >
                {isBase && <Anchor size={13} style={{ color: 'var(--border-focus)', flexShrink: 0 }} />}
                <span>{name}</span>
              </button>
            );
          })}
          
          <button
            style={{
              background: 'rgba(57, 130, 246, 0.15)',
              border: '1.5px dashed rgba(57, 130, 246, 0.4)',
              borderRadius: '6px',
              color: 'var(--border-focus)',
              padding: '0.25rem 0.75rem',
              fontWeight: '600',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              marginLeft: 'auto',
              whiteSpace: 'nowrap'
            }}
            onClick={() => {
              setNewTemplateName('');
              setNewTemplateId('');
              setNewTemplateBaseType('modern');
              setNewTemplateSource('');
              setShowAddModal(true);
            }}
          >
            <Plus size={14} /> Add Template
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWeight: '450px' }}>
          
          {/* Section: Template Basic Metadata */}
          <h3 style={{ fontSize: '1.05rem', color: 'var(--border-focus)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', margin: 0 }}>
            Template Info & Base Type
          </h3>

          {DEFAULT_TEMPLATE_IDS.includes(activeTemplateId) ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.6rem 0.85rem', borderRadius: '8px',
              background: 'rgba(57, 130, 246, 0.1)', border: '1px solid rgba(57, 130, 246, 0.3)',
              fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.35
            }}>
              <Anchor size={16} style={{ color: 'var(--border-focus)', flexShrink: 0 }} />
              <span>
                <strong style={{ color: 'var(--text-primary)' }}>Base style.</strong>{' '}
                {BASE_TEMPLATE_META[activeTemplateId]} New templates can inherit these settings
                via <em>Add Template → Clone Styles From</em>; its layout type is locked.
              </span>
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Custom template based on the{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {BASE_DEFAULTS[baseType]?.name || baseType}
              </strong>{' '}base layout.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Template Display Name</label>
              <input 
                type="text" 
                className="form-input" 
                value={activePreset.name || activeTemplateId} 
                onChange={(e) => handleFieldChange('name', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Base Layout Type</label>
              <select 
                className="form-select"
                value={activePreset.baseType || activeTemplateId}
                onChange={(e) => handleFieldChange('baseType', e.target.value)}
                disabled={DEFAULT_TEMPLATE_IDS.includes(activeTemplateId)}
              >
                <option value="modern">Modern Classic</option>
                <option value="retro">Retro Vintage</option>
                <option value="borderless">Borderless Full-Bleed</option>
                <option value="glass">Glassmorphism</option>
              </select>
            </div>
          </div>

          {/* Section: Dimensions & Layout Bounds */}
          <h3 style={{ fontSize: '1.05rem', color: 'var(--border-focus)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', marginTop: '0.5rem', margin: 0 }}>
            Card Layout Bounds
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">
                <span>Title Box Height ({activePreset.titleBoxHeight || 60}px)</span>
              </label>
              <input 
                type="range" 
                min="30" 
                max="100" 
                step="1"
                value={activePreset.titleBoxHeight || 60} 
                onChange={(e) => handleFieldChange('titleBoxHeight', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span>Title Box Width ({activePreset.titleBoxWidth || 100}%)</span>
              </label>
              <input 
                type="range" 
                min="50" 
                max="100" 
                step="1"
                value={activePreset.titleBoxWidth || 100} 
                onChange={(e) => handleFieldChange('titleBoxWidth', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">
                <span>Type Box Height ({activePreset.typeBoxHeight || 60}px)</span>
              </label>
              <input 
                type="range" 
                min="30" 
                max="100" 
                step="1"
                value={activePreset.typeBoxHeight || 60} 
                onChange={(e) => handleFieldChange('typeBoxHeight', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span>Type Box Width ({activePreset.typeBoxWidth || 100}%)</span>
              </label>
              <input 
                type="range" 
                min="50" 
                max="100" 
                step="1"
                value={activePreset.typeBoxWidth || 100} 
                onChange={(e) => handleFieldChange('typeBoxWidth', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">
                <span>Default Art Box Height ({activePreset.artHeight}px)</span>
              </label>
              <input 
                type="range" 
                min="200" 
                max="600" 
                step="10"
                value={activePreset.artHeight} 
                onChange={(e) => handleFieldChange('artHeight', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span>Rules Box Padding ({activePreset.rulesPadding}px)</span>
              </label>
              <input 
                type="range" 
                min="8" 
                max="48" 
                step="1"
                value={activePreset.rulesPadding} 
                onChange={(e) => handleFieldChange('rulesPadding', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              <span>Frame Border Thickness ({activePreset.frameBorderWidth}px)</span>
            </label>
            <input 
              type="range" 
              min="1" 
              max="20" 
              step="0.5"
              value={activePreset.frameBorderWidth} 
              onChange={(e) => handleFieldChange('frameBorderWidth', parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          {/* Section: Typography Defaults */}
          <h3 style={{ fontSize: '1.05rem', color: 'var(--border-focus)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', marginTop: '0.5rem', margin: 0 }}>
            Typography Defaults
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">
                <span>Title Font Size ({activePreset.nameFontSize}px)</span>
              </label>
              <input 
                type="range" 
                min="14" 
                max="48" 
                step="1"
                value={activePreset.nameFontSize} 
                onChange={(e) => handleFieldChange('nameFontSize', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span>Rules Font Size ({activePreset.rulesFontSize}px)</span>
              </label>
              <input 
                type="range" 
                min="10" 
                max="40" 
                step="1"
                value={activePreset.rulesFontSize} 
                onChange={(e) => handleFieldChange('rulesFontSize', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Section: Watermarks, Stamp & Footer */}
          <h3 style={{ fontSize: '1.05rem', color: 'var(--border-focus)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', marginTop: '0.5rem', margin: 0 }}>
            Watermarks, Stamps & Footer
          </h3>

          <div className="form-group">
            <label className="form-label">Default Watermark File</label>
            <select 
              className="form-select"
              value={activePreset.watermark_path || ''}
              onChange={(e) => handleFieldChange('watermark_path', e.target.value)}
            >
              <option value="">-- None --</option>
              {artList.map((file) => (
                <option key={file} value={file}>{file}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Default Set Symbol Text</label>
              <input 
                type="text" 
                className="form-input" 
                value={activePreset.setSymbol !== undefined ? activePreset.setSymbol : 'M'} 
                onChange={(e) => handleFieldChange('setSymbol', e.target.value)}
                placeholder="e.g. M"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Set Symbol Color</label>
              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                <input 
                  type="color" 
                  value={activePreset.setSymbolColor || '#c5a342'} 
                  onChange={(e) => handleFieldChange('setSymbolColor', e.target.value)}
                  style={{ width: '36px', height: '36px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
                <input 
                  type="text" 
                  className="form-input" 
                  value={activePreset.setSymbolColor || ''} 
                  onChange={(e) => handleFieldChange('setSymbolColor', e.target.value)}
                  placeholder="Auto (Rarity)"
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem', padding: '0.25rem 0.4rem', height: '36px' }}
                />
              </div>
            </div>
          </div>

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label className="switch-container" onClick={() => handleFieldChange('showStamp', activePreset.showStamp !== false ? false : true)}>
              <div className={`switch-control ${activePreset.showStamp !== false ? 'switch-active' : ''}`} />
              <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Show Security Acorn Stamp</span>
            </label>
          </div>

          {activePreset.showStamp !== false && (
            <div className="form-group">
              <label className="form-label">
                <span>Stamp Vertical Offset ({activePreset.stampOffsetY !== undefined ? activePreset.stampOffsetY : -21}px)</span>
              </label>
              <input 
                type="range" 
                min="-50" 
                max="20" 
                step="1"
                value={activePreset.stampOffsetY !== undefined ? activePreset.stampOffsetY : -21} 
                onChange={(e) => handleFieldChange('stampOffsetY', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">
                <span>Footer Font Size ({activePreset.footerFontSize || 10}px)</span>
              </label>
              <input 
                type="range" 
                min="6" 
                max="18" 
                step="1"
                value={activePreset.footerFontSize || 10} 
                onChange={(e) => handleFieldChange('footerFontSize', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Footer Text Color</label>
              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                <input 
                  type="color" 
                  value={activePreset.footerTextColor || '#e6e6e6'} 
                  onChange={(e) => handleFieldChange('footerTextColor', e.target.value)}
                  style={{ width: '36px', height: '36px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
                <input 
                  type="text" 
                  className="form-input" 
                  value={activePreset.footerTextColor || '#e6e6e6'} 
                  onChange={(e) => handleFieldChange('footerTextColor', e.target.value)}
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem', padding: '0.25rem 0.4rem', height: '36px' }}
                />
              </div>
            </div>
          </div>

          {/* Section: Multicolour Frame Treatment */}
          <h3 style={{ fontSize: '1.05rem', color: 'var(--border-focus)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', marginTop: '0.5rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Palette size={16} /> Multicolour Frame Treatment
          </h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '-0.4rem 0 0' }}>
            How a card with two or more colours in its cost is framed. Colourless
            (<code>{'{C}'}</code> / generic) never counts. A set can still override this from its own rules.
          </p>

          <div className="form-group">
            <label className="form-label">Mode</label>
            <select
              className="form-select"
              value={activePreset.multicolorFrame || 'auto'}
              onChange={(e) => handleFieldChange('multicolorFrame', e.target.value)}
            >
              <option value="auto">Auto — two colours blend, three or more go gold</option>
              <option value="blend">Full gradient — blend every colour on the card</option>
              <option value="blend-capped">Capped gradient — blend all, but collapse to two custom colours past a threshold</option>
              <option value="solid">Solid — one flat colour for any multicolour card</option>
            </select>
          </div>

          {(activePreset.multicolorFrame || 'auto') !== 'solid' && (
            <div className="form-group">
              <label className="form-label">
                <span>Gradient Angle ({activePreset.multicolorGradientAngle ?? 115}°)</span>
              </label>
              <input
                type="range"
                min="0"
                max="360"
                step="5"
                value={activePreset.multicolorGradientAngle ?? 115}
                onChange={(e) => handleFieldChange('multicolorGradientAngle', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Direction of every blended multicolour gradient — the frame, the title/text boxes and the frame bevels. 0° = left→right, 90° = bottom→top.
              </span>
            </div>
          )}

          {activePreset.multicolorFrame === 'blend-capped' && (
            <>
              <div className="form-group">
                <label className="form-label">
                  <span>Collapse when colours exceed ({activePreset.multicolorCapThreshold || 3})</span>
                </label>
                <input
                  type="range"
                  min="2"
                  max="5"
                  step="1"
                  value={activePreset.multicolorCapThreshold || 3}
                  onChange={(e) => handleFieldChange('multicolorCapThreshold', parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Cards with more colours than this use the two custom colours below instead of a busy multi-stop blend.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {[0, 1].map((idx) => {
                  const arr = Array.isArray(activePreset.multicolorCapColors) ? activePreset.multicolorCapColors : ['#6d5dd3', '#3a86ff'];
                  const val = arr[idx] || (idx === 0 ? '#6d5dd3' : '#3a86ff');
                  const setVal = (next) => {
                    const copy = [arr[0] || '#6d5dd3', arr[1] || '#3a86ff'];
                    copy[idx] = next;
                    handleFieldChange('multicolorCapColors', copy);
                  };
                  return (
                    <div className="form-group" key={idx}>
                      <label className="form-label">Cap colour {idx + 1}</label>
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        <input type="color" value={val} onChange={(e) => setVal(e.target.value)}
                          style={{ width: '36px', height: '36px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                        <input type="text" className="form-input" value={val} onChange={(e) => setVal(e.target.value)}
                          style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem', padding: '0.25rem 0.4rem', height: '36px' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activePreset.multicolorFrame === 'solid' && (
            <div className="form-group">
              <label className="form-label">Solid frame colour</label>
              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                <input type="color" value={activePreset.multicolorSolidColor || '#c5a342'}
                  onChange={(e) => handleFieldChange('multicolorSolidColor', e.target.value)}
                  style={{ width: '36px', height: '36px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                <input type="text" className="form-input" value={activePreset.multicolorSolidColor || ''}
                  onChange={(e) => handleFieldChange('multicolorSolidColor', e.target.value)}
                  placeholder="Blank = palette gold"
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem', padding: '0.25rem 0.4rem', height: '36px' }} />
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Leave blank to use the shared gold frame, like printed Magic.
              </span>
            </div>
          )}

          {/* Section: Specific Archetype Settings */}
          <h3 style={{ fontSize: '1.05rem', color: 'var(--border-focus)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', marginTop: '0.5rem', margin: 0 }}>
            {BASE_DEFAULTS[activePreset.baseType]?.name || 'Archetype'} Settings
          </h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '-0.4rem 0 0' }}>
            Controls that only exist on the <strong>{BASE_DEFAULTS[activePreset.baseType]?.name || activePreset.baseType}</strong> layout.
          </p>

          {activePreset.baseType === 'modern' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label"><span>Frame Corner Radius ({activePreset.cornerRadius ?? 16}px)</span></label>
                  <input type="range" min="0" max="41" step="1"
                    value={activePreset.cornerRadius ?? 16}
                    onChange={(e) => handleFieldChange('cornerRadius', parseInt(e.target.value))}
                    style={{ width: '100%' }} />
                </div>
                <div className="form-group">
                  <label className="form-label"><span>Panel Gap ({activePreset.panelGap ?? 8}px)</span></label>
                  <input type="range" min="0" max="20" step="1"
                    value={activePreset.panelGap ?? 8}
                    onChange={(e) => handleFieldChange('panelGap', parseInt(e.target.value))}
                    style={{ width: '100%' }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hairline of frame colour showing between the title, art, type and text panels.</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label"><span>Bevel Strength ({Math.round((activePreset.bevelStrength ?? 1) * 100)}%)</span></label>
                <input type="range" min="0" max="2" step="0.05"
                  value={activePreset.bevelStrength ?? 1}
                  onChange={(e) => handleFieldChange('bevelStrength', parseFloat(e.target.value))}
                  style={{ width: '100%' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Contrast of the highlight / shadow relief on the coloured moulding.</span>
              </div>
            </>
          )}

          {activePreset.baseType === 'retro' && (
            <>
              <div className="form-group">
                <label className="switch-container" onClick={() => handleFieldChange('forceSolid', !activePreset.forceSolid)}>
                  <div className={`switch-control ${activePreset.forceSolid ? 'switch-active' : ''}`} />
                  <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Force Solid Colours on Gold / Hybrid Cards</span>
                </label>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Replaces dual HSL gradients with solid parchment layouts for an authentic old-school look.</span>
              </div>

              <div className="form-group">
                <label className="form-label"><span>Frame Corner Radius ({activePreset.cornerRadius ?? 12}px)</span></label>
                <input type="range" min="0" max="30" step="1"
                  value={activePreset.cornerRadius ?? 12}
                  onChange={(e) => handleFieldChange('cornerRadius', parseInt(e.target.value))}
                  style={{ width: '100%' }} />
              </div>

              <div className="form-group">
                <label className="form-label">Keyline Ink Colour</label>
                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                  <input type="color" value={activePreset.retroBorderInk || '#111111'}
                    onChange={(e) => handleFieldChange('retroBorderInk', e.target.value)}
                    style={{ width: '36px', height: '36px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                  <input type="text" className="form-input" value={activePreset.retroBorderInk || '#111111'}
                    onChange={(e) => handleFieldChange('retroBorderInk', e.target.value)}
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem', padding: '0.25rem 0.4rem', height: '36px' }} />
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>The heavy black lines around the frame, art window and text boxes.</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {[
                  { key: 'retroPlateTop', label: 'Name/Type Plate — top', fallback: '#f2edd9' },
                  { key: 'retroPlateBottom', label: 'Name/Type Plate — bottom', fallback: '#c3baa5' }
                ].map(({ key, label, fallback }) => (
                  <div className="form-group" key={key}>
                    <label className="form-label">{label}</label>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <input type="color" value={activePreset[key] || fallback}
                        onChange={(e) => handleFieldChange(key, e.target.value)}
                        style={{ width: '36px', height: '36px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                      <input type="text" className="form-input" value={activePreset[key] || fallback}
                        onChange={(e) => handleFieldChange(key, e.target.value)}
                        style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem', padding: '0.25rem 0.4rem', height: '36px' }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activePreset.baseType === 'borderless' && (
            <>
              <div className="form-group">
                <label className="form-label"><span>Art Scrim Opacity ({Math.round((activePreset.overlayGradientOpacity ?? 0.6) * 100)}%)</span></label>
                <input type="range" min="0" max="1" step="0.05"
                  value={activePreset.overlayGradientOpacity ?? 0.6}
                  onChange={(e) => handleFieldChange('overlayGradientOpacity', parseFloat(e.target.value))}
                  style={{ width: '100%' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Darkening gradient over the full-bleed art that keeps text legible.</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label"><span>Text Panel Darkness ({Math.round((activePreset.borderlessPanelOpacity ?? 0.7) * 100)}%)</span></label>
                  <input type="range" min="0.2" max="1" step="0.05"
                    value={activePreset.borderlessPanelOpacity ?? 0.7}
                    onChange={(e) => handleFieldChange('borderlessPanelOpacity', parseFloat(e.target.value))}
                    style={{ width: '100%' }} />
                </div>
                <div className="form-group">
                  <label className="form-label"><span>Text Panel Blur ({activePreset.borderlessPanelBlur ?? 8}px)</span></label>
                  <input type="range" min="0" max="30" step="1"
                    value={activePreset.borderlessPanelBlur ?? 8}
                    onChange={(e) => handleFieldChange('borderlessPanelBlur', parseInt(e.target.value))}
                    style={{ width: '100%' }} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label"><span>Frame Corner Radius ({activePreset.cornerRadius ?? 12}px)</span></label>
                <input type="range" min="0" max="30" step="1"
                  value={activePreset.cornerRadius ?? 12}
                  onChange={(e) => handleFieldChange('cornerRadius', parseInt(e.target.value))}
                  style={{ width: '100%' }} />
              </div>

              <div className="form-group">
                <label className="switch-container" onClick={() => handleFieldChange('borderlessShowFrame', activePreset.borderlessShowFrame === false ? true : false)}>
                  <div className={`switch-control ${activePreset.borderlessShowFrame !== false ? 'switch-active' : ''}`} />
                  <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Show Coloured Frame Border</span>
                </label>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Off gives a true edge-to-edge bleed with no coloured outline.</span>
              </div>
            </>
          )}

          {activePreset.baseType === 'glass' && (
            <>
              <div className="form-group">
                <label className="form-label"><span>Neon Glow Intensity ({Math.round((activePreset.neonGlowIntensity ?? 1) * 100)}%)</span></label>
                <input type="range" min="0.1" max="2.0" step="0.1"
                  value={activePreset.neonGlowIntensity ?? 1}
                  onChange={(e) => handleFieldChange('neonGlowIntensity', parseFloat(e.target.value))}
                  style={{ width: '100%' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label"><span>Panel Blur ({activePreset.glassPanelBlur ?? 20}px)</span></label>
                  <input type="range" min="0" max="40" step="1"
                    value={activePreset.glassPanelBlur ?? 20}
                    onChange={(e) => handleFieldChange('glassPanelBlur', parseInt(e.target.value))}
                    style={{ width: '100%' }} />
                </div>
                <div className="form-group">
                  <label className="form-label"><span>Background Tint ({Math.round((activePreset.glassTintOpacity ?? 0.45) * 100)}%)</span></label>
                  <input type="range" min="0" max="1" step="0.05"
                    value={activePreset.glassTintOpacity ?? 0.45}
                    onChange={(e) => handleFieldChange('glassTintOpacity', parseFloat(e.target.value))}
                    style={{ width: '100%' }} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Neon Accent Colour Override</label>
                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                  <input type="color" value={activePreset.neonColorOverride || '#00f5ff'}
                    onChange={(e) => handleFieldChange('neonColorOverride', e.target.value)}
                    style={{ width: '36px', height: '36px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                  <input type="text" className="form-input" value={activePreset.neonColorOverride || ''}
                    onChange={(e) => handleFieldChange('neonColorOverride', e.target.value)}
                    placeholder="Blank = follow card colour"
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem', padding: '0.25rem 0.4rem', height: '36px' }} />
                </div>
              </div>

              <div className="form-group">
                <label className="switch-container" onClick={() => handleFieldChange('showOrbs', activePreset.showOrbs === false ? true : false)}>
                  <div className={`switch-control ${activePreset.showOrbs !== false ? 'switch-active' : ''}`} />
                  <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Show Background Glow Orbs</span>
                </label>
              </div>
            </>
          )}

        </div>

        {/* Form Actions (Save, Clone, Delete) */}
        <div style={{ display: 'flex', gap: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', marginTop: '1rem' }}>
          <button 
            className="btn btn-primary" 
            onClick={handleSave} 
            disabled={saving}
            style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 2rem' }}
          >
            {saving ? <div className="spinner" /> : <Save size={18} />}
            Save Style Presets
          </button>
          
          <button 
            className="btn btn-secondary"
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
            onClick={() => {
              setNewTemplateName(`${activePreset.name || activeTemplateId} (Copy)`);
              const copyName = `${activePreset.name || activeTemplateId} (Copy)`;
              const slug = copyName.toLowerCase()
                .replace(/[^a-z0-9\s_-]/g, '')
                .replace(/\s+/g, '_');
              setNewTemplateId(slug);
              setNewTemplateBaseType(activePreset.baseType || activeTemplateId);
              setNewTemplateSource(activeTemplateId);
              setShowAddModal(true);
            }}
          >
            <Copy size={16} /> Clone Template
          </button>

          {!DEFAULT_TEMPLATE_IDS.includes(activeTemplateId) && (
            <button 
              className="btn btn-secondary" 
              style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto' }}
              onClick={() => handleDeleteTemplate(activeTemplateId)}
            >
              <Trash2 size={16} /> Delete Template
            </button>
          )}
        </div>
      </div>

      {/* Right Column: Live Card Sandbox Preview.
         The outer cell stays full-height (default grid stretch) so the inner
         wrapper — position: sticky, offset below the sticky app header — stays
         pinned and visible for the whole scroll of the long left-hand controls. */}
      <div>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        position: 'sticky',
        top: `${headerOffset}px`,
        maxHeight: `calc(100vh - ${headerOffset + 16}px)`,
        overflowY: 'auto'
      }}>

        {/* Sample card selector dropdown */}
        <div className="form-group" style={{ width: '100%' }}>
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', margin: 0 }}>
            <Eye size={16} />
            <span>Select Preview Sandbox Card</span>
          </label>
          <select 
            className="form-select"
            value={sampleCardId}
            onChange={(e) => setSampleCardId(e.target.value)}
          >
            {cards.map(c => (
              <option key={c.id} value={c.id}>{c.name || 'Unnamed Card'} ({c.id})</option>
            ))}
          </select>
        </div>

        {previewCard && (
          <div style={{
            padding: '1.5rem 2rem',
            backgroundColor: '#050811',
            border: '1px solid var(--border-color)',
            borderRadius: '20px',
            boxShadow: 'var(--shadow-inset)',
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
            overflow: 'hidden'
          }}>
            <CardPreview 
              card={previewCard} 
              templateOverride={activeTemplateId} 
              scale={0.5} 
              templatesConfig={templatesConfig} 
            />
          </div>
        )}

        <div style={{
          padding: '0.75rem',
          backgroundColor: 'rgba(57, 130, 246, 0.05)',
          border: '1px solid rgba(59, 130, 246, 0.15)',
          borderRadius: '8px',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          lineHeight: '1.3',
          width: '100%',
          margin: 0
        }}>
          <strong>Note:</strong> Editing style presets configures default metrics. Any card-specific custom slider adjustments in the Card Customizer will take precedence over these defaults.
        </div>
      </div>
      </div>

      {/* Add Template Modal Backdrop / View */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          animation: 'fade-in 0.2s ease-out'
        }}>
          <div className="panel animate-fade-in" style={{
            width: '450px',
            background: 'rgba(10, 15, 30, 0.95)',
            border: '1.5px solid var(--border-color)',
            borderRadius: '20px',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
          }}>
            <h3 style={{ fontSize: '1.3rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Plus size={20} style={{ color: 'var(--border-focus)' }} />
              <span>Create New Template</span>
            </h3>

            <div className="form-group">
              <label className="form-label">Template Display Name</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. Vintage Gold Frame"
                value={newTemplateName}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Template ID / Code</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. vintage_gold"
                value={newTemplateId}
                onChange={(e) => setNewTemplateId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                required
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Unique lowercase identifier for saving settings.</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Base Layout Type</label>
                <select 
                  className="form-select"
                  value={newTemplateBaseType}
                  onChange={(e) => setNewTemplateBaseType(e.target.value)}
                >
                  <option value="modern">Modern Classic</option>
                  <option value="retro">Retro Vintage</option>
                  <option value="borderless">Borderless Full-Bleed</option>
                  <option value="glass">Glassmorphism</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Clone Styles From</label>
                <select 
                  className="form-select"
                  value={newTemplateSource}
                  onChange={(e) => setNewTemplateSource(e.target.value)}
                >
                  <option value="">-- Defaults --</option>
                  {Object.keys(templatesConfig || {}).map(id => (
                    <option key={id} value={id}>{templatesConfig[id].name || id}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleCreateTemplate}
                disabled={!newTemplateName.trim() || !newTemplateId.trim()}
              >
                Create Template
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
