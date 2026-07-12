'use strict';

var subs  = [];
var trans = {};
var site  = 'chatgpt';

var URLS  = { chatgpt:'https://chatgpt.com/', claude:'https://claude.ai/', grok:'https://grok.com/', gemini:'https://gemini.google.com/', copilot:'https://copilot.microsoft.com/', mistral:'https://chat.mistral.ai/', perplexity:'https://www.perplexity.ai/', deepseek:'https://chat.deepseek.com/' };
var MATCH = { chatgpt:['chatgpt.com','chat.openai.com'], claude:['claude.ai'], grok:['grok.com'], gemini:['gemini.google.com'], copilot:['copilot.microsoft.com','bing.com'], mistral:['chat.mistral.ai'], perplexity:['perplexity.ai'], deepseek:['chat.deepseek.com'] };

// ── init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {

  document.getElementById('t-gpt').addEventListener('click', function() { pickSite('chatgpt');    });
  document.getElementById('t-cl' ).addEventListener('click', function() { pickSite('claude');     });
  document.getElementById('t-grk').addEventListener('click', function() { pickSite('grok');       });
  document.getElementById('t-gem').addEventListener('click', function() { pickSite('gemini');     });
  document.getElementById('t-cop').addEventListener('click', function() { pickSite('copilot');    });
  document.getElementById('t-mis').addEventListener('click', function() { pickSite('mistral');    });
  document.getElementById('t-per').addEventListener('click', function() { pickSite('perplexity'); });
  document.getElementById('t-dsk').addEventListener('click', function() { pickSite('deepseek');   });
  document.getElementById('open-btn').addEventListener('click', openSite);
  document.getElementById('clear-btn').addEventListener('click', clearFile);
  document.getElementById('go-btn').addEventListener('click', doStart);
  document.getElementById('stop-btn').addEventListener('click', doStop);
  document.getElementById('dl-btn').addEventListener('click', doDownload);
  document.getElementById('dl-bi-btn').addEventListener('click', doDownloadBilingual);

  // file input
  document.getElementById('file-input').addEventListener('change', function() {
    if (this.files && this.files[0]) readFile(this.files[0]);
  });

  // drag and drop روی folder-box
  var fb = document.getElementById('folder-box');
  fb.addEventListener('click', function() {
    document.getElementById('file-input').click();
  });
  fb.addEventListener('dragover', function(e) {
    e.preventDefault();
    fb.classList.add('drag');
  });
  fb.addEventListener('dragleave', function() {
    fb.classList.remove('drag');
  });
  fb.addEventListener('drop', function(e) {
    e.preventDefault();
    fb.classList.remove('drag');
    var f = e.dataTransfer.files[0];
    if (f && /\.srt$/i.test(f.name)) readFile(f);
    else showErr('فقط فایل .srt قبول میشه');
  });

  // drag روی کل صفحه
  document.body.addEventListener('dragover', function(e) { e.preventDefault(); });
  document.body.addEventListener('drop', function(e) {
    e.preventDefault();
    var f = e.dataTransfer.files[0];
    if (f && /\.srt$/i.test(f.name)) readFile(f);
  });

  // گوش دادن به پیام‌های background
  browser.runtime.onMessage.addListener(function(msg) {
    if (msg.type === 'PROG') onProg(msg);
    if (msg.type === 'DONE') onDone(msg);
  });

  // بارگذاری ذخیره قبلی
  browser.storage.local.get('srtState').then(function(res) {
    if (res.srtState && res.srtState.trans) {
      trans = res.srtState.trans;
      if (Object.keys(trans).length) {
        document.getElementById('dl-btn'   ).style.display = 'block';
        document.getElementById('dl-bi-btn').style.display = 'block';
      }
    }
  });
});

// ── site ─────────────────────────────────────────────────────────
function pickSite(s) {
  site = s;
  var ids = { chatgpt:'t-gpt', claude:'t-cl', grok:'t-grk', gemini:'t-gem', copilot:'t-cop', mistral:'t-mis', perplexity:'t-per', deepseek:'t-dsk' };
  Object.keys(ids).forEach(function(k) {
    var el = document.getElementById(ids[k]);
    if (el) el.className = 'stab' + (k === s ? ' on' : '');
  });
  var names = { chatgpt:'ChatGPT', claude:'Claude.ai', grok:'Grok', gemini:'Gemini', copilot:'Copilot', mistral:'Mistral', perplexity:'Perplexity', deepseek:'DeepSeek' };
  document.getElementById('open-btn').textContent = '🔗 باز کردن ' + (names[s] || s) + ' در تب جدید';
}

