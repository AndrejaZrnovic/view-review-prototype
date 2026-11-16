# Repository Guidelines

## Project Structure & Module Organization

`index.html` contains the browser prototype: CSS in `<style>`, markup in `<body>`, and study logic in `<script>`. The `STIMULUS CONFIG` block defines the product, views, planted errors, and storyboard shots. Page renderers live in `P`; event handlers and session storage logic follow them. `assets/stimuli/` holds the source photo, AI views, and answer-key documentation. There are no separate source or test directories. `CLAUDE.md` records the repository's Git rules.

## Build, Test, and Development Commands

There are no dependencies or build step. Open `index.html` directly in a browser to run the prototype. For a local HTTP preview, run `python3 -m http.server 8000` from the repository root and visit `http://localhost:8000/`. No `npm`, `make`, or test command is configured.

## Coding Style & Naming Conventions

Keep changes in the existing HTML/CSS/plain JavaScript structure; avoid adding a framework for small edits. Match the file's compact style, and use two-space indentation for new multiline blocks. Existing JavaScript uses `var`, function declarations, short helper names, and uppercase constants such as `VIEWS` and `SHOTS`. Use descriptive names for new behavior and keep sample stimulus changes inside the marked configuration block. No formatter or linter is configured.

## Testing Guidelines

Validate changes manually in a browser. Run a session in both baseline and labeled conditions, checking consent, view decisions, storyboard effects, questions, debrief, and researcher results. For storage changes, reload and verify saved sessions and copied tables. For custom stimuli, confirm image upload, planted-error correction, and shot selection. Check discrepancy flags, notes, and answer keys in exported view data. There is no automated test framework or coverage threshold; add tests only if introducing a test setup.

## Commit & Pull Request Guidelines

Recent commits use short imperative subjects such as `Rename ...` and `Delete ...`; follow that style and keep each commit focused. Work on a feature branch and submit a pull request with a summary, manual test notes, and screenshots for visible UI changes. Link a relevant issue when one exists. Per `CLAUDE.md`, do not commit or merge directly to `main`/`master`, push without the owner's explicit permission for that push, or force-push.

## Security & Study Data

The researcher code is client-side and is not secure authentication. Session data stays in browser `localStorage`; uploaded images stay in the open tab. Avoid committing participant data or real researcher codes. Replace placeholder consent and debrief copy with approved study wording before use.
