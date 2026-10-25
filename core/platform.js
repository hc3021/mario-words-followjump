/* ============================================================
   core/platform.js —— 平台适配层
   ------------------------------------------------------------
   把「平台专属能力」收在这一处，将来上微信/抖音小游戏时，
   只需要把下面某个实现换成 wx.* / tt.* 版本，其它代码一行不用动。
   现在是浏览器实现；小游戏实现见文件末尾的注释模板。
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.Platform = factory(root);
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';
  var G = root || {};

  /* ================= 浏览器实现（Web） ================= */
  var web = {
    name: 'web',

    /* ---- 存储：localStorage / sessionStorage ---- */
    storage: {
      get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
      remove: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
      sessionGet: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
      sessionSet: function (k, v) { try { sessionStorage.setItem(k, v); return true; } catch (e) { return false; } },
      sessionRemove: function (k) { try { sessionStorage.removeItem(k); } catch (e) {} }
    },

    /* ---- 网络：fetch ---- */
    request: {
      get: function (path) {
        return fetch(path, { cache: 'no-store' }).then(function (r) {
          return r.json().then(function (j) {
            if (!r.ok) { j.error = j.error || ('HTTP_' + r.status); j.__httpFail = true; }
            return j;
          });
        }).catch(function (e) { return { error: 'NETWORK', message: String(e && e.message || e) }; });
      },
      post: function (path, body) {
        return fetch(path, {
          method: 'POST', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {})
        }).then(function (r) {
          return r.json().then(function (j) {
            if (!r.ok) { j.error = j.error || ('HTTP_' + r.status); j.__httpFail = true; }
            return j;
          });
        }).catch(function (e) { return { error: 'NETWORK', message: String(e && e.message || e) }; });
      }
    },

    /* ---- 语音朗读：Web Speech API ---- */
    speech: {
      supported: function () { return typeof speechSynthesis !== 'undefined'; },
      speak: function (text, opts) {
        if (typeof speechSynthesis === 'undefined' || !text) return;
        try { speechSynthesis.cancel(); } catch (e) {}
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US'; u.rate = (opts && opts.rate) || 0.85; u.pitch = (opts && opts.pitch) || 1.05;
        if (G.__speechVoice) u.voice = G.__speechVoice;
        try { speechSynthesis.speak(u); } catch (e) {}
      },
      cancel: function () { try { speechSynthesis.cancel(); } catch (e) {} }
    },

    /* ---- 音频：Web Audio ---- */
    audio: {
      ctx: null,
      context: function () {
        if (!this.ctx) {
          var AC = G.AudioContext || G.webkitAudioContext;
          if (!AC) return null;
          this.ctx = new AC();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(function () {});
        return this.ctx;
      },
      unlocked: false
    },

    /* ---- 环境能力 ---- */
    caps: {
      dom: typeof document !== 'undefined',
      webcam: !!(G.navigator && G.navigator.mediaDevices && G.navigator.mediaDevices.getUserMedia),
      raf: typeof G.requestAnimationFrame === 'function',
      canvas2d: typeof G.createCanvas === 'function' || (typeof document !== 'undefined' && !!document.createElement)
    }
  };

  /* ================= 微信小游戏实现（模板，当前未启用） =================
     用法：把下面这段按需接上，core/platform.js 顶部改成按环境选实现即可。
       storage  : wx.getStorageSync / wx.setStorageSync / wx.removeStorageSync
       request  : wx.request({url, method, data}) → Promise 包装
       speech   : 微信无 speechSynthesis → 用 wx.createInnerAudioContext 播预录音频
                  （需把每个单词的 mp3 放进 package，体积会变大）
       audio    : wx.createInnerAudioContext()
       canvas   : wx.createCanvas() → getContext('2d')，与 Web Canvas2D 基本一致
     注意：小游戏没有 DOM → 设置页/HUD/结算页要用 Canvas 重画或用 UI 框架，
           这部分属于 UI 层重写，与本文件的适配层是两件事。
  ======================================================================== */

  /* ================= 抖音小游戏实现（模板，当前未启用） =================
       存储 wx→tt：tt.getStorageSync / tt.setStorageSync
       网络：tt.request
       音频：tt.createInnerAudioContext
       语音：tt.speak? （以抖音开放平台当前文档为准）
  ======================================================================== */

  return web;
});
