/* ==========================================================================
   动效层 —— 一切动效只做两件事：说明「发生了什么」，和「从哪里来」

   三条自律：
   1. 只动 transform / opacity。改 height、width、top 会触发布局重排，
      在中端机上一次重排就是一次掉帧，动效反而变成廉价感。
   2. 时长收敛三档，曲线只有两条。同一个界面里出现四种缓动函数，
      用户说不出哪里怪，但就是会觉得「不高级」。
   3. 触感是动效的一半。视觉动效没有触觉反馈，就像按了没有键程的键盘。
   ========================================================================== */
(function (w) {
  'use strict';

  var d = w.document;
  var reduced = false;
  try {
    reduced = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { /* noop */ }

  /* ------------------------------------------------------------ 数字滚动 */
  /* 记账应用里，金额从 0 滚到 128.50 比「啪」地出现更像一个真实的产品。
     用 rAF + easeOutCubic，值缓存在元素上，这样连续录入时能接得上。 */
  function count(el, to, fmt, opts) {
    if (!el) return;
    var o = opts || {};
    var target = Number(to) || 0;
    var from = (el.__cv === undefined) ? (o.from === undefined ? 0 : Number(o.from) || 0) : el.__cv;

    if (reduced || Math.abs(target - from) < 0.005) {
      el.__cv = target;
      el.textContent = fmt(target);
      return;
    }
    if (el.__raf) { w.cancelAnimationFrame(el.__raf); el.__raf = 0; }

    var dur = o.dur || 480;
    var t0 = 0;
    el.__cv = target;

    function frame(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);            /* easeOutCubic */
      el.textContent = fmt(from + (target - from) * e);
      if (p < 1) el.__raf = w.requestAnimationFrame(frame);
      else { el.__raf = 0; el.textContent = fmt(target); }
    }
    el.__raf = w.requestAnimationFrame(frame);
  }

  /* 重新渲染会让元素是新的，__cv 丢失 → 从 0 重新滚。
     列表里的小数字不需要这个效果，所以提供 clear 让它安静地直接赋值。 */
  function setNum(el, to, fmt) {
    if (!el) return;
    if (el.__raf) { w.cancelAnimationFrame(el.__raf); el.__raf = 0; }
    el.__cv = Number(to) || 0;
    el.textContent = fmt(Number(to) || 0);
  }

  /* ---------------------------------------------------------------- 入场 */
  /* 只对前 max 个元素做 stagger。长列表全量延迟会让滚动时不断有元素
     还在播动画，看起来像卡顿。 */
  function enter(nodes, opts) {
    var o = opts || {};
    var cls = o.cls || 'anim-in';
    var step = o.step === undefined ? 26 : o.step;
    var max = o.max === undefined ? 8 : o.max;
    var list = nodes && nodes.length !== undefined ? nodes : (nodes ? [nodes] : []);
    Array.prototype.forEach.call(list, function (n, i) {
      if (!n) return;
      if (i >= max) { n.classList.remove(cls); n.style.animationDelay = ''; return; }
      n.classList.remove(cls);
      void n.offsetWidth;                        /* 强制重排以重启动画 */
      n.style.animationDelay = (i * step) + 'ms';
      n.classList.add(cls);
    });
  }

  /* ---------------------------------------------------------------- 触感 */
  /* 走原生的 performHapticFeedback，不需要 VIBRATE 权限，
     并且会尊重系统「触感反馈」开关 —— 用户关掉就真的不震。 */
  var tapped = false;
  ['pointerdown', 'touchstart', 'mousedown', 'keydown'].forEach(function (t) {
    d.addEventListener(t, function () { tapped = true; }, { once: true, passive: true });
  });

  function haptic(kind) {
    var k = kind || 'light';
    if (w.NativeBridge && typeof w.NativeBridge.haptic === 'function') {
      try { w.NativeBridge.haptic(k); return; } catch (e) { /* 退回下面的方案 */ }
    }
    /* WebView 之外的预览环境（直接开 file:// 调试）没有原生桥，
       退回 navigator.vibrate。但它必须是用户真实触摸过之后才允许调用 ——
       否则 Chromium 会往控制台吐一堆 Blocked call 警告。 */
    if (!tapped) return;
    if (w.navigator && typeof w.navigator.vibrate === 'function') {
      var ms = k === 'heavy' ? 18 : k === 'medium' ? 12 : 8;
      try { w.navigator.vibrate(ms); } catch (e2) { /* noop */ }
    }
  }

  /* ---------------------------------------------------------------- 其它 */
  /* 让元素暂时上合成层，动画结束后立刻撤掉，避免长期占用显存 */
  function promote(el, ms) {
    if (!el) return;
    el.style.willChange = 'transform';
    w.setTimeout(function () { el.style.willChange = ''; }, ms || 600);
  }

  /* 给元素一次「跳动」，用于强调某个刚变化的值 */
  function bump(el) {
    if (!el || reduced) return;
    el.classList.remove('is-bump');
    void el.offsetWidth;
    el.classList.add('is-bump');
    w.setTimeout(function () { el.classList.remove('is-bump'); }, 460);
  }

  w.Motion = {
    reduced: reduced,
    count: count,
    setNum: setNum,
    enter: enter,
    haptic: haptic,
    promote: promote,
    bump: bump
  };
})(window);