function openSite() {
  browser.tabs.create({ url: URLS[site] });
}

// ── file ─────────────────────────────────────────────────────────
function readFile(f) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var parsed = parseSRT(e.target.result);
    if (!parsed.length) { showErr('زیرنویسی در فایل پیدا نشد!'); return; }
    subs  = parsed;
    trans = {};
    clearErr();

    document.getElementById('folder-box').style.display = 'none';
    document.getElementById('pick-label').style.display = 'none';
    var fok = document.getElementById('file-ok');
    fok.style.display = 'flex';
    document.getElementById('fname').textContent = f.name;
    document.getElementById('fcnt' ).textContent = parsed.length + ' خط';
    document.getElementById('s-total').textContent = parsed.length;

    buildTable();
    updStats();

    // اگه ترجمه قبلی برای این فایل داریم، دکمه دانلود رو نشون بده
    if (Object.keys(trans).length) {
      document.getElementById('dl-btn'   ).style.display = 'block';
      document.getElementById('dl-bi-btn').style.display = 'block';
    }
  };
  reader.readAsText(f, 'UTF-8');
}

function clearFile() {
  subs = []; trans = {};
  document.getElementById('folder-box').style.display = '';
  document.getElementById('pick-label').style.display = '';
  document.getElementById('file-ok'   ).style.display = 'none';
  document.getElementById('file-input').value = '';
  document.getElementById('empty-state').style.display = '';
  document.getElementById('sub-table'  ).style.display = 'none';
  document.getElementById('dl-btn'     ).style.display = 'none';
  document.getElementById('dl-bi-btn'  ).style.display = 'none';
  updStats();
}

// ── SRT parser ────────────────────────────────────────────────────
function parseSRT(txt) {
  var res    = [];
  var blocks = txt.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split(/\n{2,}/);
  for (var i = 0; i < blocks.length; i++) {
    var lines = blocks[i].trim().split('\n');
    if (lines.length < 2) continue;
    var num = parseInt(lines[0], 10);
    if (isNaN(num)) continue;
    var tl   = lines[1];
    var text = lines.slice(2).join(' ').replace(/<[^>]+>/g, '').trim();
    if (text) res.push({ num: num, time: tl, text: text });
  }
  return res;
}

// ── table ─────────────────────────────────────────────────────────
function buildTable() {
  document.getElementById('empty-state').style.display = 'none';
  var tbl = document.getElementById('sub-table');
  tbl.style.display = 'table';
  var tbody = document.getElementById('sub-body');
  var html  = '';
  for (var i = 0; i < subs.length; i++) {
    var s = subs[i];
    var fa = trans[s.num] || '';
    html +=
      '<tr id="tr-' + s.num + '">' +
        '<td class="td-num">' + s.num + '</td>' +
        '<td class="td-time">' + esc(s.time) + '</td>' +
        '<td class="td-en">'   + esc(s.text) + '</td>' +
        '<td class="td-fa ' + (fa ? '' : 'nd') + '" id="fa-' + s.num + '">' + (fa ? esc(fa) : '—') + '</td>' +
        '<td><span class="st-badge ' + (fa ? 'st-done' : 'st-wait') + '" id="st-' + s.num + '">' +
          (fa ? '✓' : '...') + '</span></td>' +
      '</tr>';
  }
  tbody.innerHTML = html;
}

function setRow(num, fa) {
  var faEl = document.getElementById('fa-' + num);
  var stEl = document.getElementById('st-' + num);
  if (faEl) { faEl.textContent = fa; faEl.className = 'td-fa'; }
  if (stEl) { stEl.textContent = '✓'; stEl.className = 'st-badge st-done'; }
}

function setBusy(chunk) {
  for (var i = 0; i < chunk.length; i++) {
    var stEl = document.getElementById('st-' + chunk[i].num);
    if (stEl) { stEl.textContent = '⏳'; stEl.className = 'st-badge st-busy'; }
  }
}

