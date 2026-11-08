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
   - **Local (free):** click **Set up free AI generator**. It installs ComfyUI into `~/ComfyUI` and downloads
     the model, sized to the Mac's memory (table below), with a progress bar. When it finishes, Make uses it.
   - **Cloud (fal.ai):** paste a fal.ai API key (needs credit on the fal.ai account) and click **Save and use cloud**.
   Switch between them any time with the Local / Cloud buttons. Choices and the key are saved in
   `server/.env`, which is git-ignored and stays on that Mac.

If macOS refuses to open `Start.command`, right-click it and choose **Open** once. Without the panel, the same
works from a terminal: `npm --prefix server ci && npm --prefix server start`.

### Local generator details

With `PROVIDER=local` the server starts ComfyUI by itself (log in `$TMPDIR/view-review-comfyui.log`) and
runs the same graph as fal's published `comfyui-workflow-multiple-angles.json` with GGUF (quantized) weights.
The download is sized to the machine's memory, and the server uses the largest model installed:

| Memory | Model / text encoder | Download | Output size |
| --- | --- | --- | --- |
| 40 GB+ (e.g. M4 Pro 48 GB) | Q8_0 / Q8_0, near full quality | ~33 GB | 1.0 MP (~1024 px) |
| 24–39 GB | Q5_K_M / Q6_K | ~25 GB | 0.8 MP |
| under 24 GB (e.g. M5 16 GB) | Q3_K_M / Q4_K_M | ~17 GB | 0.6 MP |

Override with `LOCAL_UNET`, `LOCAL_CLIP` or `LOCAL_MEGAPIXELS` in `server/.env`. `bash server/setup-local.sh`
runs the same install from a terminal.

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
