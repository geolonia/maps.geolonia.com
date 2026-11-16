export type Renderer = 'maplibre' | 'mach-gl';

// 選択肢の並び順。ラジオボタンはこの順に出す
export const RENDERERS: { value: Renderer, label: string }[] = [
  { value: 'maplibre', label: 'MapLibre' },
  { value: 'mach-gl', label: 'MachGL' },
];

export const isRenderer = (value: string | null): value is Renderer => value === 'maplibre' || value === 'mach-gl';

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

