export const DEFAULTS = {
  model: null,
  usdz: null,
  environment: 'neutral',
  environmentRotation: 0,
  toneMapping: 'neutral',
  exposure: 1,
  transparency: 'mv',
  background: [1, 1, 1],
  camera: null,
  bloom: false,
  bloomStrength: 0.15,
  bloomRadius: 0.4,
  bloomThreshold: 1,
  showLights: false,
  fps: 24, // Blender scene fps (glTF has none); timeline frames
  syncBlender: true, // editor open: apply Blender live updates
};

export function createStore(initial) {
  let state = { ...DEFAULTS, ...initial };
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      const prev = state;
      state = { ...state, ...patch };
      for (const fn of listeners) fn(state, prev);
    },
    subscribe(fn) {
      listeners.add(fn);
      fn(state, {});
      return () => listeners.delete(fn);
    },
  };
}
