// Token Radar dashboard: renders the board main.ts wrote into ../data.js — the same figures, the
// same farm plans, so the page and board.json can never disagree. Static, no framework, no network.
// Three views: the ranked board (sortable, filterable, one detail view per protocol), the live set
// (protocols whose token already trades — the measuring stick, never ranked here), and the method
// view (the calibration table a reader can audit). A model sandbox re-ranks the board live under
// constants the reader changes; the entered board itself never changes.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var main = document.getElementById('board');
  if (!DATA || !main) return;

  var state = { tab: 'board', q: '', cat: 'all', chain: 'all', set: 'all', sort: 'implied', selected: null, sb: null };

  /* ---------- formatting ---------- */
  function fmtUsd(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) { return n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 730) return (days / 365.25).toFixed(1) + ' yrs';
    if (days >= 60) return Math.round(days / 30.44) + ' mo';
    return days + ' d';
  }
  function fmtMult(n) { return '×' + n.toFixed(3); }
  function fmtFactor(n) { return '×' + n.toFixed(2); }
  function fmtErr(e) { return e === null || e === undefined ? '—' : '×' + Math.exp(e).toFixed(2); }

  /* ---------- tiny DOM helper: every data string goes in as text, never as markup ---------- */
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined) return;
      if (k === 'text') node.textContent = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (child) node.appendChild(child);
    }
    return node;
  }

  /* ---------- the model, mirrored from lib/model.ts so the sandbox re-ranks honestly ---------- */
  function multiplesWith(shrinkK) {
    var map = {};
    DATA.categories.forEach(function (c) {
      var shrunk = (c.peers * c.raw_median + shrinkK * DATA.global_multiple) / (c.peers + shrinkK);
      map[c.category] = Math.min(DATA.model.multiple_cap, Math.max(DATA.model.multiple_floor, shrunk));
    });
    return map;
  }
  function impliedWith(row, consts, mults) {
    var m = DATA.model;
    var mult = mults[row.category || 'Uncategorised'];
    if (mult === undefined) mult = DATA.global_multiple;
    var g = row.change_7d === null ? 0 : Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d));
    var sat = g / (1 + Math.abs(g) / m.growth_soft);
    var growth = 1 + (sat / 100) * consts.growth_weight;
    var age = row.age_days === null ? DATA.median_age_days : row.age_days;
    var maturity = m.maturity_base + (m.maturity_span * age) / (age + consts.maturity_mid_days);
    var breadth = 1 + consts.breadth_per_chain * Math.min(Math.max(row.chains.length - 1, 0), m.breadth_max_extra);
    return { implied: Math.max(1, Math.round(row.tvl_usd * mult * growth * maturity * breadth)), mult: mult, growth: growth, maturity: maturity, breadth: breadth };
  }
  function displayRows() {
    if (!state.sb) return DATA.rows.map(function (r) { return { row: r, implied: r.implied_value_usd, rank: r.rank }; });
    var mults = multiplesWith(state.sb.shrink_k);
    var scored = DATA.rows.map(function (r) {
      var v = impliedWith(r, state.sb, mults);
      return { row: r, implied: v.implied, rank: 0 };
    });
    scored.sort(function (a, b) { return b.implied - a.implied || (a.row.slug < b.row.slug ? -1 : 1); });
    scored.forEach(function (s, i) { s.rank = i + 1; });
    return scored;
  }

  /* ---------- hash state, so a view can be linked and screenshotted exactly ---------- */
  function readHash() {
    var h = window.location.hash.replace(/^#\/?/, '');
    h.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv.length !== 2) return;
      var k = kv[0], v = decodeURIComponent(kv[1]);
      if (k === 'tab' && (v === 'board' || v === 'live' || v === 'method')) state.tab = v;
      if (k === 'q') state.q = v;
      if (k === 'cat') state.cat = v;
      if (k === 'chain') state.chain = v;
      if (k === 'set') state.set = v;
      if (k === 'sort') state.sort = v;
      if (k === 'p') state.selected = v;
    });
  }
  function writeHash() {
    var parts = [];
    if (state.tab !== 'board') parts.push('tab=' + state.tab);
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.cat !== 'all') parts.push('cat=' + encodeURIComponent(state.cat));
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.set !== 'all') parts.push('set=' + state.set);
    if (state.sort !== 'implied') parts.push('sort=' + state.sort);
    if (state.selected) parts.push('p=' + encodeURIComponent(state.selected));
    history.replaceState(null, '', '#' + parts.join('&'));
  }

  /* ---------- header + model box ---------- */
  function header() {
    var stats = [
      [String(DATA.board_size), 'protocols ranked'],
      [String(DATA.watchlist_size), 'watchlist covered'],
      [String(DATA.early_size), 'early finds below the floor'],
      [String(DATA.live_peer_count), 'traded peers measured'],
      ['×' + DATA.global_multiple.toFixed(3), 'market median mcap / TVL'],
    ];
    return el('header', { 'class': 'top' },
      el('div', { 'class': 'brand' },
        el('h1', null, el('span', { text: 'TOKEN RADAR' }), el('span', { 'class': 'dot', text: ' ●' })),
        el('span', { 'class': 'model-tag', text: 'model ' + DATA.model_version })),
      el('p', { 'class': 'lede', text: 'Every protocol in one sealed snapshot whose token does not exist yet, ranked by what that token would be worth if the protocol’s record stayed as it is — with a concrete plan for farming each one before it launches. Values are this model’s claim from the snapshot’s own figures, not a prediction that a token will be issued.' }),
      el('div', { 'class': 'stats' }, stats.map(function (s) {
        return el('div', { 'class': 'stat' }, el('span', { 'class': 'stat-num', text: s[0] }), el('span', { 'class': 'stat-label', text: s[1] }));
      })));
  }
  function modelBox() {
    var sb = state.sb;
    function field(label, key, step) {
      var input = el('input', { type: 'number', step: step, value: String(sb ? sb[key] : DATA.model[key === 'shrink_k' ? 'shrink_k' : key]) });
      input.addEventListener('change', function () {
        var v = parseFloat(input.value);
        if (!Number.isFinite(v)) return;
        if (!state.sb) state.sb = { shrink_k: DATA.model.shrink_k, growth_weight: DATA.model.growth_weight, maturity_mid_days: DATA.model.maturity_mid_days, breadth_per_chain: DATA.model.breadth_per_chain };
        state.sb[key] = v;
        render();
      });
      return el('div', null, el('label', { text: label }), input);
    }
    return el('section', { 'class': 'model-box' },
      el('h2', { text: 'How a value is measured' }),
      el('p', { text: 'The multiple is measured, not picked: for each category, the protocols in this same snapshot whose token already trades give a market cap over TVL; the category’s multiple is that median, shrunk toward the market median by n/(n+6) traded peers and clamped to [×0.03, ×1.50], so one outlier cannot set a price. Growth saturates, so one hot week cannot double a value; maturity rewards a token-free track record and flattens after about three years; breadth credits each extra chain a token would launch into. No protocol’s name is ever an input. Radar-3 checks the multiple itself: every category’s multiple is also fitted on one half of its traded peers and tested on the other, and the held-out error is printed beside it in the table below. Each farm plan is priced in gas on the protocol’s cheapest listed chain, and each detail view shows the plan’s total.' }),
      el('div', { 'class': 'formula', text: 'implied value  =  TVL  ×  category multiple (measured, shrunk)  ×  growth factor  ×  maturity factor  ×  breadth factor' }),
      el('div', { 'class': 'sandbox' },
        field('Shrinkage k', 'shrink_k', '1'),
        field('Growth weight', 'growth_weight', '0.05'),
        field('Maturity mid-point, days', 'maturity_mid_days', '30'),
        field('Breadth per chain', 'breadth_per_chain', '0.005'),
        el('button', { text: 'Reset to model ' + DATA.model_version, onclick: function () { state.sb = null; render(); } }),
        sb ? el('span', { 'class': 'sb-note', text: 'Sandbox re-ranking — the entered board is unchanged.' }) : null));
  }

  /* ---------- board view ---------- */
  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains; }))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search name or slug…', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); renderTable(); });
    function select(value, options, onChange, label) {
      var s = el('select', { 'aria-label': label }, options.map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: o[0] === value ? 'selected' : null });
      }));
      s.addEventListener('change', function () { onChange(s.value); writeHash(); render(); });
      return s;
    }
    return el('div', { 'class': 'controls' },
      search,
      select(state.cat, [['all', 'All categories']].concat(cats.map(function (c) { return [c, c]; })), function (v) { state.cat = v; }, 'Filter by category'),
      select(state.chain, [['all', 'All chains']].concat(chains.map(function (c) { return [c, c]; })), function (v) { state.chain = v; }, 'Filter by chain'),
      select(state.set, [['all', 'Watchlist + early'], ['watch', 'Watchlist only'], ['early', 'Early finds only']], function (v) { state.set = v; }, 'Filter by set'),
      select(state.sort, [['implied', 'Sort: implied value'], ['tvl', 'Sort: TVL'], ['change', 'Sort: 7d change'], ['age', 'Sort: track record'], ['multiple', 'Sort: category multiple']], function (v) { state.sort = v; }, 'Sort the board'));
  }
  function filtered() {
    var list = displayRows();
    var q = state.q.trim().toLowerCase();
    list = list.filter(function (s) {
      var r = s.row;
      if (state.cat !== 'all' && (r.category || 'Uncategorised') !== state.cat) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.set === 'watch' && !r.on_watchlist) return false;
      if (state.set === 'early' && r.on_watchlist) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    list.sort(function (a, b) {
      var va, vb;
      if (key === 'tvl') { va = a.row.tvl_usd; vb = b.row.tvl_usd; }
      else if (key === 'change') { va = a.row.change_7d === null ? -1e9 : a.row.change_7d; vb = b.row.change_7d === null ? -1e9 : b.row.change_7d; }
      else if (key === 'age') { va = a.row.age_days === null ? -1 : a.row.age_days; vb = b.row.age_days === null ? -1 : b.row.age_days; }
      else if (key === 'multiple') { va = a.row.category_multiple; vb = b.row.category_multiple; }
      else { va = a.implied; vb = b.implied; }
      return vb - va || a.rank - b.rank;
    });
    return list;
  }
  var tableHost = null;
  function renderTable() {
    if (!tableHost) return;
    var list = filtered();
    var rows = list.map(function (s) {
      var r = s.row;
      var tr = el('tr', { 'class': state.selected === r.slug ? 'selected' : null, tabindex: '0' },
        el('td', { 'class': 'rank', text: String(s.rank) }),
        el('td', null,
          el('div', null,
            el('span', { 'class': 'pname', text: r.name }),
            el('span', { 'class': 'badge ' + (r.on_watchlist ? 'watch' : 'early'), text: r.on_watchlist ? 'watchlist' : 'early' })),
          el('div', { 'class': 'pslug', text: r.slug })),
        el('td', { text: r.category || 'Uncategorised' }),
        el('td', { 'class': 'num', text: String(r.chains.length) }),
        el('td', { 'class': 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { 'class': 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { 'class': 'num', text: fmtAge(r.age_days) }),
        el('td', { 'class': 'num', text: fmtMult(r.category_multiple) }),
        el('td', { 'class': 'num impl', text: fmtUsd(s.implied) }));
      function open() { state.selected = state.selected === r.slug ? null : r.slug; writeHash(); render(); }
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      return tr;
    });
    var table = el('table', { 'class': 'board' },
      el('thead', null, el('tr', null,
        ['Rank', 'Protocol', 'Category', 'Chains', 'TVL', '7d', 'Track record', 'Multiple', 'Implied value'].map(function (h, i) {
          return el('th', { 'class': i >= 3 ? 'num' : null, text: h });
        }))),
      el('tbody', null, rows));
    tableHost.replaceChildren(
      el('p', { 'class': 'count-line', text: 'Showing ' + list.length + ' of ' + DATA.board_size + ' ranked protocols · snapshot ' + DATA.as_of + ' · click a row for its detail and farm plan' }),
      state.selected ? detail(DATA.rows.find(function (r) { return r.slug === state.selected; })) : el('span', null),
      table);
  }
  function detail(r) {
    if (!r) return el('span', null);
    var v = state.sb ? impliedWith(r, state.sb, multiplesWith(state.sb.shrink_k)) : { implied: r.implied_value_usd, mult: r.category_multiple, growth: r.growth_factor, maturity: r.maturity_factor, breadth: r.breadth_factor };
    var peers = r.category_peers === 0 ? 'no traded peers — priced at the market median' : r.category_peers + ' traded peer' + (r.category_peers === 1 ? '' : 's') + ' in this snapshot';
    var oddsText = r.token_odds === null || r.token_odds === undefined
      ? 'too few comparable protocols to read'
      : r.odds_traded + ' of ' + r.odds_total + ' comparable protocols in ' + (r.category || 'Uncategorised') + ' already record a token (' + Math.round(r.token_odds * 100) + '%)';
    var oddsBar = (r.token_odds === null || r.token_odds === undefined) ? null :
      el('div', { 'class': 'oddsbar' }, el('div', { 'class': 'oddsfill', style: 'width:' + Math.round(r.token_odds * 100) + '%' }));
    var plan = r.farm_plan_total;
    return el('aside', { 'class': 'detail' },
      el('div', { 'class': 'detail-head' },
        el('div', null,
          el('h3', { text: r.name }),
          el('div', { 'class': 'sub', text: r.slug + ' · rank #' + r.rank + ' · ' + (r.on_watchlist ? 'on the snapshot watchlist' : 'early find below the watchlist floor') })),
        el('button', { 'class': 'close', text: 'Close', onclick: function () { state.selected = null; writeHash(); render(); } })),
      el('div', { 'class': 'decomp' },
        el('span', { text: fmtUsd(r.tvl_usd) + ' TVL × ' + v.mult.toFixed(3) + ' multiple × ' + v.growth.toFixed(2) + ' growth × ' + v.maturity.toFixed(2) + ' maturity × ' + v.breadth.toFixed(2) + ' breadth = ' }),
        el('span', { 'class': 'eq', text: fmtUsd(v.implied) + ' implied' })),
      el('dl', { 'class': 'facts' },
        el('div', null, el('dt', { text: 'Category' }), el('dd', { text: r.category || 'Uncategorised' })),
        el('div', null, el('dt', { text: 'Category multiple' }), el('dd', { text: fmtMult(r.category_multiple) + ' (' + peers + ')' })),
        el('div', null, el('dt', { text: 'Held-out error, category' }), el('dd', { text: fmtErr(r.heldout_err) + (r.heldout_err === null ? ' — too few peers to split' : ' median error on the half the multiple was not fitted on') })),
        el('div', null, el('dt', { text: 'Token odds (base rate)' }), el('dd', null, el('div', { text: oddsText }), oddsBar, el('div', { 'class': 'oddsnote', text: 'A base rate among comparable protocols in this snapshot — not a prediction this protocol will issue one.' }))),
        el('div', null, el('dt', { text: 'TVL change, 7d' }), el('dd', { text: r.change_7d === null ? 'not reported — read as flat' : fmtPct(r.change_7d) })),
        el('div', null, el('dt', { text: 'Token-free track record' }), el('dd', { text: r.age_days === null ? 'no listing date — read at the median age, ' + fmtAge(DATA.median_age_days) : fmtAge(r.age_days) + ' (tracked since ' + r.listed_at + ')' })),
        el('div', null, el('dt', { text: 'Chains' }), el('dd', { text: r.chains.length ? r.chains.join(', ') : 'none recorded' })),
        el('div', null, el('dt', { text: 'Implied value' }), el('dd', { text: fmtUsd(r.implied_value_usd) })),
        el('div', null, el('dt', { text: 'Farm plan total' }), el('dd', { text: plan ? ('about $' + plan.gas_usd.toFixed(2) + ' gas · ' + plan.active_minutes + ' min active over ' + plan.hold_days + ' days') : '—' }))),
      el('h4', { text: 'Farm plan' }),
      el('ol', { 'class': 'steps' }, r.farm_steps.map(function (s) { return el('li', { text: s }); })));
  }

  /* ---------- live + method views ---------- */
  function liveView() {
    var rows = DATA.live.map(function (p) {
      var ratio = p.mcap_usd && p.tvl_usd ? p.mcap_usd / p.tvl_usd : null;
      return el('tr', null,
        el('td', null, el('div', { 'class': 'pname', text: p.name }), el('div', { 'class': 'pslug', text: p.slug })),
        el('td', { text: p.category || 'Uncategorised' }),
        el('td', { 'class': 'num', text: fmtUsd(p.tvl_usd) }),
        el('td', { 'class': 'num', text: fmtUsd(p.mcap_usd) }),
        el('td', { 'class': 'num', text: ratio === null ? '—' : '×' + ratio.toFixed(3) }),
        el('td', { 'class': 'num ' + (p.change_7d === null ? '' : p.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(p.change_7d) }));
    });
    return el('section', { 'class': 'live-wrap' },
      el('p', { 'class': 'note', text: 'These protocols already have a token, so the radar never ranks them: it measures them. Their market caps over TVL are the raw material of every category multiple on the board — the market pricing its own, read back onto the protocols still waiting for one.' }),
      el('table', { 'class': 'live' },
        el('thead', null, el('tr', null, ['Protocol', 'Category', 'TVL', 'Market cap', 'Mcap / TVL', '7d'].map(function (h, i) {
          return el('th', { 'class': i >= 2 ? 'num' : null, text: h });
        }))),
        el('tbody', null, rows)));
  }
  function methodView() {
    var rows = DATA.categories.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { 'class': 'num', text: String(c.peers) }),
        el('td', { 'class': 'num', text: c.raw_median === null ? '—' : '×' + c.raw_median.toFixed(3) }),
        el('td', { 'class': 'num impl', text: '×' + c.multiple.toFixed(3) }),
        el('td', { 'class': 'num', text: c.heldout_n === null ? '—' : String(c.heldout_n) }),
        el('td', { 'class': 'num', text: fmtErr(c.heldout_err) }));
    });
    var holdoutLine = DATA.global_heldout_err === null
      ? 'No category had enough traded peers to run the held-out check.'
      : 'Held out, not fitted: each multiple above was also fitted on one half of its category’s traded peers (alternating by slug, so the split is the same every run) and tested on the other half. Pooled over ' + DATA.global_heldout_n + ' held-out peers, the median error is ' + fmtErr(DATA.global_heldout_err) + ' — a multiple that misses the typical peer’s market cap by that factor. The board itself still prices with the full-peer multiple; the holdout is the check that the multiple earns its place.';
    return el('section', { 'class': 'method-wrap' },
      el('p', { text: 'One snapshot, sealed: ' + DATA.source + '. It carries ' + DATA.protocols_count + ' protocols at or above $5M of TVL; ' + DATA.pretoken_count + ' record no token. The board ranks ' + DATA.board_size + ' of those — every one of the ' + DATA.watchlist_size + ' on the watchlist (TVL at or above the $50M floor, no token, not a wrapped, staked or bridged product of one that trades), plus the ' + DATA.early_size + ' strongest below that floor.' }),
      el('p', { text: 'Shrinkage is the honest part. A category with fifteen traded peers (lending) is priced almost entirely by its own kind; a category with one is priced almost entirely by the market median, ×' + DATA.global_multiple.toFixed(3) + '. The raw median is printed beside the shrunk multiple so the reader can see exactly how far each category was pulled, and a category with no traded peers at all is priced at the market median and says so in its detail view.' }),
      el('p', { text: holdoutLine }),
      el('table', { 'class': 'calib' },
        el('thead', null, el('tr', null, ['Category', 'Traded peers', 'Raw median mcap / TVL', 'Multiple used', 'Holdout peers', 'Holdout error'].map(function (h, i) {
          return el('th', { 'class': i >= 1 ? 'num' : null, text: h });
        }))),
        el('tbody', null, rows)),
      el('p', { text: 'Token odds are a base rate, not a forecast: for each category, the share of its comparable protocols (traded plus pre-token, exchanges excluded) that already record a token. A category with fewer than five comparable protocols shows no odds at all. Farm gas is priced from stated bands, not live quotes: Ethereum about $3.00 a transaction, BNB Chain, Avalanche, Bitcoin and Tron about $0.30, the cheap L2s and Solana about $0.08, everything else about $0.25 — each plan uses its protocol’s cheapest listed chain, and its detail view totals the gas.' }),
      el('p', { text: 'What the model refuses to do: use a protocol’s name, guess at a launch date, or import a figure the snapshot does not carry. Where the snapshot is silent — a missing seven-day change, a missing listing date — the model reads the neutral value and the detail view says so.' }));
  }

  /* ---------- render ---------- */
  function render() {
    var tabs = el('nav', { 'class': 'tabs' }, [['board', 'The board'], ['live', 'Already trading'], ['method', 'The measuring stick']].map(function (t) {
      return el('button', { 'class': 'tab', 'aria-selected': state.tab === t[0] ? 'true' : 'false', text: t[1], onclick: function () { state.tab = t[0]; writeHash(); render(); } });
    }));
    var children = [header(), modelBox(), tabs];
    if (state.tab === 'board') {
      children.push(controls());
      tableHost = el('div', null);
      children.push(tableHost);
    } else if (state.tab === 'live') {
      children.push(liveView());
    } else {
      children.push(methodView());
    }
    children.push(el('footer', { 'class': 'foot', text: 'Implied values are model ' + DATA.model_version + '’s claim from one sealed snapshot (' + DATA.as_of + '), not a prediction that any token will be issued, and not financial advice. Farm plans carry real cost and risk; a protocol that never issues a token pays nothing for the farming.' }));
    main.replaceChildren.apply(main, children);
    main.setAttribute('aria-busy', 'false');
    if (state.tab === 'board') renderTable();
  }

  readHash();
  render();
})();
