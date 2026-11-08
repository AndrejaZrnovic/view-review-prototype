// Backend for the Make page in ../index.html.
// Serves the prototype and answers POST /api/generate with a new camera view of the product.
//
// Providers (picked automatically, or set PROVIDER=local|fal|hf in server/.env):
//   local - free, runs on this computer: a quantized copy of the same model in ComfyUI (see setup-local.sh).
//           The server starts ComfyUI itself. Slower (minutes per view) and a little lower quality than fal.
//   fal - fal.ai "qwen-image-edit-2511-multiple-angles" (paid, best quality, exact degree inputs). Needs FAL_KEY.
//   hf  - public Hugging Face Space running the same 2511 model + angles LoRA on free ZeroGPU. Needs HF_TOKEN:
//         anonymous quota is below the 60 s each call reserves, so it always fails without a token.
//   none of the keys set -> the page keeps its built-in mock generator.
//
// The page gets a small "AI generator" panel (setup-panel.js, added to the served copy) to install the local
// generator with one click, or switch to cloud with a fal.ai key. Choices are saved in server/.env.
// index.html is never modified on disk: the served copy gets the panel script, and its `var BACKEND='';` hook is
// pointed at '/api' whenever the selected generator is ready.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@gradio/client';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
loadEnv(path.join(HERE, '.env'));

