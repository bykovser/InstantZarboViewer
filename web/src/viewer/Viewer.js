import {
  AnimationMixer, Box3, Clock, Color, MathUtils, PerspectiveCamera, Raycaster, Scene, Spherical, SRGBColorSpace, Vector2,
  Vector3, WebGLRenderer,
} from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import { Bloom } from './bloom.js';
import { applyToneMapping } from './toneMapping.js';
import { loadEnvironment } from './environment.js';
import { createTransparency } from './transparency.js';
import { materialsByName, patchMaterial } from './materials.js';

const _sph = new Spherical();
const _sph2 = new Spherical();
const _v = new Vector3();
const _t = new Vector3();

// A side's camera = the shared camera + this offset (orbit angles, zoom ratio, target shift).
const zeroOffset = () => ({ theta: 0, phi: 0, zoom: 1, target: new Vector3() });
const isZeroOffset = (o) => !o.theta && !o.phi && o.zoom === 1 && o.target.lengthSq() === 0;

export const ALL_CLIPS = '*';

// One clip by name (default: the first, like model-viewer), or all at once for per-object actions.
function pickClips(clips = [], name) {
  if (!clips.length) return [];
  if (name === ALL_CLIPS) return clips;
  return [clips.find((c) => c.name === name) ?? clips[0]];
}

function disposeTree(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry.dispose();
    for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose();
    }
  });
}

