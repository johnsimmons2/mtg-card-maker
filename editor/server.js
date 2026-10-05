import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Overridable so a second instance can be run alongside the dev server.
const PORT = process.env.PORT || 3001;

// Paths relative to this script inside mtg-cards/editor/
const ROOT_DIR = path.resolve(__dirname, '..');
// cards/ holds user-specific content (cards.json, sets_config.json, art/); it is untracked.
const CARDS_DIR = path.join(ROOT_DIR, 'cards');
const CARDS_JSON_PATH = path.join(CARDS_DIR, 'cards.json');
const ART_DIR = path.join(CARDS_DIR, 'art');
const BACKGROUNDS_DIR = path.join(ART_DIR, 'backgrounds');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const MANA_MASTER_DIR = path.join(ROOT_DIR, 'mana-master');
const TEMPLATES_CONFIG_PATH = path.join(ROOT_DIR, 'templates_config.json');
const GLOBAL_SETTINGS_PATH = path.join(ROOT_DIR, 'global_settings.json');
const SETS_CONFIG_PATH = path.join(CARDS_DIR, 'sets_config.json');

// Ensure necessary directories exist (cards/ is untracked, so a fresh clone lacks most of it)
if (!fs.existsSync(CARDS_DIR)) {
  fs.mkdirSync(CARDS_DIR, { recursive: true });
}
if (!fs.existsSync(ART_DIR)) {
  fs.mkdirSync(ART_DIR, { recursive: true });
}
if (!fs.existsSync(BACKGROUNDS_DIR)) {
  fs.mkdirSync(BACKGROUNDS_DIR, { recursive: true });
}
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static resources
app.use('/api/images/art', express.static(ART_DIR));
app.use('/api/images/backgrounds', express.static(BACKGROUNDS_DIR));
app.use('/api/images/output', express.static(OUTPUT_DIR));
app.use('/api/mana-master', express.static(MANA_MASTER_DIR));

/* ------------------------------------------------------------------
   Uploads

   Previously these used multer.diskStorage, which streams the request body
   straight to its final path. When an upload connection was cut early (a page
   reload / HMR while the request was in flight, the user switching cards mid
   upload, a proxy reset), multer's completion callback never fired but the
   partial bytes it had already flushed were left on disk at the real filename —
   a truncated image, its size landing on an OS write-flush boundary (a multiple
   of 32 KB). Nothing cleaned it up and the route never saw an error.

   Now the body is buffered in memory and only committed once the full request
   has arrived (req.complete), written to a temp file and atomically renamed
   into place. A cut-off upload leaves nothing behind.
   ------------------------------------------------------------------ */

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });
const uploadBackground = upload;

// "My Cool Art.PNG" -> "my_cool_art.png"
function safeUploadName(originalname) {
  const ext = path.extname(originalname).toLowerCase();
  const stem = path.basename(originalname, path.extname(originalname))
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${stem || 'image'}${ext}`;
}

// Write buffer to destDir/name via a temp file + rename, so a crash or a second
// writer can never expose a half-written file at the real path. Returns the
// final absolute path.
function commitUpload(buffer, destDir, name) {
  fs.mkdirSync(destDir, { recursive: true });
  const finalPath = path.join(destDir, name);
  const tmpPath = path.join(destDir, `.${name}.${process.pid}.${Date.now()}.part`);
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, finalPath);
  return finalPath;
}

// Guard shared by the upload routes: reject anything where the HTTP body did
// not fully arrive, so a truncated transfer is never persisted.
function assertCompleteUpload(req, res) {
  if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
    res.status(400).json({ error: 'No file uploaded' });
    return false;
  }
  if (req.complete === false) {
    res.status(499).json({ error: 'Upload was interrupted before the whole file arrived. Nothing was saved — please try again.' });
    return false;
  }
  return true;
}

// Turn multer's own errors (e.g. file too large) into JSON instead of Express'
// default HTML error page.
function handleUpload(mw) {
  return (req, res, next) => mw(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooBig ? 413 : 400).json({
      error: tooBig ? `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB upload limit` : 'Upload failed',
      details: err.message,
    });
  });
}

/* ------------------------------------------------------------------
   Output layout

   Every render is filed under a set directory: output/<SET>/<id>.png, so a
   set's cards stay together. A card with no set_symbol goes to output/<UNSET>/
   rather than the output/ root, so the top level only ever holds set folders.

   Set codes and card ids are user-supplied, so both are sanitised before being
   used as path segments — otherwise a code containing a slash could write
   outside output/.
   ------------------------------------------------------------------ */

// Folder for cards that have no set_symbol assigned.
const UNSET_DIR_NAME = '_unset';

function sanitizeSegment(value) {
  return String(value || '').replace(/[^A-Za-z0-9._-]/g, '_');
}

function outputPathForCard(card) {
  const code = sanitizeSegment(card?.set_symbol || '') || UNSET_DIR_NAME;
  const dir = path.join(OUTPUT_DIR, code);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${sanitizeSegment(card.id)}.png`);
}

