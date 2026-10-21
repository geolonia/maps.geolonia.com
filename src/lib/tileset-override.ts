export const overrideTilesetUrl = (url: string, replaceMap: {[key: string]: string}) => url.replace(
  /^(https:\/\/tileserver(?:-[^.]+)?\.geolonia\.com\/)([^/]+)\//,
  (_match, g1, g2) => {
    return `${g1}${replaceMap[g2] || g2}/`;
  },
);
