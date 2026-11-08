// Backend for the Make page in ../index.html.
// Serves the prototype and answers POST /api/generate with a new camera view of the product.
//
// Providers (picked automatically, or set PROVIDER=fal|hf in server/.env):
//   fal - fal.ai "qwen-image-edit-2511-multiple-angles" (paid, best quality, exact degree inputs). Needs FAL_KEY.
//   hf  - public Hugging Face Space running the same 2511 model + angles LoRA on free ZeroGPU. Needs HF_TOKEN:
//         anonymous quota is below the 60 s each call reserves, so it always fails without a token.
//   none of the keys set -> the page keeps its built-in mock generator.
//
// index.html is never modified on disk: when a provider is configured, its `var BACKEND='';` hook is set to '/api'
// in the copy this server sends.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@gradio/client';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
loadEnv(path.join(HERE, '.env'));

const PORT = +(process.env.PORT || 8787);
const FAL_KEY = process.env.FAL_KEY || '';
const HF_TOKEN = process.env.HF_TOKEN || '';
const HF_SPACE = process.env.HF_SPACE || 'multimodalart/qwen-image-multiple-angles-3d-camera';
const FAL_MODEL = process.env.FAL_MODEL || 'fal-ai/qwen-image-edit-2511-multiple-angles';
const PROVIDER = (process.env.PROVIDER || (FAL_KEY ? 'fal' : HF_TOKEN ? 'hf' : 'mock')).toLowerCase();

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
    headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.images?.[0]?.url) throw new Error(`fal.ai ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  return { url: j.images[0].url, prompt: j.prompt, seed: j.seed };
}

let hfClient = null;
async function hf() {
  if (!hfClient) hfClient = await Client.connect(HF_SPACE, HF_TOKEN ? { hf_token: HF_TOKEN } : {});
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

/* ---------- helpers ---------- */
function dataUrlToBlob(d) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(d || '');
  if (!m) throw new Error('Reference image must be a base64 data URL');
  return new Blob([Buffer.from(m[2], 'base64')], { type: m[1] });
}
const authHeaders = url => (HF_TOKEN && /hf\.space|huggingface\.co/.test(url) ? { headers: { Authorization: `Bearer ${HF_TOKEN}` } } : {});
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
  if (PROVIDER !== 'fal' && PROVIDER !== 'hf') throw new Error('No generator configured: add FAL_KEY or HF_TOKEN to server/.env');
  const r = PROVIDER === 'fal' ? await viaFal(q, ref, rel) : await viaHf(q, ref, rel);
  const image = await urlToDataUrl(r.url);
  console.log(`[generate] ${PROVIDER} az=${az} el=${q.elevation} from ${ref.side} (turn ${Math.round(rel)}) in ${((Date.now() - t0) / 1000).toFixed(1)}s :: ${r.prompt || ''}`);
  return { image, provider: PROVIDER, reference: ref.side, relative_turn: Math.round(rel), prompt: r.prompt, seed: r.seed };
}

/* ---------- http ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, provider: PROVIDER, model: PROVIDER === 'fal' ? FAL_MODEL : PROVIDER === 'hf' ? HF_SPACE : 'built-in mock (page)' }));
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
    if (file === path.join(ROOT, 'index.html') && PROVIDER !== 'mock') data = Buffer.from(data.toString('utf8').replace("var BACKEND='';", "var BACKEND='/api';"));
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (e) {
    console.error('[error]', e?.message || e);
    // Plain-text body on purpose: the page treats a non-JSON reply as a failure and shows its own error message.
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`Generation failed: ${e?.message || e}`);
  }
});

server.listen(PORT, () => {
  console.log(`View Review prototype: http://localhost:${PORT}/`);
  console.log(`Generator: ${PROVIDER === 'fal' ? `fal.ai (${FAL_MODEL})` : PROVIDER === 'hf' ? `Hugging Face Space ${HF_SPACE}` : 'none - the page uses its mock. Add FAL_KEY (or HF_TOKEN) to server/.env and restart.'}`);
});