// ── stats ─────────────────────────────────────────────────────────
function updStats() {
  var done  = Object.keys(trans).length;
  var total = subs.length;
  var pct   = total ? Math.round(done / total * 100) : 0;
  document.getElementById('s-done').textContent = done;
  document.getElementById('s-total').textContent = total;
  document.getElementById('s-pct').textContent  = pct + '%';
  document.getElementById('pg-bar').style.width = pct + '%';
}

// ── start ─────────────────────────────────────────────────────────
function doStart() {
  clearErr();
  if (!subs.length) { showErr('ابتدا فایل SRT انتخاب کنید'); return; }

  browser.tabs.query({}).then(function(tabs) {
    var tgt = null;
    for (var i = 0; i < tabs.length; i++) {
      try {
        var u = new URL(tabs[i].url);
        for (var j = 0; j < MATCH[site].length; j++) {
          if (u.hostname.indexOf(MATCH[site][j]) !== -1) { tgt = tabs[i]; break; }
        }
      } catch(e) {}
      if (tgt) break;
    }

    if (!tgt) {
      var siteNames = { chatgpt:'ChatGPT', claude:'Claude.ai', grok:'Grok', gemini:'Gemini', copilot:'Copilot', mistral:'Mistral', perplexity:'Perplexity', deepseek:'DeepSeek' };
      showErr('تب ' + (siteNames[site] || site) + ' باز نیست. ابتدا آن را باز کنید.');
      return;
    }

    browser.tabs.sendMessage(tgt.id, { type: 'PING' })
      .then(function(r) {
        if (r && r.ok) sendRun(tgt.id);
        else           injectRun(tgt.id);
      })
      .catch(function() { injectRun(tgt.id); });
  });
}

function injectRun(tabId) {
  browser.tabs.executeScript(tabId, { file: 'content.js' })
    .then(function() { setTimeout(function() { sendRun(tabId); }, 700); })
    .catch(function(e) { showErr('خطا: ' + e.message); });
}

function sendRun(tabId) {
  var queue     = subs.filter(function(s) { return !trans[s.num]; });
  var chunk     = parseInt(document.getElementById('chunk-size').value, 10);
  var delay     = parseFloat(document.getElementById('delay-sec').value) * 1000;
  var readDelay  = parseFloat(document.getElementById('read-delay').value) || 15;
  var autoDetect = document.getElementById('auto-detect').checked;
  var maxRetry   = parseInt(document.getElementById('max-retry').value, 10) || 3;

  browser.tabs.update(tabId, { active: true });
  browser.tabs.sendMessage(tabId, { type: 'RUN', queue: queue, chunk: chunk, delay: delay, readDelay: readDelay, autoDetect: autoDetect, maxRetry: maxRetry });

  document.getElementById('go-btn'  ).style.display = 'none';
  document.getElementById('stop-btn').style.display = 'block';
  setStatus('<span class="dot"></span> در حال ترجمه...');
}

// ── stop ──────────────────────────────────────────────────────────
function doStop() {
  browser.tabs.query({}).then(function(tabs) {
    for (var i = 0; i < tabs.length; i++) {
      try {
        var u = new URL(tabs[i].url);
        for (var j = 0; j < MATCH[site].length; j++) {
          if (u.hostname.indexOf(MATCH[site][j]) !== -1) {
            browser.tabs.sendMessage(tabs[i].id, { type: 'STOP' });
          }
        }
      } catch(e) {}
    }
  });
}

