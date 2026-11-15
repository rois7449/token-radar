// Token Launch Radar — dashboard. No network: every byte it shows is in
// ../data.js (window.RADAR). The model below is the same radar-2 model the
// board was built with (see main.ts and lib/model.ts in the repository): the
// page recomputes each row's implied value and farm plan from the snapshot
// figures, so what the board shows and what the code says always agree.
//
// implied = TVL x 0.30
//         x (1 + clamp(change_7d, -60, 120) / 100 x 0.60)   growth
//         x (0.60 + min(age_days, 1095) / 1095 x 0.40)      maturity
//         x (1 + 0.04 x min(chains, 5))                    breadth
//         x category_multiple                              category

(function () {
  'use strict';

  var DATA = window.RADAR || { rows: [], live: [], watchlist: [], as_of: '', floor_usd: 50000000 };
  var MODEL_VERSION = 'radar-2';

  /* ---- the model, same as lib/model.ts ---- */

  var CATEGORY_MULTIPLE = {
    Dexs: 1.15,
    Lending: 1.1,
    Derivatives: 1.1,
    'Prediction Market': 1.1,
    Yield: 1.05,
    RWA: 1.05,
    'Yield Aggregator': 1.05,
    'Liquidity Manager': 1.05,
    CDP: 1.05,
    'CDP Manager': 1.05,
  };

  var CATEGORY_REASON = {
    Dexs: 'Exchange governance tokens have priced highest relative to TVL.',
    Lending: 'Sticky TVL, recurring fees, clear revenue.',
    Derivatives: 'Sticky TVL, recurring fees, clear revenue.',
    'Prediction Market': 'Fast-growing category with high user counts.',
    Yield: 'Real yield behind the token, thinner secondary market.',
    RWA: 'Real assets behind the token, thinner secondary market.',
    'Yield Aggregator': 'Real yield behind the token, thinner secondary market.',
    'Liquidity Manager': 'Real yield behind the token, thinner secondary market.',
    CDP: 'Real yield behind the token, thinner secondary market.',
    'CDP Manager': 'Real yield behind the token, thinner secondary market.',
  };

  function categoryMultiple(row) {
    if (row.category === null || row.category === undefined) return 1;
    return CATEGORY_MULTIPLE[row.category] || 1;
  }

  function ageDays(row, asOf) {
    if (!row.listed_at) return null;
    var listed = Date.parse(row.listed_at + 'T00:00:00Z');
    var as = Date.parse(asOf);
    if (isNaN(listed) || isNaN(as)) return null;
    return Math.max(0, Math.floor((as - listed) / 86400000));
  }

  // Recompute a row's implied value from the snapshot figures.
  function impliedOf(row, asOf) {
    var age = ageDays(row, asOf);
    var growthPct = Math.min(120, Math.max(-60, row.change_7d === null ? 0 : row.change_7d));
    var growthMultiplier = 1 + (growthPct / 100) * 0.6;
    var maturityMultiplier = 0.6 + (Math.min(age === null ? 365 : age, 1095) / 1095) * 0.4;
    var breadthMultiplier = 1 + 0.04 * Math.min(row.chains.length, 5);
    var categoryMultiplier = categoryMultiple(row);
    var value = Math.max(1, Math.round(
      row.tvl_usd * 0.3 * growthMultiplier * maturityMultiplier * breadthMultiplier * categoryMultiplier,
    ));
    return {
      value: value,
      growth_multiplier: growthMultiplier,
      maturity_multiplier: maturityMultiplier,
      breadth_multiplier: breadthMultiplier,
      category_multiplier: categoryMultiplier,
      age_days: age,
    };
  }

  var CHAIN_ASSET = {
    Ethereum: 'ETH', BSC: 'BNB', Solana: 'SOL', Arbitrum: 'ETH', Base: 'ETH',
    Polygon: 'MATIC', Avalanche: 'AVAX', Optimism: 'ETH', 'zkSync Era': 'ETH',
    Linea: 'ETH', Sui: 'SUI', Aptos: 'APT',
  };

  function capitalFor(row) {
    if (row.tvl_usd >= 1000000000) return 250;
    if (row.tvl_usd >= 200000000) return 150;
    if (row.tvl_usd >= 100000000) return 100;
    return 50;
  }

  function holdDaysFor(row, asOf) {
    var age = ageDays(row, asOf);
    if (age === null) age = 365;
    if (age >= 730) return 60;
    if (age >= 365) return 45;
    return 30;
  }

  function actionFor(row) {
    var chain = row.chains[0] || 'Ethereum';
    var asset = CHAIN_ASSET[chain] || "the chain's native token";
    var capital = capitalFor(row);
    var name = row.name;
    switch (row.category) {
      case 'Dexs':
        return 'Swap on ' + name + ': swap $' + capital + ' of ' + asset + ' through ' + name + "'s own swap interface on " + chain + ' (not a third-party router) and leave the position open for the full hold.';
      case 'Lending':
        return 'Lend on ' + name + ': deposit $' + capital + ' of ' + asset + ' into ' + name + "'s lending market on " + chain + ' and keep it supplied for the full hold.';
      case 'Derivatives':
        return 'Trade on ' + name + ': open a $' + capital + ' ' + asset + ' position on ' + name + "'s derivatives market on " + chain + ' and manage it once a week.';
      case 'Yield':
      case 'Yield Aggregator':
        return 'Deposit into ' + name + ': put $' + capital + ' of ' + asset + ' into ' + name + "'s vault on " + chain + ' and keep it deposited for the full hold.';
      case 'RWA':
        return 'Buy into ' + name + ': put $' + capital + ' into ' + name + "'s tokenised asset on " + chain + ' and hold it for the full hold.';
      case 'Prediction Market':
        return 'Trade on ' + name + ': place $' + capital + ' of ' + asset + ' in outcome shares on ' + name + ' and keep trading once a week for the full hold.';
      case 'CDP':
      case 'CDP Manager':
        return 'Mint with ' + name + ': lock $' + capital + ' of ' + asset + ' as collateral in ' + name + ' on ' + chain + ' and mint its stablecoin against it.';
      default:
        return 'Use ' + name + ': put $' + capital + ' of ' + asset + ' to work in ' + name + "'s main product on " + chain + ' and keep it active for the full hold.';
    }
  }

  function farmSteps(row, asOf) {
    var hold = holdDaysFor(row, asOf);
    return [
      'Fresh wallet, seed on paper: create a clean address for this farm and write its seed phrase on paper, never in a file or a screenshot, so one leaked wallet cannot drain your other farms.',
      actionFor(row),
      'Use it weekly: repeat the qualifying action once a week for the full hold, same wallet, same chain, and write down the date and the amount each time.',
      'Hold ' + hold + ' days: keep the position open for at least ' + hold + ' days from the first action; closing early resets the farm.',
      'Claim only from the official link: if ' + row.name + ' launches a token, open its official site or X account from your own bookmark and never pay anyone to claim it.',
      'Write down what you did: log each action in your farm sheet (date, amount, transaction) so you can prove the farm if the airdrop asks for it.',
    ];
  }

  /* ---- formatting ---- */

  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1000000000) return '$' + (n / 1000000000).toFixed(2) + 'B';
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    var s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
    return s;
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function ageText(row) {
    var age = ageDays(row, DATA.as_of);
    if (age === null) return 'unknown';
    if (age < 30) return age + 'd';
    if (age < 365) return Math.round(age / 30) + 'mo';
    return (age / 365).toFixed(1) + 'y';
  }
  function thesis(row) {
    var bits = [];
    bits.push('#' + row.rank + ' of ' + DATA.rows.length + ' on the board');
    if (row.on_watchlist) bits.push('on the watchlist (TVL above $50M, no token)');
    bits.push(money(row.tvl_usd) + ' TVL');
    if (row.change_7d !== null) bits.push((row.change_7d > 0 ? 'up ' : 'down ') + Math.abs(row.change_7d).toFixed(1) + '% in 7 days');
    var age = ageDays(row, DATA.as_of);
    bits.push(age === null ? 'listed date unknown' : 'running ' + ageText(row) + ' with no token');
    return bits.join(' · ') + '.';
  }

  /* ---- state ---- */

  var state = { q: '', category: '', chain: '', tab: 'pre', sort: 'rank', dir: 1 };
  var bySlug = {};
  DATA.rows.forEach(function (r) { bySlug[r.slug] = r; });
  DATA.live.forEach(function (r) { bySlug[r.slug] = r; });

  function readHash() {
    var h = location.hash.replace(/^#/, '');
    var out = {};
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      if (kv[0]) out[kv[0]] = decodeURIComponent(kv[1] || '');
    });
    return out;
  }
  function writeHash() {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.category) parts.push('category=' + encodeURIComponent(state.category));
    if (state.chain) parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.tab !== 'pre') parts.push('tab=' + state.tab);
    history.replaceState(null, '', parts.length ? '#' + parts.join('&') : location.pathname + location.search);
  }

  /* ---- rendering ---- */

  var $ = function (id) { return document.getElementById(id); };

  function renderMeta() {
    $('meta').textContent =
      'Snapshot ' + (DATA.as_of || '—') + ' · DefiLlama · model ' + MODEL_VERSION +
      ' · ' + DATA.rows.length + ' pre-token rows';
  }

  function renderStats() {
    var watch = DATA.rows.filter(function (r) { return r.on_watchlist; }).length;
    var preTotal = DATA.pre_token_count || DATA.rows.length;
    var liveCount = DATA.live.length;
    var top = DATA.rows[0];
    $('stats').innerHTML =
      '<div class="stat"><b>' + DATA.rows.length + '</b><span>pre-token protocols ranked</span></div>' +
      '<div class="stat"><b>' + watch + ' / ' + DATA.watchlist.length + '</b><span>watchlist covered</span></div>' +
      '<div class="stat"><b>' + preTotal + '</b><span>pre-token in the snapshot</span></div>' +
      '<div class="stat"><b>' + liveCount + '</b><span>already live, shown apart</span></div>' +
      (top ? '<div class="stat"><b>' + money(top.implied_value_usd) + '</b><span>top implied value · ' + esc(top.name) + '</span></div>' : '');
  }

  function renderSpotlight() {
    var top = DATA.rows.slice(0, 3);
    $('spotlight').innerHTML = top.map(function (r, i) {
      return '<button class="card" data-slug="' + esc(r.slug) + '">' +
        '<span class="place">' + ['FIRST', 'SECOND', 'THIRD'][i] + '</span>' +
        '<h3>' + esc(r.name) + '</h3>' +
        '<div class="val">' + money(r.implied_value_usd) + '</div>' +
        '<div class="sub">' + money(r.tvl_usd) + ' TVL · ' + pct(r.change_7d) + ' in 7d · ' + esc(r.category || 'uncategorised') + '</div>' +
        '</button>';
    }).join('');
  }

  function fillSelects() {
    var cats = {};
    var chains = {};
    DATA.rows.forEach(function (r) {
      if (r.category) cats[r.category] = true;
      r.chains.forEach(function (c) { chains[c] = true; });
    });
    Object.keys(cats).sort().forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c;
      $('category').appendChild(o);
    });
    Object.keys(chains).sort().forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c;
      $('chain').appendChild(o);
    });
  }

  function currentRows() {
    var list = state.tab === 'live' ? DATA.live.slice() : DATA.rows.slice();
    if (state.tab === 'pre') {
      if (state.q) {
        var q = state.q.toLowerCase();
        list = list.filter(function (r) {
          return r.name.toLowerCase().indexOf(q) !== -1 || r.slug.toLowerCase().indexOf(q) !== -1;
        });
      }
      if (state.category) list = list.filter(function (r) { return r.category === state.category; });
      if (state.chain) list = list.filter(function (r) { return r.chains.indexOf(state.chain) !== -1; });
    }
    var key = state.sort;
    var dir = state.dir;
    function val(r) {
      if (key === 'rank') return r.rank || 9999;
      if (key === 'name') return r.name.toLowerCase();
      if (key === 'category') return (r.category || '').toLowerCase();
      if (key === 'tvl') return r.tvl_usd;
      if (key === 'change') return r.change_7d === null ? -9999 : r.change_7d;
      if (key === 'age') {
        var a = ageDays(r, DATA.as_of);
        return a === null ? -1 : a;
      }
      if (key === 'implied') return state.tab === 'live' ? (r.mcap_usd || 0) : r.implied_value_usd;
      return r.rank;
    }
    list.sort(function (a, b) {
      var va = val(a), vb = val(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return (a.rank || 9999) - (b.rank || 9999);
    });
    return list;
  }

  function renderTable() {
    var list = currentRows();
    var maxImplied = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;
    var lastTh = document.querySelector('#board thead th[data-sort="implied"]');
    lastTh.textContent = state.tab === 'live' ? 'Market cap' : 'Implied value';
    $('count').textContent = list.length === 0
      ? 'No protocol matches that filter.'
      : state.tab === 'live'
        ? 'Top ' + list.length + ' by market cap — these already have a token, so they are shown apart, not ranked.'
        : 'Showing ' + list.length + ' of ' + DATA.rows.length + ' pre-token protocols, ranked by implied value.';
    if (list.length === 0) {
      $('rows').innerHTML = '<tr><td colspan="7"><div class="empty">Nothing matches. Clear the search or the filters.</div></td></tr>';
      return;
    }
    $('rows').innerHTML = list.map(function (r) {
      var change = r.change_7d === null
        ? '<span>—</span>'
        : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</span>';
      var last = state.tab === 'live'
        ? '<td class="num val">' + money(r.mcap_usd) + '</td>'
        : '<td class="num val">' + money(r.implied_value_usd) +
          '<div class="bar"><i style="width:' + Math.max(2, Math.round(r.implied_value_usd / maxImplied * 100)) + '%"></i></div></td>';
      var watch = state.tab === 'pre' && r.on_watchlist ? ' <span class="watch">WATCHLIST</span>' : '';
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="rank num">' + (state.tab === 'live' ? '—' : r.rank) + '</td>' +
        '<td class="name">' + esc(r.name) + watch + '<span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td class="cat">' + esc(r.category || '—') + '<span class="chains">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + change + '</td>' +
        '<td class="num">' + ageText(r) + '</td>' +
        last +
        '</tr>';
    }).join('');
  }

  function renderModelPanel() {
    var factors = [
      ['Size', 'TVL × 0.30', 'A launch is priced off the value already locked in the protocol.'],
      ['Growth', '1 + clamp(7d, −60%, +120%) × 0.60', 'Fast-growing TVL earns a higher multiple; shrinking TVL earns less.'],
      ['Maturity', '0.60 + min(age, 1095d) / 1095 × 0.40', 'A protocol that ran for years with no token has more pent-up demand.'],
      ['Breadth', '1 + 0.04 × min(chains, 5)', 'More chains means more users; capped at +20%.'],
      ['Category', '0.85 – 1.15', 'Launched tokens in some categories price higher relative to TVL.'],
    ];
    $('factors').innerHTML = factors.map(function (f) {
      return '<div class="factor"><b>' + f[0] + '</b><span>' + f[1] + '<br>' + f[2] + '</span></div>';
    }).join('');
    var cats = Object.keys(CATEGORY_MULTIPLE).sort(function (a, b) {
      return CATEGORY_MULTIPLE[b] - CATEGORY_MULTIPLE[a];
    });
    $('cat-rows').innerHTML = cats.map(function (c) {
      return '<tr><td>' + esc(c) + '</td><td class="num">' + CATEGORY_MULTIPLE[c].toFixed(2) + '×</td><td>' + esc(CATEGORY_REASON[c] || '') + '</td></tr>';
    }).join('') +
    '<tr><td>Everything else</td><td class="num">1.00×</td><td>No category signal either way.</td></tr>';
  }

  function openDetail(slug) {
    var row = bySlug[slug];
    if (!row) return;
    var recomputed = impliedOf(row, DATA.as_of);
    var match = recomputed.value === row.implied_value_usd;
    var steps = farmSteps(row, DATA.as_of);
    var age = ageDays(row, DATA.as_of);
    $('detail').innerHTML =
      '<div class="detail-head"><div><h2>' + esc(row.name) + '</h2>' +
      '<div class="sub">' + esc(row.category || 'Uncategorised') + ' · ' + esc(row.chains.join(', ')) + ' · ' + esc(row.slug) + '</div></div>' +
      '<button type="button" data-close>Close</button></div>' +
      '<div class="detail-body">' +
      '<div class="big">' + moneyFull(row.implied_value_usd) + '</div>' +
      '<p class="thesis">Implied value of a launch, model ' + MODEL_VERSION + '. ' + esc(thesis(row)) + '</p>' +
      '<div class="kv"><span>TVL <b>' + moneyFull(row.tvl_usd) + '</b></span>' +
      '<span>7d <b>' + pct(row.change_7d) + '</b></span>' +
      '<span>Listed <b>' + esc(row.listed_at || 'unknown') + '</b></span>' +
      '<span>Age <b>' + (age === null ? 'unknown' : age + ' days') + '</b></span>' +
      '<span>Token <b>' + (row.pre_token ? 'none recorded' : 'trading') + '</b></span>' +
      (row.on_watchlist ? '<span><b>On the watchlist</b></span>' : '') + '</div>' +
      '<h3>How the number is built</h3>' +
      '<table class="breakdown"><tbody>' +
      '<tr><td>TVL × 0.30</td><td class="num">' + moneyFull(row.tvl_usd * 0.3) + '</td></tr>' +
      '<tr><td>Growth × ' + recomputed.growth_multiplier.toFixed(3) + ' (' + pct(row.change_7d) + ' in 7d)</td><td class="num">× ' + recomputed.growth_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>Maturity × ' + recomputed.maturity_multiplier.toFixed(3) + ' (' + (age === null ? 'age unknown, 365d assumed' : age + ' days') + ')</td><td class="num">× ' + recomputed.maturity_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>Breadth × ' + recomputed.breadth_multiplier.toFixed(3) + ' (' + row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's') + ')</td><td class="num">× ' + recomputed.breadth_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>Category × ' + recomputed.category_multiplier.toFixed(2) + ' (' + esc(row.category || 'uncategorised') + ')</td><td class="num">× ' + recomputed.category_multiplier.toFixed(2) + '</td></tr>' +
      '<tr class="total"><td>Implied value</td><td class="num">' + moneyFull(recomputed.value) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="check">The page recomputes this row as ' + moneyFull(recomputed.value) + ' — ' +
      (match ? 'the same number board.json carries.' : 'which differs from board.json (' + moneyFull(row.implied_value_usd) + ').') + '</p>' +
      '<h3>Farm plan — ' + holdDaysFor(row, DATA.as_of) + ' days, $' + capitalFor(row) + ' capital</h3>' +
      '<ol class="steps">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '</div>';
    var dlg = $('detail');
    if (typeof dlg.showModal === 'function') dlg.showModal();
    var closeBtn = dlg.querySelector('[data-close]');
    if (closeBtn) closeBtn.addEventListener('click', function () { dlg.close(); });
  }

  function applyHash() {
    var h = readHash();
    state.q = h.q || '';
    state.category = h.category || '';
    state.chain = h.chain || '';
    state.tab = h.tab === 'live' ? 'live' : 'pre';
    $('q').value = state.q;
    $('category').value = state.category;
    $('chain').value = state.chain;
    $('tab-pre').setAttribute('aria-selected', state.tab === 'pre' ? 'true' : 'false');
    $('tab-live').setAttribute('aria-selected', state.tab === 'live' ? 'true' : 'false');
    renderTable();
    if (h.p) openDetail(h.p);
  }

  function setTab(tab) {
    state.tab = tab;
    state.sort = tab === 'live' ? 'implied' : 'rank';
    state.dir = 1;
    $('tab-pre').setAttribute('aria-selected', tab === 'pre' ? 'true' : 'false');
    $('tab-live').setAttribute('aria-selected', tab === 'live' ? 'true' : 'false');
    writeHash();
    renderTable();
  }

  /* ---- wire up ---- */

  renderMeta();
  renderStats();
  renderSpotlight();
  fillSelects();
  renderModelPanel();

  $('q').addEventListener('input', function () { state.q = $('q').value; writeHash(); renderTable(); });
  $('category').addEventListener('change', function () { state.category = $('category').value; writeHash(); renderTable(); });
  $('chain').addEventListener('change', function () { state.chain = $('chain').value; writeHash(); renderTable(); });
  $('tab-pre').addEventListener('click', function () { setTab('pre'); });
  $('tab-live').addEventListener('click', function () { setTab('live'); });

  document.querySelectorAll('#board thead th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = 1; }
      document.querySelectorAll('#board thead th').forEach(function (t) { t.removeAttribute('aria-sort'); });
      th.setAttribute('aria-sort', state.dir === 1 ? 'ascending' : 'descending');
      renderTable();
    });
  });

  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  $('spotlight').addEventListener('click', function (e) {
    var card = e.target.closest('[data-slug]');
    if (card) openDetail(card.getAttribute('data-slug'));
  });
  $('detail').addEventListener('click', function (e) {
    if (e.target === $('detail')) $('detail').close();
  });
  window.addEventListener('hashchange', applyHash);

  applyHash();
  document.querySelector('main').setAttribute('aria-busy', 'false');
})();
