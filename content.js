'use strict';

window._srtStop = false;

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function getInput() {
  return document.querySelector('#prompt-textarea') ||
         document.querySelector('div.ProseMirror[contenteditable="true"]') ||
         document.querySelector('div[contenteditable="true"]') ||
         document.querySelector('textarea');
}

function getSendBtn() {
  var b = document.querySelector('[data-testid="send-button"]');
  if (b && !b.disabled) return b;
  b = document.querySelector('button[aria-label="Send message"]');
  if (b && !b.disabled) return b;
  var all = Array.from(document.querySelectorAll('button'));
  b = all.find(function(x) {
    var lbl = (x.getAttribute('aria-label') || '').toLowerCase();
    return (lbl.includes('send') || lbl.includes('ارسال')) && !x.disabled;
  });
  return b || null;
}

async function typeText(text) {
  var inp = getInput();
  if (!inp) throw new Error('input box پیدا نشد');
  inp.focus();
  await sleep(300);
  if (inp.tagName === 'TEXTAREA') {
    var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(inp, text);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    inp.focus();
    document.execCommand('selectAll', false, null);
    if (!document.execCommand('insertText', false, text)) {
      inp.innerText = text;
      inp.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
  }
  await sleep(400);
}

async function clickSend() {
  for (var i = 0; i < 50; i++) {
    var btn = getSendBtn();
    if (btn) { btn.click(); return; }
    await sleep(150);
  }
  var inp = getInput();
  if (inp) {
    inp.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
    }));
  }
}

// ── تشخیص سایت ───────────────────────────────────────────────────
function getSite() {
  var h = location.hostname;
  if (h.includes('claude'))    return 'claude';
  if (h.includes('grok'))      return 'grok';
  if (h.includes('gemini'))    return 'gemini';
  if (h.includes('copilot') || h.includes('bing')) return 'copilot';
  if (h.includes('mistral'))   return 'mistral';
  if (h.includes('perplexity')) return 'perplexity';
  if (h.includes('deepseek'))  return 'deepseek';
  return 'chatgpt';
}

// ── خواندن همه پیام‌های assistant ────────────────────────────────
function getAllReplies() {
  var site = getSite();
  var els;

  if (site === 'claude') {
    els = document.querySelectorAll('[data-testid="assistant-message"]');
    if (!els.length) els = document.querySelectorAll('.font-claude-message');
    if (!els.length) els = document.querySelectorAll('[data-is-streaming]');

  } else if (site === 'gemini') {
    els = document.querySelectorAll('model-response, .model-response-text, [class*="model-response"]');

  } else if (site === 'copilot') {
    els = document.querySelectorAll('[data-content="ai-message"], [class*="assistant"], cib-message[source="bot"]');

  } else if (site === 'mistral') {
    els = document.querySelectorAll('[class*="BotMessage"], [class*="assistant-message"], [data-role="assistant"]');

  } else if (site === 'perplexity') {
    els = document.querySelectorAll('[class*="prose"], .answer, [data-testid="answer"]');

  } else if (site === 'deepseek') {
    els = document.querySelectorAll('[class*="ds-markdown"], [class*="assistant"], [data-role="assistant"]');

  } else if (site === 'grok') {
    els = document.querySelectorAll('[class*="AssistantMessage"], [class*="assistant-message"], .message-bubble:not(.user-bubble)');

  } else {
    // ChatGPT
    els = document.querySelectorAll('[data-message-author-role="assistant"]');
  }
  return els && els.length ? els : [];
}

// ── تشخیص در حال تایپ بودن ───────────────────────────────────────
function isStreaming() {
  // سیگنال‌های عمومی
  if (document.querySelector('[data-testid="stop-button"]'))           return true;
  if (document.querySelector('button[aria-label="Stop streaming"]'))   return true;
  if (document.querySelector('button[aria-label="Stop generating"]'))  return true;
  if (document.querySelector('button[aria-label="Stop"]'))             return true;
  if (document.querySelector('[data-is-streaming="true"]'))            return true;
  // ChatGPT: send button disabled
  var s = document.querySelector('[data-testid="send-button"]');
  if (s && s.disabled) return true;
  // Gemini
  if (document.querySelector('.stop-button, [aria-label="Stop response"]')) return true;
  // Copilot
  if (document.querySelector('cib-typing-indicator, [class*="typing"]')) return true;
  // Perplexity
  if (document.querySelector('[class*="streaming"], [class*="loading-answer"]')) return true;
  // DeepSeek
  if (document.querySelector('[class*="loading"], [class*="generating"]')) return true;
  return false;
}

// ── صبر کن جواب کامل بیاد ───────────────────────────────────────
async function waitForNewReply(beforeCount, readDelaySec, autoDetect) {

  if (autoDetect) {
    // ── حالت آزمایشی: تشخیص خودکار بر اساس محتوا ──

    // مرحله ۱: صبر کن پیام جدید شروع بشه (حداکثر ۳۰ ثانیه)
    for (var w = 0; w < 60; w++) {
      if (window._srtStop) throw new Error('stopped');
      if (getAllReplies().length > beforeCount || isStreaming()) break;
      await sleep(500);
    }

    // مرحله ۲: صبر کن stream تموم بشه
    for (var i = 0; i < 600; i++) {
      if (window._srtStop) throw new Error('stopped');
      if (!isStreaming()) {
        // تأیید: ۳ بار پشت سر هم چک کن متن ثابت مونده
        var t1 = getLastReply();
        await sleep(600);
        var t2 = getLastReply();
        await sleep(600);
        var t3 = getLastReply();
        if (t1 === t2 && t2 === t3 && t1.length > 0) break;
      }
      await sleep(400);
    }

    // pause کوچک برای render نهایی
    await sleep(300);

  } else {
    // ── حالت معمولی: تایمر ثابت + چک stream ──

    // مرحله ۱: صبر ثابت که کاربر تنظیم کرده
    await sleep(readDelaySec * 1000);

    // مرحله ۲: اگه هنوز داره stream میکنه، صبر کن تموم بشه
    for (var j = 0; j < 600; j++) {
      if (window._srtStop) throw new Error('stopped');
      if (!isStreaming()) {
        await sleep(800);
        if (!isStreaming()) break;
      }
      await sleep(500);
    }
  }
}

