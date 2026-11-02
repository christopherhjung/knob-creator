import { buildKnob } from './knob.js';
import { PARAMS } from './params.js';
import { buildPipe, PIPE_PARAMS } from './pipe.js';

// Every model the app can make. `build` returns {positions, indices, volume, warnings},
// `orientations` are the slicer's choices for it and `editor` adds the path canvas.
export const MODELS = [
  {
    id: 'knob',
    name: 'Turning knob',
    description: 'Oval knob with a stud, a hex nut pocket and grip grooves.',
    file: 'knob',
    params: PARAMS,
    build: buildKnob,
    orientations: ['stud', 'top'],
  },
  {
    id: 'pipe',
    name: 'Pipe adapter',
    description: 'Connects two pipe diameters along a curve you draw.',
    file: 'pipe-adapter',
    params: PIPE_PARAMS,
    build: buildPipe,
    orientations: ['flat'],
    editor: true,
  },
];
