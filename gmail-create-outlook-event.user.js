// ==UserScript==
// @name         Gmail 選択した日時からOutlookの予定を作成
// @namespace    local.gmail-outlook-calendar
// @version      1.0.0
// @description  Gmailのメール本文で選択した日付・日時からOutlookの予定作成画面を開く
// @match        https://mail.google.com/mail/u/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const DEFAULT_TITLE = '予定';
  const DURATION_MINUTES = 60;
  const MAX_SELECTION_LENGTH = 1000;

  // Outlookで複数アカウントを利用している場合は、
  // 必要に応じて /calendar/0/deeplink/compose などに変更する。
  const OUTLOOK_COMPOSE_URL =
    'https://outlook.live.com/calendar/deeplink/compose';

  const MINUTE_MS = 60 * 1000;
  const DAY_MS = 24 * 60 * MINUTE_MS;
  const JST_OFFSET_MS = 9 * 60 * MINUTE_MS;

  const button = document.createElement('a');
  button.textContent = '📅 Outlookの予定を作成';
  button.target = '_blank';
  button.rel = 'noopener noreferrer';

  Object.assign(button.style, {
    position: 'fixed',
    right: '24px',
    bottom: '24px',
    zIndex: '2147483647',
    display: 'none',
    padding: '12px 18px',
    borderRadius: '8px',
    background: '#0078d4',
    color: '#fff',
    fontSize: '15px',
    fontFamily: 'sans-serif',
    fontWeight: 'bold',
    textDecoration: 'none',
    boxShadow: '0 3px 12px rgba(0, 0, 0, 0.25)',
    cursor: 'pointer',
  });

  document.body.appendChild(button);

  // ボタンを押しても本文の選択を維持する。
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
  });

  function hideButton() {
    button.style.display = 'none';
    button.removeAttribute('href');
  }

  function isMessageDetailPage() {
    // Gmailでは詳細画面の識別子がURLの末尾にある。
    // 新形式のFM...と、旧形式の16進数IDに対応する。
    const hash = location.hash.replace(/\/$/, '');
    const parts = hash.slice(1).split('/');

    const isSupportedFolder =
      ['inbox', 'all', 'sent', 'drafts', 'spam', 'trash',
        'starred', 'important', 'snoozed'].includes(parts[0]);

    const isLabelOrSearch =
      ['label', 'search'].includes(parts[0]);

    if (
      !(isSupportedFolder && parts.length === 2) &&
      !(isLabelOrSearch && parts.length >= 3)
    ) {
      return false;
    }

    const messageId = parts[parts.length - 1];

    return /^(?:FM[A-Za-z0-9_-]+|[a-fA-F0-9]{16,})$/.test(
      messageId
    );
  }

  function currentYearInJapan() {
    return new Date(
      Date.now() + JST_OFFSET_MS
    ).getUTCFullYear();
  }

  function parseDateTime(text) {
    const normalized = text
      .normalize('NFKC')
      .replace(/\u00a0/g, ' ');

    // 年は省略可能。
    const datePattern =
      /(?<!\d)(?:(\d{4})\s*(?:年|[/-])\s*)?(\d{1,2})\s*(?:月|[/-])\s*(\d{1,2})(?!\d)\s*日?/g;

    const dates = [...normalized.matchAll(datePattern)];

    // 日付がない場合や、複数ある場合は対象外。
    if (dates.length !== 1) {
      return null;
    }

    const dateMatch = dates[0];
    const year = dateMatch[1]
      ? Number(dateMatch[1])
      : currentYearInJapan();
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);

    if (
      year < 1000 ||
      month < 1 || month > 12 ||
      day < 1 || day > 31
    ) {
      return null;
    }

    const date = new Date(Date.UTC(year, month - 1, day));

    // 存在しない日付を除外する。
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    // 12:00、12時30分、12時、12時半に対応。
    // 日付とは別行にある時刻も抽出する。
    const timePattern =
      /(?<!\d)(\d{1,2})\s*(?::\s*(\d{2})(?!\d)|時(?:\s*(\d{1,2})\s*分|(半))?)/g;

    const times = [...normalized.matchAll(timePattern)];

    // 時刻がなければ終日予定。
    if (times.length === 0) {
      return {
        allDay: true,
        start: date.toISOString().slice(0, 10),
        end: new Date(date.getTime() + DAY_MS)
          .toISOString()
          .slice(0, 10),
        label: `${year}/${month}/${day}・終日`,
      };
    }

    if (times.length > 2) {
      return null;
    }

    const readTime = (match) => {
      const hour = Number(match[1]);
      const minute = match[4]
        ? 30
        : Number(match[2] ?? match[3] ?? 0);

      if (
        hour < 0 || hour > 23 ||
        minute < 0 || minute > 59
      ) {
        return null;
      }

      return { hour, minute };
    };

    const startTime = readTime(times[0]);

    if (!startTime) {
      return null;
    }

    // 日本時間をUTCに変換する。
    const start = new Date(Date.UTC(
      year,
      month - 1,
      day,
      startTime.hour - 9,
      startTime.minute
    ));

    let end;

    if (times.length === 2) {
      const between = normalized.slice(
        times[0].index + times[0][0].length,
        times[1].index
      );

      // 2つの時刻が範囲表記でつながっている場合だけ許可。
      if (!/^\s*(?:-|~|〜|～|–|—|から)\s*$/.test(between)) {
        return null;
      }

      const endTime = readTime(times[1]);

      if (!endTime) {
        return null;
      }

      end = new Date(Date.UTC(
        year,
        month - 1,
        day,
        endTime.hour - 9,
        endTime.minute
      ));

      if (end.getTime() === start.getTime()) {
        return null;
      }

      // 23:30-00:30などは翌日終了とする。
      if (end < start) {
        end = new Date(end.getTime() + DAY_MS);
      }
    } else {
      end = new Date(
        start.getTime() + DURATION_MINUTES * MINUTE_MS
      );
    }

    const formatJapanTime = (value) => {
      const japan = new Date(value.getTime() + JST_OFFSET_MS);
      const hour = String(japan.getUTCHours()).padStart(2, '0');
      const minute = String(japan.getUTCMinutes()).padStart(2, '0');
      return `${hour}:${minute}`;
    };

    const endsNextDay =
      end.getTime() + JST_OFFSET_MS >= date.getTime() + DAY_MS;

    return {
      allDay: false,
      start: start.toISOString(),
      end: end.toISOString(),
      label:
        `${year}/${month}/${day} ` +
        `${formatJapanTime(start)}〜${formatJapanTime(end)}` +
        (endsNextDay ? '（翌日終了）' : ''),
    };
  }

  function updateButton() {
    if (!isMessageDetailPage()) {
      hideButton();
      return;
    }

    const selection = window.getSelection();

    if (
      !selection ||
      selection.isCollapsed ||
      selection.rangeCount !== 1
    ) {
      hideButton();
      return;
    }

    const toElement = (node) =>
      node?.nodeType === Node.ELEMENT_NODE
        ? node
        : node?.parentElement;

    const range = selection.getRangeAt(0);
    const startElement = toElement(range.startContainer);
    const endElement = toElement(range.endContainer);

    // Gmailのメール本文領域。
    // この判定はGmailのHTML構造に依存する。
    const messageBody = startElement?.closest('.a3s');

    if (
      !messageBody ||
      !endElement ||
      !messageBody.contains(endElement)
    ) {
      hideButton();
      return;
    }

    const selectedText = selection.toString();

    // 大量選択時は日時解析をスキップする。
    if (selectedText.length > MAX_SELECTION_LENGTH) {
      hideButton();
      return;
    }

    const text = selectedText.trim();
    const event = parseDateTime(text);

    if (!event) {
      hideButton();
      return;
    }

    const url = new URL(OUTLOOK_COMPOSE_URL);

    url.search = new URLSearchParams({
      path: '/calendar/action/compose',
      rru: 'addevent',
      subject: DEFAULT_TITLE,
      startdt: event.start,
      enddt: event.end,
      allday: String(event.allDay),
      body: `Gmailから選択した内容:\n${text}`,
    }).toString();

    button.href = url.href;
    button.title = `${event.label}（日本時間）`;
    button.style.display = 'block';
  }

  // 開く直前にも詳細画面と選択内容を確認する。
  button.addEventListener('click', (event) => {
    updateButton();

    if (!button.hasAttribute('href')) {
      event.preventDefault();
    }
  });

  document.addEventListener('selectionchange', updateButton);

  // 一覧への移動や別メールへの移動時にボタンを隠す。
  window.addEventListener('hashchange', hideButton);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideButton();
    }
  });
})();