// PNGs under output/, as paths relative to it (e.g. "JBA/jotaro.png").
function listOutputFiles(dir = OUTPUT_DIR, prefix = '') {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listOutputFiles(path.join(dir, entry.name), rel));
    else if (entry.name.toLowerCase().endsWith('.png')) out.push(rel);
  }
  return out;
}

// Drop renders of the same card left in other folders — e.g. after the card was
// moved to a different set — so output/ never holds two copies of one card.
function pruneOtherRenders(cardId, keepPath) {
  const name = `${sanitizeSegment(cardId)}.png`;
  const keep = path.resolve(keepPath);
  for (const rel of listOutputFiles()) {
    const full = path.join(OUTPUT_DIR, rel);
    if (path.basename(full) === name && path.resolve(full) !== keep) {
      try { fs.unlinkSync(full); } catch (err) {
        console.warn(`[output] could not remove stale render ${rel}:`, err.message);
      }
    }
  }
}

// API Endpoint: Get all cards
app.get('/api/cards', (req, res) => {
  try {
    // A fresh clone has no cards.json yet: that's an empty collection, not an error.
    if (!fs.existsSync(CARDS_JSON_PATH)) {
      return res.json([]);
    }
    const data = fs.readFileSync(CARDS_JSON_PATH, 'utf8');
    const cards = JSON.parse(data);
    res.json(cards);
  } catch (error) {
    console.error('Error reading cards.json:', error);
    res.status(500).json({ error: 'Failed to read cards.json', details: error.message });
  }
});

// API Endpoint: Save all cards
app.post('/api/cards', (req, res) => {
  try {
    const cards = req.body;
    if (!Array.isArray(cards)) {
      return res.status(400).json({ error: 'Invalid data format. Expected an array of cards.' });
    }
    fs.writeFileSync(CARDS_JSON_PATH, JSON.stringify(cards, null, 2), 'utf8');
    res.json({ message: 'cards.json saved successfully', count: cards.length });
  } catch (error) {
    console.error('Error writing cards.json:', error);
    res.status(500).json({ error: 'Failed to save cards.json', details: error.message });
  }
});

// API Endpoint: List art images. With ?set=CODE, lists the art/<CODE>/ subfolder
// instead of the top-level art folder (returns [] if that subfolder is absent).
// Filenames are returned bare; callers prefix "<CODE>/" themselves when storing.
app.get('/api/art', (req, res) => {
  try {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
    const setCode = sanitizeSegment(req.query.set || '');
    const dir = setCode ? path.join(ART_DIR, setCode) : ART_DIR;
    if (!fs.existsSync(dir)) {
      return res.json([]);
    }
    const images = fs.readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile() && imageExtensions.includes(path.extname(entry.name).toLowerCase()))
      .map(entry => entry.name);
    res.json(images);
  } catch (error) {
    console.error('Error listing art folder:', error);
    res.status(500).json({ error: 'Failed to list art assets', details: error.message });
  }
});

// API Endpoint: List output PNG files
app.get('/api/output-list', (req, res) => {
  try {
    // Relative paths, so callers can both identify the card (basename) and
    // locate the file (e.g. "JBA/jotaro.png").
    res.json(listOutputFiles());
  } catch (error) {
    res.status(500).json({ error: 'Failed to list outputs' });
  }
});

// API Endpoint: Upload card art. Optional ?set=CODE files it under art/<CODE>/.
app.post('/api/art/upload', handleUpload(upload.single('artImage')), (req, res) => {
  try {
    if (!assertCompleteUpload(req, res)) return;

    const setCode = sanitizeSegment(req.query.set || '');
    const destDir = setCode ? path.join(ART_DIR, setCode) : ART_DIR;
    const name = safeUploadName(req.file.originalname);
    commitUpload(req.file.buffer, destDir, name);

    // When uploaded into a per-set subfolder, art_path must carry the "<CODE>/"
    // prefix so the asset resolves under art/<CODE>/.
    const relPath = setCode ? `${setCode}/${name}` : name;
    res.json({
      message: 'Art image uploaded successfully',
      filename: relPath,
      url: `/api/images/art/${relPath}`
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload art image', details: error.message });
  }
});

// API Endpoint: List background images
app.get('/api/backgrounds', (req, res) => {
  try {
    const files = fs.readdirSync(BACKGROUNDS_DIR);
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
    const images = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });
    res.json(images);
  } catch (error) {
    console.error('Error listing backgrounds folder:', error);
    res.status(500).json({ error: 'Failed to list background assetsValue', details: error.message });
  }
});

// API Endpoint: Upload background image
app.post('/api/backgrounds/upload', handleUpload(uploadBackground.single('backgroundImage')), (req, res) => {
  try {
    if (!assertCompleteUpload(req, res)) return;

    const name = safeUploadName(req.file.originalname);
    commitUpload(req.file.buffer, BACKGROUNDS_DIR, name);
    res.json({
      message: 'Background image uploaded successfully',
      filename: name,
      url: `/api/images/backgrounds/${name}`
    });
  } catch (error) {
    console.error('Error uploading background image:', error);
    res.status(500).json({ error: 'Failed to upload background image', details: error.message });
  }
});

