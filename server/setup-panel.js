/* "AI generator" panel, added by server.js to the copy of index.html it serves (index.html itself is untouched).
   Local (free, runs on this Mac, one-click install) or Cloud (fal.ai API key). Points the page's BACKEND hook
   at the server whenever the selected generator is ready, so the Make page uses it without a reload. */
(function () {
  var st = null, open = true, busy = false, msg = '', keyEdit = false, timer = 0;
  var box = document.createElement('div');
  box.id = 'aigen';
  box.style.cssText = 'max-width:980px;margin:0 auto;padding:16px 16px 0';
  document.body.insertBefore(box, document.body.firstChild);
  var css = document.createElement('style');
  css.textContent = '#aigen .card{margin:0}#aigen .seg{display:inline-flex;border:1px solid var(--bd);border-radius:10px;overflow:hidden}'
    + '#aigen .seg button{border:0;border-radius:0;background:transparent}#aigen .seg button.on{background:var(--pri);color:var(--onpri)}'
    + '#aigen .bar2{height:8px;background:var(--bg);border-radius:99px;overflow:hidden;margin:8px 0 4px}#aigen .bar2>div{height:100%;background:var(--ac);transition:width .6s}'
    + '#aigen .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}'
    + '#aigen input[type=password]{width:100%;max-width:420px}#aigen a{color:var(--ac)}';
  document.head.appendChild(css);

  function e(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function api(p, body) {
    return fetch('/api/setup/' + p, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-View-Review': '1' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); });
  }
  function refresh() {
    return api('status').then(function (j) {
      var was = st && st.usable, prevErr = st ? st.lastError : ''; st = j;
      window.BACKEND = j.usable ? '/api' : ''; /* the page's own hook: '' = its mock generator */
      if (j.usable && !was && j.local.setup.state !== 'installing') open = false;
      if (j.lastError && j.lastError !== prevErr) open = true; /* show why a generation failed */
      draw(); schedule();
    }).catch(function () { box.innerHTML = ''; });
  }
  function schedule() {
    clearTimeout(timer);
    var fast = st && (st.local.setup.state === 'installing' || (st.mode === 'local' && st.local.installed && st.local.engine !== 'ready'));
    timer = setTimeout(refresh, fast ? 2000 : 8000);
  }
  function pill() {
    if (!st.usable) return '<span class="st"><span class="dot" style="background:var(--warn)"></span>Not set up: Make uses placeholder images</span>';
    if (st.lastError) return '<span class="st"><span class="dot" style="background:var(--bad)"></span>Last view failed: see below</span>';
    if (st.mode === 'local') return st.local.engine === 'ready'
      ? '<span class="st"><span class="dot" style="background:var(--ok)"></span>Local AI ready</span>'
      : '<span class="st"><span class="dot" style="background:var(--warn)"></span>Local AI starting…</span>';
    return '<span class="st"><span class="dot" style="background:var(--ok)"></span>Cloud AI (fal.ai) ready' + (st.lastSecs ? ' · last view ' + mins(st.lastSecs) : '') + '</span>';
  }
  function mins(s) { return s < 90 ? s + ' seconds' : (s / 60).toFixed(1) + ' minutes'; }
  function estimate(ram) { return ram >= 40 ? 'a few minutes' : ram >= 24 ? 'about 5–10 minutes' : '10 minutes or more'; }
  function localBody() {
    var L = st.local, s = L.setup;
    if (s.state === 'installing') {
      var pct = s.phase === 'models' ? Math.min(99, Math.round(s.doneGb / L.gb * 100)) : 2;
      return '<p><strong>' + (s.phase === 'models' ? 'Step 2 of 2: downloading the AI model' : 'Step 1 of 2: installing the AI engine') + '</strong></p>'
        + '<div class="bar2"><div style="width:' + pct + '%"></div></div>'
        + '<div class="st">' + (s.phase === 'models' ? s.doneGb.toFixed(1) + ' of ' + L.gb.toFixed(0) + ' GB · ' + pct + '%' : 'Preparing…') + (s.log.length ? ' · ' + e(s.log[s.log.length - 1]).slice(0, 90) : '') + '</div>'
        + '<p class="mut" style="margin-top:6px">This runs once and can take 20–60 minutes depending on your internet. Keep the Start window open. You can keep using the page.</p>';
    }
    if (!L.installed) return '<p>Runs on this Mac. Free, no account, unlimited views. Photos never leave this computer.</p>'
      + '<p class="mut">One-time download of about ' + L.gb.toFixed(0) + ' GB, sized for this Mac’s ' + L.ram + ' GB of memory. Each view then takes ' + estimate(L.ram) + '.</p>'
      + (s.state === 'failed' ? '<div class="err" style="margin-bottom:8px">Setup stopped: ' + e(s.error) + '</div>' : '')
      + '<button class="pri" data-g="install"' + (busy ? ' disabled' : '') + '>' + (s.state === 'failed' ? 'Try again' : 'Set up free AI generator') + '</button>';
    if (L.engine !== 'ready') return '<p>Starting the AI engine… The first view after starting takes longer while the model loads.</p>';
    return '<p>Ready. Views are generated on this Mac, ' + (st.lastSecs ? 'the last one took ' + mins(st.lastSecs) : 'usually ' + estimate(L.ram)) + '. Rotation snaps to 45° steps.</p>';
  }
  function cloudBody() {
    var C = st.cloud;
    var form = '<label style="margin:8px 0 6px">fal.ai API key<br><input type="password" id="aigen-key" placeholder="Paste your fal.ai key" autocomplete="off"></label>'
      + '<button class="pri" data-g="savekey"' + (busy ? ' disabled' : '') + '>Save and use cloud</button>'
      + (C.keySet ? ' <button data-g="cancelkey">Cancel</button>' : '');
    var intro = '<p>Fastest and best quality, any angle in degrees. About $0.04 per view, paid to fal.ai.</p>';
    if (!C.keySet || keyEdit) return intro + '<p class="mut">1. <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noopener">Create a key</a> · 2. <a href="https://fal.ai/dashboard/billing" target="_blank" rel="noopener">Add credit</a> · 3. Paste the key here. It is saved only on this Mac.</p>' + form;
    return intro + '<p>Using key <code>' + e(C.keyHint) + '</code>.</p><button data-g="editkey">Replace key</button> <button data-g="removekey">Remove key</button>';
  }
  function draw() {
    if (!st) return;
    var cloud = st.mode === 'cloud';
    var h = '<div class="card"><div class="row" style="margin-top:0"><span><strong>AI generator</strong> &nbsp;' + pill() + '</span>'
      + '<span><span class="seg"><button data-g="local" class="' + (cloud ? '' : 'on') + '">Local (free)</button><button data-g="cloud" class="' + (cloud ? 'on' : '') + '">Cloud (fal.ai)</button></span> '
      + '<button data-g="toggle" title="' + (open ? 'Hide details' : 'Show details') + '">' + (open ? 'Hide' : 'Details') + '</button></span></div>';
    if (open) h += '<div style="margin-top:10px">' + (cloud ? cloudBody() : localBody())
      + (st.lastError ? '<div class="err" style="margin-top:8px">Last generation failed: ' + e(st.lastError) + '</div>' : '')
      + (msg ? '<div class="err" style="margin-top:8px">' + e(msg) + '</div>' : '') + '</div>';
    box.innerHTML = h + '</div>';
  }
  function act(p, body) {
    busy = true; msg = ''; draw();
    return api(p, body).then(function (j) { st = j; window.BACKEND = j.usable ? '/api' : ''; })
      .catch(function (x) { msg = x.message; })
      .then(function () { busy = false; draw(); schedule(); });
  }
  box.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-g]'); if (!b) return;
    var g = b.dataset.g;
    if (g === 'toggle') { open = !open; draw(); }
    else if (g === 'local' || g === 'cloud') { open = true; keyEdit = false; act('mode', { mode: g }); }
    else if (g === 'install') act('install', {});
    else if (g === 'savekey') { var k = document.getElementById('aigen-key').value.trim(); if (!k) { msg = 'Paste a key first.'; draw(); return; } keyEdit = false; act('cloud-key', { key: k }); }
    else if (g === 'editkey') { keyEdit = true; draw(); }
    else if (g === 'cancelkey') { keyEdit = false; draw(); }
    else if (g === 'removekey') act('cloud-key', { key: '' });
  });
  refresh();
})();
