/* ==========================================================================
   应用层 —— 路由 / 事件 / 弹层 / 软键盘避让 / 原生桥接

   这一版把「记一笔」从标签页里搬出来，做成 #shell 的兄弟节点：
   层级由 DOM 顺序天然决定，不再需要靠 z-index 或临时 display:none 去抢位置，
   「弹层被别的页盖住」这类 bug 从此不可能发生。
   ========================================================================== */
(function (w) {
  'use strict';

  var S = w.Store, V = w.Views, M = w.Motion;
  var $ = function (id) { return document.getElementById(id); };
  function pad2(v) { return v < 10 ? '0' + v : '' + v; }

  var ORDER = ['home', 'detail', 'stats', 'budget'];
  var TAB_SCREENS = { home: 1, detail: 1, stats: 1, budget: 1 };
  var current = 'home';
  var addOpen = false;
  var prevTab = 'home';

  /* ---------------------------------------------------------------- 路由 */
  function closeAdd() {
    if (!addOpen) return;
    addOpen = false;
    $('s-add').classList.remove('is-active');
    $('app').classList.remove('is-modal');
  }

  function go(name) {
    if (!TAB_SCREENS[name]) name = 'home';
    var dir = ORDER.indexOf(name) - ORDER.indexOf(current);
    closeAdd();
    current = name;
    ORDER.forEach(function (k) {
      var el = $('s-' + k);
      var on = k === name;
      el.classList.toggle('is-active', on);
      el.classList.toggle('from-left', on && dir < 0);
    });
    V.renderTabbar(name);
    render(name);
    var c = $('s-' + name).querySelector('.content');
    if (c) c.scrollTop = 0;
    M.haptic('light');
  }

  function render(name) {
    if (name === 'home') V.renderHome();
    else if (name === 'detail') V.renderDetail();
    else if (name === 'stats') V.renderStats();
    else if (name === 'budget') V.renderBudget();
  }

  function renderAll() {
    render(current);
    if (addOpen) V.renderAdd();
  }

  function openAdd(tx, presetCat) {
    if (TAB_SCREENS[current]) prevTab = current;
    addOpen = true;
    V.resetAddState(tx || null);
    if (!tx && presetCat) {
      V.addState.cat = presetCat;
      S.state.activeCat = presetCat;
      V.renderAdd();
    }
    var c = $('s-add').querySelector('.content');
    if (c) c.scrollTop = 0;
    $('app').classList.add('is-modal');
    $('s-add').classList.add('is-active');
    applyInsets();
    M.haptic('medium');
  }

  function exitAdd() {
    closeAdd();
    go(prevTab && TAB_SCREENS[prevTab] ? prevTab : 'home');
  }

  /* ---------------------------------------------------------------- Toast */
  /* 支持一个动作按钮 —— 「删除」不再是一去不回的操作。 */
  var toastTimer = null;
  var toastAct = null;

  function toast(msg, actionLabel, onAction, dur) {
    var t = $('toast');
    $('toastMsg').textContent = msg;
    var btn = $('toastBtn');
    if (actionLabel) {
      btn.textContent = actionLabel;
      btn.style.display = '';
      toastAct = onAction || null;
    } else {
      btn.style.display = 'none';
      toastAct = null;
    }
    t.classList.add('is-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('is-show');
      toastAct = null;
      toastTimer = null;
    }, dur || (actionLabel ? 4600 : 1900));
  }
  w.__toast = toast;

  /* ------------------------------------------------------ 安全区与软键盘避让 */
  /* 单位是这一块的命门：Android 的 WindowInsets 报的是**物理像素**，
     而 WebView 里的 CSS px 是**密度无关像素**。把物理像素直接当 CSS px 用，
     安全区就会被放大整整一个屏幕密度的倍数（1080p/440dpi 的机器是 2.75×），
     表现就是顶部和底部各多出一大条空白。所以原生只负责原样上报 px，
     换算一律在这里做。 */
  var raw = { top: 0, bottom: 0, kb: 0 };   /* 全部是物理像素 */
  var viewportPx = 0;                        /* WebView 物理宽度 */

  function pxScale() {
    var dpr = w.devicePixelRatio || 1;
    if (viewportPx > 0 && w.innerWidth > 0) {
      var s = viewportPx / w.innerWidth;
      /* 与 dpr 相差过大说明拿到的是过期数值（例如刚转过屏），宁可退回 dpr */
      if (s > dpr * 0.75 && s < dpr * 1.25) return s;
    }
    return dpr;
  }

  function applyInsets() {
    var el = document.activeElement;
    var typing = !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'));
    var k = pxScale();
    var kb = typing ? raw.kb / k : 0;
    var root = document.documentElement.style;
    root.setProperty('--safe-top', (raw.top / k) + 'px');
    root.setProperty('--kb', kb + 'px');
    /* 键盘在时它已经盖住了导航栏，再留一次安全区会在弹层和键盘之间多出一条缝 */
    root.setProperty('--safe-bottom', (kb > 0 ? 0 : raw.bottom / k) + 'px');
    if (kb > 0) setTimeout(ensureFocusedVisible, 80);
  }

  /* 让聚焦的输入框落在键盘正上方 */
  function ensureFocusedVisible() {
    var el = document.activeElement;
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;
    try {
      el.scrollIntoView({ block: 'nearest' });
    } catch (e) {
      try { el.scrollIntoView(false); } catch (e2) { /* noop */ }
    }
    /* 弹层内部若还有可滚动区域，再往中间带一点，避免只露出半行 */
    var panel = el.closest ? el.closest('.picker__panel') : null;
    if (panel && panel.scrollHeight > panel.clientHeight) {
      var pr = panel.getBoundingClientRect();
      var er = el.getBoundingClientRect();
      if (er.bottom > pr.bottom - 8 || er.top < pr.top + 8) {
        panel.scrollTop += (er.top - pr.top) - 16;
      }
    }
  }

  /* 原生上报：软键盘高度（物理 px） */
  w.__onKeyboard = function (hPx) {
    raw.kb = Math.max(0, hPx | 0);
    applyInsets();
  };
  /* 原生上报：状态栏 / 导航栏安全区（物理 px）+ WebView 物理宽度 */
  w.__onInsets = function (topPx, bottomPx, viewportWidthPx) {
    raw.top = Math.max(0, topPx | 0);
    raw.bottom = Math.max(0, bottomPx | 0);
    if (viewportWidthPx > 0) viewportPx = viewportWidthPx | 0;
    applyInsets();
  };
  w.addEventListener('orientationchange', function () { viewportPx = 0; applyInsets(); });
  w.addEventListener('safearea', applyInsets);

  if (w.NativeBridge && typeof w.NativeBridge.requestInsets === 'function') {
    try { w.NativeBridge.requestInsets(); } catch (e) { /* noop */ }
  }

  document.addEventListener('focusin', function () {
    applyInsets();
    setTimeout(ensureFocusedVisible, 120);
  });
  document.addEventListener('focusout', function () {
    setTimeout(applyInsets, 0);
  });

  /* ---------------------------------------------------------------- 弹层 */
  var pickerAction = null;
  var sheetToken = 0;

  function closePicker() {
    var p = $('picker');
    if (!p.classList.contains('is-show')) return;
    p.classList.remove('is-show');
    $('app').classList.remove('is-sheet');
    pickerAction = null;
    /* 内容要等出场动画走完再清，否则面板会在下滑的过程中变空 */
    var tk = ++sheetToken;
    setTimeout(function () {
      if (tk === sheetToken) $('pickerPanel').innerHTML = '';
    }, 340);
    applyInsets();
  }

  function openSheet(html, onOk, focusInput) {
    sheetToken++;
    $('pickerPanel').innerHTML = html;
    pickerAction = onOk || null;
    $('pickerPanel').scrollTop = 0;
    $('app').classList.add('is-sheet');
    $('picker').classList.add('is-show');
    var inp = $('pickerInput');
    if (inp && focusInput) {
      try { inp.focus(); } catch (e) { /* noop */ }
      try {
        if (typeof inp.setSelectionRange === 'function' && inp.value) {
          inp.setSelectionRange(inp.value.length, inp.value.length);
        }
      } catch (e2) { /* number 类型不支持 setSelectionRange */ }
    }
    applyInsets();
  }

  function optionSheet(title, options, onPick) {
    openSheet(
      '<div class="picker__head">' + V.esc(title) + '</div>' +
      options.map(function (o) {
        var cls = 'picker__opt' + (o.danger ? ' picker__opt--danger' : '') + (o.sel ? ' is-sel' : '');
        return '<button class="' + cls + '" data-pick="' + V.esc(o.value) + '">' +
          '<span>' + V.esc(o.label) + '</span>' +
          (o.sel ? '<span class="ico" style="color:var(--n900)">' + w.icon('check', 18) + '</span>' : '') +
          '</button>';
      }).join(''),
      function (val) { onPick(val); }
    );
  }

  function inputSheet(o) {
    var attrs;
    if (o.type === 'number') {
      attrs = ' type="number" inputmode="decimal" min="0" step="' + (o.step || 50) + '"';
    } else if (o.type === 'date') {
      attrs = ' type="date"';
    } else {
      attrs = ' type="text" maxlength="' + (o.maxlength || 30) + '" autocomplete="off"';
    }
    openSheet(
      '<div class="picker__head">' + V.esc(o.title) + '</div>' +
      '<input id="pickerInput" class="picker__input"' + attrs +
        ' placeholder="' + V.esc(o.placeholder || '') + '"' +
        ' value="' + V.esc(o.value == null ? '' : o.value) + '">' +
      (o.extra || '') +
      '<div class="picker__actions">' +
        '<button class="picker__btn picker__btn--ghost" data-sheet-cancel>取消</button>' +
        '<button class="picker__btn picker__btn--primary" data-sheet-ok>' + V.esc(o.ok || '确定') + '</button>' +
      '</div>',
      function (val) { o.onOk(val); },
      true
    );
  }

  function row(id, icon, label, value, danger) {
    return '<button class="sheet-row' + (danger ? ' sheet-row--danger' : '') + '" id="' + id + '">' +
      '<span class="ico">' + w.icon(icon, 21) + '</span>' +
      '<span class="sheet-row__label">' + V.esc(label) + '</span>' +
      '<span class="sheet-row__val">' + V.esc(value == null ? '' : value) + '</span>' +
      (danger ? '' : '<span class="ico ico--chev">' + w.icon('chevronRight', 16) + '</span>') +
      '</button>';
  }

  /* ---------------------------------------------------------------- 设置 */
  function openSettings() {
    var st = S.state;
    openSheet(
      '<div class="picker__head">设置</div>' +
      row('btnNickname', 'user', '昵称', st.nickname || '未设置') +
      row('btnAccounts', 'wallet2', '账户管理', st.accounts.length + ' 个账户') +
      row('btnExport', 'share', '导出数据', st.txs.length + ' 笔账单') +
      row('btnClear', 'trash', '清空全部数据', '', true) +
      '<div class="sheet-foot">Tally · 轻记账　v1.4<br>所有数据只保存在这台设备上</div>',
      null
    );
  }

  function editNickname() {
    inputSheet({
      title: '昵称', value: S.state.nickname, maxlength: 8,
      placeholder: '留空则只显示问候语', ok: '保存',
      onOk: function (v) {
        S.state.nickname = String(v || '').trim().slice(0, 8);
        S.save();
        closePicker();
        updateAvatar();
        render('home');
        toast('已保存');
      }
    });
  }

  function confirmClear() {
    var n = S.state.txs.length;
    openSheet(
      '<div class="picker__head">确认清空？</div>' +
      '<div class="sheet-note">将删除本机保存的全部 ' + n + ' 笔账单，以及预算和账户设置。<br>此操作不可撤销。</div>' +
      '<div class="picker__actions">' +
        '<button class="picker__btn picker__btn--ghost" data-sheet-cancel>取消</button>' +
        '<button class="picker__btn picker__btn--danger" id="btnClearSure">清空</button>' +
      '</div>', null);
  }

  function exportData() {
    var text = S.exportJSON();
    openSheet(
      '<div class="picker__head">导出数据</div>' +
      '<div class="sheet-note">下面是全部数据的 JSON，复制后可以自行备份。</div>' +
      '<textarea class="export-box" readonly>' + V.esc(text.length > 20000 ? text.slice(0, 20000) + '\n…' : text) + '</textarea>' +
      '<div class="picker__actions">' +
        '<button class="picker__btn picker__btn--ghost" data-sheet-cancel>关闭</button>' +
        '<button class="picker__btn picker__btn--primary" id="btnCopyExport">复制</button>' +
      '</div>', null);
  }

  function copyExport() {
    var box = document.querySelector('.export-box');
    var text = box ? box.value : S.exportJSON();
    var ok = false;
    if (w.NativeBridge && typeof w.NativeBridge.copyText === 'function') {
      try { w.NativeBridge.copyText(text); ok = true; } catch (e) { ok = false; }
    }
    if (!ok) {
      try {
        if (box) { box.removeAttribute('readonly'); box.select(); box.setSelectionRange(0, text.length); }
        ok = document.execCommand('copy');
        if (box) box.setAttribute('readonly', 'readonly');
      } catch (e2) { ok = false; }
    }
    M.haptic(ok ? 'medium' : 'heavy');
    toast(ok ? '已复制到剪贴板' : '复制失败，请长按选择');
  }

  /* ------------------------------------------------------------ 账户管理 */
  function openAccounts() {
    var counts = {};
    S.state.txs.forEach(function (t) { counts[t.account] = (counts[t.account] || 0) + 1; });
    openSheet(
      '<div class="picker__head">账户管理</div>' +
      S.state.accounts.map(function (a) {
        return '<button class="sheet-row" data-account="' + V.esc(a) + '">' +
          '<span class="ico">' + w.icon('wallet2', 21) + '</span>' +
          '<span class="sheet-row__label">' + V.esc(a) + '</span>' +
          '<span class="sheet-row__val">' + (counts[a] || 0) + ' 笔</span>' +
          '<span class="ico ico--chev">' + w.icon('chevronRight', 16) + '</span>' +
          '</button>';
      }).join('') +
      '<button class="sheet-row sheet-row--action" id="btnAddAccount">' +
        '<span class="ico">' + w.icon('plus', 19) + '</span>' +
        '<span class="sheet-row__label">新增账户</span>' +
      '</button>', null);
  }

  function addAccount() {
    inputSheet({
      title: '新增账户', maxlength: 12, placeholder: '如：招商银行储蓄卡', ok: '添加',
      onOk: function (v) {
        var name = String(v || '').trim();
        if (!name) { toast('请输入账户名称'); return; }
        if (S.state.accounts.indexOf(name) >= 0) { toast('该账户已存在'); return; }
        S.addAccount(name);
        closePicker();
        openAccounts();
        toast('已添加「' + name + '」');
      }
    });
  }

  function editAccount(name) {
    inputSheet({
      title: '账户名称', value: name, maxlength: 12, ok: '保存',
      extra: S.state.accounts.length > 1
        ? '<button class="link-btn link-btn--danger" data-delacc="' + V.esc(name) + '">删除这个账户</button>'
        : '',
      onOk: function (v) {
        var val = String(v || '').trim();
        if (!val) { toast('名称不能为空'); return; }
        if (val !== name && !S.renameAccount(name, val)) { toast('该账户已存在'); return; }
        if (V.addState.account === name) V.addState.account = val;
        closePicker();
        renderAll();
        toast('已更新');
      }
    });
  }

  function deleteAccount(name) {
    if (S.state.accounts.length <= 1) { toast('至少保留一个账户'); return; }
    if (!S.removeAccount(name)) { toast('删除失败'); return; }
    closePicker();
    renderAll();
    toast('已删除，相关账单归入「' + S.state.accounts[0] + '」');
  }

  function pickAccount() {
    var opts = S.state.accounts.map(function (a) {
      return { value: a, label: a, sel: a === V.addState.account };
    });
    opts.push({ value: '__manage', label: '管理账户…' });
    optionSheet('选择账户', opts, function (val) {
      if (val === '__manage') { openAccounts(); return; }
      V.addState.account = val;
      S.state.lastAccount = val;
      S.save();
      closePicker();
      V.renderAdd();
    });
  }

  /* -------------------------------------------------------------- 记一笔 */
  function pickDate() {
    var today = S.todayISO();
    var y = S.shiftDays(today, -1);
    var d2 = S.shiftDays(today, -2);
    var cur = V.addState.date;
    optionSheet('选择日期', [
      { value: today, label: '今天 · ' + today, sel: cur === today },
      { value: y, label: '昨天 · ' + y, sel: cur === y },
      { value: d2, label: '前天 · ' + d2, sel: cur === d2 },
      { value: '__custom', label: '选择其他日期…' }
    ], function (val) {
      if (val === '__custom') {
        inputSheet({
          title: '选择日期', type: 'date', value: V.addState.date, ok: '确定',
          onOk: function (v) {
            if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) V.addState.date = v;
            closePicker();
            V.renderAdd();
          }
        });
        return;
      }
      V.addState.date = val;
      closePicker();
      V.renderAdd();
    });
  }

  function pickCategory() {
    optionSheet('选择分类', S.CAT_LEDGER.map(function (c) {
      return { value: c, label: c, sel: c === V.addState.cat };
    }), function (val) {
      V.addState.cat = val;
      S.state.activeCat = val;
      S.save();
      closePicker();
      V.renderAdd();
    });
  }

  function editNote() {
    inputSheet({
      title: '备注', value: V.addState.note, maxlength: 30,
      placeholder: '写点什么，不填也可以', ok: '确定',
      onOk: function (val) {
        V.addState.note = String(val || '').slice(0, 30);
        closePicker();
        V.renderAdd();
      }
    });
  }

  function saveTx() {
    var amt = V.currentAmount();
    if (!amt || amt <= 0) { toast('请输入金额'); M.haptic('heavy'); return; }

    var st = V.addState;
    var cat = st.kind === 'income' ? '收入' : st.cat;
    var now = new Date();
    var isEdit = st.mode === 'edit' && S.byId(st.editId);

    if (isEdit) {
      S.updateTx(st.editId, {
        date: st.date, cat: cat, amount: amt,
        account: st.account, kind: st.kind, note: st.note
      });
    } else {
      S.addTx({
        date: st.date,
        time: st.date === S.todayISO() ? pad2(now.getHours()) + ':' + pad2(now.getMinutes()) : '12:00',
        cat: cat, amount: amt, account: st.account, kind: st.kind, note: st.note
      });
    }

    if (st.kind !== 'income') S.state.activeCat = st.cat;
    S.state.lastAccount = st.account;
    S.state.lastNote = st.note;
    S.save();

    M.haptic('medium');
    go(isEdit ? (TAB_SCREENS[prevTab] ? prevTab : 'home') : 'home');
    toast((isEdit ? '已更新 ' : '已记下 ') + S.money(amt));
  }

  function deleteTx(id) {
    var t = S.byId(id);
    if (!t) return;
    openSheet(
      '<div class="picker__head">删除这笔记录？</div>' +
      '<div class="sheet-note">' + V.esc(S.titleOf(t)) + '　·　' +
        S.signed(t.kind === 'income' ? t.amount : -t.amount) + '</div>' +
      '<div class="picker__actions">' +
        '<button class="picker__btn picker__btn--ghost" data-sheet-cancel>取消</button>' +
        '<button class="picker__btn picker__btn--danger" data-delid="' + t.id + '">删除</button>' +
      '</div>', null);
  }

  /* 删除不再是一去不回：留一份快照，Toast 里给「撤销」，
     4.6 秒内点回来就原样恢复（连 id 一起，引用不会错位）。 */
  function doDelete(id) {
    var t = S.byId(id);
    if (!t) return;
    var snapshot = JSON.parse(JSON.stringify(t));
    var title = S.titleOf(t);
    var wasEditing = addOpen && V.addState.editId === id;

    S.removeTx(id);
    closePicker();
    if (wasEditing) { exitAdd(); } else { renderAll(); }
    M.haptic('heavy');

    toast('已删除「' + title + '」', '撤销', function () {
      S.restoreTx(snapshot);
      renderAll();
      updateAvatar();
      M.haptic('medium');
      toast('已恢复');
    });
  }

  function openTx(id) {
    var t = S.byId(id);
    if (!t) return;
    var m = V.catMeta(t.kind === 'income' ? '收入' : t.cat);
    function kv(k, v) {
      return '<div class="kv"><span class="kv__k">' + V.esc(k) + '</span>' +
        '<span class="kv__v">' + V.esc(v) + '</span></div>';
    }
    openSheet(
      '<div class="picker__head">账单详情</div>' +
      '<div class="txd">' +
        '<span class="txd__icon">' + w.icon(m.icon, 26) + '</span>' +
        '<span class="txd__amount ' + (t.kind === 'income' ? 'c-income' : 'c-expense') + '">' +
          (t.kind === 'income' ? '+' : '-') + S.money(t.amount) + '</span>' +
        '<span class="txd__title">' + V.esc(S.titleOf(t)) + '</span>' +
      '</div>' +
      '<div class="txd__rows">' +
        kv('类型', t.kind === 'income' ? '收入' : '支出 · ' + t.cat) +
        kv('日期', t.date + '　' + (t.time || '')) +
        kv('账户', t.account) +
      '</div>' +
      '<div class="picker__actions">' +
        '<button class="picker__btn picker__btn--ghost" data-txref="' + t.id + '">复刻</button>' +
        '<button class="picker__btn picker__btn--ghost" data-txedit="' + t.id + '">编辑</button>' +
        '<button class="picker__btn picker__btn--danger" data-txdel="' + t.id + '">删除</button>' +
      '</div>', null);
  }

  /* ---------------------------------------------------------------- 明细 */
  function pickMonth() {
    var cur = V.getDetailMonth();
    optionSheet('选择月份', S.monthOptions().map(function (mk) {
      return { value: mk, label: S.monthLabel(mk), sel: mk === cur };
    }), function (val) {
      V.setDetailMonth(val);
      closePicker();
      V.renderDetail();
    });
  }

  function shiftMonth(delta) {
    var mk = S.shiftMonth(V.getDetailMonth(), delta);
    if (mk > S.currentMonthKey()) return;
    V.setDetailMonth(mk);
    V.renderDetail(delta);
    M.haptic('light');
  }

  /* 搜索栏就地展开：不再跳一个弹层去输入 */
  function toggleSearch(open) {
    var bar = $('searchBar');
    var on = (open === undefined) ? !bar.classList.contains('is-open') : !!open;
    bar.classList.toggle('is-open', on);
    if (on) {
      setTimeout(function () {
        try { $('searchInput').focus(); } catch (e) { /* noop */ }
      }, 90);
    } else {
      try { $('searchInput').blur(); } catch (e) { /* noop */ }
    }
    M.haptic('light');
  }

  function setSearch(v) {
    V.setSearch(String(v || '').trim());
    V.renderDetail();
  }

  function openFilter() {
    var s = S.monthSummary(V.getDetailMonth());
    var set = {};
    s.list.forEach(function (t) { if (t.kind !== 'income') set[t.cat] = 1; });
    var opts = ['全部'].concat(Object.keys(set)).map(function (c) {
      return { value: c, label: c, sel: c === V.getFilter() };
    });
    optionSheet('按分类筛选', opts, function (val) {
      V.setFilter(val);
      closePicker();
      V.renderDetail();
    });
  }

  /* ---------------------------------------------------------------- 预算 */
  function openBudgetTotal() {
    inputSheet({
      title: '本月总预算', type: 'number', step: 100,
      value: S.budgetState().total || '', placeholder: '例如 5000', ok: '保存',
      onOk: function (v) {
        var n = parseFloat(v);
        if (isFinite(n) && n > 0) {
          S.setBudgetTotal(n);
          closePicker();
          renderAll();
          toast('总预算已设为 ' + S.money(n));
        } else {
          toast('请输入大于 0 的金额');
        }
      }
    });
  }

  function openBudgetCats() {
    var rows = S.budgetState().rows;
    var avail = S.budgetCatsAvailable();
    openSheet(
      '<div class="picker__head">分类预算</div>' +
      (rows.length ? rows.map(function (r, i) {
        return '<button class="sheet-row" data-catbudget="' + V.esc(r.name) + '">' +
          '<span class="ico"><i class="catedot" style="background:' + S.catColor(r.name, i) + '"></i></span>' +
          '<span class="sheet-row__label">' + V.esc(r.name) + '</span>' +
          '<span class="sheet-row__val">¥' + S.fmt(r.cap, 0) + '</span>' +
          '<span class="ico ico--chev">' + w.icon('chevronRight', 16) + '</span>' +
          '</button>';
      }).join('') : '<div class="sheet-note">还没有设置分类预算</div>') +
      (avail.length
        ? '<button class="sheet-row sheet-row--action" id="btnAddCatBudget">' +
            '<span class="ico">' + w.icon('plus', 19) + '</span>' +
            '<span class="sheet-row__label">添加分类预算</span></button>'
        : ''),
      null);
  }

  function pickCategoryForBudget() {
    optionSheet('选择分类', S.budgetCatsAvailable().map(function (c) {
      return { value: c, label: c };
    }), function (val) {
      editCategoryBudget(val);
    });
  }

  function editCategoryBudget(name) {
    var cur = S.state.budgets.cats[name];
    inputSheet({
      title: name + ' 预算', type: 'number', step: 50,
      value: cur || '', placeholder: '例如 800', ok: '保存',
      extra: '<button class="link-btn link-btn--danger" data-delcatbudget="' + V.esc(name) + '">删除这个分类预算</button>',
      onOk: function (v) {
        var n = parseFloat(v);
        if (isFinite(n) && n > 0) {
          S.setCategoryBudget(name, n);
          closePicker();
          renderAll();
          toast(name + ' 预算已设为 ' + S.money(n));
        } else {
          toast('请输入大于 0 的金额');
        }
      }
    });
  }

  /* ---------------------------------------------------------------- 事件 */
  function bind() {
    document.addEventListener('click', function (e) {
      var el;

      /* —— 导航 —— */
      el = e.target.closest('[data-nav]');
      if (el) {
        var nav = el.getAttribute('data-nav');
        closePicker();
        if (nav === 'add') openAdd(); else go(nav);
        return;
      }
      el = e.target.closest('[data-tab]');
      if (el) {
        var tk = el.getAttribute('data-tab');
        if (tk !== current) go(tk);
        return;
      }
      el = e.target.closest('[data-close="add"]');
      if (el) { exitAdd(); return; }

      /* —— 首页 —— */
      el = e.target.closest('[data-quick]');
      if (el) { openAdd(null, el.getAttribute('data-quick')); return; }
      if (e.target.closest('#btnSettings') || e.target.closest('#btnProfile')) { openSettings(); return; }
      if (e.target.closest('[data-budgetset]') || e.target.closest('#btnBudgetSet')) { openBudgetTotal(); return; }

      /* —— 记一笔 —— */
      el = e.target.closest('[data-cat]');
      if (el) {
        V.addState.cat = el.getAttribute('data-cat');
        if (V.addState.kind !== 'income') S.state.activeCat = V.addState.cat;
        S.save();
        V.renderAdd();
        M.haptic('light');
        return;
      }
      el = e.target.closest('[data-key]');
      if (el) {
        V.pressKey(el.getAttribute('data-key'));
        M.haptic('light');
        return;
      }
      el = e.target.closest('#addSegment .segment__item');
      if (el) {
        V.addState.kind = el.getAttribute('data-kind');
        V.renderAdd();
        M.haptic('light');
        return;
      }
      if (e.target.closest('#btnRepeat')) {
        if (V.repeatLast()) { M.haptic('medium'); toast('已复刻上一笔'); }
        else { toast('还没有可复刻的记录'); }
        return;
      }
      if (e.target.closest('#addCatChip')) { pickCategory(); return; }
      el = e.target.closest('[data-meta]');
      if (el) {
        var which = el.getAttribute('data-meta');
        if (which === 'date') pickDate();
        else if (which === 'account') pickAccount();
        else editNote();
        return;
      }
      if (e.target.closest('#btnSave')) { saveTx(); return; }
      if (e.target.closest('#btnDeleteTx')) { deleteTx(V.addState.editId); return; }

      /* —— 明细 —— */
      if (e.target.closest('#btnMonth')) { pickMonth(); return; }
      if (e.target.closest('#btnMonthPrev')) { shiftMonth(-1); return; }
      if (e.target.closest('#btnMonthNext')) { shiftMonth(1); return; }
      if (e.target.closest('#btnSearch')) { toggleSearch(); return; }
      if (e.target.closest('#searchClear')) {
        $('searchInput').value = '';
        setSearch('');
        try { $('searchInput').focus(); } catch (er) { /* noop */ }
        return;
      }
      if (e.target.closest('#btnFilter')) { openFilter(); return; }
      el = e.target.closest('[data-chip]');
      if (el) {
        V.setFilter(el.getAttribute('data-chip'));
        V.renderDetail();
        M.haptic('light');
        return;
      }

      /* —— 统计 —— */
      el = e.target.closest('#rangeSegment .segment__item');
      if (el) {
        var idx = 0;
        Array.prototype.forEach.call(document.querySelectorAll('#rangeSegment .segment__item'), function (b, i) {
          b.classList.toggle('is-active', b === el);
          if (b === el) idx = i;
        });
        V.setThumb('rangeThumb', idx);
        V.setRange(el.getAttribute('data-range'));
        V.renderStats();
        M.haptic('light');
        return;
      }

      /* —— 预算 —— */
      if (e.target.closest('#btnManageCatBudget')) { openBudgetCats(); return; }
      if (e.target.closest('#btnAddCatBudget')) { pickCategoryForBudget(); return; }
      el = e.target.closest('[data-catbudget]');
      if (el) { editCategoryBudget(el.getAttribute('data-catbudget')); return; }
      el = e.target.closest('[data-delcatbudget]');
      if (el) {
        S.setCategoryBudget(el.getAttribute('data-delcatbudget'), 0);
        closePicker();
        renderAll();
        toast('已删除该分类预算');
        return;
      }

      /* —— 账单 —— */
      el = e.target.closest('[data-tx]');
      if (el) { openTx(el.getAttribute('data-tx')); return; }
      el = e.target.closest('[data-txedit]');
      if (el) {
        var tx = S.byId(el.getAttribute('data-txedit'));
        closePicker();
        if (tx) openAdd(tx);
        return;
      }
      el = e.target.closest('[data-txref]');
      if (el) {
        var src = S.byId(el.getAttribute('data-txref'));
        closePicker();
        if (!src) return;
        /* 复刻→直接落在记账页，仅把日期换成今天。
           注意顺序：先开模态（它会把 addState 重置成新建态），再覆盖字段。
           反过来的话刚写进去的值会被重置冲掉。 */
        openAdd(null);
        var st2 = V.addState;
        st2.kind = src.kind;
        st2.cat = src.kind === 'income' ? st2.cat : src.cat;
        st2.amountText = Number(src.amount).toFixed(2);
        st2.account = src.account;
        st2.note = src.note || '';
        st2.date = S.todayISO();
        V.renderAdd();
        M.haptic('medium');
        return;
      }
      el = e.target.closest('[data-txdel]');
      if (el) { deleteTx(el.getAttribute('data-txdel')); return; }
      el = e.target.closest('[data-delid]');
      if (el) { doDelete(el.getAttribute('data-delid')); return; }

      /* —— 设置 —— */
      if (e.target.closest('#btnNickname')) { editNickname(); return; }
      if (e.target.closest('#btnAccounts')) { openAccounts(); return; }
      if (e.target.closest('#btnExport')) { exportData(); return; }
      if (e.target.closest('#btnClear')) { confirmClear(); return; }
      if (e.target.closest('#btnClearSure')) {
        S.clearAll();
        closePicker();
        V.setDetailMonth(S.currentMonthKey());
        V.clearSearch();
        $('searchInput').value = '';
        toggleSearch(false);
        V.setFilter('全部');
        render('home');
        ORDER.forEach(function (k) { $('s-' + k).classList.toggle('is-active', k === 'home'); });
        current = 'home';
        V.renderTabbar('home');
        updateAvatar();
        toast('已清空');
        return;
      }
      if (e.target.closest('#btnCopyExport')) { copyExport(); return; }
      el = e.target.closest('[data-account]');
      if (el) { editAccount(el.getAttribute('data-account')); return; }
      if (e.target.closest('#btnAddAccount')) { addAccount(); return; }
      el = e.target.closest('[data-delacc]');
      if (el) { deleteAccount(el.getAttribute('data-delacc')); return; }

      /* —— Toast 的动作按钮 —— */
      if (e.target.closest('#toastBtn')) {
        var act = toastAct;
        toastAct = null;
        if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
        $('toast').classList.remove('is-show');
        if (act) act();
        return;
      }

      /* —— 弹层通用 —— */
      el = e.target.closest('[data-pick]');
      if (el) {
        var v = el.getAttribute('data-pick');
        if (pickerAction) pickerAction(v);
        return;
      }
      el = e.target.closest('[data-sheet-ok]');
      if (el) {
        var inp = $('pickerInput');
        if (pickerAction) pickerAction(inp ? inp.value : '');
        return;
      }
      if (e.target.closest('[data-sheet-cancel]')) { closePicker(); return; }
      if (e.target.id === 'picker') { closePicker(); return; }
    });

    /* 就地搜索：输入即筛，不做防抖 —— 本地数据筛一遍不到 1ms */
    var si = $('searchInput');
    if (si) {
      si.addEventListener('input', function (e) { setSearch(e.target.value); });
      si.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { si.blur(); }
      });
    }
  }

  /* ------------------------------------------------------------ 返回键 */
  w.__onAndroidBack = function () {
    if ($('toast').classList.contains('is-show')) {
      $('toast').classList.remove('is-show');
      return true;
    }
    if ($('picker').classList.contains('is-show')) { closePicker(); return true; }
    if (addOpen) { exitAdd(); return true; }
    if ($('searchBar').classList.contains('is-open')) { toggleSearch(false); return true; }
    if (current !== 'home') { go('home'); return true; }
    return false;
  };

  /* ------------------------------------------------------------ 其它 */
  function updateAvatar() {
    var a = $('btnProfile');
    if (!a) return;
    var nick = (S.state.nickname || '').trim();
    if (nick) a.textContent = nick.charAt(0);
    else a.innerHTML = w.icon('user', 20);
  }

  function init() {
    applyInsets();

    if (w.NativeBridge && typeof w.NativeBridge.setLightStatusBar === 'function') {
      try { w.NativeBridge.setLightStatusBar(); } catch (e) { /* noop */ }
    }

    S.load();
    if (w.mountIcons) w.mountIcons(document);
    V.setThumb('addSegThumb', 0);
    V.setThumb('rangeThumb', 1);
    bind();
    go('home');
    updateAvatar();

    /* 首帧后再画一次柱状图，确保拿到真实高度 */
    requestAnimationFrame(function () { if (current === 'stats') V.renderBars(); });
    setTimeout(function () { if (current === 'stats') V.renderBars(); }, 140);

    var rt = null;
    w.addEventListener('resize', function () {
      if (rt) clearTimeout(rt);
      rt = setTimeout(function () {
        applyInsets();
        if (current === 'stats') V.renderBars();
      }, 150);
    });

    /* 页面本身不滚动，只允许指定容器滚动 */
    document.addEventListener('touchmove', function (e) {
      if (e.target.closest('.content, .chips, .picker__panel, .export-box')) return;
      e.preventDefault();
    }, { passive: false });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