// API Endpoint: Get templates config
app.get('/api/templates-config', (req, res) => {
  try {
    if (!fs.existsSync(TEMPLATES_CONFIG_PATH)) {
      return res.json({});
    }
    const data = fs.readFileSync(TEMPLATES_CONFIG_PATH, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading templates config:', error);
    res.status(500).json({ error: 'Failed to read templates config', details: error.message });
  }
});

// API Endpoint: Save templates config
app.post('/api/templates-config', (req, res) => {
  try {
    const config = req.body;
    fs.writeFileSync(TEMPLATES_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    res.json({ message: 'Templates config saved successfully' });
  } catch (error) {
    console.error('Error saving templates config:', error);
    res.status(500).json({ error: 'Failed to save templates config', details: error.message });
  }
});

// API Endpoint: Get sets config (per-set symbol text and styling)
app.get('/api/sets-config', (req, res) => {
  try {
    if (!fs.existsSync(SETS_CONFIG_PATH)) {
      return res.json({});
    }
    const data = fs.readFileSync(SETS_CONFIG_PATH, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading sets config:', error);
    res.status(500).json({ error: 'Failed to read sets config', details: error.message });
  }
});

// API Endpoint: Save sets config
app.post('/api/sets-config', (req, res) => {
  try {
    const config = req.body;
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      return res.status(400).json({ error: 'Invalid data format. Expected an object keyed by set code.' });
    }
    fs.writeFileSync(SETS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    res.json({ message: 'Sets config saved successfully', count: Object.keys(config).length });
  } catch (error) {
    console.error('Error saving sets config:', error);
    res.status(500).json({ error: 'Failed to save sets config', details: error.message });
  }
});

// API Endpoint: Get global settings
app.get('/api/global-settings', (req, res) => {
  try {
    if (!fs.existsSync(GLOBAL_SETTINGS_PATH)) {
      return res.json({});
    }
    const data = fs.readFileSync(GLOBAL_SETTINGS_PATH, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading global settings:', error);
    res.status(500).json({ error: 'Failed to read global settings', details: error.message });
  }
});

// API Endpoint: Save global settings
app.post('/api/global-settings', (req, res) => {
  try {
    const settings = req.body;
    fs.writeFileSync(GLOBAL_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
    res.json({ message: 'Global settings saved successfully' });
  } catch (error) {
    console.error('Error saving global settings:', error);
    res.status(500).json({ error: 'Failed to save global settings', details: error.message });
  }
});

// API Endpoint: Generate PNG for a specific card using Node Playwright
app.post('/api/cards/generate/:id', async (req, res) => {
  const cardId = req.params.id;
  
  if (!/^[a-z0-9_.-]+$/i.test(cardId)) {
    return res.status(400).json({ error: 'Invalid card ID character sequence' });
  }

  const FRONTEND_URL = 'http://localhost:3000';
  let browser;
  try {
    console.log(`[Node Playwright] Launching browser to render card: ${cardId}`);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Set standard viewport
    await page.setViewportSize({ width: 800, height: 1100 });
    
    const targetUrl = `${FRONTEND_URL}/preview/${cardId}`;
    console.log(`[Node Playwright] Navigating to: ${targetUrl}`);
    await page.goto(targetUrl);
    
    // Wait for the card component to set data-ready="true" (indicating image & font load complete)
    console.log(`[Node Playwright] Waiting for data-ready indicator...`);
    await page.waitForSelector('.preview-card[data-ready="true"]', { timeout: 12000 });
    
    // Take a screenshot of the card bounding element, filed under its set.
    const cardElement = page.locator('.preview-card');
    const allCards = JSON.parse(fs.readFileSync(CARDS_JSON_PATH, 'utf8'));
    const cardRecord = allCards.find(c => c.id === cardId) || { id: cardId };
    const outputPath = outputPathForCard(cardRecord);
    await cardElement.screenshot({ path: outputPath });
    // If the card changed sets, drop the render left in the old folder.
    pruneOtherRenders(cardId, outputPath);
    const relPath = path.relative(OUTPUT_DIR, outputPath).split(path.sep).join('/');
    
    console.log(`[Node Playwright] Saved PNG successfully to: ${outputPath}`);

    res.json({ 
      message: `Card image generated successfully via Node Playwright`, 
      cardId: cardId,
      outputPath: `/api/images/output/${relPath}?t=${Date.now()}`,
      exists: true,
      log: `Node Playwright: Screenshot generated for card ID "${cardId}".`
    });
  } catch (error) {
    console.error(`[Node Playwright] Error rendering card:`, error);
    res.status(500).json({ 
      error: 'Failed to render card image using Node Playwright', 
      details: error.message
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// API Endpoint: Generate all PNGs sequentially
app.post('/api/cards/generate-all', async (req, res) => {
  const FRONTEND_URL = 'http://localhost:3000';
  let browser;
  try {
    if (!fs.existsSync(CARDS_JSON_PATH)) {
      return res.status(404).json({ error: 'cards.json not found' });
    }
    const data = fs.readFileSync(CARDS_JSON_PATH, 'utf8');
    const cards = JSON.parse(data);

    console.log(`[Node Playwright] Rendering ${cards.length} cards...`);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 800, height: 1100 });

    let count = 0;
    let logLines = [];

    for (const card of cards) {
      if (!card.id) continue;
      
      console.log(`[Node Playwright] Navigating to: ${card.name} (${card.id})`);
      try {
        await page.goto(`${FRONTEND_URL}/preview/${card.id}`);
        await page.waitForSelector('.preview-card[data-ready="true"]', { timeout: 10000 });
        
        const cardElement = page.locator('.preview-card');
        const outputPath = outputPathForCard(card);
        await cardElement.screenshot({ path: outputPath });
        pruneOtherRenders(card.id, outputPath);
        count++;
        logLines.push(`Rendered ${card.id}`);
      } catch (err) {
        console.error(`Failed rendering card ${card.id}:`, err);
        logLines.push(`Failed ${card.id}: ${err.message}`);
      }
    }

    res.json({ 
      message: `Successfully rendered ${count}/${cards.length} card images`, 
      log: logLines.join('\n')
    });
  } catch (error) {
    console.error(`[Node Playwright] Error rendering all cards:`, error);
    res.status(500).json({ 
      error: 'Failed to generate all card images', 
      details: error.message
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// ==========================================
// AI Sandbox Integration & Chaos Chain API
// ==========================================
const AITEST_URL = 'http://127.0.0.1:8000';

// Word lists for Mode 4 Mutation (MTG themes to chaos)
const NOUNS_LIST = ['creature', 'goblin', 'wizard', 'artifact', 'land', 'spells', 'spell', 'player', 'card', 'graveyard', 'battlefield', 'hand', 'library', 'token', 'tokens', 'game', 'planes', 'ocean', 'forest', 'mountain', 'swamp', 'island', 'captain', 'pirate', 'dragon', 'beast', 'warrior', 'power', 'toughness', 'turn', 'end step', 'upkeep', 'combat', 'damage', 'life'];
const ADJECTIVES_LIST = ['legendary', 'mythic', 'creative', 'balanced', 'powerful', 'ancient', 'blue', 'red', 'black', 'white', 'green', 'colorless', 'flash', 'flying', 'trample', 'vigilance', 'haste', 'shroud', 'carefree', 'sticky', 'soggy', 'greasy'];
const VERBS_LIST = ['cast', 'play', 'sacrifice', 'draw', 'discard', 'destroy', 'exile', 'tap', 'untap', 'create', 'returns', 'gain', 'lose', 'deals', 'attacks', 'blocks', 'enters', 'leaves', 'control', 'controls'];

const CHAOS_NOUNS = ['quasar', 'toaster', 'spaghetti', 'wombat', 'potato', 'banana', 'cabbage', 'hamster', 'octopus', 'muffin', 'jellyfish', 'broccoli', 'saucepan', 'pineapple', 'lawnmower', 'nacho', 'marshmallow', 'flamingo'];
const CHAOS_ADJECTIVES = ['sticky', 'soggy', 'greasy', 'bizarre', 'microscopic', 'rubbery', 'cosmic', 'glowing', 'fluffy', 'pixelated', 'cardboard', 'wiggly', 'bouncy', 'wobbly', 'exploding', 'confused', 'smelly'];
const CHAOS_VERBS = ['dances', 'whispers', 'wobbles', 'screams', 'giggles', 'slumbers', 'transcends', 'glides', 'dissolves', 'tickles', 'sneezes', 'tumbles', 'snorts', 'splashes'];

// Helper to mutate exactly one word in a sentence
function mutateText(text) {
  if (!text) return text;
  
  const tokens = text.split(/(\b\w+\b)/);
  const candidates = [];

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i].toLowerCase();
    if (NOUNS_LIST.includes(word)) {
      candidates.push({ index: i, type: 'noun' });
    } else if (ADJECTIVES_LIST.includes(word)) {
      candidates.push({ index: i, type: 'adjective' });
    } else if (VERBS_LIST.includes(word)) {
      candidates.push({ index: i, type: 'verb' });
    }
  }

  // Fallback if no matching common words: choose a random word >= 4 characters
  if (candidates.length === 0) {
    for (let i = 0; i < tokens.length; i++) {
      if (/\b\w{4,}\b/.test(tokens[i])) {
        candidates.push({ index: i, type: 'noun' });
      }
    }
  }

  if (candidates.length > 0) {
    const choice = candidates[Math.floor(Math.random() * candidates.length)];
    const originalWord = tokens[choice.index];
    let newWord = originalWord;
    
    if (choice.type === 'noun') {
      newWord = CHAOS_NOUNS[Math.floor(Math.random() * CHAOS_NOUNS.length)];
    } else if (choice.type === 'adjective') {
      newWord = CHAOS_ADJECTIVES[Math.floor(Math.random() * CHAOS_ADJECTIVES.length)];
    } else if (choice.type === 'verb') {
      newWord = CHAOS_VERBS[Math.floor(Math.random() * CHAOS_VERBS.length)];
    }

    // Preserve first letter capitalization
    if (originalWord && originalWord[0] === originalWord[0].toUpperCase()) {
      newWord = newWord[0].toUpperCase() + newWord.slice(1);
    }
    
    console.log(`[Mutation Chaos] Mutating "${originalWord}" -> "${newWord}"`);
    tokens[choice.index] = newWord;
  }

  return tokens.join('');
}

// Unload all loaded LLM models from Ollama via AITest API to free VRAM
async function unloadAllLLMs() {
  try {
    console.log('[VRAM Manager] Querying active AITest control status...');
    const res = await fetch(`${AITEST_URL}/api/control/status`);
    if (!res.ok) return;
    const data = await res.json();
    
    // First, pause any auto-mode agents so they don't immediately reload models
    if (data.agents && Array.isArray(data.agents)) {
      for (const agent of data.agents) {
        if (agent.mode === 'auto') {
          console.log(`[VRAM Manager] Agent ${agent.agent_id} is in auto mode. Pausing it first...`);
          await fetch(`${AITEST_URL}/api/control/mode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent_id: agent.agent_id, mode: 'chat' })
          });
        }
      }
    }

    // Collect all unique model names that are currently loaded
    const modelsToUnload = new Set();
    
    // Add models currently assigned to agents
    if (data.agents && Array.isArray(data.agents)) {
      for (const agent of data.agents) {
        if (agent.model) {
          modelsToUnload.add(agent.model);
        }
      }
    }
    
    // Add models currently loaded in Ollama's VRAM
    if (data.models && Array.isArray(data.models)) {
      for (const modelInfo of data.models) {
        if (modelInfo.loaded && modelInfo.name) {
          modelsToUnload.add(modelInfo.name);
        }
      }
    }
    
    // Unload all collected models
    for (const modelName of modelsToUnload) {
      console.log(`[VRAM Manager] Unloading Ollama LLM model: ${modelName}`);
      await fetch(`${AITEST_URL}/api/control/unload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName })
      });
    }
  } catch (err) {
    console.error('[VRAM Manager] Error unloading active LLMs:', err.message);
  }
}

// Unload the diffusion model pipeline in AITest
async function unloadDiffusion() {
  try {
    console.log('[VRAM Manager] Unloading active diffusion pipeline model...');
    await fetch(`${AITEST_URL}/api/diffusion/unload`, {
      method: 'POST'
    });
  } catch (err) {
    console.error('[VRAM Manager] Error unloading diffusion pipeline:', err.message);
  }
}

// Helper to resolve which model to use (falling back to Ollama's active models if empty)
async function resolveSelectedModel(model) {
  let selected = model;
  if (!selected) {
    try {
      const res = await fetch(`${AITEST_URL}/api/control/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.models && data.models.length > 0) {
          selected = data.models[0].name;
        }
      }
    } catch (e) {
      console.warn('[Model Resolver] Failed to fetch status models:', e.message);
    }
  }
  return selected || 'qwen3.5:27b';
}

// Spawn an agent inside AITest
async function spawnAgentSync(agentId, role, model, systemPrompt, goal) {
  console.log(`[Agent Sync] Spawning: ${agentId} (${role} using ${model})`);
  const res = await fetch(`${AITEST_URL}/api/control/spawn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role,
      model,
      system_prompt: systemPrompt,
      goal,
      agent_id: agentId,
      mode: 'chat'
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to spawn agent ${agentId}: ${errText}`);
  }
  return await res.json();
}

// Kill an agent inside AITest
async function killAgentSync(agentId) {
  console.log(`[Agent Sync] Killing: ${agentId}`);
  try {
    const res = await fetch(`${AITEST_URL}/api/control/kill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, mode: 'chat' })
    });
    return res.ok;
  } catch (err) {
    console.error(`[Agent Sync] Error killing agent ${agentId}:`, err.message);
    return false;
  }
}

// Runs a single step synchronously by polling log database
async function runAgentStepSync(agentId, message, pollInterval = 1000, timeout = 240000) {
  console.log(`[Agent Sync] Running step for ${agentId}`);
  
  // 1. Get current step count so we know when a new step completes
  let startStepCount = 0;
  try {
    const statusRes = await fetch(`${AITEST_URL}/api/control/status`);
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      const agentStatus = statusData.agents ? statusData.agents.find(a => a.agent_id === agentId) : null;
      if (agentStatus) startStepCount = agentStatus.step_count;
    }
  } catch (err) {
    console.warn(`[Agent Sync] Could not fetch start step count for ${agentId}:`, err.message);
  }

  // 2. Trigger the step
  const stepRes = await fetch(`${AITEST_URL}/api/control/step?agent_id=${agentId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  if (!stepRes.ok) {
    throw new Error(`Failed to trigger agent step: ${stepRes.statusText}`);
  }

  // 3. Poll log store
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    let logs;
    try {
      const logsRes = await fetch(`${AITEST_URL}/api/logs?agent_id=${agentId}&limit=50`);
      if (!logsRes.ok) continue;
      logs = await logsRes.json();
    } catch (err) {
      continue;
    }
    
    // Look for step_info signaling completion of the current step
    const stepEnd = logs.find(log => 
      log.type === 'step_info' && 
      log.content && 
      log.content.event === 'end' && 
      log.content.step > startStepCount
    );
    
    if (stepEnd) {
      const thoughtLogs = logs.filter(log => log.type === 'thought');
      if (thoughtLogs.length > 0) {
        return thoughtLogs[thoughtLogs.length - 1].content;
      }
    }
  }
  throw new Error(`Agent step timed out for ${agentId} after ${timeout}ms`);
}

// Extractor helper to parse JSON card format
function extractJson(text) {
  if (!text) return null;
  const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
  const jsonStr = match ? match[1] : text;
  try {
    return JSON.parse(jsonStr.trim());
  } catch (err) {
    console.error('[JSON Extractor] Direct parse failed, trying lenient brace parse.');
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        return JSON.parse(jsonStr.substring(firstBrace, lastBrace + 1));
      } catch (innerErr) {
        console.error('[JSON Extractor] Lenient brace parse failed:', innerErr.message);
      }
    }
    return null;
  }
}

// API Route: Get AI system status (Ollama models + active agents)
app.get('/api/ai/status', async (req, res) => {
  try {
    const statusRes = await fetch(`${AITEST_URL}/api/control/status`);
    if (!statusRes.ok) throw new Error('AITest server not reachable');
    const data = await statusRes.json();

    // Auto-pause any active auto-mode agents to free VRAM/CPU
    if (data.agents && Array.isArray(data.agents)) {
      for (const agent of data.agents) {
        if (agent.mode === 'auto') {
          console.log(`[VRAM Manager] Auto-pausing agent: ${agent.agent_id}`);
          await fetch(`${AITEST_URL}/api/control/mode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent_id: agent.agent_id, mode: 'chat' })
          });
          agent.mode = 'chat'; // Update returned object state
        }
      }
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'AI server offline', details: err.message });
  }
});

