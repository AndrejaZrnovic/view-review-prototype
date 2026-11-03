# View Review Prototype

A scripted, browser-based prototype for a thesis study on human control over AI-assisted product video production. It tests whether showing where each product view came from (uploaded, AI-inferred, user-edited) and letting people compare it with the original materials helps them catch AI errors before those errors reach later shots.

## What it is
- One file: `index.html`. No build step, no dependencies, no server.
- Two conditions: **A** (plain keep/remove) and **B** (source labels, compare, approve/reject/replace, impact notices).
- Pre-made views with planted errors, so every participant sees the same stimuli. There is no live AI.

## Run it
Open `index.html` in a browser, or publish with GitHub Pages (Settings > Pages > deploy from `main`, root folder).

## Run a session
1. Enter the researcher code (set in the script: `var CODE='research'`; change it).
2. Enter a participant ID and choose a condition (default alternates A/B on this device).
3. Use the sample bottle, or tick "Use my own images" and load originals and AI views. Mark planted errors and add a corrected image for each.
4. Press Start and hand over the device.
5. After the debrief, enter the code to open results. Copy the participant table and view table into a spreadsheet.

## Data
- Sessions are saved in the browser (localStorage) on that device only. Clear saved sessions after piloting.
- Loaded images stay in the open tab and are lost on reload.

## Limits
- The researcher code is client-side and not secure.
- No automatic backup beyond browser storage.
- Consent and debrief text are placeholders; replace them with your ethics-approved wording.

## Licence
Add a licence of your choice (for example MIT).
