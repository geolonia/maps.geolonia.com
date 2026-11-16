export type StyleZoomMetadata = {
  'geolonia:maxzoom'?: number;
  'geolonia:minzoom'?: number;
};

export type ZoomLimitsMap = {
  setMaxZoom(zoom?: number): unknown;
  setMinZoom(zoom?: number): unknown;
};

// スタイルのメタデータにあるズームの上限と下限を地図に渡す。styledata はソースやレイヤーを足すたびにも起きるので、値が変わったときだけ渡す
// MachGL は setMaxZoom と setMinZoom を呼ぶと動いているカメラが止まるため、検索結果のレイヤーを足した直後の fitBounds が効かなくなる
export const createZoomLimitsUpdater = (map: ZoomLimitsMap) => {
  let max: number | undefined;
  let min: number | undefined;
  return (metadata: StyleZoomMetadata) => {
    const nextMax = metadata['geolonia:maxzoom'] || undefined;
    const nextMin = metadata['geolonia:minzoom'] || undefined;
    if (nextMax !== max) {
      max = nextMax;
      map.setMaxZoom(max);
    }
    if (nextMin !== min) {
      min = nextMin;
      map.setMinZoom(min);
    }
  };
};
