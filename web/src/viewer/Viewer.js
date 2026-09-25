import {
  AnimationMixer, Box3, Clock, Color, MathUtils, PerspectiveCamera, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3,
  WebGLRenderer,
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
    const dt = this.clock.getDelta();
    this.mixer?.update(dt);
    this.controls.update();
    this.transparency.update(this.camera);
    this.renderer.render(this.scene, this.camera);
    if (this.bloomOn) this.bloom.render(this.scene, this.camera);
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

  // kind: 'gltf' (GLB) or 'usd' (USDZ/USDA/USDC, view only: no parser, so the editor can't bind it).
  async loadModel(url, kind = 'gltf') {
    let gltf;
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
    if (this.model) {
      this.mixer?.stopAllAction();
      this.scene.remove(this.model);
      disposeTree(this.model);
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

  // All clips at once: Blender exports one clip per object action, and they belong together.
  playAnimations(clips = []) {
    this.mixer = clips.length ? new AnimationMixer(this.model) : null;
    for (const clip of clips) this.mixer.clipAction(clip).play();
    this.clock.getDelta();
  }

  // model-viewer ignores KHR_lights_punctual: hidden by default so both look the same.
  lightsVisible = false;

  setLightsVisible(on) {
    this.lightsVisible = on;
    this.model?.traverse((o) => {
      if (o.isLight) o.visible = on;
    });
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
    this.raycaster.setFromCamera(ndc, this.camera);
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
