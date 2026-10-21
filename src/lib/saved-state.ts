import { parseHash } from './hash';

export interface InitialSavedState {
  z: number
  lat: number
  lng: number
  style: string
  lang: string
}

export const INITIAL_STATE: InitialSavedState = {
  z: 6,
  lng: 136.944,
  lat: 35.645,
  style: 'geolonia/basic-v2',
  lang: 'auto',
};

export const getCurrentSavedState = () => {
  let state: InitialSavedState = INITIAL_STATE;
  try {
    let rawState: string | null;
    if ('localStorage' in window && (rawState = localStorage.getItem('geolstate')) && rawState) {
      state = {
        ...INITIAL_STATE,
        ...JSON.parse(rawState),
      } as InitialSavedState;
    }
  } catch {
    // no-op
  }
  return state;
};

type CameraOptions = {
  center: { lat: number, lng: number }
  zoom: number
};

const parsePosition = (zoom: number, lat: number, lng: number): CameraOptions | undefined => {
  if (![zoom, lat, lng].every(Number.isFinite) || lat < -90 || lat > 90) {
    return undefined;
  }
  return { center: { lat, lng }, zoom };
};

// ハッシュの位置、保存済みの位置、初期位置の順に、使える値を探す
export const getDefaultCameraOptions = (state: InitialSavedState): CameraOptions => {
  const [ zoom, lat, lng ] = (parseHash().get('map') || '').split('/').map(parseFloat);
  return parsePosition(zoom, lat, lng)
    || parsePosition(state.z, state.lat, state.lng)
    || parsePosition(INITIAL_STATE.z, INITIAL_STATE.lat, INITIAL_STATE.lng)!;
};