// ── خواندن آخرین پیام ────────────────────────────────────────────
function getLastReply() {
  var els = getAllReplies();
  if (!els.length) return '';
  return els[els.length - 1].innerText || els[els.length - 1].textContent || '';
}

// ── پارس جواب ────────────────────────────────────────────────────
function parseReply(text, chunk) {
  var res = {};
  text.split('\n').forEach(function(line) {
    var m = line.match(/^\[(\d+)\]\s*(.+)/);
    if (m) res[+m[1]] = m[2].trim();
  });
  // اگه حداقل یه شماره پیدا شد، همونا کافین
  if (Object.keys(res).length > 0) return res;
  // fallback: خط‌به‌خط (فقط وقتی هیچ [N] نیومد)
  var lines = text.split('\n').filter(function(l) {
    var t = l.trim();
    return t && !/^(ترجمه|زیرنویس|بفرمایید|البته|باشه|چشم|sure|here)/i.test(t);
  });
  chunk.forEach(function(s, i) { if (lines[i]) res[s.num] = lines[i].trim(); });
  return res;
}

function buildPrompt(chunk) {
  var numbered = chunk.map(function(s) { return '[' + s.num + '] ' + s.text; }).join('\n');
  return 'این زیرنویس‌های انگلیسی رو به فارسی محاوره‌ای و روان ترجمه کن.\n\n' +
    'قوانین:\n' +
    '۱. ترجمه محاوره‌ای و طبیعی (نه رسمی)\n' +
    '۲. بدون کلمه انگلیسی\n' +
    '۳. فقط ترجمه با همون شماره، بدون توضیح اضافه\n' +
    '۴. فرمت: [شماره] ترجمه فارسی\n\n' +
    'زیرنویس‌ها:\n' + numbered;
}

// ── ارسال chunk با retry هوشمند ──────────────────────────────────
async function sendChunk(chunk, maxRetry, readDelaySec, autoDetect) {
  var parsed  = {};
  var missing = chunk.slice();

  for (var attempt = 0; attempt < maxRetry; attempt++) {
    if (window._srtStop) throw new Error('stopped');
    if (!missing.length) break;

    if (attempt > 0) {
      // اول دوباره آخرین جواب رو بخون — شاید همونجا بود
      await sleep(1000);
      var reread = parseReply(getLastReply(), missing);
      Object.assign(parsed, reread);
      missing = missing.filter(function(s) { return !parsed[s.num]; });
      if (!missing.length) break;
      await sleep(1000);
    }

    var beforeCount = getAllReplies().length;
    await typeText(buildPrompt(missing));
    await clickSend();
    await waitForNewReply(beforeCount, readDelaySec, autoDetect);

    var result = parseReply(getLastReply(), missing);
    Object.assign(parsed, result);
    missing = missing.filter(function(s) { return !parsed[s.num]; });
  }

  return parsed;
}

// ── حلقه اصلی ────────────────────────────────────────────────────
async function runAll(queue, chunkSize, delayMs, maxRetry, readDelaySec, autoDetect) {
  window._srtStop = false;
  var all = {};

  for (var i = 0; i < queue.length; i += chunkSize) {
    if (window._srtStop) break;
    var chunk = queue.slice(i, i + chunkSize);

    try {
      var parsed = await sendChunk(chunk, maxRetry, readDelaySec, autoDetect);
      Object.assign(all, parsed);
      browser.runtime.sendMessage({
        type: 'PROG',
        done: Object.keys(all).length,
        total: queue.length,
        parsed: parsed,
        firstNum: chunk[0].num
      });
    } catch(e) {
      if (e.message === 'stopped') break;
      browser.runtime.sendMessage({ type: 'PROG', err: e.message });
      await sleep(2000);
    }

    if (i + chunkSize < queue.length && !window._srtStop) {
      await sleep(delayMs);
    }
  }

  browser.runtime.sendMessage({ type: 'DONE', all: all });
}

// ── listener ──────────────────────────────────────────────────────
if (window._srtListener) {
  try { browser.runtime.onMessage.removeListener(window._srtListener); } catch(e) {}
}
window._srtListener = function(msg, _s, reply) {
  if (msg.type === 'PING') { reply({ ok: true }); return true; }
  if (msg.type === 'RUN') {
    runAll(msg.queue, msg.chunk, msg.delay, msg.maxRetry || 3, msg.readDelay || 15, msg.autoDetect || false);
    reply({ ok: true });
    return true;
  }
  if (msg.type === 'STOP') { window._srtStop = true; reply({ ok: true }); return true; }
};
browser.runtime.onMessage.addListener(window._srtListener);