const PORT = +(process.env.PORT || 8787);
const ENV_FILE = path.join(HERE, '.env');
const env = k => process.env[k] || '';
const HF_SPACE = process.env.HF_SPACE || 'multimodalart/qwen-image-multiple-angles-3d-camera';
const FAL_MODEL = process.env.FAL_MODEL || 'fal-ai/qwen-image-edit-2511-multiple-angles';
const COMFY_URL = (process.env.COMFY_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
const COMFY_DIR = (process.env.COMFY_DIR || '~/ComfyUI').replace(/^~/, os.homedir());
const MODELS = path.join(COMFY_DIR, 'models');

// Local model sizes the panel offers (GB from the Hugging Face listings). Same LoRAs and workflow for all.
const RAM_GB = os.totalmem() / 2 ** 30;
const TIERS = {
  best: { label: 'Best quality', q: 'Q8_0', cq: 'Q8_0', unet: 22.35, clip: 8.10, minRam: 40 },
  balanced: { label: 'Balanced', q: 'Q5_K_M', cq: 'Q6_K', unet: 15.40, clip: 6.25, minRam: 24 },
  small: { label: 'Small', q: 'Q3_K_M', cq: 'Q4_K_M', unet: 9.92, clip: 4.68, minRam: 0 },
};
const RECOMMENDED = RAM_GB >= 40 ? 'best' : RAM_GB >= 24 ? 'balanced' : 'small';
const SHARED = [ // [folder, file, GB] needed by every size
  ['vae', 'qwen_image_vae.safetensors', 0.25],
  ['loras', 'qwen-image-edit-2511-multiple-angles-lora.safetensors', 0.30],
  ['loras', 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors', 0.85],
  ['text_encoders', 'mmproj-BF16.gguf', 1.35],
];
const ENGINE_GB = 1; // ComfyUI + Python packages, downloaded once
const tierFiles = id => { const t = TIERS[id]; return [...SHARED,
  ['text_encoders', `Qwen2.5-VL-7B-Instruct-${t.cq}.gguf`, t.clip], ['unet', `qwen-image-edit-2511-${t.q}.gguf`, t.unet]]; };
const have = ([d, f]) => fs.existsSync(path.join(MODELS, d, f));
const engineInstalled = () => fs.existsSync(path.join(COMFY_DIR, '.venv', 'bin', 'python'));
const tierInstalled = id => engineInstalled() && tierFiles(id).every(have);
const tierRemainingGb = id => tierFiles(id).filter(f => !have(f)).reduce((a, f) => a + f[2], 0) + (engineInstalled() ? 0 : ENGINE_GB);
// Selected size: LOCAL_MODEL in .env (set by the panel), else an installed one (recommended first), else the recommended.
const selectedTier = () => {
  const s = env('LOCAL_MODEL');
  if (TIERS[s]) return s;
  return [RECOMMENDED, 'best', 'balanced', 'small'].find(tierInstalled) || RECOMMENDED;
};
const LOCAL = {
  get unet() { return process.env.LOCAL_UNET || tierFiles(selectedTier())[5][1]; },
  get clip() { return process.env.LOCAL_CLIP || tierFiles(selectedTier())[4][1]; },
  vae: 'qwen_image_vae.safetensors',
  lightning: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
  angles: 'qwen-image-edit-2511-multiple-angles-lora.safetensors',
  // Output size in megapixels (1.0 is ~1024x1024), set by memory: smaller machines stay fast and in memory.
  megapixels: +(process.env.LOCAL_MEGAPIXELS || (RAM_GB >= 40 ? 1.0 : RAM_GB >= 24 ? 0.8 : 0.6)),
};
const localInstalled = () => engineInstalled() && have(['unet', LOCAL.unet]) && have(['text_encoders', LOCAL.clip]) && SHARED.every(have);

// Selected generator: PROVIDER in .env (set by the panel), else the best one available.
const provider = () => (env('PROVIDER') || (env('FAL_KEY') ? 'fal' : localInstalled() ? 'local' : env('HF_TOKEN') ? 'hf' : 'mock')).toLowerCase();
const usable = (p = provider()) => (p === 'fal' && !!env('FAL_KEY')) || (p === 'hf' && !!env('HF_TOKEN')) || (p === 'local' && localInstalled());

function saveEnv(updates) { // update KEY=value lines in server/.env (git-ignored); '' removes a key
  let lines = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/) : [];
  for (const [k, v] of Object.entries(updates)) {
    lines = lines.filter(l => !new RegExp(`^\\s*${k}\\s*=`).test(l));
    if (v) lines.push(`${k}=${v}`);
    if (v) process.env[k] = v; else delete process.env[k];
  }
  fs.writeFileSync(ENV_FILE, lines.filter((l, i, a) => l.trim() || i < a.length - 1).join('\n').trim() + '\n', { mode: 0o600 });
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

/* ---------- camera maths ---------- */
// Same convention as index.html: azimuth 0 = front, 90 = right, 180 = back, 270 = left.
const SIDE_AZ = { front: 0, right: 90, back: 180, left: 270 };
const angD = (a, b) => ((b - a + 540) % 360) - 180; // signed shortest turn from a to b
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Use the uploaded photo closest to the requested angle, and express the move relative to it.
function pickReference(images, az) {
  const sides = images.filter(i => i.side in SIDE_AZ);
  if (!sides.length) return { ref: images[0], rel: angD(0, az) };
  let best = null;
  for (const im of sides) {
    const rel = angD(SIDE_AZ[im.side], az);
    if (!best || Math.abs(rel) < Math.abs(best.rel)) best = { ref: im, rel };
  }
  return best;
}

function styleHints(p) {
  const h = ['Keep the product\'s shape, colours, logo, text and proportions identical'];
  if (p.lens_mm <= 30) h.push('wide-angle lens');
  else if (p.lens_mm >= 70) h.push('telephoto lens');
  if (Math.abs(p.roll) > 3) h.push(`camera tilted ${Math.round(p.roll)} degrees`);
  return h.join(', ') + '.';
}

/* ---------- providers ---------- */
async function viaFal(p, ref, rel) {
  const body = {
    image_urls: [ref.image],
    horizontal_angle: (Math.round(rel) + 360) % 360,
    vertical_angle: clamp(Math.round(p.elevation), -30, 90),
    zoom: +clamp(10 - p.distance / 10, 0, 10).toFixed(1), // UI: 0 = close, 100 = far; fal: 0 = wide, 10 = close-up
    additional_prompt: styleHints(p),
    output_format: 'png',
    num_images: 1,
  };
  const r = await fetch(`https://fal.run/${FAL_MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Key ${env('FAL_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.images?.[0]?.url) throw new Error(`fal.ai ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  return { url: j.images[0].url, prompt: j.prompt, seed: j.seed };
}

let hfClient = null;
async function hf() {
  if (!hfClient) hfClient = await Client.connect(HF_SPACE, env('HF_TOKEN') ? { hf_token: env('HF_TOKEN') } : {});
  return hfClient;
}

async function viaHf(p, ref, rel) {
  const client = await hf();
  // Same LoRA as fal: 0 front, 90 right side; the Space snaps to 45 degree steps, elevation -30..60, distance 0.6..1.8.
  const res = await client.predict('/infer_camera_edit', {
    image: dataUrlToBlob(ref.image),
    azimuth: (Math.round(rel) + 360) % 360,
    elevation: clamp(Math.round(p.elevation), -30, 60),
    distance: +(0.6 + clamp(p.distance, 0, 100) / 100 * 1.2).toFixed(2), // UI: 0 = close, 100 = far
    seed: 0,
    randomize_seed: true,
    guidance_scale: 1,
    num_inference_steps: 4,
    height: 1024,
    width: 1024,
  });
  return { url: res.data[0].url, seed: res.data[1], prompt: res.data[2] };
}

// The angles LoRA understands 8 azimuths, 4 elevations and 3 distances; snap to the nearest.
const AZ_WORDS = ['front view', 'front-right quarter view', 'right side view', 'back-right quarter view', 'back view', 'back-left quarter view', 'left side view', 'front-left quarter view'];
function lockedPrompt(rel, p) {
  const az = AZ_WORDS[Math.round(((rel % 360) + 360) % 360 / 45) % 8];
  const el = p.elevation < -15 ? 'low-angle shot' : p.elevation < 15 ? 'eye-level shot' : p.elevation < 45 ? 'elevated shot' : 'high-angle shot';
  const d = p.distance < 30 ? 'close-up' : p.distance < 70 ? 'medium shot' : 'wide shot';
  return `<sks> ${az} ${el} ${d}`;
}

let comfyProc = null, comfyStarting = null;
async function comfyUp() {
  try { return (await fetch(`${COMFY_URL}/system_stats`)).ok; } catch { return false; }
}
async function ensureComfy() {
  if (await comfyUp()) return;
  if (!comfyStarting) comfyStarting = (async () => {
    const py = path.join(COMFY_DIR, '.venv', 'bin', 'python');
    if (!fs.existsSync(py)) throw new Error('The free AI generator is not set up yet: use "Set up free AI generator" at the top of the page');
    const port = new URL(COMFY_URL).port || '8188';
    const log = fs.openSync(path.join(os.tmpdir(), 'view-review-comfyui.log'), 'a');
    console.log(`[local] starting ComfyUI on port ${port} (log: ${path.join(os.tmpdir(), 'view-review-comfyui.log')})`);
    // Under 24 GB the model and text encoder don't fit together: free each one after use instead of swapping.
    const args = ['main.py', '--listen', '127.0.0.1', '--port', port, '--disable-auto-launch', ...(RAM_GB < 24 ? ['--disable-smart-memory'] : [])];
    comfyProc = spawn(py, args, { cwd: COMFY_DIR, stdio: ['ignore', log, log] });
    comfyProc.on('exit', c => { console.log(`[local] ComfyUI exited (${c})`); comfyProc = null; });
    for (let i = 0; i < 180; i++) { if (await comfyUp()) return; await new Promise(r => setTimeout(r, 1000)); }
    throw new Error('ComfyUI did not start within 3 minutes');
  })().finally(() => { comfyStarting = null; });
  return comfyStarting;
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { comfyProc?.kill(); installer?.kill(); process.exit(0); });

function comfyWorkflow(imageName, prompt, seed) {
  // Same graph as fal's published comfyui-workflow-multiple-angles.json, with GGUF loaders for a 16 GB Mac.
  return {
    unet: { class_type: 'UnetLoaderGGUF', inputs: { unet_name: LOCAL.unet } },
    angles: { class_type: 'LoraLoaderModelOnly', inputs: { model: ['unet', 0], lora_name: LOCAL.angles, strength_model: 0.9 } },
    lightning: { class_type: 'LoraLoaderModelOnly', inputs: { model: ['angles', 0], lora_name: LOCAL.lightning, strength_model: 1 } },
    shift: { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['lightning', 0], shift: 3.1 } },
    cfgnorm: { class_type: 'CFGNorm', inputs: { model: ['shift', 0], strength: 1 } },
    clip: { class_type: 'CLIPLoaderGGUF', inputs: { clip_name: LOCAL.clip, type: 'qwen_image' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: LOCAL.vae } },
    load: { class_type: 'LoadImage', inputs: { image: imageName } },
    scale: { class_type: 'ImageScaleToTotalPixels', inputs: { image: ['load', 0], upscale_method: 'lanczos', megapixels: LOCAL.megapixels, resolution_steps: 16 } },
    pos: { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['clip', 0], vae: ['vae', 0], image1: ['scale', 0], prompt } },
    neg: { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['clip', 0], vae: ['vae', 0], image1: ['scale', 0], prompt: '' } },
    posref: { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['pos', 0], reference_latents_method: 'index_timestep_zero' } },
    negref: { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['neg', 0], reference_latents_method: 'index_timestep_zero' } },
    latent: { class_type: 'VAEEncode', inputs: { pixels: ['scale', 0], vae: ['vae', 0] } },
    sample: { class_type: 'KSampler', inputs: { model: ['cfgnorm', 0], positive: ['posref', 0], negative: ['negref', 0], latent_image: ['latent', 0], seed, steps: 4, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1 } },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['vae', 0] } },
    save: { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: 'view-review/angle' } },
  };
}

