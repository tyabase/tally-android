/* ==========================================================================
   图标集 v2 —— 全部重绘到 24×24 网格

   为什么要重绘：上一版混用 18 / 20 / 22 三种网格、笔画 1.4~1.9 七种粗细，
   摆在同一个界面里粗细不匀、视觉重心也不齐。现在统一 24 网格、两档笔画
   （细 1.8 用于 20px 以下，常规 2.0 用于 22px 以上），全部走 currentColor。

   底部导航额外提供 xxxFill 实心变体：选中态用实心 + 着色表达，
   而不是把整块按钮刷成蓝色。
   ========================================================================== */
(function (w) {
  'use strict';

  // name -> [viewBox宽, viewBox高, 内部SVG, 默认笔画]
  var RAW = {
    /* ---------------------------------------------------------- 通用 */
    chevronDown:  [24, 24, '<path d="M6.5 9.6L12 15.1L17.5 9.6"/>', 2],
    chevronRight: [24, 24, '<path d="M9.6 6L15.6 12L9.6 18"/>', 2],
    chevronLeft:  [24, 24, '<path d="M14.4 6L8.4 12L14.4 18"/>', 2],

    search: [24, 24, '<circle cx="10.9" cy="10.9" r="6.7"/><path d="M15.8 15.8L20.4 20.4"/>', 2],
    plus:   [24, 24, '<path d="M12 5.6V18.4M5.6 12H18.4"/>', 2.1],
    minus:  [24, 24, '<path d="M6 12H18"/>', 2.1],
    check:  [24, 24, '<path d="M5.4 12.6L9.9 17.1L18.6 7.4"/>', 2.2],
    close:  [24, 24, '<path d="M6.8 6.8L17.2 17.2M17.2 6.8L6.8 17.2"/>', 2],

    arrowUp:   [24, 24, '<path d="M12 19.2V5.6M12 5.6L5.9 11.7M12 5.6L18.1 11.7"/>', 2.1],
    arrowDown: [24, 24, '<path d="M12 4.8V18.4M12 18.4L5.9 12.3M12 18.4L18.1 12.3"/>', 2.1],

    delete: [24, 24,
      '<path d="M8.8 5.2H19.2A2.2 2.2 0 0 1 21.4 7.4V16.6A2.2 2.2 0 0 1 19.2 18.8H8.8L2.6 12Z"/>' +
      '<path d="M12.2 9.4L16.6 14.0M16.6 9.4L12.2 14.0"/>', 1.9],

    /* 设置：两条轨道各带一个旋钮。轨道断开成两段，
       这样旋钮内部不需要填底色，换任何背景都不会露馅。 */
    sliders: [24, 24,
      '<path d="M3.6 8.6H6.2M11.8 8.6H20.4"/><circle cx="9" cy="8.6" r="2.6"/>' +
      '<path d="M3.6 15.4H12.2M17.8 15.4H20.4"/><circle cx="15" cy="15.4" r="2.6"/>', 1.9],

    filter: [24, 24, '<path d="M4.4 7.2H19.6M7.6 12H16.4M10.4 16.8H13.6"/>', 2],

    edit: [24, 24,
      '<path d="M11.4 5H6.6A2.6 2.6 0 0 0 4 7.6V17.4A2.6 2.6 0 0 0 6.6 20H16.4A2.6 2.6 0 0 0 19 17.4V12.6"/>' +
      '<path d="M17.5 3.9L20.1 6.5L11.8 14.8H9.2V12.2Z"/>', 1.9],

    trash: [24, 24,
      '<path d="M4.8 6.8H19.2"/>' +
      '<path d="M9.3 6.8V5.3A1.7 1.7 0 0 1 11 3.6H13A1.7 1.7 0 0 1 14.7 5.3V6.8"/>' +
      '<path d="M6.5 6.8L7.4 18.9A2.3 2.3 0 0 0 9.7 21.1H14.3A2.3 2.3 0 0 0 16.6 18.9L17.5 6.8"/>' +
      '<path d="M10.3 10.6V17.3M13.7 10.6V17.3"/>', 1.9],

    share: [24, 24,
      '<path d="M12 3.6V15.2"/><path d="M7.8 7.8L12 3.6L16.2 7.8"/>' +
      '<path d="M4.8 14.2V18.6A2.4 2.4 0 0 0 7.2 21H16.8A2.4 2.4 0 0 0 19.2 18.6V14.2"/>', 1.9],

    calendar: [24, 24,
      '<rect x="3.2" y="5.2" width="17.6" height="15.6" rx="4"/>' +
      '<path d="M3.2 10.4H20.8"/><path d="M8.2 3.2V6.6M15.8 3.2V6.6"/>', 1.9],

    info: [24, 24,
      '<circle cx="12" cy="12" r="9"/><path d="M12 11.2V16.8"/>' +
      '<circle cx="12" cy="7.9" r="1.05" fill="currentColor" stroke="none"/>', 1.9],

    user: [24, 24, '<circle cx="12" cy="8.2" r="4"/><path d="M4.6 20.4C4.6 16.8 8 14.6 12 14.6C16 14.6 19.4 16.8 19.4 20.4"/>', 1.9],

    sparkle: [24, 24,
      '<path d="M11.6 2.6L13.5 7.7L18.6 9.6L13.5 11.5L11.6 16.6L9.7 11.5L4.6 9.6L9.7 7.7L11.6 2.6Z"/>' +
      '<path d="M18.2 15.2L18.9 17.1L20.8 17.8L18.9 18.5L18.2 20.4L17.5 18.5L15.6 17.8L17.5 17.1L18.2 15.2Z"/>', 1.6],

    receipt: [24, 24,
      '<path d="M5.2 3.4H18.8V20.6L16.5 18.8L14.2 20.6L12 18.8L9.8 20.6L7.5 18.8L5.2 20.6Z"/>' +
      '<path d="M9 8.6H15M9 12.6H13"/>', 1.8],

    /* 复刻上一笔 */
    copy: [24, 24,
      '<rect x="8.6" y="8.6" width="11.8" height="11.8" rx="3"/>' +
      '<path d="M15.4 8.6V6.6A3 3 0 0 0 12.4 3.6H6.6A3 3 0 0 0 3.6 6.6V12.4A3 3 0 0 0 6.6 15.4H8.6"/>', 1.9],

    /* 撤销 */
    undo: [24, 24,
      '<path d="M4 11H14.2A5 5 0 0 1 14.2 21H10"/><path d="M7.6 7.4L4 11L7.6 14.6"/>', 1.9],

    bulb: [24, 24,
      '<path d="M12 2.8A6.5 6.5 0 0 0 5.5 9.3C5.5 11.3 6.5 12.9 7.7 14.1C8.4 14.8 8.7 15.4 8.7 16.2H15.3C15.3 15.4 15.6 14.8 16.3 14.1C17.5 12.9 18.5 11.3 18.5 9.3A6.5 6.5 0 0 0 12 2.8Z"/>' +
      '<path d="M9.1 19H14.9"/><path d="M10.2 21.4H13.8"/>', 1.7],

    /* ------------------------------------------------------ 底部导航 */
    tabHome: [24, 24,
      '<path d="M3.8 10.1L12 3.6L20.2 10.1V19A2.2 2.2 0 0 1 18 21.2H6A2.2 2.2 0 0 1 3.8 19Z"/>' +
      '<path d="M9.4 21.2V14.9H14.6V21.2"/>', 1.8],
    tabHomeFill: [24, 24,
      '<path d="M3.5 10.05L12 3.3L20.5 10.05V19A2.4 2.4 0 0 1 18.1 21.4H5.9A2.4 2.4 0 0 1 3.5 19V10.05Z' +
      'M9.4 21.4V15.1A1 1 0 0 1 10.4 14.1H13.6A1 1 0 0 1 14.6 15.1V21.4Z" ' +
      'fill="currentColor" fill-rule="evenodd" stroke="none"/>', 1.8],

    tabList: [24, 24,
      '<circle cx="4.8" cy="7" r="1.4" fill="currentColor" stroke="none"/><path d="M9.6 7H20"/>' +
      '<circle cx="4.8" cy="12" r="1.4" fill="currentColor" stroke="none"/><path d="M9.6 12H20"/>' +
      '<circle cx="4.8" cy="17" r="1.4" fill="currentColor" stroke="none"/><path d="M9.6 17H15.8"/>', 1.8],
    tabListFill: [24, 24,
      '<circle cx="4.8" cy="7" r="2.1" fill="currentColor" stroke="none"/><path d="M9.6 7H20"/>' +
      '<circle cx="4.8" cy="12" r="2.1" fill="currentColor" stroke="none"/><path d="M9.6 12H20"/>' +
      '<circle cx="4.8" cy="17" r="2.1" fill="currentColor" stroke="none"/><path d="M9.6 17H15.8"/>', 2.5],

    tabChart: [24, 24,
      '<rect x="3.4" y="10.6" width="4.2" height="9.2" rx="1.6"/>' +
      '<rect x="9.9" y="3.6" width="4.2" height="16.2" rx="1.6"/>' +
      '<rect x="16.4" y="7.6" width="4.2" height="12.2" rx="1.6"/>', 1.8],
    tabChartFill: [24, 24,
      '<rect x="3.4" y="10.6" width="4.2" height="9.2" rx="1.6" fill="currentColor" stroke="none"/>' +
      '<rect x="9.9" y="3.6" width="4.2" height="16.2" rx="1.6" fill="currentColor" stroke="none"/>' +
      '<rect x="16.4" y="7.6" width="4.2" height="12.2" rx="1.6" fill="currentColor" stroke="none"/>', 1.8],

    tabWallet: [24, 24,
      '<rect x="3" y="5.6" width="18" height="12.8" rx="3.4"/><path d="M3 9.8H21"/>' +
      '<circle cx="16.4" cy="14.4" r="1.25" fill="currentColor" stroke="none"/>', 1.8],
    tabWalletFill: [24, 24,
      '<path d="M3 9V8.6A3.4 3.4 0 0 1 6.4 5.2H17.6A3.4 3.4 0 0 1 21 8.6V9Z" fill="currentColor" stroke="none"/>' +
      '<rect x="3" y="9.6" width="18" height="8.8" rx="1.6" fill="currentColor" stroke="none"/>' +
      '<circle cx="16.4" cy="14" r="1.5" fill="var(--card)" stroke="none"/>', 1.8],

    /* ------------------------------------------------------ 消费分类 */
    fork: [24, 24,
      '<path d="M7.2 3.6V10.8M4.4 3.6V7.4A2.8 2.8 0 0 0 10 7.4V3.6M7.2 10.8V20.4"/>' +
      '<path d="M17.4 3.6C15.8 4.6 14.8 6.7 14.8 9.1C14.8 11.2 15.8 12.8 17.4 13.3V20.4"/>', 1.8],

    bus: [24, 24,
      '<rect x="4" y="3.6" width="16" height="14.6" rx="3.2"/><path d="M4 11H20"/>' +
      '<path d="M8.2 18.2V20.4M15.8 18.2V20.4"/>' +
      '<circle cx="8.2" cy="14.6" r="1.05" fill="currentColor" stroke="none"/>' +
      '<circle cx="15.8" cy="14.6" r="1.05" fill="currentColor" stroke="none"/>', 1.8],

    car: [24, 24,
      '<path d="M3.6 13.6V11.3C3.6 10.7 3.8 10.1 4.2 9.6L6.4 6.7C6.8 6.1 7.5 5.8 8.2 5.8H15.8C16.5 5.8 17.2 6.1 17.6 6.7L19.8 9.6C20.2 10.1 20.4 10.7 20.4 11.3V13.6"/>' +
      '<rect x="3.4" y="12.8" width="17.2" height="4.6" rx="1.8"/>' +
      '<circle cx="8" cy="17.6" r="1" fill="currentColor" stroke="none"/>' +
      '<circle cx="16" cy="17.6" r="1" fill="currentColor" stroke="none"/>', 1.8],

    cab: [24, 24,
      '<path d="M4 5.6H20L21.4 9.2H2.6Z"/><path d="M4 9.2H20V15.6A1.8 1.8 0 0 1 18.2 17.4H5.8A1.8 1.8 0 0 1 4 15.6Z"/>' +
      '<path d="M8.4 20.2V17.4M15.6 20.2V17.4"/>' +
      '<circle cx="8.2" cy="13.4" r="1.05" fill="currentColor" stroke="none"/>' +
      '<circle cx="15.8" cy="13.4" r="1.05" fill="currentColor" stroke="none"/>', 1.8],

    bag: [24, 24,
      '<path d="M5.4 8.8H18.6L17.7 19.1A2.6 2.6 0 0 1 15.1 21.5H8.9A2.6 2.6 0 0 1 6.3 19.1Z"/>' +
      '<path d="M8.8 10V6.6A3.2 3.2 0 0 1 12 3.4A3.2 3.2 0 0 1 15.2 6.6V10"/>', 1.8],

    game: [24, 24,
      '<rect x="2.6" y="7.4" width="18.8" height="9.6" rx="4.8"/>' +
      '<path d="M7.4 12.2H9.8M8.6 11V13.4"/>' +
      '<circle cx="15.6" cy="12.2" r="1.2" fill="currentColor" stroke="none"/>', 1.8],

    house: [24, 24,
      '<path d="M3.8 10.2L12 3.6L20.2 10.2V18.9A2.3 2.3 0 0 1 17.9 21.2H6.1A2.3 2.3 0 0 1 3.8 18.9Z"/>' +
      '<path d="M9.6 21.2V14.8H14.4V21.2"/>', 1.8],

    heart: [24, 24,
      '<path d="M12 20.6C12 20.6 3.4 15.4 3.4 9.7A4.9 4.9 0 0 1 8.3 4.8C10.2 4.8 11.4 5.8 12 7C12.6 5.8 13.8 4.8 15.7 4.8A4.9 4.9 0 0 1 20.6 9.7C20.6 15.4 12 20.6 12 20.6Z"/>', 1.8],

    book: [24, 24,
      '<path d="M12 6.4C10.6 5.2 8.8 4.6 6.6 4.6H4V18.4H6.8C8.9 18.4 10.7 19 12 20.2"/>' +
      '<path d="M12 6.4C13.4 5.2 15.2 4.6 17.4 4.6H20V18.4H17.2C15.1 18.4 13.3 19 12 20.2"/>' +
      '<path d="M12 6.4V20.2"/>', 1.8],

    coffee: [24, 24,
      '<path d="M4.2 8.6H16.2V15.4A4.3 4.3 0 0 1 11.9 19.7H8.5A4.3 4.3 0 0 1 4.2 15.4Z"/>' +
      '<path d="M16.2 10.6H17.7A2.6 2.6 0 0 1 17.7 15.8H16.2"/>' +
      '<path d="M7.8 3.4V5.9M11.4 3.4V5.9M15 3.4V5.9"/>', 1.8],

    dots: [24, 24,
      '<circle cx="5.6" cy="12" r="1.7" fill="currentColor" stroke="none"/>' +
      '<circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>' +
      '<circle cx="18.4" cy="12" r="1.7" fill="currentColor" stroke="none"/>', 1.8],

    income: [24, 24,
      '<path d="M12 3.8V14.6"/><path d="M7.6 10.2L12 14.6L16.4 10.2"/>' +
      '<path d="M4.2 16.4V18.2A2.4 2.4 0 0 0 6.6 20.6H17.4A2.4 2.4 0 0 0 19.8 18.2V16.4"/>', 1.8],

    wallet2: [24, 24,
      '<rect x="3" y="5.6" width="18" height="12.8" rx="3.4"/><path d="M3 9.8H21"/>' +
      '<circle cx="16.4" cy="14.4" r="1.25" fill="currentColor" stroke="none"/>', 1.8],

    gift: [24, 24,
      '<rect x="3.4" y="9.8" width="17.2" height="10.2" rx="2.4"/>' +
      '<path d="M2.8 6.6H21.2V9.8H2.8Z"/><path d="M12 6.6V20"/>' +
      '<path d="M12 6.6C12 6.6 10.4 2.6 8.3 2.6C6.9 2.6 6 3.5 6 4.6C6 5.7 6.9 6.6 8.3 6.6Z"/>' +
      '<path d="M12 6.6C12 6.6 13.6 2.6 15.7 2.6C17.1 2.6 18 3.5 18 4.6C18 5.7 17.1 6.6 15.7 6.6Z"/>', 1.7]
  };

  /**
   * 生成图标 SVG 字符串。
   * 颜色一律走 currentColor，由父元素的 color 决定，不再需要传色值。
   */
  function icon(name, size) {
    var d = RAW[name];
    if (!d) return '';
    var vbw = d[0], vbh = d[1], inner = d[2], sw = d[3];
    var s = size || DEFAULT_SIZE[name] || vbw;
    return '<svg viewBox="0 0 ' + vbw + ' ' + vbh + '" width="' + s + '" height="' + s +
      '" fill="none" xmlns="http://www.w3.org/2000/svg" ' +
      'stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round">' +
      inner + '</svg>';
  }

  /* 各图标在版式里的常规尺寸（24 网格下换算得来） */
  var DEFAULT_SIZE = {
    chevronDown: 16, chevronRight: 16, chevronLeft: 16,
    search: 20, plus: 20, minus: 18, check: 18, close: 18,
    arrowUp: 14, arrowDown: 14, delete: 22,
    sliders: 20, filter: 20, edit: 20, trash: 20, share: 20,
    calendar: 20, info: 20, user: 20, sparkle: 22, receipt: 24,
    copy: 20, undo: 20, bulb: 20,
    tabHome: 24, tabHomeFill: 24, tabList: 24, tabListFill: 24,
    tabChart: 24, tabChartFill: 24, tabWallet: 24, tabWalletFill: 24,
    fork: 22, bus: 22, car: 22, cab: 22, bag: 22, game: 22, house: 22,
    heart: 22, book: 22, coffee: 22, dots: 22, income: 22, wallet2: 22, gift: 22
  };

  /**
   * 把页面上所有 <span data-ico="name"> 填成真实 SVG。
   * 颜色走 currentColor；尺寸可用 data-size 覆盖。
   */
  function mountIcons(root) {
    var nodes = (root || document).querySelectorAll('[data-ico]');
    Array.prototype.forEach.call(nodes, function (el) {
      var name = el.getAttribute('data-ico');
      if (!RAW[name]) return;
      var size = parseInt(el.getAttribute('data-size') || '', 10) ||
        DEFAULT_SIZE[name] || RAW[name][0];
      el.innerHTML = icon(name, size);
    });
  }

  w.ICONS = RAW;
  w.icon = icon;
  w.iconSize = DEFAULT_SIZE;
  w.mountIcons = mountIcons;
})(window);
