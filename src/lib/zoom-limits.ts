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
    const nextMax = metadata['geolonia:maxzoom'] ?? undefined;
    const nextMin = metadata['geolonia:minzoom'] ?? undefined;
    // 地図に受け入れられてから覚える。投げたときは次の styledata でもう一度渡す
    const applyMax = () => {
      if (nextMax === max) return;
      map.setMaxZoom(nextMax);
      max = nextMax;
    };
    const applyMin = () => {
      if (nextMin === min) return;
      map.setMinZoom(nextMin);
      min = nextMin;
    };
    // 下限が上限を超える呼び出しは投げるので、新しい下限が今の上限より上なら上限から、それ以外は下限から渡す
    if (nextMin !== undefined && max !== undefined && nextMin > max) {
      applyMax();
      applyMin();
    } else {
      applyMin();
      applyMax();
    }
  };
};
