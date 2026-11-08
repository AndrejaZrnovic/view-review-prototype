#!/usr/bin/env bash
# Free local generator: installs ComfyUI + the GGUF loader and downloads a quantized
# Qwen-Image-Edit-2511 with the Multiple-Angles and 4-step Lightning LoRAs.
# Normally started by the "Set up free AI generator" button on the page (Start.command opens it).
#
# The model size is chosen from this machine's memory (the server passes LOCAL_UNET / LOCAL_CLIP):
#   40 GB+  -> Q8_0 model + Q8_0 text encoder (~33 GB download, near full quality)
#   24 GB+  -> Q5_K_M + Q6_K (~25 GB)
#   less    -> Q3_K_M + Q4_K_M (~17 GB, tested on an Apple M5 with 16 GB)
# Needs uv (https://docs.astral.sh/uv/; Start.command fetches it) and that much free disk plus ~6 GB.
# Env overrides: COMFY_DIR (default ~/ComfyUI), LOCAL_UNET, LOCAL_CLIP, HF_TOKEN (optional).
# Lines starting with "STEP:" are read by the server to show progress.
set -euo pipefail
COMFY_DIR="${COMFY_DIR:-$HOME/ComfyUI}"
if [ "$(uname)" = Darwin ]; then RAM_GB=$(( $(sysctl -n hw.memsize) / 1073741824 )); else RAM_GB=$(( $(awk '/MemTotal/{print $2}' /proc/meminfo) / 1048576 )); fi
if   [ "$RAM_GB" -ge 40 ]; then Q=Q8_0;   CQ=Q8_0
elif [ "$RAM_GB" -ge 24 ]; then Q=Q5_K_M; CQ=Q6_K
else                            Q=Q3_K_M; CQ=Q4_K_M; fi
UNET="${LOCAL_UNET:-qwen-image-edit-2511-$Q.gguf}"
CLIP="${LOCAL_CLIP:-Qwen2.5-VL-7B-Instruct-$CQ.gguf}"
echo "Memory: ${RAM_GB} GB -> model $UNET, text encoder $CLIP"
command -v uv >/dev/null || { echo "uv is required: https://docs.astral.sh/uv/ (Start.command installs it)"; exit 1; }

echo "STEP: engine"
fetch_repo() { # github "owner/repo" into dir, without needing git
  mkdir -p "$2"; curl -fsSL "https://github.com/$1/archive/refs/heads/master.tar.gz" | tar -xz -C "$2" --strip-components 1
}
[ -f "$COMFY_DIR/main.py" ] || fetch_repo comfyanonymous/ComfyUI "$COMFY_DIR"
cd "$COMFY_DIR"
[ -f custom_nodes/ComfyUI-GGUF/nodes.py ] || fetch_repo city96/ComfyUI-GGUF custom_nodes/ComfyUI-GGUF
[ -x .venv/bin/python ] || uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python torch torchvision torchaudio
uv pip install --python .venv/bin/python -r requirements.txt -r custom_nodes/ComfyUI-GGUF/requirements.txt "huggingface_hub[hf_xet]"

echo "STEP: models"
HF=.venv/bin/hf
M=models
get() { # repo file target_dir
  local name; name=$(basename "$2")
  [ -f "$3/$name" ] && return 0
  echo "Downloading $name"
  mkdir -p "$3"
  if [ "$name" = "$2" ]; then $HF download "$1" "$2" --local-dir "$3" >/dev/null
  else tmp="$3/.cache/tmp"; $HF download "$1" "$2" --local-dir "$tmp" >/dev/null; mv "$tmp/$2" "$3/"; rm -rf "$tmp"; fi
}
get Comfy-Org/Qwen-Image_ComfyUI split_files/vae/qwen_image_vae.safetensors $M/vae
get fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA qwen-image-edit-2511-multiple-angles-lora.safetensors $M/loras
get lightx2v/Qwen-Image-Edit-2511-Lightning Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors $M/loras
get unsloth/Qwen2.5-VL-7B-Instruct-GGUF mmproj-BF16.gguf $M/text_encoders
# ComfyUI-GGUF finds the vision part by name: it must contain the text encoder's name and "mmproj".
[ -e $M/text_encoders/Qwen2.5-VL-7B-Instruct-mmproj-BF16.gguf ] || ln -s mmproj-BF16.gguf $M/text_encoders/Qwen2.5-VL-7B-Instruct-mmproj-BF16.gguf
get unsloth/Qwen2.5-VL-7B-Instruct-GGUF "$CLIP" $M/text_encoders
get unsloth/Qwen-Image-Edit-2511-GGUF "$UNET" $M/unet
rm -rf $M/vae/.cache $M/loras/.cache $M/text_encoders/.cache $M/unet/.cache
echo "STEP: done"
echo "Local generator ready in $COMFY_DIR"
