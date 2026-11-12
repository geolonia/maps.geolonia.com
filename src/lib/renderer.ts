export type Renderer = 'maplibre' | 'mach-gl';

const isRenderer = (value: string | null): value is Renderer => value === 'maplibre' || value === 'mach-gl';

// ハッシュの renderer を優先し、なければ保存済みの値、どちらもなければ MapLibre を使う
export const resolveRenderer = (fromHash: string | null, fromStorage: string | null): Renderer => {
  if (isRenderer(fromHash)) {
    return fromHash;
  }
  if (isRenderer(fromStorage)) {
    return fromStorage;
  }
  return 'maplibre';
};

export const nextRenderer = (renderer: Renderer): Renderer => (renderer === 'mach-gl' ? 'maplibre' : 'mach-gl');
