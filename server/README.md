# Angle generation backend

Small Node server that serves the prototype (`../index.html`) and powers the **Make** page's
"Generate view" button with a real AI model. The UI is unchanged: the server only fills the page's
existing `BACKEND` hook in the copy it serves.

## Model

[Qwen-Image-Edit-2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511) with the
[Multiple-Angles LoRA](https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA) (Apache 2.0).
It takes one product photo and a camera position (azimuth, elevation, distance) and returns the new view.

| Provider | Needs | Cost | Notes |
| --- | --- | --- | --- |
| fal.ai (default when `FAL_KEY` is set) | `FAL_KEY` | ~$0.04 per 1024×1024 view | Any angle in degrees, fast |
| Hugging Face Space | `HF_TOKEN` (free account) | Free, a few views per day | Angles snap to 45°; queue can be slow |
| Mock (no key) | nothing | free | The page's built-in placeholder |

## Run

```bash
cd server
npm install
cp .env.example .env   # then paste FAL_KEY or HF_TOKEN
npm start              # http://localhost:8787/
```

## How the UI controls are mapped

- **Reference photo:** the uploaded side (front/right/back/left) nearest the requested rotation; the
  rotation is sent relative to that photo.
- **Rotation** → azimuth (0 front, 90 right, 180 back, 270 left). **Height** → elevation, clamped to −30…90° (fal) or −30…60° (HF).
- **Distance** 0–100 → fal `zoom` 10–0, or HF distance 0.6–1.8.
- **Lens** and **Tilt** → extra prompt text on fal; the HF Space ignores them.
- The editable prompt box is not sent to the model: this LoRA is driven by camera parameters, not free text.

`POST /api/generate` takes the page's JSON (`images`, `azimuth`, `elevation`, `distance`, `roll`, `lens_mm`, `prompt`)
and returns `{ image, provider, reference, relative_turn, prompt, seed }`. Errors come back as plain text with
status 502, which the page shows as "Generation failed".