// API Route: Get available diffusion/LLM models
app.get('/api/ai/models', async (req, res) => {
  try {
    const ollamaRes = await fetch(`${AITEST_URL}/api/control/status`);
    const diffRes = await fetch(`${AITEST_URL}/api/diffusion/models`);
    
    const statusData = ollamaRes.ok ? await ollamaRes.json() : { models: [] };
    const diffData = diffRes.ok ? await diffRes.json() : [];
    
    res.json({
      llm: statusData.models || [],
      diffusion: diffData || []
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch AI models', details: err.message });
  }
});

// API Route: Unload active LLMs
app.post('/api/ai/unload-llms', async (req, res) => {
  await unloadAllLLMs();
  res.json({ status: 'LLM unload request complete' });
});

// API Route: Unload diffusion pipeline
app.post('/api/ai/unload-diffusion', async (req, res) => {
  await unloadDiffusion();
  res.json({ status: 'Diffusion unload request complete' });
});

// API Route: Mode 1 Direct Art Gen (Handles VRAM swapping automatically)
app.post('/api/ai/generate-art', async (req, res) => {
  const { prompt, model, width, height, steps, guidance_scale, negative_prompt, imageName } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    // 1. Swap VRAM: Unload all active Ollama LLMs first!
    await unloadAllLLMs();

    // 2. Call local diffusion generator
    console.log(`[Backend AI] Dispatching art generation: "${prompt.substring(0, 50)}..."`);
    const genRes = await fetch(`${AITEST_URL}/api/diffusion/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: model || '',
        width: width || 1024,
        height: height || 1024,
        steps: steps || 20,
        guidance_scale: guidance_scale || 7.5,
        negative_prompt: negative_prompt || '',
        batch_count: 1
      })
    });
    
    const data = await genRes.json();
    if (!genRes.ok || data.error) {
      throw new Error(data.error || 'Diffusion engine failed');
    }

    const imageFilename = data.images[0].filename;
    console.log(`[Backend AI] Art generated: ${imageFilename}. Downloading...`);

    // 3. Download the generated image from AITest static server
    const imgRes = await fetch(`${AITEST_URL}/api/images/${imageFilename}`);
    if (!imgRes.ok) throw new Error(`Failed to download image file: ${imgRes.statusText}`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // 4. Save to mtg-cards local art directory (use custom filename if provided)
    let savedFilename = imageFilename;
    if (imageName && imageName.trim().length > 0) {
      const sanitized = imageName.trim()
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, '_')
        .replace(/_+/g, '_');
      if (sanitized.length > 0) {
        savedFilename = sanitized.endsWith('.png') ? sanitized : `${sanitized}.png`;
      }
    }

    const destPath = path.join(ART_DIR, savedFilename);
    fs.writeFileSync(destPath, buffer);
    console.log(`[Backend AI] Art file saved successfully to: ${destPath}`);

    // 5. Swap VRAM back: unload diffusion model to free memory for LLMs
    await unloadDiffusion();

    res.json({
      message: 'Art generated and saved successfully',
      filename: savedFilename,
      url: `/api/images/art/${savedFilename}`
    });
  } catch (err) {
    console.error('[Backend AI] Art Gen Error:', err);
    res.status(500).json({ error: 'Failed to generate card art', details: err.message });
  }
});

// API Route: Get logs of an active agent for UI streaming
app.get('/api/ai/agent-logs/:agentId', async (req, res) => {
  const agentId = req.params.agentId;
  try {
    const logsRes = await fetch(`${AITEST_URL}/api/logs?agent_id=${agentId}&limit=100`);
    if (!logsRes.ok) throw new Error('Could not retrieve agent logs');
    const data = await logsRes.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get logs', details: err.message });
  }
});

// API Route: Mode 2 Wholesale Card Designer (Single Agent)
app.post('/api/ai/generate-card-wholesale', async (req, res) => {
  const { concept, model, agentId: clientAgentId } = req.body;
  const selectedModel = await resolveSelectedModel(model);
  const agentId = clientAgentId || `designer-${Date.now().toString().slice(-4)}`;

  try {
    // Ensure diffusion is unloaded to free VRAM for the LLM
    await unloadDiffusion();

    const sysPrompt = `You are a professional Magic: The Gathering (MTG) card designer. Your goal is to create creative, balanced, and syntactically correct cards.
When designing the rules text, use MTG standards (e.g. {T} for tap, italicized reminder text, capitalize keyword abilities).
For metadata.art_prompt, write a descriptive prompt designed for image generators (like Stable Diffusion) to paint high-quality card art. It MUST use terms like "fantasy card art style, detailed digital painting, dramatic lighting, epic composition, fantasy illustration, MTG style" to ensure a Magic: The Gathering feel.
You must output ONLY a raw JSON code block matching the cards.json schema, with no other text, markdown decorators, or explanations:
{
  "id": "slugified_unique_id",
  "name": "Card Name",
  "mana_cost": "{2}{R}",
  "type_line": "Creature — Goblin Shaman",
  "rules_text": "Rules text here.",
  "power_toughness": "2/2",
  "rarity": "R",
  "metadata": {
    "template": "modern",
    "art_prompt": "A detailed illustration of a Goblin Shaman casting fire spells, fantasy card art style, detailed digital painting, dramatic lighting, epic composition, fantasy illustration, MTG style"
  }
}`;

    // Spawn designer agent
    await spawnAgentSync(agentId, 'mtg-designer', selectedModel, sysPrompt, 'Design a complete custom card.');
    
    // Run the step
    const prompt = `Design a custom card based on this concept: "${concept}"`;
    const responseText = await runAgentStepSync(agentId, prompt);
    
    // Parse the output card
    const cardObj = extractJson(responseText);
    if (!cardObj) {
      throw new Error(`Agent returned invalid JSON structure: ${responseText}`);
    }

    // Clean up
    await killAgentSync(agentId);
    res.json(cardObj);
  } catch (err) {
    await killAgentSync(agentId);
    res.status(500).json({ error: 'Wholesale card design failed', details: err.message });
  }
});

// API Route: Mode 3 Pipeline Chaos Chain (No context sharing)
app.post('/api/ai/mode3-chain', async (req, res) => {
  const { concept, model, runId: clientRunId } = req.body;
  const selectedModel = await resolveSelectedModel(model);
  const runId = clientRunId || Date.now().toString().slice(-4);
  
  const id1 = `concept-creator-${runId}`;
  const id2 = `rules-designer-${runId}`;
  const id3 = `stats-architect-${runId}`;

  const stepsLogs = {
    step1: { concept: '', mutated: '' },
    step2: { rules: '', mutated: '' },
    step3: { card: null }
  };

  try {
    // Ensure diffusion is unloaded to free VRAM for the LLM
    await unloadDiffusion();

    // === Step 1: Concept Creator ===
    if (concept && concept.trim().length > 0) {
      stepsLogs.step1.concept = concept.trim();
    } else {
      const p1 = `You are a creative writer. Create a short one-sentence concept or name for a custom Magic: The Gathering card. Be highly descriptive, weird, and imaginative. Output ONLY the concept string, nothing else.`;
      await spawnAgentSync(id1, 'concept-creator', selectedModel, p1, 'Create card name/concept.');
      const cOut = await runAgentStepSync(id1, 'Generate a card name and concept.');
      stepsLogs.step1.concept = cOut.trim();
      await killAgentSync(id1);
    }
    
    // Intermediate handoff
    const finalConcept = stepsLogs.step1.concept;

    // === Step 2: Rules Designer ===
    const p2 = `You are an MTG game designer. You will receive a card concept. Write creative, balanced rules text for a card based on this concept. Do NOT output anything else besides the rules text.`;
    await spawnAgentSync(id2, 'rules-designer', selectedModel, p2, 'Design card rules text.');
    const rOut = await runAgentStepSync(id2, `Write rules text for a card with this concept: "${finalConcept}"`);
    stepsLogs.step2.rules = rOut.trim();
    await killAgentSync(id2);
    
    // Intermediate handoff
    const finalRules = stepsLogs.step2.rules;

    // === Step 3: Stats Architect ===
    const p3 = `You are a senior MTG balance designer. You will receive a card concept and rules text. Determine the optimal mana cost, type line, and power/toughness that fits the balance and color pie.
For metadata.art_prompt, write a descriptive prompt designed for image generators (like Stable Diffusion) to paint high-quality card art. It MUST use terms like "fantasy card art style, detailed digital painting, dramatic lighting, epic composition, fantasy illustration, MTG style" to ensure a Magic: The Gathering feel.
You must format your final answer as a single raw JSON block with no other text:
{
  "id": "slugified_id",
  "name": "Card Name",
  "mana_cost": "{3}{U}",
  "type_line": "Creature — Wizard",
  "rules_text": "Rules text",
  "power_toughness": "1/3",
  "rarity": "R",
  "metadata": {
    "template": "modern",
    "art_prompt": "fantasy card art style, detailed digital painting, dramatic lighting, epic composition, fantasy illustration, MTG style description"
  }
}`;
    await spawnAgentSync(id3, 'stats-architect', selectedModel, p3, 'Format complete card JSON.');
    const cardOut = await runAgentStepSync(id3, `Concept: "${finalConcept}"\nRules Text: "${finalRules}"`);
    const cardObj = extractJson(cardOut);
    if (!cardObj) {
      throw new Error(`Stats Architect output invalid JSON structure: ${cardOut}`);
    }
    stepsLogs.step3.card = cardObj;
    await killAgentSync(id3);

    res.json({
      steps: stepsLogs,
      card: cardObj
    });
  } catch (err) {
    await killAgentSync(id1);
    await killAgentSync(id2);
    await killAgentSync(id3);
    res.status(500).json({ error: 'Pipeline chain design failed', details: err.message });
  }
});

// API Route: Mode 4 Mutating Pipeline Chaos Chain (Mad-Libs)
app.post('/api/ai/mode4-chain', async (req, res) => {
  const { concept, model, runId: clientRunId } = req.body;
  const selectedModel = await resolveSelectedModel(model);
  const runId = clientRunId || Date.now().toString().slice(-4);
  
  const id1 = `concept-creator-${runId}`;
  const id2 = `rules-designer-${runId}`;
  const id3 = `stats-architect-${runId}`;

  const stepsLogs = {
    step1: { concept: '', mutated: '' },
    step2: { rules: '', mutated: '' },
    step3: { card: null }
  };

  try {
    // Ensure diffusion is unloaded to free VRAM for the LLM
    await unloadDiffusion();

    // === Step 1: Concept Creator ===
    if (concept && concept.trim().length > 0) {
      stepsLogs.step1.concept = concept.trim();
    } else {
      const p1 = `You are a creative writer. Create a short one-sentence concept or name for a custom Magic: The Gathering card. Be highly descriptive, weird, and imaginative. Output ONLY the concept string, nothing else.`;
      await spawnAgentSync(id1, 'concept-creator', selectedModel, p1, 'Create card name/concept.');
      const cOut = await runAgentStepSync(id1, 'Generate a card name and concept.');
      stepsLogs.step1.concept = cOut.trim();
      await killAgentSync(id1);
    }
    
    // Apply mutation to Concept
    stepsLogs.step1.mutated = mutateText(stepsLogs.step1.concept);
    const finalConcept = stepsLogs.step1.mutated;

    // === Step 2: Rules Designer ===
    const p2 = `You are an MTG game designer. You will receive a card concept. Write creative, balanced rules text for a card based on this concept. Do NOT output anything else besides the rules text.`;
    await spawnAgentSync(id2, 'rules-designer', selectedModel, p2, 'Design card rules text.');
    const rOut = await runAgentStepSync(id2, `Write rules text for a card with this concept: "${finalConcept}"`);
    stepsLogs.step2.rules = rOut.trim();
    await killAgentSync(id2);
    
    // Apply mutation to Rules
    stepsLogs.step2.mutated = mutateText(stepsLogs.step2.rules);
    const finalRules = stepsLogs.step2.mutated;

    // === Step 3: Stats Architect ===
    const p3 = `You are a senior MTG balance designer. You will receive a card concept and rules text. Determine the optimal mana cost, type line, and power/toughness that fits the balance and color pie.
For metadata.art_prompt, write a descriptive prompt designed for image generators (like Stable Diffusion) to paint high-quality card art. It MUST use terms like "fantasy card art style, detailed digital painting, dramatic lighting, epic composition, fantasy illustration, MTG style" to ensure a Magic: The Gathering feel.
You must format your final answer as a single raw JSON block with no other text:
{
  "id": "slugified_id",
  "name": "Card Name",
  "mana_cost": "{3}{U}",
  "type_line": "Creature — Wizard",
  "rules_text": "Rules text",
  "power_toughness": "1/3",
  "rarity": "R",
  "metadata": {
    "template": "modern",
    "art_prompt": "fantasy card art style, detailed digital painting, dramatic lighting, epic composition, fantasy illustration, MTG style description"
  }
}`;
    await spawnAgentSync(id3, 'stats-architect', selectedModel, p3, 'Format complete card JSON.');
    const cardOut = await runAgentStepSync(id3, `Concept: "${finalConcept}"\nRules Text: "${finalRules}"`);
    const cardObj = extractJson(cardOut);
    if (!cardObj) {
      throw new Error(`Stats Architect output invalid JSON structure: ${cardOut}`);
    }
    stepsLogs.step3.card = cardObj;
    await killAgentSync(id3);

    res.json({
      steps: stepsLogs,
      card: cardObj
    });
  } catch (err) {
    await killAgentSync(id1);
    await killAgentSync(id2);
    await killAgentSync(id3);
    res.status(500).json({ error: 'Pipeline mutating chain failed', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`MTG Card Editor Backend running at http://localhost:${PORT}`);
});