// ── messages ──────────────────────────────────────────────────────
function onProg(msg) {
  if (msg.err) { showErr('خطا: ' + msg.err); return; }
  if (msg.parsed) {
    var keys = Object.keys(msg.parsed);
    for (var i = 0; i < keys.length; i++) {
      var n = parseInt(keys[i], 10);
      trans[n] = msg.parsed[keys[i]];
      setRow(n, msg.parsed[keys[i]]);
    }
    if (msg.firstNum) {
      var row = document.getElementById('tr-' + msg.firstNum);
      if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  setStatus('<span class="dot"></span> ترجمه‌شده: ' + msg.done + ' از ' + msg.total);
  updStats();
  browser.storage.local.set({ srtState: { trans: trans } });
}

function onDone(msg) {
  if (msg.all) {
    var ks = Object.keys(msg.all);
    for (var i = 0; i < ks.length; i++) {
      var n = parseInt(ks[i], 10);
      trans[n] = msg.all[ks[i]];
      setRow(n, msg.all[ks[i]]);
    }
  }
  updStats();
  document.getElementById('stop-btn').style.display = 'none';
  document.getElementById('go-btn'  ).style.display = '';
  document.getElementById('go-btn'  ).textContent   = '🔄 ادامه / تکرار';
  setStatus('✅ ترجمه کامل شد!');
  if (Object.keys(trans).length) {
    document.getElementById('dl-btn'   ).style.display = 'block';
    document.getElementById('dl-bi-btn').style.display = 'block';
  }
  browser.storage.local.set({ srtState: { trans: trans } });
}

// ── download ──────────────────────────────────────────────────────

// خواندن ترجمه‌ها از DOM به عنوان backup (در صورتی که trans خالی باشه)
function getTransFromDOM() {
  var domTrans = {};
  for (var i = 0; i < subs.length; i++) {
    var num = subs[i].num;
    var el  = document.getElementById('fa-' + num);
    if (el && !el.classList.contains('nd') && el.textContent !== '—' && el.textContent.trim()) {
      domTrans[num] = el.textContent.trim();
    }
  }
  return domTrans;
}

function getMergedTrans() {
  // ابتدا trans در حافظه، سپس DOM رو چک میکنه
  var merged = {};
  var domTrans = getTransFromDOM();
  for (var i = 0; i < subs.length; i++) {
    var num = subs[i].num;
    if (trans[num])    merged[num] = trans[num];
    else if (domTrans[num]) merged[num] = domTrans[num];
  }
  return merged;
}

function makeSRT(faOnly) {
  var activeTrans = getMergedTrans();
  var lines = [];
  for (var i = 0; i < subs.length; i++) {
    var s  = subs[i];
    var fa = activeTrans[s.num];
    // اگه ترجمه نداشت و فقط فارسی میخوایم، اون خط رو skip کن
    if (faOnly && !fa) continue;
    lines.push(String(s.num));
    lines.push(s.time);
    if (faOnly) {
      lines.push(fa);
    } else {
      lines.push(s.text);
      if (fa) lines.push(fa);
    }
    lines.push('');
  }
  return '\uFEFF' + lines.join('\r\n');
}

function makeSRTRenumbered(faOnly) {
  // شماره‌گذاری مجدد برای خطوط skip شده
  var activeTrans = getMergedTrans();
  var lines = [];
  var counter = 1;
  for (var i = 0; i < subs.length; i++) {
    var s  = subs[i];
    var fa = activeTrans[s.num];
    if (faOnly && !fa) continue;
    lines.push(String(counter++));
    lines.push(s.time);
    if (faOnly) {
      lines.push(fa);
    } else {
      lines.push(s.text);
      if (fa) lines.push(fa);
    }
    lines.push('');
  }
  return '\uFEFF' + lines.join('\r\n');
}

function triggerDownload(content, filename) {
  var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function doDownload() {
  var activeTrans = getMergedTrans();
  if (!Object.keys(activeTrans).length) {
    showErr('هنوز ترجمه‌ای موجود نیست!');
    return;
  }
  var base = (document.getElementById('fname').textContent || 'subtitle').replace(/\.srt$/i, '');
  triggerDownload(makeSRTRenumbered(true), base + '_fa.srt');
}

function doDownloadBilingual() {
  var activeTrans = getMergedTrans();
  if (!Object.keys(activeTrans).length) {
    showErr('هنوز ترجمه‌ای موجود نیست!');
    return;
  }
  var base = (document.getElementById('fname').textContent || 'subtitle').replace(/\.srt$/i, '');
  triggerDownload(makeSRTRenumbered(false), base + '_bilingual.srt');
}

// ── helpers ───────────────────────────────────────────────────────
function showErr(msg) {
  var el = document.getElementById('err-box');
  el.textContent = '⚠ ' + msg;
  el.style.display = '';
}
function clearErr() { document.getElementById('err-box').style.display = 'none'; }
function setStatus(html) { document.getElementById('status-txt').innerHTML = html; }
function esc(t) {
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
