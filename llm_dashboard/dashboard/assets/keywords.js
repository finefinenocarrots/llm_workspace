/* ================= 关键词库 & 否词库 ================= */
(function () {
  'use strict';
  const { F, D, MultiSelect, DateRange, CH, makeChart } = U;
  const DATA = window.KW_DATA;
  const DIM = DATA.dims;
  const ROWS = DATA.rows;
  const CLASSIFY = window.KW_CLASSIFY || { manual: {}, rules: [], negKeywords: [] };
  const I = { d: 0, o: 1, s: 2, c: 3, g: 4, p: 5, a: 6, k: 7, m: 8, t: 9, st: 10, im: 11, cl: 12, sp: 13, sa: 14, od: 15 };

  const dates = DIM.d;
  const MIN_D = dates[0], MAX_D = dates[dates.length - 1];

  /* ---------- 筛选器 ---------- */
  const refresh = debounce(renderAll, 60);
  const dr = new DateRange(document.getElementById('f-date'), {
    min: MIN_D, max: MAX_D, def: '30', presets: ['7', '14', '30', 'tm', 'lm', 'all'], onChange: refresh,
  });
  const msOwner = new MultiSelect(document.getElementById('f-owner'), { options: DIM.o, onChange: refresh });
  const msShop = new MultiSelect(document.getElementById('f-shop'), { options: DIM.s, onChange: refresh });
  const msCountry = new MultiSelect(document.getElementById('f-country'), { options: DIM.c, onChange: refresh });
  const msCat = new MultiSelect(document.getElementById('f-cat'), { options: DIM.g, searchable: true, onChange: refresh });
  const msPort = new MultiSelect(document.getElementById('f-port'), { options: DIM.p, searchable: true, onChange: refresh });
  const msEffect = new MultiSelect(document.getElementById('f-effect-inline'), {
    options: ['全部', '极高效词', '高效词', '中等词', '潜力词', '低效词', '待观察'],
    onChange: refresh,
  });
  const msClass = new MultiSelect(document.getElementById('f-class-inline'), {
    options: ['全部', '核心大词', '二级词', '属性词/长尾词', '自动投放', '竞品ASIN'],
    onChange: refresh,
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    [msOwner, msShop, msCountry, msCat, msPort, msEffect, msClass].forEach(m => { m.selected.clear(); m.sync(); });
    dr.setPreset('30');
  });

  function debounce(fn, t) { let h; return function () { clearTimeout(h); h = setTimeout(fn, t); }; }

  /* ---------- 辅助 ---------- */
  function setToIdx(sel, arr) {
    if (sel === null) return null;
    const s = new Set();
    sel.forEach(v => { const i = arr.indexOf(v); if (i >= 0) s.add(i); });
    return s;
  }
  function lowerBound(arr, v) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; arr[m] < v ? lo = m + 1 : hi = m; } return lo; }
  function upperBound(arr, v) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; arr[m] <= v ? lo = m + 1 : hi = m; } return lo; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ---------- 分类引擎 ---------- */
  function classifyKeyword(kw) {
    if (CLASSIFY.manual[kw]) return CLASSIFY.manual[kw];
    for (const rule of CLASSIFY.rules) {
      try {
        const re = new RegExp(rule.pattern.slice(1, rule.pattern.lastIndexOf('/')));
        if (re.test(kw)) return rule.type;
      } catch (e) { /* skip invalid patterns */ }
    }
    // fallback: 按词数
    const n = kw.trim().split(/\s+/).length;
    if (n === 1) return '核心大词';
    if (n === 2) return '二级词';
    return '属性词/长尾词';
  }

  /* ---------- 效果评级 ---------- */
  function getEffect(sp, sa, cl, od) {
    const acos = sa > 0 ? sp / sa * 100 : 999;
    const cvr = cl > 0 ? od / cl * 100 : 0;
    // 已在否词库
    if (CLASSIFY.negKeywords.includes(sp)) return { level: '已加入否词库', score: -1, tag: 'neg' };
    // 低效词
    if (acos > 40) return { level: '低效词', score: 1, tag: 'waste', acos, cvr };
    // 潜力词
    if (od < 2 && acos < 30) return { level: '潜力词', score: 3, tag: 'potential', acos, cvr };
    // 高效系列 (仅按ACoS+订单数，不设CVR门槛)
    if (od > 2) {
      if (acos < 20) return { level: '极高效词', score: 5, tag: 'star', acos, cvr };
      if (acos < 30) return { level: '高效词', score: 4, tag: 'good', acos, cvr };
      if (acos < 40) return { level: '中等词', score: 3, tag: 'ok', acos, cvr };
      return { level: '一般词', score: 2, tag: 'normal', acos, cvr };
    }
    // 待观察
    return { level: '待观察', score: 2, tag: 'watch', acos, cvr };
  }

  /* ---------- 过滤 ---------- */
  function dimSets() {
    return {
      o: setToIdx(msOwner.value(), DIM.o),
      s: setToIdx(msShop.value(), DIM.s),
      c: setToIdx(msCountry.value(), DIM.c),
      g: setToIdx(msCat.value(), DIM.g),
      p: setToIdx(msPort.value(), DIM.p),
    };
  }
  function filterRows(dStart, dEnd, ds) {
    const iS = lowerBound(dates, dStart), iE = upperBound(dates, dEnd) - 1;
    const out = [];
    for (const r of ROWS) {
      const di = r[I.d]; if (di < iS || di > iE) continue;
      if (ds.o && !ds.o.has(r[I.o])) continue;
      if (ds.s && !ds.s.has(r[I.s])) continue;
      if (ds.c && !ds.c.has(r[I.c])) continue;
      if (ds.g && !ds.g.has(r[I.g])) continue;
      if (ds.p && !ds.p.has(r[I.p])) continue;
      out.push(r);
    }
    return out;
  }

  /* ---------- 图表 ---------- */
  const chEffectPie = makeChart('ch-effect-pie');
  const chClassBar = makeChart('ch-class-bar');
  const chNegTrend = makeChart('ch-neg-trend');

  /* ========== 渲染 ========== */
  function renderAll() {
    const [dS, dE] = dr.value();
    const ds = dimSets();
    const cur = filterRows(dS, dE, ds);
    document.getElementById('range-label').textContent = dS + ' ~ ' + dE;

    // 按关键词聚合
    const kwMap = new Map();
    for (const r of cur) {
      const kw = DIM.k[r[I.k]];
      let o = kwMap.get(kw);
      if (!o) { o = { kw, im: 0, cl: 0, sp: 0, sa: 0, od: 0, camps: new Set(), pfs: new Set(), mts: new Set(), cs: new Set(), cats: new Set(), sts: new Set() }; kwMap.set(kw, o); }
      o.im += r[I.im]; o.cl += r[I.cl]; o.sp += r[I.sp]; o.sa += r[I.sa]; o.od += r[I.od];
      o.camps.add(DIM.a[r[I.a]]); o.pfs.add(DIM.p[r[I.p]]); o.mts.add(DIM.m[r[I.m]]);
      o.cs.add(DIM.c[r[I.c]]); o.cats.add(DIM.g[r[I.g]]);
    }

    // 分类 + 效果
    const kwList = [];
    for (const o of kwMap.values()) {
      o.cls = classifyKeyword(o.kw);
      const ef = getEffect(o.sp, o.sa, o.cl, o.od);
      o.effect = ef.level;
      o.effectScore = ef.score;
      o.effectTag = ef.tag;
      o.acos = o.sa > 0 ? o.sp / o.sa : null;
      o.cvr = o.cl > 0 ? o.od / o.cl : null;
      o.ctr = o.im > 0 ? o.cl / o.im : null;
      o.cpc = o.cl > 0 ? o.sp / o.cl : null;
      kwList.push(o);
    }

    // 效果筛选
    const effSel = msEffect.value();
    let filtered = kwList;
    if (effSel !== null) {
      const effSet = new Set(effSel);
      if (!effSet.has('全部')) filtered = filtered.filter(k => effSet.has(k.effect));
    }
    // 分类筛选
    const clsSel = msClass.value();
    if (clsSel !== null) {
      const clsSet = new Set(clsSel);
      if (!clsSet.has('全部')) filtered = filtered.filter(k => clsSet.has(k.cls));
    }

    // 默认排序: 花费降序
    filtered.sort((a, b) => b.sp - a.sp);

    _kwCache = kwList;  // 缓存供点击事件使用
    renderStats(kwList, filtered);
    renderCharts(kwList);
    renderTable(filtered, kwList.length);
    if (!selectedKw || !filtered.find(k => k.kw === selectedKw.kw)) selectedKw = null;
    renderKwDetail(filtered);
    renderNegLib(kwList);
  }

  /* ---------- 统计卡片 ---------- */
  function renderStats(all, filtered) {
    const totalSp = all.reduce((s, k) => s + k.sp, 0);
    const star = all.filter(k => k.effectTag === 'star').length;
    const good = all.filter(k => k.effectTag === 'good').length;
    const waste = all.filter(k => k.effectTag === 'waste').length;
    const potential = all.filter(k => k.effectTag === 'potential').length;
    const neg = all.filter(k => k.effect === '已加入否词库').length;

    const cards = [
      { label: '关键词总数', value: F.num(all.length, 0) },
      { label: '极高效词', value: F.num(star, 0), cls: 'kpi-good' },
      { label: '高效词', value: F.num(good, 0), cls: 'kpi-ok' },
      { label: '潜力词', value: F.num(potential, 0), cls: 'kpi-warn' },
      { label: '低效词', value: F.num(waste, 0), cls: 'kpi-bad' },
      { label: '否词库', value: F.num(neg, 0), cls: 'kpi-neg' },
    ];
    document.getElementById('kpi-row').innerHTML = cards.map(c =>
      `<div class="card kpi ${c.cls||''}"><div class="k-label">${c.label}</div><div class="k-value">${c.value}</div>${c.sub ? '<div class="k-sub">'+c.sub+'</div>' : ''}</div>`
    ).join('');
  }

  /* ---------- 图表 ---------- */
  function renderCharts(all) {
    // 效果分布饼图
    const effCount = {};
    const tagColors = { star: '#10b981', good: '#3b82f6', ok: '#8b5cf6', potential: '#f59e0b', waste: '#ef4444', normal: '#94a3b8', watch: '#cbd5e1', neg: '#1e293b' };
    const tagNames = { star: '极高效词', good: '高效词', ok: '中等词', potential: '潜力词', waste: '低效词', normal: '一般词', watch: '待观察', neg: '已加入否词库' };
    all.forEach(k => { const t = k.effectTag; effCount[t] = (effCount[t] || 0) + 1; });
    const pieData = Object.entries(effCount).map(([k, v]) => ({ name: tagNames[k] || k, value: v, itemStyle: { color: tagColors[k] } }));

    chEffectPie.setOption(CH.base({
      grid: { left: 0, right: 0, top: 10, bottom: 0 },
      tooltip: { trigger: 'item', formatter: '{b}: {c}个 ({d}%)' },
      legend: { bottom: 0, textStyle: { fontSize: 10 } },
      series: [{
        type: 'pie', radius: ['42%', '68%'], center: ['50%', '48%'],
        data: pieData, label: { show: true, formatter: '{b}\n{c}个', fontSize: 10 },
        emphasis: { label: { fontSize: 14, fontWeight: 'bold' } },
      }],
    }), true);

    // 分类分布柱状图
    const clsCount = {};
    all.forEach(k => { const c = k.cls; clsCount[c] = (clsCount[c] || 0) + 1; });
    const clsData = Object.entries(clsCount).sort((a, b) => b[1] - a[1]);

    chClassBar.setOption(CH.base({
      grid: { left: 100, right: 40, top: 10, bottom: 20, containLabel: true },
      xAxis: { type: 'value', axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { color: '#efede6' } } },
      yAxis: { type: 'category', data: clsData.map(d => d[0]).reverse(), axisLabel: { fontSize: 11 } },
      series: [{
        type: 'bar', data: clsData.map(d => ({ value: d[1], itemStyle: { color: ['#33608c','#3f8f7d','#d99a3d','#8a7aa8','#c0453e','#7d9155'][clsData.indexOf(d) % 6], borderRadius: [0,3,3,0] } })).reverse(),
        barWidth: '50%', label: { show: true, position: 'right', fontSize: 11 },
      }],
    }), true);
  }

  /* ---------- 关键词主表格 ---------- */
  function renderTable(list, totalCount) {
    document.getElementById('tbl-info').textContent = `显示 ${list.length} / ${totalCount} 个关键词`;
    const tagBadge = {
      star: '<span class="tag-sm r-star">极高效</span>',
      good: '<span class="tag-sm r-good">高效</span>',
      ok: '<span class="tag-sm r-ok">中等</span>',
      potential: '<span class="tag-sm r-potential">潜力</span>',
      waste: '<span class="tag-sm r-waste">低效</span>',
      normal: '<span class="tag-sm r-normal">一般</span>',
      watch: '<span class="tag-sm r-watch">待观察</span>',
      neg: '<span class="tag-sm r-neg">已否词</span>',
    };
    const acosCol = (v) => {
      if (v == null) return '<span style="color:#a3a8ae">—</span>';
      const pct = (v * 100).toFixed(1) + '%';
      if (v > 0.4) return '<span style="color:#c0453e;font-weight:600">' + pct + '</span>';
      if (v > 0.3) return '<span style="color:#d99a3d;font-weight:500">' + pct + '</span>';
      return pct;
    };

    const thead = `<thead><tr>
      <th style="min-width:180px">投放词/ASIN</th>
      <th>分类</th>
      <th>词频</th>
      <th>曝光量</th><th>点击</th><th>CTR</th><th>CPC</th><th>花费</th>
      <th>广告销售额</th><th>广告订单</th><th>ACoS</th><th>CVR</th>
      <th>效果表现</th>
    </tr></thead>`;

    const tbody = '<tbody>' + list.map(k => `
      <tr data-kw="${esc(k.kw)}">
        <td class="dim">${esc(k.kw)}</td>
        <td><span class="cls-tag">${esc(k.cls)}</span></td>
        <td class="text-right">${k.camps.size}</td>
        <td class="text-right">${F.num(k.im, 0)}</td>
        <td class="text-right">${F.num(k.cl, 0)}</td>
        <td class="text-right">${F.pct(k.ctr, 2)}</td>
        <td class="text-right">${F.money(k.cpc, 2)}</td>
        <td class="text-right">${F.money(k.sp)}</td>
        <td class="text-right">${F.money(k.sa)}</td>
        <td class="text-right">${F.num(k.od, 0)}</td>
        <td class="text-right">${acosCol(k.acos)}</td>
        <td class="text-right">${F.pct(k.cvr, 1)}</td>
        <td>${tagBadge[k.effectTag] || k.effect}</td>
      </tr>
    `).join('') + '</tbody>';

    document.getElementById('tbl-kw').innerHTML = thead + tbody;

    // 表格排序
    document.querySelectorAll('#tbl-kw th').forEach((th, i) => {
      th.style.cursor = 'pointer';
      th.onclick = () => {
        const keys = ['kw', 'cls', null, 'im', 'cl', 'ctr', 'cpc', 'sp', 'sa', 'od', 'acos', 'cvr', 'effectScore'];
        const key = keys[i];
        if (!key) return;
        const asc = th.dataset.sort !== 'asc';
        document.querySelectorAll('#tbl-kw th').forEach(h => delete h.dataset.sort);
        th.dataset.sort = asc ? 'asc' : 'desc';
        list.sort((a, b) => {
          let va = a[key], vb = b[key];
          if (va == null) va = -Infinity; if (vb == null) vb = -Infinity;
          if (key === 'kw') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
          return asc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
        });
        renderTableBody(list);
      };
    });
  }

  function renderTableBody(list) {
    /* 只刷新tbody避免重绘整个表格(保留排序状态) */
    const tagBadge = {
      star: '<span class="tag-sm r-star">极高效</span>',
      good: '<span class="tag-sm r-good">高效</span>',
      ok: '<span class="tag-sm r-ok">中等</span>',
      potential: '<span class="tag-sm r-potential">潜力</span>',
      waste: '<span class="tag-sm r-waste">低效</span>',
      normal: '<span class="tag-sm r-normal">一般</span>',
      watch: '<span class="tag-sm r-watch">待观察</span>',
      neg: '<span class="tag-sm r-neg">已否词</span>',
    };
    const acosCol = (v) => {
      if (v == null) return '<span style="color:#a3a8ae">—</span>';
      const pct = (v * 100).toFixed(1) + '%';
      if (v > 0.4) return '<span style="color:#c0453e;font-weight:600">' + pct + '</span>';
      if (v > 0.3) return '<span style="color:#d99a3d;font-weight:500">' + pct + '</span>';
      return pct;
    };
    document.querySelector('#tbl-kw tbody').innerHTML = list.map(k => `
      <tr data-kw="${esc(k.kw)}">
        <td class="dim">${esc(k.kw)}</td>
        <td><span class="cls-tag">${esc(k.cls)}</span></td>
        <td class="text-right">${k.camps.size}</td>
        <td class="text-right">${F.num(k.im, 0)}</td>
        <td class="text-right">${F.num(k.cl, 0)}</td>
        <td class="text-right">${F.pct(k.ctr, 2)}</td>
        <td class="text-right">${F.money(k.cpc, 2)}</td>
        <td class="text-right">${F.money(k.sp)}</td>
        <td class="text-right">${F.money(k.sa)}</td>
        <td class="text-right">${F.num(k.od, 0)}</td>
        <td class="text-right">${acosCol(k.acos)}</td>
        <td class="text-right">${F.pct(k.cvr, 1)}</td>
        <td>${tagBadge[k.effectTag] || k.effect}</td>
      </tr>
    `).join('');
  }

  /* ---------- 否词库 ---------- */
  function renderNegLib(all) {
    const candidates = all
      .filter(k => k.acos != null && k.acos > 0.5 && k.sp > 20 && k.cl > 20)
      .sort((a, b) => b.sp - a.sp)
      .slice(0, 30);

    if (candidates.length === 0) {
      document.getElementById('neg-list').innerHTML = '<div class="empty-tip">暂无建议否词 — ACoS>50% 且花费>$20 的词已全部清理</div>';
      return;
    }

    const thead = '<thead><tr><th>关键词</th><th>分类</th><th>花费</th><th>点击</th><th>ACoS</th><th>订单</th><th>CVR</th></tr></thead>';
    const tbody = '<tbody>' + candidates.map(k => `
      <tr>
        <td class="dim">${esc(k.kw)}</td>
        <td><span class="cls-tag">${esc(k.cls)}</span></td>
        <td class="text-right">${F.money(k.sp)}</td>
        <td class="text-right">${F.num(k.cl, 0)}</td>
        <td class="text-right" style="color:#dc2626;font-weight:600">${(k.acos*100).toFixed(1)}%</td>
        <td class="text-right">${F.num(k.od, 0)}</td>
        <td class="text-right">${F.pct(k.cvr, 1)}</td>
      </tr>
    `).join('') + '</tbody>';

    document.getElementById('neg-list').innerHTML =
      `<div class="tbl-wrap" style="max-height:500px"><table class="tbl">${thead}${tbody}</table></div>
       <div class="footnote" style="margin-top:6px">全选表格 → Ctrl+C → Excel粘贴即用 · 共 ${candidates.length} 个建议否词</div>`;
  }

  /* ---------- 联动面板: 关键词匹配方式详情 ---------- */
  let selectedKw = null;
  let _kwCache = [];  // 模块级缓存，供点击事件使用
  function renderKwDetail(all) {
    const panel = document.getElementById('kw-detail-panel');
    if (!selectedKw) { panel.innerHTML = '<div class="empty-tip">点击上方表格中的关键词查看该词在不同匹配方式下的表现</div>'; return; }

    const kw = selectedKw;
    if (!kw.mtDetail) {
      // 从原始数据按此关键词的匹配方式聚合
      const [dS, dE] = dr.value();
      const ds = dimSets();
      const cur = filterRows(dS, dE, ds);
      const mtMap = new Map();
      for (const r of cur) {
        if (DIM.k[r[I.k]] !== kw.kw) continue;
        const mt = DIM.m[r[I.m]];
        let o = mtMap.get(mt);
        if (!o) { o = { mt, im: 0, cl: 0, sp: 0, sa: 0, od: 0 }; mtMap.set(mt, o); }
        o.im += r[I.im]; o.cl += r[I.cl]; o.sp += r[I.sp]; o.sa += r[I.sa]; o.od += r[I.od];
      }
      kw.mtDetail = Array.from(mtMap.values()).sort((a, b) => b.sp - a.sp);
    }

    // 表头匹配方式列
    const mtKeys = kw.mtDetail.map(m => m.mt);
    const thead = '<thead><tr><th>匹配方式</th><th>曝光</th><th>点击</th><th>CTR</th><th>CPC</th><th>花费</th><th>广告销售额</th><th>订单</th><th>ACoS</th><th>CVR</th></tr></thead>';

    const tbody = '<tbody>' + kw.mtDetail.map(m => {
      const acos = m.sa > 0 ? (m.sp / m.sa * 100).toFixed(1) + '%' : '—';
      const cvr = m.cl > 0 ? (m.od / m.cl * 100).toFixed(1) + '%' : '—';
      const ctr = m.im > 0 ? (m.cl / m.im * 100).toFixed(2) + '%' : '—';
      const cpc = m.cl > 0 ? '$' + (m.sp / m.cl).toFixed(2) : '—';
      return `<tr class="mt-row">
        <td class="dim">${esc(m.mt)}</td>
        <td class="text-right">${F.num(m.im, 0)}</td>
        <td class="text-right">${F.num(m.cl, 0)}</td>
        <td class="text-right">${ctr}</td>
        <td class="text-right">${cpc}</td>
        <td class="text-right">${F.money(m.sp)}</td>
        <td class="text-right">${F.money(m.sa)}</td>
        <td class="text-right">${F.num(m.od, 0)}</td>
        <td class="text-right">${acos}</td>
        <td class="text-right">${cvr}</td>
      </tr>`;
    }).join('') + '</tbody>';

    panel.innerHTML = `<h3 style="margin:0 0 12px 0;font-size:15px">📋 「${esc(kw.kw)}」各匹配方式表现 <span class="hint">词频: ${kw.camps.size}个活动 · 分类: ${esc(kw.cls)}</span></h3>
      <div class="tbl-wrap" style="max-height:300px"><table class="tbl">${thead}${tbody}</table></div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
        <span class="tag-sm r-star" style="cursor:pointer" onclick="document.querySelectorAll('#tbl-kw tbody tr').forEach(r=>r.classList.remove('selected'));document.getElementById('kw-detail-panel').innerHTML='<div class=empty-tip>点击上方表格中的关键词查看详情</div>';selectedKw=null;">✕ 关闭详情</span>
      </div>`;
  }

  // 全局开关: 否词库增删
  window._addNeg = function (kw) {
    if (!CLASSIFY.negKeywords.includes(kw)) {
      CLASSIFY.negKeywords.push(kw);
      renderAll();
    }
  };
  window._rmNeg = function (kw) {
    CLASSIFY.negKeywords = CLASSIFY.negKeywords.filter(k => k !== kw);
    renderAll();
  };

  /* ---------- 启动 ---------- */
  document.addEventListener('click', function(e) {
    const row = e.target.closest('#tbl-kw tbody tr[data-kw]');
    if (!row) return;
    const kwName = row.dataset.kw;
    const found = _kwCache.find(k => k.kw === kwName);
    if (!found) return;
    // 点击同一行则关闭面板
    if (selectedKw && selectedKw.kw === kwName) {
      selectedKw = null;
      row.classList.remove('selected');
      document.getElementById('kw-detail-panel').style.display = 'none';
      return;
    }
    delete found.mtDetail;  // 清除缓存，重新计算匹配方式
    selectedKw = found;
    document.querySelectorAll('#tbl-kw tbody tr').forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
    document.getElementById('kw-detail-panel').style.display = 'block';
    renderKwDetail(_kwCache);
  });

  renderAll();
})();
