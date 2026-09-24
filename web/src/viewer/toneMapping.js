import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping } from 'three';

// Same names and operators as model-viewer's `tone-mapping` attribute.
export const TONE_MAPPINGS = {
  neutral: NeutralToneMapping,
  aces: ACESFilmicToneMapping,
  agx: AgXToneMapping,
};

export function applyToneMapping(renderer, name, exposure) {
  renderer.toneMapping = TONE_MAPPINGS[name] ?? NeutralToneMapping;
  renderer.toneMappingExposure = exposure;
}
