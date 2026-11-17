export type CameraOwner = {
  yieldCamera: () => void
};

// カメラを動かし続ける機能（サークル飛行、ツアー）のうち、いまどれが動かしているかを地図ごとに持つ
// MachGL は、新しい easeTo が動いているカメラを止めても moveend を出さないので、止められた側は自分では気付けない
const owners = new WeakMap<object, CameraOwner>();

// 同じ地図で動いているほかの機能に、カメラを譲るよう伝えてから自分を記録する
export const claimCamera = (map: object, owner: CameraOwner) => {
  const previous = owners.get(map);
  owners.set(map, owner);
  if (previous && previous !== owner) {
    previous.yieldCamera();
  }
};

export const releaseCamera = (map: object, owner: CameraOwner) => {
  if (owners.get(map) === owner) {
    owners.delete(map);
  }
};