async function viaLocal(p, ref, rel) {
  await ensureComfy();
  const form = new FormData();
  const blob = dataUrlToBlob(ref.image);
  form.append('image', blob, `ref-${Date.now()}.${(blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`);
  form.append('overwrite', 'true');
  const up = await (await fetch(`${COMFY_URL}/upload/image`, { method: 'POST', body: form })).json();
  const prompt = lockedPrompt(rel, p), seed = Math.floor(Math.random() * 2 ** 31);
  const q = await fetch(`${COMFY_URL}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: comfyWorkflow(up.name, prompt, seed) }) });
  const qj = await q.json();
  if (!q.ok || !qj.prompt_id) throw new Error(`ComfyUI rejected the workflow: ${JSON.stringify(qj.node_errors || qj.error || qj).slice(0, 500)}`);
  for (let i = 0; i < 1200; i++) { // up to 20 minutes
    await new Promise(r => setTimeout(r, 1000));
    const h = (await (await fetch(`${COMFY_URL}/history/${qj.prompt_id}`)).json())[qj.prompt_id];
    if (!h) continue;
    if (h.status?.status_str === 'error') {
      const m = (h.status.messages || []).find(x => x[0] === 'execution_error');
      throw new Error(`ComfyUI error: ${m ? m[1].exception_message : 'unknown'}`);
    }
    const img = h.outputs?.save?.images?.[0];
    if (img) return { url: `${COMFY_URL}/view?${new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type })}`, prompt, seed };
  }
  throw new Error('Local generation timed out after 20 minutes');
}

/* ---------- helpers ---------- */
function dataUrlToBlob(d) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(d || '');
  if (!m) throw new Error('Reference image must be a base64 data URL');
  return new Blob([Buffer.from(m[2], 'base64')], { type: m[1] });
}
const authHeaders = url => (env('HF_TOKEN') && /hf\.space|huggingface\.co/.test(url) ? { headers: { Authorization: `Bearer ${env('HF_TOKEN')}` } } : {});
async function urlToDataUrl(url) {
  const r = await fetch(url, authHeaders(url));
  if (!r.ok) throw new Error(`Could not download result (${r.status})`);
  const type = r.headers.get('content-type') || 'image/png';
  return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
}
function readBody(req, limit = 60 * 1024 * 1024) {
  return new Promise((res, rej) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > limit) { rej(new Error('Upload too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rej);
  });
}

async function generate(p) {
  if (!Array.isArray(p.images) || !p.images.length) throw new Error('No reference images');
  const az = ((+p.azimuth || 0) % 360 + 360) % 360;
  const q = { azimuth: az, elevation: +p.elevation || 0, distance: +(p.distance ?? 50), roll: +p.roll || 0, lens_mm: +p.lens_mm || 50 };
  const { ref, rel } = pickReference(p.images, az);
  const t0 = Date.now();
  const P = provider(), run = { fal: viaFal, hf: viaHf, local: viaLocal }[P];
  if (!run || !usable(P)) throw new Error('No AI generator is ready: set one up in the panel at the top of the page');
  let r;
  try { r = await run(q, ref, rel); lastError = ''; lastSecs = Math.round((Date.now() - t0) / 1000); } catch (e) { lastError = friendly(e.message); throw e; }
  const image = await urlToDataUrl(r.url);
  console.log(`[generate] ${P} az=${az} el=${q.elevation} from ${ref.side} (turn ${Math.round(rel)}) in ${((Date.now() - t0) / 1000).toFixed(1)}s :: ${r.prompt || ''}`);
  return { image, provider: P, reference: ref.side, relative_turn: Math.round(rel), prompt: r.prompt, seed: r.seed };
}

/* ---------- one-click local setup ---------- */
let installer = null, installTier = '', lastError = '', lastSecs = 0;
const SETUP = { state: 'idle', phase: '', log: [], error: '' }; // idle | installing | failed
function friendly(m = '') {
  if (/TOP_UP|locked/i.test(m)) return 'Your fal.ai account needs credit. Add some at fal.ai/dashboard/billing, then try again.';
  if (/fal\.ai 401|fal\.ai 403/i.test(m)) return 'fal.ai did not accept the API key. Check it and save it again.';
  return m.replace(/^Generation failed: /, '').slice(0, 300);
}
function bytesOnDisk() { // finished model files + partial downloads (.incomplete) of this plan
  let n = 0;
  for (const [d, f] of tierFiles(installTier)) { try { n += fs.lstatSync(path.join(MODELS, d, f)).size; } catch {} }
  const walk = dir => { try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (e.name.endsWith('.incomplete')) n += fs.statSync(p).size;
  } } catch {} };
  for (const d of ['vae', 'loras', 'text_encoders', 'unet']) walk(path.join(MODELS, d, '.cache'));
  return n;
}
function startInstall(id) {
  if (installer) return;
  installTier = id;
  const files = tierFiles(id), unet = files[5][1], clip = files[4][1];
  const rt = path.join(ROOT, '.runtime');
  const PATH = [path.join(rt, 'bin'), path.join(rt, 'node', 'bin'), path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH].join(':');
  Object.assign(SETUP, { state: 'installing', phase: 'engine', log: [], error: '' });
  console.log(`[setup] installing local generator: ${TIERS[id].label} (${unet}, ${clip}, ~${tierRemainingGb(id).toFixed(0)} GB to download) into ${COMFY_DIR}`);
  installer = spawn('bash', [path.join(HERE, 'setup-local.sh')], { env: { ...process.env, PATH, COMFY_DIR, LOCAL_UNET: unet, LOCAL_CLIP: clip } });
  const onData = buf => { for (const line of buf.toString().split(/[\r\n]+/)) {
    const l = line.trim(); if (!l) continue;
    const m = /^STEP: (\w+)/.exec(l); if (m) SETUP.phase = m[1]; else SETUP.log = [...SETUP.log, l].slice(-8);
  } };
  installer.stdout.on('data', onData); installer.stderr.on('data', onData);
  installer.on('exit', code => {
    installer = null;
    if (code === 0 && tierInstalled(id)) {
      SETUP.state = 'idle'; console.log('[setup] done');
      saveEnv({ LOCAL_MODEL: id });
      if (!env('PROVIDER') || env('PROVIDER') === 'local') { saveEnv({ PROVIDER: 'local' }); ensureComfy().catch(e => { lastError = e.message; }); }
    } else {
      Object.assign(SETUP, { state: 'failed', error: SETUP.log.slice(-3).join(' · ') || `Setup stopped (code ${code})` });
      console.error('[setup] failed:', SETUP.error);
    }
  });
}
async function status() {
  const P = provider(), up = await comfyUp();
  const engine = up ? 'ready' : comfyStarting ? 'starting' : 'stopped';
  const key = env('FAL_KEY');
  return {
    mode: P === 'fal' ? 'cloud' : P === 'local' ? 'local' : P, usable: usable(P), lastError, lastSecs,
    local: { installed: localInstalled(), engine, ram: Math.round(RAM_GB), model: LOCAL.unet, selected: selectedTier(), recommended: RECOMMENDED,
      tiers: Object.entries(TIERS).map(([id, t]) => ({ id, label: t.label, quant: t.q, minRam: t.minRam, totalGb: +(t.unet + t.clip + 2.75).toFixed(1),
        remainingGb: +tierRemainingGb(id).toFixed(1), installed: tierInstalled(id) })),
      setup: { ...SETUP, tier: installTier, totalGb: installTier ? +tierFiles(installTier).reduce((a, f) => a + f[2], 0).toFixed(1) : 0,
        doneGb: SETUP.state === 'installing' ? +(bytesOnDisk() / 1e9).toFixed(1) : 0 } },
    cloud: { keySet: !!key, keyHint: key ? `…${key.slice(-4)}` : '' },
  };
}
async function setupApi(req, res, url) {
  const send = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.method === 'GET' && url.pathname === '/api/setup/status') return send(await status());
  // State-changing calls: same-origin only (custom header forces a CORS preflight that this server never allows).
  if (req.method !== 'POST' || req.headers['x-view-review'] !== '1') return send({ error: 'forbidden' }, 403);
  const body = JSON.parse((await readBody(req, 1e5)) || '{}');
  if (url.pathname === '/api/setup/install') {
    const id = TIERS[body.model] ? body.model : RECOMMENDED;
    startInstall(id); return send(await status());
  }
  if (url.pathname === '/api/setup/model') { // switch between installed sizes
    if (!tierInstalled(body.model)) return send({ error: 'That model size is not downloaded yet.' }, 400);
    saveEnv({ LOCAL_MODEL: body.model, PROVIDER: 'local' }); lastError = '';
    ensureComfy().catch(e => { lastError = e.message; });
    return send(await status());
  }
  if (url.pathname === '/api/setup/mode') {
    const p = body.mode === 'cloud' ? 'fal' : 'local';
    saveEnv({ PROVIDER: p }); lastError = '';
    if (p === 'local' && localInstalled()) ensureComfy().catch(e => { lastError = e.message; });
    return send(await status());
  }
  if (url.pathname === '/api/setup/cloud-key') {
    const k = String(body.key || '').trim();
    if (k && !/^[\w:.-]{16,200}$/.test(k)) return send({ error: 'That does not look like a fal.ai API key.' }, 400);
    saveEnv({ FAL_KEY: k, PROVIDER: k ? 'fal' : (localInstalled() ? 'local' : '') }); lastError = '';
    return send(await status());
  }
  return send({ error: 'not found' }, 404);
}

/* ---------- http ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, provider: provider(), ready: usable(), model: { fal: FAL_MODEL, hf: HF_SPACE, local: `ComfyUI ${LOCAL.unet}` }[provider()] || 'built-in mock (page)' }));
    }
    if (url.pathname.startsWith('/api/setup/')) return await setupApi(req, res, url);
    if (url.pathname === '/__panel/setup-panel.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      return res.end(fs.readFileSync(path.join(HERE, 'setup-panel.js')));
    }
    if (url.pathname === '/api/generate' && req.method === 'POST') {
      const out = await generate(JSON.parse(await readBody(req)));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(out));
    }
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    // Static files from the repo root; server/ internals stay private.
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.resolve(ROOT, '.' + rel);
    if (!file.startsWith(ROOT + path.sep) || file.startsWith(HERE + path.sep) || /[\\/]\./.test(rel) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); return res.end('Not found');
    }
    let data = fs.readFileSync(file);
    if (file === path.join(ROOT, 'index.html')) {
      let html = data.toString('utf8');
      if (usable()) html = html.replace("var BACKEND='';", "var BACKEND='/api';");
      data = Buffer.from(html.replace('</body>', '<script src="/__panel/setup-panel.js"></script>\n</body>'));
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (e) {
    console.error('[error]', e?.message || e);
    // Plain-text body on purpose: the page treats a non-JSON reply as a failure and shows its own error message.
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`Generation failed: ${e?.message || e}`);
  }
});

// Localhost only: the setup endpoints install software and store an API key.
server.listen(PORT, '127.0.0.1', () => {
  const P = provider();
  console.log(`View Review prototype: http://localhost:${PORT}/`);
  console.log(`Generator: ${{ fal: `fal.ai (${FAL_MODEL})`, hf: `Hugging Face Space ${HF_SPACE}`, local: `local ComfyUI (${LOCAL.unet}, ${LOCAL.megapixels} MP)` }[P] || 'none yet'}${usable(P) ? '' : ' - not ready; use the panel at the top of the page'}`);
  if (P === 'local' && usable(P)) ensureComfy().then(() => console.log('[local] ComfyUI ready'), e => console.error('[local]', e.message));
});
