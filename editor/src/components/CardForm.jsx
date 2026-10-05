import React, { useState, useEffect } from 'react';
import { Upload, Save, Image as ImageIcon, Trash2, Copy, Sparkles, X, Plus, RefreshCw } from 'lucide-react';

const MANA_PIPS = [
  { symbol: 'W', label: 'White' },
  { symbol: 'U', label: 'Blue' },
  { symbol: 'B', label: 'Black' },
  { symbol: 'R', label: 'Red' },
  { symbol: 'G', label: 'Green' },
  { symbol: 'C', label: 'Colorless' },
  { symbol: 'X', label: 'X' },
  { symbol: '1', label: '1' },
  { symbol: '2', label: '2' },
  { symbol: '3', label: '3' },
  { symbol: '4', label: '4' },
  { symbol: '5', label: '5' }
];

export default function CardForm({ card, onChange, onSave, onDelete, onDuplicate, onGenerate, isGenerating, templatesConfig, showToast = () => {}}) {
  const [artList, setArtList] = useState([]);
  const [setFolderArt, setSetFolderArt] = useState([]);
  const [backgroundList, setBackgroundList] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [refreshingArt, setRefreshingArt] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [activeTab, setActiveTab] = useState('fields'); // 'fields' | 'styling' | 'metadata'
  const [generateLog, setGenerateLog] = useState('');
  const [showLogModal, setShowLogModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newMetaKey, setNewMetaKey] = useState('');
  const [newMetaVal, setNewMetaVal] = useState('');

  // The set folder this card's art can also be drawn from: art/<set_symbol>/
  const artSetCode = (card.set_symbol || '').trim();

  // art_path is a single field: a bare filename means the general art folder,
  // a "<CODE>/name" value means that set's subfolder. Each dropdown derives its
  // selection by parsing it, so picking in one clears the other.
  const artPath = card.art_path || '';
  const artHasDir = artPath.includes('/');
  const isSetArtSelected = artHasDir && artSetCode && artPath.slice(0, artPath.indexOf('/')) === artSetCode;
  const generalArtValue = artHasDir ? '' : artPath;
  const setArtValue = isSetArtSelected ? artPath.slice(artSetCode.length + 1) : '';

  // Fetch available art files on mount
  useEffect(() => {
    fetchArtFiles();
    fetchBackgroundFiles();
  }, []);

  // Re-fetch the per-set art list whenever the card's set changes
  useEffect(() => {
    fetchSetArtFiles();
  }, [artSetCode]);

  // A page reload (incl. Vite HMR) or tab close while an upload is in flight
  // cuts the request off — the server now discards partial uploads, but warn
  // so the user can let it finish rather than silently losing the file.
  useEffect(() => {
    if (!uploading && !uploadingBg) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploading, uploadingBg]);

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

  const fetchSetArtFiles = async () => {
    if (!artSetCode) {
      setSetFolderArt([]);
      return;
    }
    try {
      const response = await fetch(`/api/art?set=${encodeURIComponent(artSetCode)}`);
      const data = await response.json();
      setSetFolderArt(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching set art list:', err);
      setSetFolderArt([]);
    }
  };

  // Refresh button next to the art dropdowns — re-reads the art folder(s) so
  // newly added files show up without a full page reload.
  const refreshArtLists = async () => {
    setRefreshingArt(true);
    try {
      await Promise.all([fetchArtFiles(), fetchSetArtFiles()]);
    } finally {
      setRefreshingArt(false);
    }
  };

  const fetchBackgroundFiles = async () => {
    try {
      const response = await fetch('/api/backgrounds');
      const data = await response.json();
      if (Array.isArray(data)) {
        setBackgroundList(data);
      }
    } catch (err) {
      console.error('Error fetching backgrounds list:', err);
    }
  };

  // Background upload handler
  const handleBackgroundUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBg(true);
    const formData = new FormData();
    formData.append('backgroundImage', file);

    try {
      const response = await fetch('/api/backgrounds/upload', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (response.ok && data.filename) {
        await fetchBackgroundFiles();
        handleFieldChange('background_path', data.filename);
      } else {
        showToast('error', data.error || 'Failed to upload background image');
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      showToast('error', 'Network error uploading background file');
    } finally {
      setUploadingBg(false);
    }
  };

  const handleFieldChange = (field, value) => {
    onChange({
      ...card,
      [field]: value
    });
  };

  const handleMetadataChange = (key, value) => {
    const updatedMetadata = {
      ...(card.metadata || {}),
      [key]: value
    };
    onChange({
      ...card,
      metadata: updatedMetadata
    });
  };

  const deleteMetadataKey = (key) => {
    const updatedMetadata = { ...(card.metadata || {}) };
    delete updatedMetadata[key];
    onChange({
      ...card,
      metadata: updatedMetadata
    });
  };

  const addMetadataKey = () => {
    if (!newMetaKey.trim()) return;
    handleMetadataChange(newMetaKey.trim(), newMetaVal);
    setNewMetaKey('');
    setNewMetaVal('');
  };

  // Mana builder helper. Numeric pips represent generic mana, and a cost only
  // ever has a single generic amount — so clicking 1 then 2 should yield {3},
  // not {1}{2}. Non-numeric pips (colors, X) always append as their own symbol.
  const addManaPip = (symbol) => {
    const currentCost = card.mana_cost || '';

    if (/^\d+$/.test(symbol)) {
      const existing = currentCost.match(/\{(\d+)\}/);
      if (existing) {
        const sum = parseInt(existing[1], 10) + parseInt(symbol, 10);
        handleFieldChange('mana_cost', currentCost.replace(/\{\d+\}/, `{${sum}}`));
        return;
      }
    }

    handleFieldChange('mana_cost', `${currentCost}{${symbol}}`);
  };

  const clearManaCost = () => {
    handleFieldChange('mana_cost', '');
  };

  // File upload handler. Pass a set code to drop the file into art/<code>/.
  const handleArtUpload = async (e, setCode = '') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('artImage', file);

    const url = setCode
      ? `/api/art/upload?set=${encodeURIComponent(setCode)}`
      : '/api/art/upload';

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (response.ok && data.filename) {
        await Promise.all([fetchArtFiles(), fetchSetArtFiles()]);
        handleFieldChange('art_path', data.filename);
      } else {
        showToast('error', data.error || 'Failed to upload image');
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      showToast('error', 'Network error uploading file');
    } finally {
      setUploading(false);
    }
  };

  const triggerGenerate = async () => {
    setGenerateLog('Starting Node.js Playwright screenshot engine...\n');
    setShowLogModal(true);
    try {
      const log = await onGenerate(card.id);
      setGenerateLog(prev => prev + (log || 'Success! PNG saved in output/ folder.'));
    } catch (err) {
      setGenerateLog(prev => prev + `\nERROR: ${err.message}`);
    }
  };

  const currentTemplate = card.metadata?.template || 'modern';

  return (
    <div className="panel animate-fade-in" style={{ gap: '1.25rem' }}>
      <div className="panel-header">
        <div>
          <h2 style={{ fontSize: '1.25rem' }}>Card Customizer</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {card.id}</span>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className="btn btn-secondary" 
            onClick={onDuplicate}
            title="Duplicate Card"
            style={{ padding: '0.5rem' }}
          >
            <Copy size={16} />
          </button>
          {/* Two-step delete: the first click arms it, the second deletes.
              A native confirm() would be silently answered "no" if the browser
              is set to block dialogs for this site. */}
          <button
            className="btn btn-secondary"
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                showToast('info', `Click again to delete "${card.name || 'this card'}".`, 6000);
                window.setTimeout(() => setConfirmDelete(false), 6000);
                return;
              }
              setConfirmDelete(false);
              onDelete(card.id);
            }}
            title={confirmDelete ? 'Click again to confirm deletion' : 'Delete Card'}
            style={{
              padding: '0.5rem',
              color: confirmDelete ? '#fff' : 'var(--accent-red)',
              background: confirmDelete ? 'var(--accent-red)' : undefined,
              display: 'flex', alignItems: 'center', gap: '0.35rem'
            }}
          >
            <Trash2 size={16} />
            {confirmDelete && <span style={{ fontSize: '0.78rem' }}>Confirm</span>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '1rem' }}>
        <button 
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'fields' ? '2px solid var(--border-focus)' : '2px solid transparent',
            color: activeTab === 'fields' ? 'var(--text-primary)' : 'var(--text-muted)',
            padding: '0.5rem 0',
            fontWeight: '600',
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all var(--transition-fast)'
          }}
          onClick={() => setActiveTab('fields')}
        >
          Basic Fields
        </button>
        <button 
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'styling' ? '2px solid var(--border-focus)' : '2px solid transparent',
            color: activeTab === 'styling' ? 'var(--text-primary)' : 'var(--text-muted)',
            padding: '0.5rem 0',
            fontWeight: '600',
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all var(--transition-fast)'
          }}
          onClick={() => setActiveTab('styling')}
        >
          Layout & Styling
        </button>
        <button 
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'metadata' ? '2px solid var(--border-focus)' : '2px solid transparent',
            color: activeTab === 'metadata' ? 'var(--text-primary)' : 'var(--text-muted)',
            padding: '0.5rem 0',
            fontWeight: '600',
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all var(--transition-fast)'
          }}
          onClick={() => setActiveTab('metadata')}
        >
          Custom Metadata
        </button>
      </div>

      {/* TAB CONTENT: Basic Fields */}
      {activeTab === 'fields' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Card ID (Filename URL slug)</label>
            <input 
              type="text" 
              className="form-input" 
              value={card.id || ''} 
              disabled={true}
              style={{ opacity: 0.6, cursor: 'not-allowed' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Card Title</label>
            <input 
              type="text" 
              className="form-input" 
              value={card.name || ''} 
              onChange={(e) => handleFieldChange('name', e.target.value)}
              placeholder="e.g. Black Lotus"
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              <span>Mana Cost</span>
              <button 
                onClick={clearManaCost}
                style={{ background: 'none', border: 'none', color: 'var(--accent-red)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Clear
              </button>
            </label>
            <input 
              type="text" 
              className="form-input" 
              value={card.mana_cost || ''} 
              onChange={(e) => handleFieldChange('mana_cost', e.target.value)}
              placeholder="e.g. {2}{U}{B}"
            />
            {/* Mana Cost Builder */}
            <div className="color-picker-grid" style={{ marginTop: '0.25rem' }}>
              {MANA_PIPS.map((pip) => (
                <button
                  key={pip.symbol}
                  type="button"
                  className={`color-pip pip-${pip.symbol.toLowerCase()}`}
                  onClick={() => addManaPip(pip.symbol)}
                  title={`Add ${pip.label}`}
                >
                  {pip.symbol}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Type Line</label>
            <input 
              type="text" 
              className="form-input" 
              value={card.type_line || ''} 
              onChange={(e) => handleFieldChange('type_line', e.target.value)}
              placeholder="e.g. Legendary Creature — Wizard"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Rules Text (*italicize reminder text*)</label>
            <textarea 
              className="form-textarea" 
              value={card.rules_text || ''} 
              onChange={(e) => handleFieldChange('rules_text', e.target.value)}
              placeholder="Use {T} for tap, {U} for blue, \n for new paragraphs."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Power / Toughness</label>
              <input 
                type="text" 
                className="form-input" 
                value={card.power_toughness || ''} 
                onChange={(e) => handleFieldChange('power_toughness', e.target.value)}
                placeholder="e.g. 5/5"
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Rarity</label>
              <select 
                className="form-select"
                value={card.rarity || 'R'}
                onChange={(e) => handleFieldChange('rarity', e.target.value)}
              >
                <option value="C">Common</option>
                <option value="U">Uncommon</option>
                <option value="R">Rare</option>
                <option value="M">Mythic Rare</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Layout & Styling */}
      {activeTab === 'styling' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label className="form-label">Card Template Style</label>
            <select 
              className="form-select"
              value={card.metadata?.template || 'modern'}
              onChange={(e) => handleMetadataChange('template', e.target.value)}
            >
              {Object.keys(templatesConfig || {}).map((id) => {
                const name = templatesConfig[id]?.name || {
                  modern: 'Modern Classic',
                  retro: 'Retro Vintage',
                  borderless: 'Borderless Full-Bleed',
                  glass: 'Glassmorphism'
                }[id] || id;
                return (
                  <option key={id} value={id}>{name}</option>
                );
              })}
            </select>
          </div>

          {/* Art selector */}
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Card Art Image</span>
              <button
                type="button"
                onClick={refreshArtLists}
                disabled={refreshingArt}
                title="Rescan the art folder for newly added images"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', textTransform: 'none' }}
              >
                <RefreshCw size={13} className={refreshingArt ? 'spin' : undefined} />
                Refresh
              </button>
            </label>

            {/* General art folder */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select
                className="form-select"
                value={generalArtValue}
                onChange={(e) => handleFieldChange('art_path', e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">-- General art folder --</option>
                {artList.map((file) => (
                  <option key={file} value={file}>{file}</option>
                ))}
              </select>

              <label className="btn btn-secondary" style={{ padding: '0.75rem', margin: 0, display: 'flex', cursor: 'pointer' }} title="Upload to the general art folder">
                <Upload size={16} />
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handleArtUpload(e)}
                  disabled={uploading}
                />
              </label>
            </div>

            {/* Per-set art folder — art/<set_symbol>/ */}
            {artSetCode && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <select
                  className="form-select"
                  value={setArtValue}
                  onChange={(e) => handleFieldChange('art_path', e.target.value ? `${artSetCode}/${e.target.value}` : '')}
                  style={{ flex: 1 }}
                >
                  <option value="">{`-- ${artSetCode} set art folder${setFolderArt.length ? '' : ' (empty)'} --`}</option>
                  {setFolderArt.map((file) => (
                    <option key={file} value={file}>{file}</option>
                  ))}
                </select>

                <label className="btn btn-secondary" style={{ padding: '0.75rem', margin: 0, display: 'flex', cursor: 'pointer' }} title={`Upload to the ${artSetCode} set art folder`}>
                  <Upload size={16} />
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleArtUpload(e, artSetCode)}
                    disabled={uploading}
                  />
                </label>
              </div>
            )}

            {uploading && <span style={{ fontSize: '0.75rem', color: 'var(--border-focus)' }}>Uploading art image...</span>}
            {artHasDir && !isSetArtSelected && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Current art: {artPath}</span>
            )}
          </div>

          {/* Layout custom sliders */}
          <div style={{ background: 'var(--bg-input)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '380px', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
              <span>Visual Customization Sliders</span>
            </h3>
            
            {/* Height Slider */}
            <div className="form-group">
              <label className="form-label" style={{ textTransform: 'none', fontSize: '0.8rem' }}>
                <span>Art Box Height ({card.metadata?.artHeight || (currentTemplate === 'modern' ? 440 : 380)}px)</span>
                {card.metadata?.artHeight && (
                  <button onClick={() => deleteMetadataKey('artHeight')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Reset</button>
                )}
              </label>
              <input 
                type="range" 
                min="200" 
                max="600" 
                step="10"
                value={card.metadata?.artHeight || (currentTemplate === 'modern' ? 440 : 380)} 
                onChange={(e) => handleMetadataChange('artHeight', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Art Y-Offset (Centering) */}
            <div className="form-group">
              <label className="form-label" style={{ textTransform: 'none', fontSize: '0.8rem' }}>
                <span>Art Vert. Position / Y-Offset ({card.metadata?.artYOffset !== undefined ? card.metadata.artYOffset : (currentTemplate === 'modern' ? 0 : 50)}%)</span>
                {card.metadata?.artYOffset !== undefined && (
                  <button onClick={() => deleteMetadataKey('artYOffset')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Reset</button>
                )}
              </label>
              <input 
                type="range" 
                min="0" 
                max="100" 
                step="1"
                value={card.metadata?.artYOffset !== undefined ? card.metadata.artYOffset : (currentTemplate === 'modern' ? 0 : 50)} 
                onChange={(e) => handleMetadataChange('artYOffset', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Art X-Offset */}
            <div className="form-group">
              <label className="form-label" style={{ textTransform: 'none', fontSize: '0.8rem' }}>
                <span>Art Horiz. Position / X-Offset ({card.metadata?.artXOffset !== undefined ? card.metadata.artXOffset : 50}%)</span>
                {card.metadata?.artXOffset !== undefined && (
                  <button onClick={() => deleteMetadataKey('artXOffset')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Reset</button>
                )}
              </label>
              <input 
                type="range" 
                min="0" 
                max="100" 
                step="1"
                value={card.metadata?.artXOffset !== undefined ? card.metadata.artXOffset : 50}
                onChange={(e) => handleMetadataChange('artXOffset', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Art Zoom / Scale — the picture is scaled inside the fixed art
                window. Above 1x it zooms in and the window crops it; below 1x it
                shrinks and a blurred copy of the art fills the space behind it,
                so the window itself always stays the same size. */}
            <div className="form-group">
              <label className="form-label" style={{ textTransform: 'none', fontSize: '0.8rem' }}>
                <span>Art Zoom / Scale ({(card.metadata?.artScale !== undefined ? card.metadata.artScale : 1).toFixed(2)}x)</span>
                {card.metadata?.artScale !== undefined && (
                  <button onClick={() => deleteMetadataKey('artScale')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Reset</button>
                )}
              </label>
              <input
                type="range"
                min="0.25"
                max="4"
                step="0.05"
                value={card.metadata?.artScale !== undefined ? card.metadata.artScale : 1}
                onChange={(e) => handleMetadataChange('artScale', parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Art Rotation */}
            <div className="form-group">
              <label className="form-label" style={{ textTransform: 'none', fontSize: '0.8rem' }}>
                <span>Art Rotation ({card.metadata?.artRotation !== undefined ? card.metadata.artRotation : 0}&deg;)</span>
                {card.metadata?.artRotation !== undefined && (
                  <button onClick={() => deleteMetadataKey('artRotation')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Reset</button>
                )}
              </label>
              <input
                type="range"
                min="-180"
                max="180"
                step="1"
                value={card.metadata?.artRotation !== undefined ? card.metadata.artRotation : 0}
                onChange={(e) => handleMetadataChange('artRotation', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Art Free Pan X — nudges the art past the crop's clamp, e.g. sliding
                it partway under the frame borders for a bleed effect. */}
            <div className="form-group">
              <label className="form-label" style={{ textTransform: 'none', fontSize: '0.8rem' }}>
                <span>Art Free Pan X ({card.metadata?.artOffsetX !== undefined ? card.metadata.artOffsetX : 0}px)</span>
                {card.metadata?.artOffsetX !== undefined && (
                  <button onClick={() => deleteMetadataKey('artOffsetX')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Reset</button>
                )}
              </label>
              <input
                type="range"
                min="-300"
                max="300"
                step="2"
                value={card.metadata?.artOffsetX !== undefined ? card.metadata.artOffsetX : 0}
                onChange={(e) => handleMetadataChange('artOffsetX', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Art Free Pan Y */}
            <div className="form-group">
              <label className="form-label" style={{ textTransform: 'none', fontSize: '0.8rem' }}>
                <span>Art Free Pan Y ({card.metadata?.artOffsetY !== undefined ? card.metadata.artOffsetY : 0}px)</span>
                {card.metadata?.artOffsetY !== undefined && (
                  <button onClick={() => deleteMetadataKey('artOffsetY')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Reset</button>
                )}
              </label>
              <input
                type="range"
                min="-300"
                max="300"
                step="2"
                value={card.metadata?.artOffsetY !== undefined ? card.metadata.artOffsetY : 0}
                onChange={(e) => handleMetadataChange('artOffsetY', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Padding customizer */}
            <div className="form-group">
              <label className="form-label" style={{ textTransform: 'none', fontSize: '0.8rem' }}>
                <span>Rules Box Padding ({card.metadata?.rulesPadding !== undefined ? card.metadata.rulesPadding : (currentTemplate === 'retro' ? 16 : 24)}px)</span>
                {card.metadata?.rulesPadding !== undefined && (
                  <button onClick={() => deleteMetadataKey('rulesPadding')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Reset</button>
                )}
              </label>
              <input 
                type="range" 
                min="8" 
                max="48" 
                step="1"
                value={card.metadata?.rulesPadding !== undefined ? card.metadata.rulesPadding : (currentTemplate === 'retro' ? 16 : 24)} 
                onChange={(e) => handleMetadataChange('rulesPadding', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Border Width customizer */}
            <div className="form-group">
              <label className="form-label" style={{ textTransform: 'none', fontSize: '0.8rem' }}>
                <span>Border Thickness ({card.metadata?.frameBorderWidth !== undefined ? card.metadata.frameBorderWidth : (currentTemplate === 'modern' ? 18 : (currentTemplate === 'retro' ? 3 : (currentTemplate === 'borderless' ? 10 : 2.5)))}px)</span>
                {card.metadata?.frameBorderWidth !== undefined && (
                  <button onClick={() => deleteMetadataKey('frameBorderWidth')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Reset</button>
                )}
              </label>
              <input 
                type="range" 
                min="1" 
                max="20" 
                step="0.5"
                value={card.metadata?.frameBorderWidth !== undefined ? card.metadata.frameBorderWidth : (currentTemplate === 'modern' ? 18 : (currentTemplate === 'retro' ? 3 : (currentTemplate === 'borderless' ? 10 : 2.5)))} 
                onChange={(e) => handleMetadataChange('frameBorderWidth', parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Rules Font Size */}
            <div className="form-group">
              <label className="form-label" style={{ textTransform: 'none', fontSize: '0.8rem' }}>
                <span>Rules Font Size ({card.metadata?.rulesFontSize || 'Auto'}px)</span>
                {card.metadata?.rulesFontSize && (
                  <button onClick={() => deleteMetadataKey('rulesFontSize')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Reset</button>
                )}
              </label>
              <input 
                type="range" 
                min="10" 
                max="40" 
                step="1"
                value={card.metadata?.rulesFontSize || 26} 
                onChange={(e) => handleMetadataChange('rulesFontSize', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Title Font Size */}
            <div className="form-group">
              <label className="form-label" style={{ textTransform: 'none', fontSize: '0.8rem' }}>
                <span>Title Font Size ({card.metadata?.nameFontSize || 'Auto'}px)</span>
                {card.metadata?.nameFontSize && (
                  <button onClick={() => deleteMetadataKey('nameFontSize')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Reset</button>
                )}
              </label>
              <input
                type="range"
                min="14"
                max="48"
                step="1"
                value={card.metadata?.nameFontSize || 36}
                onChange={(e) => handleMetadataChange('nameFontSize', parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Mana symbol size in the title bar. Costs with many pips crowd the
                card name — shrinking them here gives the name back its room. */}
            <div className="form-group">
              <label className="form-label" style={{ textTransform: 'none', fontSize: '0.8rem' }}>
                <span>Cost Symbol Size ({card.metadata?.manaSymbolSize ? `${card.metadata.manaSymbolSize}em` : 'Global'})</span>
                {card.metadata?.manaSymbolSize && (
                  <button onClick={() => deleteMetadataKey('manaSymbolSize')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Reset</button>
                )}
              </label>
              <input
                type="range"
                min="0.4"
                max="1.5"
                step="0.05"
                value={card.metadata?.manaSymbolSize || 0.95}
                onChange={(e) => handleMetadataChange('manaSymbolSize', parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Mana symbol size inside the rules text. */}
            <div className="form-group">
              <label className="form-label" style={{ textTransform: 'none', fontSize: '0.8rem' }}>
                <span>Rules Symbol Size ({card.metadata?.rulesSymbolSize ? `${card.metadata.rulesSymbolSize}em` : 'Global'})</span>
                {card.metadata?.rulesSymbolSize && (
                  <button onClick={() => deleteMetadataKey('rulesSymbolSize')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Reset</button>
                )}
              </label>
              <input
                type="range"
                min="0.4"
                max="1.5"
                step="0.05"
                value={card.metadata?.rulesSymbolSize || 0.95}
                onChange={(e) => handleMetadataChange('rulesSymbolSize', parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Set Symbol</label>
              <input 
                type="text" 
                className="form-input" 
                value={card.set_symbol || 'M'} 
                onChange={(e) => handleFieldChange('set_symbol', e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Artist Name</label>
              <input
                type="text"
                className="form-input"
                value={card.artist || ''}
                onChange={(e) => handleFieldChange('artist', e.target.value)}
                placeholder="Auto-generated if blank"
              />
            </div>
          </div>

          {/* Security stamp acorn colour. Unchecked = inherit from the set /
              template (which itself defaults to this card's rarity colour).
              Checked = pin a fixed colour for this card only. */}
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={card.metadata?.stampAcornColor !== undefined && card.metadata?.stampAcornColor !== ''}
                onChange={(e) => {
                  if (e.target.checked) handleMetadataChange('stampAcornColor', card.metadata?.stampAcornColor || '#c5a342');
                  else deleteMetadataKey('stampAcornColor');
                }}
              />
              <span style={{ textTransform: 'none' }}>Override acorn stamp colour</span>
            </label>
            {card.metadata?.stampAcornColor !== undefined && card.metadata?.stampAcornColor !== '' && (
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <input
                  type="color"
                  value={card.metadata.stampAcornColor}
                  onChange={(e) => handleMetadataChange('stampAcornColor', e.target.value)}
                  style={{ width: '44px', height: '32px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
                <input
                  type="text"
                  className="form-input"
                  value={card.metadata.stampAcornColor}
                  onChange={(e) => handleMetadataChange('stampAcornColor', e.target.value)}
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem', padding: '0.25rem 0.4rem', height: '32px' }}
                />
              </div>
            )}
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Off = inherit the set style / rarity colour.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Custom Background File</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select 
                  className="form-select"
                  value={card.background_path || ''}
                  onChange={(e) => handleFieldChange('background_path', e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="">-- Procedural textures --</option>
                  {backgroundList.map((file) => (
                    <option key={file} value={file}>{file}</option>
                  ))}
                </select>
                
                <label className="btn btn-secondary" style={{ padding: '0.75rem', margin: 0, display: 'flex', cursor: 'pointer' }} title="Upload Custom Background">
                  <Upload size={16} />
                  <input 
                    type="file" 
                    accept="image/*" 
                    style={{ display: 'none' }} 
                    onChange={handleBackgroundUpload}
                    disabled={uploadingBg}
                  />
                </label>
              </div>
              {uploadingBg && <span style={{ fontSize: '0.75rem', color: 'var(--border-focus)' }}>Uploading background...</span>}
            </div>
            

          </div>

          {/* Conditional custom background blend mode and opacity */}
          {card.background_path && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'var(--bg-input)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: '-0.5rem' }}>
              <div className="form-group">
                <label className="form-label">Background Blend Mode</label>
                <select 
                  className="form-select"
                  value={card.metadata?.backgroundBlendMode || 'multiply'}
                  onChange={(e) => handleMetadataChange('backgroundBlendMode', e.target.value)}
                >
                  <option value="multiply">Multiply (Colorize Grayscale - Rec.)</option>
                  <option value="normal">Normal (Opaque original color)</option>
                  <option value="overlay">Overlay (Soft blend)</option>
                  <option value="screen">Screen (Lighten blend)</option>
                  <option value="color-burn">Color Burn (Saturated dark)</option>
                  <option value="difference">Difference</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">
                  <span>Background Opacity ({card.metadata?.backgroundOpacity !== undefined ? card.metadata.backgroundOpacity : 0.85})</span>
                  {card.metadata?.backgroundOpacity !== undefined && (
                    <button onClick={() => deleteMetadataKey('backgroundOpacity')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Reset</button>
                  )}
                </label>
                <input 
                  type="range" 
                  min="0" 
                  max="1.0" 
                  step="0.05"
                  value={card.metadata?.backgroundOpacity !== undefined ? card.metadata.backgroundOpacity : 0.85} 
                  onChange={(e) => handleMetadataChange('backgroundOpacity', parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Custom Metadata */}
      {activeTab === 'metadata' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            Arbitrary key-value metadata saved directly to this card in <code style={{ color: 'var(--text-primary)' }}>cards.json</code>. Useful for custom filters, deck categories, or specific styling parameters.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {card.metadata && Object.keys(card.metadata).length > 0 ? (
              Object.entries(card.metadata).map(([key, val]) => (
                <div 
                  key={key} 
                  style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '140px 1fr 40px', 
                    gap: '0.5rem', 
                    alignItems: 'center', 
                    background: 'var(--bg-input)', 
                    padding: '0.5rem', 
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={key}>
                    {key}
                  </span>
                  <input 
                    type="text" 
                    className="form-input" 
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                    value={typeof val === 'object' ? JSON.stringify(val) : val}
                    onChange={(e) => handleMetadataChange(key, e.target.value)}
                  />
                  <button 
                    onClick={() => deleteMetadataKey(key)}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: 'var(--accent-red)', 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center' 
                    }}
                    title="Remove metadata field"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No metadata fields set on this card.
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h4 style={{ fontSize: '0.95rem' }}>Add Metadata Field</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <input 
                type="text" 
                placeholder="Key (e.g. tag, rating)" 
                className="form-input" 
                value={newMetaKey}
                onChange={(e) => setNewMetaKey(e.target.value)}
              />
              <input 
                type="text" 
                placeholder="Value" 
                className="form-input" 
                value={newMetaVal}
                onChange={(e) => setNewMetaVal(e.target.value)}
              />
            </div>
            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-start' }}
              onClick={addMetadataKey}
              disabled={!newMetaKey.trim()}
            >
              <Plus size={16} /> Add Field
            </button>
          </div>
        </div>
      )}

      {/* Main Form Actions */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '1rem', 
          borderTop: '1px solid var(--border-color)', 
          paddingTop: '1.25rem',
          marginTop: '0.5rem'
        }}
      >
        <button 
          className="btn btn-secondary" 
          onClick={onSave}
          style={{ display: 'flex', gap: '0.5rem' }}
        >
          <Save size={16} /> Save JSON
        </button>

        <button 
          className="btn btn-primary" 
          onClick={triggerGenerate}
          disabled={isGenerating}
          style={{ display: 'flex', gap: '0.5rem' }}
        >
          {isGenerating ? <div className="spinner" /> : <Sparkles size={16} />} 
          Generate PNG
        </button>
      </div>

      {/* Playwright Terminal Log Modal */}
      {showLogModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem'
          }}
        >
          <div 
            style={{
              backgroundColor: '#1e1e1e',
              border: '1px solid #333',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '800px',
              height: '80%',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: '1px solid #333', backgroundColor: '#252526', borderRadius: '12px 12px 0 0' }}>
              <h3 style={{ fontSize: '1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={16} /> Playwright Generator Output
              </h3>
              <button 
                onClick={() => setShowLogModal(false)}
                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', display: 'flex' }}
              >
                <X size={20} />
              </button>
            </div>
            <pre 
              style={{
                flex: 1,
                padding: '1.5rem',
                margin: 0,
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                color: '#ddd',
                whiteSpace: 'pre-wrap',
                backgroundColor: '#111'
              }}
            >
              {generateLog || 'Executing screenshot scripts...'}
            </pre>
            <div style={{ padding: '1rem', borderTop: '1px solid #333', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#252526', borderRadius: '0 0 12px 12px' }}>
              <button className="btn btn-secondary" onClick={() => setShowLogModal(false)}>
                Close Console
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
