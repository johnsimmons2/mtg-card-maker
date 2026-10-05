import React, { useState, useEffect } from 'react';
import CardPreview from './CardPreview';
import { Search, Plus, Filter, AlertCircle, CheckCircle } from 'lucide-react';
import { deriveColors, resolveSetStyle, RARITY_TIERS, RARITY_LABELS } from '../utils/cardUtils';

const COLOR_MAP = [
  { key: 'white', label: 'W', className: 'pip-w' },
  { key: 'blue', label: 'U', className: 'pip-u' },
  { key: 'black', label: 'B', className: 'pip-b' },
  { key: 'red', label: 'R', className: 'pip-r' },
  { key: 'green', label: 'G', className: 'pip-g' }
];

export default function CardGrid({
  cards, selectedId, onSelect, onCreateCard,
  setsConfig = {}, templatesConfig = {}, globalSettings = {},
  activeSet = null, onEnterSet = null, onVisibleCardsChange = null, onCardChange = null,
  showToast = () => {}
}) {
  const [search, setSearch] = useState('');
  const [selectedColors, setSelectedColors] = useState([]); // Array of 'white', 'blue', etc.
  const [exclusiveColors, setExclusiveColors] = useState(false); // only cards whose colors are all selected
  const [selectedRarities, setSelectedRarities] = useState([]);
  const [showNewCardModal, setShowNewCardModal] = useState(false);
  
  // New card form state
  const [newName, setNewName] = useState('');
  const [newId, setNewId] = useState('');
  const [newType, setNewType] = useState('Creature');
  const [renderedList, setRenderedList] = useState([]); // List of PNG ids that have output files

  // Fetch rendered PNG list
  useEffect(() => {
    fetchRenderedList();
  }, [selectedId, cards]);

  const fetchRenderedList = async () => {
    try {
      const response = await fetch('/api/output-list');
      const data = await response.json();
      if (Array.isArray(data)) {
        // Renders are filed by set, so entries look like 'JBA/jotaro.png'.
        // Take the basename to recover the card id.
        const pngIds = data.map(file => file.split('/').pop().replace(/\.png$/i, ''));
        setRenderedList(pngIds);
      }
    } catch (err) {
      console.error('Error fetching output list:', err);
    }
  };

  // Auto-fill ID field when typing name
  const handleNameChangeForNewCard = (name) => {
    setNewName(name);
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // remove special chars
      .replace(/[\s-]+/g, '_');      // replace spaces/hyphens with underscore
    setNewId(slug);
  };

  const handleColorToggle = (color) => {
    if (selectedColors.includes(color)) {
      setSelectedColors(selectedColors.filter(c => c !== color));
    } else {
      setSelectedColors([...selectedColors, color]);
    }
  };

  const handleRarityToggle = (rarity) => {
    if (selectedRarities.includes(rarity)) {
      setSelectedRarities(selectedRarities.filter(r => r !== rarity));
    } else {
      setSelectedRarities([...selectedRarities, rarity]);
    }
  };

  const handleCreateCardSubmit = (e) => {
    e.preventDefault();
    if (!newId.trim() || !newName.trim()) return;

    // Check if ID already exists
    if (cards.some(c => c.id === newId.trim())) {
      showToast('error', `Card ID "${newId}" already exists — choose a different name.`);
      return;
    }

    onCreateCard({
      id: newId.trim(),
      name: newName.trim(),
      type_line: newType,
      mana_cost: '',
      rules_text: '',
      power_toughness: '',
      rarity: 'R',
      // A card created while browsing a set joins that set, and picks up the
      // set's default template if it defines one.
      set_symbol: activeSet || 'M',
      artist: '',
      art_path: '',
      metadata: {
        template: (activeSet && setsConfig?.[activeSet]?.template) || 'modern'
      }
    });

    // Reset and close
    setNewName('');
    setNewId('');
    setNewType('Creature');
    setShowNewCardModal(false);
  };

  // FILTERING LOGIC
  const filteredCards = cards.filter(card => {
    // 0. Set scope — when browsing a set, only its cards are listed.
    if (activeSet && (card.set_symbol || '') !== activeSet) return false;

    // 1. Search Query
    const query = search.toLowerCase();
    const matchesSearch = 
      card.name?.toLowerCase().includes(query) ||
      card.type_line?.toLowerCase().includes(query) ||
      card.rules_text?.toLowerCase().includes(query) ||
      card.id?.toLowerCase().includes(query);

    // 2. Rarity Filters
    const matchesRarity = 
      selectedRarities.length === 0 || 
      selectedRarities.includes(card.rarity || 'R');

    // 3. Color Filters
    const cardColors = deriveColors(card.mana_cost, card.type_line, card.name, card.rules_text);
    
    let matchesColor = true;
    if (selectedColors.length > 0) {
      if (selectedColors.includes('colorless')) {
        // checks if card is colorless (0 derived colors and not an artifact that is colored)
        matchesColor = cardColors.length === 0;
      } else if (selectedColors.includes('multi')) {
        matchesColor = cardColors.length >= 2;
      } else if (exclusiveColors) {
        // card must have at least one color, all of them among the selection
        matchesColor = cardColors.length > 0 && cardColors.every(c => selectedColors.includes(c));
      } else {
        // check if card has any of selected colors
        matchesColor = selectedColors.some(c => cardColors.includes(c));
      }
    }

    return matchesSearch && matchesRarity && matchesColor;
  });

  /* Report the visible order upward so the card editor can step through exactly
     what the catalog is showing — same set scope, search and filters, same
     order. Keyed on the joined ids so this only fires when the list actually
     changes, not on every render. */
  const visibleKey = filteredCards.map(c => c.id).join(',');
  useEffect(() => {
    if (onVisibleCardsChange) onVisibleCardsChange(visibleKey ? visibleKey.split(',') : []);
  }, [visibleKey, onVisibleCardsChange]);

  // Set codes present across the catalog, with their card counts.
  const setCounts = cards.reduce((acc, c) => {
    const code = c.set_symbol || '(unset)';
    acc[code] = (acc[code] || 0) + 1;
    return acc;
  }, {});
  const setCodes = Object.keys(setCounts).sort((a, b) => setCounts[b] - setCounts[a]);

  // Every set a card can be reassigned to: those defined in sets_config plus any
  // code already in use, so a card in an undefined set is still selectable.
  const assignableSets = [...new Set([
    ...Object.keys(setsConfig || {}),
    ...cards.map(c => c.set_symbol).filter(Boolean)
  ])].sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Set browser — pick a set to scope the catalog to it. */}
      {onEnterSet && (
        <div className="filters-bar" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.25rem' }}>
            Sets
          </span>
          <button
            className={`btn ${!activeSet ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.3rem 0.8rem', fontSize: '0.82rem' }}
            onClick={() => onEnterSet(null)}
          >
            All cards ({cards.length})
          </button>
          {setCodes.map(code => {
            const def = setsConfig?.[code];
            const { label, style, hasGradient } = resolveSetStyle({ set_symbol: code, rarity: 'R' }, setsConfig);
            return (
              <button
                key={code}
                className={`btn ${activeSet === code ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.3rem 0.8rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                onClick={() => onEnterSet(code)}
                title={def?.name || code}
              >
                <span
                  className={hasGradient ? 'set-symbol set-symbol-gradient' : 'set-symbol'}
                  style={{ ...style, fontSize: '0.95rem' }}
                >{code === '(unset)' ? '—' : label}</span>
                <span>{setCounts[code]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search and Filters Header */}
      <div className="filters-bar">
        {activeSet && (
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            Browsing <strong style={{ color: 'var(--text-primary)' }}>{setsConfig?.[activeSet]?.name || activeSet}</strong>
            {' '}— new cards created here join this set.
          </div>
        )}
        <div className="filters-row">
          <div className="search-input-wrapper">
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search by name, type, rules text..." 
              className="form-input" 
              style={{ paddingLeft: '2.5rem' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <button 
            className="btn btn-primary" 
            style={{ display: 'flex', gap: '0.5rem', whiteSpace: 'nowrap' }}
            onClick={() => setShowNewCardModal(true)}
          >
            <Plus size={16} /> New Card
          </button>
        </div>

        <div className="filters-row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
          {/* Colors Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Colors</span>
            <label
              title="Exclusive: only show cards whose colors are all among the selected ones"
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={exclusiveColors}
                onChange={(e) => setExclusiveColors(e.target.checked)}
              />
              Exclusive
            </label>
            <div className="color-picker-grid">
              {COLOR_MAP.map(c => (
                <button
                  key={c.key}
                  type="button"
                  className={`color-pip ${c.className} ${selectedColors.includes(c.key) ? 'selected' : ''}`}
                  onClick={() => handleColorToggle(c.key)}
                  title={`Filter by ${c.label}`}
                >
                  {c.label}
                </button>
              ))}
              <button
                type="button"
                className={`btn btn-secondary ${selectedColors.includes('multi') ? 'selected' : ''}`}
                style={{ padding: '2px 8px', fontSize: '0.75rem', height: '32px', borderRadius: '16px', borderColor: selectedColors.includes('multi') ? 'var(--text-primary)' : 'var(--border-color)' }}
                onClick={() => handleColorToggle('multi')}
              >
                Multi
              </button>
              <button
                type="button"
                className={`btn btn-secondary ${selectedColors.includes('colorless') ? 'selected' : ''}`}
                style={{ padding: '2px 8px', fontSize: '0.75rem', height: '32px', borderRadius: '16px', borderColor: selectedColors.includes('colorless') ? 'var(--text-primary)' : 'var(--border-color)' }}
                onClick={() => handleColorToggle('colorless')}
              >
                C
              </button>
            </div>
          </div>

          {/* Rarity Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Rarity</span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {['C', 'U', 'R', 'M'].map(rarity => (
                <button
                  key={rarity}
                  className={`btn btn-secondary ${selectedRarities.includes(rarity) ? 'selected' : ''}`}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    borderRadius: '4px',
                    borderColor: selectedRarities.includes(rarity) ? 'var(--text-primary)' : 'var(--border-color)',
                    backgroundColor: selectedRarities.includes(rarity) ? 'var(--bg-input)' : 'transparent'
                  }}
                  onClick={() => handleRarityToggle(rarity)}
                >
                  {rarity}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Grid List */}
      {filteredCards.length > 0 ? (
        <div className="card-grid-container animate-fade-in">
          {filteredCards.map(card => {
            const isSelected = card.id === selectedId;
            const isRendered = renderedList.includes(card.id);

            return (
              <div 
                key={card.id}
                className={`dashboard-card-wrapper ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelect(card.id)}
              >
                {/* 30% Scaled Card Preview */}
                <div style={{ display: 'flex', justifyContent: 'center', backgroundColor: '#000', borderRadius: '10px', overflow: 'hidden', padding: '0.5rem 0' }}>
                  <CardPreview
                    card={card}
                    scale={0.3}
                    templatesConfig={templatesConfig}
                    globalSettings={globalSettings}
                    setsConfig={setsConfig}
                  />
                </div>
                
                {/* Card Title & Rarity info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '0.25rem' }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={card.name}>
                      {card.name || 'Unnamed Card'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {card.type_line || 'No Type'}
                    </div>
                  </div>

                  {/* Render Status Badge */}
                  <div title={isRendered ? 'PNG Image Rendered' : 'PNG Image Missing'}>
                    {isRendered ? (
                      <CheckCircle size={16} style={{ color: 'var(--accent-green)' }} />
                    ) : (
                      <AlertCircle size={16} style={{ color: 'var(--accent-gold)' }} />
                    )}
                  </div>
                </div>

                {/* Reassign the card's set and rarity without opening it. The
                    click guard stops the selects from also triggering the
                    card's onClick and navigating into the editor. */}
                {onCardChange && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginTop: '0.45rem' }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.15rem' }}>
                        Set
                      </div>
                      <select
                        className="form-select"
                        value={card.set_symbol || ''}
                        title={setsConfig?.[card.set_symbol]?.name || 'No set assigned'}
                        onChange={(e) => {
                          const code = e.target.value;
                          const next = { ...card };
                          if (code) next.set_symbol = code;
                          else delete next.set_symbol;
                          onCardChange(next);
                        }}
                        style={{ width: '100%', minWidth: 0, padding: '0.2rem 0.4rem', fontSize: '0.75rem', height: '26px' }}
                      >
                        <option value="">— none —</option>
                        {assignableSets.map(code => (
                          <option key={code} value={code}>
                            {setsConfig?.[code]?.name ? `${code} · ${setsConfig[code].name}` : code}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.15rem' }}>
                        Rarity
                      </div>
                      <select
                        className="form-select"
                        value={(card.rarity || 'R').toUpperCase()}
                        title={`${RARITY_LABELS[(card.rarity || 'R').toUpperCase()] || 'Rare'} — also selects this set's rarity symbol tier`}
                        onChange={(e) => onCardChange({ ...card, rarity: e.target.value })}
                        style={{ width: '100%', minWidth: 0, padding: '0.2rem 0.4rem', fontSize: '0.75rem', height: '26px' }}
                      >
                        {RARITY_TIERS.map(code => (
                          <option key={code} value={code}>{code} · {RARITY_LABELS[code]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '3rem', border: '2px dashed var(--border-color)', borderRadius: '12px', color: 'var(--text-muted)' }}>
          No cards match your filter criteria. Try clearing search filters or click "New Card" to add one!
        </div>
      )}

      {/* New Card Modal Dialog */}
      {showNewCardModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <form 
            onSubmit={handleCreateCardSubmit}
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '2rem',
              width: '100%',
              maxWidth: '450px',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
            }}
          >
            <h3 style={{ fontSize: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>Create New Card</h3>
            
            <div className="form-group">
              <label className="form-label">Card Name</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. Chaos Orb"
                value={newName}
                onChange={(e) => handleNameChangeForNewCard(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Card ID (Unique identifier - snake_case)</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. chaos_orb"
                value={newId}
                onChange={(e) => setNewId(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '_'))}
                required
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>This becomes the output filename (output/&lt;set&gt;/id.png).</span>
            </div>

            <div className="form-group">
              <label className="form-label">Primary Card Type</label>
              <select 
                className="form-select"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
              >
                <option value="Creature">Creature</option>
                <option value="Land">Land</option>
                <option value="Artifact">Artifact</option>
                <option value="Enchantment">Enchantment</option>
                <option value="Instant">Instant</option>
                <option value="Sorcery">Sorcery</option>
                <option value="Legendary Creature">Legendary Creature</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setShowNewCardModal(false)}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={!newId.trim() || !newName.trim()}
              >
                Create Card
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
