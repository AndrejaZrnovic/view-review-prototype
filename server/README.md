# Angle generation backend

Small Node server that serves the prototype (`../index.html`) and powers the **Make** page's
"Generate view" button with a real AI model. `index.html` is not modified: the server adds a small
**AI generator** panel (`setup-panel.js`) to the copy it serves and fills the page's existing `BACKEND` hook.

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

The choice is saved as `LOCAL_MODEL` (best / balanced / small) in `server/.env`. Output size follows memory:
1.0 MP (~1024 px) at 40 GB+, 0.8 MP at 24 GB+, else 0.6 MP. Override with `LOCAL_UNET`, `LOCAL_CLIP` or
`LOCAL_MEGAPIXELS`. `bash server/setup-local.sh`
runs the same install from a terminal.

## Moodboard styles

When a style is applied on the Make page (**2. Style moodboard → Apply Style**), each request carries the
selected tiles' scene and mood descriptions, plus any image you uploaded with **Add your own image**.
The server then works in two steps:

1. **Style:** the front photo (or the first one uploaded) is restyled with the plain Qwen-Image-Edit-2511 model,
   without the angle add-on: same product, new background, surface and lighting. An uploaded style image goes in as a
   second reference. Any other photo used for an angle is placed "in the same scene as" that styled front photo.
   Styled photos are cached, so this runs once per style.
2. **Angle:** the usual camera step runs on the styled photo. If the requested view equals the photo's own angle,
   the styled photo is returned as-is.

So all views of a set share one scene. Styled photos are also saved in `server/.cache/` (git-ignored), so the
scene survives a restart.

**Invented text guard (fal.ai key needed):** after every style and angle step, the result is read with fal.ai's free
Florence-2 OCR. If it shows words that aren't in the uploaded photos (the model likes to invent brand names on sides it
never saw), one cleanup edit paints them out, keeping the handle, lid and other physical parts. Symbols without
letters are not caught. Views of a side that no uploaded photo shows are labelled "Side not in your photos" on the page
and in the review step. `CLEAN_UNSEEN=0` in `server/.env` turns the guard off. Cost: one extra generation per style (local), or ~$0.03 per megapixel
on fal.ai (`fal-ai/qwen-image-edit-2511`). The free Hugging Face Space ignores styles.

## How the UI controls are mapped

- **Reference photo:** the uploaded side (front/right/back/left) nearest the requested rotation; the
  rotation is sent relative to that photo.
- **Rotation** → azimuth (0 front, 90 right, 180 back, 270 left). **Height** → elevation, clamped to −30…90° (fal) or −30…60° (HF).
- **Distance** 0–100 → fal `zoom` 10–0, or HF distance 0.6–1.8.
- **Lens** and **Tilt** → extra prompt text on fal; the HF Space and local generator ignore them.
- Local and HF snap to the LoRA's vocabulary: 8 rotations (45° steps), 4 heights (−30, 0, 30, 60°), 3 distances.
- The editable prompt box is not sent to the model: this LoRA is driven by camera parameters, not free text.

`POST /api/generate` takes the page's JSON (`images`, `azimuth`, `elevation`, `distance`, `roll`, `lens_mm`, `prompt`)
and returns `{ image, provider, reference, relative_turn, prompt, seed }`. Errors come back as plain text with
status 502, which the page shows as "Generation failed".
