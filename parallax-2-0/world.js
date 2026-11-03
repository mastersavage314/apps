/* Parallax 2.0: every place on Earth and Gaia, plus the zone workshop.
   Place data: GeoNames (CC BY 4.0), every populated place with 1,000 people or more, grouped by its real time zone.
   Earth reads the zone straight from the browser. Gaia turns the same zone into its Gaian twin (add 9 hours, multiply by 1.5). */
(function () {
  'use strict';
  var E = window.pxEarth, G = window.pxGaia;
  if (!E || !G) { return; }
  var PLANETS = { earth: E, gaia: G };
  var KEYS = ['earth', 'gaia'];
  var BASE = '';
  try { BASE = new URL('.', document.currentScript.src).href; } catch (err) { BASE = ''; }
  var PAGE = 40;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function norm(s) {
    s = String(s).toLowerCase();
    if (s.normalize) { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    return s.replace(/[ʻ'’`]/g, '').replace(/[_\-–.]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (html !== undefined) { n.innerHTML = html; } return n; }
  function num(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function plural(n, one, many) { return num(n) + ' ' + (n === 1 ? one : many); }

  /* ---------- The database: loaded once, searched in memory ---------- */
  var DB = { state: 'idle', small: 'idle', Z: [], C: [], A: [], nm: [], nn: [], ci: [], ai: [], pop: [], zi: [], fl: [], cn: [], an: [], cidx: [], top: [], waiting: [] };
  var statusFns = [];
  function paintStatus() { statusFns.forEach(function (f) { f(); }); }
  function getJSON(name) {
    return fetch(BASE + name).then(function (r) { if (!r.ok) { throw new Error(name + ' ' + r.status); } return r.json(); });
  }
  // Reads the packed rows a little at a time so the page stays smooth.
  function ingest(blocks, done) {
    var keys = Object.keys(blocks), k = 0;
    function step() {
      var budget = 6000, f, rows, r;
      while (k < keys.length && budget > 0) {
        rows = blocks[keys[k]].split('\n');
        for (r = 0; r < rows.length; r++) {
          f = rows[r].split('\t');
          DB.nm.push(f[0]); DB.nn.push(norm(f[0]));
          DB.ci.push(parseInt(f[1], 36)); DB.ai.push(parseInt(f[2], 36)); DB.pop.push(parseInt(f[3], 36) || 0);
          DB.zi.push(+keys[k]); DB.fl.push(f[4] === 'c' ? 2 : (f[4] === 'a' ? 1 : 0));
        }
        budget -= rows.length; k++;
      }
      if (k < keys.length) { window.setTimeout(step, 0); } else { done(); }
    }
    step();
  }
  function indexAll() {
    var n = DB.nm.length, i, c;
    DB.cidx = DB.C.map(function (c2, ix) { return { i: ix, code: c2[0], name: c2[1], nn: DB.cn[ix], count: 0, top: -1, zones: {} }; });
    for (i = 0; i < n; i++) {
      c = DB.cidx[DB.ci[i]]; c.count++; c.zones[DB.zi[i]] = (c.zones[DB.zi[i]] || 0) + 1;
      if (c.top < 0 || DB.fl[i] === 2 && DB.fl[c.top] !== 2 || (DB.fl[i] === 2) === (DB.fl[c.top] === 2) && DB.pop[i] > DB.pop[c.top]) { c.top = i; }
    }
    var order = [];
    for (i = 0; i < n; i++) { order.push(i); }
    order.sort(function (a, b) { return DB.pop[b] - DB.pop[a]; });
    DB.top = order.slice(0, 3000);
    zoneInfoCache = null;
  }
  var zoneInfoCache = null;
  // Every zone with its biggest place and how many places sit in it.
  function zoneInfo() {
    if (zoneInfoCache) { return zoneInfoCache; }
    var info = DB.Z.map(function () { return { count: 0, top: -1, ccs: {} }; }), n = DB.nm.length, i, z;
    for (i = 0; i < n; i++) {
      z = info[DB.zi[i]]; z.count++; z.ccs[DB.ci[i]] = 1;
      if (z.top < 0 || DB.pop[i] > DB.pop[z.top]) { z.top = i; }
    }
    zoneInfoCache = info;
    return info;
  }
  function ensureLoaded(cb) {
    if (cb) { if (DB.state === 'ready' || DB.state === 'failed') { cb(); return; } DB.waiting.push(cb); }
    if (DB.state !== 'idle') { return; }
    DB.state = 'loading'; paintStatus();
    getJSON('places-a.json').then(function (d) {
      DB.Z = d.z; DB.C = d.c; DB.A = d.a;
      DB.cn = d.c.map(function (c) { return norm(c[1]); }); DB.an = d.a.map(norm);
      ingest(d.p, function () {
        indexAll(); DB.state = 'ready'; paintStatus();
        var cbs = DB.waiting; DB.waiting = []; cbs.forEach(function (f) { f(); });
        var idle = window.requestIdleCallback || function (f) { return window.setTimeout(f, 1500); };
        idle(function () { loadSmall(); });
      });
    }).catch(function () {
      DB.state = 'failed'; paintStatus();
      var cbs = DB.waiting; DB.waiting = []; cbs.forEach(function (f) { f(); });
    });
  }
  // The smaller towns (1,000 to 5,000 people) come second, in the background.
  function loadSmall() {
    if (DB.small !== 'idle' || DB.state !== 'ready') { return; }
    var saver = navigator.connection && navigator.connection.saveData;
    if (saver) { return; }
    DB.small = 'loading'; paintStatus();
    getJSON('places-b.json').then(function (d) {
      ingest(d.p, function () { indexAll(); DB.small = 'ready'; paintStatus(); window.dispatchEvent(new CustomEvent('px:db')); });
    }).catch(function () { DB.small = 'failed'; paintStatus(); });
  }

  /* ---------- Names, labels, zones ---------- */
  function adminOf(i) { return DB.A[DB.ai[i]] || ''; }
  function countryOf(i) { return DB.C[DB.ci[i]][1]; }
  function placeLabel(i) {
    var a = adminOf(i), name = DB.nm[i];
    return name + (a && a !== name ? ', ' + a : '') + ', ' + countryOf(i);
  }
  function placeSub(i) { var a = adminOf(i); return (a && a !== DB.nm[i] ? a + ', ' : '') + countryOf(i); }
  var refCache = { earth: {}, gaia: {} };
  function zoneRef(pk, z) {
    var c = refCache[pk];
    if (c[z] === undefined) { c[z] = PLANETS[pk].refFor(DB.Z[z]); }
    return c[z];
  }
  function whereText(i) { return placeSub(i) + ', on ' + DB.Z[DB.zi[i]]; }

  /* ---------- Search ---------- */
  function offsetsNow(pk) {
    var now = Date.now(), out = [], z, ref;
    for (z = 0; z < DB.Z.length; z++) { ref = zoneRef(pk, z); out.push(ref ? PLANETS[pk].describe(ref, now).off : 9999); }
    return out;
  }
  // filters: cc (country index), zone (zone index); sort: pop | name | time. Returns place indexes.
  function searchPlaces(q, o) {
    o = o || {};
    var key = norm(q || ''), qual = '', c = key.indexOf(',');
    if (c > 0) { qual = key.slice(c + 1).trim(); key = key.slice(0, c).trim(); }
    var cc = o.cc === undefined || o.cc === '' || o.cc === null ? -1 : +o.cc, zz = o.zone === undefined || o.zone === '' || o.zone === null ? -1 : +o.zone;
    var n = DB.nm.length, i, name, score, hits = [], sc = {};
    if (!o.full && !key && !qual && cc < 0 && zz < 0 && (o.sort || 'pop') === 'pop') { return DB.top.slice(); }
    for (i = 0; i < n; i++) {
      if (cc >= 0 && DB.ci[i] !== cc) { continue; }
      if (zz >= 0 && DB.zi[i] !== zz) { continue; }
      if (key) {
        name = DB.nn[i];
        if (name === key) { score = 0; } else if (name.indexOf(key) === 0) { score = 1; } else if (name.indexOf(' ' + key) !== -1) { score = 2; }
        else if (key.length >= 3 && name.indexOf(key) !== -1) { score = 3; } else { continue; }
      } else { score = 0; }
      if (qual && DB.cn[DB.ci[i]].indexOf(qual) === -1 && DB.an[DB.ai[i]].indexOf(qual) === -1 && DB.C[DB.ci[i]][0].toLowerCase() !== qual) { continue; }
      hits.push(i); sc[i] = score;
    }
    var sort = o.sort || 'pop', offs = sort === 'time' ? offsetsNow(o.planet || 'earth') : null;
    hits.sort(function (a, b) {
      if (key && sc[a] !== sc[b]) { return sc[a] - sc[b]; }
      if (sort === 'name') { return DB.nn[a] < DB.nn[b] ? -1 : (DB.nn[a] > DB.nn[b] ? 1 : DB.pop[b] - DB.pop[a]); }
      if (sort === 'time') { return offs[DB.zi[a]] - offs[DB.zi[b]] || DB.pop[b] - DB.pop[a]; }
      return DB.pop[b] - DB.pop[a];
    });
    return hits;
  }
  function matchCountries(q, max) {
    var key = norm(q), out = [], c;
    if (key.length < 2) { return out; }
    for (c = 0; c < DB.cidx.length && out.length < max; c++) { if (DB.cidx[c].nn.indexOf(key) === 0 && DB.cidx[c].top >= 0) { out.push(DB.cidx[c]); } }
    return out;
  }

  /* ---------- Typed text: hand the best place to the sandbox ---------- */
  function resolve(text, pk) {
    if (DB.state === 'idle') { ensureLoaded(); }
    if (DB.state === 'loading') { return { error: 'The world’s places are still loading. Give it a second and try again.' }; }
    if (DB.state !== 'ready') { return null; }
    var hit = searchPlaces(text, { planet: pk });
    var i = -1, label = '';
    if (hit.length) { i = hit[0]; label = placeLabel(i); }
    else {
      var cs = matchCountries(text, 1);
      if (cs.length) { i = cs[0].top; label = DB.nm[i] + ', ' + cs[0].name; }
    }
    if (i < 0) { return null; }
    var ref = zoneRef(pk, DB.zi[i]);
    return ref ? { ref: ref, label: label } : { error: 'This browser has no clock data for ' + DB.Z[DB.zi[i]] + '.' };
  }
  window.pxWorld = { resolve: resolve, ensureLoaded: ensureLoaded };

  /* ---------- Styles: the page's own colors, so both planets skin themselves ---------- */
  var css = [
    '.px-sug{position:absolute;left:0;right:0;top:100%;z-index:40;margin:.25rem 0 0;padding:.3rem;list-style:none;background:var(--card);color:var(--ink);border:1px solid var(--edge);border-radius:16px;box-shadow:var(--shadow);max-height:19rem;overflow:auto;text-align:left}',
    '.px-sug[hidden]{display:none}',
    '.px-sug li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.1rem .6rem;align-items:baseline;padding:.5rem .65rem;border-radius:11px;cursor:pointer;font-family:var(--body,inherit);font-size:1rem;line-height:1.2}',
    '.px-sug li b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.px-sug li span{color:var(--muted);font-size:.85rem;white-space:nowrap}',
    '.px-sug li[aria-selected="true"],.px-sug li:hover{background:var(--track)}',
    '.px-sug li small{grid-column:1/-1;color:var(--muted);font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.px-world{margin:2.6rem 0 0}',
    '.px-world h2,.px-work h3{font-family:var(--display);font-weight:900;font-size:clamp(1.7rem,6vw,2.3rem);line-height:1.02;margin:0 0 .35rem}',
    '.px-world .sub{margin:0 0 1rem;color:var(--muted);max-width:36rem}',
    '.px-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;margin:.5rem 0}',
    '.px-filters select,.px-world input[type=search]{width:100%;min-width:0;min-height:2.7rem;border-radius:12px;border:1px solid var(--edge);background:var(--card);color:var(--ink);font:inherit;padding:.4rem .7rem}',
    '.px-bar{display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:center;margin:.55rem 0}',
    '.px-both{display:inline-flex;gap:.45rem;align-items:center;font-weight:600;font-size:.92rem;color:var(--muted)}',
    '.px-count{margin:.6rem 0;color:var(--muted);font-size:.92rem}',
    '.px-list{list-style:none;margin:0;padding:0;display:grid;gap:.5rem}',
    '.px-row{display:grid;grid-template-columns:5.2rem minmax(0,1fr) auto;gap:.2rem .8rem;align-items:center;background:var(--card);border:1px solid var(--edge);border-radius:16px;padding:.65rem .8rem;box-shadow:var(--shadow)}',
    '.px-row.above{border-left:5px solid var(--above)}.px-row.below{border-left:5px solid var(--below)}.px-row.on{border-left:5px solid var(--beam)}',
    '.px-t{font-family:var(--display);font-weight:900;font-size:1.75rem;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.px-t i{font-style:normal;font-size:.5em;font-weight:700;margin-left:.2em;color:var(--muted)}',
    '.px-t small{display:block;font-family:var(--body,inherit);font-size:.72rem;font-weight:600;color:var(--muted);letter-spacing:.02em;margin-top:.15rem}',
    '.px-n{min-width:0}.px-n strong{display:block;font-size:1.05rem;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.px-n span{display:block;color:var(--muted);font-size:.86rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.px-n small{display:block;color:var(--muted);font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.px-a{display:flex;gap:.35rem;flex-wrap:wrap;justify-content:flex-end}',
    '.px-a .btn{min-height:2.3rem;padding:.35rem .8rem;font-size:.9rem}',
    '.px-a .btn[disabled]{opacity:.55;cursor:default}',
    '.px-more{display:flex;justify-content:center;margin:.9rem 0}',
    '.px-bulk{margin:1.4rem 0 0;padding:.9rem;border:1px dashed var(--edge);border-radius:18px;display:grid;gap:.6rem}',
    '.px-bulk h3{margin:0;font-family:var(--display);font-weight:700;font-size:1.35rem}',
    '.px-bulk p{margin:0;color:var(--muted);font-size:.9rem}',
    '.px-bulk .acts{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}',
    '.px-bulk select{min-height:2.6rem;border-radius:12px;border:1px solid var(--edge);background:var(--card);color:var(--ink);font:inherit;padding:.3rem .6rem}',
    '.px-note{min-height:1.3em;margin:.55rem 0 0;font-weight:600;color:var(--gold)}',
    '.px-work{margin:1.6rem 0 0}',
    '.px-work p{margin:.15rem 0 .6rem;color:var(--muted);font-size:.92rem;max-width:36rem}',
    '.px-work .make{display:grid;gap:.6rem;grid-template-columns:repeat(2,minmax(0,1fr))}',
    '.px-work .sheet{grid-column:1/-1}',
    '.px-work h4{margin:.8rem 0 .3rem;font-size:.95rem;font-weight:600;color:var(--muted)}',
    '.px-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem}',
    '.px-when{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.45rem;padding:.7rem;border:1px solid var(--edge);border-radius:14px;background:var(--bg)}',
    '.px-when h5{grid-column:1/-1;margin:0;font-size:.95rem}',
    '.px-when [hidden]{display:none}',
    '.px-preview{margin:.3rem 0 0;padding:.65rem .8rem;border-radius:12px;background:var(--track);color:var(--ink);font-size:.95rem}',
    '.px-rules{list-style:none;margin:.6rem 0 0;padding:0;display:grid;gap:.4rem}',
    '.px-rules li{display:flex;gap:.6rem;align-items:center;justify-content:space-between;background:var(--bg);border:1px solid var(--edge);border-radius:12px;padding:.5rem .7rem}',
    '.px-rules li span{min-width:0;font-size:.9rem;color:var(--muted)}.px-rules li b{color:var(--ink);display:block}',
    '@media (min-width:640px){.px-filters{grid-template-columns:repeat(3,minmax(0,1fr))}.px-filters input{grid-column:1/-1}.px-grid2.three{grid-template-columns:repeat(3,minmax(0,1fr))}.px-when{grid-template-columns:repeat(3,minmax(0,1fr))}}',
    '@media (max-width:520px){.px-row{grid-template-columns:4.6rem minmax(0,1fr)}.px-a{grid-column:1/-1;justify-content:stretch}.px-a .btn{flex:1}}'
  ].join('\n');
  var styleEl = el('style'); styleEl.textContent = css; document.head.appendChild(styleEl);

  /* ---------- The sandbox box: suggestions from every place ---------- */
  function suggest(q, pk) {
    var P = PLANETS[pk], out = [], seen = {}, i;
    function put(it) { var k = it.label + '|' + it.ref; if (!seen[k]) { seen[k] = 1; out.push(it); } }
    P.local(q, 5).slice(0, 3).forEach(put);
    if (DB.state === 'ready') {
      var hits = searchPlaces(q, { planet: pk }), shown = 0;
      for (i = 0; i < hits.length && shown < 7; i++) {
        var ref = zoneRef(pk, DB.zi[hits[i]]);
        if (!ref) { continue; }
        put({ label: placeLabel(hits[i]), name: DB.nm[hits[i]], ref: ref, sub: placeSub(hits[i]), tag: DB.Z[DB.zi[hits[i]]] }); shown++;
      }
      matchCountries(q, 2).forEach(function (c) {
        var ref2 = zoneRef(pk, DB.zi[c.top]);
        if (ref2) { put({ label: c.name + ' (' + DB.nm[c.top] + ')', name: c.name, ref: ref2, sub: 'Country, shown at ' + DB.nm[c.top], tag: DB.Z[DB.zi[c.top]] }); }
      });
    }
    P.local(q, 12).slice(3).forEach(put);
    return out.slice(0, 12);
  }
  function attachSuggest(pk) {
    var P = PLANETS[pk], input = document.getElementById(P.pickId);
    if (!input) { return; }
    input.removeAttribute('list');
    var host = input.parentNode, ul = el('ul', 'px-sug'), items = [], act = -1, blurTimer = 0;
    ul.setAttribute('role', 'listbox'); ul.hidden = true;
    if (window.getComputedStyle(host).position === 'static') { host.style.position = 'relative'; }
    host.appendChild(ul);
    function hide() { ul.hidden = true; act = -1; input.setAttribute('aria-expanded', 'false'); }
    function paint() {
      ul.innerHTML = items.map(function (it, n) {
        return '<li role="option" data-n="' + n + '" aria-selected="' + (n === act) + '"><b>' + esc(it.name || it.label) + '</b><span>' + esc(it.tag || '') + '</span><small>' + esc(it.sub || '') + '</small></li>';
      }).join('');
      ul.hidden = !items.length; input.setAttribute('aria-expanded', String(!ul.hidden));
    }
    function refresh() {
      var q = input.value.trim();
      if (q.length < 2) { items = []; hide(); return; }
      if (DB.state === 'idle') { ensureLoaded(function () { if (document.activeElement === input) { refresh(); } }); }
      items = suggest(q, pk); act = -1; paint();
    }
    function choose(n) {
      var it = items[n]; if (!it) { return; }
      hide(); P.setSel(it.ref, it.label); input.blur();
    }
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
    input.addEventListener('input', function (ev) { if (ev.inputType === 'insertReplacementText' || ev.inputType === undefined) { return; } refresh(); });
    input.addEventListener('focus', function () { window.clearTimeout(blurTimer); ensureLoaded(); });
    input.addEventListener('blur', function () { blurTimer = window.setTimeout(hide, 160); });
    input.addEventListener('keydown', function (ev) {
      if (ul.hidden || !items.length) { return; }
      if (ev.key === 'ArrowDown') { ev.preventDefault(); act = (act + 1) % items.length; paint(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); act = (act - 1 + items.length) % items.length; paint(); }
      else if (ev.key === 'Enter' && act >= 0) { ev.preventDefault(); choose(act); }
      else if (ev.key === 'Escape') { hide(); }
    });
    ul.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    ul.addEventListener('click', function (ev) { var li = ev.target.closest('li'); if (li) { choose(+li.getAttribute('data-n')); } });
    statusFns.push(function () { if (DB.state === 'ready' && document.activeElement === input) { refresh(); } });
  }

  /* ---------- The directory: every place, with a live clock ---------- */
  var dirs = {};
  function buildDirectory(pk) {
    var P = PLANETS[pk], other = pk === 'earth' ? 'gaia' : 'earth', host, before, name = pk === 'earth' ? 'Earth' : 'Gaia';
    if (pk === 'earth') { host = document.querySelector('main'); before = host && host.querySelector('footer'); }
    else { host = document.querySelector('#gaia .g-main'); before = host && host.querySelector('footer'); }
    if (!host) { return; }
    var sec = el('section', 'px-world'); sec.setAttribute('data-px', pk);
    sec.innerHTML =
      '<h2>Every place on ' + name + '</h2>' +
      '<p class="sub" data-role="intro">' + (pk === 'earth' ?
        'Towns and cities from every country, each on its real time zone. Search one, browse a country, then look at its time or put it on your board.' :
        'The same places, the same names. Each one keeps its Earth zone and takes the Gaian twin of it: add 9 hours, multiply by 1.5. Search one, browse a country, or put it on Gaia’s board.') + '</p>' +
      '<div class="controls">' +
        '<input type="search" data-role="q" placeholder="Find any town, city or country" aria-label="Find any place on ' + name + '" autocomplete="off" autocapitalize="off" spellcheck="false">' +
        '<div class="px-filters"><select data-role="country" aria-label="Country"></select><select data-role="zone" aria-label="Time zone"></select></div>' +
        '<div class="px-bar"><div class="seg" role="group" aria-label="Sort places" data-role="sort">' +
          '<button type="button" data-sort="pop" aria-pressed="true">Biggest</button><button type="button" data-sort="name" aria-pressed="false">A to Z</button><button type="button" data-sort="time" aria-pressed="false">By time</button></div>' +
        '<label class="px-both"><input type="checkbox" data-role="both" checked> Add to Earth and Gaia</label></div>' +
      '</div>' +
      '<p class="px-count" data-role="count" role="status"></p>' +
      '<ul class="px-list" data-role="list"></ul>' +
      '<div class="px-more"><button type="button" class="btn plain" data-role="more" hidden>Show more</button></div>' +
      '<p class="px-note" data-role="note" role="status"></p>' +
      '<div class="px-bulk"><h3>Fill your board fast</h3><p data-role="bulkp"></p>' +
        '<div class="acts"><select data-role="topn" aria-label="How many"><option>10</option><option selected>25</option><option>50</option><option>100</option><option>250</option></select>' +
        '<button type="button" class="btn grad" data-role="addtop">Add the top places in this list</button>' +
        '<button type="button" class="btn gold" data-role="addzones">One clock for every time zone in this list</button></div></div>' +
      '<p class="fine">Place names, populations and zones come from GeoNames (geonames.org), under CC BY 4.0. Gaian times use the same zones, converted to ZTC.</p>';
    if (before) { host.insertBefore(sec, before); } else { host.appendChild(sec); }
    var $ = function (r) { return sec.querySelector('[data-role="' + r + '"]'); };
    var D = dirs[pk] = { sec: sec, $: $, hits: [], shown: 0, sort: 'pop', pk: pk };

    function fillSelects() {
      var cs = $('country'), zs = $('zone'), cur = cs.value, zcur = zs.value, html = '<option value="">All countries</option>', order = DB.cidx.slice().sort(function (a, b) { return a.name < b.name ? -1 : 1; });
      order.forEach(function (c) { if (c.count) { html += '<option value="' + c.i + '">' + esc(c.name) + '</option>'; } });
      cs.innerHTML = html; cs.value = cur;
      fillZones(zcur);
    }
    function fillZones(keep) {
      var zs = $('zone'), cc = $('country').value, info = zoneInfo(), html = '<option value="">All time zones</option>', list = [];
      DB.Z.forEach(function (z, ix) { if (cc === '' || DB.cidx[+cc].zones[ix]) { list.push(ix); } });
      list.sort(function (a, b) { return DB.Z[a] < DB.Z[b] ? -1 : 1; });
      list.forEach(function (ix) { html += '<option value="' + ix + '">' + esc(DB.Z[ix].replace(/_/g, ' ')) + '</option>'; });
      zs.innerHTML = html; zs.value = keep && list.indexOf(+keep) !== -1 ? keep : '';
    }
    function rowHTML(i) {
      var z = DB.zi[i], ref = zoneRef(pk, z);
      var on = ref && P.hasClock(placeLabel(i), ref), n = DB.nm[i];
      return '<li class="px-row" data-i="' + i + '"><div class="px-t"><b>--:--</b><i></i><small></small></div>' +
        '<div class="px-n"><strong>' + esc(n) + (DB.fl[i] === 2 ? ' ★' : '') + '</strong><span>' + esc(placeSub(i)) + (DB.pop[i] ? ' · ' + num(DB.pop[i]) : '') + '</span><small data-role="zid">' + esc(DB.Z[z]) + '</small></div>' +
        '<div class="px-a"><button type="button" class="btn plain" data-act="look"' + (ref ? '' : ' disabled') + '>Look</button>' +
        '<button type="button" class="btn gold" data-act="add"' + (ref && !on ? '' : ' disabled') + '>' + (on ? 'On board' : 'Add') + '</button></div></li>';
    }
    function renderMore(reset) {
      var list = $('list');
      if (reset) { list.innerHTML = ''; D.shown = 0; }
      var end = Math.min(D.hits.length, D.shown + PAGE), html = '', i;
      for (i = D.shown; i < end; i++) { html += rowHTML(D.hits[i]); }
      list.insertAdjacentHTML('beforeend', html);
      D.shown = end;
      var more = $('more'); more.hidden = D.shown >= D.hits.length;
      if (!more.hidden) { more.textContent = 'Show ' + Math.min(PAGE, D.hits.length - D.shown) + ' more (' + num(D.hits.length - D.shown) + ' left)'; }
      tickRows(pk, true);
    }
    function run() {
      if (DB.state !== 'ready') { paintCount(); return; }
      var cc = $('country').value, zone = $('zone').value, q = $('q').value;
      D.hits = searchPlaces(q, { cc: cc, zone: zone, sort: D.sort, planet: pk });
      if (!q.trim() && cc === '' && zone === '' && D.sort !== 'pop') { D.hits = searchPlaces('', { sort: D.sort, planet: pk }); }
      renderMore(true); paintCount();
    }
    function paintCount() {
      var c = $('count');
      if (DB.state === 'idle') { c.textContent = 'Tap the search box to load the world’s places.'; return; }
      if (DB.state === 'loading') { c.textContent = 'Loading the world’s places…'; return; }
      if (DB.state === 'failed') { c.textContent = 'The place list did not load. Check your connection and reload the page.'; return; }
      var total = DB.nm.length, filt = $('q').value.trim() || $('country').value || $('zone').value;
      c.textContent = (filt ? plural(D.hits.length, 'place matches', 'places match') : (D.sort === 'pop' ? 'The 3,000 biggest of ' + num(total) + ' places' : num(total) + ' places')) +
        ' in ' + plural(DB.cidx.filter(function (x) { return x.count; }).length, 'country', 'countries') + ' on ' + plural(DB.Z.length, 'real zone', 'real zones') + '.' +
        (DB.small === 'loading' ? ' Adding the smaller towns…' : '');
      $('bulkp').textContent = 'Put places on ' + name + '’s board in bulk. Clocks are saved with the rest of your clocks (up to ' + num(P.limits.places) + ').';
    }
    function note(t) { $('note').textContent = t; }

    $('q').addEventListener('focus', function () { ensureLoaded(function () { }); });
    var typing = 0;
    $('q').addEventListener('input', function () { window.clearTimeout(typing); typing = window.setTimeout(function () { ensureLoaded(run); }, 180); });
    $('country').addEventListener('change', function () { fillZones(''); run(); });
    $('zone').addEventListener('change', run);
    $('sort').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) { return; }
      D.sort = b.getAttribute('data-sort');
      Array.prototype.forEach.call($('sort').children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      ensureLoaded(run);
    });
    $('more').addEventListener('click', function () { renderMore(false); });
    $('list').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b || b.disabled) { return; }
      var li = b.closest('.px-row'), i = +li.getAttribute('data-i'), ref = zoneRef(pk, DB.zi[i]);
      if (b.getAttribute('data-act') === 'look') {
        P.setSel(ref, placeLabel(i));
        var target = document.getElementById(P.sandboxId); if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      } else {
        var r = addPlaces([i], $('both').checked);
        note(r.text); refreshButtons(pk);
      }
    });
    $('addtop').addEventListener('click', function () {
      if (DB.state !== 'ready') { note('Loading the places first. Try again in a second.'); return; }
      var n = +$('topn').value, r = addPlaces(D.hits.slice(0, n), $('both').checked);
      note(r.text); refreshButtons(pk);
    });
    $('addzones').addEventListener('click', function () {
      if (DB.state !== 'ready') { note('Loading the places first. Try again in a second.'); return; }
      var seen = {}, pick = [], all = searchPlaces($('q').value, { cc: $('country').value, zone: $('zone').value, sort: 'pop', planet: pk, full: true });
      all.forEach(function (i) { var z = DB.zi[i]; if (!seen[z]) { seen[z] = 1; pick.push(i); } });
      pick.sort(function (a, b) { return DB.pop[b] - DB.pop[a]; });
      var r = addPlaces(pick, $('both').checked);
      note(r.text); refreshButtons(pk);
    });
    D.run = run; D.fill = fillSelects; D.paintCount = paintCount;
    statusFns.push(function () {
      if (DB.state === 'ready' && !D.filled) { D.filled = true; fillSelects(); run(); }
      else if (DB.state === 'ready') { paintCount(); }
      else { paintCount(); }
    });
    paintCount();
  }

  // Puts places on the board of this planet, and on the other planet when asked. One save for the whole batch.
  function addPlaces(list, both) {
    var added = { earth: 0, gaia: 0 }, dup = 0, full = 0, skipped = 0, targets = both ? KEYS : null;
    if (!targets) { targets = [currentPlanet()]; }
    targets.forEach(function (pk) {
      var P = PLANETS[pk];
      list.forEach(function (i) {
        var ref = zoneRef(pk, DB.zi[i]);
        if (!ref) { skipped++; return; }
        var res = P.addClock(placeLabel(i), whereText(i), ref);
        if (res === 'added') { added[pk]++; } else if (res === 'dup') { dup++; } else { full++; }
      });
      if (added[pk]) { P.commit(); }
    });
    var parts = [];
    if (added.earth) { parts.push(plural(added.earth, 'clock', 'clocks') + ' on Earth'); }
    if (added.gaia) { parts.push(plural(added.gaia, 'clock', 'clocks') + ' on Gaia'); }
    var text = parts.length ? 'Added ' + parts.join(' and ') + '.' : 'Nothing new to add.';
    if (dup) { text += ' ' + plural(dup, 'was', 'were') + ' already on a board.'; }
    if (full) { text += ' A board is full (' + num(E.limits.places) + ' clocks). Remove some to add more.'; }
    if (skipped) { text += ' ' + plural(skipped, 'place has', 'places have') + ' a zone this browser does not know.'; }
    return { text: text, added: added };
  }
  function currentPlanet() { var g = document.getElementById('gaia'); return g && !g.hidden ? 'gaia' : 'earth'; }
  function refreshButtons(pk) {
    var D = dirs[pk]; if (!D) { return; }
    Array.prototype.forEach.call(D.$('list').querySelectorAll('.px-row'), function (li) {
      var i = +li.getAttribute('data-i'), ref = zoneRef(pk, DB.zi[i]), b = li.querySelector('[data-act="add"]');
      var on = ref && PLANETS[pk].hasClock(placeLabel(i), ref);
      b.disabled = !ref || !!on; b.textContent = on ? 'On board' : 'Add';
    });
  }

  function relSpan(min) {
    var a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
    return (h ? h + ' hr' : '') + (h && m ? ' ' : '') + (m ? m + ' min' : '');
  }
  // Keeps the visible clocks moving.
  function tickRows(pk, force) {
    var D = dirs[pk]; if (!D || DB.state !== 'ready') { return; }
    if (!force && D.sec.offsetParent === null) { return; }
    var P = PLANETS[pk], now = Date.now(), cache = {}, rows = D.$('list').children, k, li, i, z, d, ref, t;
    for (k = 0; k < rows.length; k++) {
      li = rows[k]; i = +li.getAttribute('data-i'); z = DB.zi[i];
      if (!cache[z]) { ref = zoneRef(pk, z); cache[z] = ref ? P.describe(ref, now) : { time: '--:--', ap: '', day: '', rel: 0, dayRel: 0, offLabel: '' }; }
      d = cache[z]; t = li.firstChild;
      if (t.firstChild.textContent !== d.time) { t.firstChild.textContent = d.time; }
      t.children[1].textContent = d.ap || '';
      t.lastChild.textContent = d.day + (d.dayRel === 0 ? '' : (d.dayRel > 0 ? ', tomorrow' : ', yesterday'));
      li.className = 'px-row ' + (d.rel > 0 ? 'above' : (d.rel === 0 ? 'on' : 'below'));
      var zid = li.querySelector('[data-role="zid"]'), zt = DB.Z[z] + ' · ' + d.offLabel + (d.rel === 0 ? ' · same as you' : '');
      if (zid.textContent !== zt) { zid.textContent = zt; }
    }
  }
  window.setInterval(function () { KEYS.forEach(function (pk) { tickRows(pk, false); }); }, 1000);

  /* ---------- Zone workshop: any offset, any rule, zones that follow a real place ---------- */
  var ORD = ['', '1st', '2nd', '3rd', '4th'];
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function clockText(min) { return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60); }
  // "2:00", "02:00", "2pm", "14:30" -> minutes after midnight, or null.
  function parseClock(text, pk) {
    var m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\s*$/i.exec(String(text)), h, mi, ap;
    if (!m) { return null; }
    h = parseInt(m[1], 10); mi = m[2] ? parseInt(m[2], 10) : 0; ap = m[3] ? m[3].toLowerCase().charAt(0) : '';
    if (mi > 59) { return null; }
    if (ap) {
      if (pk === 'gaia') { if (h < 1 || h > 18) { return null; } h = (h % 18) + (ap === 'p' ? 18 : 0); }
      else { if (h < 1 || h > 12) { return null; } h = (h % 12) + (ap === 'p' ? 12 : 0); }
    }
    var t = h * 60 + mi;
    return t < PLANETS[pk].dayMin ? t : null;
  }
  function whenText(pk, w) {
    var P = PLANETS[pk], mon = P.months[w.m], wd = P.weekdays[w.d];
    if (w.k === 'n') { return 'the ' + ORD[w.n] + ' ' + wd + ' of ' + mon; }
    if (w.k === 'l') { return 'the last ' + wd + ' of ' + mon; }
    if (w.k === 'a') { return 'the first ' + wd + ' on or after ' + mon + ' ' + w.n; }
    return mon + ' ' + w.n;
  }
  function jumpText(save) { return save % 60 === 0 ? (save / 60) + (save === 60 ? ' hr' : ' hrs') : (save >= 60 ? Math.floor(save / 60) + ' hr ' : '') + (save % 60) + ' min'; }
  var PRESETS = {
    earth: [['United States', 120, 120, { k: 'n', n: 2, d: 0, m: 2 }, { k: 'n', n: 1, d: 0, m: 10 }],
      ['Europe (as in Paris)', 120, 180, { k: 'l', n: 1, d: 0, m: 2 }, { k: 'l', n: 1, d: 0, m: 9 }],
      ['Australia (as in Sydney)', 120, 180, { k: 'n', n: 1, d: 0, m: 9 }, { k: 'n', n: 1, d: 0, m: 3 }],
      ['New Zealand', 120, 180, { k: 'l', n: 1, d: 0, m: 8 }, { k: 'n', n: 1, d: 0, m: 3 }],
      ['Chile', 0, 0, { k: 'n', n: 1, d: 0, m: 8 }, { k: 'n', n: 1, d: 0, m: 3 }]],
    gaia: [['United States', 180, 180, { k: 'n', n: 2, d: 0, m: 2 }, { k: 'n', n: 1, d: 0, m: 10 }],
      ['Europe', 180, 180, { k: 'l', n: 1, d: 0, m: 2 }, { k: 'l', n: 1, d: 0, m: 9 }],
      ['Australia', 180, 180, { k: 'n', n: 1, d: 0, m: 9 }, { k: 'n', n: 1, d: 0, m: 3 }],
      ['New Zealand', 180, 180, { k: 'l', n: 1, d: 0, m: 8 }, { k: 'n', n: 1, d: 0, m: 3 }],
      ['Chile', 180, 180, { k: 'n', n: 1, d: 0, m: 8 }, { k: 'n', n: 1, d: 0, m: 3 }]]
  };
  var BUILTIN_RULES = { none: 'No clock changes', us: 'US daylight saving dates', eu: 'European summer time dates', au: 'Australian daylight saving dates', nz: 'New Zealand daylight saving dates', cl: 'Chilean summer time dates' };

  function buildWorkshop(pk) {
    var P = PLANETS[pk], anchor = document.getElementById(pk === 'earth' ? 'h-zones' : 'g-h-zones');
    anchor = anchor && anchor.closest('.zonelist');
    if (!anchor) { return; }
    var gaia = pk === 'gaia', ofs = gaia ? 'ZTC' : 'UTC', clockNote = gaia ? '36-hour clock, 00:00 to 35:59' : '24-hour clock, like 02:00';
    var sec = el('section', 'zonelist px-work'); sec.setAttribute('data-px', pk);
    var monthOpts = P.months.map(function (m, i) { return '<option value="' + i + '">' + esc(m) + '</option>'; }).join('');
    var wdOpts = P.weekdays.map(function (w, i) { return '<option value="' + i + '">' + esc(w) + '</option>'; }).join('');
    function when(k, title, label) {
      return '<div class="px-when" data-k="' + k + '"><h5>' + title + '</h5>' +
        '<label>Which day<select data-f="k"><option value="n">1st to 4th weekday</option><option value="l">Last weekday</option><option value="a">Weekday on or after a date</option><option value="d">A fixed date</option></select></label>' +
        '<label data-w="n">Which one<select data-f="n"><option value="1">1st</option><option value="2">2nd</option><option value="3">3rd</option><option value="4">4th</option></select></label>' +
        '<label data-w="d">Weekday<select data-f="d">' + wdOpts + '</select></label>' +
        '<label data-w="day" hidden>Date<input data-f="day" inputmode="numeric" maxlength="2" value="1"></label>' +
        '<label>Month<select data-f="m">' + monthOpts + '</select></label>' +
        '<label>' + label + '<input data-f="t" value="02:00" maxlength="8" autocomplete="off" spellcheck="false"></label></div>';
    }
    sec.innerHTML =
      '<h3>Zone workshop</h3>' +
      '<p>Build your own time. Make a zone at any offset to the minute, one that follows a real place with a shift, or write your own clock-change rule and use it on any zone. ' + (gaia ? 'Rules count in Gaia’s calendar, with its 5-day week and 36-hour day.' : '') + '</p>' +
      '<div class="make"><button type="button" class="btn grad" data-role="openZ" aria-expanded="false">Build a zone</button><button type="button" class="btn gold" data-role="openR" aria-expanded="false">Build a clock-change rule</button>' +
      '<div class="sheet" data-role="zsheet" hidden><h3>Build a zone</h3>' +
        '<label>Zone name<input data-role="zname" maxlength="60" autocomplete="off" enterkeyhint="done"></label>' +
        '<div class="seg" role="group" aria-label="How the zone keeps time" data-role="zmode"><button type="button" data-m="fixed" aria-pressed="true">Set an offset</button><button type="button" data-m="follow" aria-pressed="false">' + (gaia ? 'Copy a real place' : 'Follow a real place') + '</button></div>' +
        '<div class="px-grid2" data-role="zfixed"><label>Standard offset, any minute<input data-role="zstd" maxlength="12" placeholder="' + ofs + '+05:07" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
          '<label>Clock changes<select data-role="zrule"></select></label></div>' +
        '<div class="px-grid2" data-role="zfollow" hidden><label>Real place or zone<input data-role="zbase" placeholder="Tokyo, Lyon, Asia/Kolkata" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
          '<label>Shift in minutes, + or −<input data-role="zdelta" value="0" inputmode="numeric" maxlength="6"></label></div>' +
        '<p data-role="zhint"></p><p class="msg" data-role="zmsg" role="status"></p>' +
        '<div class="acts"><button type="button" class="btn grad" data-role="zmake">Make zone</button><button type="button" class="btn plain" data-role="zcancel">Cancel</button></div></div>' +
      '<div class="sheet" data-role="rsheet" hidden><h3>Build a clock-change rule</h3>' +
        '<label>Rule name<input data-role="rname" maxlength="40" autocomplete="off" enterkeyhint="done"></label>' +
        '<label>Start from a real rule<select data-role="rpre"><option value="">Blank</option>' + PRESETS[pk].map(function (p, i) { return '<option value="' + i + '">' + esc(p[0]) + '</option>'; }).join('') + '</select></label>' +
        when('s', 'Clocks go forward', 'At (standard time)') + when('e', 'Clocks go back', 'At (summer clock)') +
        '<p>Times use the ' + clockNote + '.</p><label>Jump size<select data-role="rsave"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60" selected>1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option></select></label>' +
        '<p class="px-preview" data-role="rprev"></p><p class="msg" data-role="rmsg" role="status"></p>' +
        '<div class="acts"><button type="button" class="btn gold" data-role="rmake">Save rule</button><button type="button" class="btn plain" data-role="rcancel">Cancel</button></div>' +
        '<h4>Your rules</h4><ul class="px-rules" data-role="rlist"></ul></div></div>';
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
    var $ = function (r) { return sec.querySelector('[data-role="' + r + '"]'); };
    var W = { s: sec.querySelector('[data-k="s"]'), e: sec.querySelector('[data-k="e"]') };
    function f(k, name) { return W[k].querySelector('[data-f="' + name + '"]'); }

    // Sheets open and close like the page's own.
    function openSheet(which) {
      $('zsheet').hidden = which !== 'z'; $('rsheet').hidden = which !== 'r';
      $('openZ').setAttribute('aria-expanded', String(which === 'z')); $('openR').setAttribute('aria-expanded', String(which === 'r'));
      $('zmsg').textContent = ''; $('rmsg').textContent = '';
      if (which === 'z') { fillRuleSelect(); $('zname').focus(); }
      if (which === 'r') { $('rname').focus(); readRule(true); }
    }
    $('openZ').addEventListener('click', function () { openSheet($('zsheet').hidden ? 'z' : ''); });
    $('openR').addEventListener('click', function () { openSheet($('rsheet').hidden ? 'r' : ''); });
    $('zcancel').addEventListener('click', function () { openSheet(''); });
    $('rcancel').addEventListener('click', function () { openSheet(''); });

    // ----- zones -----
    var mode = 'fixed';
    function fillRuleSelect() {
      var rt = P.ruleText, keep = $('zrule').value, html = '', code;
      Object.keys(BUILTIN_RULES).forEach(function (c) { if (rt[c] !== undefined && (c !== 'au' && c !== 'nz' && c !== 'cl' || gaia)) { html += '<option value="' + c + '">' + esc(BUILTIN_RULES[c]) + '</option>'; } });
      for (code in rt) { if (code.charAt(0) === 'x') { html += '<option value="' + code + '">' + esc(rt[code]) + ' (yours)</option>'; } }
      $('zrule').innerHTML = html; $('zrule').value = keep && rt[keep] !== undefined ? keep : 'none';
      // The page's own quick sheet gets the same rules.
      var quick = document.getElementById(gaia ? 'gZoneRule' : 'zoneRule');
      if (quick) {
        Array.prototype.slice.call(quick.querySelectorAll('option[data-px]')).forEach(function (o) { o.remove(); });
        for (code in rt) { if (code.charAt(0) === 'x') { var o = el('option'); o.value = code; o.textContent = rt[code] + ' (yours)'; o.setAttribute('data-px', '1'); quick.appendChild(o); } }
      }
    }
    $('zmode').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) { return; }
      mode = b.getAttribute('data-m');
      Array.prototype.forEach.call($('zmode').children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      $('zfixed').hidden = mode !== 'fixed'; $('zfollow').hidden = mode !== 'follow'; $('zmsg').textContent = '';
    });
    // Works out which real zone the typed place means.
    function zoneFromText(text, cb) {
      var t = String(text).trim();
      if (/^[A-Za-z0-9_+\-]+(\/[A-Za-z0-9_+\-]+)+$/.test(t) || t === 'UTC') { cb({ zone: t, label: t }); return; }
      ensureLoaded(function () {
        if (DB.state !== 'ready') { cb(null); return; }
        var hit = searchPlaces(t, { planet: pk });
        if (hit.length) { cb({ zone: DB.Z[DB.zi[hit[0]]], label: placeLabel(hit[0]) }); return; }
        var cs = matchCountries(t, 1);
        cb(cs.length ? { zone: DB.Z[DB.zi[cs[0].top]], label: cs[0].name + ' (' + DB.nm[cs[0].top] + ')' } : null);
      });
    }
    $('zbase').addEventListener('change', function () {
      var t = $('zbase').value.trim(); if (!t) { $('zhint').textContent = ''; return; }
      zoneFromText(t, function (z) { $('zhint').textContent = z ? 'Follows ' + z.label + ' (' + z.zone + ').' : 'No place called that. Try a city or a zone like Asia/Tokyo.'; });
    });
    $('zbase').addEventListener('focus', function () { ensureLoaded(); });
    function makeZone() {
      var name = $('zname').value.trim(), msg = $('zmsg');
      if (!name) { msg.textContent = 'Give the zone a name first.'; return; }
      var res;
      if (mode === 'fixed') {
        var std = P.parseOffset($('zstd').value);
        if (std === null) { msg.textContent = 'Write the offset like ' + ofs + '+05:07 or -9.'; return; }
        res = P.addZone({ name: name, std: std, rule: $('zrule').value });
        done(res);
      } else {
        var delta = parseInt(String($('zdelta').value).replace('−', '-'), 10);
        if (isNaN(delta)) { msg.textContent = 'Write the shift in minutes, like 7 or -30.'; return; }
        zoneFromText($('zbase').value, function (z) {
          if (!z) { msg.textContent = 'No place called that. Try a city or a zone like Asia/Tokyo.'; return; }
          if (!gaia) { done(P.addZone({ name: name, base: z.zone, delta: delta })); return; }
          var ref = P.refFor(z.zone), parts = ref && P.refParts(ref);
          if (!parts) { msg.textContent = 'This browser has no clock data for ' + z.zone + '.'; return; }
          done(P.addZone({ name: name, std: parts.std + delta, rule: parts.rule }));
        });
      }
      function done(r) {
        if (!r || r.error) { msg.textContent = r ? r.error : 'Something went wrong.'; return; }
        $('zname').value = ''; $('zstd').value = ''; openSheet('');
        var tgt = document.getElementById(P.sandboxId); if (tgt) { tgt.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      }
    }
    $('zmake').addEventListener('click', makeZone);
    ['zname', 'zstd', 'zdelta'].forEach(function (r) { $(r).addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { makeZone(); } }); });

    // ----- rules -----
    function syncWhen(k) {
      var kind = f(k, 'k').value;
      W[k].querySelector('[data-w="n"]').hidden = kind !== 'n';
      W[k].querySelector('[data-w="d"]').hidden = kind === 'd';
      W[k].querySelector('[data-w="day"]').hidden = kind !== 'a' && kind !== 'd';
    }
    function readWhen(k) {
      var kind = f(k, 'k').value, t = parseClock(f(k, 't').value, pk), day = parseInt(f(k, 'day').value, 10);
      if (t === null) { return { error: 'Write the time like ' + (gaia ? '03:00 (0:00 to 35:59)' : '02:00') + '.' }; }
      if ((kind === 'a' || kind === 'd') && (isNaN(day) || day < 1 || day > P.maxDay)) { return { error: 'The date can run from 1 to ' + P.maxDay + '.' }; }
      return { k: kind, n: kind === 'n' ? +f(k, 'n').value : (kind === 'l' ? 1 : day), d: kind === 'd' ? 0 : +f(k, 'd').value, m: +f(k, 'm').value, t: t };
    }
    function readRule(quiet) {
      var s = readWhen('s'), e = readWhen('e'), prev = $('rprev'), save = +$('rsave').value;
      if (s.error || e.error) { prev.textContent = s.error || e.error; return null; }
      var spec = { name: $('rname').value.trim(), save: save, sk: s.k, sn: s.n, sd: s.d, sm: s.m, st: s.t, ek: e.k, en: e.n, ed: e.d, em: e.m, et: e.t };
      if (s.k === e.k && s.n === e.n && s.d === e.d && s.m === e.m) { prev.textContent = 'The clocks cannot go forward and back on the same day.'; return null; }
      var dates = P.ruleDates(spec);
      prev.textContent = 'Clocks go forward ' + jumpText(save) + ' at ' + clockText(s.t) + ' on ' + whenText(pk, s) + ', and back at ' + clockText(e.t) + ' on ' + whenText(pk, e) + '. This year: ' + dates.start + ' and ' + dates.end + '.';
      return spec;
    }
    function applyPreset(i) {
      var p = PRESETS[pk][i]; if (!p) { return; }
      [['s', p[1], p[3]], ['e', p[2], p[4]]].forEach(function (x) {
        var k = x[0], w = x[2];
        f(k, 'k').value = w.k; f(k, 'n').value = w.n; f(k, 'd').value = w.d; f(k, 'm').value = w.m; f(k, 't').value = clockText(x[1]); f(k, 'day').value = 1; syncWhen(k);
      });
      $('rsave').value = '60';
      if (!$('rname').value.trim()) { $('rname').placeholder = 'My ' + p[0] + ' rule'; }
      readRule();
    }
    ['s', 'e'].forEach(function (k) {
      var upd = function (ev) { if (ev.target.getAttribute('data-f') === 'k') { syncWhen(k); } readRule(); };
      W[k].addEventListener('input', upd); W[k].addEventListener('change', upd);
      syncWhen(k);
    });
    $('rsave').addEventListener('change', function () { readRule(); });
    $('rpre').addEventListener('change', function () { if ($('rpre').value !== '') { applyPreset(+$('rpre').value); } });
    $('rmake').addEventListener('click', function () {
      var spec = readRule(); if (!spec) { $('rmsg').textContent = $('rprev').textContent; return; }
      if (!spec.name) { spec.name = $('rname').placeholder && $('rname').placeholder.indexOf('My ') === 0 ? $('rname').placeholder : ''; }
      if (!spec.name) { $('rmsg').textContent = 'Give the rule a name first.'; return; }
      var r = P.addRule(spec);
      if (r.error) { $('rmsg').textContent = r.error; return; }
      $('rname').value = ''; $('rmsg').textContent = ''; paintRules(); fillRuleSelect();
      P.say('Saved the rule ' + spec.name + '. Pick it when you build a zone.');
    });
    var armed = '', armTimer = 0;
    $('rlist').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) { return; }
      var id = b.getAttribute('data-rm');
      if (armed !== id) { armed = id; b.textContent = 'Tap again'; window.clearTimeout(armTimer); armTimer = window.setTimeout(function () { armed = ''; if (b.isConnected) { b.textContent = 'Remove'; } }, 4000); return; }
      armed = ''; P.removeRule(id); paintRules(); fillRuleSelect();
    });
    function paintRules() {
      var rules = P.getStore().rules;
      $('rlist').innerHTML = rules.length ? rules.map(function (r) {
        var s = { k: r.sk, n: r.sn, d: r.sd, m: r.sm }, e = { k: r.ek, n: r.en, d: r.ed, m: r.em };
        return '<li><span><b>' + esc(r.name) + '</b>Forward ' + jumpText(r.save) + ' at ' + clockText(r.st) + ' on ' + esc(whenText(pk, s)) + '; back at ' + clockText(r.et) + ' on ' + esc(whenText(pk, e)) + '.</span><button type="button" class="btn plain" data-rm="' + esc(r.id) + '">Remove</button></li>';
      }).join('') : '<li><span>No rules yet. Build one above, or start from a real one.</span></li>';
    }
    sec._paint = function () { paintRules(); fillRuleSelect(); };
    f('s', 't').value = clockText(PRESETS[pk][0][1]); f('e', 't').value = clockText(PRESETS[pk][0][2]);
    f('s', 'm').value = '2'; f('e', 'm').value = '10'; f('s', 'd').value = '0'; f('e', 'd').value = '0'; f('s', 'n').value = '2'; f('e', 'n').value = '1';
    paintRules();
  }

  /* ---------- Go ---------- */
  function onStore() {
    Array.prototype.forEach.call(document.querySelectorAll('.px-work'), function (s) { if (s._paint) { s._paint(); } });
    KEYS.forEach(function (pk) { refreshButtons(pk); });
  }
  function init() {
    KEYS.forEach(function (pk) { attachSuggest(pk); buildDirectory(pk); buildWorkshop(pk); });
    window.addEventListener('px:store', onStore);
    onStore();
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) { entries.forEach(function (en) { if (en.isIntersecting) { ensureLoaded(); io.disconnect(); } }); }, { rootMargin: '1200px 0px' });
      Object.keys(dirs).forEach(function (pk) { io.observe(dirs[pk].sec); });
    } else { window.setTimeout(function () { ensureLoaded(); }, 3000); }
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
