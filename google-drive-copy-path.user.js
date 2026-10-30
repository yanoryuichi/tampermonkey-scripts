// ==UserScript==
// @name         Google Drive - Copy Full Path
// @namespace    https://example.com/
// @version      1.5
// @description  Google Driveの現在のフォルダー／選択中アイテムのフルパスをコピー
// @match        https://drive.google.com/*
// @grant        GM_setClipboard
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const BUTTON_ID = 'tm-google-drive-copy-path';
  const MESSAGE_ID = 'tm-google-drive-copy-message';

  function isVisible(el) {
    if (!el) {
      return false;
    }

    const style = getComputedStyle(el);

    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) === 0
    ) {
      return false;
    }

    const rect = el.getBoundingClientRect();

    return (
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function normalizeText(text) {
    return (text || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 現在のフォルダー名
   */
  function getCurrentFolderName() {
    return document.title
      .replace(/\s*-\s*Google ドライブ\s*$/, '')
      .replace(/\s*-\s*Google Drive\s*$/, '')
      .trim();
  }

  /**
   * 「共有アイテム」などのルート文字列を探す
   */
  function findRootElements() {
    const rootNames = [
      '共有アイテム',
      'マイドライブ',
      '共有ドライブ',
    ];

    return [...document.querySelectorAll('body *')]
      .filter(el => {
        if (!isVisible(el)) {
          return false;
        }

        const text = normalizeText(el.textContent);

        return rootNames.includes(text);
      });
  }

  /**
   * パンくず全体を含む最小の祖先要素を探す
   */
  function findBreadcrumbContainer() {
    const currentFolder = getCurrentFolderName();

    if (!currentFolder) {
      return null;
    }

    const rootElements = findRootElements();
    const candidates = [];

    for (const rootEl of rootElements) {
      let el = rootEl;

      for (let i = 0; i < 12 && el; i++) {
        const text = normalizeText(el.textContent);

        if (
          text.includes(currentFolder) &&
          (
            text.includes('共有アイテム') ||
            text.includes('マイドライブ') ||
            text.includes('共有ドライブ')
          )
        ) {
          const rect = el.getBoundingClientRect();

          if (
            rect.height > 0 &&
            rect.height < 150 &&
            rect.width > 100
          ) {
            candidates.push({
              el,
              area: rect.width * rect.height,
              rect,
              text,
            });
          }
        }

        el = el.parentElement;
      }
    }

    if (!candidates.length) {
      return null;
    }

    candidates.sort((a, b) => a.area - b.area);

    console.log(
      '[Google Drive Copy Path] breadcrumb container:',
      candidates[0]
    );

    return candidates[0].el;
  }

  /**
   * パンくずコンテナから各階層名を取得
   */
  function extractBreadcrumbNames(container) {
    if (!container) {
      return [];
    }

    const currentFolder = getCurrentFolderName();

    const rootNames = [
      '共有アイテム',
      'マイドライブ',
      '共有ドライブ',
    ];

    const items = [];

    const elements = container.querySelectorAll(
      [
        'a',
        'button',
        '[role="button"]',
        '[role="link"]',
      ].join(',')
    );

    for (const el of elements) {
      if (!isVisible(el)) {
        continue;
      }

      const text = normalizeText(el.textContent);

      if (!text) {
        continue;
      }

      if (
        text === '>' ||
        text === '›' ||
        text === '▼'
      ) {
        continue;
      }

      const rect = el.getBoundingClientRect();

      items.push({
        text,
        left: rect.left,
      });
    }

    items.sort((a, b) => a.left - b.left);

    let names = [];

    for (const item of items) {
      if (!names.includes(item.text)) {
        names.push(item.text);
      }
    }

    if (!names.includes(currentFolder)) {
      const leafElements = [
        ...container.querySelectorAll('*'),
      ].filter(el => {
        return (
          isVisible(el) &&
          el.children.length === 0
        );
      });

      const leafItems = leafElements
        .map(el => ({
          text: normalizeText(el.textContent),
          left: el.getBoundingClientRect().left,
        }))
        .filter(item => item.text)
        .sort((a, b) => a.left - b.left);

      for (const item of leafItems) {
        if (
          !names.includes(item.text) &&
          item.text !== '>' &&
          item.text !== '›'
        ) {
          names.push(item.text);
        }
      }
    }

    let rootIndex = -1;

    for (const rootName of rootNames) {
      const index = names.indexOf(rootName);

      if (index !== -1) {
        rootIndex = index;
        break;
      }
    }

    if (rootIndex !== -1) {
      names = names.slice(rootIndex);
    }

    const currentIndex = names.indexOf(currentFolder);

    if (currentIndex !== -1) {
      names = names.slice(0, currentIndex + 1);
    } else if (currentFolder) {
      names.push(currentFolder);
    }

    return names;
  }

  /**
   * 現在のフォルダーパスを取得
   */
  function getFolderPath() {
    const container = findBreadcrumbContainer();

    if (!container) {
      console.warn(
        '[Google Drive Copy Path] breadcrumb container not found'
      );

      return '';
    }

    const names = extractBreadcrumbNames(container);

    console.log(
      '[Google Drive Copy Path] breadcrumb names:',
      names
    );

    return names.join('/');
  }

  /**
   * 選択中のファイル／フォルダー名を取得
   */
  function getSelectedItemName() {
    const selectedElements = [
      ...document.querySelectorAll(
        [
          '[aria-selected="true"]',
          '[data-selected="true"]',
          '[role="row"][aria-selected="true"]',
          '[role="gridcell"][aria-selected="true"]',
        ].join(',')
      ),
    ];

    const candidates = [];

    for (const el of selectedElements) {
      if (!isVisible(el)) {
        continue;
      }

      const rect = el.getBoundingClientRect();

      /*
       * 一覧エリアだけを見る
       */
      if (rect.top < 180) {
        continue;
      }

      const leafElements = [
        ...el.querySelectorAll('*'),
      ].filter(child => {
        return (
          isVisible(child) &&
          child.children.length === 0
        );
      });

      for (const child of leafElements) {
        const text = normalizeText(child.textContent);

        if (!text) {
          continue;
        }

        const childRect = child.getBoundingClientRect();

        /*
         * 画面外のアクセシビリティ用・操作用要素を除外
         */
        if (
          childRect.left < 0 ||
          childRect.top < 0 ||
          childRect.right > window.innerWidth ||
          childRect.bottom > window.innerHeight
        ) {
          continue;
        }

        /*
         * 名前列よりかなり右側にある項目を除外
         */
        if (childRect.left > window.innerWidth * 0.65) {
          continue;
        }

        /*
         * 明らかにファイル名ではない項目を除外
         */
        if (
          /^更新日時$/.test(text) ||
          /^ファイルサイズ$/.test(text) ||
          /^名前$/.test(text) ||
          /^\d{1,2}月\d{1,2}日/.test(text) ||
          /^\d+(\.\d+)?\s*(B|KB|MB|GB|TB)$/i.test(text) ||
          /^その他の操作/.test(text) ||
          /^Gemini に相談/.test(text) ||
          /^共有$/.test(text) ||
          /^ダウンロード$/.test(text) ||
          /^削除$/.test(text) ||
          /^リンクをコピー$/.test(text)
        ) {
          continue;
        }

        candidates.push({
          text,
          left: childRect.left,
          top: childRect.top,
        });
      }
    }

    console.log(
      '[Google Drive Copy Path] selected item candidates:',
      candidates
    );

    if (!candidates.length) {
      return '';
    }

    /*
     * 一覧の左側にある候補を優先
     */
    candidates.sort((a, b) => {
      if (Math.abs(a.top - b.top) < 10) {
        return a.left - b.left;
      }

      return a.top - b.top;
    });

    return candidates[0].text;
  }

  function showMessage(message, isError = false) {
    document.getElementById(MESSAGE_ID)?.remove();

    const msg = document.createElement('div');

    msg.id = MESSAGE_ID;
    msg.textContent = message;

    Object.assign(msg.style, {
      position: 'fixed',
      right: '20px',
      bottom: '75px',
      zIndex: '2147483647',
      padding: '10px 16px',
      borderRadius: '6px',
      background: isError ? '#b3261e' : '#333',
      color: '#fff',
      fontSize: '13px',
      fontFamily: 'sans-serif',
      boxShadow: '0 2px 10px rgba(0, 0, 0, .3)',
      maxWidth: '700px',
      whiteSpace: 'pre-wrap',
    });

    document.body.appendChild(msg);

    setTimeout(() => {
      msg.remove();
    }, 3000);
  }

  /**
   * フルパスをコピー
   */
  function copyFullPath() {
    const folderPath = getFolderPath();

    if (!folderPath) {
      showMessage(
        'フォルダーパスを取得できませんでした。',
        true
      );

      return;
    }

    const selectedItemName = getSelectedItemName();

    const fullPath = selectedItemName
      ? `${folderPath}/${selectedItemName}`
      : folderPath;

    console.log(
      '[Google Drive Copy Path] selected item:',
      selectedItemName
    );

    console.log(
      '[Google Drive Copy Path] full path:',
      fullPath
    );

    GM_setClipboard(fullPath, 'text');

    showMessage(
      `コピーしました:\n${fullPath}`
    );
  }

  /**
   * ボタン作成
   */
  function createButton() {
    if (document.getElementById(BUTTON_ID)) {
      return;
    }

    if (!document.body) {
      return;
    }

    const button = document.createElement('button');

    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = '📋 パスをコピー';

    Object.assign(button.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      zIndex: '2147483647',
      padding: '9px 14px',
      border: '1px solid #666',
      borderRadius: '8px',
      background: '#202124',
      color: '#fff',
      fontSize: '14px',
      fontFamily: 'sans-serif',
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0, 0, 0, .35)',
    });

    button.addEventListener(
      'mouseenter',
      () => {
        button.style.background = '#303134';
      }
    );

    button.addEventListener(
      'mouseleave',
      () => {
        button.style.background = '#202124';
      }
    );

    button.addEventListener(
      'click',
      e => {
        e.preventDefault();
        e.stopPropagation();

        copyFullPath();
      }
    );

    document.body.appendChild(button);
  }

  function init() {
    createButton();

    /*
     * Google DriveはSPAなので、
     * 画面遷移後もボタンを維持する。
     */
    const observer = new MutationObserver(() => {
      createButton();
    });

    observer.observe(
      document.documentElement,
      {
        childList: true,
        subtree: true,
      }
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      init,
      {
        once: true,
      }
    );
  } else {
    init();
  }
})();
