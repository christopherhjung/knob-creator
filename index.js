import { createConfigsPanel } from './src/configs-panel.js';
import { createControls } from './src/controls.js';
import { downloadFile } from './src/download.js';
import { getLanguage, onLanguageChange, setLanguage, t } from './src/i18n.js';
import { MODELS } from './src/models.js';
import { defaultValues } from './src/params.js';
import { createPathEditor } from './src/path-editor.js';
import { createSlicerPanel } from './src/slicer-panel.js';
import { meshFootprint } from './src/slicer-settings.js';
import { createViewer } from './src/viewer.js';

const stats = document.querySelector('#stats');
const warningList = document.querySelector('#warnings');
const downloadButton = document.querySelector('#download');
const editorCanvas = document.querySelector('#path-editor');

// Each model keeps its own values while you switch between them.
const valuesOf = new Map(MODELS.map((model) => [model.id, defaultValues(model.params)]));
let model = MODELS[0];
let mesh;
let framed;

const values = () => valuesOf.get(model.id);
const viewer = createViewer(document.querySelector('#viewer'));
const slicer = createSlicerPanel(() => model, () => printableStl(), () => meshFootprint(mesh));
const editor = createPathEditor(editorCanvas, () => valuesOf.get('pipe'), () => scheduleUpdate());
const configs = createConfigsPanel(() => model, values, slicer.values, () => {
  renderText();
  update();
  slicer.render();
  viewer.frame();
});

// A pipe touching itself needs a union that takes about 0.4 s, so edits show a quick
// approximate mesh and the exact one follows once editing pauses.
let exactTimer;
function update(exact = false) {
  clearTimeout(exactTimer);
  mesh = model.build(values(), exact);
  if (mesh.approximate) exactTimer = setTimeout(() => update(true), 300);
  viewer.show(mesh);
  if (model.editor) editor.draw();

  // A new model or nut rescales everything; ordinary edits keep the user's view.
  const frameKey = `${model.id}:${values().nutWidth}`;
  if (frameKey !== framed) {
    viewer.frame();
    framed = frameKey;
  }

  const triangles = mesh.indices.length / 3;
  stats.textContent = t(`${triangles} triangles · ${(mesh.volume / 1000).toFixed(1)} cm³`);
  warningList.replaceChildren(
    ...mesh.warnings.map((text) => Object.assign(document.createElement('li'), { textContent: t(text) })),
  );
  downloadButton.disabled = triangles === 0;
  slicer.refresh();
}

/** The printable mesh as binary STL, building the exact one first if it is still pending. */
function printableStl() {
  if (mesh.approximate) update(true);
  return viewer.toStl();
}

// Dragging on the canvas fires faster than the screen redraws.
let pending = false;
function scheduleUpdate() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    update();
  });
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
    if ('placeholder' in element) element.placeholder = t(element.dataset.i18nLabel);
  }
  editorCanvas.dataset.front = t('Front of the bed');
  document.querySelector('#model-name').textContent = t(model.name);
  if (window.location.hash) document.title = `${t(model.name)} · KnobCreator`;
  for (const card of document.querySelectorAll('#model-list li')) {
    const { name, description } = MODELS.find(({ id }) => id === card.dataset.model);
    card.querySelector('strong').textContent = t(name);
    card.querySelector('span').textContent = t(description);
  }
  createControls(document.querySelector('#controls'), model.params, values(), scheduleUpdate);
}

// The model picker, each card with a 3D preview of the default model.
document.querySelector('#model-list').append(...MODELS.map(({ id, build, params }) => {
  const card = Object.assign(document.createElement('li'), { innerHTML: '<a><div class="preview"></div><strong></strong><span></span></a>' });
  card.dataset.model = id;
  card.querySelector('a').href = `#${id}`;
  const preview = createViewer(card.querySelector('.preview'));
  preview.show(build(defaultValues(params)));
  preview.frame();
  return card;
}));

/** Shows the picker for an empty hash, otherwise the model it names. */
function route() {
  const next = MODELS.find(({ id }) => `#${id}` === window.location.hash);
  document.querySelector('#home').hidden = Boolean(next);
  for (const element of document.querySelectorAll('.model-only')) element.hidden = !next;
  if (!next) {
    document.title = 'KnobCreator';
    return;
  }

  if (next !== model) showTab(document.querySelector('#tab-model'));
  model = next;
  editorCanvas.parentElement.hidden = !model.editor;
  document.querySelector('#stage').classList.toggle('with-editor', Boolean(model.editor));
  renderText();
  update();
  slicer.render();
  configs.render();
}

const languageSelect = document.querySelector('#language');
languageSelect.value = getLanguage();
languageSelect.addEventListener('change', () => setLanguage(languageSelect.value));
onLanguageChange(() => {
  renderText();
  update();
});

downloadButton.addEventListener('click', () => downloadFile(printableStl(), `${model.file}.stl`, 'model/stl'));
document.querySelectorAll('[role="tab"]').forEach((tab) => tab.addEventListener('click', () => showTab(tab)));
window.addEventListener('hashchange', route);
// Build the first model even on the picker, so the slicer panel always has a mesh.
renderText();
update();
slicer.render();
route();
