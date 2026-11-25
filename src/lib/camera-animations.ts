// サークル飛行やツアーのように、地図のカメラを動かし続ける機能の窓口。
// ボタン（コントロール）が持つ実体をここに登録し、WebMCP のツールからも同じ実体を開始・停止する。
// こうすると、ツールから動かしてもボタンの押下状態が食い違わない。この画面の地図は 1 つなので、名前だけで引く
export type CameraAnimation = {
  start: () => void
  stop: () => void
  isRunning: () => boolean
};

const animations = new Map<string, CameraAnimation>();

// 解除する関数を返す。同じ名前を登録し直した後に古い方が解除されても、新しい方は残す
export const registerCameraAnimation = (name: string, animation: CameraAnimation) => {
  animations.set(name, animation);
  return () => {
    if (animations.get(name) === animation) {
      animations.delete(name);
    }
  };
};

export const getCameraAnimation = (name: string) => animations.get(name);

// 地図を別の場所へ動かす前に、動いているカメラの機能を止める
export const stopCameraAnimations = () => {
  for (const animation of animations.values()) {
    if (animation.isRunning()) {
      animation.stop();
    }
  }
};
