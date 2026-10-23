export const parseHash = (url?: Location | URL) => {
  const qstr = (url || window.location).hash.substring(1);
  const q = new URLSearchParams(qstr);
  return q;
};

// location.hash に代入すると hashchange が起き、MapLibre の hash がカメラをハッシュの位置に戻すので、履歴を書き換えて済ませる
export const updateHash = (q: URLSearchParams) => {
  window.history.replaceState(window.history.state, '', `#${q.toString().replace(/%2F/g, '/')}`);
};

// 普通のオブジェクトだと constructor や __proto__ のような ID が Object.prototype のプロパティと重なるので、Map にする
export const parseTilesetOverrideHash = () => {
  const overrideStr = parseHash().get('tilesetOverride');
  const replaceMap = new Map<string, string>();
  for (const entry of (overrideStr || '').split(';')) {
    const [tilesetId, newId] = entry.split(':', 2);
    if (tilesetId && newId) {
      replaceMap.set(tilesetId, newId);
    }
  }
  return replaceMap;
};
