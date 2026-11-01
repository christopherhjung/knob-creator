import { createControls } from './src/controls.js';
import { downloadFile } from './src/download.js';
import { buildKnob } from './src/knob.js';
import { defaultValues, PARAMS } from './src/params.js';
import { createSlicerPanel } from './src/slicer-panel.js';
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

function showTab(selected) {
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    tab.setAttribute('aria-selected', tab === selected);
    document.getElementById(tab.getAttribute('aria-controls')).hidden = tab !== selected;
  }
}

createControls(document.querySelector('#controls'), PARAMS, values, update);
downloadButton.addEventListener('click', () => downloadFile(viewer.toStl(), 'knob.stl', 'model/stl'));
document.querySelectorAll('[role="tab"]').forEach((tab) => tab.addEventListener('click', () => showTab(tab)));
createSlicerPanel(() => viewer.toStl());
update();
