import { Box3, Color, MathUtils, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import { applyToneMapping } from './toneMapping.js';
import { loadEnvironment } from './environment.js';
import { createTransparency } from './transparency.js';

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

    new ResizeObserver(() => this.resize()).observe(canvas);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.renderer.domElement;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame() {
    this.controls.update();
    this.transparency.update(this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  async loadModel(url) {
    const loader = new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .setDRACOLoader(new DRACOLoader().setDecoderPath('./draco/'));
    const gltf = await loader.loadAsync(url);
    if (this.model) this.scene.remove(this.model);
    this.model = gltf.scene;
    this.scene.add(this.model);
    return gltf;
  }

  async setEnvironment(source, rotationDeg) {
    if (source !== this.envSource) {
      this.scene.environment?.dispose();
      this.scene.environment = await loadEnvironment(this.renderer, source);
      this.envSource = source;
    }
    this.scene.environmentRotation.y = MathUtils.degToRad(rotationDeg);
  }

  apply(state, prev = {}) {
    applyToneMapping(this.renderer, state.toneMapping, state.exposure);
    this.scene.background = new Color().setRGB(...state.background, SRGBColorSpace);
    if (this.model && state.transparency !== prev.transparency) {
      this.transparency.apply(this.model, state.transparency);
    }
  }

  // camera = { theta, phi, radius, target } in model-viewer's camera-orbit convention (degrees).
  frameCamera(camera) {
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
