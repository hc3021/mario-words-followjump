/* ============================================================
   core/rules.js —— 纯逻辑规则层（无 DOM、无浏览器 API）
   ------------------------------------------------------------
   目的：这一层将来可以原样搬进 微信小游戏 / 抖音小游戏。
   · 浏览器：加载本文件后用 window.Rules.*
   · 小游戏：require 本文件后用 Rules.*
   所以这里只用最朴素的 ES5 写法，不用任何 DOM、window、fetch、存储。
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 速度 ---------- */
  var SPEED_MIN = 0.5, SPEED_MAX = 3.0, SPEED_DEFAULT = 1.0;
  function clampSpeed(v) {
    v = parseFloat(v);
    if (!isFinite(v)) v = SPEED_DEFAULT;
    return Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(v * 10) / 10));
  }
  function speedDescriptor(v) {
    if (v <= 0.7) return '🌱 慢速档：砖块漂得慢，孩子有充足时间站稳、准备、再跳。适合第一次玩或年龄小。';
    if (v <= 1.1) return '🚶 标准档：默认速度，节奏舒适，日常练习用这个。';
    if (v <= 1.6) return '🏃 偏快档：砖块明显加速，需要连续起跳，注意力更集中。适合熟练后提效。';
    if (v <= 2.2) return '⚡ 快速档：很有挑战性，孩子要快速判断哪个是对的。适合大一点的孩子或冲刺复习。';
    return '🔥 极限档：极快节奏，主要用于「快速过一遍已会的词」，不建议新词用。';
  }

  /* ---------- 词库解析 ---------- */
  // 规则：先按「第一个中文字符」切；没有中文再按 Tab/多空格/单空格切
  function parseWordLine(line) {
    var t = String(line).trim();
    if (!t) return null;
    var zi = t.search(/[㐀-鿿]/);
    if (zi > 0) {
      var en = t.slice(0, zi).trim(), zh = t.slice(zi).trim();
      if (en && zh) return { en: en, zh: zh };
    }
    var dm = t.match(/^(.+?)(?:\t+|\s{2,})(.+)$/);
    if (dm && dm[1].trim() && dm[2].trim()) return { en: dm[1].trim(), zh: dm[2].trim() };
    var si = t.indexOf(' ');
    if (si > 0) {
      var e2 = t.slice(0, si).trim(), z2 = t.slice(si + 1).trim();
      if (e2 && z2) return { en: e2, zh: z2 };
    }
    return null;
  }
  function parseWordInput(input) {
    var lines = String(input).split(/\r?\n/), out = [];
    for (var i = 0; i < lines.length; i++) {
      var w = parseWordLine(lines[i]);
      if (w) out.push(w);
    }
    return out;
  }

  /* ---------- 出题（本地模式用；在线模式由服务端出题，规则保持一致） ----------
     规则：1 个正确 + 最多 3 个干扰；干扰项与正确项「义项」不同且互不重复；
     词库不够时选项数自动收缩，绝不用 ??? 凑数。 */
  function buildRound(words, index, reverse) {
    var cur = words[index];
    if (!cur) return null;
    var keyOf = function (w) { return reverse ? w.en : w.zh; };
    var correctText = keyOf(cur);
    var used = {};
    used[correctText] = 1;            // 正确项先占位：同义词的干扰项必须排除
    var pool = [];
    for (var i = 0; i < words.length; i++) {
      if (i === index) continue;
      var k = keyOf(words[i]);
      if (used[k]) continue;
      used[k] = 1;
      pool.push(k);
    }
    // 洗牌（不依赖 Math.random 的排序稳定性问题，用 Fisher-Yates）
    for (var j = pool.length - 1; j > 0; j--) {
      var r = Math.floor(Math.random() * (j + 1));
      var tmp = pool[j]; pool[j] = pool[r]; pool[r] = tmp;
    }
    var distractors = pool.slice(0, 3);
    var all = distractors.slice();
    all.push(correctText);
    for (var m = all.length - 1; m > 0; m--) {
      var r2 = Math.floor(Math.random() * (m + 1));
      var t2 = all[m]; all[m] = all[r2]; all[r2] = t2;
    }
    return {
      options: all,
      correctText: correctText,
      correctIndex: all.indexOf(correctText),
      prompt: reverse ? cur.zh : cur.en,
      speak: cur.en
    };
  }

  /* ---------- 星级 ---------- */
  function starRating(totalCorrect, totalWrong) {
    if (!totalCorrect) return 0;
    var acc = totalCorrect / (totalCorrect + totalWrong);
    if (acc >= 0.9 && totalWrong === 0) return 3;
    if (acc >= 0.75) return 2;
    return 1;
  }

  /* ---------- 跳跃几何（由砖块位置反推高度，任何窗口尺寸都"刚好顶住砖块"） ---------- */
  function jumpApexRange(scale, marioHeight, blockTopOff, blockH) {
    var s = scale;
    var headOff = marioHeight * 0.30;
    var minRise = Math.max(40, (blockTopOff - blockH) * s - headOff);
    var maxRise = Math.max(minRise + 18, blockTopOff * s - headOff);
    return { min: minRise, max: maxRise };
  }
  function jumpVelocityFor(gravity, scale, risePx) {
    return -Math.sqrt(2 * gravity * scale * risePx);
  }
  // 真人跳得越明显 → 游戏里跳得越高（但永不超过砖块顶边）
  function jumpTargetRise(band, rise, threshold) {
    var t = Math.max(0, Math.min(1, rise / threshold - 1));
    return band.min + (band.max - band.min) * (0.6 + 0.4 * t);
  }

  /* ---------- 连击 ---------- */
  function comboBonus(streak) { return streak > 0 && streak % 5 === 0 ? 1 : 0; }

  /* ---------- 砖块排版（按汉字个数加宽，字号够大） ---------- */
  function blockWidth(label, scale) {
    var zh = (String(label).match(/[㐀-鿿]/g) || []).length || String(label).length;
    return Math.max(180, zh * 54 + 56) * scale;
  }
  var BLOCK_FONT_MAX = 56, BLOCK_FONT_MIN = 26;
  function blockFontSize(label, width, scale) {
    var lab = String(label || '');
    var zhCount = (lab.match(/[㐀-鿿]/g) || []).length;
    var glyphs = zhCount > 0 ? zhCount : lab.length;
    var avail = width - 34 * scale;
    var fit = avail / (zhCount > 0 ? glyphs : glyphs * 0.56);
    return Math.max(BLOCK_FONT_MIN * scale, Math.min(BLOCK_FONT_MAX * scale, fit));
  }

  return {
    SPEED_MIN: SPEED_MIN, SPEED_MAX: SPEED_MAX, SPEED_DEFAULT: SPEED_DEFAULT,
    clampSpeed: clampSpeed, speedDescriptor: speedDescriptor,
    parseWordLine: parseWordLine, parseWordInput: parseWordInput,
    buildRound: buildRound,
    starRating: starRating,
    jumpApexRange: jumpApexRange, jumpVelocityFor: jumpVelocityFor, jumpTargetRise: jumpTargetRise,
    comboBonus: comboBonus,
    blockWidth: blockWidth, blockFontSize: blockFontSize
  };
});
