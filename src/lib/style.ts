export const styleIdToUrl = (style: string, lang?: string) => {
  if (style.startsWith('https://')) {
    return style;
  }
  if (lang && lang !== 'auto') {
    return `https://cdn.geolonia.com/style/${style}/${lang}.json`;
  }
  return style.split(';')[0];
};

// 言語の「自動」を、maps-core と同じ決め方で日本語か英語に決める（ブラウザの第一言語が ja か ja-JP なら日本語）
// MachGL は素のスタイル ID を、地図を作ったときの言語で解決し続けるので、MachGL には言語を決めた URL を渡す
export const resolveLanguage = (lang: string, browserLanguages: readonly string[], browserLanguage?: string) => {
  if (lang !== 'auto') {
    return lang;
  }
  const first = (browserLanguages[0] || browserLanguage || '').toLowerCase();
  return first === 'ja' || first === 'ja-jp' ? 'ja' : 'en';
};
