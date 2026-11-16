#!/bin/bash
# Double-click to run View Review on a Mac. First run fetches Node.js and uv into .runtime/ (no admin needed),
# then opens the app in your browser. Keep this window open while you use it; close it to stop.
cd "$(dirname "$0")" || exit 1
RT="$PWD/.runtime"
[ "$(uname -m)" = arm64 ] && NODE_ARCH=arm64 UV_ARCH=aarch64 || { NODE_ARCH=x64; UV_ARCH=x86_64; }
export PATH="$RT/bin:$RT/node/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
fail() { echo; echo "Something went wrong: $1"; echo "Press Return to close."; read -r; exit 1; }

if ! node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)' 2>/dev/null; then
  echo "Downloading Node.js (one time)…"
  mkdir -p "$RT/node" && curl -fsSL "https://nodejs.org/dist/v24.14.0/node-v24.14.0-darwin-$NODE_ARCH.tar.gz" | tar -xz -C "$RT/node" --strip-components 1 || fail "could not download Node.js"
fi
if ! command -v uv >/dev/null; then
  echo "Downloading uv (one time)…"
  mkdir -p "$RT/bin" && curl -fsSL "https://github.com/astral-sh/uv/releases/download/0.9.5/uv-$UV_ARCH-apple-darwin.tar.gz" | tar -xz -C "$RT/bin" --strip-components 1 || fail "could not download uv"
fi
if [ ! -d server/node_modules ]; then
  echo "Installing the app (one time)…"
  (cd server && npm ci --no-audit --no-fund) || fail "npm install failed"
fi

PORT="${PORT:-8787}"
URL="http://localhost:$PORT/"
if curl -fs "${URL}api/health" >/dev/null 2>&1; then echo "Already running."; open "$URL"; exit 0; fi
( for i in $(seq 1 30); do curl -fs "${URL}api/health" >/dev/null 2>&1 && { open "$URL"; break; }; sleep 1; done ) &
echo
echo "View Review is running at $URL"
echo "Keep this window open while you use it. Close it (or press Ctrl+C) to stop."
echo
exec node server/server.js