export class Viewer {
  constructor(canvas) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(30, 1, 0.01, 1000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;

    this.transparency = createTransparency(this.renderer);
    this.model = null;
    this.envSource = null;
    this.clock = new Clock();
    this.mixer = null;

    // Compare (wipe): B lives in its own scene sharing background/environment; each side its own camera.
    this.sceneB = new Scene();
    this.transparencyB = createTransparency(this.renderer);
    this.camA = this.camera.clone();
    this.camB = this.camera.clone();
    this.driver = this.camera.clone();
    this.compare = null;
    this.alt = null;
    this.bindAlt(canvas);

    new ResizeObserver(() => this.resize()).observe(canvas);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.renderer.domElement;
    this.renderer.setSize(w, h, false);
    this.bloom?.setSize(w, h, this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame() {
    const dt = this.paused ? (this.clock.getDelta(), 0) : this.clock.getDelta();
    this.controls.update();
    this.stepAnimations(dt);
    if (this.compare) {
      this.renderCompare();
      return;
    }
    this.transparency.update(this.camera);
    this.renderer.render(this.scene, this.camera);
    if (this.bloomOn) this.bloom.render(this.scene, this.camera);
  }

  // --- compare ---------------------------------------------------------------

  // gltfB: the other tab's model (cached, never disposed here); null ends the comparison.
  setCompare(gltfB) {
    this.endAlt();
    const prev = this.compare;
    if (prev?.model && prev.model !== gltfB?.scene && prev.model.parent === this.sceneB) this.sceneB.remove(prev.model);
    prev?.mixer?.stopAllAction();
    if (!gltfB) {
      this.compare = null;
      return;
    }
    this.sceneB.add(gltfB.scene);
    const clips = gltfB.animations ?? [];
    this.compare = {
      model: gltfB.scene, clips, actions: [], mixer: clips.length ? new AnimationMixer(gltfB.scene) : null,
      split: prev?.split ?? 0.5,
      offsets: prev?.offsets ?? { a: zeroOffset(), b: zeroOffset() },
    };
    this.playCompareClips();
    if (this.transparencyMode) this.transparencyB.apply(gltfB.scene, this.transparencyMode);
    gltfB.scene.traverse((o) => { if (o.isLight) o.visible = this.lightsVisible; });
  }

  setSplit(x) {
    if (this.compare) this.compare.split = MathUtils.clamp(x, 0, 1);
  }

  resetOffsets() {
    if (!this.compare) return;
    this.endAlt();
    this.compare.offsets = { a: zeroOffset(), b: zeroOffset() };
  }

  hasOffsets() {
    return Boolean(this.compare) && !(isZeroOffset(this.compare.offsets.a) && isZeroOffset(this.compare.offsets.b));
  }

  sideAt(clientX) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return (clientX - rect.left) / rect.width < this.compare.split ? 'a' : 'b';
  }

  placeCamera(cam, offset) {
    const target = this.alt ? this.alt.baseTarget : this.controls.target;
    _sph.setFromVector3(_v.copy(this.camera.position).sub(target));
    _sph.theta += offset.theta;
    _sph.phi = MathUtils.clamp(_sph.phi + offset.phi, 1e-4, Math.PI - 1e-4);
    _sph.radius *= offset.zoom;
    _t.copy(target).add(offset.target);
    cam.position.setFromSpherical(_sph).add(_t);
    cam.up.copy(this.camera.up);
    cam.lookAt(_t);
    cam.projectionMatrix.copy(this.camera.projectionMatrix);
    cam.projectionMatrixInverse.copy(this.camera.projectionMatrixInverse);
    cam.updateMatrixWorld();
  }

  // Offset of the Alt driver from the shared camera.
  driverOffset() {
    const { baseTarget } = this.alt;
    _sph.setFromVector3(_v.copy(this.camera.position).sub(baseTarget));
    _sph2.setFromVector3(_v.copy(this.driver.position).sub(this.controls.target));
    return {
      theta: _sph2.theta - _sph.theta,
      phi: _sph2.phi - _sph.phi,
      zoom: _sph2.radius / _sph.radius,
      target: this.controls.target.clone().sub(baseTarget),
    };
  }

  renderCompare() {
    const { offsets, split } = this.compare;
    if (this.alt) offsets[this.alt.side] = this.driverOffset();
    this.placeCamera(this.camA, offsets.a);
    this.placeCamera(this.camB, offsets.b);

    const r = this.renderer;
    const { clientWidth: w, clientHeight: h } = r.domElement;
    const x = Math.round(w * split);
    this.sceneB.background = this.scene.background;
    this.sceneB.environment = this.scene.environment;
    this.sceneB.environmentRotation.copy(this.scene.environmentRotation);

    r.setScissorTest(true);
    r.setScissor(0, 0, x, h);
    this.transparency.update(this.camA);
    r.render(this.scene, this.camA);
    r.setScissor(x, 0, w - x, h);
    this.transparencyB.update(this.camB);
    r.render(this.sceneB, this.camB);
    r.setScissorTest(false);
  }

  // Alt + mouse: orbit only the side under the cursor (its own offset). Alt released: back to shared orbit.
  bindAlt(canvas) {
    const start = (e) => {
      if (!this.compare || !e.altKey || this.alt) return;
      e.preventDefault();
      this.beginAlt(this.sideAt(e.clientX));
    };
    canvas.addEventListener('pointerdown', start, { capture: true });
    canvas.addEventListener('wheel', start, { capture: true, passive: false });
    addEventListener('keydown', (e) => { if (e.key === 'Alt' && this.compare) e.preventDefault(); });
    addEventListener('keyup', (e) => { if (e.key === 'Alt') this.endAlt(); });
    addEventListener('blur', () => this.endAlt());
  }

  beginAlt(side) {
    const cam = side === 'a' ? this.camA : this.camB;
    const baseTarget = this.controls.target.clone();
    this.alt = { side, baseTarget };
    this.driver.position.copy(cam.position);
    this.driver.quaternion.copy(cam.quaternion);
    this.controls.object = this.driver;
    this.controls.target.copy(baseTarget).add(this.compare.offsets[side].target);
  }

  endAlt() {
    if (!this.alt) return;
    // Flush the driver's inertia so it doesn't spill onto the shared camera.
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = damping;
    this.compare.offsets[this.alt.side] = this.driverOffset();
    this.controls.object = this.camera;
    this.controls.target.copy(this.alt.baseTarget);
    this.alt = null;
  }

  setBloom({ bloom, bloomStrength, bloomRadius, bloomThreshold }) {
    this.bloomOn = Boolean(bloom);
    if (!this.bloomOn) return;
    if (!this.bloom) {
      this.bloom = new Bloom(this.renderer);
      this.resize();
    }
    this.bloom.set({ strength: bloomStrength, radius: bloomRadius, threshold: bloomThreshold });
  }

  // Parsed models of open tabs: switching back is instant and keeps nothing but the scene graph.
  cache = new Map(); // url -> gltf

  // kind: 'gltf' (GLB) or 'usd' (USDZ/USDA/USDC, view only: no parser, so the editor can't bind it).
  // keep: cache the parsed model for tab switching (editor rebuilds pass temporary URLs and don't).
  async getModel(url, kind = 'gltf', keep = true) {
    let gltf = this.cache.get(url);
    if (gltf) return gltf;
    if (kind === 'usd') {
      const { USDLoader } = await import('three/addons/loaders/USDLoader.js');
      const group = await new USDLoader().loadAsync(url);
      gltf = { scene: group, animations: group.animations ?? [], parser: null };
    } else {
      this.loader ??= new GLTFLoader()
        .setMeshoptDecoder(MeshoptDecoder)
        .setDRACOLoader(new DRACOLoader().setDecoderPath('./draco/'));
      gltf = await this.loader.loadAsync(url);
    }
    if (keep) this.cache.set(url, gltf);
    return gltf;
  }

  async loadModel(url, kind = 'gltf', { keep = false } = {}) {
    const gltf = await this.getModel(url, kind, keep);
    if (this.model && this.model !== gltf.scene) {
      this.mixer?.stopAllAction();
      this.scene.remove(this.model);
      if (!this.isCached(this.model)) disposeTree(this.model);
    }
    this.gltf = gltf;
    this.kind = kind;
    this.model = gltf.scene;
    this.scene.add(this.model);
    this.playAnimations(gltf.animations);
    this.refreshTransparency();
    this.setLightsVisible(this.lightsVisible);
    for (const fn of this.modelListeners) fn(gltf);
    return gltf;
  }

  modelListeners = new Set();

  isCached(scene) {
    for (const g of this.cache.values()) if (g.scene === scene) return true;
    return false;
  }

  // Drop a cached model (tab closed or its file is stale). The one on screen stays until replaced.
  forget(url) {
    const gltf = this.cache.get(url);
    if (!gltf) return;
    this.cache.delete(url);
    if (gltf.scene !== this.model && gltf.scene !== this.compare?.model) disposeTree(gltf.scene);
  }

  // All clips at once: Blender exports one clip per object action, and they belong together.
  clipName = null; // null = first clip, ALL_CLIPS = all together
  paused = false;

  playAnimations(clips = []) {
    this.mixer = clips.length ? new AnimationMixer(this.model) : null;
    this.actions = pickClips(clips, this.clipName).map((clip) => this.mixer.clipAction(clip).play());
    this.clock.getDelta();
    this.animTime = 0;
    if (this.compare) this.playCompareClips();
  }

  // Name of what A plays (B follows it), or ALL_CLIPS.
  currentClip() {
    if (this.clipName === ALL_CLIPS) return ALL_CLIPS;
    return this.actions?.[0]?.getClip().name ?? null;
  }

  setClip(name) {
    this.clipName = name;
    this.mixer?.stopAllAction();
    this.playAnimations(this.gltf?.animations);
  }

  playCompareClips() {
    const c = this.compare;
    c.mixer?.stopAllAction();
    c.actions = pickClips(c.clips, this.currentClip()).map((clip) => c.mixer.clipAction(clip).play());
    this.animTime = 0;
  }

  // One timeline for everything playing (A, and B when comparing): looping over the longest clip;
  // a shorter clip holds its last pose, so compared sides stay in phase. Scrub = set the time.
  animTime = 0;
  speed = 1;
  pingPong = false;

  animActions() {
    return [...(this.actions ?? []), ...(this.compare?.actions ?? [])];
  }

  animPeriod() {
    return Math.max(0, ...this.animActions().map((a) => a.getClip().duration));
  }

  // Position on the timeline: { time, period } with time in [0, period].
  animPosition() {
    const period = this.animPeriod();
    let time = this.animTime;
    if (this.pingPong && time > period) time = 2 * period - time;
    return { time, period };
  }

  seek(time) {
    this.animTime = MathUtils.clamp(time, 0, this.animPeriod());
    this.stepAnimations(0);
  }

  stepAnimations(dt) {
    const actions = this.animActions();
    if (!actions.length) return;
    const period = this.animPeriod() || 1;
    const span = this.pingPong ? 2 * period : period;
    this.animTime = (((this.animTime + dt * this.speed) % span) + span) % span;
    const { time } = this.animPosition();
    for (const a of actions) a.time = Math.min(time, a.getClip().duration * 0.99999);
    this.mixer?.update(0);
    this.compare?.mixer?.update(0);
  }

  // model-viewer ignores KHR_lights_punctual: hidden by default so both look the same.
  lightsVisible = false;

  setLightsVisible(on) {
    this.lightsVisible = on;
    for (const root of [this.model, this.compare?.model]) {
      root?.traverse((o) => {
        if (o.isLight) o.visible = on;
      });
    }
  }

  refreshTransparency() {
    if (this.model && this.transparencyMode) this.transparency.apply(this.model, this.transparencyMode);
  }

  // Mesh + material under a canvas point, or null.
  pick(clientX, clientY) {
    if (!this.model) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster ??= new Raycaster();
    // Compare: only side A (the editable tab) is pickable.
    if (this.compare && this.sideAt(clientX) === 'b') return null;
    this.raycaster.setFromCamera(ndc, this.compare ? this.camA : this.camera);
    const hit = this.raycaster.intersectObject(this.model, true).find((h) => h.object.isMesh && !h.object.userData.izvPrepass);
    if (!hit) return null;
    const mats = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
    const material = hit.face && mats.length > 1 ? mats[hit.face.materialIndex] : mats[0];
    return { mesh: hit.object, material };
  }

  async setEnvironment(source, rotationDeg) {
    if (source !== this.envSource) {
      this.scene.environment?.dispose();
      this.scene.environment = await loadEnvironment(this.renderer, source);
      this.envSource = source;
    }
    this.scene.environmentRotation.y = MathUtils.degToRad(rotationDeg);
  }

  // Returns { missing: [material names], skipped: [props needing re-export] }.
  patchMaterials(patches) {
    const byName = materialsByName(this.model);
    const missing = [];
    const skipped = new Set();
    let alphaChanged = false;
    for (const [name, patch] of Object.entries(patches)) {
      const mats = byName.get(name);
      if (!mats) {
        missing.push(name);
        continue;
      }
      for (const m of mats) patchMaterial(m, patch).forEach((k) => skipped.add(k));
      alphaChanged ||= 'alphaMode' in patch;
    }
    if (alphaChanged) this.refreshTransparency();
    return { missing, skipped: [...skipped] };
  }

  apply(state, prev = {}) {
    applyToneMapping(this.renderer, state.toneMapping, state.exposure);
    this.scene.background = new Color().setRGB(...state.background, SRGBColorSpace);
    this.scene.environmentRotation.y = MathUtils.degToRad(state.environmentRotation);
    this.setBloom(state);
    if (state.showLights !== this.lightsVisible) this.setLightsVisible(state.showLights);
    if (this.model && state.transparency !== prev.transparency) {
      this.transparencyMode = state.transparency;
      this.transparency.apply(this.model, state.transparency);
      if (this.compare) this.transparencyB.apply(this.compare.model, state.transparency);
    }
  }

  // camera = { theta, phi, radius, target } in model-viewer's camera-orbit convention (degrees).
  frameCamera(camera) {
    // Skinned bounds come from posed bones: pose them first, or USD (Z-up bind space) frames sideways.
    this.mixer?.update(0);
    this.model.updateMatrixWorld(true);
    this.model.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.skeleton.update();
      o.computeBoundingBox();
    });
    const box = new Box3().setFromObject(this.model);
    const size = box.getSize(new Vector3()).length() || 1;
    const target = camera?.target ? new Vector3(...camera.target) : box.getCenter(new Vector3());
    const theta = MathUtils.degToRad(camera?.theta ?? 0);
    const phi = MathUtils.degToRad(camera?.phi ?? 75);
    const vFov = MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const radius = camera?.radius ?? (size / 2) / Math.sin(Math.min(vFov, hFov) / 2);

    this.camera.near = size / 1000;
    this.camera.far = size * 100;
    this.camera.position.set(
      target.x + radius * Math.sin(phi) * Math.sin(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * Math.sin(phi) * Math.cos(theta),
    );
    this.controls.target.copy(target);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
}
