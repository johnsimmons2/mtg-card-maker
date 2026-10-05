import React, { useState, useEffect } from 'react';
import CardGrid from './components/CardGrid';
import CardPreview from './components/CardPreview';
import CardForm from './components/CardForm';
import CardMetadataPage from './components/CardMetadataPage';
import TemplatesConfigPage from './components/TemplatesConfigPage';
import MasterSettingsPage from './components/MasterSettingsPage';
import AICardGenerator from './components/AICardGenerator';
import SetsConfigPage from './components/SetsConfigPage';
import { getSetFontFamilies } from './utils/cardUtils';
import { ArrowLeft, Save, Sparkles, AlertTriangle, Layers, ChevronLeft, ChevronRight } from 'lucide-react';

export default function App() {
  const [cards, setCards] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [globalGenerateLoading, setGlobalGenerateLoading] = useState(false);

  // Standalone preview route state
  const [isPreviewRoute, setIsPreviewRoute] = useState(false);
  const [previewId, setPreviewId] = useState(null);
  // Optional ?template= override, so a card can be rendered in any frame
  // without editing its saved metadata (used for previewing and batch renders).
  const [previewTemplate, setPreviewTemplate] = useState(null);

  // Custom view state for routing
  const [currentView, setCurrentView] = useState('catalog'); // 'catalog' | 'metadata' | 'templates' | 'sets' | 'settings' | 'ai'
  // Card Metadata's set toggles and chart options live here so they survive
  // visiting another page. Sets are tracked by what is switched off, so a set
  // created later starts on.
  const [metadataView, setMetadataView] = useState({ hiddenSets: [], metric: 'cards', costView: 'chart' });
  const [templatesConfig, setTemplatesConfig] = useState({});
  const [globalSettings, setGlobalSettings] = useState({});
  const [setsConfig, setSetsConfig] = useState({});
  // Which set the catalog is scoped to; null browses everything.
  const [activeSet, setActiveSet] = useState(null);
  const [backgrounds, setBackgrounds] = useState([]);
  // The catalog's currently visible card order, used for prev/next in the editor.
  const [visibleIds, setVisibleIds] = useState([]);

  /* In-app notifications instead of window.alert/confirm.
     Native dialogs can be blocked per-site by the browser, and a blocked
     confirm() silently returns false — which made "Render All PNGs" look dead
     and made save/error messages vanish entirely. Nothing here depends on the
     browser granting dialog permission. */
  const [toast, setToast] = useState(null); // { kind: 'success'|'error'|'info', text }
  const [confirmRenderAll, setConfirmRenderAll] = useState(false);

  const showToast = (kind, text, ms = 5000) => {
    setToast({ kind, text });
    window.clearTimeout(showToast._t);
    if (ms) showToast._t = window.setTimeout(() => setToast(null), ms);
  };

  // Detect standalone preview route on initial load
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/preview/')) {
      const id = path.split('/')[2];
      setIsPreviewRoute(true);
      setPreviewId(id);
      setPreviewTemplate(new URLSearchParams(window.location.search).get('template'));
    }
  }, []);

  // Fetch all card records, templates, and settings from Express API
  useEffect(() => {
    loadCards();
    loadTemplatesConfig();
    loadGlobalSettings();
    loadSetsConfig();
    loadBackgrounds();
  }, []);

  const loadTemplatesConfig = async () => {
    try {
      const response = await fetch('/api/templates-config');
      const data = await response.json();
      setTemplatesConfig(data);
    } catch (err) {
      console.error('Error loading templates config:', err);
    }
  };

  const loadBackgrounds = async () => {
    try {
      const response = await fetch('/api/backgrounds');
      const data = await response.json();
      if (Array.isArray(data)) setBackgrounds(data);
    } catch (err) {
      console.error('Error loading backgrounds:', err);
    }
  };

  const loadSetsConfig = async () => {
    try {
      const response = await fetch('/api/sets-config');
      const data = await response.json();
      setSetsConfig(data);
    } catch (err) {
      console.error('Error loading sets config:', err);
    }
  };

  const saveSetsConfig = async (config) => {
    const response = await fetch('/api/sets-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    if (!response.ok) throw new Error('Failed to save sets config');
    setSetsConfig(config);
    return response.json();
  };

  const loadGlobalSettings = async () => {
    try {
      const response = await fetch('/api/global-settings');
      const data = await response.json();
      setGlobalSettings(data);
      applyGlobalSettingsStyles(data);
    } catch (err) {
      console.error('Error loading global settings:', err);
    }
  };

  // Load any Google Fonts referenced by set definitions. CardPreview gates its
  // data-ready flag on document.fonts.ready, so injecting the stylesheet here is
  // enough for Playwright to capture cards with the correct set font applied.
  useEffect(() => {
    const families = getSetFontFamilies(setsConfig);
    if (families.length === 0) return;

    const href = 'https://fonts.googleapis.com/css2?' +
      families.map(f => `family=${encodeURIComponent(f).replace(/%20/g, '+')}`).join('&') +
      '&display=swap';

    const existing = document.getElementById('set-fonts');
    if (existing && existing.getAttribute('href') === href) return;

    const link = existing || document.createElement('link');
    link.id = 'set-fonts';
    link.rel = 'stylesheet';
    link.href = href;
    if (!existing) document.head.appendChild(link);
  }, [setsConfig]);

  const applyGlobalSettingsStyles = (settings) => {
    if (!settings) return;
    const root = document.documentElement;
    if (settings.symbolVerticalAlign) root.style.setProperty('--ms-vertical-align', settings.symbolVerticalAlign);
    if (settings.symbolSize) root.style.setProperty('--ms-size', settings.symbolSize);
    if (settings.symbolSizeHeader) root.style.setProperty('--ms-size-header', settings.symbolSizeHeader);
    if (settings.symbolSizeRules) root.style.setProperty('--ms-size-rules', settings.symbolSizeRules);
    if (settings.symbolMarginLeft) root.style.setProperty('--ms-margin-left', settings.symbolMarginLeft);
    if (settings.symbolMarginRight) root.style.setProperty('--ms-margin-right', settings.symbolMarginRight);
    if (settings.innerGlyphScale) root.style.setProperty('--ms-inner-scale', settings.innerGlyphScale);
    if (settings.innerGlyphOffsetX) root.style.setProperty('--ms-inner-offset-x', settings.innerGlyphOffsetX);
    if (settings.innerGlyphOffsetY) root.style.setProperty('--ms-inner-offset-y', settings.innerGlyphOffsetY);
    // Generic/colourless mana draws numerals and is tuned separately.
    // Compared with `!= null` so a legitimate '0'/'0rem' still applies.
    if (settings.innerGlyphScaleNumeric != null) root.style.setProperty('--ms-inner-scale-numeric', settings.innerGlyphScaleNumeric);
    if (settings.innerGlyphOffsetXNumeric != null) root.style.setProperty('--ms-inner-offset-x-numeric', settings.innerGlyphOffsetXNumeric);
    if (settings.innerGlyphOffsetYNumeric != null) root.style.setProperty('--ms-inner-offset-y-numeric', settings.innerGlyphOffsetYNumeric);
  };

  const loadCards = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cards');
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        setCards(data);
      } else {
        throw new Error('Data format returned is not a card array');
      }
    } catch (err) {
      console.error('Error loading cards:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Save full cards array back to cards.json
  const saveCardsArray = async (cardsToSave) => {
    try {
      const response = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cardsToSave)
      });
      if (!response.ok) {
        throw new Error('Save operation failed on backend');
      }
      setHasUnsavedChanges(false);
      return true;
    } catch (err) {
      console.error('Error saving cards.json:', err);
      showToast('error', `Error saving to cards.json: ${err.message}`, 12000);
      return false;
    }
  };

  const handleCardChange = (updatedCard) => {
    const updatedList = cards.map(c => c.id === updatedCard.id ? updatedCard : c);
    setCards(updatedList);
    setHasUnsavedChanges(true);
  };

  const handleSaveClick = async () => {
    const success = await saveCardsArray(cards);
    if (success) {
      showToast('success', 'Saved to cards.json.');
    }
  };

  const handleDeleteCard = async (id) => {
    const updatedList = cards.filter(c => c.id !== id);
    setCards(updatedList);
    setSelectedId(null);
    await saveCardsArray(updatedList);
  };

  const handleDuplicateCard = async (id) => {
    const sourceCard = cards.find(c => c.id === id);
    if (!sourceCard) return;

    let copyId = `${sourceCard.id}_copy`;
    let counter = 1;
    while (cards.some(c => c.id === copyId)) {
      copyId = `${sourceCard.id}_copy${counter}`;
      counter++;
    }

    const copyCard = {
      ...sourceCard,
      id: copyId,
      name: `${sourceCard.name} (Copy)`,
      metadata: { 
        ...(sourceCard.metadata || {}),
        template: sourceCard.metadata?.template || 'modern'
      }
    };

    const updatedList = [...cards, copyCard];
    setCards(updatedList);
    setSelectedId(copyId);
    await saveCardsArray(updatedList);
  };

  const handleCreateCard = async (newCard, andEdit = false) => {
    const updatedList = [...cards, newCard];
    setCards(updatedList);
    setSelectedId(newCard.id);
    if (andEdit) {
      setCurrentView('catalog');
    }
    await saveCardsArray(updatedList);
  };

  const handleGenerateImage = async (id) => {
    setIsGenerating(true);
    // Make sure latest state is saved to JSON file first so express server reads it correctly!
    await saveCardsArray(cards);
    
    try {
      const response = await fetch(`/api/cards/generate/${id}`, {
        method: 'POST'
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || 'Playwright screenshot process exited with errors.');
      }
      return data.log;
    } catch (err) {
      console.error('Error generating card image:', err);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  };

  // Two-step: the first click arms the button, the second starts the render.
  // Replaces the old confirm() dialog, which a browser-level block turned into
  // an automatic "no" and made this button appear to do nothing.
  const handleGenerateAllImages = async () => {
    if (!confirmRenderAll) {
      setConfirmRenderAll(true);
      window.clearTimeout(handleGenerateAllImages._t);
      handleGenerateAllImages._t = window.setTimeout(() => setConfirmRenderAll(false), 6000);
      return;
    }
    window.clearTimeout(handleGenerateAllImages._t);
    setConfirmRenderAll(false);

    setGlobalGenerateLoading(true);
    showToast('info', `Rendering ${cards.length} cards — this takes a minute…`, 0);
    await saveCardsArray(cards);
    try {
      const response = await fetch('/api/cards/generate-all', { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        const failed = (data.log || '').split(String.fromCharCode(10)).filter(l => l.startsWith('Failed'));
        if (failed.length) {
          showToast('error', `${data.message}. Failed: ${failed.map(l => l.split(' ')[1]).join(', ')}`, 12000);
        } else {
          showToast('success', data.message || 'All card images rendered.');
        }
      } else {
        showToast('error', `Render failed: ${data.details || data.error || response.status}`, 12000);
      }
    } catch (err) {
      showToast('error', `Network error rendering cards: ${err.message}`, 12000);
    } finally {
      setGlobalGenerateLoading(false);
    }
  };

  // Find active card from list
  const activeCard = cards.find(c => c.id === selectedId);

  /* Prev/next navigation through the catalog's visible order.
     CardGrid reports what it is showing; that list survives the grid
     unmounting when a card is opened. Ids that no longer exist (deleted or
     renamed) are dropped, and we fall back to the full catalog if the grid has
     not reported yet — e.g. when a card is opened straight from a fresh load. */
  const navList = (visibleIds.length ? visibleIds : cards.map(c => c.id))
    .filter(id => cards.some(c => c.id === id));
  const navIndex = navList.indexOf(selectedId);

  const goToCard = (delta) => {
    if (navIndex === -1) return;
    const next = navList[navIndex + delta];
    if (!next) return;
    if (hasUnsavedChanges) {
      showToast('info', 'You have unsaved changes — click Save JSON to write them to disk.');
    }
    setSelectedId(next);
  };

  // Arrow keys step between cards, but never while typing into a field.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      e.preventDefault();
      goToCard(e.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Standalone Preview Routing Render Path
  if (isPreviewRoute) {
    if (loading) {
      return <div style={{ backgroundColor: 'transparent', minHeight: '100vh' }} />;
    }
    const previewCard = cards.find(c => c.id === previewId);
    if (!previewCard) {
      return (
        <div style={{ color: 'red', fontFamily: 'monospace', padding: '2rem' }}>
          Card ID "{previewId}" not found in cards.json
        </div>
      );
    }
    return (
      <div 
        style={{ 
          margin: 0, 
          padding: 0, 
          display: 'inline-block', 
          backgroundColor: 'transparent', 
          overflow: 'hidden',
          width: '744px',
          height: '1039px'
        }}
      >
        <CardPreview card={previewCard} scale={1.0} templateOverride={previewTemplate} templatesConfig={templatesConfig} globalSettings={globalSettings} setsConfig={setsConfig} />
      </div>
    );
  }



  return (
    <div className="app-container">
      {/* Global Navigation Header */}
      <header className="app-header">
        <div className="app-title-group">
          {selectedId && (
            <button 
              className="btn btn-secondary" 
              style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              onClick={() => {
                if (hasUnsavedChanges) {
                  showToast('info', 'You have unsaved changes — click Save JSON to write them to disk.');
                }
                setSelectedId(null);
              }}
            >
              <ArrowLeft size={16} /> Back
            </button>
          )}

          {/* Step through the catalog without going back to the grid. Order and
              scope match whatever the catalog was showing (set, search, filters). */}
          {selectedId && navList.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.5rem' }}>
              <button
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.6rem', height: '36px' }}
                onClick={() => goToCard(-1)}
                disabled={navIndex <= 0}
                title="Previous card (←)"
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: '68px', textAlign: 'center' }}>
                {navIndex + 1} / {navList.length}
              </span>
              <button
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.6rem', height: '36px' }}
                onClick={() => goToCard(1)}
                disabled={navIndex === -1 || navIndex >= navList.length - 1}
                title="Next card (→)"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
          <h1 className="app-title">
            <Layers size={22} style={{ color: 'var(--border-focus)' }} />
            <span>MTG Custom Card Editor</span>
          </h1>
          <div style={{ display: 'flex', gap: '0.75rem', marginLeft: '1.5rem' }}>
            <button 
              className={`btn ${currentView === 'catalog' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', height: '36px' }}
              onClick={() => setCurrentView('catalog')}
            >
              Card Catalog
            </button>
            <button
              className={`btn ${currentView === 'metadata' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', height: '36px' }}
              onClick={() => setCurrentView('metadata')}
            >
              Card Metadata
            </button>
            <button
              className={`btn ${currentView === 'templates' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', height: '36px' }}
              onClick={() => setCurrentView('templates')}
            >
              Template Styles
            </button>
            <button
              className={`btn ${currentView === 'sets' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', height: '36px' }}
              onClick={() => setCurrentView('sets')}
            >
              Set Styles
            </button>
            <button
              className={`btn ${currentView === 'settings' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', height: '36px' }}
              onClick={() => setCurrentView('settings')}
            >
              Master Settings
            </button>
            <button 
              className={`btn ${currentView === 'ai' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', height: '36px', display: 'flex', gap: '0.25rem', alignItems: 'center' }}
              onClick={() => setCurrentView('ai')}
            >
              <Sparkles size={14} /> AI Lab
            </button>
          </div>
        </div>

        {/* Global actions */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {hasUnsavedChanges && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--accent-gold)', fontSize: '0.85rem', fontWeight: '600' }}>
              <AlertTriangle size={16} /> Unsaved Changes
            </div>
          )}
          
          {!selectedId && cards.length > 0 && (
            <button
              className={`btn ${confirmRenderAll ? 'btn-primary' : 'btn-secondary'}`}
              onClick={handleGenerateAllImages}
              disabled={globalGenerateLoading}
              title={confirmRenderAll
                ? 'Click again to start rendering'
                : `Re-render PNGs for all ${cards.length} cards`}
              style={{ display: 'flex', gap: '0.5rem', whiteSpace: 'nowrap' }}
            >
              {globalGenerateLoading ? <div className="spinner" /> : <Sparkles size={16} />}
              {globalGenerateLoading
                ? 'Rendering…'
                : confirmRenderAll
                  ? `Render ${cards.length} cards?`
                  : 'Render All PNGs'}
            </button>
          )}

          <button 
            className="btn btn-primary" 
            onClick={handleSaveClick}
            disabled={!hasUnsavedChanges}
            style={{ display: 'flex', gap: '0.5rem' }}
          >
            <Save size={16} /> Save JSON
          </button>
        </div>
      </header>

      {toast && (
        <div
          className="animate-fade-in"
          onClick={() => setToast(null)}
          title="Dismiss"
          style={{
            position: 'fixed', bottom: '1.25rem', left: '50%', transform: 'translateX(-50%)',
            zIndex: 9999, maxWidth: 'min(680px, 92vw)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.6rem',
            padding: '0.7rem 1.1rem', borderRadius: '10px', fontSize: '0.88rem',
            color: 'var(--text-primary)',
            background: 'var(--bg-card)',
            boxShadow: 'var(--shadow-lg)',
            borderLeft: `4px solid ${
              toast.kind === 'success' ? 'var(--accent-green)'
              : toast.kind === 'error' ? 'var(--accent-red)'
              : 'var(--border-focus)'}`,
            border: '1px solid var(--border-color)'
          }}
        >
          {toast.kind === 'error'
            ? <AlertTriangle size={16} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
            : <Sparkles size={16} style={{ color: toast.kind === 'success' ? 'var(--accent-green)' : 'var(--border-focus)', flexShrink: 0 }} />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Main Content Layout */}
      <main className="app-main">
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', gap: '1rem' }}>
            <div className="spinner" style={{ width: '40px', height: '40px', borderWidth: '3px' }} />
            <span style={{ color: 'var(--text-muted)' }}>Loading cards database...</span>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '3rem', border: '1px solid var(--accent-red)', borderRadius: '12px', background: 'rgba(218, 58, 53, 0.1)', maxWidth: '500px', margin: '4rem auto' }}>
            <h2 style={{ color: 'var(--accent-red)', marginBottom: '0.5rem' }}>Failed to Load cards.json</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>{error}</p>
            <button className="btn btn-primary" onClick={loadCards}>Retry</button>
          </div>
        ) : (!selectedId || currentView !== 'catalog') ? (
          <>
            {currentView === 'catalog' && (
              <div className="animate-fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.5rem' }}>Card Catalog</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Currently managing {cards.length} custom card configurations</p>
                  </div>
                </div>
                
                <CardGrid
                  showToast={showToast}
                  cards={cards}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onCreateCard={handleCreateCard}
                  setsConfig={setsConfig}
                  templatesConfig={templatesConfig}
                  globalSettings={globalSettings}
                  activeSet={activeSet}
                  onEnterSet={setActiveSet}
                  onVisibleCardsChange={setVisibleIds}
                  onCardChange={handleCardChange}
                />
              </div>
            )}
            {currentView === 'metadata' && (
              <CardMetadataPage
                cards={cards}
                setsConfig={setsConfig}
                view={metadataView}
                onViewChange={setMetadataView}
                onOpenCard={(id) => {
                  setSelectedId(id);
                  setCurrentView('catalog');
                }}
              />
            )}
            {currentView === 'templates' && (
              <TemplatesConfigPage
                  showToast={showToast}
                templatesConfig={templatesConfig} 
                onChange={setTemplatesConfig} 
                onSave={loadTemplatesConfig} 
                cards={cards} 
                globalSettings={globalSettings}
              />
            )}
            {currentView === 'sets' && (
              <SetsConfigPage
                  showToast={showToast}
                setsConfig={setsConfig}
                cards={cards}
                backgrounds={backgrounds}
                onSave={saveSetsConfig}
              />
            )}

            {currentView === 'settings' && (
              <MasterSettingsPage
                  showToast={showToast}
                globalSettings={globalSettings} 
                onChange={setGlobalSettings} 
                onSave={loadGlobalSettings} 
                onApply={applyGlobalSettingsStyles} 
              />
            )}
            {currentView === 'ai' && (
              <AICardGenerator 
                  showToast={showToast}
                cards={cards}
                onImportCard={handleCreateCard}
                activeCard={activeCard}
                onAssignArt={(filename) => {
                  if (activeCard) {
                    handleCardChange({ ...activeCard, art_path: filename });
                  }
                }}
              />
            )}
          </>
        ) : (
          /* Single Card Edit Drill-down Split Screen View */
          <div className="detail-layout animate-fade-in">
            
            {/* Left side Sticky Preview */}
            <div className="preview-sticky-container">
              <div style={{ alignSelf: 'flex-start' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Interactive Preview</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Realtime HTML/CSS representation of your card layout</p>
              </div>

              {activeCard && (
                <div style={{ padding: '1.5rem 2.5rem', backgroundColor: '#050811', border: '1px solid var(--border-color)', borderRadius: '20px', boxShadow: 'var(--shadow-inset)', display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <CardPreview card={activeCard} scale={0.5} templatesConfig={templatesConfig} globalSettings={globalSettings} setsConfig={setsConfig} />
                </div>
              )}
            </div>

            {/* Right side Editor Form */}
            {activeCard && (
              <CardForm 
                  showToast={showToast}
                card={activeCard}
                onChange={handleCardChange}
                onSave={handleSaveClick}
                onDelete={handleDeleteCard}
                onDuplicate={handleDuplicateCard}
                onGenerate={handleGenerateImage}
                isGenerating={isGenerating}
                templatesConfig={templatesConfig}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
