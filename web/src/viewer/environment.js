import { EquirectangularReflectionMapping, PMREMGenerator } from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// TODO: MV's "neutral" is its own EnvironmentScene, not RoomEnvironment — port it for a pixel match.
export async function loadEnvironment(renderer, source) {
  const pmrem = new PMREMGenerator(renderer);
  try {
    if (!source || source === 'neutral') {
      return pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    }
    const loader = source.toLowerCase().endsWith('.exr') ? new EXRLoader() : new HDRLoader();
    const equirect = await loader.loadAsync(source);
    equirect.mapping = EquirectangularReflectionMapping;
    const env = pmrem.fromEquirectangular(equirect).texture;
    equirect.dispose();
    return env;
  } finally {
    pmrem.dispose();
  }
}
