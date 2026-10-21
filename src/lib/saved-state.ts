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

export const getDefaultCameraOptions = (state: InitialSavedState) => {
  const mapStr = parseHash().get('map') || `${state.z}/${state.lat}/${state.lng}`;
  const [ zoom, lat, lng ] = mapStr.split('/');
  return {
    center: {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
    },
    zoom: parseFloat(zoom),
  };
};
