/*
 * Editor model. The glTF-Transform Document is the source of truth (lossless: extensions, extras).
 * The viewport still renders through GLTFLoader, like model-viewer does, so the editor looks like the viewer.
 *
 *  - value edits (sliders, colors): Document + live patch of the bound three.js materials;
 *  - structural edits (textures, extensions, anything three can't take live): Document -> GLB -> reload.
 */
import { signal } from '@preact/signals';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

import { applyToThree, FIELDS, getField, GROUPS, setField } from '../materials/schema.js';
import { readDocument, writeGLB } from './io.js';

const EXT_CLASSES = new Map(ALL_EXTENSIONS.map((E) => [E.EXTENSION_NAME, E]));
const COALESCE_MS = 600;

const clone = (v) => (Array.isArray(v) ? [...v] : v);

export class EditorModel {
  version = signal(0);
  selection = signal(null); // { kind: 'material', index } | { kind: 'node', node }
  history = signal({ undo: 0, redo: 0 });
  busy = signal('');

  undoStack = [];
  redoStack = [];
  bindings = new Map(); // material index -> three.js materials

  constructor(viewer) {
    this.viewer = viewer;
    this.onModel = (gltf) => this.bind(gltf);
    viewer.modelListeners.add(this.onModel);
  }

  dispose() {
    this.viewer.modelListeners.delete(this.onModel);
  }

  async load(url) {
    this.busy.value = 'Чтение glTF…';
    try {
      this.doc = await readDocument(url);
      this.fileName = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'model.glb';
      this.undoStack = [];
      this.redoStack = [];
      this.selection.value = null;
      if (this.viewer.gltf) this.bind(this.viewer.gltf);
      this.touch();
    } finally {
      this.busy.value = '';
    }
  }

  get root() {
    return this.doc.getRoot();
  }

  materials() {
    return this.root.listMaterials();
  }

