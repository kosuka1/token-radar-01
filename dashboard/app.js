// Token Launch Radar dashboard. Reads window.RADAR (written beside the page
// as data.js) and renders four views from the URL hash: the board, one
// protocol's detail, the already-trading set, and the method. No network,
// no libraries: the sealed snapshot's figures are all the page ever shows.
(function () {
  'use strict';

  var D = window.RADAR;
  var view = document.getElementById('view');
  var topMeta = document.getElementById('top-meta');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));

  // ------------------------------------------------------------ formatting

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function groupInt(n) {
    var digits = String(Math.round(Math.abs(n)));
    var out = '';
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
      out += digits[i];
    }
    return (n < 0 ? '-' : '') + out;
  }

  function fmtUsd(n) {
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + groupInt(n);
  }

  function fmtUsdFull(n) {
    return '$' + groupInt(n);
  }

  function fmtPct(x) {
    if (x === null || x === undefined) return '—';
    var s = (x > 0 ? '+' : '') + x.toFixed(1) + '%';
    return s;
  }

  function fmtAge(days) {
    if (!days) return '—';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }

  function fmtX(x, digits) {
    if (x === null || x === undefined) return '—';
    return '×' + x.toFixed(digits == null ? 2 : digits);
  }

  function errFactor(err) {
    if (err === null || err === undefined) return null;
    return Math.exp(err);
  }

  // ------------------------------------------------------------ state

  function parseHash() {
    var h = location.hash.replace(/^#/, '');
    if (h.indexOf('p=') === 0) return { view: 'detail', slug: decodeURIComponent(h.slice(2)) };
    if (h === 'live') return { view: 'live' };
    if (h === 'method') return { view: 'method' };
    var params = {};
    var q = h.indexOf('?');
    if (q >= 0) {
      h.slice(q + 1).split('&').forEach(function (pair) {
        var eq = pair.indexOf('=');
        if (eq > 0) params[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
      });
    }
    return { view: 'board', params: params };
  }

  function boardHash(params) {
    var parts = [];
    ['q', 'cat', 'chain', 'group', 'sort'].forEach(function (k) {
      if (params[k]) parts.push(k + '=' + encodeURIComponent(params[k]));
    });
    return '#board' + (parts.length ? '?' + parts.join('&') : '');
  }

  var sandbox = { on: false, multScale: 1, growthWeight: 0.45 };

  function sandboxValue(r) {
    var growth = 1 + (sandbox.growthWeight * r.growth_sat) / 100;
    return r.tvl_usd * (r.multiple * sandbox.multScale) * growth * r.maturity * r.breadth;
  }

  // ------------------------------------------------------------ board

  function distinct(key) {
    var seen = {};
    var out = [];
    D.rows.forEach(function (r) {
      var vals = key === 'chains' ? r.chains : [r[key]];
      vals.forEach(function (v) {
        if (!seen[v]) {
          seen[v] = true;
          out.push(v);
        }
      });
    });
    return out.sort();
  }

  function oddsCell(r) {
    if (r.token_odds === null) {
      return '<span class="odds-none">' + (r.category === 'CEX' ? 'excluded' : 'too few peers') + '</span>';
    }
    var pct = Math.round(r.token_odds * 100);
    return (
      '<div>' + r.odds_traded + ' of ' + r.odds_base + ' (' + pct + '%)</div>' +
      '<div class="odds-bar"><div class="odds-fill" style="width:' + pct + '%"></div></div>'
    );
  }

  function renderBoard(params) {
    var cats = distinct('category');
    var chains = distinct('chains');

    function options(list, current, allLabel) {
      var html = '<option value="">' + esc(allLabel) + '</option>';
      list.forEach(function (v) {
        html += '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>';
      });
      return html;
    }

    var sorts = [
      ['rank', 'Model rank'],
      ['value', 'Implied value'],
      ['tvl', 'TVL'],
      ['growth', '7d growth'],
      ['age', 'Age'],
    ];
    var sortHtml = sorts
      .map(function (s) {
        return '<option value="' + s[0] + '"' + ((params.sort || 'rank') === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
      })
      .join('');

    var html =
      '<div class="controls">' +
      '<div class="control"><label for="f-q">Search</label><input type="search" id="f-q" placeholder="Name or slug" value="' + esc(params.q || '') + '"></div>' +
      '<div class="control"><label for="f-cat">Category</label><select id="f-cat">' + options(cats, params.cat, 'All categories') + '</select></div>' +
      '<div class="control"><label for="f-chain">Chain</label><select id="f-chain">' + options(chains, params.chain, 'All chains') + '</select></div>' +
      '<div class="control"><label for="f-group">Set</label><select id="f-group">' +
      '<option value="">Watchlist + early</option>' +
      '<option value="watchlist"' + (params.group === 'watchlist' ? ' selected' : '') + '>Watchlist only</option>' +
      '<option value="early"' + (params.group === 'early' ? ' selected' : '') + '>Early only</option>' +
      '</select></div>' +
      '<div class="control"><label for="f-sort">Sort by</label><select id="f-sort">' + sortHtml + '</select></div>' +
      '</div>' +
      '<div class="sandbox"><span class="sb-title">Model sandbox</span>' +
      '<label><input type="checkbox" id="sb-on"' + (sandbox.on ? ' checked' : '') + '> re-rank live</label>' +
      '<label>Multiple scale <input type="range" id="sb-mult" min="0.5" max="2" step="0.05" value="' + sandbox.multScale + '"><output id="sb-mult-out">' + sandbox.multScale.toFixed(2) + '×</output></label>' +
      '<label>Growth weight <input type="range" id="sb-growth" min="0" max="1" step="0.05" value="' + sandbox.growthWeight + '"><output id="sb-growth-out">' + sandbox.growthWeight.toFixed(2) + '</output></label>' +
      '<button type="button" id="sb-reset">Reset</button>' +
      '<span>Recomputes implied = TVL × multiple × growth × maturity × breadth from the row parts.</span></div>' +
      '<div id="board-wrap"></div>';

    view.innerHTML = html;

    function currentParams() {
      return {
        q: document.getElementById('f-q').value.trim(),
        cat: document.getElementById('f-cat').value,
        chain: document.getElementById('f-chain').value,
        group: document.getElementById('f-group').value,
        sort: document.getElementById('f-sort').value,
      };
    }

    function draw() {
      var p = currentParams();
      var rows = D.rows.filter(function (r) {
        if (p.q && (r.name + ' ' + r.slug).toLowerCase().indexOf(p.q.toLowerCase()) < 0) return false;
        if (p.cat && r.category !== p.cat) return false;
        if (p.chain && r.chains.indexOf(p.chain) < 0) return false;
        if (p.group && r.group !== p.group) return false;
        return true;
      });

      var sbRank = {};
      if (sandbox.on) {
        var ranked = D.rows.slice().sort(function (a, b) {
          return sandboxValue(b) - sandboxValue(a) || (a.slug < b.slug ? -1 : 1);
        });
        ranked.forEach(function (r, i) {
          sbRank[r.slug] = i + 1;
        });
      }

      var sortKey = p.sort || 'rank';
      rows.sort(function (a, b) {
        if (sandbox.on && sortKey === 'rank') return sbRank[a.slug] - sbRank[b.slug];
        if (sortKey === 'value') return b.implied_value_usd - a.implied_value_usd || a.rank - b.rank;
        if (sortKey === 'tvl') return b.tvl_usd - a.tvl_usd || a.rank - b.rank;
        if (sortKey === 'growth') return (b.change_7d == null ? -1e9 : b.change_7d) - (a.change_7d == null ? -1e9 : a.change_7d) || a.rank - b.rank;
        if (sortKey === 'age') return b.age_days - a.age_days || a.rank - b.rank;
        return a.rank - b.rank;
      });

      var watchCount = rows.filter(function (r) { return r.group === 'watchlist'; }).length;
      var out =
        '<p class="count-line">Showing <b>' + rows.length + '</b> of ' + D.rows.length + ' protocols (' + watchCount +
        ' watchlist, ' + (rows.length - watchCount) + ' early)' + (sandbox.on ? ' — sandbox ranking on' : '') + '.</p>';

      if (rows.length === 0) {
        out += '<div class="empty">No protocols match these filters.</div>';
      } else {
        out +=
          '<table class="board"><thead><tr>' +
          '<th class="rank">#</th><th>Protocol</th><th>Category</th><th class="num">TVL</th>' +
          '<th class="num">Implied value</th><th class="num">Multiple</th><th class="num">7d</th>' +
          '<th class="num">Age</th><th class="num">Chains</th><th>Token odds</th>' +
          '</tr></thead><tbody>';
        rows.forEach(function (r) {
          var g = r.change_7d;
          var gCls = g === null ? '' : g > 0 ? 'pos' : g < 0 ? 'neg' : '';
          var rankCell = sandbox.on
            ? sbRank[r.slug] + '<span class="proto-slug">model #' + r.rank + '</span>'
            : String(r.rank);
          out +=
            '<tr data-slug="' + esc(r.slug) + '">' +
            '<td class="rank">' + rankCell + '</td>' +
            '<td><span class="proto-name">' + esc(r.name) + '</span><span class="proto-slug">' + esc(r.slug) +
            (r.group === 'watchlist' ? ' · watchlist' : ' · early') + '</span></td>' +
            '<td><span class="chip' + (r.group === 'watchlist' ? ' watch' : '') + '">' + esc(r.category) + '</span></td>' +
            '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
            '<td class="num value">' + fmtUsd(r.implied_value_usd) + '</td>' +
            '<td class="num">' + fmtX(r.multiple) + '</td>' +
            '<td class="num ' + gCls + '">' + fmtPct(g) + '</td>' +
            '<td class="num">' + fmtAge(r.age_days) + '</td>' +
            '<td class="num">' + r.chains.length + '</td>' +
            '<td class="odds-cell">' + oddsCell(r) + '</td>' +
            '</tr>';
        });
        out += '</tbody></table>';
      }
      document.getElementById('board-wrap').innerHTML = out;

      Array.prototype.forEach.call(document.querySelectorAll('tr[data-slug]'), function (tr) {
        tr.addEventListener('click', function () {
          location.hash = '#p=' + encodeURIComponent(tr.getAttribute('data-slug'));
        });
      });

      var newHash = boardHash(p);
      if (location.hash !== newHash) history.replaceState(null, '', newHash);
    }

    ['f-q', 'f-cat', 'f-chain', 'f-group', 'f-sort'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', draw);
      document.getElementById(id).addEventListener('change', draw);
    });
    document.getElementById('sb-on').addEventListener('change', function (e) {
      sandbox.on = e.target.checked;
      draw();
    });
    document.getElementById('sb-mult').addEventListener('input', function (e) {
      sandbox.multScale = parseFloat(e.target.value);
      document.getElementById('sb-mult-out').textContent = sandbox.multScale.toFixed(2) + '×';
      if (sandbox.on) draw();
    });
    document.getElementById('sb-growth').addEventListener('input', function (e) {
      sandbox.growthWeight = parseFloat(e.target.value);
      document.getElementById('sb-growth-out').textContent = sandbox.growthWeight.toFixed(2);
      if (sandbox.on) draw();
    });
    document.getElementById('sb-reset').addEventListener('click', function () {
      sandbox = { on: false, multScale: 1, growthWeight: 0.45 };
      renderBoard(currentParams());
    });

    draw();
  }

  // ------------------------------------------------------------ detail

  function fact(k, v, s) {
    return '<div class="fact"><div class="k">' + esc(k) + '</div><div class="v">' + v + '</div>' +
      (s ? '<div class="s">' + s + '</div>' : '') + '</div>';
  }

  function renderDetail(slug) {
    var r = null;
    D.rows.forEach(function (x) {
      if (x.slug === slug) r = x;
    });
    if (!r) {
      view.innerHTML = '<a class="back-link" id="back">← Back to the board</a><div class="empty">No protocol named ' + esc(slug) + ' on this board.</div>';
      document.getElementById('back').addEventListener('click', function () { location.hash = '#board'; });
      return;
    }
    var cal = null;
    D.calibration.forEach(function (c) {
      if (c.category === r.category) cal = c;
    });

    var heldLine = 'no held-out peers in this category';
    if (cal && cal.heldout_err !== null) {
      heldLine = 'held-out error ' + fmtX(errFactor(cal.heldout_err), 1) + ' on ' + cal.heldout_n + ' peers';
    }

    var oddsHtml;
    if (r.token_odds === null) {
      oddsHtml = r.category === 'CEX'
        ? 'CEX is excluded from the odds base rate.'
        : 'Too few peers in ' + esc(r.category) + ' to read (' + r.odds_base + ' protocols).';
    } else {
      var pct = Math.round(r.token_odds * 100);
      oddsHtml =
        'Token odds in ' + esc(r.category) + ': ' + r.odds_traded + ' of ' + r.odds_base +
        ' comparable protocols record a token (' + pct + '%).' +
        '<div class="odds-detail"><div class="odds-bar"><div class="odds-fill" style="width:' + pct + '%"></div></div></div>' +
        '<div class="s">A base rate among comparable protocols in this snapshot — not a prediction that this protocol will issue one.</div>';
    }

    var facts =
      fact('Implied value', fmtUsdFull(r.implied_value_usd), 'rank #' + r.rank + ' of ' + D.rows.length + ' · ' + r.group) +
      fact('TVL', fmtUsdFull(r.tvl_usd), 'seven-day change ' + fmtPct(r.change_7d)) +
      fact('Category multiple', fmtX(r.multiple), esc(r.category) + ' · ' + (cal ? cal.peers : 0) + ' traded peers') +
      fact('Held-out check', cal && cal.heldout_err !== null ? fmtX(errFactor(cal.heldout_err), 1) : '—', heldLine) +
      fact('Age tracked', fmtAge(r.age_days), r.listed_at ? 'since ' + esc(r.listed_at) : 'listing date unreported') +
      fact('Chains', String(r.chains.length), esc(r.chains.join(', '))) +
      fact('Cheapest chain', esc(r.cheap_chain || '—'), r.cheap_fee === null ? '' : 'about $' + r.cheap_fee.toFixed(2) + ' of gas per transaction') +
      fact('Token odds', r.token_odds === null ? '—' : Math.round(r.token_odds * 100) + '%', r.token_odds === null ? '' : r.odds_traded + ' of ' + r.odds_base + ' record a token');

    var decomp =
      '<div class="decomp"><span class="eq">' + fmtUsd(r.tvl_usd) + ' TVL × <b>' + fmtX(r.multiple) + '</b> category multiple × <b>' +
      fmtX(r.growth_factor) + '</b> growth × <b>' + fmtX(r.maturity) + '</b> maturity × <b>' + fmtX(r.breadth) +
      '</b> breadth = <b>' + fmtUsdFull(r.implied_value_usd) + '</b></span>' +
      '<div class="s">Growth saturates the seven-day change; maturity rises with age tracked; breadth adds 1.5% per extra chain, capped at ten. The multiple is fitted on traded peers and checked on a held-out half — see Method.</div></div>';

    var steps = '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    var total =
      '<div class="plan-total">Plan total: about <b>$' + r.farm_plan_total.gas_usd.toFixed(2) + '</b> of gas, about <b>' +
      r.farm_plan_total.active_minutes + ' minutes</b> of active time, held over about <b>' + r.farm_plan_total.hold_days +
      ' days</b>. Working capital stays yours; gas is the cost.</div>';

    view.innerHTML =
      '<a class="back-link" id="back">← Back to the board</a>' +
      '<div class="detail-head"><h2>' + esc(r.name) + '</h2><span class="slug">' + esc(r.slug) + '</span>' +
      '<span class="chip' + (r.group === 'watchlist' ? ' watch' : '') + '">' + esc(r.category) + '</span>' +
      '<span class="chip">' + r.group + '</span></div>' +
      '<div class="facts">' + facts + '</div>' +
      decomp +
      '<h3 class="section">Token odds</h3><p>' + oddsHtml + '</p>' +
      '<h3 class="section">Farm plan</h3>' + steps + total;

    document.getElementById('back').addEventListener('click', function () {
      location.hash = '#board';
    });
  }

  // ------------------------------------------------------------ live

  function renderLive() {
    var html =
      '<p class="count-line">The <b>' + D.live.length + '</b> largest protocols that already record a token, by market cap. ' +
      'They are shown apart and never ranked: the board is for protocols whose token is still to come. ' +
      'Their market-cap/TVL ratios are what the category multiples are fitted from.</p>' +
      '<table class="board"><thead><tr><th class="rank">#</th><th>Protocol</th><th>Category</th>' +
      '<th class="num">TVL</th><th class="num">Market cap</th><th class="num">Mcap / TVL</th><th class="num">Chains</th></tr></thead><tbody>';
    D.live.forEach(function (r, i) {
      html +=
        '<tr><td class="rank">' + (i + 1) + '</td>' +
        '<td><span class="proto-name">' + esc(r.name) + '</span><span class="proto-slug">' + esc(r.slug) + '</span></td>' +
        '<td><span class="chip">' + esc(r.category) + '</span></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num value">' + fmtUsd(r.mcap_usd) + '</td>' +
        '<td class="num">' + fmtX(r.ratio) + '</td>' +
        '<td class="num">' + r.chains.length + '</td></tr>';
    });
    html += '</tbody></table>';
    view.innerHTML = html;
  }

  // ------------------------------------------------------------ method

  function renderMethod() {
    var fb = D.fee_bands;
    var feeRows =
      '<tr><td>Ethereum</td><td>$' + fb.ethereum.toFixed(2) + '</td><td>Ethereum</td></tr>' +
      '<tr><td>Mid band</td><td>$' + fb.mid.toFixed(2) + '</td><td>' + esc(fb.mid_chains.join(', ')) + '</td></tr>' +
      '<tr><td>Cheap band</td><td>$' + fb.cheap.toFixed(2) + '</td><td>' + esc(fb.cheap_chains.join(', ')) + '</td></tr>' +
      '<tr><td>Every other chain</td><td>$' + fb.fallback.toFixed(2) + '</td><td>fallback</td></tr>';

    var calRows = D.calibration
      .map(function (c) {
        return (
          '<tr><td>' + esc(c.category) + '</td><td>' + c.peers + '</td><td>' + fmtX(c.multiple) + '</td><td>' +
          c.heldout_n + '</td><td>' + (c.heldout_err === null ? '—' : fmtX(errFactor(c.heldout_err), 1)) + '</td></tr>'
        );
      })
      .join('');

    view.innerHTML =
      '<div class="method">' +
      '<h3 class="section">The value model (' + esc(D.model_version) + ')</h3>' +
      '<p>Each board row\'s implied value is <code>TVL × category multiple × growth × maturity × breadth</code>, ' +
      'computed only from the sealed snapshot (as of ' + esc(D.as_of) + '). The category multiple is the median market-cap/TVL ' +
      'of traded peers in the category, shrunk toward the global median (' + fmtX(D.global.median_multiple) + ' over ' + D.global.peers +
      ' peers) by <code>n/(n+6)</code> and clamped to ×0.03–×1.50. Growth saturates the seven-day change ' +
      '(<code>g/(1+|g|/50)</code>, weight 0.45, clamped to −60%..+120%). Maturity is <code>0.60 + 0.45·age/(age+540d)</code>. ' +
      'Breadth adds 1.5% per extra chain, capped at ten extra. No protocol name is an input anywhere.</p>' +
      '<p>The board holds every watchlist protocol (TVL at or above ' + fmtUsdFull(D.floor_usd) + ', no token recorded) plus the ' +
      'largest pre-token protocols below that floor. Protocols that already record a token are shown apart under ' +
      '"Already trading" and never ranked.</p>' +

      '<div class="cal-strip"><h3 class="section">Calibration — held out, not fitted</h3>' +
      '<p>Each category\'s traded peers are split in half by sorted slug. The multiple is fitted on one half and scored on the ' +
      'other: the median absolute log error of predicted vs actual market-cap/TVL, shown here as an error factor. ' +
      'Pooled over all categories the held-out error is <b>' +
      (D.global.heldout_err === null ? '—' : fmtX(errFactor(D.global.heldout_err), 1)) + '</b> on ' + D.global.heldout_n +
      ' held-out peers — a rough yardstick, stated plainly. The board uses the full-peer multiple; this strip is the validation, not a second model.</p>' +
      '<table class="plain"><thead><tr><th>Category</th><th>Peers</th><th>Multiple used</th><th>Holdout n</th><th>Holdout error</th></tr></thead><tbody>' +
      calRows + '</tbody></table></div>' +

      '<h3 class="section">Token odds</h3>' +
      '<p>For each category, the share of the snapshot\'s protocols in it that already record a token. It is a base rate among ' +
      'comparable protocols in this snapshot, not a prediction that any given protocol will issue one. CEX is excluded, and a ' +
      'category with fewer than five protocols reads as too few peers to call.</p>' +

      '<h3 class="section">Farm plan costs</h3>' +
      '<p>Every step prices its gas on the protocol\'s cheapest listed chain from these bands, and names its working capital ' +
      'and active minutes. The plan total under each plan sums the steps\' gas and minutes over the hold period.</p>' +
      '<table class="plain"><thead><tr><th>Band</th><th>Per transaction</th><th>Chains</th></tr></thead><tbody>' + feeRows + '</tbody></table>' +

      '<h3 class="section">What this radar does not claim</h3>' +
      '<p>An implied value is what a token would be worth if the protocol\'s record stayed as the snapshot has it; it does not ' +
      'predict whether or when a token is issued. "Records no token" is the snapshot\'s record, not proof that none exists. ' +
      'Gas bands are typical figures for planning, not live quotes.</p>' +
      '</div>';
  }

  // ------------------------------------------------------------ routing

  function setActiveTab(name) {
    tabs.forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-view') === name);
    });
  }

  function route() {
    var r = parseHash();
    if (r.view === 'detail') {
      setActiveTab('board');
      renderDetail(r.slug);
    } else if (r.view === 'live') {
      setActiveTab('live');
      renderLive();
    } else if (r.view === 'method') {
      setActiveTab('method');
      renderMethod();
    } else {
      setActiveTab('board');
      renderBoard(r.params || {});
    }
    window.scrollTo(0, 0);
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      location.hash = '#' + t.getAttribute('data-view');
    });
  });

  topMeta.innerHTML =
    'Snapshot as of <b>' + esc(D.as_of) + '</b><br>' +
    '<b>' + D.rows.length + '</b> ranked · <b>' + D.live.length + '</b> already trading<br>' +
    'Model <b>' + esc(D.model_version) + '</b> · held-out error <b>' +
    (D.global.heldout_err === null ? '—' : fmtX(errFactor(D.global.heldout_err), 1)) + '</b>';

  window.addEventListener('hashchange', route);
  route();
})();
