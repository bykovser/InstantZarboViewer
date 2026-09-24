import { applyToThree } from '../materials/schema.js';

// Live patch from Blender, keyed by material name. Returns keys the material class can't take
// without a rebuild (e.g. transmission on MeshStandardMaterial — the loader picks the class by extensions).
export function patchMaterial(m, patch) {
  return Object.entries(patch)
    .filter(([key, value]) => !applyToThree(m, key, value))
    .map(([key]) => key);
}

export function materialsByName(root) {
  const map = new Map();
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
      if (!map.has(m.name)) map.set(m.name, []);
      if (!map.get(m.name).includes(m)) map.get(m.name).push(m);
    }
  });
  return map;
}
