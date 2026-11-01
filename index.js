import { createControls } from './src/controls.js';
import { downloadFile } from './src/download.js';
import { getLanguage, onLanguageChange, setLanguage, t } from './src/i18n.js';
import { buildKnob } from './src/knob.js';
import { defaultValues, knobFootprint, PARAMS } from './src/params.js';
import { createSlicerPanel } from './src/slicer-panel.js';
import { createViewer } from './src/viewer.js';

const stats = document.querySelector('#stats');
const warningList = document.querySelector('#warnings');
const downloadButton = document.querySelector('#download');

const viewer = createViewer(document.querySelector('#viewer'));
const values = defaultValues();
let framedNut;
const refreshSlicer = createSlicerPanel(() => viewer.toStl(), () => knobFootprint(values));

function update() {
  const knob = buildKnob(values);
  viewer.show(knob);

  // A new nut rescales the whole knob; ordinary slider moves keep the user's view.
  if (values.nutWidth !== framedNut) {
    viewer.frame();
    framedNut = values.nutWidth;
  }

  const triangles = knob.indices.length / 3;
  stats.textContent = t(`${triangles} triangles · ${(knob.volume / 1000).toFixed(1)} cm³`);
  warningList.replaceChildren(
    ...knob.warnings.map((text) => Object.assign(document.createElement('li'), { textContent: t(text) })),
  );
  downloadButton.disabled = triangles === 0;
  refreshSlicer();
}

function showTab(selected) {
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    tab.setAttribute('aria-selected', tab === selected);
    document.getElementById(tab.getAttribute('aria-controls')).hidden = tab !== selected;
  }
}

function renderText() {
  document.documentElement.lang = getLanguage();
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-i18n-label]')) {
    element.setAttribute('aria-label', t(element.dataset.i18nLabel));
  }
  createControls(document.querySelector('#controls'), PARAMS, values, update);
}

const languageSelect = document.querySelector('#language');
languageSelect.value = getLanguage();
languageSelect.addEventListener('change', () => setLanguage(languageSelect.value));
onLanguageChange(() => {
  renderText();
  update();
});

renderText();
downloadButton.addEventListener('click', () => downloadFile(viewer.toStl(), 'knob.stl', 'model/stl'));
document.querySelectorAll('[role="tab"]').forEach((tab) => tab.addEventListener('click', () => showTab(tab)));
update();
