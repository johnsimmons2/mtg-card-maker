import React, { useState, useLayoutEffect, useRef } from 'react';
import '../templates/templates.css';
import {
  deriveColors,
  deriveFrameColor,
  deriveBoxTint,
  deriveThemeColors,
  resolveMulticolorRules,
  deriveTexture,
  TEXTURES,
  formatMtgText,
  sortManaCost,
  getArtUrl,
  getBackgroundUrl,
  getWatermarkUrl,
  resolveSetStyle,
  resolveSetRules,
  resolveSetPreset,
  resolveSetTemplate,
  resolveBackgroundPath,
  getRarityColor,
  COLORS,
  PALE_COLORS
} from '../utils/cardUtils';

export default function CardPreview({ card, templateOverride, scale = 0.5, templatesConfig, globalSettings, setsConfig }) {
  const cardRef = useRef(null);
  const [ready, setReady] = useState(false);

  if (!card) {
    return (
      <div className="preview-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        No Card Selected
      </div>
    );
  }

  // Template precedence: explicit override -> the card's own choice ->
  // the set's default template -> 'modern'.
  const currentTemplate = templateOverride
    || card.metadata?.template
    || resolveSetTemplate(card, setsConfig)
    || 'modern';

  // Preset precedence: template config, then the set's card defaults on top.
  // card.metadata is applied after this, so a per-card tweak still wins.
  const templatePreset = templatesConfig?.[currentTemplate] || {};
  const preset = resolveSetPreset(card, setsConfig, templatePreset);
  const baseType = preset.baseType || currentTemplate;

  // Set-wide policy (multicolour treatment, texture pool, palette).
  const setRules = resolveSetRules(card, setsConfig);

  // Derive all dynamic styles
  const frameColor = deriveFrameColor(card.mana_cost, card.type_line, card.name, card.rules_text, globalSettings, setRules, preset);
  const boxTint = deriveBoxTint(card.mana_cost, card.type_line, card.name, card.rules_text, globalSettings, setRules, preset);
  const { vibrant: themeVibrant, dark: themeDark } = deriveThemeColors(card.mana_cost, card.type_line, card.name, card.rules_text, globalSettings, setRules, preset);
  
  const textureName = deriveTexture(card.type_line);
  const texProfile = TEXTURES[textureName] || TEXTURES.parchment;
  
  // Custom frame background image overrides
  let frameTextureUrl = `url('${texProfile.data}')`;
  let blendMode = texProfile.blend;
  // Each texture profile carries the strength it reads correctly at.
  let frameTextureOpacity = `${texProfile.opacity ?? 0.26}`;
  let frameTextureSize = '420px';
  let frameTexturePosition = 'center';
  let frameTextureRepeat = 'repeat';

  // An explicit per-card background wins; otherwise the set's texture pool
  // assigns one deterministically from the card id.
  const backgroundPath = resolveBackgroundPath(card, setsConfig);

  if (backgroundPath) {
    frameTextureUrl = `url('${getBackgroundUrl(backgroundPath)}')`;
    // If the user specified a custom blend mode in metadata, use it, otherwise default to 'multiply' to colorize grayscale textures!
    blendMode = card.metadata?.backgroundBlendMode || 'multiply';
    frameTextureOpacity = card.metadata?.backgroundOpacity !== undefined ? `${card.metadata.backgroundOpacity}` : '0.85';
    frameTextureSize = 'cover';
    frameTexturePosition = 'center';
    frameTextureRepeat = 'no-repeat';
  }

  const parchmentBg = `url('${TEXTURES.parchment_bg.data}')`;
  
  const setDef = setsConfig?.[card.set_symbol] || null;
  const rarityColor = getRarityColor(card.rarity, setDef);

  // What the set symbol prints as, and how it is styled. A template preset can
  // still force a colour (setSymbolColor) or override the text (setSymbol).
  const setSymbol = resolveSetStyle(card, setsConfig, preset.setSymbolColor);
  const setSymbolLabel = preset.setSymbol || setSymbol.label;
  const setSymbolStyle = preset.setSymbolColor && !setSymbol.hasGradient
    ? { ...setSymbol.style, color: preset.setSymbolColor }
    : setSymbol.style;
  const setSymbolClass = `set-symbol${setSymbol.hasGradient ? ' set-symbol-gradient' : ''}`;

  const artUrl = getArtUrl(card.art_path);
  // Per-card watermark wins, then the set's / template's. This previously only
  // read the preset, so the documented per-card `watermark_path` never applied.
  const watermarkPath = card.watermark_path || preset.watermark_path;
  const watermarkUrl = watermarkPath ? `url('${getWatermarkUrl(watermarkPath)}')` : 'none';

  // Layout pass: fit the name, type line and rules text to their boxes.
  //
  // Configured sizes (card.metadata / template preset) are treated as a STARTING
  // size, never as a fixed one. Text is always shrunk from there until it fits.
  // Previously a preset font size disabled fitting entirely, which is why cards
  // with long rules text spilled over the frame.
  useLayoutEffect(() => {
    const cardEl = cardRef.current;
    if (!cardEl) return;

    setReady(false);

    const titleText = cardEl.querySelector('.card-name');
    const titleContainer = cardEl.querySelector('.card-name-container');
    const typeText = cardEl.querySelector('.type-line-text');
    const typeContainer = cardEl.querySelector('.type-line-container');
    const rulesClip = cardEl.querySelector('.rules-text-clip');
    const rulesText = cardEl.querySelector('.rules-text');

    // Shrink `el`'s font size from `startPx` until `fits()` reports true.
    // Steps by 0.5px, and bottoms out at `minPx` so it always terminates.
    const shrinkToFit = (el, startPx, minPx, fits) => {
      let size = startPx;
      el.style.fontSize = `${size}px`;
      while (size > minPx && !fits()) {
        size = Math.max(minPx, size - 0.5);
        el.style.fontSize = `${size}px`;
      }
      return size;
    };

    const defaultArtHeight = baseType === 'modern' ? 452 : 380;
    const initialArtHeight = card.metadata?.artHeight || preset.artHeight || defaultArtHeight;
    cardEl.style.setProperty('--art-box-height', `${initialArtHeight}px`);

    // 1. Card name — one line, never overlapping the mana cost.
    if (titleText && titleContainer) {
      const startSize = card.metadata?.nameFontSize || preset.nameFontSize || 34;
      shrinkToFit(titleText, startSize, 13, () => titleText.scrollWidth <= titleContainer.clientWidth);
    }

    // 2. Type line — single line on printed cards, so shrink rather than wrap.
    if (typeText && typeContainer) {
      const startSize = preset.typeFontSize || (baseType === 'modern' ? 25 : 22);
      shrinkToFit(typeText, startSize, 11, () => typeText.scrollWidth <= typeContainer.clientWidth);
    }

    // 3. Rules text — reclaim height from the art window first (which keeps the
    //    text as large and readable as possible), then shrink the type size.
    if (rulesText && rulesClip) {
      const startSize = card.metadata?.rulesFontSize || preset.rulesFontSize || (baseType === 'glass' ? 24 : 29);
      const fits = () => rulesText.scrollHeight <= rulesClip.clientHeight;

      rulesText.style.fontSize = `${startSize}px`;

      const canShrinkArt = ['modern', 'retro', 'glass'].includes(baseType) && !card.metadata?.artHeight;
      if (canShrinkArt) {
        const minArtHeight = Math.round(initialArtHeight * 0.62);
        let artHeight = initialArtHeight;
        while (artHeight > minArtHeight && !fits()) {
          artHeight = Math.max(minArtHeight, artHeight - 8);
          cardEl.style.setProperty('--art-box-height', `${artHeight}px`);
        }
      }

      shrinkToFit(rulesText, startSize, 10, fits);
    }

    // 4. Verification Check: Wait for all fonts and images to load before setting ready state
    const timer = setTimeout(() => {
      const images = cardEl.querySelectorAll('img');
      const loadPromises = Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      });

      Promise.all(loadPromises).then(() => {
        // Cover-scale: the factor that turns an object-fit: contain fit of the
        // art into a cover fit of its window. Art Zoom multiplies this, so
        // zoom 1x == a normal cover crop, zoom > 1x crops in further, and
        // zoom < 1x shrinks the *whole* picture — revealing the parts a plain
        // cover crop hides — rather than just scaling the crop down.
        const artBox = cardEl.querySelector('.modern-art-box, .retro-art-box, .glass-art-container, .borderless-art-bg');
        const artImg = artBox && artBox.querySelector('img');
        let coverScale = 1;
        if (artBox && artImg && artImg.naturalWidth && artImg.naturalHeight && artBox.clientHeight) {
          const boxAR = artBox.clientWidth / artBox.clientHeight;
          const imgAR = artImg.naturalWidth / artImg.naturalHeight;
          coverScale = Math.max(boxAR / imgAR, imgAR / boxAR);
        }
        cardEl.style.setProperty('--art-cover-scale', coverScale.toFixed(4));

        document.fonts.ready.then(() => {
          setReady(true);
        });
      });
    }, 50);

    return () => clearTimeout(timer);

    // setsConfig participates because set card defaults feed the preset above.
  }, [card, currentTemplate, templatesConfig, setsConfig]);

  // Derive Art Image offsets
  const artX = card.metadata?.artXOffset !== undefined ? card.metadata.artXOffset : 50;
  const artY = card.metadata?.artYOffset !== undefined ? card.metadata.artYOffset : (baseType === 'modern' ? 0 : 50);

  // Custom inline style variables
  const styleVars = {
    '--frame-bg': frameColor,
    '--frame-texture': frameTextureUrl,
    '--blend-mode': blendMode,
    '--frame-texture-opacity': frameTextureOpacity,
    '--frame-texture-size': frameTextureSize,
    '--frame-texture-position': frameTexturePosition,
    '--frame-texture-repeat': frameTextureRepeat,
    '--parchment': parchmentBg,
    '--box-tint': boxTint,
    '--card-theme-color-vibrant': themeVibrant,
    '--card-theme-color-dark': themeDark,
    '--rarity-color': rarityColor,
    '--watermark-image-url': watermarkUrl,
    '--art-object-position': `${artX}% ${artY}%`,

    // Art Zoom, multiplied by --art-cover-scale (set from the real image + box
    // dimensions in the layout effect). At 1x the picture covers the window as
    // before; above 1x it crops in; below 1x the whole picture shrinks and the
    // window's ::before shows a blurred copy of the art behind it, so panning
    // out reveals image the cover crop had hidden without the window resizing.
    '--art-scale': card.metadata?.artScale !== undefined ? card.metadata.artScale : 1,
    '--art-image-url': artUrl ? `url("${artUrl}")` : 'none',
    '--art-rotation': `${card.metadata?.artRotation !== undefined ? card.metadata.artRotation : 0}deg`,
    '--art-offset-x': `${card.metadata?.artOffsetX !== undefined ? card.metadata.artOffsetX : 0}px`,
    '--art-offset-y': `${card.metadata?.artOffsetY !== undefined ? card.metadata.artOffsetY : 0}px`,

    /* Per-card mana symbol sizes. These are the same custom properties the
       Master Settings page sets globally on :root; defining them here scopes the
       override to this card only. Left undefined they inherit the global value. */
    '--ms-size-header': card.metadata?.manaSymbolSize ? `${card.metadata.manaSymbolSize}em` : undefined,
    '--ms-size-rules': card.metadata?.rulesSymbolSize ? `${card.metadata.rulesSymbolSize}em` : undefined,
    
    // Title Box overrides
    '--title-box-height': preset.titleBoxHeight ? `${preset.titleBoxHeight}px` : undefined,
    '--title-box-width': preset.titleBoxWidth ? `${preset.titleBoxWidth}%` : undefined,
    '--title-box-margin-left': preset.titleBoxWidth && preset.titleBoxWidth < 100 ? 'auto' : undefined,
    '--title-box-margin-right': preset.titleBoxWidth && preset.titleBoxWidth < 100 ? 'auto' : undefined,
    
    // Type Box overrides
    '--type-box-height': preset.typeBoxHeight ? `${preset.typeBoxHeight}px` : undefined,
    '--type-box-width': preset.typeBoxWidth ? `${preset.typeBoxWidth}%` : undefined,
    '--type-box-margin-left': preset.typeBoxWidth && preset.typeBoxWidth < 100 ? 'auto' : undefined,
    '--type-box-margin-right': preset.typeBoxWidth && preset.typeBoxWidth < 100 ? 'auto' : undefined,
    
    // Security Stamp overrides — the stamp element is present in every template,
    // gated by this display var so "Show Security Acorn Stamp" works everywhere.
    '--stamp-display': preset.showStamp === false ? 'none' : 'flex',
    '--stamp-offset-y': preset.stampOffsetY !== undefined ? `${preset.stampOffsetY}px` : undefined,

    /* Acorn colour. Blank at every level means "inherit the rarity colour"
       (CSS falls back to --rarity-color). A per-card value wins over the set's
       cardDefaults, which win over the template preset. */
    '--stamp-acorn-color': (() => {
      const v = card.metadata?.stampAcornColor ?? preset.stampAcornColor;
      return v ? v : undefined;
    })(),

    // Borderless art scrim strength. Per-card metadata wins over the preset.
    '--overlay-gradient-opacity': (() => {
      const v = card.metadata?.overlayGradientOpacity ?? preset.overlayGradientOpacity;
      return v !== undefined && v !== '' ? v : undefined;
    })(),

    // Footer overrides
    '--footer-font-size': preset.footerFontSize ? `${preset.footerFontSize}px` : undefined,
    '--footer-text-color': preset.footerTextColor ? preset.footerTextColor : undefined,

    /* Archetype-specific knobs. Each maps to a CSS custom property that has a
       fallback in templates.css, so leaving one unset changes nothing. Only the
       vars for the active baseType have any effect. */
    '--modern-corner-radius': baseType === 'modern' && preset.cornerRadius !== undefined ? `${preset.cornerRadius}px` : undefined,
    '--modern-panel-gap': baseType === 'modern' && preset.panelGap !== undefined ? `${preset.panelGap}px` : undefined,
    '--modern-bevel-strength': baseType === 'modern' && preset.bevelStrength !== undefined ? preset.bevelStrength : undefined,

    '--retro-corner-radius': baseType === 'retro' && preset.cornerRadius !== undefined ? `${preset.cornerRadius}px` : undefined,
    '--retro-border-ink': baseType === 'retro' && preset.retroBorderInk ? preset.retroBorderInk : undefined,
    '--retro-plate-gradient-top': baseType === 'retro' && preset.retroPlateTop ? preset.retroPlateTop : undefined,
    '--retro-plate-gradient-bottom': baseType === 'retro' && preset.retroPlateBottom ? preset.retroPlateBottom : undefined,

    '--borderless-corner-radius': baseType === 'borderless' && preset.cornerRadius !== undefined ? `${preset.cornerRadius}px` : undefined,
    '--borderless-panel-opacity': baseType === 'borderless' && preset.borderlessPanelOpacity !== undefined ? preset.borderlessPanelOpacity : undefined,
    '--borderless-panel-blur': baseType === 'borderless' && preset.borderlessPanelBlur !== undefined ? `${preset.borderlessPanelBlur}px` : undefined,
    '--borderless-frame-width': baseType === 'borderless' && preset.borderlessShowFrame === false ? '0px' : undefined,

    '--glass-tint-opacity': baseType === 'glass' && preset.glassTintOpacity !== undefined ? preset.glassTintOpacity : undefined,
    '--glass-panel-blur': baseType === 'glass' && preset.glassPanelBlur !== undefined ? `${preset.glassPanelBlur}px` : undefined,
    '--glass-orb-display': baseType === 'glass' && preset.showOrbs === false ? 'none' : undefined
  };

  // Custom padding overrides (prioritize card metadata, then template preset)
  const rulesPaddingVal = card.metadata?.rulesPadding !== undefined ? card.metadata.rulesPadding : preset.rulesPadding;
  if (rulesPaddingVal !== undefined) {
    styleVars['--rules-padding'] = `${rulesPaddingVal}px`;
    const ratio = baseType === 'modern' ? 28/24 : (baseType === 'retro' ? 20/16 : 1);
    styleVars['--rules-padding-horizontal'] = `${Math.round(rulesPaddingVal * ratio)}px`;
  }

  // Custom border width overrides
  const borderWidthVal = card.metadata?.frameBorderWidth !== undefined ? card.metadata.frameBorderWidth : preset.frameBorderWidth;
  if (borderWidthVal !== undefined) {
    styleVars['--frame-border-width'] = `${borderWidthVal}px`;
  }

  // Add template specific values
  if (baseType === 'retro') {
    const forceSolid = card.metadata?.forceSolid !== undefined ? card.metadata.forceSolid : preset.forceSolid;
    if (forceSolid) {
      const singleColor = frameColor.includes('gradient') ? COLORS.pale : frameColor;
      styleVars['--frame-color-solid'] = singleColor;
      styleVars['--box-tint-retro'] = boxTint.includes('gradient') ? PALE_COLORS.pale : boxTint;
    } else {
      styleVars['--frame-color-solid'] = frameColor.includes('gradient') ? COLORS.pale : frameColor;
      styleVars['--box-tint-retro'] = boxTint.includes('gradient') ? PALE_COLORS.pale : boxTint;
    }
  } else if (baseType === 'glass') {
    let neonColor = '#00f5ff';
    let neonGlow = 'rgba(0, 245, 255, 0.4)';
    let neonGlowSecondary = 'rgba(255, 0, 127, 0.2)';

    const costUpper = (card.mana_cost || '').toUpperCase();
    if (costUpper.includes('{R}')) {
      neonColor = '#ff2a2a';
      neonGlow = 'rgba(255, 42, 42, 0.5)';
      neonGlowSecondary = 'rgba(255, 170, 0, 0.3)';
    } else if (costUpper.includes('{G}')) {
      neonColor = '#39ff14';
      neonGlow = 'rgba(57, 255, 20, 0.5)';
      neonGlowSecondary = 'rgba(0, 229, 255, 0.2)';
    } else if (costUpper.includes('{B}')) {
      neonColor = '#b026ff';
      neonGlow = 'rgba(176, 38, 255, 0.5)';
      neonGlowSecondary = 'rgba(17, 17, 17, 0.6)';
    } else if (costUpper.includes('{W}')) {
      neonColor = '#fffae6';
      neonGlow = 'rgba(255, 250, 230, 0.6)';
      neonGlowSecondary = 'rgba(0, 229, 255, 0.2)';
    }

    // Adjust glow intensity based on card metadata or template preset
    const glowIntensity = card.metadata?.neonGlowIntensity !== undefined ? parseFloat(card.metadata.neonGlowIntensity) : (preset.neonGlowIntensity !== undefined ? parseFloat(preset.neonGlowIntensity) : 1.0);
    if (glowIntensity !== 1.0) {
      neonGlow = neonGlow.replace(/([\d.]+)\)$/, (m, p1) => `${(parseFloat(p1) * glowIntensity).toFixed(2)})`);
      neonGlowSecondary = neonGlowSecondary.replace(/([\d.]+)\)$/, (m, p1) => `${(parseFloat(p1) * glowIntensity).toFixed(2)})`);
    }

    // Multicolour treatment for Glass. The glass frame is the gradient edge on
    // .glass-inner-border, not the flat --frame-bg the other templates use, so
    // the multicolour policy has to be applied to the neon accent here: a solid
    // colour pins the edge, a blend paints the card's colours around it.
    const glassColors = deriveColors(card.mana_cost, card.type_line, card.name, card.rules_text, globalSettings);
    if (glassColors.length > 1) {
      const mc = resolveMulticolorRules(preset, setRules);
      const pal = setRules?.palette?.COLORS || globalSettings?.palette?.COLORS || COLORS;
      const gold = globalSettings?.palette?.goldFrameEnd || '#c5a342';
      const hexes = glassColors.map(c => pal[c] || c);
      const a = `${mc.angle}deg`;

      if (mc.mode === 'solid') {
        neonColor = mc.solidColor || gold;
        styleVars['--glass-frame-gradient'] = `linear-gradient(${a}, ${neonColor}, ${neonColor})`;
      } else if (mc.mode === 'auto' && hexes.length > 2) {
        neonColor = gold;
        styleVars['--glass-frame-gradient'] = `linear-gradient(${a}, ${gold}, ${gold})`;
      } else {
        let stops = hexes;
        if (mc.mode === 'blend-capped' && hexes.length > mc.capThreshold && mc.capColors) {
          stops = mc.capColors;
        }
        neonColor = stops[Math.floor((stops.length - 1) / 2)] || stops[0];
        styleVars['--glass-frame-gradient'] = `linear-gradient(${a}, ${stops.join(', ')})`;
      }
    }

    // A template can pin the neon accent to one colour instead of letting it
    // track the card's mana colour. This wins over the multicolour blend above.
    if (preset.neonColorOverride) {
      neonColor = preset.neonColorOverride;
      styleVars['--glass-frame-gradient'] = `linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.02) 60%, ${neonColor})`;
    }

    styleVars['--neon-color'] = neonColor;
    styleVars['--neon-glow'] = neonGlow;
    styleVars['--neon-glow-secondary'] = neonGlowSecondary;
  }

  // Mana costs print in WUBRG order regardless of how they were typed.
  // This is display-only; cards.json keeps whatever was authored.
  const formattedMana = formatMtgText(sortManaCost(card.mana_cost));
  const formattedRules = formatMtgText(card.rules_text);
  const hasPT = Boolean(card.power_toughness && card.power_toughness.trim() !== '');

  // Holofoil acorn stamp. Rendered in every template; visibility is controlled
  // per-template by the --stamp-display var (set from preset.showStamp).
  const securityStamp = (
    <div className="security-stamp">
      <i className="ms ms-acorn" />
    </div>
  );

  return (
    <div 
      className="card-scale-container" 
      style={{ 
        width: `${744 * scale}px`, 
        height: `${1039 * scale}px`, 
        position: 'relative',
        overflow: 'visible' 
      }}
    >
      <div 
        ref={cardRef}
        className="preview-card" 
        data-ready={ready ? "true" : "false"}
        style={{ 
          transform: `scale(${scale})`, 
          transformOrigin: 'top left',
          position: 'absolute',
          top: 0,
          left: 0,
          ...styleVars 
        }}
      >
        {baseType === 'modern' && (
          <>
            <div className="template-modern">
              <div className="modern-pinstripe">
                <div className="modern-bar modern-header">
                  <div className="card-name-container">
                    <div className="card-name">{card.name || 'Unnamed Card'}</div>
                  </div>
                  <div className="mana-cost" dangerouslySetInnerHTML={{ __html: formattedMana }} />
                </div>

                <div className="modern-art-box">
                  {artUrl ? <img src={artUrl} alt="Card Art" /> : <div style={{ color: '#555' }}>No Art Selected</div>}
                </div>

                <div className="modern-bar modern-type-line">
                  <div className="type type-line-container">
                    <div className="type-line-text">{card.type_line || 'Type Line'}</div>
                  </div>
                  <div className={setSymbolClass} style={setSymbolStyle}>
                    {setSymbolLabel}
                  </div>
                </div>

                <div className={`modern-rules-box rules-box${hasPT ? ' has-pt' : ''}`}>
                  <div className="rules-text-clip">
                    <div className="modern-rules-text rules-text" dangerouslySetInnerHTML={{ __html: formattedRules }} />
                  </div>

                  {hasPT && (
                    <div className="modern-pt-box">
                      <span className="modern-pt-text">{card.power_toughness}</span>
                    </div>
                  )}

                  {securityStamp}
                </div>
              </div>
            </div>

            <div className="modern-footer">
              <div className="modern-footer-left">
                <div className="modern-artist-info">
                  {setSymbolLabel} &bull; EN &nbsp;<span className="brush-icon">🖌</span>&nbsp; {card.artist || 'Unknown Artist'}
                </div>
                <div className="modern-copyright">&trade; &amp; &copy; 2026 Wizards of the Coast</div>
              </div>
              <div className="modern-footer-right">
                <div className="modern-print-info">
                  001/001 &nbsp;&nbsp;{card.rarity || 'R'}
                </div>
              </div>
            </div>
          </>
        )}

        {baseType === 'retro' && (
          <div className="template-retro">
            <div className="retro-inner-frame">
              <div className="retro-header">
                <div className="card-name-container">
                  <div className="card-name">{card.name || 'Unnamed Card'}</div>
                </div>
                <div className="mana-cost" dangerouslySetInnerHTML={{ __html: formattedMana }} />
              </div>
              
              <div className="retro-art-box">
                {artUrl && <img src={artUrl} alt="Card Illustration" />}
              </div>
              
              <div className="retro-type-line">
                <div className="type-line-container">
                  <div className="type-line-text">{card.type_line || 'Type Line'}</div>
                </div>
                <div className={setSymbolClass} style={setSymbolStyle}>
                  {setSymbolLabel}
                </div>
              </div>

              <div className={`retro-rules-box rules-box${hasPT ? ' has-pt' : ''}`}>
                <div className="rules-text-clip">
                  <div className="rules-text" dangerouslySetInnerHTML={{ __html: formattedRules }} />
                </div>
                {hasPT && (
                  <div className="retro-pt-box">{card.power_toughness}</div>
                )}
                {securityStamp}
              </div>
            </div>
            
            <div className="retro-footer">
              <div>Illus. {card.artist || 'Unknown Artist'}</div>
              <div>{setSymbolLabel} &bull; {card.rarity || 'R'} &bull; &copy; 2026</div>
            </div>
          </div>
        )}

        {baseType === 'borderless' && (
          <div className="template-borderless">
            <div className="borderless-art-bg">
              {artUrl && <img src={artUrl} alt="Full bleed art" />}
            </div>
            <div className="borderless-art-overlay" />
            
            <div className="borderless-header">
              <div className="card-name-container">
                <div className="card-name">{card.name || 'Unnamed Card'}</div>
              </div>
              <div className="mana-cost" dangerouslySetInnerHTML={{ __html: formattedMana }} />
            </div>
            
            <div className="borderless-middle-spacer" />
            
            <div className="borderless-bottom-wrapper">
              <div className="borderless-type-line">
                <div className="type-line-container">
                  <div className="type-line-text">{card.type_line || 'Type Line'}</div>
                </div>
                <div className={setSymbolClass} style={setSymbolStyle}>
                  {setSymbolLabel}
                </div>
              </div>

              <div className={`borderless-rules-box rules-box${hasPT ? ' has-pt' : ''}`}>
                <div className="rules-text-clip">
                  <div className="rules-text" dangerouslySetInnerHTML={{ __html: formattedRules }} />
                </div>
                {hasPT && (
                  <div className="borderless-pt-box">{card.power_toughness}</div>
                )}
                {securityStamp}
              </div>
            </div>
            
            <div className="borderless-footer">
              <div>Illus. {card.artist || 'Unknown Artist'}</div>
              <div>001/001 &bull; {card.rarity || 'R'} &bull; &copy; 2026</div>
            </div>
          </div>
        )}

        {baseType === 'glass' && (
          <div className="template-glass">
            <div className="glass-glow-orb glass-orb-top" />
            <div className="glass-glow-orb glass-orb-bottom" />
            <div className="glass-inner-border" />
            
            <div className="glass-header">
              <div className="card-name-container">
                <div className="card-name">{card.name || 'Unnamed Card'}</div>
              </div>
              <div className="mana-cost" dangerouslySetInnerHTML={{ __html: formattedMana }} />
            </div>
            
            <div className="glass-art-container">
              {artUrl && <img src={artUrl} alt="Card Art" />}
            </div>
            
            <div className="glass-type-line">
              <div className="type-line-container">
                <div className="type-line-text">{card.type_line || 'Type Line'}</div>
              </div>
              <div className={setSymbolClass} style={{
                filter: `drop-shadow(0 0 4px ${preset.setSymbolColor || rarityColor})`,
                ...setSymbolStyle
              }}>
                {setSymbolLabel}
              </div>
            </div>

            <div className={`glass-rules-box rules-box${hasPT ? ' has-pt' : ''}`}>
              <div className="rules-text-clip">
                <div className="rules-text" dangerouslySetInnerHTML={{ __html: formattedRules }} />
              </div>
              {hasPT && (
                <div className="glass-pt-box">{card.power_toughness}</div>
              )}
              {securityStamp}
            </div>
            
            <div className="glass-footer">
              <div>ILLUS. {card.artist?.toUpperCase() || 'UNKNOWN ARTIST'}</div>
              <div>{card.rarity || 'R'} &bull; &copy; 2026</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
