# Angle generation backend

Small Node server that serves the prototype (`../index.html`) and powers the **Make** page's
"Generate view" and "Make video" buttons with real AI models. The server adds a small **AI generator**
panel (`setup-panel.js`) to the copy of `index.html` it serves and fills the page's `BACKEND` hook.

## Model

[Qwen-Image-Edit-2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511) with the
[Multiple-Angles LoRA](https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA) (Apache 2.0).
It takes one product photo and a camera position (azimuth, elevation, distance) and returns the new view.

| Provider | Needs | Cost | Notes |
| --- | --- | --- | --- |
| **Local (free)** | One click in the panel (17–33 GB download) | Free, unlimited | Runs on this computer via ComfyUI, quantized model; a few minutes per view, angles snap to 45° |
| fal.ai (default when `FAL_KEY` is set) | `FAL_KEY` | ~$0.04 per 1024×1024 view | Any angle in degrees, fast |
| Hugging Face Space | `HF_TOKEN` (free account) | Free, a few views per day | Angles snap to 45°; queue can be slow |
| Mock (no key) | nothing | free | The page's built-in placeholder |

## Run (one click)

1. Double-click **`Start.command`** in the repo folder. The first time, it fetches Node.js and uv into
   `.runtime/` (no admin rights needed), then opens http://localhost:8787/. Keep its window open; close it to stop.
