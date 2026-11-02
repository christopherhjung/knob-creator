import Module from 'manifold-3d';

// One WASM instance shared by every model.
const wasm = await Module();
wasm.setup();
export const { Manifold, Mesh } = wasm;
