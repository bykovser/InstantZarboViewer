/*
 * One description of glTF material properties, shared by the Blender live link and the editor.
 *
 *  group.ext      — KHR extension name (null = core material); the editor resolves/creates the extension
 *  group.physical — three.js needs MeshPhysicalMaterial for it (otherwise: rebuild from the document)
 *  field.prop     — glTF-Transform accessor stem: get<Prop>() / set<Prop>()
 *  field.three    — apply the value to a three.js material without reloading
 *  group.textures — texture slots: get<Prop>() / set<Prop>() / get<Prop>Info()
 *                   slot.neutral: what "remove" puts in the slot (default white — factors are multipliers)
 *
 * Colors are linear RGB arrays (glTF factors are linear, three's working space is linear too).
 * No glTF-Transform imports here: the viewer bundle uses this file without the editor.
 */

function setAlphaMode(t, mode) {
  const blend = mode === 'BLEND';
  t.transparent = blend;
  t.depthWrite = !blend;
  t.alphaTest = mode === 'MASK' ? (t.userData.izvCutoff ?? 0.5) : 0;
  // Transparency strategies restore from this snapshot; keep it in sync.
  t.userData.izvOriginal = { transparent: t.transparent, depthWrite: t.depthWrite, alphaHash: false };
}

const range = (min, max, step = 0.01) => ({ type: 'range', min, max, step });

// RGBA of a 1×1 texture that leaves the channel as if driven by the factor alone.
export const NEUTRAL_TEXTURES = {
  white: [255, 255, 255, 255],
  normal: [128, 128, 255, 255], // flat tangent-space normal
  anisotropy: [255, 128, 255, 255], // direction (1, 0), strength 1
};

