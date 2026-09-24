import { AdditiveBlending, Color, ShaderMaterial, Vector2 } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/*
 * Bloom as an additive glow layer on top of the normal frame.
 * The base image is still rendered straight to the canvas (same tone mapping, background and
 * transmission as without bloom, i.e. as model-viewer); only the glow comes from an HDR render
 * (half-float target, black background) through UnrealBloomPass.
 */

const BLACK = new Color(0);

const glowMaterial = () => new ShaderMaterial({
  uniforms: { tGlow: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tGlow;
    varying vec2 vUv;
    void main() {
      gl_FragColor = vec4(texture2D(tGlow, vUv).rgb, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  blending: AdditiveBlending,
  depthTest: false,
  depthWrite: false,
  transparent: true,
  toneMapped: true,
});

export class Bloom {
  constructor(renderer) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.renderToScreen = false;
    this.renderPass = new RenderPass();
    this.pass = new UnrealBloomPass(new Vector2(256, 256), 0.5, 0.4, 1);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.pass);
    this.quad = new FullScreenQuad(glowMaterial());
  }

  set({ strength, radius, threshold }) {
    Object.assign(this.pass, { strength, radius, threshold });
  }

  setSize(width, height, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  // Call right after the normal render to the canvas.
  render(scene, camera) {
    const { renderer } = this;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    const background = scene.background;
    scene.background = BLACK;
    this.composer.render();
    scene.background = background;

    this.quad.material.uniforms.tGlow.value = this.pass.renderTargetsHorizontal[0].texture;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(null);
    this.quad.render(renderer);
    renderer.autoClear = autoClear;
  }

  dispose() {
    this.composer.dispose();
    this.pass.dispose();
    this.quad.dispose();
    this.quad.material.dispose();
  }
}
