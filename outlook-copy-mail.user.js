// ==UserScript==
// @name         Outlook: Copy Message Menu Item
// @namespace    https://outlook.live.com/
// @version      0.5.0
// @description  Outlook.comのメールメニューに「メールをコピー」を追加する
// @match        https://outlook.live.com/mail/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const MENU_ITEM_ID =
    'outlook-copy-message-menu-item';

  const DEBUG = false;

  let lastMessageContainer = null;
  let lastMenuButton = null;

  // ------------------------------------------------------------
  // 共通
  // ------------------------------------------------------------

  function debug(...args) {
    if (DEBUG) {
      console.log(
        '[Outlook Copy]',
        ...args
      );
    }
  }

  function isVisible(el) {
    if (!el) {
      return false;
    }

    const style =
      getComputedStyle(el);

    const rect =
      el.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function normalizeText(text) {
    return (text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getInnerText(el) {
    return (
      el?.innerText?.trim() || ''
    );
  }

  function extractEmails(text) {
    return (
      (text || '').match(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig
      ) || []
    );
  }

  function formatNameAndEmail(
    name,
    email
  ) {
    name =
      normalizeText(name);

    email =
      normalizeText(email);

    if (!email) {
      return '';
    }

    if (!name) {
      return email;
    }

    if (
      name.toLowerCase() ===
      email.toLowerCase()
    ) {
      return email;
    }

    return `${name} <${email}>`;
  }

  // ------------------------------------------------------------
  // 「…」ボタンからメール1通分のコンテナを取得
  // ------------------------------------------------------------

  function findMessageContainerFromButton(
    button
  ) {
    if (!button) {
      return null;
    }

    let el = button;

    /*
     * _FROM / _DATETIMEだけで判断すると、
     * Outlookのヘッダー部分だけを取得してしまう。
     *
     * そのため、
     *
     * ・Fromが存在
     * ・Dateが存在
     * ・ある程度大きい
     * ・本文を含む程度のテキスト量がある
     *
     * という条件でメール1通分の祖先を探す。
     */
    for (
      let i = 0;
      el && i < 20;
      i++, el = el.parentElement
    ) {
      const rect =
        el.getBoundingClientRect();

      const text =
        getInnerText(el);

      const hasFrom =
        !!el.querySelector(
          '[id$="_FROM"]'
        );

      const hasDate =
        !!el.querySelector(
          [
            '[data-testid="SentReceivedSavedTime"]',
            '[id$="_DATETIME"]',
          ].join(',')
        );

      if (
        hasFrom &&
        hasDate &&
        rect.width >= 400 &&
        rect.height >= 250 &&
        text.length >= 150
      ) {
        debug(
          'message container',
          el
        );

        return el;
      }
    }

    /*
     * fallback
     */
    el = button;

    for (
      let i = 0;
      el && i < 20;
      i++, el = el.parentElement
    ) {
      const rect =
        el.getBoundingClientRect();

      const text =
        getInnerText(el);

      if (
        rect.width >= 400 &&
        rect.height >= 250 &&
        text.length >= 150 &&
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
          .test(text)
      ) {
        debug(
          'message container fallback',
          el
        );

        return el;
      }
    }

    return null;
  }

  // ------------------------------------------------------------
  // From
  // ------------------------------------------------------------

  function getSender(
    messageEl
  ) {
    if (!messageEl) {
      return '';
    }

    const fromEl =
      messageEl.querySelector(
        '[id$="_FROM"]'
      );

    if (!fromEl) {
      return '';
    }

    const text =
      normalizeText(
        fromEl.textContent
      );

    const emails =
      extractEmails(text);

    if (
      emails.length === 0
    ) {
      return text;
    }

    const email =
      emails[0];

    const index =
      text
        .toLowerCase()
        .indexOf(
          email.toLowerCase()
        );

    let name =
      index > 0
        ? text.substring(
            0,
            index
          )
        : '';

    name = name
      .replace(
        /[\s<([{,:：\-–—]+$/g,
        ''
      )
      .trim();

    return formatNameAndEmail(
      name,
      email
    );
  }

  // ------------------------------------------------------------
  // 宛先要素からメールアドレスを取得
  // ------------------------------------------------------------

  function getRecipientEmails(
    el
  ) {
    if (!el) {
      return [];
    }

    const values = [
      el.getAttribute(
        'aria-label'
      ),
      el.textContent,
    ];

    for (
      const child of
        el.querySelectorAll(
          '[aria-label]'
        )
    ) {
      values.push(
        child.getAttribute(
          'aria-label'
        )
      );
    }

    const result = [];
    const seen = new Set();

    for (
      const value of values
    ) {
      for (
        const email of
          extractEmails(value)
      ) {
        const key =
          email.toLowerCase();

        if (
          seen.has(key)
        ) {
          continue;
        }

        seen.add(key);
        result.push(email);
      }
    }

    return result;
  }

  // ------------------------------------------------------------
  // To + Cc
  //
  // Gmail版と同じくTo/CcをまとめてTo:へ出力
  // ------------------------------------------------------------

  function getRecipients(
    messageEl
  ) {
    if (!messageEl) {
      return '';
    }

    const recipientEls = [
      messageEl.querySelector(
        '[id$="_TO"]'
      ),

      messageEl.querySelector(
        '[id$="_CC"]'
      ),

      messageEl.querySelector(
        '[id$="_BCC"]'
      ),
    ].filter(Boolean);

    const result = [];
    const seen = new Set();

    for (
      const el of recipientEls
    ) {
      const emails =
        getRecipientEmails(el);

      for (
        const email of emails
      ) {
        const key =
          email.toLowerCase();

        if (
          seen.has(key)
        ) {
          continue;
        }

        seen.add(key);

        const localPart =
          email.split('@')[0];

        result.push(
          formatNameAndEmail(
            localPart,
            email
          )
        );
      }
    }

    return result.join(', ');
  }

  // ------------------------------------------------------------
  // Date
  // ------------------------------------------------------------

  function pad2(value) {
    return String(value)
      .padStart(2, '0');
  }

  function parseDateText(
    value
  ) {
    const text =
      normalizeText(value);

    if (!text) {
      return '';
    }

    /*
     * Outlook:
     *
     * 2026/10/19 (月) 17:24
     *
     * その他:
     *
     * 2026/10/19 17:24
     * 2026-10-19 17:24
     * 2026.10.19 17:24
     */
    let match =
      text.match(
        /(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?:\s*\([^)]*\))?[\s,]*?(\d{1,2}):(\d{2})/
      );

    if (match) {
      return (
        match[1] +
        '/' +
        pad2(match[2]) +
        '/' +
        pad2(match[3]) +
        ' ' +
        pad2(match[4]) +
        ':' +
        pad2(match[5])
      );
    }

    /*
     * 2026年10月19日(月) 17:24
     */
    match =
      text.match(
        /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日(?:\s*\([^)]*\))?[\s,]*?(\d{1,2}):(\d{2})/
      );

    if (match) {
      return (
        match[1] +
        '/' +
        pad2(match[2]) +
        '/' +
        pad2(match[3]) +
        ' ' +
        pad2(match[4]) +
        ':' +
        pad2(match[5])
      );
    }

    return '';
  }

  function getDate(
    messageEl
  ) {
    if (!messageEl) {
      return '';
    }

    const dateEl =
      messageEl.querySelector(
        '[data-testid="SentReceivedSavedTime"]'
      ) ||
      messageEl.querySelector(
        '[id$="_DATETIME"]'
      );

    if (!dateEl) {
      return '';
    }

    return parseDateText(
      dateEl.textContent
    );
  }

  // ------------------------------------------------------------
  // Subject
  // ------------------------------------------------------------

  function getSubject(
    messageEl
  ) {
    if (messageEl) {
      const messageRect =
        messageEl
          .getBoundingClientRect();

      const headings = [
        ...document.querySelectorAll(
          'h1, h2, h3, [role="heading"]'
        ),
      ].filter((el) => {
        if (
          !isVisible(el)
        ) {
          return false;
        }

        const text =
          normalizeText(
            el.textContent
          );

        if (
          !text ||
          text.length > 500
        ) {
          return false;
        }

        if (
          el.matches(
            [
              '[id$="_FROM"]',
              '[id$="_TO"]',
              '[id$="_CC"]',
              '[id$="_BCC"]',
              '[id$="_DATETIME"]',
            ].join(',')
          )
        ) {
          return false;
        }

        if (
          el.closest(
            '[data-testid="RecipientWell"]'
          )
        ) {
          return false;
        }

        if (
          el.matches(
            '[data-testid="SentReceivedSavedTime"]'
          )
        ) {
          return false;
        }

        const rect =
          el.getBoundingClientRect();

        return (
          rect.bottom <=
            messageRect.top +
              100 &&
          rect.bottom >=
            messageRect.top -
              250 &&
          rect.left >=
            messageRect.left -
              150
        );
      });

      headings.sort(
        (a, b) => {
          const ra =
            a.getBoundingClientRect();

          const rb =
            b.getBoundingClientRect();

          return (
            Math.abs(
              messageRect.top -
                ra.bottom
            ) -
            Math.abs(
              messageRect.top -
                rb.bottom
            )
          );
        }
      );

      if (
        headings[0]
      ) {
        return normalizeText(
          headings[0]
            .textContent
        );
      }
    }

    return document.title
      .replace(
        /\s*[-–—]\s*(Microsoft\s+)?Outlook.*$/i,
        ''
      )
      .trim();
  }

  // ------------------------------------------------------------
  // 本文候補
  // ------------------------------------------------------------

  function findBodyCandidates(
    root
  ) {
    if (!root) {
      return [];
    }

    const selectors = [
      '[aria-label="メッセージ本文"]',
      '[aria-label="Message body"]',
      '[aria-label*="メッセージ本文"]',
      '[aria-label*="Message body"]',
      '[role="document"]',
    ];

    const candidates = [];

    for (
      const selector of selectors
    ) {
      for (
        const el of
          root.querySelectorAll(
            selector
          )
      ) {
        if (
          !isVisible(el)
        ) {
          continue;
        }

        const text =
          getInnerText(el);

        if (
          text.length < 20
        ) {
          continue;
        }

        candidates.push(el);
      }
    }

    return [
      ...new Set(
        candidates
      ),
    ];
  }

  // ------------------------------------------------------------
  // 本文
  // ------------------------------------------------------------

  function getMessageBody(
    messageEl
  ) {
    /*
     * まず対象メール内から探す
     */
    let candidates =
      findBodyCandidates(
        messageEl
      );

    if (
      candidates.length > 0
    ) {
      candidates.sort(
        (a, b) =>
          getInnerText(b)
            .length -
          getInnerText(a)
            .length
      );

      debug(
        'body candidate in message',
        candidates[0]
      );

      return candidates[0];
    }

    /*
     * fallback:
     * document全体から表示中の本文を探す
     */
    candidates =
      findBodyCandidates(
        document
      );

    if (
      candidates.length > 0
    ) {
      if (messageEl) {
        const messageRect =
          messageEl
            .getBoundingClientRect();

        const below =
          candidates.filter(
            (el) => {
              const rect =
                el.getBoundingClientRect();

              return (
                rect.bottom >
                  messageRect.top &&
                rect.top <
                  window.innerHeight
              );
            }
          );

        if (
          below.length > 0
        ) {
          candidates =
            below;
        }
      }

      const screenCenter =
        window.innerHeight / 2;

      candidates.sort(
        (a, b) => {
          const ra =
            a.getBoundingClientRect();

          const rb =
            b.getBoundingClientRect();

          const ca =
            (
              ra.top +
              ra.bottom
            ) / 2;

          const cb =
            (
              rb.top +
              rb.bottom
            ) / 2;

          return (
            Math.abs(
              ca -
                screenCenter
            ) -
            Math.abs(
              cb -
                screenCenter
            )
          );
        }
      );

      debug(
        'body candidate document fallback',
        candidates[0]
      );

      return candidates[0];
    }

    /*
     * 最終fallback:
     * 大きめのdivを本文候補とする
     */
    if (
      !messageEl
    ) {
      return null;
    }

    const dateEl =
      messageEl.querySelector(
        [
          '[data-testid="SentReceivedSavedTime"]',
          '[id$="_DATETIME"]',
        ].join(',')
      );

    const dateRect =
      dateEl
        ?.getBoundingClientRect();

    const divs = [
      ...messageEl
        .querySelectorAll(
          'div'
        ),
    ].filter((el) => {
      if (
        !isVisible(el)
      ) {
        return false;
      }

      if (
        el.querySelector(
          '[id$="_FROM"]'
        )
      ) {
        return false;
      }

      if (
        el.querySelector(
          '[data-testid="RecipientWell"]'
        )
      ) {
        return false;
      }

      const rect =
        el.getBoundingClientRect();

      const text =
        getInnerText(el);

      if (
        text.length < 30 ||
        rect.width < 250
      ) {
        return false;
      }

      if (
        dateRect &&
        rect.bottom <
          dateRect.bottom
      ) {
        return false;
      }

      return true;
    });

    if (
      divs.length === 0
    ) {
      return null;
    }

    divs.sort(
      (a, b) => {
        const ra =
          a.getBoundingClientRect();

        const rb =
          b.getBoundingClientRect();

        const areaA =
          ra.width *
          ra.height;

        const areaB =
          rb.width *
          rb.height;

        return (
          areaA -
          areaB
        );
      }
    );

    debug(
      'body div fallback',
      divs[0]
    );

    return divs[0];
  }

  // ------------------------------------------------------------
  // コピーする内容
  // ------------------------------------------------------------

  function buildText() {
    const messageEl =
      lastMessageContainer;

    if (!messageEl) {
      debug(
        'lastMessageContainer is null'
      );

      return null;
    }

    const bodyEl =
      getMessageBody(
        messageEl
      );

    if (!bodyEl) {
      debug(
        'body not found',
        messageEl
      );

      return null;
    }

    const from =
      getSender(
        messageEl
      );

    const to =
      getRecipients(
        messageEl
      );

    const date =
      getDate(
        messageEl
      );

    const subject =
      getSubject(
        messageEl
      );

    const body =
      bodyEl
        .innerText
        .trim();

    debug({
      from,
      to,
      date,
      subject,
      body,
      bodyEl,
      messageEl,
    });

    return [
      `From: ${from}`,
      `To: ${to}`,
      `Date: ${date}`,
      `Subject: ${subject}`,
      '',
      body,
    ].join('\n');
  }

  // ------------------------------------------------------------
  // 通知
  // ------------------------------------------------------------

  function showToast(
    message
  ) {
    document
      .getElementById(
        'outlook-copy-message-toast'
      )
      ?.remove();

    const toast =
      document.createElement(
        'div'
      );

    toast.id =
      'outlook-copy-message-toast';

    toast.textContent =
      message;

    Object.assign(
      toast.style,
      {
        position:
          'fixed',

        left:
          '50%',

        bottom:
          '30px',

        transform:
          'translateX(-50%)',

        zIndex:
          '99999999',

        padding:
          '10px 18px',

        borderRadius:
          '4px',

        background:
          '#323232',

        color:
          '#fff',

        fontSize:
          '14px',

        fontFamily:
          '"Segoe UI", Arial, sans-serif',

        boxShadow:
          '0 2px 6px rgba(0,0,0,.3)',
      }
    );

    document.body
      .appendChild(
        toast
      );

    setTimeout(
      () => {
        toast.remove();
      },
      1800
    );
  }

  // ------------------------------------------------------------
  // コピー
  // ------------------------------------------------------------

  function copyMessage() {
    const text =
      buildText();

    if (!text) {
      showToast(
        'メールが見つかりません'
      );

      return;
    }

    try {
      if (
        typeof GM_setClipboard ===
        'function'
      ) {
        GM_setClipboard(
          text,
          'text'
        );

        showToast(
          'メールをコピーしました'
        );

        return;
      }

      navigator.clipboard
        .writeText(text)
        .then(() => {
          showToast(
            'メールをコピーしました'
          );
        })
        .catch(
          (error) => {
            console.error(
              '[Outlook Copy]',
              error
            );

            showToast(
              'コピーに失敗しました'
            );
          }
        );

    } catch (error) {
      console.error(
        '[Outlook Copy]',
        error
      );

      showToast(
        'コピーに失敗しました'
      );
    }
  }

  // ------------------------------------------------------------
  // メニューを閉じる
  // ------------------------------------------------------------

  function closeMenu(
    item
  ) {
    const menu =
      item?.closest(
        '[role="menu"]'
      );

    /*
     * documentではなく、
     * 実際のmenuitem自身からEscapeを発生させる。
     *
     * Fluent UI側のメニュー処理へ
     * 通常のキーボード操作に近い形で伝える。
     */
    if (item) {
      item.dispatchEvent(
        new KeyboardEvent(
          'keydown',
          {
            key:
              'Escape',

            code:
              'Escape',

            keyCode:
              27,

            which:
              27,

            bubbles:
              true,

            cancelable:
              true,
          }
        )
      );
    }

    /*
     * Escapeで閉じなかった場合のfallback。
     *
     * まだ同じメニューが表示されていれば、
     * 元の「…」ボタンを再度クリックする。
     */
    setTimeout(
      () => {
        if (
          menu &&
          menu.isConnected &&
          isVisible(menu) &&
          lastMenuButton &&
          lastMenuButton.isConnected
        ) {
          lastMenuButton.click();
        }
      },
      50
    );
  }

  // ------------------------------------------------------------
  // Outlookのメール用「…」メニュー判定
  // ------------------------------------------------------------

  function isMessageActionMenu(
    menu
  ) {
    const text =
      normalizeText(
        menu.innerText
      );

    return (
      (
        text.includes(
          '他の返信アクション'
        ) ||
        /other reply actions/i
          .test(text)
      ) &&
      (
        text.includes(
          '削除'
        ) ||
        /\bdelete\b/i
          .test(text)
      ) &&
      (
        text.includes(
          '未開封にする'
        ) ||
        /mark as unread/i
          .test(text)
      )
    );
  }

  function getVisibleMenus() {
    return [
      ...document.querySelectorAll(
        '[role="menu"]'
      ),
    ].filter(
      isVisible
    );
  }

  // ------------------------------------------------------------
  // メニュー項目検索
  // ------------------------------------------------------------

  function findMenuItemByText(
    menu,
    patterns
  ) {
    const items = [
      ...menu.querySelectorAll(
        '[role="menuitem"]'
      ),
    ];

    return (
      items.find(
        (item) => {
          const text =
            normalizeText(
              item.innerText
            );

          return patterns.some(
            (pattern) =>
              typeof pattern ===
              'string'
                ? text.includes(
                    pattern
                  )
                : pattern.test(
                    text
                  )
          );
        }
      ) ||
      null
    );
  }

  // ------------------------------------------------------------
  // 複製元のOutlook動作用属性を削除
  // ------------------------------------------------------------

  function removeActionAttributes(
    root
  ) {
    const elements = [
      root,
      ...root.querySelectorAll(
        '*'
      ),
    ];

    for (
      const el of elements
    ) {
      el.removeAttribute(
        'id'
      );

      el.removeAttribute(
        'data-testid'
      );

      el.removeAttribute(
        'data-automationid'
      );

      el.removeAttribute(
        'aria-keyshortcuts'
      );
    }
  }

  // ------------------------------------------------------------
  // メニューラベルを書き換える
  // ------------------------------------------------------------

  function replaceMenuItemLabel(
    item,
    label
  ) {
    const walker =
      document.createTreeWalker(
        item,
        NodeFilter.SHOW_TEXT
      );

    const nodes = [];

    let node;

    while (
      (
        node =
          walker.nextNode()
      )
    ) {
      const text =
        normalizeText(
          node.nodeValue
        );

      if (text) {
        nodes.push({
          node,
          text,
        });
      }
    }

    if (
      nodes.length === 0
    ) {
      item.textContent =
        label;

      return;
    }

    nodes.sort(
      (a, b) =>
        b.text.length -
        a.text.length
    );

    nodes[0]
      .node
      .nodeValue =
        label;

    for (
      let i = 1;
      i < nodes.length;
      i++
    ) {
      nodes[i]
        .node
        .nodeValue =
          '';
    }
  }

  // ------------------------------------------------------------
  // 「メールをコピー」作成
  // ------------------------------------------------------------

  function createMenuItem(
    template
  ) {
    const item =
      template.cloneNode(
        true
      );

    removeActionAttributes(
      item
    );

    item.id =
      MENU_ITEM_ID;

    replaceMenuItemLabel(
      item,
      'メールをコピー'
    );

    item.setAttribute(
      'role',
      'menuitem'
    );

    item.setAttribute(
      'aria-label',
      'メールをコピー'
    );

    /*
     * Outlook標準のメニュー項目と同じく、
     * フォーカス可能にする。
     */
    item.tabIndex = 0;

    /*
     * 複製元のアイコンを非表示にする。
     */
    for (
      const svg of
        item.querySelectorAll(
          'svg'
        )
    ) {
      svg.style.visibility =
        'hidden';
    }

    for (
      const icon of
        item.querySelectorAll(
          'i[data-fui-icon]'
        )
    ) {
      icon.style.visibility =
        'hidden';
    }

    item.onclick =
      null;

    item.onmousedown =
      null;

    /*
     * pointerdownは意図的に処理しない。
     *
     * preventDefaultしないことで、
     * ブラウザ / Outlook本来の
     * フォーカス処理をそのまま動かす。
     */

    item.addEventListener(
      'click',
      (event) => {
        /*
         * cloneNodeではJSのaddEventListenerは
         * コピーされないため、
         * 複製元の「未開封にする」が
         * 実行されることはない。
         */
        event.stopPropagation();

        /*
         * 念のため明示的にも
         * 「メールをコピー」へフォーカスする。
         */
        try {
          item.focus({
            preventScroll: true,
          });
        } catch {
          item.focus();
        }

        copyMessage();

        /*
         * フォーカスされた
         * 「メールをコピー」自身からEscapeを発生させる。
         */
        closeMenu(
          item
        );
      }
    );

    return item;
  }

  // ------------------------------------------------------------
  // 「メールをコピー」をメニューへ追加
  // ------------------------------------------------------------

  function injectMenuItem() {
    const menus =
      getVisibleMenus();

    for (
      const menu of menus
    ) {
      if (
        !isMessageActionMenu(
          menu
        )
      ) {
        continue;
      }

      if (
        menu.querySelector(
          `#${MENU_ITEM_ID}`
        )
      ) {
        continue;
      }

      /*
       * 「未開封にする」をテンプレートにする。
       */
      const template =
        findMenuItemByText(
          menu,
          [
            '未開封にする',
            /mark as unread/i,
          ]
        );

      if (!template) {
        continue;
      }

      const item =
        createMenuItem(
          template
        );

      /*
       * 順序:
       *
       * 削除
       * 未開封にする
       * メールをコピー
       * フラグを設定する
       */
      const reference =
        findMenuItemByText(
          menu,
          [
            'フラグを設定する',
            /flag/i,
          ]
        );

      if (
        reference
          ?.parentElement
      ) {
        reference
          .parentElement
          .insertBefore(
            item,
            reference
          );

      } else {
        template
          .parentElement
          ?.insertBefore(
            item,
            template.nextSibling
          );
      }

      debug(
        'menu item injected',
        item
      );
    }
  }

  // ------------------------------------------------------------
  // Outlookのメニュー操作を監視
  // ------------------------------------------------------------

  document.addEventListener(
    'pointerdown',
    (event) => {
      const button =
        event.target.closest(
          'button, [role="button"]'
        );

      if (button) {
        const label =
          normalizeText(
            [
              button.getAttribute(
                'aria-label'
              ),

              button.getAttribute(
                'title'
              ),

              button.textContent,
            ]
              .filter(Boolean)
              .join(' ')
          );

        const hasPopup =
          button.getAttribute(
            'aria-haspopup'
          ) === 'menu';

        if (
          hasPopup ||
          /その他|アクション|操作|more/i
            .test(label)
        ) {
          const container =
            findMessageContainerFromButton(
              button
            );

          if (container) {
            lastMessageContainer =
              container;

            /*
             * メニューを開いた元の
             * 「…」ボタンも保存する。
             *
             * Escapeでメニューが閉じなかった場合の
             * fallbackに使用する。
             */
            lastMenuButton =
              button;

            debug(
              'lastMessageContainer updated',
              container
            );

            debug(
              'lastMenuButton updated',
              button
            );
          }
        }
      }

      /*
       * Outlookのメニュー生成タイミングに
       * 幅があるので数回試す。
       */
      setTimeout(
        injectMenuItem,
        0
      );

      setTimeout(
        injectMenuItem,
        30
      );

      setTimeout(
        injectMenuItem,
        100
      );

      setTimeout(
        injectMenuItem,
        200
      );
    },
    true
  );

  // ------------------------------------------------------------
  // OutlookはSPAなのでDOM監視
  // ------------------------------------------------------------

  let timer =
    null;

  const observer =
    new MutationObserver(
      () => {
        clearTimeout(
          timer
        );

        timer =
          setTimeout(
            injectMenuItem,
            20
          );
      }
    );

  observer.observe(
    document.body,
    {
      childList:
        true,

      subtree:
        true,
    }
  );
})();