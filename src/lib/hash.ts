export const parseHash = (url?: Location | URL) => {
  const qstr = (url || window.location).hash.substring(1);
  const q = new URLSearchParams(qstr);
  return q;
};

// location.hash に代入すると hashchange が起き、MapLibre の hash がカメラをハッシュの位置に戻すので、履歴を書き換えて済ませる
export const updateHash = (q: URLSearchParams) => {
  window.history.replaceState(window.history.state, '', `#${q.toString().replace(/%2F/g, '/')}`);
};

export const parseTilesetOverrideHash = () => {
  const overrideStr = parseHash().get('tilesetOverride');
  return (overrideStr || '').split(';').reduce<{[key: string]: string}>((map, current) => {
    const [styleId, newId] = current.split(':', 2);
    map[styleId] = newId;
    return map;
  }, {});
};
