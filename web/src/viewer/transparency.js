import { Mesh, MeshBasicMaterial, Vector3 } from 'three';

/*
 * Transparency strategies. Only touch transparent materials and the renderer's sort function,
 * so switching modes at runtime is lossless (originals are kept in userData).
 *
 *  origin  — sort by object origin distance (old iOS Quick Look behaviour)
 *  mv      — three/model-viewer default: bounding-sphere centre sort + two-pass double-sided
 *  hashed  — alpha hash, opaque pass with depth write, order-independent but noisy
 *  prepass — depth-only copy in the opaque pass: only the nearest transparent surface shows
 */

const _v = new Vector3();
const PREPASS_MATERIAL = new MeshBasicMaterial({ colorWrite: false });

function transparentMeshes(root) {
  const out = [];
  root.traverse((obj) => {
    if (!obj.isMesh || obj.userData.izvPrepass) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const originals = mats.map((m) => m.userData.izvOriginal ?? (m.userData.izvOriginal = {
      transparent: m.transparent, depthWrite: m.depthWrite, alphaHash: m.alphaHash,
    }));
    if (originals.some((o) => o.transparent)) out.push({ mesh: obj, mats });
  });
  return out;
}

function restore(entries) {
  for (const { mesh, mats } of entries) {
    for (const m of mats) {
      Object.assign(m, m.userData.izvOriginal);
      m.needsUpdate = true;
    }
    const prepass = mesh.children.find((c) => c.userData.izvPrepass);
    if (prepass) mesh.remove(prepass);
  }
}

// Same tie-breaking as three's reversePainterSortStable, but by origin depth instead of bounds centre.
function originSort(a, b) {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
  const za = a.object.userData.izvOriginZ ?? a.z;
  const zb = b.object.userData.izvOriginZ ?? b.z;
  if (za !== zb) return zb - za;
  return a.id - b.id;
}

export function createTransparency(renderer) {
  let mode = 'mv';
  let entries = [];

  return {
    apply(root, nextMode) {
      restore(entries);
      entries = transparentMeshes(root);
      mode = nextMode;
      renderer.setTransparentSort(mode === 'origin' ? originSort : null);

      for (const { mesh, mats } of entries) {
        if (mode === 'hashed') {
          for (const m of mats) Object.assign(m, { transparent: false, alphaHash: true, depthWrite: true });
        }
        if (mode === 'prepass') {
          const depth = new Mesh(mesh.geometry, PREPASS_MATERIAL);
          depth.userData.izvPrepass = true;
          mesh.add(depth);
        }
        for (const m of mats) m.needsUpdate = true;
      }
    },

    // Call before each render: origin depth depends on the camera.
    update(camera) {
      if (mode !== 'origin') return;
      for (const { mesh } of entries) {
        _v.setFromMatrixPosition(mesh.matrixWorld).project(camera);
        mesh.userData.izvOriginZ = _v.z;
      }
    },
  };
}