export const GROUPS = [
  {
    id: 'base', title: 'Base color & alpha', ext: null,
    fields: [
      {
        key: 'baseColor', label: 'Base color', type: 'color',
        get: (m) => m.getBaseColorFactor().slice(0, 3),
        set: (m, v) => m.setBaseColorFactor([...v, m.getBaseColorFactor()[3]]),
        three: (t, v) => t.color.setRGB(...v),
      },
      {
        key: 'alpha', label: 'Alpha', ...range(0, 1),
        get: (m) => m.getBaseColorFactor()[3],
        set: (m, v) => m.setBaseColorFactor([...m.getBaseColorFactor().slice(0, 3), v]),
        three: (t, v) => { t.opacity = v; },
      },
      {
        key: 'alphaMode', label: 'Alpha mode', type: 'select', options: ['OPAQUE', 'MASK', 'BLEND'],
        prop: 'AlphaMode', three: setAlphaMode, affectsTransparency: true,
      },
      {
        key: 'alphaCutoff', label: 'Alpha cutoff', ...range(0, 1), prop: 'AlphaCutoff',
        three: (t, v) => {
          t.userData.izvCutoff = v;
          if (t.alphaTest > 0) t.alphaTest = v;
        },
      },
      {
        key: 'doubleSided', label: 'Double sided', type: 'bool', prop: 'DoubleSided',
        three: (t, v) => { t.side = v ? 2 : 0; },
      },
    ],
    textures: [{ label: 'Base color', prop: 'BaseColorTexture', color: true }],
  },
  {
    id: 'pbr', title: 'Metallic / Roughness', ext: null,
    fields: [
      { key: 'metallic', label: 'Metallic', ...range(0, 1), prop: 'MetallicFactor', three: (t, v) => { t.metalness = v; } },
      { key: 'roughness', label: 'Roughness', ...range(0, 1), prop: 'RoughnessFactor', three: (t, v) => { t.roughness = v; } },
    ],
    textures: [{ label: 'Metallic-roughness (B/G)', prop: 'MetallicRoughnessTexture' }],
  },
  {
    id: 'normal', title: 'Normal & occlusion', ext: null,
    fields: [
      {
        key: 'normalScale', label: 'Normal scale', ...range(0, 2), prop: 'NormalScale',
        // GLTFLoader flips Y when the mesh has no tangents: keep that sign.
        three: (t, v) => t.normalScale.set(v, Math.sign(t.normalScale.y || 1) * v),
      },
      {
        key: 'occlusionStrength', label: 'Occlusion strength', ...range(0, 1), prop: 'OcclusionStrength',
        three: (t, v) => { t.aoMapIntensity = v; },
      },
    ],
    textures: [{ label: 'Normal', prop: 'NormalTexture', neutral: 'normal' }, { label: 'Occlusion (R)', prop: 'OcclusionTexture' }],
  },
  {
    id: 'emissive', title: 'Emission', ext: null,
    fields: [
      { key: 'emissive', label: 'Emissive', type: 'color', prop: 'EmissiveFactor', three: (t, v) => t.emissive.setRGB(...v) },
    ],
    textures: [{ label: 'Emissive', prop: 'EmissiveTexture', color: true }],
  },
  {
    // Shown inside "Emission"; the extension is created on first edit (glTF caps emissiveFactor at 1).
    id: 'emissiveStrength', title: 'Emissive strength', ext: 'KHR_materials_emissive_strength', create: 'createEmissiveStrength',
    inline: 'emissive',
    fields: [
      {
        key: 'emissiveStrength', label: 'Strength', ...range(0, 100, 0.1), prop: 'EmissiveStrength', default: 1,
        three: (t, v) => { t.emissiveIntensity = v; },
      },
    ],
  },
  {
    id: 'ior', title: 'IOR', ext: 'KHR_materials_ior', create: 'createIOR', physical: true,
    fields: [{ key: 'ior', label: 'IOR', ...range(1, 2.333), prop: 'IOR', three: (t, v) => { t.ior = v; } }],
  },
  {
    id: 'transmission', title: 'Transmission', ext: 'KHR_materials_transmission', create: 'createTransmission', physical: true,
    fields: [
      { key: 'transmission', label: 'Factor', ...range(0, 1), prop: 'TransmissionFactor', three: (t, v) => { t.transmission = v; } },
    ],
    textures: [{ label: 'Transmission (R)', prop: 'TransmissionTexture' }],
  },
  {
    id: 'volume', title: 'Volume', ext: 'KHR_materials_volume', create: 'createVolume', physical: true,
    fields: [
      { key: 'thickness', label: 'Thickness', ...range(0, 10), prop: 'ThicknessFactor', three: (t, v) => { t.thickness = v; } },
      {
        key: 'attenuationDistance', label: 'Attenuation distance', ...range(0, 100, 0.1), prop: 'AttenuationDistance',
        three: (t, v) => { t.attenuationDistance = v === 0 ? Infinity : v; },
      },
      { key: 'attenuationColor', label: 'Attenuation color', type: 'color', prop: 'AttenuationColor', three: (t, v) => t.attenuationColor.setRGB(...v) },
    ],
    textures: [{ label: 'Thickness (G)', prop: 'ThicknessTexture' }],
  },
  {
    id: 'clearcoat', title: 'Clearcoat', ext: 'KHR_materials_clearcoat', create: 'createClearcoat', physical: true,
    fields: [
      { key: 'clearcoat', label: 'Factor', ...range(0, 1), prop: 'ClearcoatFactor', three: (t, v) => { t.clearcoat = v; } },
      { key: 'clearcoatRoughness', label: 'Roughness', ...range(0, 1), prop: 'ClearcoatRoughnessFactor', three: (t, v) => { t.clearcoatRoughness = v; } },
    ],
    textures: [
      { label: 'Clearcoat (R)', prop: 'ClearcoatTexture' },
      { label: 'Clearcoat roughness (G)', prop: 'ClearcoatRoughnessTexture' },
      { label: 'Clearcoat normal', prop: 'ClearcoatNormalTexture', neutral: 'normal' },
    ],
  },
  {
    id: 'sheen', title: 'Sheen', ext: 'KHR_materials_sheen', create: 'createSheen', physical: true,
    fields: [
      {
        key: 'sheenColor', label: 'Color', type: 'color', prop: 'SheenColorFactor',
        three: (t, v) => {
          t.sheenColor.setRGB(...v);
          t.sheen = v.some((c) => c > 0) ? 1 : 0;
        },
      },
      { key: 'sheenRoughness', label: 'Roughness', ...range(0, 1), prop: 'SheenRoughnessFactor', three: (t, v) => { t.sheenRoughness = v; } },
    ],
    textures: [
      { label: 'Sheen color', prop: 'SheenColorTexture', color: true },
      { label: 'Sheen roughness (A)', prop: 'SheenRoughnessTexture' },
    ],
  },
  {
    id: 'specular', title: 'Specular', ext: 'KHR_materials_specular', create: 'createSpecular', physical: true,
    fields: [
      { key: 'specular', label: 'Factor', ...range(0, 1), prop: 'SpecularFactor', three: (t, v) => { t.specularIntensity = v; } },
      { key: 'specularColor', label: 'Color', type: 'color', prop: 'SpecularColorFactor', three: (t, v) => t.specularColor.setRGB(...v) },
    ],
    textures: [
      { label: 'Specular (A)', prop: 'SpecularTexture' },
      { label: 'Specular color', prop: 'SpecularColorTexture', color: true },
    ],
  },
  {
    id: 'iridescence', title: 'Iridescence', ext: 'KHR_materials_iridescence', create: 'createIridescence', physical: true,
    fields: [
      { key: 'iridescence', label: 'Factor', ...range(0, 1), prop: 'IridescenceFactor', three: (t, v) => { t.iridescence = v; } },
      { key: 'iridescenceIor', label: 'IOR', ...range(1, 2.333), prop: 'IridescenceIOR', three: (t, v) => { t.iridescenceIOR = v; } },
      {
        key: 'iridescenceMin', label: 'Thickness min (nm)', ...range(0, 1200, 1), prop: 'IridescenceThicknessMinimum',
        three: (t, v) => { t.iridescenceThicknessRange[0] = v; },
      },
      {
        key: 'iridescenceMax', label: 'Thickness max (nm)', ...range(0, 1200, 1), prop: 'IridescenceThicknessMaximum',
        three: (t, v) => { t.iridescenceThicknessRange[1] = v; },
      },
    ],
    textures: [
      { label: 'Iridescence (R)', prop: 'IridescenceTexture' },
      { label: 'Iridescence thickness (G)', prop: 'IridescenceThicknessTexture' },
    ],
  },
  {
    id: 'anisotropy', title: 'Anisotropy', ext: 'KHR_materials_anisotropy', create: 'createAnisotropy', physical: true,
    fields: [
      { key: 'anisotropy', label: 'Strength', ...range(0, 1), prop: 'AnisotropyStrength', three: (t, v) => { t.anisotropy = v; } },
      {
        key: 'anisotropyRotation', label: 'Rotation (rad)', ...range(-Math.PI, Math.PI), prop: 'AnisotropyRotation',
        three: (t, v) => { t.anisotropyRotation = v; },
      },
    ],
    textures: [{ label: 'Anisotropy', prop: 'AnisotropyTexture', neutral: 'anisotropy' }],
  },
  {
    id: 'dispersion', title: 'Dispersion', ext: 'KHR_materials_dispersion', create: 'createDispersion', physical: true,
    fields: [{ key: 'dispersion', label: 'Dispersion', ...range(0, 10), prop: 'Dispersion', three: (t, v) => { t.dispersion = v; } }],
  },
  // three.js can't render these without a different material class: toggling rebuilds from the document.
  { id: 'unlit', title: 'Unlit', ext: 'KHR_materials_unlit', create: 'createUnlit', fields: [] },
];

export const FIELDS = new Map(GROUPS.flatMap((g) => g.fields.map((f) => [f.key, { ...f, group: g }])));

export function getField(target, field) {
  return field.get ? field.get(target) : target[`get${field.prop}`]();
}

export function setField(target, field, value) {
  return field.set ? field.set(target, value) : target[`set${field.prop}`](value);
}

// three.js side: false when this material class can't take the value live.
export function applyToThree(t, key, value) {
  const field = FIELDS.get(key);
  if (!field) return false;
  if (field.group.physical && !t.isMeshPhysicalMaterial) return false;
  if (field.group.id === 'unlit' || (t.isMeshBasicMaterial && field.group.id !== 'base')) return false;
  field.three(t, value);
  t.needsUpdate = true;
  return true;
}
