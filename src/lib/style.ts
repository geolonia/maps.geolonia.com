export const styleIdToUrl = (style: string, lang?: string) => {
  if (style.startsWith('https://')) {
    return style;
  }
  if (lang && lang !== 'auto') {
    return `https://cdn.geolonia.com/style/${style}/${lang}.json`;
  }
  return style.split(';')[0];
};
