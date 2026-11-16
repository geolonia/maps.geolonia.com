export const styleIdToUrl = (style: string, lang?: string) => {
  if (style.startsWith('https://')) {
    return style;
  }
  if (lang && lang !== 'auto') {
    return `https://cdn.geolonia.com/style/${style}/${lang}.json`;
  }
  return style.split(';')[0];
};

// 言語の「自動」をブラウザの言語で日本語か英語に決める
// MachGL は素のスタイル ID を、地図を作ったときの言語で解決し続けるので、MachGL には言語を決めた URL を渡す
export const resolveLanguage = (lang: string, browserLanguages: readonly string[]) => {
  if (lang !== 'auto') {
    return lang;
  }
  return browserLanguages[0]?.toLowerCase().startsWith('ja') ? 'ja' : 'en';
};
