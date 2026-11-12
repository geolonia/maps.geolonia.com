type Layer = { id: string; metadata?: unknown };

export type ThreeDMap = {
  getStyle(): { layers?: Layer[] } | undefined;
  setLayoutProperty(layerId: string, name: 'visibility', value: 'visible' | 'none'): unknown;
};

// maps-core の 3d オプションと同じく、レイヤーの metadata の visible-on-3d と hide-on-3d で表示を切り替える
export const applyThreeDVisibility = (map: ThreeDMap) => {
  for (const layer of map.getStyle()?.layers ?? []) {
    const metadata = (layer.metadata ?? {}) as Record<string, unknown>;
    if (metadata['visible-on-3d']) {
      map.setLayoutProperty(layer.id, 'visibility', 'visible');
    }
    if (metadata['hide-on-3d']) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
};
