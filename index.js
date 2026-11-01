import { createControls } from './src/controls.js';
import { buildKnob } from './src/knob.js';
import { defaultValues, PARAMS } from './src/params.js';
import { createViewer } from './src/viewer.js';

const stats = document.querySelector('#stats');
const warningList = document.querySelector('#warnings');
const downloadButton = document.querySelector('#download');

const viewer = createViewer(document.querySelector('#viewer'));
const values = defaultValues();
let framedNut;

function update() {
  const knob = buildKnob(values);
  viewer.show(knob);

  // A new nut rescales the whole knob; ordinary slider moves keep the user's view.
  if (values.nutWidth !== framedNut) {
    viewer.frame();
    framedNut = values.nutWidth;
  }

  const triangles = knob.indices.length / 3;
  stats.textContent = `${triangles.toLocaleString()} triangles · ${(knob.volume / 1000).toFixed(1)} cm³`;
  warningList.replaceChildren(
    ...knob.warnings.map((text) => Object.assign(document.createElement('li'), { textContent: text })),
  );
  downloadButton.disabled = triangles === 0;
}

function downloadStl() {
  const url = URL.createObjectURL(new Blob([viewer.toStl()], { type: 'model/stl' }));
  Object.assign(document.createElement('a'), { href: url, download: 'knob.stl' }).click();
  URL.revokeObjectURL(url);
}

createControls(document.querySelector('#controls'), PARAMS, values, update);
downloadButton.addEventListener('click', downloadStl);
update();
