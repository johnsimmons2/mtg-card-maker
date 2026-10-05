import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Terminal, Wand2, Image as ImageIcon, Check, RefreshCw, AlertCircle, Info, ChevronRight, Shuffle } from 'lucide-react';

export default function AICardGenerator({ cards, onImportCard, activeCard, onAssignArt, showToast = () => {}}) {
  const [activeTab, setActiveTab] = useState('wholesale'); // 'wholesale' | 'chain' | 'madlibs' | 'art'
  
  // Models list
  const [llmModels, setLlmModels] = useState([]);
  const [diffusionModels, setDiffusionModels] = useState([]);
  const [selectedLlm, setSelectedLlm] = useState('');
  const [selectedDiff, setSelectedDiff] = useState('');
  const [serverStatus, setServerStatus] = useState({ online: false, checking: true });

  // Mode 2 state
  const [wholesaleConcept, setWholesaleConcept] = useState('');
  const [wholesaleLoading, setWholesaleLoading] = useState(false);
  const [wholesaleLogs, setWholesaleLogs] = useState([]);
  const [wholesaleCard, setWholesaleCard] = useState(null);
  
  // Mode 3 & 4 state
  const [chainConcept, setChainConcept] = useState('');
  const [chainLoading, setChainLoading] = useState(false);
  const [chainStep, setChainStep] = useState(0); // 0: idle, 1: concept, 2: rules, 3: stats/final
  const [chainResults, setChainResults] = useState(null);
  const [currentAgentId, setCurrentAgentId] = useState('');
  const [chainLogs, setChainLogs] = useState([]);

  // Mode 1 state
  const [artPrompt, setArtPrompt] = useState('');
  const [artNegative, setArtNegative] = useState('blurry, low quality, bad anatomy, text, watermark');
  const [artSteps, setArtSteps] = useState(20);
  const [artScale, setArtScale] = useState(7.5);
  const [artWidth, setArtWidth] = useState(1024);
  const [artHeight, setArtHeight] = useState(1024);
  const [artLoading, setArtLoading] = useState(false);
  const [artStatusMessage, setArtStatusMessage] = useState('');
  const [generatedArt, setGeneratedArt] = useState(null);
  const [artFilename, setArtFilename] = useState('');

  // Timer state for metrics
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef(null);

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const startTime = Date.now();
    setElapsedTime(0);
    timerRef.current = setInterval(() => {
      setElapsedTime(parseFloat(((Date.now() - startTime) / 1000).toFixed(1)));
    }, 100);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const getTerminalTime = () => {
    const date = new Date();
    return date.toLocaleTimeString([], { hour12: false }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
  };

  const formatTime = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour12: false }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
    } catch (e) {
      return getTerminalTime();
    }
  };

  // Terminal autoscroll
  const terminalEndRef = useRef(null);

  useEffect(() => {
    fetchAIStatus();
    return () => stopTimer();
  }, []);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [wholesaleLogs, chainLogs, artStatusMessage]);

  const fetchAIStatus = async () => {
    setServerStatus(prev => ({ ...prev, checking: true }));
    try {
      const statusRes = await fetch('/api/ai/status');
      if (statusRes.ok) {
        const modelsRes = await fetch('/api/ai/models');
        const models = await modelsRes.json();
        
        setLlmModels(models.llm || []);
        setDiffusionModels(models.diffusion || []);
        
        // Pick default models
        if (models.llm && models.llm.length > 0) {
          const loadedLlm = models.llm.find(m => m.loaded);
          setSelectedLlm(loadedLlm ? loadedLlm.name : models.llm[0].name);
        } else {
          setSelectedLlm('llama3.2');
        }

        if (models.diffusion && models.diffusion.length > 0) {
          const loadedDiff = models.diffusion.find(m => m.loaded);
          setSelectedDiff(loadedDiff ? loadedDiff.name : models.diffusion[0].name);
        } else {
          setSelectedDiff('stabilityai/stable-diffusion-xl-base-1.0');
        }
        
        setServerStatus({ online: true, checking: false });
      } else {
        setServerStatus({ online: false, checking: false });
      }
    } catch (err) {
      console.error('AI status query failed:', err);
      setServerStatus({ online: false, checking: false });
    }
  };

  // Poll logs for active agent step
  const pollAgentLogs = (agentId, setLogsState, interval = 1000) => {
    const pollId = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/agent-logs/${agentId}`);
        if (res.ok) {
          const logs = await res.json();
          // Filter logs to show thoughts or activity
          const filtered = logs.map(l => {
            const timePrefix = `[${formatTime(l.timestamp)}]`;
            if (l.type === 'spawn') return `${timePrefix} Spawned agent ${l.content.agent_id} (${l.content.role})`;
            if (l.type === 'step_info' && l.content.event === 'start') return `${timePrefix} Step started (model: ${l.content.model})`;
            if (l.type === 'step_info' && l.content.event === 'end') return `${timePrefix} Step completed`;
            if (l.type === 'thought') return `${timePrefix} Thought: ${l.content}`;
            if (l.type === 'tool_call') return `${timePrefix} [Tool Call] Running ${l.content.tool}...`;
            if (l.type === 'tool_result') return `${timePrefix} [Tool Result] Done.`;
            if (l.type === 'oracle_request') return `${timePrefix} [Oracle] Getting Cloud model guidance...`;
            return null;
          }).filter(Boolean);
          setLogsState(filtered);
        }
      } catch (err) {
        console.error('Error polling agent logs:', err);
      }
    }, interval);
    return pollId;
  };

  // Run wholesale creator (Mode 2)
  const handleWholesaleGenerate = async () => {
    setWholesaleLoading(true);
    startTimer();
    const startTime = Date.now();
    setWholesaleLogs([
      `[${getTerminalTime()}] Spawning card designer agent...`,
      `[${getTerminalTime()}] Waking Ollama engine...`
    ]);
    setWholesaleCard(null);

    const tempAgentId = `designer-${Math.floor(Math.random() * 9000 + 1000)}`;
    const pollInterval = pollAgentLogs(tempAgentId, setWholesaleLogs);

    try {
      const response = await fetch('/api/ai/generate-card-wholesale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: wholesaleConcept,
          model: selectedLlm,
          agentId: tempAgentId
        })
      });
      const data = await response.json();
      clearInterval(pollInterval);
      stopTimer();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (response.ok) {
        setWholesaleLogs(prev => [
          ...prev, 
          `[${getTerminalTime()}] Card design complete! Parsing specifications...`, 
          `[${getTerminalTime()}] Ready for import.`,
          `---`,
          `[${getTerminalTime()}] Success! Total execution time: ${elapsed}s`
        ]);
        setWholesaleCard(data);
      } else {
        setWholesaleLogs(prev => [
          ...prev, 
          `[${getTerminalTime()}] ERROR: ${data.details || data.error}`,
          `---`,
          `[${getTerminalTime()}] Failed! Total execution time: ${elapsed}s`
        ]);
      }
    } catch (err) {
      clearInterval(pollInterval);
      stopTimer();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      setWholesaleLogs(prev => [
        ...prev, 
        `[${getTerminalTime()}] ERROR: ${err.message}`,
        `---`,
        `[${getTerminalTime()}] Failed! Total execution time: ${elapsed}s`
      ]);
    } finally {
      setWholesaleLoading(false);
    }
  };

  // Run Chain (Mode 3 and 4)
  const handleChainGenerate = async (isMadlibs) => {
    setChainLoading(true);
    setChainResults(null);
    setChainStep(1);
    startTimer();
    const startTime = Date.now();
    setChainLogs([
      `[${getTerminalTime()}] Starting chaos pipeline...`,
      `[${getTerminalTime()}] Deploying Agent 1: Concept Creator...`
    ]);

    const runId = Math.floor(Math.random() * 9000 + 1000);
    const endpoint = isMadlibs ? '/api/ai/mode4-chain' : '/api/ai/mode3-chain';
    
    // Periodically query AITest control status to see who is active and query their logs
    let activeAgentId = `concept-creator-${runId}`;
    setCurrentAgentId(activeAgentId);

    const logPoller = setInterval(async () => {
      try {
        // Query active agents
        const statusRes = await fetch('/api/ai/status');
        if (statusRes.ok) {
          const status = await statusRes.json();
          const activeAgent = status.agents.find(a => a.agent_id.endsWith(runId.toString()));
          if (activeAgent && activeAgent.agent_id !== activeAgentId) {
            activeAgentId = activeAgent.agent_id;
            setCurrentAgentId(activeAgentId);
            
            // Advance UI visual steps
            if (activeAgentId.startsWith('rules-designer')) {
              setChainStep(2);
              setChainLogs(prev => [...prev, '---', `[${getTerminalTime()}] Agent 1 complete. Deploying Agent 2: Rules Designer...`]);
            } else if (activeAgentId.startsWith('stats-architect')) {
              setChainStep(3);
              setChainLogs(prev => [...prev, '---', `[${getTerminalTime()}] Agent 2 complete. Deploying Agent 3: Stats Architect...`]);
            }
          }
        }

        // Fetch logs for current active agent
        if (activeAgentId) {
          const logsRes = await fetch(`/api/ai/agent-logs/${activeAgentId}`);
          if (logsRes.ok) {
            const logs = await logsRes.json();
            const thoughts = logs.filter(l => l.type === 'thought').map(l => {
              return `[${formatTime(l.timestamp)}] Thought: ${l.content}`;
            });
            if (thoughts.length > 0) {
              setChainLogs(prev => {
                const base = prev.filter(l => !l.includes('Thought:'));
                return [...base, ...thoughts];
              });
            }
          }
        }
      } catch (err) {
        console.error('Error during log polling:', err);
      }
    }, 1500);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: chainConcept,
          model: selectedLlm,
          runId: runId
        })
      });
      const data = await response.json();
      clearInterval(logPoller);
      stopTimer();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (response.ok) {
        setChainLogs(prev => [
          ...prev, 
          '---', 
          `[${getTerminalTime()}] Chain compilation finished successfully!`, 
          `[${getTerminalTime()}] Card loaded.`,
          `---`,
          `[${getTerminalTime()}] Success! Total execution time: ${elapsed}s`
        ]);
        setChainResults(data);
        setChainStep(4);
      } else {
        setChainLogs(prev => [
          ...prev, 
          `---`, 
          `[${getTerminalTime()}] CHAIN ERROR: ${data.details || data.error}`,
          `---`,
          `[${getTerminalTime()}] Failed! Total execution time: ${elapsed}s`
        ]);
        setChainStep(0);
      }
    } catch (err) {
      clearInterval(logPoller);
      stopTimer();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      setChainLogs(prev => [
        ...prev, 
        `---`, 
        `[${getTerminalTime()}] CHAIN ERROR: ${err.message}`,
        `---`,
        `[${getTerminalTime()}] Failed! Total execution time: ${elapsed}s`
      ]);
      setChainStep(0);
    } finally {
      setChainLoading(false);
    }
  };

  // Run Direct Art Generation (Mode 1)
  const handleArtGenerate = async () => {
    setArtLoading(true);
    setGeneratedArt(null);
    setArtStatusMessage('[VRAM Bridge] Unloading Ollama LLMs to free VRAM for stable diffusion...');

    try {
      const response = await fetch('/api/ai/generate-art', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: artPrompt,
          model: selectedDiff,
          width: artWidth,
          height: artHeight,
          steps: artSteps,
          guidance_scale: artScale,
          negative_prompt: artNegative,
          imageName: artFilename
        })
      });
      
      setArtStatusMessage('[AI Engine] Loading Stable Diffusion pipeline... (This might take a minute on first use)');
      const data = await response.json();

      if (response.ok) {
        setArtStatusMessage('[VRAM Bridge] Art completed! Unloading diffusion pipeline to restore LLM capabilities...');
        setGeneratedArt(data);
      } else {
        setArtStatusMessage(`ERROR: ${data.details || data.error}`);
      }
    } catch (err) {
      setArtStatusMessage(`ERROR: ${err.message}`);
    } finally {
      setArtLoading(false);
    }
  };

  // Assign generated art to wholesale cards or the current selected editor card
  const assignArtToCard = (filename) => {
    if (activeCard) {
      onAssignArt(filename);
      showToast('success', `Assigned "${filename}" to ${activeCard.name}.`);
    } else {
      showToast('error', 'No card is selected in the main editor to assign this art to.');
    }
  };

  // Quick prompt copy helper
  const loadPromptFromCard = () => {
    if (activeCard) {
      const defaultName = activeCard.name
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, '_')
        .replace(/_+/g, '_');
      setArtFilename(defaultName);

      if (activeCard.metadata && activeCard.metadata.art_prompt) {
        setArtPrompt(activeCard.metadata.art_prompt);
      } else {
        setArtPrompt(`A detailed fantasy card art illustration of ${activeCard.name}, ${activeCard.type_line || ''}, fantasy card art style, detailed digital painting, dramatic lighting, epic composition, fantasy illustration, MTG style`);
      }
    }
  };

  const renderTerminal = (logs) => {
    return (
      <div className="terminal-container" style={{
        backgroundColor: '#0c0f17',
        color: '#39ff14',
        fontFamily: 'monospace',
        fontSize: '0.85rem',
        padding: '1rem',
        borderRadius: '8px',
        border: '1px solid #1f2e4d',
        height: '220px',
        overflowY: 'auto',
        boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem'
      }}>
        {logs.length === 0 ? (
          <div style={{ color: '#5f759e' }}>// Terminal idle. Spawn an agent to stream live thoughts...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{ 
              color: log.startsWith('ERROR') ? '#ff3131' : (log.startsWith('Thought:') ? '#e2e8f0' : (log.startsWith('---') ? '#5f759e' : '#39ff14')),
              whiteSpace: 'pre-wrap'
            }}>
              {log}
            </div>
          ))
        )}
        <div ref={terminalEndRef} />
      </div>
    );
  };

  const renderCardImportSection = (cardData, onImport) => {
    if (!cardData) return null;
    return (
      <div style={{
        marginTop: '1.25rem',
        padding: '1rem',
        borderRadius: '10px',
        backgroundColor: '#0e1424',
        border: '1px dashed var(--border-focus)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Wand2 size={18} style={{ color: 'var(--border-focus)' }} />
            Generated Card Specs
          </h3>
          <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: 'var(--border-focus)', color: '#000', fontWeight: 'bold' }}>
            {cardData.mana_cost || 'No Cost'}
          </span>
        </div>
        
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <p><strong>Name:</strong> {cardData.name || 'Untitled'}</p>
          <p><strong>Type:</strong> {cardData.type_line || 'Type-less'}</p>
          <p style={{ margin: '0.5rem 0', background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '4px' }}>
            <strong>Rules:</strong> <em>{cardData.rules_text || 'Vanilla.'}</em>
          </p>
          {cardData.power_toughness && <p><strong>P/T:</strong> {cardData.power_toughness}</p>}
          {cardData.metadata?.art_prompt && (
            <p style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.5rem' }}>
              <strong>AI Art Prompt:</strong> {cardData.metadata.art_prompt}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button 
              className="btn btn-primary"
              onClick={() => {
                onImport(cardData, true);
              }}
              style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', fontWeight: 'bold' }}
              title="Import and open in card editor split-screen"
            >
              ✨ Import & Edit Card
            </button>
            
            <button 
              className="btn btn-secondary"
              onClick={() => {
                onImport(cardData, false);
                showToast('success', `Imported "${cardData.name}" into the catalog.`);
              }}
              style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem' }}
            >
              Import Only
            </button>
          </div>
          
          {cardData.metadata?.art_prompt && (
            <button 
              className="btn btn-secondary"
              onClick={() => {
                const defaultFilename = cardData.name
                  ? cardData.name.toLowerCase().replace(/[^a-z0-9_.-]/g, '_').replace(/_+/g, '_')
                  : '';
                setArtFilename(defaultFilename);
                setArtPrompt(cardData.metadata.art_prompt);
                setActiveTab('art');
              }}
              style={{ fontSize: '0.85rem', padding: '0.5rem', width: '100%' }}
              title="Copy prompt & open Art Studio"
            >
              Paint Art
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="panel animate-fade-in" style={{ gap: '1.25rem', height: '100%', overflowY: 'auto' }}>
      <div className="panel-header" style={{ paddingBottom: '0.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={20} style={{ color: 'var(--border-focus)' }} />
            Local AI Lab
          </h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {serverStatus.checking ? 'Locating server...' : (serverStatus.online ? '🟢 AITest Sandbox Online' : '🔴 AI Server Offline (Run start.ps1 in AITest)')}
          </span>
        </div>
        
        <button 
          className="btn btn-secondary" 
          onClick={fetchAIStatus} 
          disabled={wholesaleLoading || chainLoading || artLoading}
          style={{ padding: '0.5rem' }}
          title="Refresh AI Status"
        >
          <RefreshCw size={14} className={serverStatus.checking ? 'spinner' : ''} />
        </button>
      </div>

      {/* Model select controls if server online */}
      {serverStatus.online && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: '#090d16', padding: '0.75rem', borderRadius: '8px', border: '1px solid #14223d' }}>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.7rem' }}>Ollama LLM (Card Designer)</label>
            <select 
              className="form-select" 
              style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
              value={selectedLlm}
              onChange={(e) => setSelectedLlm(e.target.value)}
              disabled={wholesaleLoading || chainLoading}
            >
              {llmModels.map(m => (
                <option key={m.name} value={m.name}>{m.name} ({m.loaded ? 'Active' : 'Unloaded'})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.7rem' }}>SD Model (Art Studio)</label>
            <select 
              className="form-select"
              style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
              value={selectedDiff}
              onChange={(e) => setSelectedDiff(e.target.value)}
              disabled={artLoading}
            >
              {diffusionModels.map(m => (
                <option key={m.name} value={m.name}>{m.name.split('/').pop()} ({m.loaded ? 'Active' : 'Unloaded'})</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Sub Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '0.75rem', overflowX: 'auto', paddingBottom: '2px' }}>
        <button 
          className={`btn ${activeTab === 'wholesale' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('wholesale')}
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
          disabled={!serverStatus.online}
        >
          Mode 2: Wholesale
        </button>
        <button 
          className={`btn ${activeTab === 'chain' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('chain')}
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
          disabled={!serverStatus.online}
        >
          Mode 3: Chaos Chain
        </button>
        <button 
          className={`btn ${activeTab === 'madlibs' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('madlibs')}
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
          disabled={!serverStatus.online}
        >
          Mode 4: Mad-Libs
        </button>
        <button 
          className={`btn ${activeTab === 'art' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('art')}
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
          disabled={!serverStatus.online}
        >
          Mode 1: Art Studio
        </button>
      </div>

      {/* TAB 1: Mode 2 Wholesale */}
      {activeTab === 'wholesale' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="animate-fade-in">
          <div className="form-group">
            <label className="form-label">Wholesale Card Concept Prompt</label>
            <textarea 
              className="form-textarea"
              placeholder="e.g. A blue sorcery that creates time rifts and allows players to redo their turns, with a downside of card discard."
              value={wholesaleConcept}
              onChange={(e) => setWholesaleConcept(e.target.value)}
              disabled={wholesaleLoading}
              style={{ minHeight: '80px' }}
            />
          </div>

          <button 
            className="btn btn-primary"
            onClick={handleWholesaleGenerate}
            disabled={wholesaleLoading || !wholesaleConcept.trim()}
            style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-start' }}
          >
            {wholesaleLoading ? <div className="spinner" /> : <Sparkles size={16} />}
            {wholesaleLoading ? `Generating... (${elapsedTime}s)` : 'Generate Card Wholesale'}
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Terminal size={14} /> Designer Agent Thought Stream
            </label>
            {renderTerminal(wholesaleLogs)}
          </div>

          {renderCardImportSection(wholesaleCard, onImportCard)}
        </div>
      )}

      {/* TAB 2: Mode 3 Chaos Chain */}
      {activeTab === 'chain' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="animate-fade-in">
          <div className="form-group">
            <label className="form-label">Initial Concept (Optional)</label>
            <input 
              type="text"
              className="form-input"
              placeholder="Leave empty for Agent 1 to invent a random concept..."
              value={chainConcept}
              onChange={(e) => setChainConcept(e.target.value)}
              disabled={chainLoading}
            />
          </div>

          <button 
            className="btn btn-primary"
            onClick={() => handleChainGenerate(false)}
            disabled={chainLoading}
            style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-start' }}
          >
            {chainLoading ? <div className="spinner" /> : <Shuffle size={16} />}
            Deploy Chaos Chain
          </button>

          {/* Stepper Progress */}
          {chainLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#0b1424', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #14223d', fontSize: '0.8rem' }}>
              <div className="spinner" style={{ width: '12px', height: '12px' }} />
              <span>
                {chainStep === 1 && `Agent 1 is creating the card concept... (${elapsedTime}s)`}
                {chainStep === 2 && `Agent 2 is crafting the rules text... (${elapsedTime}s)`}
                {chainStep === 3 && `Agent 3 is engineering costs & balancing stats... (${elapsedTime}s)`}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Terminal size={14} /> Agent-to-Agent Handoff Stream
            </label>
            {renderTerminal(chainLogs)}
          </div>

          {chainResults && (
            <div style={{ background: '#060a12', border: '1px solid #15223c', borderRadius: '8px', padding: '0.75rem', fontSize: '0.75rem', color: '#889ec4' }}>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem', fontWeight: 'bold' }}>Intermediate Hand-offs:</h4>
              <p>🟢 <strong>Agent 1 Concept:</strong> "{chainResults.steps.step1.concept}"</p>
              <p style={{ marginTop: '0.25rem' }}>🔵 <strong>Agent 2 Rules:</strong> {chainResults.steps.step2.rules}</p>
            </div>
          )}

          {chainResults && renderCardImportSection(chainResults.card, onImportCard)}
        </div>
      )}

      {/* TAB 3: Mode 4 Mad-Libs Chaos Mutation */}
      {activeTab === 'madlibs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="animate-fade-in">
          <div className="form-group">
            <label className="form-label">Initial Concept (Optional)</label>
            <input 
              type="text"
              className="form-input"
              placeholder="Leave empty for Agent 1 to invent a random concept..."
              value={chainConcept}
              onChange={(e) => setChainConcept(e.target.value)}
              disabled={chainLoading}
            />
          </div>

          <button 
            className="btn btn-primary"
            onClick={() => handleChainGenerate(true)}
            disabled={chainLoading}
            style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-start' }}
          >
            {chainLoading ? <div className="spinner" /> : <Shuffle size={16} />}
            Deploy Mad-Libs Chain
          </button>

          {/* Stepper Progress */}
          {chainLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#0b1424', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #14223d', fontSize: '0.8rem' }}>
              <div className="spinner" style={{ width: '12px', height: '12px' }} />
              <span>
                {chainStep === 1 && `Agent 1 concept generation + Mutation active... (${elapsedTime}s)`}
                {chainStep === 2 && `Agent 2 rules generation + Mutation active... (${elapsedTime}s)`}
                {chainStep === 3 && `Agent 3 stats balance and compilation... (${elapsedTime}s)`}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Terminal size={14} /> Mutating Chaos Logs
            </label>
            {renderTerminal(chainLogs)}
          </div>

          {chainResults && (
            <div style={{ background: '#0c0f17', border: '1px dashed #ff3131', borderRadius: '8px', padding: '0.75rem', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h4 style={{ color: '#ff3131', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Shuffle size={14} /> Mad-Libs Mutations Applied:
              </h4>
              <div style={{ color: '#889ec4' }}>
                <p><strong>Step 1: Concept Mutation</strong></p>
                <p style={{ textDecoration: 'line-through', opacity: 0.6 }}>Original: "{chainResults.steps.step1.concept}"</p>
                <p style={{ color: '#e2e8f0' }}>👉 Mutated Concept: <span style={{ color: 'var(--accent-gold)' }}>"{chainResults.steps.step1.mutated}"</span></p>
              </div>
              
              <div style={{ color: '#889ec4', borderTop: '1px solid #1f2e4d', paddingTop: '0.5rem' }}>
                <p><strong>Step 2: Rules Mutation</strong></p>
                <p style={{ textDecoration: 'line-through', opacity: 0.6 }}>Original: "{chainResults.steps.step2.rules}"</p>
                <p style={{ color: '#e2e8f0' }}>👉 Mutated Rules: <span style={{ color: 'var(--accent-gold)' }}>"{chainResults.steps.step2.mutated}"</span></p>
              </div>
            </div>
          )}

          {chainResults && renderCardImportSection(chainResults.card, onImportCard)}
        </div>
      )}

      {/* TAB 4: Mode 1 Art Studio */}
      {activeTab === 'art' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="animate-fade-in">
          {activeCard && (
            <div style={{ background: '#090d16', border: '1px solid #14223d', padding: '0.5rem 0.75rem', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <Info size={14} style={{ color: 'var(--border-focus)' }} />
                <span>Generating art for: <strong>{activeCard.name || 'Untitled'}</strong></span>
              </div>
              <button 
                className="btn btn-secondary" 
                onClick={loadPromptFromCard}
                style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}
              >
                Copy Specs
              </button>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Art Generation Prompt</label>
            <textarea 
              className="form-textarea"
              placeholder="e.g. A cybernetic owl flying through a digital forest, neon cyber-fantasy art style"
              value={artPrompt}
              onChange={(e) => setArtPrompt(e.target.value)}
              disabled={artLoading}
              style={{ minHeight: '60px' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Negative Prompt</label>
            <input 
              type="text"
              className="form-input"
              value={artNegative}
              onChange={(e) => setArtNegative(e.target.value)}
              disabled={artLoading}
              style={{ fontSize: '0.8rem' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Target Filename (Optional)</label>
            <input 
              type="text"
              className="form-input"
              placeholder="e.g. cyber_owl (will save as cyber_owl.png)"
              value={artFilename}
              onChange={(e) => setArtFilename(e.target.value)}
              disabled={artLoading}
              style={{ fontSize: '0.8rem' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Inference Steps ({artSteps})</label>
              <input 
                type="range"
                min="1"
                max="50"
                value={artSteps}
                onChange={(e) => setArtSteps(parseInt(e.target.value))}
                disabled={artLoading}
                style={{ width: '100%' }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">CFG Scale ({artScale})</label>
              <input 
                type="range"
                min="1"
                max="20"
                step="0.5"
                value={artScale}
                onChange={(e) => setArtScale(parseFloat(e.target.value))}
                disabled={artLoading}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Dimensions</label>
              <select 
                className="form-select"
                value={`${artWidth}x${artHeight}`}
                onChange={(e) => {
                  const [w, h] = e.target.value.split('x').map(Number);
                  setArtWidth(w);
                  setArtHeight(h);
                }}
                disabled={artLoading}
                style={{ fontSize: '0.8rem' }}
              >
                <option value="1024x1024">Square (1024 × 1024)</option>
                <option value="768x1024">Portrait (768 × 1024 - Card Rec.)</option>
                <option value="1024x768">Landscape (1024 × 768)</option>
                <option value="512x512">Low-res Square (512 × 512)</option>
              </select>
            </div>
            
            <button 
              className="btn btn-primary"
              onClick={handleArtGenerate}
              disabled={artLoading || !artPrompt.trim()}
              style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-end', height: '40px', justifyContent: 'center' }}
            >
              {artLoading ? <div className="spinner" /> : <ImageIcon size={16} />}
              Paint Image
            </button>
          </div>

          {/* VRAM status tracking logs */}
          {artStatusMessage && (
            <div style={{ 
              backgroundColor: '#0c0f17', 
              color: '#39ff14', 
              fontFamily: 'monospace', 
              fontSize: '0.8rem', 
              padding: '0.5rem 0.75rem', 
              borderRadius: '6px',
              border: '1px solid #14223d',
              whiteSpace: 'pre-wrap'
            }}>
              {artStatusMessage}
            </div>
          )}

          {generatedArt && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
              marginTop: '0.5rem',
              padding: '1rem',
              backgroundColor: '#090d16',
              border: '1px solid #14223d',
              borderRadius: '8px'
            }}>
              <img 
                src={generatedArt.url} 
                alt="Generated Art" 
                style={{
                  width: '100%',
                  maxWidth: '300px',
                  borderRadius: '6px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  border: '1px solid #1e2d4a'
                }}
              />
              
              <button 
                className="btn btn-primary"
                onClick={() => assignArtToCard(generatedArt.filename)}
                disabled={!activeCard}
                style={{ width: '100%', fontSize: '0.85rem' }}
              >
                Assign to Selected Card Art
              </button>
            </div>
          )}
        </div>
      )}

      {/* Server offline error */}
      {!serverStatus.online && !serverStatus.checking && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '2rem 1rem',
          backgroundColor: 'rgba(218, 58, 53, 0.05)',
          border: '1px solid rgba(218, 58, 53, 0.2)',
          borderRadius: '8px',
          gap: '0.75rem',
          marginTop: '1rem'
        }}>
          <AlertCircle size={32} style={{ color: 'var(--accent-red)' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>AITest Server Offline</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            To use local AI card design and art painting features, make sure Ollama is running, then start the AITest agent sandbox via powershell:
            <code style={{ display: 'block', background: '#111', padding: '0.4rem', margin: '0.5rem 0', borderRadius: '4px', color: '#eee' }}>
              cd C:\Users\jsim2\Documents\Development\AITest<br/>
              .\start.ps1
            </code>
          </p>
        </div>
      )}
    </div>
  );
}
