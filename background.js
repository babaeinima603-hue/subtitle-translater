'use strict';

// وقتی روی آیکون کلیک میشه یه تب کامل باز میکنه
browser.browserAction.onClicked.addListener(function() {
  browser.tabs.create({ url: browser.extension.getURL('page.html') });
});

// relay پیام‌های content script به تب اصلی
browser.runtime.onMessage.addListener(function(msg, sender) {
  if (msg.type === 'PROG' || msg.type === 'DONE') {
    // به همه تب‌های page.html بفرست
    browser.tabs.query({ url: browser.extension.getURL('page.html') }).then(function(tabs) {
      tabs.forEach(function(t) {
        browser.tabs.sendMessage(t.id, msg).catch(function() {});
      });
    });
  }
});
