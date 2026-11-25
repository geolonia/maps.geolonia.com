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

export type StyleOption = { value: string, label: string };

// 設定パネルの選択肢。WebMCP の list_map_styles と set_map_style もここから作る。
// モデルに任意の URL を渡させないため、スタイルはこの一覧にあるものだけを受け付ける
export const STYLE_GROUPS: { label: string, styles: StyleOption[] }[] = [
  {
    label: '標準スタイル',
    styles: [
      { value: 'geolonia/basic-v2', label: 'Basic v2' },
      { value: 'geolonia/gsi', label: 'GSI' },
      { value: 'geolonia/homework', label: 'Homework' },
      { value: 'geolonia/midnight', label: 'Midnight' },
      { value: 'geolonia/notebook', label: 'Notebook' },
      { value: 'geolonia/red-planet', label: 'Red Planet' },
    ],
  },
  {
    label: 'SmartCity用スタイル',
    styles: [{ value: 'geoloniamaps/smartcity-base', label: 'SmartCity Base' }],
  },
  {
    label: 'その他',
    styles: [
      { value: 'https://raw.githubusercontent.com/geolonia/butter/main/style.json', label: 'Butter' },
      { value: 'https://geolonia.github.io/openstreetmap-carto/style.json', label: 'OSM Carto' },
    ],
  },
  {
    label: 'EXPERIMENTAL | 実験的',
    styles: [
      { value: 'https://raw.githubusercontent.com/geolonia/basic-gsiseamlessphoto/main/style.json', label: 'Basic & GSI Seamless Photo' },
    ],
  },
];

export const ALL_STYLES: StyleOption[] = STYLE_GROUPS.flatMap(({ styles }) => styles);
