/* ==========================================================================
   渲染层 —— 每个函数对应一屏

   两条纪律：
   1. 所有数字都来自用户录入的数据，没有任何写死的示例账目。
   2. 频繁变化的部分做局部更新，不做整块 innerHTML 重建 ——
      否则按一个数字键就要重建 20 个节点，动画会被反复打断。
   ========================================================================== */
(function (w) {
  'use strict';

  var S = w.Store, M = w.Motion;
  var $ = function (id) { return document.getElementById(id); };
  function setText(id, v) { var e = $(id); if (e) e.textContent = v; }
  function setHTML(id, v) { var e = $(id); if (e) e.innerHTML = v; }
  function catMeta(name) {
    return S.CATS[name] || { icon: 'dots' };
  }
  function ico(name, size, color) {
    return '<span class="ico"' + (color ? ' style="color:' + color + '"' : '') + '>' +
      w.icon(name, size) + '</span>';
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  /* 数字滚动：整屏的主金额才滚，列表里的小数字直接赋值，
     否则一屏十几个数字同时在动，眼睛会累。 */
  function countText(id, value, prefix) {
    var el = $(id);
    if (!el) return;
    M.count(el, value, function (v) { return prefix + S.fmt(v); });
  }
  function setMoney(id, v) { var e = $(id); if (e) e.textContent = S.fmt(v); }

  /* -------------------------------------------------- 空状态插画（单色） */
  function emptyArt() {
    return '<svg viewBox="0 0 120 120" width="104" height="104" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="31" y="20" width="58" height="74" rx="15" fill="#F2F2F4"/>' +
      '<rect x="24" y="30" width="60" height="76" rx="16" fill="#FFFFFF" stroke="#E6E6EA" stroke-width="2"/>' +
      '<path d="M38 52h32M38 64h32M38 76h18" stroke="#DCDCE0" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="88" cy="88" r="20" fill="#0A0A0B"/>' +
      '<path d="M88 80.4v15.2M80.4 88h15.2" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round"/>' +
      '</svg>';
  }

  function emptyBlock(title, text, cta) {
    return '<div class="empty">' +
      '<div class="empty__art">' + emptyArt() + '</div>' +
      '<div class="empty__title">' + esc(title) + '</div>' +
      '<div class="empty__text">' + esc(text) + '</div>' +
      (cta ? '<button class="empty__cta" data-nav="add">' + w.icon('plus', 19) + esc(cta) + '</button>' : '') +
      '</div>';
  }

  /* 柱状图可用高度（扣掉底部标签） */
  function barMaxPx() {
    var c = $('barChart');
    if (!c) return 96;
    return (c.clientHeight || 112) - 19;
  }

  /* ======================================================================
     01 · 首页
     ====================================================================== */
  function renderQuick() {
    var items = [
      { cat: '餐饮', icon: 'fork' },
      { cat: '交通', icon: 'car' },
      { cat: '购物', icon: 'bag' },
      { cat: '__more', icon: 'plus' }
    ];
    setHTML('quickGrid', items.map(function (it) {
      var label = it.cat === '__more' ? '更多' : it.cat;
      var attr = it.cat === '__more' ? 'data-nav="add"' : 'data-quick="' + it.cat + '"';
      return '<button class="quick__item" ' + attr + '>' +
        '<span class="quick__icon">' + ico(it.icon, 22) + '</span>' +
        '<span class="quick__label">' + label + '</span>' +
        '</button>';
    }).join(''));
  }

  function txRow(t) {
    var m = catMeta(t.kind === 'income' ? '收入' : t.cat);
    var sign = t.kind === 'income' ? '+' : '-';
    return '<div class="row pressable" data-tx="' + t.id + '">' +
      '<span class="row__icon">' + ico(m.icon, 20) + '</span>' +
      '<span class="row__text">' +
        '<span class="row__title">' + esc(S.titleOf(t)) + '</span>' +
        '<span class="row__sub">' + esc(t.time || '') + ' · ' + (t.kind === 'income' ? '收入' : esc(t.cat)) + '</span>' +
      '</span>' +
      '<span class="row__amount ' + (t.kind === 'income' ? 'c-income' : 'c-expense') + '">' +
        sign + S.money(t.amount) + '</span>' +
      '</div>';
  }

  function homeBudgetCard() {
    var b = S.budgetState();
    if (!b.hasTotal) {
      return '<section class="budget-card pressable" data-budgetset="1">' +
        '<div class="budget-card__info">' +
          '<span class="budget-card__label">本月预算</span>' +
          '<span class="budget-card__setup">还没设置预算</span>' +
          '<span class="budget-card__hint">设一个上限，超支时会提醒你</span>' +
        '</div>' +
        '<span class="budget-card__go">去设置</span>' +
        '</section>';
    }
    var over = b.pct > 1;
    return '<section class="budget-card pressable" data-budgetset="1">' +
      '<div class="budget-card__info">' +
        '<div class="budget-card__labelrow">' +
          '<span class="budget-card__label">本月预算</span>' +
          '<span class="budget-card__days">剩余 ' + b.summary.daysLeft + ' 天</span>' +
        '</div>' +
        '<div class="budget-card__amount">' + S.money(b.used) + '</div>' +
        '<div class="track track--budget"><i class="track__fill' + (over ? ' is-over' : '') +
          '" style="width:' + Math.min(1, b.pct) * 100 + '%"></i></div>' +
      '</div>' +
      '<div class="budget-card__pct">' +
        '<span class="budget-card__pct-value' + (over ? ' is-over' : '') + '">' +
          Math.round(b.pct * 100) + '%</span>' +
        '<span class="budget-card__pct-label">已用</span>' +
      '</div>' +
      '</section>';
  }

  function renderHome() {
    var mk = S.currentMonthKey();
    var s = S.monthSummary(mk);

    var h = new Date().getHours();
    var greet = h < 6 ? '凌晨好' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
    var nick = (S.state.nickname || '').trim();
    setText('greetTitle', greet + (nick ? '，' + nick : ''));

    var now = new Date();
    var todayCount = S.state.txs.filter(function (t) { return t.date === S.todayISO(); }).length;
    setText('greetSub', (now.getMonth() + 1) + '月' + now.getDate() + '日 ' + S.weekLabel(S.todayISO()) +
      ' · 今日已记 ' + todayCount + ' 笔');

    setText('heroMonth', S.monthLabel(mk));
    /* 主金额滚动到位 —— 首次进入时从 0 滚上来，是一次很值钱的第一印象 */
    countText('heroBalance', s.balance, '');
    setMoney('heroIncome', s.income);
    setMoney('heroExpense', s.expense);

    var body = $('homeBody');
    if (!body) return;

    /* 全新账本：不摆空卡片，直接给一个明确的开始入口 */
    if (!S.state.txs.length) {
      setHTML('homeBody', emptyBlock('还没有记过账',
        '点下面的按钮记第一笔，之后的统计、预算都从这里长出来', '记第一笔'));
      body.classList.add('home-body--empty');
      return;
    }
    body.classList.remove('home-body--empty');

    var recent = S.state.txs.slice(0, 3);
    setHTML('homeBody',
      '<section class="section">' +
        '<div class="section__head">' +
          '<h2 class="section__title">快捷记账</h2>' +
          '<button class="section__more pressable" data-nav="add">全部分类</button>' +
        '</div>' +
        '<div class="quick" id="quickGrid"></div>' +
      '</section>' +
      homeBudgetCard() +
      '<section class="section">' +
        '<div class="section__head">' +
          '<h2 class="section__title">最近账单</h2>' +
          '<button class="section__more pressable" data-nav="detail">查看全部</button>' +
        '</div>' +
        '<div class="list-card" id="homeRecent">' + recent.map(txRow).join('') + '</div>' +
      '</section>'
    );
    renderQuick();
    M.enter(document.querySelectorAll('#homeRecent .row'), { step: 34 });
  }

  /* ======================================================================
     02 · 记一笔（新增 / 编辑共用）
     catGrid 与 keypad 只构建一次，之后只改「哪一个是激活的」和金额文本。
     ====================================================================== */
  var addState = {
    mode: 'create', editId: null,
    kind: 'expense', cat: '餐饮', amountText: '',
    date: '', account: '', note: ''
  };
  var addBuilt = false;

  function resetAddState(tx) {
    if (tx) {
      addState.mode = 'edit';
      addState.editId = tx.id;
      addState.kind = tx.kind;
      addState.cat = tx.kind === 'income' ? (S.state.activeCat || '餐饮') : tx.cat;
      addState.amountText = Number(tx.amount).toFixed(2);
      addState.date = tx.date;
      addState.account = tx.account;
      addState.note = tx.note || '';
    } else {
      addState.mode = 'create';
      addState.editId = null;
      addState.kind = 'expense';
      addState.cat = S.state.activeCat || '餐饮';
      addState.amountText = '';
      addState.date = S.todayISO();
      addState.account = S.state.lastAccount || S.state.accounts[0];
      addState.note = '';
    }
    renderAdd();
  }

  /* 复刻：把最近一笔的金额、分类、账户、备注全部搬过来，只让你确认日期 */
  function repeatLast() {
    var last = S.lastTx();
    if (!last) return false;
    addState.mode = 'create';
    addState.editId = null;
    addState.kind = last.kind;
    addState.cat = last.kind === 'income' ? addState.cat : last.cat;
    addState.amountText = Number(last.amount).toFixed(2);
    addState.account = last.account;
    addState.note = last.note || '';
    addState.date = S.todayISO();
    renderAdd();
    return true;
  }

  function buildAdd() {
    var cats = S.CAT_LEDGER.concat(['更多']);
    setHTML('catGrid', cats.map(function (c) {
      return '<button class="cat" data-cat="' + c + '">' +
        '<span class="cat__circle">' + ico(catMeta(c).icon, 22) + '</span>' +
        '<span class="cat__label">' + c + '</span>' +
        '</button>';
    }).join(''));

    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
    setHTML('keypad', keys.map(function (k) {
      if (k === 'del') {
        return '<button class="key key--fn" data-key="del">' + ico('delete', 22) + '</button>';
      }
      return '<button class="key" data-key="' + k + '">' + k + '</button>';
    }).join(''));
    addBuilt = true;
  }

  function slideThumb(thumbId, index, count) {
    var el = $(thumbId);
    if (!el) return;
    el.style.transform = 'translate3d(' + (index * 100) + '%,0,0)';
    if (count) el.parentNode.setAttribute('data-count', count);
  }

  function amountDisplay() {
    var t = addState.amountText;
    if (!t) return '0.00';
    if (t.indexOf('.') < 0) return S.fmt(parseFloat(t));
    var parts = t.split('.');
    /* 整数位不能带小数 —— S.fmt 默认两位小数，这里必须传 0 */
    var int = parts[0] ? S.fmt(parseFloat(parts[0]), 0) : '0';
    return int + '.' + parts[1];
  }

  function relDate(iso) {
    var today = S.todayISO();
    if (iso === today) return '今天 · ' + iso;
    if (iso === S.shiftDays(today, -1)) return '昨天 · ' + iso;
    if (iso === S.shiftDays(today, -2)) return '前天 · ' + iso;
    var p = iso.split('-');
    return (+p[1]) + '月' + (+p[2]) + '日 · ' + iso;
  }

  function pad2(v) { return v < 10 ? '0' + v : '' + v; }

  function relDateTime(iso) {
    var now = new Date();
    var hm = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    var today = S.todayISO();
    if (iso === today) return '今天 ' + hm;
    if (iso === S.shiftDays(today, -1)) return '昨天 ' + hm;
    if (iso === S.shiftDays(today, -2)) return '前天 ' + hm;
    var p = iso.split('-');
    return (+p[1]) + '月' + (+p[2]) + '日 ' + hm;
  }

  function renderAdd() {
    if (!addBuilt) buildAdd();

    /* 账户可能在别处被改名或删除，渲染前先对一次账 */
    if (S.state.accounts.indexOf(addState.account) < 0) {
      addState.account = S.state.accounts[0];
    }
    var isIncome = addState.kind === 'income';
    var m = catMeta(isIncome ? '收入' : addState.cat);

    setText('addTitle', addState.mode === 'edit' ? '改一笔' : '记一笔');
    var del = $('btnDeleteTx');
    if (del) del.style.display = addState.mode === 'edit' ? '' : 'none';

    /* 分段滑块：只改 transform，不重建 DOM */
    Array.prototype.forEach.call(document.querySelectorAll('#addSegment .segment__item'), function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-kind') === addState.kind);
    });
    slideThumb('addSegThumb', isIncome ? 1 : 0);

    setHTML('addCatChip', w.icon(m.icon, 17) + '<span>' + (isIncome ? '收入' : addState.cat) + '</span>');

    /* 复刻入口只在「还没开始输入」时出现 —— 这正是它有用的时候，
       敲了第一个数字它就消失，不抢位置。 */
    var rep = $('btnRepeat');
    if (rep) {
      var canRepeat = addState.mode === 'create' && !addState.amountText && !!S.lastTx();
      rep.style.display = canRepeat ? '' : 'none';
    }

    setText('addAmount', amountDisplay());
    setText('addSub', (isIncome ? '收入' : '支出') + ' · ' + relDateTime(addState.date) + ' · ' + addState.account);

    setText('metaDate', relDate(addState.date));
    setText('metaAccount', addState.account);
    setText('metaNote', addState.note || '添加备注');

    /* 分类激活态：只切 class */
    var on0 = isIncome ? null : addState.cat;
    Array.prototype.forEach.call(document.querySelectorAll('#catGrid .cat'), function (c) {
      c.classList.toggle('is-active', c.getAttribute('data-cat') === on0);
    });
  }

  function pressKey(k) {
    if (k === 'del') {
      addState.amountText = addState.amountText.slice(0, -1);
    } else if (k === '.') {
      if (addState.amountText.indexOf('.') < 0) {
        addState.amountText = (addState.amountText || '0') + '.';
      }
    } else {
      var parts = addState.amountText.split('.');
      if (parts[1] && parts[1].length >= 2) return;      /* 最多两位小数 */
      if (!parts[1] && parts[0].length >= 7) return;     /* 整数最多七位 */
      if (addState.amountText === '0' && k !== '.') addState.amountText = k;
      else addState.amountText += k;
    }
    var p = addState.amountText.split('.');
    if (p.length === 1 && p[0] === '') addState.amountText = '';
    if (p.length === 2 && p[0] === '') addState.amountText = '0' + addState.amountText;

    setText('addAmount', amountDisplay());

    /* 一旦开始输入就收起「复刻」入口 */
    var rep = $('btnRepeat');
    if (rep && addState.amountText) rep.style.display = 'none';
  }

  function currentAmount() {
    var v = parseFloat(addState.amountText);
    return isFinite(v) ? S.round2(v) : 0;
  }

  /* ======================================================================
     03 · 账单明细
     ====================================================================== */
  var detailMonth = S.currentMonthKey();
  var detailFilter = '全部';
  var searchTerm = '';

  function getDetailMonth() { return detailMonth; }
  function setDetailMonth(mk) { detailMonth = mk; detailFilter = '全部'; }

  function matchFilter(t) {
    if (searchTerm) {
      var hay = (S.titleOf(t) + ' ' + t.cat + ' ' + t.account).toLowerCase();
      if (hay.indexOf(searchTerm.toLowerCase()) < 0) return false;
    }
    if (detailFilter === '全部') return true;
    return t.cat === detailFilter;
  }

  function filterOptions() {
    var s = S.monthSummary(detailMonth);
    var set = {};
    s.list.forEach(function (t) { if (t.kind !== 'income') set[t.cat] = 1; });
    return ['全部'].concat(Object.keys(set));
  }

  function renderChips() {
    var opts = filterOptions();
    if (opts.indexOf(detailFilter) < 0) detailFilter = '全部';
    setHTML('detailChips', opts.map(function (c) {
      return '<button class="chip' + (c === detailFilter ? ' is-active' : '') +
        '" data-chip="' + esc(c) + '">' + esc(c) + '</button>';
    }).join(''));
  }

  function renderDetail(dir) {
    var s = S.monthSummary(detailMonth);
    var isCurrent = detailMonth >= S.currentMonthKey();

    setText('detailMonth', S.monthLabel(detailMonth));
    setText('detailCount', '共 ' + s.count + ' 笔账单');
    setMoney('sumExpense', s.expense);
    setMoney('sumIncome', s.income);
    setMoney('sumBalance', s.balance);

    var next = $('btnMonthNext');
    if (next) next.disabled = isCurrent;

    renderChips();

    var host = $('detailGroups');
    var list = s.list.filter(matchFilter);
    if (!list.length) {
      if (searchTerm) {
        setHTML('detailGroups', '<div class="list-card"><div class="row"><span class="row__text">' +
          '<span class="row__title">没有匹配「' + esc(searchTerm) + '」的账单</span>' +
          '<span class="row__sub">换个关键词试试</span></span></div></div>');
      } else if (s.count === 0) {
        setHTML('detailGroups', emptyBlock(
          S.monthLabel(detailMonth) + '还没有记录',
          isCurrent ? '这个月记下的每一笔都会出现在这里' : '这个月没有任何支出或收入',
          isCurrent ? '记一笔' : null));
      } else {
        setHTML('detailGroups', '<div class="list-card"><div class="row"><span class="row__text">' +
          '<span class="row__title">「' + esc(detailFilter) + '」这个月没有记录</span>' +
          '<span class="row__sub">换个分类看看</span></span></div></div>');
      }
      return;
    }

    var groups = [], map = {};
    list.forEach(function (t) {
      if (!map[t.date]) { map[t.date] = []; groups.push(t.date); }
      map[t.date].push(t);
    });

    setHTML('detailGroups', groups.map(function (d) {
      var sum = map[d].reduce(function (a, t) {
        return a + (t.kind === 'income' ? 0 : t.amount);
      }, 0);
      return '<div class="group">' +
        '<div class="group__label"><span>' + S.dayLabel(d) + '</span>' +
        '<span class="group__sum">支 ' + S.money(S.round2(sum)) + '</span></div>' +
        '<div class="list-card">' + map[d].map(txRow).join('') + '</div>' +
        '</div>';
    }).join(''));

    /* 翻月时给一个方向感：往前翻从右侧进来，往回翻从左侧进来 */
    host.classList.remove('anim-slide-r', 'anim-slide-l');
    if (dir) {
      void host.offsetWidth;
      host.classList.add(dir > 0 ? 'anim-slide-r' : 'anim-slide-l');
    }
    M.enter(document.querySelectorAll('#detailGroups .row'), { step: 26, max: 6 });
  }

  /* ======================================================================
     04 · 统计
     ====================================================================== */
  var rangeMode = 'month';

  function renderStats() {
    var r = S.rangeSummary(rangeMode);
    var sc = r.scope;

    setText('statsMonth', sc.subLabel);
    setText('statTotalLabel', sc.label + '支出');
    countText('statTotal', r.expense, '');
    setText('statTotalSub', '共 ' + r.count + ' 笔 · 日均 ¥' + S.fmt(r.dailyAvg, 0));

    /* 环比 */
    var chip = $('trendChip');
    if (r.delta === null) {
      chip.style.display = 'none';
    } else {
      chip.style.display = '';
      chip.classList.toggle('is-down', r.delta < 0);
      var arrow = chip.querySelector('.ico');
      if (arrow) arrow.style.transform = r.delta < 0 ? 'rotate(180deg)' : 'none';
      setText('trendText', (Math.abs(r.delta) * 100).toFixed(1) + '% 环比');
    }

    renderChart();

    /* 分类占比 */
    var cb = S.categoryBreakdown(sc.start, sc.end);
    if (!cb.rows.length) {
      setHTML('catCard', '<div class="card__head"><h2 class="card__title">分类占比</h2></div>' +
        '<div class="card__empty">这段时间还没有支出</div>');
      return;
    }
    setHTML('catCard',
      '<div class="card__head">' +
        '<h2 class="card__title">分类占比</h2>' +
        '<span class="card__note">按金额排序</span>' +
      '</div>' +
      '<div class="stack">' + cb.rows.map(function (x, i) {
        return '<span class="stack__seg" style="width:' + (x.pct * 100) + '%;background:' +
          S.catColor(x.name, i) + ';animation-delay:' + (i * 70) + 'ms"></span>';
      }).join('') + '</div>' +
      '<div class="legend">' + cb.rows.map(function (x, i) {
        return '<div class="legend__row">' +
          '<span class="legend__name"><i class="legend__dot" style="background:' +
            S.catColor(x.name, i) + '"></i>' + esc(x.name) + '</span>' +
          '<span class="legend__pct">' + Math.round(x.pct * 100) + '%' +
            '<i class="legend__amount">¥' + S.fmt(x.amount, 0) + '</i></span>' +
          '</div>';
      }).join('') + '</div>');
  }

  function renderChart() {
    var c = S.chartSeries(rangeMode);
    setText('trendTitle', c.title);
    setText('trendUnit', c.unit);

    var wrap = $('barChart');
    if (!wrap) return;
    var hasAny = c.data.some(function (d) { return d.value > 0; });
    wrap.classList.toggle('bar-chart--dense', c.data.length > 8);
    wrap.classList.toggle('is-empty', !hasAny);

    if (!hasAny) {
      setHTML('barChart', '<span>这段时间还没有支出</span>');
      return;
    }
    renderBars();
  }

  function renderBars() {
    var c = S.chartSeries(rangeMode);
    var max = Math.max.apply(null, c.data.map(function (d) { return d.value; }).concat([1]));
    var maxPx = barMaxPx();
    setHTML('barChart', c.data.map(function (d, i) {
      var h = d.value > 0 ? Math.max(8, Math.round(d.value / max * maxPx)) : 3;
      return '<div class="bar-col' + (d.highlight ? ' is-today' : '') + (d.future ? ' is-future' : '') + '">' +
        '<span class="bar" style="height:' + h + 'px;animation-delay:' + (i * 28) + 'ms"></span>' +
        '<span class="bar-col__label">' + esc(d.label) + '</span>' +
        '</div>';
    }).join(''));
  }

  /* ======================================================================
     05 · 预算
     ====================================================================== */
  function renderBudget() {
    var b = S.budgetState();
    var mk = S.currentMonthKey();

    if (!b.hasTotal) {
      setHTML('budgetHero',
        '<div class="hero__top">' +
          '<span class="hero__label">本月总预算</span>' +
          '<span class="hero__chip"><span>' + S.monthLabel(mk) + '</span></span>' +
        '</div>' +
        '<div class="hero__setup">' +
          '<div class="hero__setup-title">还没设置总预算</div>' +
          '<div class="hero__setup-text">设一个每月支出上限，就能随时看到还剩多少</div>' +
          '<span class="hero__setup-cta">去设置</span>' +
        '</div>');
    } else {
      var over = b.pct > 1;
      setHTML('budgetHero',
        '<div class="hero__top">' +
          '<span class="hero__label">本月总预算</span>' +
          '<span class="hero__chip"><span>' + S.monthLabel(mk) + '</span></span>' +
        '</div>' +
        '<div class="hero__amount-row">' +
          '<span class="hero__amount">' + S.money(b.used) + '</span>' +
          '<span class="hero__amount-sub">/ ¥' + S.fmt(b.total, 0) + '</span>' +
        '</div>' +
        '<div class="track track--hero"><i class="track__fill" style="width:' +
          Math.min(1, b.pct) * 100 + '%"></i></div>' +
        '<div class="hero__footer">' +
          '<span>剩余 ' + S.money(b.left) + '</span>' +
          '<span class="' + (over ? 'is-over' : '') + '">已用 ' + Math.round(b.pct * 100) + '%</span>' +
        '</div>');
    }

    /* 分类预算 */
    if (!b.rows.length) {
      setHTML('catBudgets',
        '<div class="card__empty card__empty--action">' +
          '<div>还没有分类预算</div>' +
          '<button class="link-btn pressable" id="btnAddCatBudget">' +
            '<span class="ico">' + w.icon('plus', 17) + '</span>添加分类预算</button>' +
        '</div>');
    } else {
      setHTML('catBudgets', b.rows.map(function (r, i) {
        var overRow = r.ratio > 1;
        return '<div class="budget-row pressable" data-catbudget="' + esc(r.name) + '">' +
          '<div class="budget-row__top">' +
            '<span class="budget-row__name">' +
              '<i class="budget-row__dot" style="background:' + S.catColor(r.name, i) + '"></i>' +
              '<span class="budget-row__label">' + esc(r.name) + '</span>' +
            '</span>' +
            '<span class="budget-row__amount' + (overRow ? ' is-over' : '') + '">' +
              S.money(r.used) + ' / ' + S.fmt(r.cap, 0) +
            '</span>' +
          '</div>' +
          '<span class="track"><i class="track__fill' + (overRow ? ' is-over' : '') +
            '" style="width:' + Math.min(1, r.ratio) * 100 + '%"></i></span>' +
          '</div>';
      }).join(''));
    }

    /* 提示：全部由当前数据推导 */
    var tip;
    if (!b.hasTotal) {
      tip = '先把总预算定下来，这里会按你的实际支出给出提醒。';
    } else {
      var worst = b.rows.slice().sort(function (a, c2) { return c2.ratio - a.ratio; })[0];
      if (b.summary.daysLeft > 0) {
        tip = '本月还剩 ' + b.summary.daysLeft + ' 天，日均可用 ' + S.money(b.perDay) + '。';
      } else {
        tip = '本月已结束，共支出 ' + S.money(b.used) + '。';
      }
      if (worst && worst.ratio >= 0.8) {
        tip += worst.name + '已用 ' + Math.round(worst.ratio * 100) + '%，建议适当控制。';
      } else if (b.rows.length) {
        tip += '目前各项预算都在安全区间，保持节奏就好。';
      }
    }
    setText('tipText', tip);
  }

  /* ======================================================================
     底部导航：选中用「实心图标 + 黑色」，而不是整块色底
     ====================================================================== */
  var TABS = [
    { key: 'home', label: '首页', icon: 'tabHome', fill: 'tabHomeFill' },
    { key: 'detail', label: '明细', icon: 'tabList', fill: 'tabListFill' },
    { key: 'stats', label: '统计', icon: 'tabChart', fill: 'tabChartFill' },
    { key: 'budget', label: '预算', icon: 'tabWallet', fill: 'tabWalletFill' }
  ];
  var lastTab = '';

  function renderTabbar(active) {
    if (lastTab === active) return;      /* 不重建，否则每次切回来都会重播弹跳 */
    lastTab = active;
    setHTML('tabbarPill', TABS.map(function (t) {
      var on = t.key === active;
      return '<button class="tab' + (on ? ' is-active' : '') + '" data-tab="' + t.key + '">' +
        ico(on ? t.fill : t.icon, 24) +
        '<span class="tab__label">' + t.label + '</span>' +
        '</button>';
    }).join(''));
  }

  w.Views = {
    renderHome: renderHome,
    renderAdd: renderAdd,
    resetAddState: resetAddState,
    repeatLast: repeatLast,
    addState: addState,
    pressKey: pressKey,
    currentAmount: currentAmount,
    renderDetail: renderDetail,
    renderStats: renderStats,
    renderBars: renderBars,
    renderBudget: renderBudget,
    renderTabbar: renderTabbar,
    setThumb: slideThumb,
    emptyBlock: emptyBlock,
    getDetailMonth: getDetailMonth,
    setDetailMonth: setDetailMonth,
    getFilter: function () { return detailFilter; },
    setFilter: function (v) { detailFilter = v; },
    getSearch: function () { return searchTerm; },
    setSearch: function (v) { searchTerm = v; },
    clearSearch: function () { searchTerm = ''; },
    getRange: function () { return rangeMode; },
    setRange: function (v) { rangeMode = v; },
    esc: esc,
    ico: ico,
    catMeta: catMeta
  };
})(window);
