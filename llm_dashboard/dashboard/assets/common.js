/* ================= 公共工具 & 筛选组件 ================= */
(function (global) {
  'use strict';

  /* ---------- 格式化 ---------- */
  const F = {
    num(v, d = 0) {
      if (v == null || isNaN(v) || !isFinite(v)) return '—';
      return Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    },
    money(v, d) {
      if (v == null || isNaN(v) || !isFinite(v)) return '—';
      const abs = Math.abs(v);
      if (d == null) d = abs >= 1000 ? 0 : 2;
      return '$' + F.num(v, d);
    },
    moneyK(v) {
      if (v == null || isNaN(v)) return '—';
      if (Math.abs(v) >= 10000) return '$' + F.num(v / 1000, 1) + 'k';
      return F.money(v);
    },
    pct(v, d = 1) {
      if (v == null || isNaN(v) || !isFinite(v)) return '—';
      return (v * 100).toFixed(d) + '%';
    },
    signPct(v, d = 1) {
      if (v == null || isNaN(v) || !isFinite(v)) return '—';
      return (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%';
    },
  };

  /* ---------- 日期工具 ---------- */
  const D = {
    parse(s) { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); },
    fmt(dt) {
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return dt.getFullYear() + '-' + m + '-' + d;
    },
    addDays(s, n) { const dt = D.parse(s); dt.setDate(dt.getDate() + n); return D.fmt(dt); },
    diffDays(a, b) { return Math.round((D.parse(b) - D.parse(a)) / 86400000); },
  };

  /* ---------- 多选下拉 ---------- */
  class MultiSelect {
    /**
     * @param {HTMLElement} host  容器
     * @param {Object} opt {label, options:[], selected:Set|null(=全选), searchable, onChange}
     */
    constructor(host, opt) {
      this.host = host;
      this.opt = opt;
      this.options = opt.options.slice();
      this.selected = new Set(); // 空 = 全部
      this.build();
    }
    build() {
      const el = document.createElement('div');
      el.className = 'msel';
      el.innerHTML =
        '<button type="button" class="msel-btn">全部</button>' +
        '<div class="msel-panel">' +
        (this.opt.searchable ? '<input class="msel-search" placeholder="搜索..." />' : '') +
        '<div class="msel-tools"><a data-act="all">全选</a><a data-act="clear">清空</a></div>' +
        '<div class="msel-list"></div></div>';
      this.host.appendChild(el);
      this.el = el;
      this.btn = el.querySelector('.msel-btn');
      this.list = el.querySelector('.msel-list');
      this.renderList();
      this.btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.msel.open').forEach(m => { if (m !== el) m.classList.remove('open'); });
        el.classList.toggle('open');
      });
      el.querySelector('.msel-panel').addEventListener('click', e => e.stopPropagation());
      el.querySelector('[data-act="all"]').addEventListener('click', () => { this.selected.clear(); this.sync(); });
      el.querySelector('[data-act="clear"]').addEventListener('click', () => {
        this.selected = new Set(['\u0000__none__']); this.sync();
      });
      const si = el.querySelector('.msel-search');
      if (si) si.addEventListener('input', () => this.renderList(si.value.trim().toLowerCase()));
      document.addEventListener('click', () => el.classList.remove('open'));
    }
    renderList(kw) {
      this.list.innerHTML = '';
      const frag = document.createDocumentFragment();
      this.options.forEach(v => {
        if (kw && String(v).toLowerCase().indexOf(kw) < 0) return;
        const lab = document.createElement('label');
        lab.className = 'msel-opt';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = this.isSel(v);
        cb.addEventListener('change', () => {
          if (this.selected.has('\u0000__none__')) this.selected.delete('\u0000__none__');
          if (this.selected.size === 0) { // 之前是全选状态 → 只选当前
            this.selected = new Set([v]);
          } else if (cb.checked) {
            this.selected.add(v);
          } else {
            this.selected.delete(v);
            if (this.selected.size === 0) this.selected.add('\u0000__none__'); // 全部取消 = 未选择
          }
          if (this.selected.size === this.options.length) this.selected.clear(); // 全选=全部
          this.sync();
        });
        const sp = document.createElement('span');
        sp.textContent = v;
        lab.appendChild(cb); lab.appendChild(sp);
        frag.appendChild(lab);
      });
      this.list.appendChild(frag);
    }
    isSel(v) {
      if (this.selected.has('\u0000__none__')) return false;
      return this.selected.size === 0 || this.selected.has(v);
    }
    sync() {
      const none = this.selected.has('\u0000__none__');
      const n = none ? 0 : (this.selected.size === 0 ? this.options.length : this.selected.size);
      this.btn.textContent = none ? '未选择' :
        (this.selected.size === 0 ? '全部' :
          (n <= 2 ? Array.from(this.selected).join(', ') : '已选 ' + n + ' 项'));
      this.renderList(this.el.querySelector('.msel-search') ? this.el.querySelector('.msel-search').value.trim().toLowerCase() : undefined);
      if (this.opt.onChange) this.opt.onChange();
    }
    /** 返回 null 表示不过滤(全部)；返回 Set 表示选中集合 */
    value() {
      if (this.selected.has('\u0000__none__')) return new Set();
      return this.selected.size === 0 ? null : this.selected;
    }
  }

  /* ---------- 日期范围控件 ---------- */
  class DateRange {
    /**
     * @param {HTMLElement} host
     * @param {Object} opt {min, max, presets, def, onChange}
     * presets: ['7','14','30','tm','lm','all']
     */
    constructor(host, opt) {
      this.host = host; this.opt = opt;
      this.min = opt.min; this.max = opt.max;
      const P = { '7': '近7天', '14': '近14天', '30': '近30天', 'tm': '本月', 'lm': '上月', 'all': '全部' };
      const seg = document.createElement('div');
      seg.className = 'seg';
      (opt.presets || ['7', '14', '30', 'tm', 'lm', 'all']).forEach(k => {
        const b = document.createElement('button');
        b.textContent = P[k]; b.dataset.k = k;
        b.addEventListener('click', () => this.setPreset(k));
        seg.appendChild(b);
      });
      const di = document.createElement('div');
      di.className = 'date-inputs';
      di.innerHTML = '<input type="date" class="d-start"><span style="color:#9ca3af">~</span><input type="date" class="d-end">';
      this.host.appendChild(seg);
      this.host.appendChild(di);
      this.seg = seg;
      this.s = di.querySelector('.d-start');
      this.e = di.querySelector('.d-end');
      this.s.min = this.e.min = this.min; this.s.max = this.e.max = this.max;
      [this.s, this.e].forEach(inp => inp.addEventListener('change', () => {
        if (this.s.value && this.e.value && this.s.value > this.e.value) {
          if (inp === this.s) this.e.value = this.s.value; else this.s.value = this.e.value;
        }
        this.mark(null);
        if (this.opt.onChange) this.opt.onChange();
      }));
      this.setPreset(opt.def || '7', true);
    }
    setPreset(k, silent) {
      const max = this.max, min = this.min;
      let s, e;
      if (k === 'all') { s = min; e = max; }
      else if (k === 'tm') { e = max; s = max.slice(0, 8) + '01'; }
      else if (k === 'lm') {
        const dt = D.parse(max.slice(0, 8) + '01'); dt.setDate(0);
        e = D.fmt(dt); s = e.slice(0, 8) + '01';
        if (e < min) { s = min; }
        if (s < min) s = min;
      } else { e = max; s = D.addDays(max, -(+k) + 1); if (s < min) s = min; }
      this.s.value = s; this.e.value = e;
      this.mark(k);
      if (!silent && this.opt.onChange) this.opt.onChange();
    }
    mark(k) {
      this.seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    }
    value() { return [this.s.value || this.min, this.e.value || this.max]; }
  }

  /* ---------- ECharts 主题基础 ---------- */
  const CH = {
    colors: ['#4f6ef7', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981', '#06b6d4', '#f97316', '#ec4899', '#84cc16'],
    base(extra) {
      return Object.assign({
        color: CH.colors,
        textStyle: { fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif', color: '#374151' },
        grid: { left: 10, right: 14, top: 42, bottom: 10, containLabel: true },
        tooltip: {
          trigger: 'axis', backgroundColor: 'rgba(255,255,255,.96)',
          borderColor: '#e5e9f2', textStyle: { color: '#1f2937', fontSize: 12 },
          confine: true, axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(79,110,247,.06)' } },
        },
        legend: { top: 0, left: 0, itemWidth: 14, itemHeight: 9, textStyle: { fontSize: 12, color: '#6b7280' } },
      }, extra || {});
    },
    axis(rotate) {
      return {
        axisLine: { lineStyle: { color: '#e5e9f2' } },
        axisTick: { show: false },
        axisLabel: { color: '#6b7280', fontSize: 11, rotate: rotate || 0, hideOverlap: true },
      };
    },
    vAxis(fmt) {
      return {
        type: 'value',
        splitLine: { lineStyle: { color: '#f0f2f8' } },
        axisLabel: { color: '#6b7280', fontSize: 11, formatter: fmt },
      };
    },
  };

  const charts = [];
  function makeChart(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const c = echarts.init(el);
    charts.push(c);
    return c;
  }
  let rsT;
  window.addEventListener('resize', () => {
    clearTimeout(rsT);
    rsT = setTimeout(() => charts.forEach(c => c.resize()), 150);
  });

  /* ---------- 聚合工具 ---------- */
  function groupSum(rows, keyFn, fields) {
    // fields: {name: idx}
    const map = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      let o = map.get(k);
      if (!o) { o = { key: k }; for (const f in fields) o[f] = 0; map.set(k, o); }
      for (const f in fields) o[f] += r[fields[f]];
    }
    return map;
  }

  global.U = { F, D, MultiSelect, DateRange, CH, makeChart, groupSum };
})(window);
