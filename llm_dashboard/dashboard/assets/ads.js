/* ================= 广告数据看板 ================= */
(function () {
  'use strict';
  const { F, D, MultiSelect, DateRange, CH, makeChart } = U;
  const DATA = window.KW_DATA;
  const DIM = DATA.dims;
  const ROWS = DATA.rows;
  // 列索引
  const I = { d: 0, o: 1, s: 2, c: 3, g: 4, p: 5, a: 6, k: 7, m: 8, t: 9, st: 10, im: 11, cl: 12, sp: 13, sa: 14, od: 15, un: 16 };

  const dates = DIM.d; // 已排序
  const MIN_D = dates[0], MAX_D = dates[dates.length - 1];
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const dateWk = dates.map(d => D.parse(d).getDay()); // 0=周日 .. 6=周六
  const WK_METRICS = [
    { key: 'sp',   label: '花费',   dir: 0,  fmt: v => F.money(v) },
    { key: 'od',   label: '广告订单', dir: 1,  fmt: v => F.num(v) },
    { key: 'ctr',  label: 'CTR',    dir: 1,  fmt: v => F.pct(v, 2) },
    { key: 'cpc',  label: 'CPC',    dir: -1, fmt: v => '$' + v.toFixed(2) },
    { key: 'cvr',  label: 'CVR',    dir: 1,  fmt: v => F.pct(v, 1) },
    { key: 'acos', label: 'ACoS',   dir: -1, fmt: v => F.pct(v, 1) },
  ];
  let wkMetric = 'cvr';

  /* ---------- 筛选器 ---------- */
  let dr, msOwner, msShop, msCountry, msCat, msPort, msStatus, msCampaign;
  let _curRows = null;
  let _wkAgg = null;
  const refresh = debounce(renderAll, 60);

  dr = new DateRange(document.getElementById('f-date'), {
    min: MIN_D, max: MAX_D, def: '7',
    presets: ['7', '14', '30', 'tm', 'lm', 'all'],
    onChange: refresh,
  });
  msOwner = new MultiSelect(document.getElementById('f-owner'), { options: DIM.o, onChange: refresh });
  msShop = new MultiSelect(document.getElementById('f-shop'), { options: DIM.s, onChange: refresh });
  msCountry = new MultiSelect(document.getElementById('f-country'), { options: DIM.c, onChange: refresh });
  msCat = new MultiSelect(document.getElementById('f-cat'), { options: DIM.g, onChange: refresh });
  msPort = new MultiSelect(document.getElementById('f-port'), { options: DIM.p, searchable: true, onChange: refresh });
  msStatus = new MultiSelect(document.getElementById('f-status'), { options: DIM.st, onChange: refresh });
  msCampaign = new MultiSelect(document.getElementById('f-campaign'), { options: DIM.a, searchable: true, onChange: debounce(() => { if (_curRows) renderKeywordTables(_curRows); }, 60) });
  buildWkSeg();

  document.getElementById('btn-reset').addEventListener('click', () => {
    [msOwner, msShop, msCountry, msCat, msPort, msStatus, msCampaign].forEach(m => { m.selected.clear(); m.sync(); });
    dr.setPreset('7');
    wkMetric = 'cvr';
    const seg = document.getElementById('wk-metric-seg');
    if (seg) seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.k === 'cvr'));
    if (_curRows) renderWeekdayTable();
  });

  function debounce(fn, t) { let h; return function () { clearTimeout(h); h = setTimeout(fn, t); }; }

  /* ---------- 过滤 ---------- */
  function dimSets() {
    return {
      o: setToIdx(msOwner.value(), DIM.o),
      s: setToIdx(msShop.value(), DIM.s),
      c: setToIdx(msCountry.value(), DIM.c),
      g: setToIdx(msCat.value(), DIM.g),
      p: setToIdx(msPort.value(), DIM.p),
      st: setToIdx(msStatus.value(), DIM.st),
    };
  }
  function setToIdx(sel, arr) {
    if (sel === null) return null;
    const s = new Set();
    sel.forEach(v => { const i = arr.indexOf(v); if (i >= 0) s.add(i); });
    return s;
  }
  function filterRows(dStart, dEnd, ds) {
    const iS = lowerBound(dates, dStart), iE = upperBound(dates, dEnd) - 1;
    const out = [];
    for (const r of ROWS) {
      const di = r[I.d];
      if (di < iS || di > iE) continue;
      if (ds.o && !ds.o.has(r[I.o])) continue;
      if (ds.s && !ds.s.has(r[I.s])) continue;
      if (ds.c && !ds.c.has(r[I.c])) continue;
      if (ds.g && !ds.g.has(r[I.g])) continue;
      if (ds.p && !ds.p.has(r[I.p])) continue;
      if (ds.st && !ds.st.has(r[I.st])) continue;
      out.push(r);
    }
    return out;
  }
  function lowerBound(arr, v) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; arr[m] < v ? lo = m + 1 : hi = m; } return lo; }
  function upperBound(arr, v) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; arr[m] <= v ? lo = m + 1 : hi = m; } return lo; }

  function sum(rows) {
    const t = { im: 0, cl: 0, sp: 0, sa: 0, od: 0, un: 0 };
    for (const r of rows) { t.im += r[I.im]; t.cl += r[I.cl]; t.sp += r[I.sp]; t.sa += r[I.sa]; t.od += r[I.od]; t.un += r[I.un]; }
    return t;
  }
  function groupBy(rows, dimIdx) {
    const m = new Map();
    for (const r of rows) {
      const k = r[dimIdx];
      let o = m.get(k);
      if (!o) { o = { im: 0, cl: 0, sp: 0, sa: 0, od: 0 }; m.set(k, o); }
      o.im += r[I.im]; o.cl += r[I.cl]; o.sp += r[I.sp]; o.sa += r[I.sa]; o.od += r[I.od];
    }
    return m;
  }

  /* ---------- 图表实例 ---------- */
  const chCountryAcos = makeChart('ch-country-acos');
  const chTrendSpend = makeChart('ch-trend-spend');
  const chTrendAcos = makeChart('ch-trend-acos');
  const chCountryIO = makeChart('ch-country-io');
  const chAdType = makeChart('ch-adtype');
  const chMatch = makeChart('ch-match');
  const chCatCvr = makeChart('ch-cat-cvr');
  const chCatCpc = makeChart('ch-cat-cpc');
  const chCatAcos = makeChart('ch-cat-acos');

  /* ---------- 渲染 ---------- */
  function renderAll() {
    const [dS, dE] = dr.value();
    const ds = dimSets();
    const cur = filterRows(dS, dE, ds);
    _curRows = cur;

    // 同周期环比区间
    const span = D.diffDays(dS, dE) + 1;
    const pE = D.addDays(dS, -1), pS = D.addDays(pE, -span + 1);
    const hasPrev = pE >= MIN_D;
    const prev = hasPrev ? filterRows(pS < MIN_D ? MIN_D : pS, pE, ds) : [];

    document.getElementById('range-label').textContent =
      `${dS} ~ ${dE}（环比周期：${hasPrev ? (pS < MIN_D ? MIN_D : pS) + ' ~ ' + pE : '数据不足'}）`;

    renderKpis(cur, prev, hasPrev);
    renderCountryAcos(cur);
    renderTrends(cur, dS, dE);
    renderOwnerTable(cur);
    renderShop(cur);
    renderCountryIO(cur);
    renderCategoryTrends(cur, prev, dS, dE);
    renderAdType(cur);
    renderMatch(cur);
    renderKeywordTables(cur);
    renderWeekday(cur);
    renderAdvice(cur);
  }

  /* ----- KPI ----- */
  function renderKpis(cur, prev, hasPrev) {
    const t = sum(cur), p = sum(prev);
    const acos = t.sa > 0 ? t.sp / t.sa : NaN;
    const acosP = p.sa > 0 ? p.sp / p.sa : NaN;
    const cpc = t.cl > 0 ? t.sp / t.cl : NaN;
    const cpcP = p.cl > 0 ? p.sp / p.cl : NaN;

    const items = [
      { label: '广告花费', val: F.money(t.sp), delta: ratio(t.sp, p.sp), ico: '💰', bg: '#e9eef4', goodDown: true },
      { label: '广告销售额', val: F.money(t.sa), delta: ratio(t.sa, p.sa), ico: '🛒', bg: '#e3efeb', goodDown: false },
      { label: 'ACoS', val: F.pct(acos), delta: diffPct(acos, acosP), ico: '📉', bg: '#f6ecd4', goodDown: true, isPP: true },
      { label: 'CPC', val: isNaN(cpc) ? '—' : '$' + cpc.toFixed(2), delta: ratio(cpc, cpcP), ico: '🖱️', bg: '#ece8f1', goodDown: true },
      { label: 'CVR', val: F.pct(t.cl > 0 ? t.od / t.cl : NaN), delta: diffPct(t.cl > 0 ? t.od / t.cl : NaN, p.cl > 0 ? p.od / p.cl : NaN), ico: '🎯', bg: '#e6f2f0', goodDown: false, isPP: true },
    ];
    const host = document.getElementById('kpi-row');
    host.innerHTML = items.map(it => {
      let dHtml = '<span class="delta-flat">环比 —</span>';
      if (hasPrev && it.delta != null && isFinite(it.delta)) {
        const up = it.delta > 0.0005, down = it.delta < -0.0005;
        const cls = up ? (it.goodDown ? 'delta-up' : 'delta-down') : down ? (it.goodDown ? 'delta-down' : 'delta-up') : 'delta-flat';
        // 语义: 红=不利, 绿=有利
        const arrow = up ? '▲' : down ? '▼' : '—';
        const txt = it.isPP ? Math.abs(it.delta * 100).toFixed(1) + 'pp' : Math.abs(it.delta * 100).toFixed(1) + '%';
        dHtml = `<span class="${cls}"><b>${arrow} ${txt}</b></span><span style="color:#a3a8ae">环比</span>`;
      }
      return `<div class="card kpi">
        <div class="k-ico" style="background:${it.bg}">${it.ico}</div>
        <div class="k-label">${it.label}</div>
        <div class="k-value">${it.val}</div>
        <div class="k-delta">${dHtml}</div>
      </div>`;
    }).join('');
  }
  function ratio(a, b) { if (b == null || !isFinite(b) || b === 0 || a == null || !isFinite(a)) return null; return a / b - 1; }
  function diffPct(a, b) { if (a == null || b == null || !isFinite(a) || !isFinite(b)) return null; return a - b; }

  /* ----- 各国家 ACoS ----- */
  function renderCountryAcos(cur) {
    const m = groupBy(cur, I.c);
    const arr = Array.from(m.entries())
      .map(([k, v]) => ({ name: DIM.c[k], acos: v.sa > 0 ? v.sp / v.sa : 0, sp: v.sp }))
      .sort((a, b) => b.acos - a.acos);
    chCountryAcos.setOption(CH.base({
      tooltip: { trigger: 'axis', confine: true, formatter: ps => {
        const p = ps[0]; const d = arr[p.dataIndex];
        return `${p.name}<br/>ACoS：<b>${F.pct(d.acos)}</b><br/>花费：${F.money(d.sp)}`;
      } },
      legend: { show: false },
      xAxis: Object.assign({ type: 'category', data: arr.map(x => x.name) }, CH.axis()),
      yAxis: CH.vAxis(v => (v * 100).toFixed(0) + '%'),
      series: [{
        type: 'bar', data: arr.map(x => ({
          value: +x.acos.toFixed(4),
          itemStyle: { color: x.acos >= 0.3 ? '#c0453e' : '#3f8f7d', borderRadius: [6, 6, 0, 0] },
        })),
        barMaxWidth: 46,
        label: { show: true, position: 'top', fontSize: 11, color: '#7a8089', formatter: p => (p.value * 100).toFixed(1) + '%' },
        markLine: {
          symbol: 'none', silent: true,
          lineStyle: { color: '#d99a3d', type: 'dashed', width: 1.5 },
          label: { formatter: '基准 30%', position: 'insideEndTop', color: '#d99a3d', fontSize: 11 },
          data: [{ yAxis: 0.3 }],
        },
      }],
    }), true);
  }

  /* ----- 趋势图 ----- */
  function renderTrends(cur, dS, dE) {
    const m = groupBy(cur, I.d);
    const xs = [];
    let d = dS;
    while (d <= dE) { xs.push(d); d = D.addDays(d, 1); }
    const sp = [], sa = [], acos = [], cpc = [];
    xs.forEach(x => {
      const di = dates.indexOf(x);
      const v = di >= 0 ? m.get(di) : null;
      sp.push(v ? +v.sp.toFixed(2) : 0);
      sa.push(v ? +v.sa.toFixed(2) : 0);
      acos.push(v && v.sa > 0 ? +(v.sp / v.sa).toFixed(4) : null);
      cpc.push(v && v.cl > 0 ? +(v.sp / v.cl).toFixed(3) : null);
    });
    const xShow = xs.map(x => x.slice(5));

    chTrendSpend.setOption(CH.base({
      tooltip: { trigger: 'axis', confine: true },
      legend: { top: 0, data: ['广告花费', '广告销售额'] },
      xAxis: Object.assign({ type: 'category', data: xShow, boundaryGap: false }, CH.axis()),
      yAxis: CH.vAxis(v => '$' + (v >= 1000 ? (v / 1000) + 'k' : v)),
      series: [
        { name: '广告花费', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, data: sp,
          lineStyle: { width: 2.5 }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(51,96,140,.22)' }, { offset: 1, color: 'rgba(51,96,140,0)' }] } } },
        { name: '广告销售额', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, data: sa,
          lineStyle: { width: 2.5 }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(63,143,125,.20)' }, { offset: 1, color: 'rgba(63,143,125,0)' }] } } },
      ],
    }), true);

    // ACoS 纵轴动态范围（含 30% 基准线），让波动更明显
    const acosVals = acos.filter(v => v != null && isFinite(v)).concat([0.3]);
    let aMin = Math.min(...acosVals), aMax = Math.max(...acosVals);
    if (!isFinite(aMin) || !isFinite(aMax)) { aMin = 0; aMax = 0.5; }
    const aPad = Math.max((aMax - aMin) * 0.2, 0.02);
    const aLo = Math.max(0, aMin - aPad), aHi = aMax + aPad;

    chTrendAcos.setOption(CH.base({
      tooltip: {
        trigger: 'axis', confine: true,
        axisPointer: { type: 'cross', crossStyle: { color: '#cfccc2' } },
        formatter: ps => {
          let s = ps[0] ? ps[0].name : '';
          ps.forEach(p => {
            const v = p.seriesName === 'ACoS' ? F.pct(p.value) : (p.value == null ? '—' : '$' + Number(p.value).toFixed(2));
            s += `<br/>${p.marker}${p.seriesName}：<b>${v}</b>`;
          });
          return s;
        },
      },
      legend: { top: 0, data: ['CPC', 'ACoS'] },
      grid: { left: 10, right: 46, top: 42, bottom: 10, containLabel: true },
      xAxis: Object.assign({ type: 'category', data: xShow, boundaryGap: true }, CH.axis()),
      yAxis: [
        Object.assign(CH.vAxis(v => (v * 100).toFixed(0) + '%'), { name: 'ACoS', min: +aLo.toFixed(4), max: +aHi.toFixed(4), nameTextStyle: { color: '#a3a8ae', fontSize: 11 } }),
        Object.assign(CH.vAxis(v => '$' + v), { name: 'CPC', splitLine: { show: false }, nameTextStyle: { color: '#a3a8ae', fontSize: 11 } }),
      ],
      series: [
        // CPC 用柱状（次轴），与 ACoS 折线在视觉上区分开
        { name: 'CPC', type: 'bar', yAxisIndex: 1, data: cpc, barMaxWidth: 22,
          itemStyle: { borderRadius: [4, 4, 0, 0], color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(138,122,168,.55)' }, { offset: 1, color: 'rgba(138,122,168,.18)' }] } } },
        // ACoS 用平滑折线（主轴），带面积与 30% 基准线
        { name: 'ACoS', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, data: acos, connectNulls: true, z: 5,
          lineStyle: { width: 3, color: '#d99a3d' }, itemStyle: { color: '#d99a3d' },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(217,154,61,.20)' }, { offset: 1, color: 'rgba(217,154,61,0)' }] } },
          markLine: { symbol: 'none', silent: true, lineStyle: { color: '#c0453e', type: 'dashed', width: 1.2 }, label: { formatter: '基准 30%', position: 'insideEndTop', color: '#c0453e', fontSize: 10 }, data: [{ yAxis: 0.3 }] } },
      ],
    }), true);
  }

  /* ----- 负责人表 ----- */
  function renderOwnerTable(cur) {
    const m = groupBy(cur, I.o);
    const total = sum(cur);
    const arr = Array.from(m.entries())
      .map(([k, v]) => ({ name: DIM.o[k], ...v, acos: v.sa > 0 ? v.sp / v.sa : NaN, share: total.sp > 0 ? v.sp / total.sp : 0 }))
      .sort((a, b) => b.sp - a.sp);
    const maxSp = Math.max(...arr.map(x => x.sp), 1);
    const el = document.getElementById('tbl-owner');
    el.innerHTML = `<thead><tr><th>负责人</th><th>花费</th><th>广告销售额</th><th>ACoS</th><th>CVR</th><th>CPC</th><th>CTR</th></tr></thead><tbody>` +
      arr.map(x => `<tr>
        <td class="dim">${x.name}</td>
        <td><span class="bar-in-cell" style="width:${(x.sp / maxSp * 60).toFixed(0)}px"></span>${F.money(x.sp)}</td>
        <td>${F.money(x.sa)}</td>
        <td>${acosTag(x.acos)}</td>
        <td>${F.pct(x.cl > 0 ? x.od / x.cl : NaN)}</td>
        <td>${F.money(x.cl > 0 ? x.sp / x.cl : NaN)}</td>
        <td>${F.pct(x.im > 0 ? x.cl / x.im : NaN)}</td>
      </tr>`).join('') + '</tbody>';
  }
  function acosTag(v) {
    if (isNaN(v) || !isFinite(v)) return '<span class="tag tag-red">无销售</span>';
    if (v >= 0.3) return `<span class="tag tag-red">${F.pct(v)}</span>`;
    if (v >= 0.2) return `<span class="tag tag-orange">${F.pct(v)}</span>`;
    return `<span class="tag tag-green">${F.pct(v)}</span>`;
  }

  /* ----- 店铺对比（明细表，图表已按需求移除） ----- */
  function renderShop(cur) {
    const m = groupBy(cur, I.s);
    const arr = Array.from(m.entries())
      .map(([k, v]) => ({ name: DIM.s[k], ...v, acos: v.sa > 0 ? v.sp / v.sa : 0 }))
      .sort((a, b) => b.sp - a.sp);

    const el = document.getElementById('tbl-shop');
    el.innerHTML = `<thead><tr><th>店铺</th><th>花费</th><th>销售额</th><th>ACoS</th><th>CVR</th><th>CPC</th><th>CTR</th></tr></thead><tbody>` +
      arr.map(x => `<tr>
        <td class="dim">${x.name}</td><td>${F.money(x.sp)}</td><td>${F.money(x.sa)}</td>
        <td>${acosTag(x.sa > 0 ? x.sp / x.sa : NaN)}</td>
        <td>${F.pct(x.cl > 0 ? x.od / x.cl : NaN)}</td>
        <td>${F.money(x.cl > 0 ? x.sp / x.cl : NaN)}</td>
        <td>${F.pct(x.im > 0 ? x.cl / x.im : NaN)}</td></tr>`).join('') + '</tbody>';
  }

  /* ----- 国家 花费产出 ----- */
  function renderCountryIO(cur) {
    const m = groupBy(cur, I.c);
    const arr = Array.from(m.entries())
      .map(([k, v]) => ({ name: DIM.c[k], ...v, roas: v.sp > 0 ? v.sa / v.sp : 0 }))
      .sort((a, b) => b.sp - a.sp);
    chCountryIO.setOption(CH.base({
      tooltip: {
        trigger: 'axis', confine: true,
        formatter: ps => {
          let s = ps[0] ? ps[0].name : '';
          ps.forEach(p => {
            const v = p.seriesName === 'ROAS' ? Number(p.value).toFixed(2) : F.money(p.value);
            s += `<br/>${p.marker}${p.seriesName}：<b>${v}</b>`;
          });
          return s;
        },
      },
      legend: { top: 0, data: ['广告花费', '广告销售额', 'ROAS'] },
      grid: { left: 10, right: 40, top: 42, bottom: 10, containLabel: true },
      xAxis: Object.assign({ type: 'category', data: arr.map(x => x.name) }, CH.axis()),
      yAxis: [
        CH.vAxis(v => '$' + (v >= 1000 ? (v / 1000) + 'k' : v)),
        Object.assign(CH.vAxis(v => v), { splitLine: { show: false }, name: 'ROAS', nameTextStyle: { color: '#a3a8ae', fontSize: 11 } }),
      ],
      series: [
        { name: '广告花费', type: 'bar', stack: null, data: arr.map(x => +x.sp.toFixed(2)), barMaxWidth: 28, itemStyle: { borderRadius: [5, 5, 0, 0] } },
        { name: '广告销售额', type: 'bar', data: arr.map(x => +x.sa.toFixed(2)), barMaxWidth: 28, itemStyle: { borderRadius: [5, 5, 0, 0], color: '#3f8f7d' } },
        { name: 'ROAS', type: 'line', yAxisIndex: 1, data: arr.map(x => +x.roas.toFixed(2)), symbol: 'circle', symbolSize: 6, lineStyle: { width: 2.5, color: '#8a7aa8' }, itemStyle: { color: '#8a7aa8' } },
      ],
    }), true);
  }

  /* ----- 类目CVR/CPC/ACoS趋势 & 预警 ----- */
  function groupByDateCat(rows) {
    // 返回 Map<categoryIndex, Map<dateIndex, {im,cl,sp,sa,od}>>
    const m = new Map();
    for (const r of rows) {
      const g = r[I.g], d = r[I.d];
      let cm = m.get(g);
      if (!cm) { cm = new Map(); m.set(g, cm); }
      let o = cm.get(d);
      if (!o) { o = { im: 0, cl: 0, sp: 0, sa: 0, od: 0 }; cm.set(d, o); }
      o.im += r[I.im]; o.cl += r[I.cl]; o.sp += r[I.sp]; o.sa += r[I.sa]; o.od += r[I.od];
    }
    return m;
  }

  function catMetric(catMap, gIdx, dIdx) {
    const cm = catMap.get(gIdx);
    if (!cm) return null;
    const o = cm.get(dIdx);
    if (!o) return null;
    return {
      cvr: o.cl > 0 ? o.od / o.cl : NaN,
      cpc: o.cl > 0 ? o.sp / o.cl : NaN,
      acos: o.sa > 0 ? o.sp / o.sa : NaN,
    };
  }

  function catAgg(catMap, gIdx) {
    const cm = catMap.get(gIdx);
    if (!cm) return { sp: 0, cl: 0, sa: 0, od: 0, im: 0 };
    const a = { sp: 0, cl: 0, sa: 0, od: 0, im: 0 };
    for (const o of cm.values()) {
      a.sp += o.sp; a.cl += o.cl; a.sa += o.sa; a.od += o.od; a.im += o.im;
    }
    return a;
  }

  function catRiskLevel(cvr, cpc, acos, cvrP, cpcP, acosP) {
    let score = 0;
    const alerts = [];
    // ACoS超标
    if (!isNaN(acos) && acos >= 0.40) { score += 3; alerts.push('ACoS≥40%'); }
    else if (!isNaN(acos) && acos >= 0.30) { score += 2; alerts.push('ACoS≥30%'); }
    // ACoS环比恶化
    if (!isNaN(acosP) && acosP > 0.1) { score += 2; alerts.push('ACoS↑恶化'); }
    else if (!isNaN(acosP) && acosP > 0.05) { score += 1; }
    // CPC上涨
    if (!isNaN(cpcP) && cpcP > 0.15) { score += 2; alerts.push('CPC↑大量上涨'); }
    else if (!isNaN(cpcP) && cpcP > 0.08) { score += 1; alerts.push('CPC↑上涨'); }
    // CVR下滑(pp差值)
    if (!isNaN(cvrP) && cvrP < -0.03) { score += 2; alerts.push('CVR↓大幅下滑'); }
    else if (!isNaN(cvrP) && cvrP < -0.02) { score += 1; alerts.push('CVR↓下滑'); }
    // CVR绝对值很低
    if (!isNaN(cvr) && cvr < 0.03) { score += 1; alerts.push('CVR极低<3%'); }

    const level = score >= 5 ? 3 : score >= 3 ? 2 : score >= 1 ? 1 : 0;
    return { level, score, alerts };
  }

  function renderCategoryTrends(cur, prev, dS, dE) {
    const curMap = groupByDateCat(cur);
    const prevMap = groupByDateCat(prev);

    // 获取所有类目
    const allCats = new Set([...curMap.keys(), ...prevMap.keys()]);
    // 过滤掉数据太少的类目 (至少当前期有3天数据)
    const cats = Array.from(allCats).filter(g => {
      const cm = curMap.get(g);
      return cm && cm.size >= 3;
    }).sort();

    // 日期索引范围
    const dIdxS = lowerBound(dates, dS), dIdxE = upperBound(dates, dE) - 1;
    const dateLabels = [];
    for (let di = dIdxS; di <= dIdxE; di++) dateLabels.push(dates[di].slice(5));

    // 颜色板 - 固定每个类目颜色
    const catColors = [
      '#33608c', '#3f8f7d', '#d99a3d', '#c0453e', '#8a7aa8',
      '#6b9e85', '#b07d5b', '#4a7a9e', '#a64d79', '#5c8a6e',
      '#9e6b4a', '#3d5a80', '#7d4e6e', '#4a7c6b', '#ad7a3b',
    ];

    // 构建3个图表的series数据
    const cvrSeries = [], cpcSeries = [], acosSeries = [];
    const catRisks = [];

    cats.forEach((g, gi) => {
      const name = DIM.g[g];
      const color = catColors[gi % catColors.length];

      // 当前期每日数据
      const cvrData = [], cpcData = [], acosData = [];
      for (let di = dIdxS; di <= dIdxE; di++) {
        const m = catMetric(curMap, g, di);
        cvrData.push(m ? (isNaN(m.cvr) ? null : +(m.cvr * 100).toFixed(1)) : null);
        cpcData.push(m ? (isNaN(m.cpc) ? null : +m.cpc.toFixed(2)) : null);
        acosData.push(m ? (isNaN(m.acos) ? null : +(m.acos * 100).toFixed(1)) : null);
      }

      cvrSeries.push({ name, type: 'line', data: cvrData, color, smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { width: 2 } });
      cpcSeries.push({ name, type: 'line', data: cpcData, color, smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { width: 2 } });
      acosSeries.push({ name, type: 'line', data: acosData, color, smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { width: 2 } });

      // 聚合统计 & 环比
      const a = catAgg(curMap, g);
      const pa = catAgg(prevMap, g);
      const cvr = a.cl > 0 ? a.od / a.cl : NaN;
      const cpc = a.cl > 0 ? a.sp / a.cl : NaN;
      const acos = a.sa > 0 ? a.sp / a.sa : NaN;
      const pcvr = pa.cl > 0 ? pa.od / pa.cl : NaN;
      const pcpc = pa.cl > 0 ? pa.sp / pa.cl : NaN;
      const pacos = pa.sa > 0 ? pa.sp / pa.sa : NaN;

      const cvrP = !isNaN(cvr) && !isNaN(pcvr) ? cvr - pcvr : NaN;   // pp差值，非比例
      const cpcP = !isNaN(cpc) && !isNaN(pcpc) && pcpc > 0 ? (cpc - pcpc) / pcpc : NaN;
      const acosP = !isNaN(acos) && !isNaN(pacos) && pacos > 0 ? (acos - pacos) / pacos : NaN;

      const risk = catRiskLevel(cvr, cpc, acos, cvrP, cpcP, acosP);
      catRisks.push({ name, cvr, cpc, acos, cvrP, cpcP, acosP, sp: a.sp, sa: a.sa, risk });
    });

    // 渲染CVR图表
    chCatCvr.setOption(CH.base({
      legend: { bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 50, right: 30, top: 10, bottom: 30, containLabel: true },
      xAxis: Object.assign({ type: 'category', data: dateLabels }, CH.axis(30)),
      yAxis: CH.vAxis(v => v + '%', '转化率'),
      series: cvrSeries,
    }), true);

    // 渲染CPC图表
    chCatCpc.setOption(CH.base({
      legend: { bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 50, right: 30, top: 10, bottom: 30, containLabel: true },
      xAxis: Object.assign({ type: 'category', data: dateLabels }, CH.axis(30)),
      yAxis: CH.vAxis(v => '$' + v.toFixed(2), 'CPC'),
      series: cpcSeries,
    }), true);

    // 渲染ACoS图表
    chCatAcos.setOption(CH.base({
      legend: { bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 50, right: 30, top: 10, bottom: 30, containLabel: true },
      xAxis: Object.assign({ type: 'category', data: dateLabels }, CH.axis(30)),
      yAxis: CH.vAxis(v => v + '%', 'ACoS'),
      series: acosSeries,
    }), true);

    // 渲染预警条
    const dangerAlerts = catRisks.filter(c => c.risk.level >= 2);
    const warnAlerts = catRisks.filter(c => c.risk.level === 1);
    let alertHTML = '';
    dangerAlerts.forEach(c => {
      alertHTML += `<span class="alert-tag danger"><span class="a-dot rd"></span><b>${esc(c.name)}</b> ${c.risk.alerts.join('，')}</span>`;
    });
    warnAlerts.forEach(c => {
      alertHTML += `<span class="alert-tag warning"><span class="a-dot yl"></span><b>${esc(c.name)}</b> ${c.risk.alerts.join('，')}</span>`;
    });
    if (!alertHTML) alertHTML = '<span class="alert-tag" style="background:#edf4f0;color:#2c6e50;border:1px solid #c8ddd2">✅ 所有类目指标均在正常范围</span>';
    document.getElementById('alert-bar').innerHTML = alertHTML;

    // 渲染风险评级表
    const sorted = [...catRisks].sort((a, b) => b.risk.score - a.risk.score);
    const riskLabels = { 0: '—', 1: '低', 2: '中', 3: '高' };
    const riskTags = { 3: 'r3', 2: 'r2', 1: 'r1', 0: '' };

    const thead = '<thead><tr><th>类目</th><th>广告花费</th><th>CVR</th><th>CVR环比</th><th>CPC</th><th>CPC环比</th><th>ACoS</th><th>ACoS环比</th><th>风险评级</th><th>风险提示</th></tr></thead>';
    const tbody = '<tbody>' + sorted.map(c => `
      <tr>
        <td><b>${esc(c.name)}</b></td>
        <td>${F.money(c.sp)}</td>
        <td>${F.pct(c.cvr, 1)}</td>
        <td class="${!isNaN(c.cvrP) && c.cvrP < 0 ? 'td-neg' : ''}">${!isNaN(c.cvrP) ? (c.cvrP >= 0 ? '+' : '') + (c.cvrP * 100).toFixed(1) + 'pp' : '—'}</td>
        <td>${F.money(c.cpc, 2)}</td>
        <td class="${!isNaN(c.cpcP) && c.cpcP > 0 ? 'td-pos' : ''}">${F.signPct(c.cpcP, 1)}</td>
        <td class="${!isNaN(c.acos) && c.acos >= 0.30 ? 'td-acos-hi' : !isNaN(c.acos) && c.acos >= 0.20 ? 'td-acos-md' : ''}">${F.pct(c.acos, 1)}</td>
        <td class="${!isNaN(c.acosP) && c.acosP > 0 ? 'td-pos' : ''}">${F.signPct(c.acosP, 1)}</td>
        <td>${c.risk.level > 0 ? '<span class="tag-sm ' + riskTags[c.risk.level] + '">' + riskLabels[c.risk.level] + '风险 (' + c.risk.score + '分)</span>' : '<span style="color:#a3a8ae">正常</span>'}</td>
        <td style="font-size:12px">${c.risk.alerts.length > 0 ? c.risk.alerts.join('；') : '—'}</td>
      </tr>
    `).join('') + '</tbody>';
    document.getElementById('tbl-cat-risk').innerHTML = thead + tbody;
  }

  /* ----- 广告类型 ----- */
  function renderAdType(cur) {
    const m = groupBy(cur, I.t);
    const arr = Array.from(m.entries())
      .map(([k, v]) => ({ name: DIM.t[k], ...v, acos: v.sa > 0 ? v.sp / v.sa : 0, cvr: v.cl > 0 ? v.od / v.cl : 0 }))
      .sort((a, b) => b.sp - a.sp);
    chAdType.setOption(CH.base({
      tooltip: {
        trigger: 'axis', confine: true,
        formatter: ps => {
          let s = ps[0] ? ps[0].name : '';
          ps.forEach(p => {
            let v;
            if (p.seriesName === 'ACoS' || p.seriesName === '转化率') v = F.pct(p.value);
            else v = F.money(p.value);
            s += `<br/>${p.marker}${p.seriesName}：<b>${v}</b>`;
          });
          return s;
        },
      },
      legend: { top: 0 },
      grid: { left: 10, right: 42, top: 42, bottom: 10, containLabel: true },
      xAxis: Object.assign({ type: 'category', data: arr.map(x => x.name) }, CH.axis()),
      yAxis: [
        CH.vAxis(v => '$' + (v >= 1000 ? (v / 1000) + 'k' : v)),
        Object.assign(CH.vAxis(v => (v * 100).toFixed(0) + '%'), { splitLine: { show: false } }),
      ],
      series: [
        { name: '花费', type: 'bar', data: arr.map(x => +x.sp.toFixed(2)), barMaxWidth: 44, itemStyle: { borderRadius: [5, 5, 0, 0] } },
        { name: '销售额', type: 'bar', data: arr.map(x => +x.sa.toFixed(2)), barMaxWidth: 44, itemStyle: { borderRadius: [5, 5, 0, 0], color: '#3f8f7d' } },
        { name: 'ACoS', type: 'line', yAxisIndex: 1, data: arr.map(x => +x.acos.toFixed(4)), symbol: 'circle', symbolSize: 7, lineStyle: { color: '#d99a3d' }, itemStyle: { color: '#d99a3d' } },
        { name: '转化率', type: 'line', yAxisIndex: 1, data: arr.map(x => +x.cvr.toFixed(4)), symbol: 'diamond', symbolSize: 8, lineStyle: { color: '#8a7aa8' }, itemStyle: { color: '#8a7aa8' } },
      ],
    }), true);

    const el = document.getElementById('tbl-adtype');
    el.innerHTML = `<thead><tr><th>广告类型</th><th>花费</th><th>销售额</th><th>ACoS</th><th>转化率</th><th>订单</th><th>点击</th></tr></thead><tbody>` +
      arr.map(x => `<tr><td class="dim">${x.name}</td><td>${F.money(x.sp)}</td><td>${F.money(x.sa)}</td>
        <td>${acosTag(x.sa > 0 ? x.sp / x.sa : NaN)}</td><td>${F.pct(x.cvr)}</td><td>${F.num(x.od)}</td><td>${F.num(x.cl)}</td></tr>`).join('') + '</tbody>';
  }

  /* ----- 匹配方式 ----- */
  function renderMatch(cur) {
    const m = groupBy(cur, I.m);
    const arr = Array.from(m.entries())
      .map(([k, v]) => ({ name: DIM.m[k], ...v, acos: v.sa > 0 ? v.sp / v.sa : 0, cvr: v.cl > 0 ? v.od / v.cl : 0 }))
      .sort((a, b) => b.sp - a.sp);
    chMatch.setOption(CH.base({
      tooltip: {
        trigger: 'axis', confine: true,
        formatter: ps => {
          let s = ps[0] ? ps[0].name : '';
          ps.forEach(p => {
            let v;
            if (p.seriesName === 'ACoS' || p.seriesName === 'CVR') v = F.pct(p.value);
            else if (p.seriesName === '花费') v = F.money(p.value);
            else v = F.num(p.value);
            s += `<br/>${p.marker}${p.seriesName}：<b>${v}</b>`;
          });
          return s;
        },
      },
      legend: { top: 0 },
      grid: { left: 10, right: 42, top: 42, bottom: 10, containLabel: true },
      xAxis: Object.assign({ type: 'category', data: arr.map(x => x.name) }, CH.axis()),
      yAxis: [
        Object.assign(CH.vAxis(v => v >= 1000 ? (v / 1000) + 'k' : v), { name: '花费/曝光/点击(对数)', type: 'log', logBase: 10, nameTextStyle: { color: '#a3a8ae', fontSize: 10 } }),
        Object.assign(CH.vAxis(v => (v * 100).toFixed(0) + '%'), { splitLine: { show: false } }),
      ],
      series: [
        { name: '花费', type: 'bar', data: arr.map(x => +Math.max(x.sp, 0.01).toFixed(2)), barMaxWidth: 30, itemStyle: { borderRadius: [5, 5, 0, 0] } },
        { name: '曝光', type: 'bar', data: arr.map(x => Math.max(x.im, 1)), barMaxWidth: 30, itemStyle: { borderRadius: [5, 5, 0, 0], color: '#5f8ba3' } },
        { name: '点击', type: 'bar', data: arr.map(x => Math.max(x.cl, 1)), barMaxWidth: 30, itemStyle: { borderRadius: [5, 5, 0, 0], color: '#3f8f7d' } },
        { name: 'ACoS', type: 'line', yAxisIndex: 1, data: arr.map(x => +x.acos.toFixed(4)), symbol: 'circle', symbolSize: 7, lineStyle: { color: '#d99a3d', width: 2.5 }, itemStyle: { color: '#d99a3d' } },
        { name: 'CVR', type: 'line', yAxisIndex: 1, data: arr.map(x => +x.cvr.toFixed(4)), symbol: 'diamond', symbolSize: 8, lineStyle: { color: '#8a7aa8', width: 2.5, type: 'dashed' }, itemStyle: { color: '#8a7aa8' } },
      ],
    }), true);

    const el = document.getElementById('tbl-match');
    el.innerHTML = `<thead><tr><th>匹配方式</th><th>花费</th><th>曝光</th><th>点击</th><th>CTR</th><th>CPC</th><th>ACoS</th><th>CVR</th></tr></thead><tbody>` +
      arr.map(x => `<tr><td class="dim">${x.name}</td><td>${F.money(x.sp)}</td><td>${F.num(x.im)}</td><td>${F.num(x.cl)}</td>
        <td>${F.pct(x.im > 0 ? x.cl / x.im : 0, 2)}</td><td>${x.cl > 0 ? '$' + (x.sp / x.cl).toFixed(2) : '—'}</td>
        <td>${acosTag(x.sa > 0 ? x.sp / x.sa : NaN)}</td><td>${F.pct(x.cvr, 1)}</td></tr>`).join('') + '</tbody>';
  }

  /* ----- 板块七：各类目星期表现对比 ----- */
  function buildWkSeg() {
    const host = document.getElementById('wk-metric-seg');
    if (!host) return;
    WK_METRICS.forEach(mk => {
      const b = document.createElement('button');
      b.textContent = mk.label; b.dataset.k = mk.key;
      if (mk.key === wkMetric) b.classList.add('on');
      b.addEventListener('click', () => {
        wkMetric = mk.key;
        host.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.k === mk.key));
        renderWeekdayTable();
      });
      host.appendChild(b);
    });
  }

  function renderWeekday(cur) {
    const m = new Map();
    for (const r of cur) {
      const g = r[I.g], w = dateWk[r[I.d]];
      let arr = m.get(g);
      if (!arr) { arr = Array.from({ length: 7 }, () => ({ im: 0, cl: 0, sp: 0, sa: 0, od: 0 })); m.set(g, arr); }
      const o = arr[w];
      o.im += r[I.im]; o.cl += r[I.cl]; o.sp += r[I.sp]; o.sa += r[I.sa]; o.od += r[I.od];
    }
    _wkAgg = m;
    renderWkBudget(m);
    renderWeekdayTable();
  }

  function renderWkBudget(m) {
    const ov = Array.from({ length: 7 }, () => ({ im: 0, cl: 0, sp: 0, sa: 0, od: 0 }));
    m.forEach(arr => arr.forEach((o, w) => { const t = ov[w]; t.im += o.im; t.cl += o.cl; t.sp += o.sp; t.sa += o.sa; t.od += o.od; }));
    const totalSp = ov.reduce((s, o) => s + o.sp, 0);
    const info = ov.map((o, w) => ({
      w, name: WEEK[w], sp: o.sp, cl: o.cl,
      cvr: o.cl > 0 ? o.od / o.cl : NaN,
      acos: o.sa > 0 ? o.sp / o.sa : NaN,
      share: totalSp > 0 ? o.sp / totalSp : 0,
    })).filter(d => isFinite(d.cvr) && isFinite(d.acos) && d.cl > 0);
    const host = document.getElementById('wk-budget-advice');
    if (info.length < 2) {
      host.innerHTML = '<div class="advice-item"><div class="a-ico" style="background:#e9eef4">ℹ️</div><div><div class="a-tit">样本不足</div><div class="a-txt">当前筛选范围内有效星期数据不足，无法给出可靠的预算分配建议。</div></div></div>';
      return;
    }
    const cvrs = info.map(d => d.cvr), acoss = info.map(d => d.acos);
    const cMin = Math.min(...cvrs), cMax = Math.max(...cvrs), aMin = Math.min(...acoss), aMax = Math.max(...acoss);
    info.forEach(d => {
      const nCvr = cMax > cMin ? (d.cvr - cMin) / (cMax - cMin) : 0.5;
      const nAcos = aMax > aMin ? (aMax - d.acos) / (aMax - aMin) : 0.5;
      d.score = (nCvr + nAcos) / 2;
    });
    const sorted = [...info].sort((a, b) => b.score - a.score);
    const best = sorted.slice(0, 2), worst = sorted.slice(-2).reverse();
    const bestDays = best.map(d => d.name).join('、');
    const worstDays = worst.map(d => d.name).join('、');
    const bestShare = best.reduce((s, d) => s + d.share, 0);
    const worstShare = worst.reduce((s, d) => s + d.share, 0);

    const items = [];
    items.push({
      ico: '📊', bg: '#e9eef4', tit: '星期效率排名',
      txt: `当前范围内，<b>${bestDays}</b> 转化效率最高（CVR ${F.pct(best[0].cvr, 1)} / ACoS ${F.pct(best[0].acos, 1)}），<b>${worstDays}</b> 效率最低（CVR ${F.pct(worst[0].cvr, 1)} / ACoS ${F.pct(worst[0].acos, 1)}）。建议把预算与竞价向高效星期倾斜。`,
    });
    if (worstShare > bestShare && worstShare > 0.15) {
      items.push({
        ico: '💡', bg: '#f6ecd4', tit: '预算再平衡',
        txt: `低效星期（${worstDays}）当前合计占预算 <b>${F.pct(worstShare)}</b>，高于高效星期（${bestDays}）的 ${F.pct(bestShare)}。建议将低效天约 <b>${F.pct(Math.min(0.3, worstShare * 0.4))}</b> 的预算转移到高效天，预计在不增加总预算的前提下改善整体 ACoS。`,
      });
    }
    // 周末 vs 工作日
    const wknd = info.filter(d => d.w === 0 || d.w === 6);
    const wday = info.filter(d => d.w >= 1 && d.w <= 5);
    if (wknd.length && wday.length) {
      const avgCvr = arr => arr.reduce((s, d) => s + d.cvr, 0) / arr.length;
      const avgAcos = arr => arr.reduce((s, d) => s + d.acos, 0) / arr.length;
      const better = avgCvr(wknd) > avgCvr(wday) ? '周末' : '工作日';
      items.push({
        ico: '🗓️', bg: '#e2efe6', tit: '周末 vs 工作日',
        txt: `<b>${better}</b>整体转化更优（周末 CVR ${F.pct(avgCvr(wknd), 1)} / ACoS ${F.pct(avgAcos(wknd), 1)}；工作日 CVR ${F.pct(avgCvr(wday), 1)} / ACoS ${F.pct(avgAcos(wday), 1)}）。可在广告活动层级用分时调价（dayparting）为高效时段加码，低效时段保底曝光即可。`,
      });
    }
    host.innerHTML = items.map(it => `<div class="advice-item"><div class="a-ico" style="background:${it.bg}">${it.ico}</div><div><div class="a-tit">${it.tit}</div><div class="a-txt">${it.txt}</div></div></div>`).join('');
  }

  function renderWeekdayTable() {
    const m = _wkAgg;
    if (!m) return;
    const mk = WK_METRICS.find(x => x.key === wkMetric);
    const cats = Array.from(m.entries())
      .filter(([, arr]) => arr.some(o => o.cl > 0 || o.sp > 0))
      .sort((a, b) => b[1].reduce((s, o) => s + o.sp, 0) - a[1].reduce((s, o) => s + o.sp, 0));
    const el = document.getElementById('tbl-weekday');
    if (!cats.length) {
      el.innerHTML = '<tbody><tr><td class="empty-tip">当前筛选条件下暂无类目数据</td></tr></tbody>';
      return;
    }
    const rows = cats.map(([g, arr]) => {
      const cells = arr.map(o => {
        switch (wkMetric) {
          case 'sp': return o.sp;
          case 'od': return o.od;
          case 'ctr': return o.im > 0 ? o.cl / o.im : NaN;
          case 'cpc': return o.cl > 0 ? o.sp / o.cl : NaN;
          case 'cvr': return o.cl > 0 ? o.od / o.cl : NaN;
          case 'acos': return o.sa > 0 ? o.sp / o.sa : NaN;
        }
        return NaN;
      });
      return { g, cells };
    });
    const vals = [];
    rows.forEach(r => r.cells.forEach(v => { if (isFinite(v)) vals.push(v); }));
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (!isFinite(lo) || !isFinite(hi) || lo === hi) { lo = 0; hi = 1; }
    const norm = v => (v - lo) / (hi - lo);
    function cellColor(v) {
      if (!isFinite(v)) return '';
      if (mk.dir === 0) { // 花费/订单：中性蓝，越高越深
        const a = 0.08 + 0.30 * norm(v);
        return `background:rgba(51,96,140,${a.toFixed(2)})`;
      }
      let t = norm(v); // 1=最大值
      if (mk.dir === -1) t = 1 - t; // 越低越好 → 反转
      // t: 1=最优(绿 58,143,108) 0=最差(红 192,69,62)
      const r = Math.round(192 + (58 - 192) * t);
      const g = Math.round(69 + (143 - 69) * t);
      const b = Math.round(62 + (108 - 62) * t);
      const al = 0.10 + 0.34 * Math.abs(t - 0.5) * 2;
      return `background:rgba(${r},${g},${b},${al.toFixed(2)})`;
    }
    const thead = '<thead><tr><th>类目</th>' + WEEK.map(w => `<th>${w}</th>`).join('') + '<th>周均</th></tr></thead>';
    const tbody = '<tbody>' + rows.map(r => {
      const valid = r.cells.filter(v => isFinite(v));
      const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : NaN;
      return '<tr><td class="dim">' + esc(DIM.g[r.g]) + '</td>' +
        r.cells.map(v => `<td style="${cellColor(v)}">${isFinite(v) ? mk.fmt(v) : '—'}</td>`).join('') +
        `<td style="font-weight:600">${isFinite(avg) ? mk.fmt(avg) : '—'}</td></tr>`;
    }).join('') + '</tbody>';
    el.innerHTML = thead + tbody;
  }

  /* ----- 关键词聚合 ----- */
  function kwAgg(cur) {
    const m = new Map();
    for (const r of cur) {
      const key = r[I.k] + '|' + r[I.a] + '|' + r[I.m] + '|' + r[I.c];
      let o = m.get(key);
      if (!o) {
        o = { k: r[I.k], a: r[I.a], mm: r[I.m], c: r[I.c], s: r[I.s], im: 0, cl: 0, sp: 0, sa: 0, od: 0 };
        m.set(key, o);
      }
      o.im += r[I.im]; o.cl += r[I.cl]; o.sp += r[I.sp]; o.sa += r[I.sa]; o.od += r[I.od];
    }
    return Array.from(m.values());
  }

  function renderKeywordTables(cur) {
    let all = kwAgg(cur);

    // 板块六局部筛选：广告活动
    const campSel = msCampaign.value();
    if (campSel !== null) {
      all = all.filter(x => campSel.has(DIM.a[x.a]));
    }

    // 按广告活动名分组排序（先按指标取 Top20，再按活动名分组展示）
    const byCamp = (a, b) => DIM.a[a.a].localeCompare(DIM.a[b.a], 'zh-CN');

    // 浪费花费: 有花费无销售额，且累计点击 ≥15 次（点击不足 15 次的样本量太小，暂不判定为浪费）
    const waste = all.filter(x => x.sp > 0 && x.sa <= 0 && x.cl >= 15)
      .sort((a, b) => b.sp - a.sp).slice(0, 20)
      .sort((a, b) => byCamp(a, b) || b.sp - a.sp);
    fillKwTable('tbl-waste', waste, x => {
      const tips = [];
      if (x.cl >= 30) tips.push(`累计点击 ${x.cl} 次零转化，建议<b>直接暂停投放</b>并复盘关键词与产品相关性`);
      else tips.push(`累计点击 ${x.cl} 次零转化，建议<b>降低竞价 30%~50%</b> 观察 3~5 天，仍无转化则暂停`);
      if (x.im > 3000 && x.cl / Math.max(x.im, 1) < 0.003) tips.push('CTR 偏低，检查主图与关键词匹配度');
      if (DIM.m[x.mm] === '广泛匹配') tips.push('广泛匹配易跑偏，可加否定词或收紧为词组/精准');
      return tips.join('；');
    }, true);

    // 高 ACoS
    const high = all.filter(x => x.sa > 0 && x.sp / x.sa >= 0.3)
      .sort((a, b) => b.sp - a.sp).slice(0, 20)
      .sort((a, b) => byCamp(a, b) || b.sp - a.sp);
    fillKwTable('tbl-highacos', high, x => {
      const acos = x.sp / x.sa;
      const cpc = x.cl > 0 ? x.sp / x.cl : 0;
      const cvr = x.cl > 0 ? x.od / x.cl : 0;
      const targetBidCut = Math.min(Math.max(1 - 0.3 / acos, 0.1), 0.6);
      const tips = [`ACoS ${F.pct(acos)} 超基准，建议<b>降低竞价约 ${(targetBidCut * 100).toFixed(0)}%</b>（当前 CPC $${cpc.toFixed(2)}）`];
      if (cvr < 0.05 && x.cl >= 10) tips.push(`CVR 仅 ${F.pct(cvr)}，优先优化 Listing（价格/评论/图片）`);
      if (DIM.m[x.mm] === '广泛匹配') tips.push('收紧匹配方式并添加否定关键词');
      if (acos >= 0.6) tips.push('若一周内无改善建议暂停，将预算转移至优质词');
      return tips.join('；');
    }, true);

    // 优质词
    const good = all.filter(x => x.sa >= 100 && x.sp / x.sa <= 0.2)
      .sort((a, b) => b.sa - a.sa).slice(0, 20)
      .sort((a, b) => byCamp(a, b) || b.sa - a.sa);
    fillKwTable('tbl-good', good, x => {
      const acos = x.sp / x.sa;
      const tips = [`ACoS 仅 ${F.pct(acos)}，建议<b>提高竞价 10%~20%</b> 抢占更高位次`];
      if (x.im < 5000) tips.push('曝光尚有空间，可增加预算扩大流量');
      if (DIM.m[x.mm] !== '精准匹配') tips.push('复制为精准匹配单独建组，精细控制出价');
      tips.push('考虑竞投 Top of Search 位并同步布局 SB/SD');
      return tips.join('；');
    }, false);
  }

  function fillKwTable(id, arr, adviceFn, showZeroSale) {
    const el = document.getElementById(id);
    if (!arr.length) {
      el.innerHTML = '';
      el.insertAdjacentHTML('afterbegin', '<tbody><tr><td class="empty-tip">当前筛选条件下暂无符合条件的关键词</td></tr></tbody>');
      return;
    }
    el.innerHTML = `<thead><tr><th style="min-width:150px">关键词</th><th>匹配</th><th>国家</th><th style="min-width:200px">广告活动 <span class="copy-hint">（点名复制）</span></th>
      <th>花费</th><th>销售额</th><th>ACoS</th><th>点击</th><th>曝光</th><th class="wrap" style="min-width:260px;text-align:left">优化建议与措施</th></tr></thead><tbody>` +
      arr.map((x, i) => {
        const acos = x.sa > 0 ? x.sp / x.sa : NaN;
        const grpStart = i > 0 && DIM.a[arr[i - 1].a] !== DIM.a[x.a];
        return `<tr class="${grpStart ? 'kw-grp' : ''}">
          <td class="dim kw-name" data-kw="${esc(DIM.k[x.k])}" title="点击复制关键词" style="text-align:left">${esc(DIM.k[x.k])}</td>
          <td>${DIM.m[x.mm]}</td>
          <td>${DIM.c[x.c]}</td>
          <td class="kw-act" data-act="${esc(DIM.a[x.a])}" title="点击复制活动名">${esc(DIM.a[x.a])}</td>
          <td>${F.money(x.sp)}</td>
          <td>${x.sa > 0 ? F.money(x.sa) : '<span class="tag tag-red">$0</span>'}</td>
          <td>${isNaN(acos) ? '—' : acosTag(acos)}</td>
          <td>${F.num(x.cl)}</td>
          <td>${F.num(x.im)}</td>
          <td class="wrap" style="font-size:12px;color:#4a5058">${adviceFn(x)}</td>
        </tr>`;
      }).join('') + '</tbody>';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ----- 板块六：点击广告活动名即复制全文 ----- */
  function copyText(txt, onDone) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(txt).then(onDone).catch(() => fallbackCopy(txt, onDone));
    } else {
      fallbackCopy(txt, onDone);
    }
  }
  function fallbackCopy(txt, onDone) {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.top = '-99px'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy'); onDone(); } catch (e) { /* 忽略 */ }
    document.body.removeChild(ta);
  }
  document.addEventListener('click', e => {
    const td = e.target.closest('td.kw-act') || e.target.closest('td.kw-name');
    if (!td || td.classList.contains('copied')) return;
    const txt = td.getAttribute('data-act') || td.getAttribute('data-kw');
    if (!txt) return;
    copyText(txt, () => {
      td.classList.add('copied');
      const flag = document.createElement('span');
      flag.className = 'copy-flag';
      flag.textContent = '已复制';
      td.appendChild(flag);
      setTimeout(() => { td.classList.remove('copied'); if (flag.parentNode) flag.parentNode.removeChild(flag); }, 1300);
    });
  });

  /* ----- 板块6 汇总建议 ----- */
  function renderAdvice(cur) {
    const t = sum(cur);
    const all = kwAgg(cur);
    const acos = t.sa > 0 ? t.sp / t.sa : NaN;
    const wasteArr = all.filter(x => x.sp > 0 && x.sa <= 0);
    const wasteSp = wasteArr.reduce((s, x) => s + x.sp, 0);
    const highArr = all.filter(x => x.sa > 0 && x.sp / x.sa >= 0.3);
    const highSp = highArr.reduce((s, x) => s + x.sp, 0);
    const goodArr = all.filter(x => x.sa >= 100 && x.sp / x.sa <= 0.2);

    // 匹配方式表现
    const mm = groupBy(cur, I.m);
    let bestM = null, worstM = null;
    mm.forEach((v, k) => {
      const a = v.sa > 0 ? v.sp / v.sa : Infinity;
      const o = { name: DIM.m[k], acos: a, sp: v.sp };
      if (!bestM || a < bestM.acos) bestM = o;
      if (!worstM || a > worstM.acos) worstM = o;
    });
    // 国家表现
    const cm = groupBy(cur, I.c);
    const badCountries = [];
    cm.forEach((v, k) => {
      const a = v.sa > 0 ? v.sp / v.sa : Infinity;
      if (a >= 0.3 && v.sp > t.sp * 0.03) badCountries.push(DIM.c[k] + '（' + (isFinite(a) ? F.pct(a) : '无销售') + '）');
    });

    const items = [];
    items.push({
      ico: '🎯', bg: '#e9eef4', tit: '整体投放效率',
      txt: `当前范围整体 ACoS 为 <b>${F.pct(acos)}</b>${isFinite(acos) && acos >= 0.3 ? '，高于 30% 基准，需要整体控费' : isFinite(acos) && acos <= 0.2 ? '，处于健康区间，可考虑放量增长' : '，接近基准线，重点做结构优化'}。总花费 ${F.money(t.sp)}，广告销售额 ${F.money(t.sa)}，平均 CPC ${t.cl > 0 ? '$' + (t.sp / t.cl).toFixed(2) : '—'}，CVR ${F.pct(t.cl > 0 ? t.od / t.cl : 0)}。`,
    });
    items.push({
      ico: '✂️', bg: '#f4e3e1', tit: '止损：清理无效花费',
      txt: `共有 <b>${wasteArr.length}</b> 个关键词有花费无产出，合计浪费 <b>${F.money(wasteSp)}</b>（占总花费 ${F.pct(t.sp > 0 ? wasteSp / t.sp : 0)}）。建议每周固定复盘，点击≥10 次零转化的词直接暂停，其余先降竞价 30% 观察；同时在广泛匹配活动中批量添加否定关键词，从源头减少无效点击。`,
    });
    items.push({
      ico: '🔧', bg: '#f6ecd4', tit: '控费：压降高 ACoS 花费',
      txt: `ACoS≥30% 的关键词共 <b>${highArr.length}</b> 个，花费 <b>${F.money(highSp)}</b>（占比 ${F.pct(t.sp > 0 ? highSp / t.sp : 0)}）。按"目标 ACoS 30%"反推逐词下调竞价（降幅 = 1 − 30%/当前 ACoS），并对 CVR&lt;5% 的词优先做 Listing 转化优化而非单纯调价。`,
    });
    items.push({
      ico: '🚀', bg: '#e2efe6', tit: '放量：优质词扩量',
      txt: `优质词（ACoS≤20% 且销售额≥$100）共 <b>${goodArr.length}</b> 个。建议整体提高竞价 10%~20% 抢占搜索首位，单独建立精准匹配活动并给足预算；表现最好的词可同步开 SB 品牌广告与 SD 再营销，构建流量矩阵。`,
    });
    if (bestM && worstM && bestM.name !== worstM.name) {
      items.push({
        ico: '🧭', bg: '#e2eaf3', tit: '结构：匹配方式调优',
        txt: `当前 <b>${bestM.name}</b> 效率最高（ACoS ${isFinite(bestM.acos) ? F.pct(bestM.acos) : '—'}），<b>${worstM.name}</b> 最低（${isFinite(worstM.acos) ? 'ACoS ' + F.pct(worstM.acos) : '无销售'}）。建议将预算逐步向高效匹配方式倾斜，用广泛匹配跑词、词组/精准收割的漏斗打法，控制广泛匹配预算占比。`,
      });
    }
    if (badCountries.length) {
      items.push({
        ico: '🌍', bg: '#f0e4e8', tit: '市场：重点关注国家',
        txt: `以下国家 ACoS 超过 30% 基准：<b>${badCountries.join('、')}</b>。建议按国家做深度诊断：检查当地定价与竞品、旺季节奏及关键词本地化质量，必要时收缩预算保利润。`,
      });
    }
    document.getElementById('advice-list').innerHTML = items.map(it =>
      `<div class="advice-item"><div class="a-ico" style="background:${it.bg}">${it.ico}</div>
       <div><div class="a-tit">${it.tit}</div><div class="a-txt">${it.txt}</div></div></div>`).join('');
  }

  renderAll();
})();