  // GLTFLoader keeps material indices in parser.associations (clones included).
  bind(gltf) {
    this.bindings = new Map();
    this.threeToIndex = new Map();
    gltf.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
        const index = gltf.parser.associations.get(m)?.materials;
        if (index === undefined) continue;
        if (!this.bindings.has(index)) this.bindings.set(index, new Set());
        this.bindings.get(index).add(m);
        this.threeToIndex.set(m, index);
      }
    });
  }

  touch() {
    this.version.value++;
    this.history.value = { undo: this.undoStack.length, redo: this.redoStack.length };
  }

  // Rebuild the viewport from the Document (keeps the camera).
  async rebuild() {
    this.busy.value = 'Пересборка…';
    try {
      const glb = await writeGLB(this.doc);
      const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
      try {
        await this.viewer.loadModel(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    } finally {
      this.busy.value = '';
    }
  }

  scheduleRebuild() {
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = setTimeout(() => this.rebuild(), 50);
  }

  record(entry) {
    const last = this.undoStack.at(-1);
    const now = performance.now();
    if (entry.coalesceKey && last?.coalesceKey === entry.coalesceKey && now - last.time < COALESCE_MS) {
      last.redo = entry.redo;
      last.time = now;
    } else {
      this.undoStack.push({ ...entry, time: now });
    }
    this.redoStack = [];
    this.touch();
  }

  undo() {
    const e = this.undoStack.pop();
    if (!e) return;
    e.undo();
    this.redoStack.push(e);
    this.touch();
  }

  redo() {
    const e = this.redoStack.pop();
    if (!e) return;
    e.redo();
    this.undoStack.push(e);
    this.touch();
  }

  // --- materials -------------------------------------------------------------

  extensionTarget(material, group, create = false) {
    if (!group.ext) return material;
    let prop = material.getExtension(group.ext);
    if (!prop && create) {
      const ext = this.doc.createExtension(EXT_CLASSES.get(group.ext));
      prop = ext[group.create]();
      material.setExtension(group.ext, prop);
    }
    return prop;
  }

  readField(material, key) {
    const field = FIELDS.get(key);
    const target = this.extensionTarget(material, field.group);
    return target ? getField(target, field) : undefined;
  }

  // Low-level: no history. Returns true when three.js took the value live.
  writeField(index, key, value) {
    const material = this.materials()[index];
    const field = FIELDS.get(key);
    const existed = !field.group.ext || material.getExtension(field.group.ext);
    setField(this.extensionTarget(material, field.group, true), field, clone(value));

    let live = Boolean(existed);
    for (const t of this.bindings.get(index) ?? []) live = applyToThree(t, key, value) && live;
    if (!live) this.scheduleRebuild();
    else if (field.affectsTransparency) this.viewer.refreshTransparency();
    return live;
  }

  setField(index, key, value) {
    const before = clone(this.readField(this.materials()[index], key));
    this.writeField(index, key, value);
    this.record({
      coalesceKey: `field:${index}:${key}`,
      undo: () => this.writeField(index, key, before ?? value),
      redo: () => this.writeField(index, key, value),
    });
  }

  hasExtension(index, extName) {
    return Boolean(this.materials()[index].getExtension(extName));
  }

  setExtensionEnabled(index, group, enabled) {
    const material = this.materials()[index];
    const apply = (on, prop) => {
      if (on) {
        if (prop) material.setExtension(group.ext, prop);
        else this.extensionTarget(material, group, true);
      } else {
        material.setExtension(group.ext, null);
      }
      this.scheduleRebuild();
    };
    // Keep the removed property object so undo restores its values, not defaults.
    const kept = material.getExtension(group.ext);
    apply(enabled);
    const created = material.getExtension(group.ext);
    this.record({
      undo: () => apply(!enabled, kept),
      redo: () => apply(enabled, created),
    });
  }

  renameMaterial(index, name) {
    const material = this.materials()[index];
    const before = material.getName();
    const apply = (n) => {
      material.setName(n);
      for (const t of this.bindings.get(index) ?? []) t.name = n;
      this.touch();
    };
    apply(name);
    this.record({ coalesceKey: `name:${index}`, undo: () => apply(before), redo: () => apply(name) });
  }

  // --- textures --------------------------------------------------------------

  slotTarget(index, group) {
    return this.extensionTarget(this.materials()[index], group);
  }

  getSlot(index, group, slot) {
    const target = this.slotTarget(index, group);
    if (!target) return { texture: null, info: null };
    return { texture: target[`get${slot.prop}`](), info: target[`get${slot.prop}Info`]() };
  }

  setSlotTexture(index, group, slot, texture) {
    const target = this.extensionTarget(this.materials()[index], group, true);
    const before = target[`get${slot.prop}`]();
    const apply = (tex) => {
      target[`set${slot.prop}`](tex);
      this.scheduleRebuild();
      this.touch();
    };
    apply(texture);
    this.record({ undo: () => apply(before), redo: () => apply(texture) });
  }

  // A new texture for this slot only: a shared texture elsewhere stays untouched.
  async replaceSlotImage(index, group, slot, file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const texture = this.doc.createTexture(file.name.replace(/\.[^.]+$/, ''))
      .setImage(bytes)
      .setMimeType(file.type || 'image/png')
      .setURI(file.name);
    this.setSlotTexture(index, group, slot, texture);
  }

  setSlotTexCoord(index, group, slot, texCoord) {
    const { info } = this.getSlot(index, group, slot);
    if (!info) return;
    const before = info.getTexCoord();
    const apply = (n) => {
      info.setTexCoord(n);
      this.scheduleRebuild();
      this.touch();
    };
    apply(texCoord);
    this.record({ undo: () => apply(before), redo: () => apply(texCoord) });
  }

  textureUsers(texture) {
    return texture.listParents().filter((p) => p.propertyType !== 'Root').length;
  }

  // --- Blender live link ------------------------------------------------------

  // Blender patches go into the Document too, so an export includes them. Not part of undo history.
  applyBlenderPatches(patches) {
    const byName = new Map(this.materials().map((m, i) => [m.getName(), i]));
    const missing = [];
    for (const [name, patch] of Object.entries(patches)) {
      const index = byName.get(name);
      if (index === undefined) {
        missing.push(name);
        continue;
      }
      for (const [key, value] of Object.entries(patch)) {
        if (FIELDS.has(key)) this.writeField(index, key, value);
      }
    }
    this.touch();
    return missing;
  }
}

export { GROUPS };