2. In the **AI generator** panel at the top of the page, pick one:
   - **Local (free):** choose a model size (the one that fits the Mac's memory is pre-selected) and click
     **Download … and set up**. It installs ComfyUI into `~/ComfyUI` and downloads the model with a progress bar.
     When it finishes, Make uses it. **Change model** downloads another size or switches between downloaded ones.
   - **Cloud (fal.ai):** paste a fal.ai API key (needs credit on the fal.ai account) and click **Save and use cloud**.
   Switch between them any time with the Local / Cloud buttons. Choices and the key are saved in
   `server/.env`, which is git-ignored and stays on that Mac.

If macOS refuses to open `Start.command`, right-click it and choose **Open** once. Without the panel, the same
works from a terminal: `npm --prefix server ci && npm --prefix server start`.

### Local generator details

With `PROVIDER=local` the server starts ComfyUI by itself (log in `$TMPDIR/view-review-comfyui.log`) and
runs the same graph as fal's published `comfyui-workflow-multiple-angles.json` with GGUF (quantized) weights.
Model sizes offered in the panel (download includes ~1 GB for ComfyUI and Python the first time):

| Size | Model / text encoder | Download | Recommended for |
| --- | --- | --- | --- |
| Best quality | Q8_0 / Q8_0, near full quality | ~34 GB | 40 GB+ memory (e.g. M4 Pro 48 GB) |
| Balanced | Q5_K_M / Q6_K | ~25 GB | 24–39 GB |
| Small | Q3_K_M / Q4_K_M | ~18 GB | under 24 GB (e.g. M5 16 GB) |

Downloads use a free Hugging Face read token when `HF_TOKEN` is set in `server/.env` (or after `hf auth login`), which
lifts the anonymous throttle and removes the "sending unauthenticated requests to the HF Hub" warning. The two large
files are fetched in parallel and finished files are reused, so an interrupted setup continues where it stopped.

The choice is saved as `LOCAL_MODEL` (best / balanced / small) in `server/.env`. Output size follows memory:
1.0 MP (~1024 px) at 40 GB+, 0.8 MP at 24 GB+, else 0.6 MP. Override with `LOCAL_UNET`, `LOCAL_CLIP` or
`LOCAL_MEGAPIXELS`. `bash server/setup-local.sh`
runs the same install from a terminal.

## Scene and mood (moodboard)

Step 2 on the Make page describes the shot for this product with two parts, each optional and editable at any time:

- **Background of the shot**: words and/or one example image (a location photo).
- **Mood and lighting**: words and/or one example image (a mood photo).

The presets are only a quick start: clicking one fills in the words, which you then change. Example images are shrunk
to 1280 px in the browser and can be replaced or removed.

**Preview scene** restyles the front photo once (`POST /api/style`) and shows it before any angle is made. If the
product changed (shape, colour, a logo that was not there), press **Try another look** (new seed) or edit the words.
**Use this scene** locks it. Every angle is then generated from that approved photo, so all views share one scene, and
the cached photo is reused (no second restyle is paid for). Changing the words, an example or the product photo
invalidates the preview.

How the model is told what is what: Qwen-Image-Edit-2511 accepts up to three pictures, so the prompt names them:
Picture 1 = the product, Picture 2 = the background example, Picture 3 = the mood example (with only one example it is
Picture 2). The background example supplies the location only; the mood example supplies lighting, palette and
atmosphere only; "copy none of its objects" is in the prompt. The product-lock text forbids adding any logo, symbol, text
or pattern the photo does not show (a plain bottle stays plain), keeps the camera angle and framing, and changes only the
background, the surface and the light.

1. **Style:** the front photo (or the first one uploaded) is restyled with the plain Qwen-Image-Edit-2511 model,
   without the angle add-on. Any other photo used for an angle is placed "in the same scene as" that styled front photo.
   Styled photos are cached by scene (photo + examples + prompt + seed), so this runs once per scene.
2. **Angle:** the usual camera step runs on the styled photo. If the requested view equals the photo's own angle,
   the styled photo is returned as-is.

**Limits seen in live tests (fal, `original-blue-bottle.jpg`):** the scene itself holds across angles, but (1) if the photo
cuts a logo off at its edge, the model completes it with a guess and the guess changes on every run (a swirl, a caret,
a made-up word). No prompt wording removed this: show the whole product, or use the preview to reroll. (2) A background
example that contains a product leaks that product's logo onto yours, so use a photo of the place without products.

Each generated view carries the scene key; the video step warns only when the chosen views come from different scenes
(two scenes with similar wording are no longer mistaken for one). Styled photos are saved in `server/.cache/` (git-ignored).

**Invented text guard (fal.ai key needed):** after every style and angle step, the result is read with fal.ai's free
Florence-2 OCR. The guard only exists for the model inventing a brand name on a side nobody photographed, so it is
deliberately narrow: it never touches an image whose uploaded photo already carries wording of its own (a nutrition
panel, a wordmark, a keyboard legend), and on a photographed side it only fires when more than 80% of the words are
new. One cleanup edit then removes just those added graphics, using the reference photo as its second picture. Products
whose printed label *is* the design therefore keep it. `CLEAN_UNSEEN=0` in `server/.env` turns the guard off. Cost: one
extra generation per style (local), or ~$0.03 per megapixel on fal.ai (`fal-ai/qwen-image-edit-2511`). The free Hugging
Face Space ignores styles.

## Your work is kept

The Make page saves its state in the browser (IndexedDB): uploaded photos, generated views, the moodboard choice, the
product sheet, the camera, the video order and the last video. A reload, a closed tab or an app restart brings it back.
It stays in that browser on that Mac only. **Start over** (under Generated views) clears it. A view still being generated
when the page reloads is lost; a video still being made keeps going and reappears, unless the app itself was restarted.

## Transition video

Under **5. Transition video** on the Make page, click generated views in the order the camera should visit them and press
**Make video**. Each consecutive pair becomes one clip from Google's Veo 3.1 *first/last frame* model on fal.ai: the clip
starts exactly on one view and ends exactly on the next, and the model films the camera move in between (like an
architectural walkthrough). The clips run in parallel, fal's free ffmpeg merge joins them, and the MP4 is saved in
`server/.cache/videos/` and shown on the page with a download button. "Return to the first view" adds a closing clip for a loop.

| Quality | fal.ai model | Price (1080p, no audio) |
| --- | --- | --- |
| Fast (default) | `fal-ai/veo3.1/fast/first-last-frame-to-video` | $0.10 per second |
| Best | `fal-ai/veo3.1/first-last-frame-to-video` | $0.20 per second |

Example: Front → Right → Back at 4 seconds per move on Fast is 2 clips, 8 seconds, about $0.80. A run takes 1–3 minutes.
**Format:** Landscape 16:9 (default) or Portrait 9:16. Veo crops frames to that shape, which would cut the lid or base
off a portrait product shot, so each chosen view is first extended to the video's shape with fal.ai Bria Expand
(`fal-ai/bria/expand`, $0.04 per view, skipped when a view already has that shape). "Match the views" skips this step.
Needs the Cloud (fal.ai) generator. Views made with the same moodboard style share one scene, so pick views of one style;
the page warns when the chosen views have different styles. The video model invents the frames between the views, so the
product can drift mid-move: review the video like any AI-made view.
**Complex products:** Veo has no model of the object, so every frame between two keyframes is imagined. Short moves
survive; keys, levers, handles and other fine mechanisms can still warp. Pick more views so each step is a small turn
(keep it under ~90°; the page shows the largest step and asks again before spending money above that), or use Best
quality. **Add middle view** does the first half for you: for any step over 90° it asks the angle model for the pose half
way and re-sequences the clips, so the video only interpolates what it was actually shown.

The guard compares the result with the reference photo the generation actually started from, and it stands down whenever
that photo already carries printing of its own - including keyboards, dials and rulers, whose lettering OCR returns as
single characters. On a product with no printing of its own it can only see invented wording, and it removes it.

## Model settings that matter

The pipeline is Qwen-Image-Edit-2511 with fal's Multiple-Angles LoRA. That LoRA was trained on **96 camera poses** -
8 azimuths (45° steps), 4 elevations (-30 / 0 / 30 / 60°) and 3 distances (close-up ×0.6 / medium ×1.0 / wide ×1.8) -
driven by the prompt `<sks> [azimuth] [elevation] [distance]`, in that order. The settings below exist because of that:

| Setting | Value used | Why it matters |
| --- | --- | --- |
| Pose snapping | on (`SNAP_POSES=0` off) | A request between the 96 poses is off-distribution: the model re-imagines the product instead of rotating it, which is where invented labels and drifting geometry come from. `292°, 56°` becomes `270°, 60°`. |
| References per view | 1, plus up to 2 other sides when the side was never photographed | 2511 accepts several images at once; the extra sides stop it inventing a label for a face it has no source for. |
| Same-view shortcut | on | Asking for the pose an uploaded photo already shows returns that photo instead of paying to re-imagine it. |
| Candidate samples | 1 (`FAL_CANDIDATES=2..4`) | The endpoint returns up to 4 samples in one call. Worth paying for once there is a picker: the server keeps the sample that retained the most of the reference photo's wording, which fixes the occasional fully blank label. Multiplies the per-view price. |
| `guidance_scale` (fal) | 4.5 | Endpoint default. At CFG 1 (the local turbo path) a negative prompt has no effect at all. |
| `num_inference_steps` (fal) | 28 | Endpoint default and the trained sampling regime. |
| `lora_scale` (fal) | 1 (`LORA_SCALE`) | Card recommends 0.8-1.0. Lower holds the product closer to the photo, higher follows the camera more literally. |
| `image_size` (fal) | `square_hd` = 1 MP | 1 MP is the training size and the price unit ($0.035). Without it fal keeps the input's own dimensions, so a 12 MP phone photo is billed about 12x and rendered far above what the LoRA learned. |
| Restyle `image_size` (fal) | ~1 MP, the photo's own proportions | The plain edit endpoint keeps the input's size by default, so a 12 MP photo was rendered and billed at 12 MP. Not `square_hd`: that would reframe a portrait shot. |
| Restyle seed | `style.seed` from the page (default 1) | Same seed + same inputs = same scene, so an approved scene reproduces; **Try another look** bumps it. Also part of the cache key. |
| Restyle pictures | 1 product + background example + mood example | Roles are named in the prompt (see Scene and mood). Local ComfyUI passes all three; before this only one example was ever used. |
| Video seed | one random seed per job, shared by every clip | Veo's first/last-frame endpoint accepts `seed`; clips that meet at a shared view then agree on grade and light. |
| Video negative prompt | motion/warp words only | "logo" and "label" words were removed: a negative prompt strips real artwork along with invented (same reason as `EXTRA_NEG`). |
| Local steps / CFG | 4 / 1 (turbo) or 20+ / 4 (`LOCAL_STEPS`) | Turbo is the 4-step Lightning distillation: fast, softer. Above 8 steps the Lightning LoRA is skipped and the full model runs at CFG 4, which is what sharpens fine print. |
| Local megapixels | 1.0 with 40 GB+, 0.8 at 24 GB+, 0.6 below | 1 MP is the training size; 0.6 softens small text such as a nutrition panel. |
| Local angles LoRA | 0.9 (`LOCAL_LORA`) | Card says 0.8-1.0, start at 0.9. |

`GET /api/health` reports the settings in effect. These are not prompt tricks: prompting decides *what* is drawn,
these decide whether the model rotates the real product or reinvents it.

## How the UI controls are mapped

- **Reference photo:** the uploaded side (front/right/back/left) nearest the requested rotation; the
  rotation is sent relative to that photo.
- **Rotation** → azimuth (0 front, 90 right, 180 back, 270 left), sent as the target camera pose around the product, which is the space the LoRA's prompts and angles are trained in. **Height** → elevation, clamped to −30…90° (fal) or −30…60° (HF).
- A pose one of the uploaded photos already shows is returned as that photo: no paid call for a view you already have.
- **Distance** 0–100 → fal `zoom` 10–0, or HF distance 0.6–1.8.
- **Lens** and **Tilt** → extra prompt text on fal; the HF Space and local generator ignore them.
- Every provider snaps to the LoRA's vocabulary by default: 8 rotations (45° steps), 4 heights (-30, 0, 30, 60°), 3 distances. The page's "Snap camera to the 96 trained poses" switch controls it, and `SNAP_POSES=0` disables it server-side.
- The editable prompt box is not sent to the model: this LoRA is driven by camera parameters, not free text.

`POST /api/generate` takes the page's JSON (`images`, `azimuth`, `elevation`, `distance`, `roll`, `lens_mm`, `prompt`)
and returns `{ image, provider, reference, relative_turn, prompt, seed }`. Errors come back as plain text with
status 502, which the page shows as "Generation failed".
