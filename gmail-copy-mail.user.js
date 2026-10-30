// ==UserScript==
// @name         Gmail: Copy Message Menu Item
// @namespace    https://mail.google.com/
// @version      3.5.0
// @description  Gmailの「︙」メニューに「メールをコピー」を追加する
// @match        https://mail.google.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const MENU_ITEM_ID =
    'gmail-copy-message-menu-item';

  const SEPARATOR_ID =
    'gmail-copy-message-separator';

  // ------------------------------------------------------------
  // 共通
  // ------------------------------------------------------------

  function isVisible(el) {
    if (!el) return false;

    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function normalizeText(text) {
    return (text || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ------------------------------------------------------------
  // Subject
  // ------------------------------------------------------------

  function getSubject() {
    const el =
      document.querySelector(
        'h2[data-thread-perm-id][data-legacy-thread-id]'
      ) ||
      document.querySelector('h2.hP');

    return el?.textContent?.trim() || '';
  }

  // ------------------------------------------------------------
  // 現在表示しているメール本文
  // ------------------------------------------------------------

  function getCurrentMessageBody() {
    const bodies = [
      ...document.querySelectorAll('.a3s')
    ].filter(isVisible);

    if (bodies.length === 0) {
      return null;
    }

    const inViewport = bodies.filter((el) => {
      const rect = el.getBoundingClientRect();

      return (
        rect.bottom > 0 &&
        rect.top < window.innerHeight
      );
    });

    const candidates =
      inViewport.length > 0
        ? inViewport
        : bodies;

    const screenCenter =
      window.innerHeight / 2;

    candidates.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();

      const ca =
        (ra.top + ra.bottom) / 2;

      const cb =
        (rb.top + rb.bottom) / 2;

      return (
        Math.abs(ca - screenCenter) -
        Math.abs(cb - screenCenter)
      );
    });

    return candidates[0];
  }

  // ------------------------------------------------------------
  // メール1通分のコンテナ
  // ------------------------------------------------------------

  function getMessageContainer(bodyEl) {
    if (!bodyEl) return null;

    return (
      bodyEl.closest('.adn') ||
      bodyEl.closest('.gs') ||
      bodyEl.parentElement
    );
  }

  // ------------------------------------------------------------
  // アドレス整形
  //
  // 山田太郎 <yamada@example.com>
  // ------------------------------------------------------------

  function formatAddress(el) {
    if (!el) return '';

    const name =
      el.textContent
        ?.replace(/\s+/g, ' ')
        .trim() || '';

    const email =
      el.getAttribute('email')
        ?.trim() || '';

    if (!email) {
      return name;
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
  // From
  // ------------------------------------------------------------

  function getSender(messageEl) {
    if (!messageEl) return '';

    const sender =
      messageEl.querySelector('.gD[email]') ||
      messageEl.querySelector('.gD');

    return formatAddress(sender);
  }

  // ------------------------------------------------------------
  // To
  // ------------------------------------------------------------

  function getRecipients(messageEl) {
    if (!messageEl) return '';

    const recipientEls = [
      ...messageEl.querySelectorAll('.g2')
    ];

    const recipients = [];
    const seen = new Set();

    for (const el of recipientEls) {
      const value = formatAddress(el);

      if (!value) continue;
      if (seen.has(value)) continue;

      seen.add(value);
      recipients.push(value);
    }

    return recipients.join(', ');
  }

  // ------------------------------------------------------------
  // Date
  // ------------------------------------------------------------

  function getDate(messageEl) {
    if (!messageEl) return '';

    const dateEl =
      messageEl.querySelector('.g3[title]') ||
      messageEl.querySelector('.g3');

    if (!dateEl) {
      return '';
    }

    return (
      dateEl.getAttribute('title')?.trim() ||
      dateEl.textContent?.trim() ||
      ''
    );
  }

  // ------------------------------------------------------------
  // コピーする内容
  // ------------------------------------------------------------

  function buildText() {
    const bodyEl =
      getCurrentMessageBody();

    if (!bodyEl) {
      return null;
    }

    const messageEl =
      getMessageContainer(bodyEl);

    const from =
      getSender(messageEl);

    const to =
      getRecipients(messageEl);

    const date =
      getDate(messageEl);

    const subject =
      getSubject();

    const body =
      bodyEl.innerText.trim();

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

  function showToast(message) {
    document
      .getElementById(
        'gmail-copy-message-toast'
      )
      ?.remove();

    const toast =
      document.createElement('div');

    toast.id =
      'gmail-copy-message-toast';

    toast.textContent = message;

    Object.assign(toast.style, {
      position: 'fixed',
      left: '50%',
      bottom: '30px',
      transform: 'translateX(-50%)',
      zIndex: '9999999',

      padding: '10px 18px',
      borderRadius: '4px',

      background: '#323232',
      color: '#fff',

      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',

      boxShadow:
        '0 2px 6px rgba(0,0,0,.3)',
    });

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 1800);
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
        .catch((error) => {
          console.error(
            '[Gmail Copy]',
            error
          );

          showToast(
            'コピーに失敗しました'
          );
        });

    } catch (error) {
      console.error(
        '[Gmail Copy]',
        error
      );

      showToast(
        'コピーに失敗しました'
      );
    }
  }

  // ------------------------------------------------------------
  // Gmailメニューを閉じる
  // ------------------------------------------------------------

  function closeMenu() {
    setTimeout(() => {
      document.dispatchEvent(
        new KeyboardEvent(
          'keydown',
          {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true,
          }
        )
      );
    }, 0);
  }

  // ------------------------------------------------------------
  // ツールバー切替項目かどうか
  // ------------------------------------------------------------

  function isToolbarSwitchText(text) {
    const value =
      normalizeText(text);

    return (
      value.includes(
        'シンプルなツールバーに切り替える'
      ) ||
      value.includes(
        '詳細なツールバーに切り替える'
      ) ||
      /switch to (simple|detailed|advanced) toolbar/i
        .test(value)
    );
  }

  // ------------------------------------------------------------
  // 「シンプル/詳細ツールバーに切り替える」の行を探す
  //
  // Gmail内部のclassになるべく依存せず、
  // 表示文字列から特定する
  // ------------------------------------------------------------

  function findToolbarSwitchItem(menu) {
    const walker =
      document.createTreeWalker(
        menu,
        NodeFilter.SHOW_TEXT
      );

    let node;

    while (
      (node = walker.nextNode())
    ) {
      if (
        !isToolbarSwitchText(
          node.nodeValue
        )
      ) {
        continue;
      }

      let el =
        node.parentElement;

      /*
       * まず通常のGmail menuitem を探す
       */
      while (
        el &&
        el !== menu
      ) {
        if (
          el.getAttribute('role') ===
            'menuitem' ||
          el.classList.contains('J-N')
        ) {
          return el;
        }

        el =
          el.parentElement;
      }

      /*
       * menuitemが見つからない場合は
       * menu直下の要素まで戻る
       */
      el =
        node.parentElement;

      while (
        el &&
        el.parentElement !== menu
      ) {
        el =
          el.parentElement;
      }

      if (
        el &&
        el !== menu
      ) {
        return el;
      }
    }

    return null;
  }

  // ------------------------------------------------------------
  // 通常のメニュー項目をテンプレートとして取得
  //
  // 「ツールバー切替」自体は特殊なDOM/CSSを使う場合があるため、
  // 直前の通常メニュー（例: ミュート）を複製する
  // ------------------------------------------------------------

  function findNormalMenuTemplate(
    menu,
    switchItem
  ) {
    const candidates = [
      ...menu.querySelectorAll(
        '[role="menuitem"], .J-N'
      )
    ].filter((item) => {
      if (item === switchItem) {
        return false;
      }

      if (
        isToolbarSwitchText(
          item.textContent
        )
      ) {
        return false;
      }

      if (!isVisible(item)) {
        return false;
      }

      return true;
    });

    let template = null;

    /*
     * switchItemより前にある通常項目のうち、
     * 一番最後のものを使う。
     *
     * 通常は「ミュート」などになる。
     */
    for (const item of candidates) {
      const position =
        item.compareDocumentPosition(
          switchItem
        );

      if (
        position &
        Node.DOCUMENT_POSITION_FOLLOWING
      ) {
        template = item;
      }
    }

    /*
     * fallback
     */
    if (!template) {
      template =
        candidates[
          candidates.length - 1
        ] || null;
    }

    return template;
  }

  // ------------------------------------------------------------
  // 複製元のGmail動作用属性を削除
  // ------------------------------------------------------------

  function removeGmailActionAttributes(
    root
  ) {
    const elements = [
      root,
      ...root.querySelectorAll('*')
    ];

    for (const el of elements) {
      el.removeAttribute('id');
      el.removeAttribute('act');
      el.removeAttribute('command');
      el.removeAttribute('jsaction');
      el.removeAttribute('jscontroller');
    }
  }

  // ------------------------------------------------------------
  // 「メールをコピー」項目作成
  // ------------------------------------------------------------

  function createMenuItem(template) {
    const item =
      template.cloneNode(true);

    removeGmailActionAttributes(
      item
    );

    item.id =
      MENU_ITEM_ID;

    /*
     * Gmail標準のラベル部分
     */
    const textEl =
      item.querySelector('.J-N-Jz');

    if (textEl) {
      textEl.textContent =
        'メールをコピー';
    } else {
      /*
       * GmailのDOM構造が違う場合は
       * テキストノードからラベルを特定する
       */
      const walker =
        document.createTreeWalker(
          item,
          NodeFilter.SHOW_TEXT
        );

      const textNodes = [];

      let node;

      while (
        (node = walker.nextNode())
      ) {
        const text =
          normalizeText(
            node.nodeValue
          );

        if (text) {
          textNodes.push({
            node,
            text
          });
        }
      }

      if (
        textNodes.length > 0
      ) {
        /*
         * 最も長い文字列を
         * メニューラベルとみなす
         */
        textNodes.sort(
          (a, b) =>
            b.text.length -
            a.text.length
        );

        textNodes[0].node.nodeValue =
          'メールをコピー';

        /*
         * 複製元に余計な文字列があれば消す
         */
        for (
          let i = 1;
          i < textNodes.length;
          i++
        ) {
          textNodes[i].node.nodeValue =
            '';
        }
      } else {
        item.textContent =
          'メールをコピー';
      }
    }

    item.setAttribute(
      'role',
      'menuitem'
    );

    item.setAttribute(
      'aria-label',
      'メールをコピー'
    );

    /*
     * 複製元のDOMイベントが残っていた場合に備える
     */
    item.onclick = null;
    item.onmousedown = null;

    let copied = false;

    /*
     * Gmailはclickより前に
     * メニュー項目を処理する場合があるため
     * pointerdownでコピーする
     */
    item.addEventListener(
      'pointerdown',
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (copied) {
          return;
        }

        copied = true;

        copyMessage();

        setTimeout(() => {
          copied = false;
        }, 500);
      },
      true
    );

    /*
     * キーボード操作などのfallback
     */
    item.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (!copied) {
          copyMessage();
        }

        closeMenu();
      },
      true
    );

    return item;
  }

  // ------------------------------------------------------------
  // 仕切り線作成
  // ------------------------------------------------------------

  function createSeparator(menu) {
    /*
     * Gmail自身のseparatorを複製する
     */
    const template =
      menu.querySelector(
        '[role="separator"]'
      ) ||
      menu.querySelector(
        '.J-Kh'
      );

    let separator;

    if (template) {
      separator =
        template.cloneNode(true);

      removeGmailActionAttributes(
        separator
      );
    } else {
      /*
       * Gmail側から取得できない場合のfallback
       */
      separator =
        document.createElement('div');

      separator.setAttribute(
        'role',
        'separator'
      );

      Object.assign(
        separator.style,
        {
          borderTop:
            '1px solid #dadce0',

          margin:
            '8px 0',
        }
      );
    }

    separator.id =
      SEPARATOR_ID;

    return separator;
  }

  // ------------------------------------------------------------
  // 表示中のGmailメニュー
  // ------------------------------------------------------------

  function getVisibleMenus() {
    return [
      ...document.querySelectorAll(
        '[role="menu"]'
      )
    ].filter(isVisible);
  }

  // ------------------------------------------------------------
  // 「メールをコピー」を追加
  // ------------------------------------------------------------

  function injectMenuItem() {
    /*
     * メールを開いていない場合は何もしない
     */
    if (
      !getCurrentMessageBody()
    ) {
      return;
    }

    const menus =
      getVisibleMenus();

    for (const menu of menus) {
      const switchItem =
        findToolbarSwitchItem(menu);

      /*
       * シンプル/詳細ツールバー切替項目が
       * 存在するメニューだけを対象にする
       */
      if (!switchItem) {
        continue;
      }

      /*
       * すでに追加済み
       */
      if (
        menu.querySelector(
          `#${MENU_ITEM_ID}`
        )
      ) {
        continue;
      }

      /*
       * ツールバー切替項目そのものではなく、
       * その前にある通常メニュー項目を
       * テンプレートとして使う
       */
      const template =
        findNormalMenuTemplate(
          menu,
          switchItem
        );

      if (!template) {
        console.warn(
          '[Gmail Copy] ' +
          'メニュー項目テンプレートを取得できませんでした'
        );

        continue;
      }

      const item =
        createMenuItem(
          template
        );

      const separator =
        createSeparator(
          menu
        );

      const parent =
        switchItem.parentElement;

      if (!parent) {
        continue;
      }

      /*
       * 最終的な順序:
       *
       * ...
       * ミュート
       * （既存の仕切り線）
       * メールをコピー
       * ---------------- ← 追加
       * シンプル/詳細ツールバーに切り替える
       */

      parent.insertBefore(
        item,
        switchItem
      );

      parent.insertBefore(
        separator,
        switchItem
      );
    }
  }

  // ------------------------------------------------------------
  // Gmailのメニュー操作を監視
  // ------------------------------------------------------------

  document.addEventListener(
    'pointerdown',
    () => {
      /*
       * GmailのメニューDOM生成タイミングに
       * 幅があるので数回確認する
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
  // GmailはSPAでメニューを動的生成するためDOM監視
  // ------------------------------------------------------------

  let timer = null;

  const observer =
    new MutationObserver(() => {
      clearTimeout(timer);

      timer =
        setTimeout(
          injectMenuItem,
          10
        );
    });

  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true,
    }
  );
})();