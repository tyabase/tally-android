/* ==========================================================================
   数据层 —— 账目 / 账户 / 预算 / 区间统计 / 持久化

   本文件不含任何预置账目：首次启动就是一本空账本，界面上出现的每一个数字
   都由用户自己录入的数据推导。schema 版本号用于在升级时丢弃旧格式数据。
   ========================================================================== */
(function (w) {
  'use strict';

  var SCHEMA = 2;
  var KEY = 'tally_state_v2';
  var LEGACY_BROWSER_KEY = 'tally_state_v1';

  /* 分类固定为这几种；账户才是用户可增删的。
     注意这里只保留 icon —— 分类不再靠颜色区分，改由图形承担识别，
     颜色让位给「收入 / 超额」这两个真正需要被一眼看到的语义。 */
  var CATS = {
    '餐饮': { icon: 'fork'   },
    '交通': { icon: 'bus'    },
    '购物': { icon: 'bag'    },
    '娱乐': { icon: 'game'   },
    '居住': { icon: 'house'  },
    '医疗': { icon: 'heart'  },
    '学习': { icon: 'book'   },
    '收入': { icon: 'income' },
    '更多': { icon: 'dots'   }
  };

  var CAT_LEDGER = ['餐饮', '交通', '购物', '娱乐', '居住', '医疗', '学习'];

  /* 分类占比用的单色明度阶梯。黑白体系里区分靠明度而不是色相，
     所以这里给的是由深到浅的五档灰，而不是五个彩色。 */
  var MONO_RAMP = ['#0A0A0B', '#4A4A4E', '#8E8E93', '#C7C7CC', '#E4E4E8'];

  /* 账户是「配置」不是「账目」，给三个最常用的做默认值，用户可随意增删 */
  var DEFAULT_ACCOUNTS = ['现金', '微信', '支付宝'];

  /* ---------------------------------------------------------------- 工具 */
  function pad2(v) { return v < 10 ? '0' + v : '' + v; }
  function round2(n) { return Math.round(n * 100) / 100; }

  function todayISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /* 构造一个「只有年月日」的本地日期，避开 UTC 偏移 */
  function isoOf(y, m, d) {
    var last = new Date(y, m, 0).getDate();
    var dd = Math.min(Math.max(1, d), last);
    return y + '-' + pad2(m) + '-' + pad2(dd);
  }
  function shiftDays(iso, delta) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + delta);
    return todayISO(d);
  }
  function monthKeyOf(iso) { return iso.slice(0, 7); }

  function fmt(n, dec) {
    dec = dec === undefined ? 2 : dec;
    var neg = n < 0;
    var s = Math.abs(n).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + s;
  }
  function money(n) { return '¥' + fmt(n); }
  function signed(n) { return (n < 0 ? '-' : '+') + '¥' + fmt(Math.abs(n)); }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

  function monthLabel(mk) {
    var p = mk.split('-');
    return p[0] + '年' + (+p[1]) + '月';
  }

  var WEEK_CN = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
  function weekLabel(iso) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return WEEK_CN[(d.getDay() + 6) % 7];
  }

  /* 日期分组标签：今天 / 昨天 / 更早 */
  function dayLabel(dateISO) {
    var today = todayISO();
    var yISO = shiftDays(today, -1);
    var p = dateISO.split('-');
    var md = (+p[1]) + '月' + (+p[2]) + '日';
    if (dateISO === today) return '今天 · ' + md;
    if (dateISO === yISO) return '昨天 · ' + md;
    return weekLabel(dateISO) + ' · ' + md;
  }

  /* ---------------------------------------------------------------- 状态 */
  function blank() {
    return {
      schema: SCHEMA,
      txs: [],
      accounts: DEFAULT_ACCOUNTS.slice(),
      budgets: { total: 0, cats: {} },
      nickname: '',
      activeCat: '餐饮',
      lastAccount: DEFAULT_ACCOUNTS[0],
      lastNote: ''
    };
  }

  var state = blank();

  /* 始终原地改写同一个对象，绝不让 state 换引用 ——
     外部模块（Views / App）持有的是它的引用，换掉会读到旧副本。 */
  function assign(src) {
    state.txs = src.txs || [];
    state.accounts = src.accounts || DEFAULT_ACCOUNTS.slice();
    state.budgets = src.budgets || { total: 0, cats: {} };
    state.nickname = src.nickname || '';
    state.activeCat = CATS[src.activeCat] ? src.activeCat : '餐饮';
    state.lastAccount = state.accounts.indexOf(src.lastAccount) >= 0
      ? src.lastAccount : state.accounts[0];
    state.lastNote = src.lastNote || '';
    sortTxs();
    return state;
  }

  function hasNative() {
    return !!(w.NativeBridge && typeof w.NativeBridge.getData === 'function');
  }

  function load() {
    var raw = null;
    try {
      if (hasNative()) raw = w.NativeBridge.getData();
      else {
        raw = w.localStorage.getItem(KEY);
        try { w.localStorage.removeItem(LEGACY_BROWSER_KEY); } catch (e2) { /* noop */ }
      }
    } catch (e) { raw = null; }

    if (raw) {
      try {
        var s = JSON.parse(raw);
        /* schema 不一致 → 视为旧版本数据，直接丢弃重来（旧版本存的是演示账目） */
        if (s && s.schema === SCHEMA) {
          assign({
            txs: Array.isArray(s.txs) ? s.txs.filter(validTx) : [],
            accounts: (Array.isArray(s.accounts) && s.accounts.length)
              ? s.accounts : DEFAULT_ACCOUNTS.slice(),
            budgets: {
              total: Number(s.budgets && s.budgets.total) || 0,
              cats: (s.budgets && s.budgets.cats && typeof s.budgets.cats === 'object')
                ? s.budgets.cats : {}
            },
            nickname: typeof s.nickname === 'string' ? s.nickname : '',
            activeCat: s.activeCat,
            lastAccount: s.lastAccount,
            lastNote: typeof s.lastNote === 'string' ? s.lastNote : ''
          });
          return false;
        }
      } catch (e) { /* 损坏则按空账本启动 */ }
    }

    assign(blank());
    save();
    return true;
  }

  function validTx(t) {
    return t && typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
      isFinite(Number(t.amount));
  }

  var saveTimer = null;
  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      flush();
    }, 60);
  }
  /* 立即落盘（退出应用等场景用） */
  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    var raw = JSON.stringify(state);
    try {
      if (hasNative()) w.NativeBridge.saveData(raw);
      else w.localStorage.setItem(KEY, raw);
    } catch (e) { /* 忽略写入失败 */ }
  }

  function sortTxs() {
    state.txs.sort(function (a, b) {
      var ka = a.date + (a.time || '');
      var kb = b.date + (b.time || '');
      return kb.localeCompare(ka);
    });
  }

  /* -------------------------------------------------------------- 账目读写 */
  function uid() {
    return 'tx' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function addTx(tx) {
    tx.id = uid();
    tx.kind = tx.kind === 'income' ? 'income' : 'expense';
    tx.amount = round2(Math.abs(Number(tx.amount) || 0));
    tx.note = (tx.note || '').slice(0, 30);
    state.txs.push(tx);
    sortTxs();
    save();
    return tx;
  }

  function byId(id) {
    for (var i = 0; i < state.txs.length; i++) if (state.txs[i].id === id) return state.txs[i];
    return null;
  }

  function updateTx(id, patch) {
    var t = byId(id);
    if (!t) return null;
    Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
    t.amount = round2(Math.abs(Number(t.amount) || 0));
    t.note = (t.note || '').slice(0, 30);
    sortTxs();
    save();
    return t;
  }

  function removeTx(id) {
    state.txs = state.txs.filter(function (t) { return t.id !== id; });
    save();
  }

  function clearAll() {
    assign(blank());
    if (hasNative() && typeof w.NativeBridge.clearData === 'function') {
      try { w.NativeBridge.clearData(); } catch (e) { /* noop */ }
    }
    save();
  }

  function titleOf(t) {
    if (t.note && t.note.trim()) return t.note.trim();
    if (t.kind === 'income') return '一笔收入';
    return (t.cat || '其他') + '支出';
  }

  /* ---------------------------------------------------------------- 账户 */
  function addAccount(name) {
    name = String(name || '').trim().slice(0, 12);
    if (!name) return null;
    if (state.accounts.indexOf(name) >= 0) return name;
    state.accounts.push(name);
    save();
    return name;
  }
  function renameAccount(from, to) {
    to = String(to || '').trim().slice(0, 12);
    if (!to || from === to) return false;
    var i = state.accounts.indexOf(from);
    if (i < 0) return false;
    if (state.accounts.indexOf(to) >= 0) return false;
    state.accounts[i] = to;
    state.txs.forEach(function (t) { if (t.account === from) t.account = to; });
    if (state.lastAccount === from) state.lastAccount = to;
    save();
    return true;
  }
  function removeAccount(name) {
    if (state.accounts.length <= 1) return false;
    state.accounts = state.accounts.filter(function (a) { return a !== name; });
    var fallback = state.accounts[0];
    state.txs.forEach(function (t) { if (t.account === name) t.account = fallback; });
    if (state.lastAccount === name) state.lastAccount = fallback;
    save();
    return true;
  }

  /* ---------------------------------------------------------------- 区间 */
  function txsBetween(startISO, endISO) {
    return state.txs.filter(function (t) {
      return t.date >= startISO && t.date <= endISO;
    });
  }

  function aggregate(list) {
    var expense = 0, income = 0, expCount = 0;
    list.forEach(function (t) {
      if (t.kind === 'income') income += t.amount;
      else { expense += t.amount; expCount++; }
    });
    return {
      expense: round2(expense),
      income: round2(income),
      balance: round2(income - expense),
      count: list.length,
      expCount: expCount
    };
  }

  function scopeOf(mode) {
    var today = todayISO();
    var p = today.split('-');
    var y = +p[0], m = +p[1];

    if (mode === 'week') {
      var dow = (new Date(y, m - 1, +p[2]).getDay() + 6) % 7;   // 0 = 周一
      var start = shiftDays(today, -dow);
      return {
        mode: 'week', start: start, end: today,
        days: dow + 1,
        prevStart: shiftDays(start, -7), prevEnd: shiftDays(start, -1),
        label: '本周', subLabel: scopeLabel(start, today)
      };
    }

    if (mode === 'year') {
      var yStart = y + '-01-01';
      var pStart = (y - 1) + '-01-01';
      var pEnd = isoOf(y - 1, m, +p[2]);
      var dayOfYear = Math.round((new Date(y, m - 1, +p[2]) - new Date(y, 0, 1)) / 86400000) + 1;
      return {
        mode: 'year', start: yStart, end: today,
        days: dayOfYear,
        prevStart: pStart, prevEnd: pEnd,
        label: '本年', subLabel: y + '年'
      };
    }

    var mStart = y + '-' + pad2(m) + '-01';
    var py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    var pStart2 = py + '-' + pad2(pm) + '-01';
    var pEnd2 = isoOf(py, pm, +p[2]);
    return {
      mode: 'month', start: mStart, end: today,
      days: +p[2],
      prevStart: pStart2, prevEnd: pEnd2,
      label: '本月', subLabel: monthLabel(y + '-' + pad2(m))
    };
  }

  function scopeLabel(a, b) {
    var pa = a.split('-'), pb = b.split('-');
    if (pa[0] === pb[0] && pa[1] === pb[1]) return (+pa[1]) + '月' + (+pa[2]) + '–' + (+pb[2]) + '日';
    return (+pa[1]) + '月' + (+pa[2]) + '日 – ' + (+pb[1]) + '月' + (+pb[2]) + '日';
  }

  /* 某个区间（周/月/年）的汇总 + 环比 */
  function rangeSummary(mode) {
    var sc = scopeOf(mode);
    var cur = aggregate(txsBetween(sc.start, sc.end));
    var prev = aggregate(txsBetween(sc.prevStart, sc.prevEnd));

    cur.days = sc.days;
    cur.dailyAvg = sc.days > 0 ? cur.expense / sc.days : 0;
    cur.delta = prev.expense > 0 ? (cur.expense - prev.expense) / prev.expense : null;
    cur.scope = sc;
    return cur;
  }

  /* 图表数据：不同区间给不同的横轴分组 */
  function chartSeries(mode) {
    if (mode === 'year') {
      var y = +todayISO().slice(0, 4);
      var out = [];
      for (var mm = 1; mm <= 12; mm++) {
        var mk = y + '-' + pad2(mm);
        var sum = 0;
        state.txs.forEach(function (t) {
          if (t.kind !== 'income' && monthKeyOf(t.date) === mk) sum += t.amount;
        });
        out.push({
          label: mm + '',
          value: round2(sum),
          highlight: mk === currentMonthKey()
        });
      }
      return { title: '本年各月支出', unit: '单位：元', data: out };
    }

    if (mode === 'week') {
      var today = todayISO();
      var dow = (new Date(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10)).getDay() + 6) % 7;
      var mon = shiftDays(today, -dow);
      var days = [];
      for (var i = 0; i < 7; i++) {
        var iso = shiftDays(mon, i);
        var s = 0;
        state.txs.forEach(function (t) {
          if (t.kind !== 'income' && t.date === iso) s += t.amount;
        });
        days.push({
          label: '一二三四五六日'.charAt(i),
          value: round2(s),
          future: nowISOCompare(iso) > 0,
          highlight: iso === today
        });
      }
      return { title: '本周每日支出', unit: '单位：元', data: days };
    }

    /* 月：近 7 天 */
    var today2 = todayISO();
    var arr = [];
    for (var k = 6; k >= 0; k--) {
      var d = shiftDays(today2, -k);
      var sum2 = 0;
      state.txs.forEach(function (t) {
        if (t.kind !== 'income' && t.date === d) sum2 += t.amount;
      });
      arr.push({
        label: '' + (+d.slice(8, 10)),
        value: round2(sum2),
        highlight: k === 0
      });
    }
    return { title: '近 7 天支出', unit: '单位：元', data: arr };
  }

  function nowISOCompare(iso) {
    var t = todayISO();
    return iso < t ? -1 : iso > t ? 1 : 0;
  }

  /* 分类占比：取金额前 4 名，其余归入「其他」 */
  function categoryBreakdown(startISO, endISO) {
    var map = {};
    txsBetween(startISO, endISO).forEach(function (t) {
      if (t.kind === 'income') return;
      var k = t.cat || '其他';
      map[k] = (map[k] || 0) + t.amount;
    });
    var rows = Object.keys(map).map(function (k) {
      return { name: k, amount: round2(map[k]), pct: 0 };
    }).sort(function (a, b) { return b.amount - a.amount; });

    var total = rows.reduce(function (a, r) { return a + r.amount; }, 0);
    if (rows.length > 4) {
      var rest = rows.slice(4).reduce(function (a, r) { return a + r.amount; }, 0);
      rows = rows.slice(0, 4);
      rows.push({ name: '其他', amount: round2(rest), pct: 0 });
    }
    rows.forEach(function (r) { r.pct = total > 0 ? r.amount / total : 0; });
    return { rows: rows, total: round2(total) };
  }

  /* 分类在图表里的取样色：按出现顺序从明度阶梯上取，超出就压到最深一档 */
  function catColor(name, index) {
    if (name === '其他') return MONO_RAMP[MONO_RAMP.length - 1];
    var i = typeof index === 'number' ? index : CAT_LEDGER.indexOf(name);
    if (i < 0) i = MONO_RAMP.length - 1;
    return MONO_RAMP[Math.min(i, MONO_RAMP.length - 1)];
  }

  /* 复刻 / 撤销 用到的两个小工具 */
  function lastTx() { return state.txs.length ? state.txs[0] : null; }

  /* 把一个已被删除的账单原样放回来（保留 id，撤销后引用不会错位） */
  function restoreTx(tx) {
    if (!tx || !validTx(tx)) return null;
    if (byId(tx.id)) return tx;
    state.txs.push(tx);
    sortTxs();
    save();
    return tx;
  }

  /* ------------------------------------------------------------ 按月视图 */
  function monthSummary(mk) {
    var p = mk.split('-');
    var y = +p[0], m = +p[1];
    var list = state.txs.filter(function (t) { return monthKeyOf(t.date) === mk; });
    var agg = aggregate(list);

    var now = new Date();
    var curKey = currentMonthKey();
    var elapsed, daysLeft;
    if (mk === curKey) {
      elapsed = now.getDate();
      daysLeft = Math.max(0, daysInMonth(y, m) - elapsed);
    } else if (mk < curKey) {
      elapsed = daysInMonth(y, m);
      daysLeft = 0;
    } else {
      elapsed = 0;
      daysLeft = daysInMonth(y, m);
    }

    agg.monthKey = mk;
    agg.list = list;
    agg.elapsed = elapsed;
    agg.daysLeft = daysLeft;
    agg.dailyAvg = elapsed > 0 ? agg.expense / elapsed : 0;
    agg.isCurrent = mk === curKey;
    return agg;
  }

  function currentMonthKey() { return todayISO().slice(0, 7); }

  function monthOptions() {
    var set = {};
    var cur = currentMonthKey();
    /* 最近 13 个月始终可选，用户不必先有数据才能翻月 */
    for (var i = 0; i < 13; i++) set[shiftMonth(cur, -i)] = 1;
    state.txs.forEach(function (t) { set[monthKeyOf(t.date)] = 1; });
    return Object.keys(set).sort().reverse();
  }

  function shiftMonth(mk, delta) {
    var p = mk.split('-');
    var y = +p[0], m = +p[1] + delta;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    return y + '-' + pad2(m);
  }

  /* ---------------------------------------------------------------- 预算 */
  function budgetState(mk) {
    var s = monthSummary(mk || currentMonthKey());
    var b = state.budgets;
    var total = Number(b.total) || 0;
    var pct = total > 0 ? s.expense / total : 0;

    var spent = {};
    s.list.forEach(function (t) {
      if (t.kind === 'income') return;
      spent[t.cat] = (spent[t.cat] || 0) + t.amount;
    });

    var rows = Object.keys(b.cats).map(function (name) {
      var cap = Number(b.cats[name]) || 0;
      var used = round2(spent[name] || 0);
      return {
        name: name, cap: cap, used: used,
        ratio: cap > 0 ? used / cap : 0,
        color: (CATS[name] || {}).color || 'var(--ink-3)'
      };
    });

    return {
      summary: s, total: total, used: s.expense, pct: pct,
      left: Math.max(0, total - s.expense),
      perDay: s.daysLeft > 0 ? Math.max(0, total - s.expense) / s.daysLeft : Math.max(0, total - s.expense),
      rows: rows,
      hasTotal: total > 0
    };
  }

  function setBudgetTotal(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return false;
    state.budgets.total = round2(n);
    save();
    return true;
  }

  function setCategoryBudget(name, v) {
    var n = Number(v);
    if (!name) return false;
    if (!isFinite(n) || n <= 0) {
      delete state.budgets.cats[name];
    } else {
      state.budgets.cats[name] = round2(n);
    }
    save();
    return true;
  }

  function budgetCatsAvailable() {
    return CAT_LEDGER.filter(function (c) {
      return !(c in state.budgets.cats);
    });
  }

  /* ------------------------------------------------------------ 导入导出 */
  function exportJSON() {
    return JSON.stringify({
      app: 'Tally', schema: SCHEMA,
      exportedAt: new Date().toISOString(),
      txCount: state.txs.length,
      data: state
    }, null, 2);
  }

  w.Store = {
    CATS: CATS, CAT_LEDGER: CAT_LEDGER, MONO_RAMP: MONO_RAMP,
    state: state,
    getState: function () { return state; },
    load: load, save: save, flush: flush, clearAll: clearAll,
    titleOf: titleOf, lastTx: lastTx, restoreTx: restoreTx,
    addTx: addTx, updateTx: updateTx, removeTx: removeTx, byId: byId,
    addAccount: addAccount, renameAccount: renameAccount, removeAccount: removeAccount,
    monthSummary: monthSummary, currentMonthKey: currentMonthKey,
    monthOptions: monthOptions, shiftMonth: shiftMonth,
    rangeSummary: rangeSummary, chartSeries: chartSeries, scopeOf: scopeOf,
    categoryBreakdown: categoryBreakdown,
    txsBetween: txsBetween, aggregate: aggregate,
    budgetState: budgetState, setBudgetTotal: setBudgetTotal,
    setCategoryBudget: setCategoryBudget, budgetCatsAvailable: budgetCatsAvailable,
    exportJSON: exportJSON,
    catColor: catColor,
    fmt: fmt, money: money, signed: signed, round2: round2,
    todayISO: todayISO, shiftDays: shiftDays, isoOf: isoOf, monthKeyOf: monthKeyOf,
    monthLabel: monthLabel, dayLabel: dayLabel, weekLabel: weekLabel,
    daysInMonth: daysInMonth
  };
})(window);
