/* ================= 广告目标达成看板 ================= */
(function () {
  'use strict';
  const { F, D, MultiSelect, DateRange, CH, makeChart } = U;
  const DATA = window.TG_DATA;
  const DIM = DATA.dims;
  const DAILY = DATA.daily;   // [d,o,s,c,g, sales, adsp, adsa, imp, clk, adod, od]
  const TGT = DATA.targets;   // [y, mo, o, s, c, g, ts, tp]
  const I = { d: 0, o: 1, s: 2, c: 3, g: 4, sales: 5, adsp: 6, adsa: 7, imp: 8, clk: 9, adod: 10, od: 11 };
  const T = { y: 0, mo: 1, o: 2, s: 3, c: 4, g: 5, ts: 6, tp: 7 };

  const dates = DIM.d;
  const MIN_D = dates[0], MAX_D = dates[dates.length - 1];

  /* ---------- 筛选器 ---------- */
  const refresh = debounce(renderAll, 60);
  const dr = new DateRange(document.getElementById('f-date'), {
    min: MIN_D, max: MAX_D, def: 'tm',
    presets: ['tm', 'lm', 'all'], onChange: refresh,
  });
  const msOwner = new MultiSelect(document.getElementById('f-owner'), { options: DIM.o, onChange: refresh });
  const msShop = new MultiSelect(document.getElementById('f-shop'), { options: DIM.s, onChange: refresh });
  const msCountry = new MultiSelect(document.getElementById('f-country'), { options: DIM.c, onChange: refresh });
  const msCat = new MultiSelect(document.getElementById('f-cat'), { options: DIM.g, searchable: true, onChange: refresh });
  document.getElementById('btn-reset').addEventListener('click', () => {
    [msOwner, msShop, msCountry, msCat].forEach(m => { m.selected.clear(); m.sync(); });
    dr.setPreset('tm');
  });
  function debounce(fn, t) { let h; return function () { clearTimeout(h); h = setTimeout(fn, t); }; }

  function dimSets() {
    return {
      o: toIdx(msOwner.value(), DIM.o), s: toIdx(msShop.value(), DIM.s),
      c: toIdx(msCountry.value(), DIM.c), g: toIdx(msCat.value(), DIM.g),
    };
  }
  function toIdx(sel, arr) {
    if (sel === null) return null;
    const s = new Set(); sel.forEach(v => { const i = arr.indexOf(v); if (i >= 0) s.add(i); });
    return s;
  }
  function passDim(r, ds, io, is, ic, ig) {
    if (ds.o && !ds.o.has(r[io])) return false;
    if (ds.s && !ds.s.has(r[is])) return false;
    if (ds.c && !ds.c.has(r[ic])) return false;
    if (ds.g && !ds.g.has(r[ig])) return false;
    return true;
  }
  function filterDaily(dS, dE, ds) {
    const iS = lb(dates, dS), iE = ub(dates, dE) - 1;
    const out = [];
    for (const r of DAILY) {
      if (r[I.d] < iS || r[I.d] > iE) continue;
      if (!passDim(r, ds, I.o, I.s, I.c, I.g)) continue;
      out.push(r);
    }
    return out;
  }
  function filterTgt(y, mo, ds) {
    const out = [];
    for (const r of TGT) {
      if (r[T.y] !== y || r[T.mo] !== mo) continue;
      if (!passDim(r, ds, T.o, T.s, T.c, T.g)) continue;
      out.push(r);
    }
    return out;
  }
  function filterTgtM(mlist, ds) {
    const keys = new Set(mlist.map(m => m.y * 100 + m.mo));
    const out = [];
    for (const r of TGT) {
      if (!keys.has(r[T.y] * 100 + r[T.mo])) continue;
      if (!passDim(r, ds, T.o, T.s, T.c, T.g)) continue;
      out.push(r);
    }
    return out;
  }
  function lb(a, v) { let l = 0, h = a.length; while (l < h) { const m = (l + h) >> 1; a[m] < v ? l = m + 1 : h = m; } return l; }
  function ub(a, v) { let l = 0, h = a.length; while (l < h) { const m = (l + h) >> 1; a[m] <= v ? l = m + 1 : h = m; } return l; }

  function sumD(rows) {
    const t = { sales: 0, adsp: 0, adsa: 0, imp: 0, clk: 0, adod: 0, od: 0 };
    for (const r of rows) { t.sales += r[I.sales]; t.adsp += r[I.adsp]; t.adsa += r[I.adsa]; t.imp += r[I.imp]; t.clk += r[I.clk]; t.adod += r[I.adod]; t.od += r[I.od]; }
    return t;
  }
  function sumT(rows) {
    let ts = 0, tp = 0;
    for (const r of rows) { ts += r[T.ts]; tp += r[T.tp]; }
    return { ts, tp };
  }

  const chGauge = makeChart('ch-gauge');
  const chTacosG = makeChart('ch-tacos-gauge');
  const chMSpend = makeChart('ch-m-spend');
  const chMTacos = makeChart('ch-m-tacos');
  const chCat = makeChart('ch-cat');
  const ch14d = makeChart('ch-14d');

  const MONTHS = (() => {
    const s = new Set();
    TGT.forEach(r => s.add(r[T.y] * 100 + r[T.mo]));
    return Array.from(s).sort().map(v => ({ y: Math.floor(v / 100), mo: v % 100 }));
  })();

  /* ================= 渲染 ================= */
  const pad2 = n => String(n).padStart(2, '0');
  function renderAll() {
    const [dS, dE] = dr.value();
    const ds = dimSets();

    const effEnd = dE > MAX_D ? MAX_D : dE;
    const effStart = (!dS || dS < MIN_D) ? MIN_D : dS;

    // 覆盖的目标月份 = 与所选日期范围有交集的所有月份（选"全部"时为全部月份）
    const mList = MONTHS.filter(({ y, mo }) => {
      const mS = `${y}-${pad2(mo)}-01`;
      const mE = `${y}-${pad2(mo)}-${pad2(new Date(y, mo, 0).getDate())}`;
      return mS <= effEnd && mE >= effStart;
    });

    // 实际取数窗口：从覆盖的第一个月月初 ~ effEnd（保证目标与实际口径月度对齐）
    const winStart = mList.length ? `${mList[0].y}-${pad2(mList[0].mo)}-01` : effStart;
    const actStart = winStart < MIN_D ? MIN_D : winStart;

    // 时间进度 = 已过天数 / 覆盖月份总天数
    let totalDays = 0, elapsedDays = 0;
    mList.forEach(({ y, mo }) => {
      const dim = new Date(y, mo, 0).getDate();
      totalDays += dim;
      const mS = `${y}-${pad2(mo)}-01`;
      const mE = `${y}-${pad2(mo)}-${pad2(dim)}`;
      if (mE <= effEnd) elapsedDays += dim;
      else if (mS <= effEnd) elapsedDays += +effEnd.slice(8, 10);
    });
    const timeProg = totalDays > 0 ? elapsedDays / totalDays : NaN;

    const label = mList.length === 0 ? '当前范围无目标数据'
      : mList.length === 1 ? `${mList[0].y}年${mList[0].mo}月（实际截至 ${effEnd}）`
        : `${mList[0].y}-${pad2(mList[0].mo)} ~ ${mList[mList.length - 1].y}-${pad2(mList[mList.length - 1].mo)}（实际截至 ${effEnd}）`;
    document.getElementById('month-label').textContent = label;

    const tgt = sumT(filterTgtM(mList, ds));
    const act = sumD(filterDaily(actStart, effEnd, ds));
    const tgtTacos = tgt.ts > 0 ? tgt.tp / tgt.ts : NaN;
    const actTacos = act.sales > 0 ? act.adsp / act.sales : NaN;
    const spendRate = tgt.tp > 0 ? act.adsp / tgt.tp : NaN;
    const tacosRate = (isFinite(actTacos) && actTacos > 0 && isFinite(tgtTacos)) ? tgtTacos / actTacos : NaN;
    const dev = (isFinite(spendRate) ? spendRate : 0) - (isFinite(timeProg) ? timeProg : 0);

    renderKpis(tgt, tgtTacos, spendRate, tacosRate, timeProg, dev, act, actTacos);
    renderGauges(spendRate, isFinite(timeProg) ? timeProg : 0, tgtTacos, actTacos);
    renderMonthTrends(ds);
    renderCatRate(mList, actStart, effEnd, ds);
    renderRankTables(mList, actStart, effEnd, ds);
    render14d(effEnd, ds);
    renderAttribution(actStart, effEnd, ds, tgt, act, tgtTacos, actTacos, timeProg, spendRate);
    renderAdvice(spendRate, tacosRate, timeProg, dev, tgtTacos, actTacos, act, tgt);
  }

  /* ----- KPI ----- */
  function renderKpis(tgt, tgtTacos, spendRate, tacosRate, timeProg, dev, act, actTacos) {
    const items = [
      { label: '实际花费', val: F.money(act.adsp), sub: `目标花费 ${F.money(tgt.tp)}`, ico: '🎯', bg: '#eef1fe' },
      { label: '实际费比 TACOS', val: F.pct(actTacos), sub: `目标费比 ${F.pct(tgtTacos)}`, ico: '📐', bg: '#e6faf6' },
      { label: '实际 ACOS', val: F.pct(act.adsa > 0 ? act.adsp / act.adsa : NaN), sub: `广告销售额 ${F.money(act.adsa)}`, ico: '📊', bg: '#fff1f2' },
      { label: '实际 CPC', val: act.clk > 0 ? '$' + (act.adsp / act.clk).toFixed(2) : '—', sub: `点击量 ${F.num(act.clk)}`, ico: '🖱️', bg: '#ecfdf5' },
      { label: '花费完成率', val: F.pct(spendRate), sub: progressBar(spendRate), ico: '💰', bg: '#fef4e6' },
      { label: '费比完成率', val: F.pct(tacosRate), sub: isFinite(tacosRate) ? (tacosRate >= 1 ? '<span class="tag tag-green">费比达标</span>' : '<span class="tag tag-red">费比超标</span>') : '—', ico: '📏', bg: '#f3eefe' },
      { label: '时间进度', val: F.pct(timeProg), sub: progressBar(timeProg, 'good'), ico: '⏱️', bg: '#e0f2fe' },
      {
        label: '进度偏差', val: F.signPct(dev),
        sub: dev > 0.03 ? '<span class="tag tag-orange">花费超前</span>' : dev < -0.03 ? '<span class="tag tag-blue">花费滞后</span>' : '<span class="tag tag-green">节奏正常</span>',
        ico: dev > 0.03 ? '⚡' : dev < -0.03 ? '🐢' : '✅', bg: '#fce7f3',
      },
    ];
    document.getElementById('kpi-row').innerHTML = items.map(it => `
      <div class="card kpi">
        <div class="k-ico" style="background:${it.bg}">${it.ico}</div>
        <div class="k-label">${it.label}</div>
        <div class="k-value">${it.val}</div>
        <div class="k-delta">${it.sub || ''}</div>
      </div>`).join('');
  }
  function progressBar(v, cls) {
    if (!isFinite(v)) return '—';
    const w = Math.min(v * 100, 100).toFixed(1);
    const c = cls || (v > 1.05 ? 'warn' : '');
    return `<div class="prog-wrap" style="width:100%"><div class="prog"><i class="${c}" style="width:${w}%"></i></div><span style="font-size:11px;color:#9ca3af">${F.pct(v)}</span></div>`;
  }

  /* ----- 仪表盘 ----- */
  function renderGauges(spendRate, timeProg, tgtTacos, actTacos) {
    chGauge.setOption({
      series: [{
        type: 'gauge', startAngle: 200, endAngle: -20, min: 0, max: 1.2, radius: '95%', center: ['50%', '62%'],
        progress: { show: true, width: 16, roundCap: true, itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#4f6ef7' }, { offset: 1, color: '#8b5cf6' }] } } },
        axisLine: { lineStyle: { width: 16, color: [[1, '#eef0f7']] } },
        axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { distance: -46, color: '#9ca3af', fontSize: 10, formatter: v => (v * 100).toFixed(0) + '%' },
        pointer: { show: false },
        anchor: { show: false },
        title: { show: true, offsetCenter: [0, '32%'], fontSize: 13, color: '#6b7280' },
        detail: { valueAnimation: true, offsetCenter: [0, '0%'], fontSize: 30, fontWeight: 700, color: '#1f2937', formatter: v => (v * 100).toFixed(1) + '%' },
        data: [{ value: isFinite(spendRate) ? +spendRate.toFixed(4) : 0, name: '花费完成率' }],
        markPoint: { data: [] },
      }, {
        type: 'gauge', startAngle: 200, endAngle: -20, min: 0, max: 1.2, radius: '95%', center: ['50%', '62%'],
        progress: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        pointer: { show: true, length: '58%', width: 4, itemStyle: { color: '#f59e0b' } },
        detail: { show: false }, title: { show: true, offsetCenter: [0, '58%'], fontSize: 11, color: '#f59e0b' },
        data: [{ value: +timeProg.toFixed(4), name: `⏱ 时间进度 ${F.pct(timeProg)}` }],
      }],
    }, true);

    const bars = [
      { name: '目标 TACOS', value: isFinite(tgtTacos) ? +(tgtTacos * 100).toFixed(2) : 0, color: '#14b8a6' },
      { name: '实际 TACOS', value: isFinite(actTacos) ? +(actTacos * 100).toFixed(2) : 0, color: (actTacos <= tgtTacos ? '#4f6ef7' : '#ef4444') },
    ];
    chTacosG.setOption(CH.base({
      tooltip: { trigger: 'axis', confine: true, formatter: ps => ps.map(p => `${p.marker}${p.name}：<b>${p.value}%</b>`).join('<br/>') },
      legend: { show: false },
      grid: { left: 10, right: 30, top: 20, bottom: 10, containLabel: true },
      xAxis: Object.assign({ type: 'value', axisLabel: { formatter: '{value}%', color: '#6b7280', fontSize: 11 }, splitLine: { lineStyle: { color: '#f0f2f8' } } }),
      yAxis: Object.assign({ type: 'category', data: bars.map(b => b.name) }, CH.axis()),
      series: [{
        type: 'bar', barMaxWidth: 34,
        data: bars.map(b => ({ value: b.value, itemStyle: { color: b.color, borderRadius: [0, 7, 7, 0] } })),
        label: { show: true, position: 'right', formatter: '{c}%', color: '#374151', fontWeight: 600 },
      }],
    }), true);
  }

  /* ----- 月度趋势 ----- */
  function renderMonthTrends(ds) {
    const labels = [], tgtSp = [], actSp = [], rate = [], tgtTc = [], actTc = [];
    MONTHS.forEach(({ y, mo }) => {
      labels.push(y + '-' + String(mo).padStart(2, '0'));
      const t = sumT(filterTgt(y, mo, ds));
      const mS = `${y}-${String(mo).padStart(2, '0')}-01`;
      const mE = `${y}-${String(mo).padStart(2, '0')}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`;
      const a = sumD(filterDaily(mS, mE > MAX_D ? MAX_D : mE, ds));
      tgtSp.push(+t.tp.toFixed(0));
      actSp.push(+a.adsp.toFixed(0));
      rate.push(t.tp > 0 ? +(a.adsp / t.tp).toFixed(4) : null);
      tgtTc.push(t.ts > 0 ? +(t.tp / t.ts).toFixed(4) : null);
      actTc.push(a.sales > 0 ? +(a.adsp / a.sales).toFixed(4) : null);
    });

    chMSpend.setOption(CH.base({
      tooltip: {
        trigger: 'axis', confine: true,
        formatter: ps => {
          let s = ps[0] ? ps[0].name : '';
          ps.forEach(p => {
            const v = p.seriesName === '完成率' ? F.pct(p.value) : F.money(p.value);
            s += `<br/>${p.marker}${p.seriesName}：<b>${v}</b>`;
          });
          return s;
        },
      },
      legend: { top: 0, data: ['目标花费', '实际花费', '完成率'] },
      grid: { left: 10, right: 44, top: 42, bottom: 10, containLabel: true },
      xAxis: Object.assign({ type: 'category', data: labels }, CH.axis()),
      yAxis: [
        CH.vAxis(v => '$' + (v >= 1000 ? (v / 1000) + 'k' : v)),
        Object.assign(CH.vAxis(v => (v * 100).toFixed(0) + '%'), { splitLine: { show: false } }),
      ],
      series: [
        { name: '目标花费', type: 'bar', data: tgtSp, barMaxWidth: 30, itemStyle: { color: '#c7d2fe', borderRadius: [5, 5, 0, 0] } },
        { name: '实际花费', type: 'bar', data: actSp, barMaxWidth: 30, itemStyle: { color: '#4f6ef7', borderRadius: [5, 5, 0, 0] } },
        { name: '完成率', type: 'line', yAxisIndex: 1, data: rate, symbol: 'circle', symbolSize: 7, lineStyle: { width: 2.5, color: '#f59e0b' }, itemStyle: { color: '#f59e0b' }, label: { show: true, fontSize: 10, color: '#f59e0b', formatter: p => p.value == null ? '' : (p.value * 100).toFixed(0) + '%' } },
      ],
    }), true);

    // 动态纵轴范围：取两条线的极值并留 15% 边距，让波动差异更明显
    const tcVals = tgtTc.concat(actTc).filter(v => v != null && isFinite(v));
    let tcMin, tcMax;
    if (tcVals.length) {
      const lo = Math.min.apply(null, tcVals), hi = Math.max.apply(null, tcVals);
      const pad = Math.max((hi - lo) * 0.15, hi * 0.03, 0.002);
      tcMin = Math.max(0, Math.floor((lo - pad) * 1000) / 1000);
      tcMax = Math.ceil((hi + pad) * 1000) / 1000;
    }
    chMTacos.setOption(CH.base({
      tooltip: { trigger: 'axis', confine: true, formatter: ps => { let s = ps[0] ? ps[0].name : ''; ps.forEach(p => { s += `<br/>${p.marker}${p.seriesName}：<b>${F.pct(p.value)}</b>`; }); return s; } },
      legend: { top: 0, data: ['目标 TACOS', '实际 TACOS'] },
      xAxis: Object.assign({ type: 'category', data: labels, boundaryGap: false }, CH.axis()),
      yAxis: Object.assign(CH.vAxis(v => (v * 100).toFixed(1) + '%'), tcVals.length ? { min: tcMin, max: tcMax } : {}),
      series: [
        { name: '目标 TACOS', type: 'line', data: tgtTc, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2.5, type: 'dashed', color: '#14b8a6' }, itemStyle: { color: '#14b8a6' } },
        { name: '实际 TACOS', type: 'line', data: actTc, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2.5, color: '#4f6ef7' }, itemStyle: { color: '#4f6ef7' },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(79,110,247,.15)' }, { offset: 1, color: 'rgba(79,110,247,0)' }] } } },
      ],
    }), true);
  }

  /* ----- 类目费比完成率 ----- */
  function renderCatRate(mList, mS, mE, ds) {
    // 目标按类目（覆盖所选范围内全部月份）
    const tgtMap = new Map(), actMap = new Map();
    filterTgtM(mList, ds).forEach(r => {
      const k = r[T.g];
      const o = tgtMap.get(k) || { ts: 0, tp: 0 };
      o.ts += r[T.ts]; o.tp += r[T.tp];
      tgtMap.set(k, o);
    });
    filterDaily(mS, mE, ds).forEach(r => {
      const k = r[I.g];
      const o = actMap.get(k) || { sales: 0, adsp: 0 };
      o.sales += r[I.sales]; o.adsp += r[I.adsp];
      actMap.set(k, o);
    });
    const arr = [];
    tgtMap.forEach((t, k) => {
      const a = actMap.get(k);
      if (!a || t.ts <= 0 || !a.sales) return;
      const tt = t.tp / t.ts, at = a.adsp / a.sales;
      if (!isFinite(tt) || !isFinite(at) || at <= 0) return;
      arr.push({ name: DIM.g[k], rate: tt / at, tt, at, sp: a.adsp });
    });
    arr.sort((x, y) => y.rate - x.rate);
    const top = arr.slice(0, 18);
    chCat.setOption(CH.base({
      tooltip: {
        trigger: 'axis', confine: true,
        formatter: ps => {
          const d = top[ps[0].dataIndex];
          return `${d.name}<br/>费比完成率：<b>${F.pct(d.rate)}</b><br/>目标 TACOS：${F.pct(d.tt)}<br/>实际 TACOS：${F.pct(d.at)}<br/>期内广告花费：${F.money(d.sp)}`;
        },
      },
      legend: { show: false },
      grid: { left: 10, right: 20, top: 20, bottom: 10, containLabel: true },
      xAxis: Object.assign({ type: 'category', data: top.map(x => x.name) }, CH.axis(30)),
      yAxis: CH.vAxis(v => (v * 100).toFixed(0) + '%'),
      series: [{
        type: 'bar', barMaxWidth: 34,
        data: top.map(x => ({ value: +x.rate.toFixed(4), itemStyle: { color: x.rate >= 1 ? '#10b981' : '#ef4444', borderRadius: [6, 6, 0, 0] } })),
        label: { show: true, position: 'top', fontSize: 10, color: '#6b7280', formatter: p => (p.value * 100).toFixed(0) + '%' },
        markLine: { symbol: 'none', silent: true, lineStyle: { color: '#f59e0b', type: 'dashed' }, label: { formatter: '达标线 100%', color: '#f59e0b', fontSize: 11 }, data: [{ yAxis: 1 }] },
      }],
    }), true);
  }

  /* ----- 负责人 / 国家排行 ----- */
  function renderRankTables(mList, mS, mE, ds) {
    buildRank('tbl-owner', T.o, I.o, DIM.o, mList, mS, mE, ds, '负责人');
    buildRank('tbl-country', T.c, I.c, DIM.c, mList, mS, mE, ds, '国家');
  }
  function buildRank(elId, tIdx, dIdx, dimArr, mList, mS, mE, ds, dimName) {
    const tgtMap = new Map(), actMap = new Map();
    filterTgtM(mList, ds).forEach(r => {
      const k = r[tIdx];
      const o = tgtMap.get(k) || { ts: 0, tp: 0 };
      o.ts += r[T.ts]; o.tp += r[T.tp];
      tgtMap.set(k, o);
    });
    filterDaily(mS, mE, ds).forEach(r => {
      const k = r[dIdx];
      const o = actMap.get(k) || { sales: 0, adsp: 0 };
      o.sales += r[I.sales]; o.adsp += r[I.adsp];
      actMap.set(k, o);
    });
    const keys = new Set([...tgtMap.keys(), ...actMap.keys()]);
    const arr = [];
    keys.forEach(k => {
      const t = tgtMap.get(k) || { ts: 0, tp: 0 };
      const a = actMap.get(k) || { sales: 0, adsp: 0 };
      if (t.tp <= 0 && a.adsp <= 0) return;
      const spendRate = t.tp > 0 ? a.adsp / t.tp : NaN;
      const tt = t.ts > 0 ? t.tp / t.ts : NaN;
      const at = a.sales > 0 ? a.adsp / a.sales : NaN;
      const tacosRate = isFinite(tt) && isFinite(at) && at > 0 ? tt / at : NaN;
      arr.push({ name: dimArr[k], tgtSp: t.tp, actSp: a.adsp, spendRate, tt, at, tacosRate });
    });
    arr.sort((x, y) => (isFinite(y.spendRate) ? y.spendRate : -1) - (isFinite(x.spendRate) ? x.spendRate : -1));
    const el = document.getElementById(elId);
    el.innerHTML = `<thead><tr><th>${dimName}</th><th>目标花费</th><th>实际花费</th><th>花费完成率</th><th>目标TACOS</th><th>实际TACOS</th><th>费比完成率</th></tr></thead><tbody>` +
      arr.map(x => `<tr>
        <td class="dim">${x.name}</td>
        <td>${F.money(x.tgtSp)}</td><td>${F.money(x.actSp)}</td>
        <td>${rateCell(x.spendRate)}</td>
        <td>${F.pct(x.tt)}</td><td>${F.pct(x.at)}</td>
        <td>${isFinite(x.tacosRate) ? (x.tacosRate >= 1 ? `<span class="tag tag-green">${F.pct(x.tacosRate)}</span>` : `<span class="tag tag-red">${F.pct(x.tacosRate)}</span>`) : '—'}</td>
      </tr>`).join('') + '</tbody>';
  }
  function rateCell(v) {
    if (!isFinite(v)) return '—';
    const w = Math.min(v * 100, 100).toFixed(0);
    const cls = v > 1.05 ? 'warn' : v >= 0.8 ? 'good' : '';
    return `<div class="prog-wrap" style="min-width:110px"><div class="prog"><i class="${cls}" style="width:${w}%"></i></div><span style="font-size:11px">${F.pct(v)}</span></div>`;
  }

  /* ----- 近14天 ----- */
  function render14d(effEnd, ds) {
    const start = D.addDays(effEnd, -13);
    const s2 = start < MIN_D ? MIN_D : start;
    document.getElementById('d14-label').textContent = `${s2} ~ ${effEnd}`;
    const rows = filterDaily(s2, effEnd, ds);
    const m = new Map();
    rows.forEach(r => {
      const k = r[I.d];
      const o = m.get(k) || { sales: 0, adsp: 0 };
      o.sales += r[I.sales]; o.adsp += r[I.adsp];
      m.set(k, o);
    });
    const xs = [];
    let d = s2;
    while (d <= effEnd) { xs.push(d); d = D.addDays(d, 1); }
    const sp = [], tc = [];
    xs.forEach(x => {
      const di = dates.indexOf(x);
      const v = di >= 0 ? m.get(di) : null;
      sp.push(v ? +v.adsp.toFixed(0) : 0);
      tc.push(v && v.sales > 0 ? +(v.adsp / v.sales).toFixed(4) : null);
    });
    ch14d.setOption(CH.base({
      tooltip: {
        trigger: 'axis', confine: true,
        formatter: ps => {
          let s = ps[0] ? ps[0].name : '';
          ps.forEach(p => { s += `<br/>${p.marker}${p.seriesName}：<b>${p.seriesName === 'TACOS' ? F.pct(p.value) : F.money(p.value)}</b>`; });
          return s;
        },
      },
      legend: { top: 0, data: ['广告花费', 'TACOS'] },
      grid: { left: 10, right: 44, top: 42, bottom: 10, containLabel: true },
      xAxis: Object.assign({ type: 'category', data: xs.map(x => x.slice(5)) }, CH.axis()),
      yAxis: [
        CH.vAxis(v => '$' + (v >= 1000 ? (v / 1000) + 'k' : v)),
        Object.assign(CH.vAxis(v => (v * 100).toFixed(1) + '%'), { splitLine: { show: false } }),
      ],
      series: [
        { name: '广告花费', type: 'bar', data: sp, barMaxWidth: 26, itemStyle: { borderRadius: [5, 5, 0, 0], color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#6d8bfa' }, { offset: 1, color: '#4f6ef7' }] } } },
        { name: 'TACOS', type: 'line', yAxisIndex: 1, data: tc, connectNulls: true, smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2.5, color: '#f59e0b' }, itemStyle: { color: '#f59e0b' },
          label: { show: true, fontSize: 10, color: '#f59e0b', formatter: p => p.value == null ? '' : (p.value * 100).toFixed(1) + '%' } },
      ],
    }), true);
  }

  /* ----- 归因 ----- */
  function renderAttribution(mS, mE, ds, tgt, act, tgtTacos, actTacos, timeProg, spendRate) {
    // 上一同长度周期（紧邻所选范围之前）
    const lenDays = Math.round((new Date(mE) - new Date(mS)) / 86400000) + 1;
    const pE = D.addDays(mS, -1);
    const pS0 = D.addDays(pE, -(lenDays - 1));
    const pS = pS0 < MIN_D ? MIN_D : pS0;
    const hasPrev = pE >= MIN_D;
    const prev = hasPrev ? sumD(filterDaily(pS, pE, ds)) : sumD([]);

    function metrics(t) {
      return {
        '广告花费': { v: t.adsp, fmt: F.money, goodUp: null },
        '总销售额': { v: t.sales, fmt: F.money, goodUp: true },
        '广告销售额': { v: t.adsa, fmt: F.money, goodUp: true },
        'TACOS': { v: t.sales > 0 ? t.adsp / t.sales : NaN, fmt: F.pct, goodUp: false, pp: true },
        'ACOS': { v: t.adsa > 0 ? t.adsp / t.adsa : NaN, fmt: F.pct, goodUp: false, pp: true },
        'CPC': { v: t.clk > 0 ? t.adsp / t.clk : NaN, fmt: x => isFinite(x) ? '$' + x.toFixed(2) : '—', goodUp: false },
        'CTR': { v: t.imp > 0 ? t.clk / t.imp : NaN, fmt: x => F.pct(x, 2), goodUp: true, pp: true },
        '广告转化率 CVR': { v: t.clk > 0 ? t.adod / t.clk : NaN, fmt: F.pct, goodUp: true, pp: true },
        '点击量': { v: t.clk, fmt: x => F.num(x), goodUp: true },
        '广告客单价': { v: t.adod > 0 ? t.adsa / t.adod : NaN, fmt: x => isFinite(x) ? '$' + x.toFixed(2) : '—', goodUp: true },
      };
    }
    const cm = metrics(act), pm = metrics(prev);
    const el = document.getElementById('tbl-attr');
    el.innerHTML = `<thead><tr><th>指标</th><th>本期（${mS} ~ ${mE}）</th><th>上期（${hasPrev ? pS + ' ~ ' + pE : '无数据'}）</th><th>变化</th></tr></thead><tbody>` +
      Object.keys(cm).map(k => {
        const c = cm[k], p = pm[k];
        let deltaHtml = '—';
        if (isFinite(c.v) && isFinite(p.v) && p.v !== 0) {
          let d, txt;
          if (c.pp) { d = c.v - p.v; txt = (d > 0 ? '+' : '') + (d * 100).toFixed(1) + 'pp'; }
          else { d = c.v / p.v - 1; txt = (d > 0 ? '+' : '') + (d * 100).toFixed(1) + '%'; }
          let cls = 'delta-flat';
          if (Math.abs(d) > 0.002) {
            if (c.goodUp === null) cls = 'delta-flat';
            else if ((d > 0) === c.goodUp) cls = 'delta-down'; // 有利=绿
            else cls = 'delta-up'; // 不利=红
          }
          deltaHtml = `<span class="${cls}"><b>${d > 0 ? '▲' : d < 0 ? '▼' : '—'} ${txt}</b></span>`;
        }
        return `<tr><td class="dim">${k}</td><td>${c.fmt(c.v)}</td><td>${p.fmt(p.v)}</td><td>${deltaHtml}</td></tr>`;
      }).join('') + '</tbody>';

    // 归因解读
    const gap = tgt.tp - act.adsp;
    const cpcC = cm['CPC'].v, cpcP = pm['CPC'].v;
    const cvrC = cm['广告转化率 CVR'].v, cvrP = pm['广告转化率 CVR'].v;
    const clkC = cm['点击量'].v, clkP = pm['点击量'].v;
    const items = [];

    items.push({
      ico: '📊', bg: '#eef1fe', tit: `花费差距：${gap >= 0 ? '尚有 ' + F.money(gap) + ' 未投出' : '已超出目标 ' + F.money(-gap)}`,
      txt: `花费完成率 ${F.pct(spendRate)} vs 时间进度 ${F.pct(timeProg)}。${spendRate < timeProg - 0.03 ? '投放节奏偏慢，主要受预算释放不足或竞价保守影响，需检查预算是否提前触顶、核心词竞价是否过低。' : spendRate > timeProg + 0.03 ? '投放节奏偏快，若月底前维持当前日花费将超出目标，需关注低效活动的预算回收。' : '花费节奏与时间进度基本匹配。'}`,
    });
    if (isFinite(cpcC) && isFinite(cpcP)) {
      const d = cpcC / cpcP - 1;
      items.push({
        ico: '🖱️', bg: '#fef3c7', tit: `CPC ${d > 0.02 ? '上涨' : d < -0.02 ? '下降' : '稳定'}：$${cpcP.toFixed(2)} → $${cpcC.toFixed(2)}（${F.signPct(d)}）`,
        txt: d > 0.02 ? 'CPC 上升推高花费、抬升费比。同等预算下点击减少，需甄别是竞争加剧还是竞价过高，可对高 CPC 低产出词降价。' : d < -0.02 ? 'CPC 下降利于费比改善，同预算可获取更多点击，可将节省预算投向优质词扩量。' : 'CPC 保持稳定，对差距影响有限。',
      });
    }
    if (isFinite(cvrC) && isFinite(cvrP)) {
      const d = cvrC - cvrP;
      items.push({
        ico: '🔄', bg: '#e6faf6', tit: `转化率 ${d > 0.002 ? '提升' : d < -0.002 ? '下滑' : '持平'}：${F.pct(cvrP)} → ${F.pct(cvrC)}`,
        txt: d < -0.002 ? '转化率下滑是费比恶化的核心因素之一：同样点击带来更少订单。优先检查价格竞争力、Listing 评分变化、库存状态与差评。' : d > 0.002 ? '转化率提升摊薄了单位获客成本，是费比改善的正向因素，可顺势加大投放。' : '转化率基本稳定。',
      });
    }
    if (isFinite(clkC) && isFinite(clkP) && clkP > 0) {
      const d = clkC / clkP - 1;
      items.push({
        ico: '👆', bg: '#f3eefe', tit: `流量（点击）${d > 0.02 ? '增长' : d < -0.02 ? '收缩' : '持平'}：${F.num(clkP)} → ${F.num(clkC)}（${F.signPct(d)}）`,
        txt: d < -0.02 ? '点击量收缩直接拖累广告花费投出与销售产出，检查预算触顶时段、广告位竞得率及关键词覆盖是否收窄。' : d > 0.02 ? '点击量增长带动花费投出，若转化率同步稳定则花费完成率将持续提升。' : '流量规模变化不大。',
      });
    }
    document.getElementById('attr-advice').innerHTML = items.map(it =>
      `<div class="advice-item"><div class="a-ico" style="background:${it.bg}">${it.ico}</div>
      <div><div class="a-tit">${it.tit}</div><div class="a-txt">${it.txt}</div></div></div>`).join('');
  }

  /* ----- 模块5 建议 ----- */
  function renderAdvice(spendRate, tacosRate, timeProg, dev, tgtTacos, actTacos, act, tgt) {
    const items = [];
    if (!isFinite(spendRate)) {
      items.push({ ico: 'ℹ️', bg: '#e0f2fe', tit: '暂无目标数据', txt: '当前筛选范围内未匹配到月度目标，请调整筛选条件（目标数据覆盖 2026 年 4–7 月）。' });
    } else if (dev < -0.05) {
      items.push({
        ico: '⏩', bg: '#e0f2fe', tit: '花费投放提速',
        txt: `花费完成率 ${F.pct(spendRate)} 落后时间进度 ${F.pct(timeProg)} 约 ${F.pct(Math.abs(dev))}。建议：① 核查每日预算是否提前触顶，触顶活动加预算 20%~30%；② 对优质词提高竞价抢量；③ 补充新词/新活动扩大覆盖，优先投向费比完成率高的类目与国家。`,
      });
    } else if (dev > 0.05) {
      items.push({
        ico: '🛑', bg: '#fee2e2', tit: '控制投放节奏',
        txt: `花费完成率 ${F.pct(spendRate)} 超前时间进度 ${F.pct(Math.abs(dev))}，按当前日均花费月底将超支约 ${F.money(Math.max(act.adsp / Math.max(timeProg, 0.01) - tgt.tp, 0))}。建议对 ACoS 高于基准的活动下调预算与竞价，回收低效花费，保住月度费比目标。`,
      });
    } else {
      items.push({ ico: '✅', bg: '#d1fae5', tit: '投放节奏健康', txt: `花费完成率与时间进度偏差仅 ${F.signPct(dev)}，保持当前投放节奏即可，重点转向结构性优化（词级调价、时段分配）。` });
    }
    if (isFinite(tacosRate)) {
      if (tacosRate < 0.85) {
        items.push({
          ico: '🚨', bg: '#fee2e2', tit: '费比明显超标，优先控费',
          txt: `实际 TACOS ${F.pct(actTacos)} 显著高于目标 ${F.pct(tgtTacos)}（完成率 ${F.pct(tacosRate)}）。行动：① 立即暂停零转化高花费词；② 高 ACoS 词按“1 − 目标/实际”幅度降竞价；③ 自然流量占比过低的 SKU 排查 Listing 权重，广告依赖度过高需做站外/秒杀拉自然单。`,
        });
      } else if (tacosRate < 1) {
        items.push({
          ico: '⚠️', bg: '#fef3c7', tit: '费比小幅超标，结构调优',
          txt: `实际 TACOS ${F.pct(actTacos)} 略高于目标 ${F.pct(tgtTacos)}。差距不大，通过词级精细化即可收敛：压缩广泛匹配低效流量、优化否定词库、把预算向费比达标的类目/国家倾斜。`,
        });
      } else {
        items.push({
          ico: '🏆', bg: '#d1fae5', tit: '费比达标，可适度放量',
          txt: `实际 TACOS ${F.pct(actTacos)} 优于目标 ${F.pct(tgtTacos)}，有 ${F.pct(Math.max(tacosRate - 1, 0))} 的余量。在守住费比红线的前提下，可对优质词与达标类目增加预算，换取更高的销售规模与自然位权重。`,
        });
      }
    }
    items.push({
      ico: '📅', bg: '#eef1fe', tit: '月末冲刺机制',
      txt: '建议每周一复盘各负责人花费/费比完成率排行（见模块二），落后者提交改进计划；月末最后一周锁定预算分配，避免为冲花费完成率而牺牲费比。',
    });
    document.getElementById('advice-list').innerHTML = items.map(it =>
      `<div class="advice-item"><div class="a-ico" style="background:${it.bg}">${it.ico}</div>
      <div><div class="a-tit">${it.tit}</div><div class="a-txt">${it.txt}</div></div></div>`).join('');
  }

  renderAll();
})();
