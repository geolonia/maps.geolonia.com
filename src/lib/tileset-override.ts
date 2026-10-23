export const overrideTilesetUrl = (url: string, replaceMap: ReadonlyMap<string, string>) => url.replace(
  /^(https:\/\/tileserver(?:-[^.]+)?\.geolonia\.com\/)([^/]+)\//,
  (_match, g1, g2) => {
    return `${g1}${replaceMap.get(g2) ?? g2}/`;
  },
);
