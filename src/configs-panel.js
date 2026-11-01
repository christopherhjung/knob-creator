import { applyConfig, deleteConfig, readConfigs, saveConfig } from './configs.js';
import { getLanguage, onLanguageChange, t } from './i18n.js';
import { PARAMS } from './params.js';
import { SLICER_PARAMS } from './slicer-settings.js';

/**
 * Wires up the configurations tab.
 * @param {object} model current model values, changed in place on load
 * @param {object} slicer current slicer values, changed in place on load
 * @param {() => void} onLoad redraws the app after loading
 */
export function createConfigsPanel(model, slicer, onLoad) {
  const form = document.querySelector('#config-form');
  const nameInput = document.querySelector('#config-name');
  const list = document.querySelector('#config-list');
  const status = document.querySelector('#config-status');

  const say = (message) => { status.textContent = t(message); };

  function button(label, onClick, className = '') {
    const element = Object.assign(document.createElement('button'), {
      type: 'button', textContent: t(label), className,
    });
    element.addEventListener('click', onClick);
    return element;
  }

  function load(config) {
    applyConfig(model, PARAMS, config.model);
    applyConfig(slicer, SLICER_PARAMS, config.slicer);
    nameInput.value = config.name;
    onLoad();
    say('Loaded.');
  }

  function remove(config) {
    if (!window.confirm(t('Delete this configuration?'))) return;
    if (deleteConfig(config.name)) render();
    else say('Could not save in this browser.');
  }

  function row(config) {
    const name = Object.assign(document.createElement('strong'), { textContent: config.name });
    const date = Object.assign(document.createElement('small'), {
      textContent: new Date(config.savedAt).toLocaleString(getLanguage(), { dateStyle: 'short', timeStyle: 'short' }),
    });
    const item = document.createElement('li');
    item.append(
      name,
      date,
      button('Load', () => load(config)),
      button('Delete', () => remove(config), 'secondary'),
    );
    return item;
  }

  function render() {
    const configs = readConfigs();
    list.replaceChildren(...configs.map(row));
    document.querySelector('#config-empty').hidden = configs.length > 0;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    const exists = readConfigs().some((config) => config.name === name);
    if (exists && !window.confirm(t('Replace the saved configuration with this name?'))) return;

    const saved = saveConfig({ name, savedAt: Date.now(), model: { ...model }, slicer: { ...slicer } });
    say(saved ? 'Saved.' : 'Could not save in this browser.');
    render();
  });

  onLanguageChange(() => {
    status.textContent = '';
    render();
  });
  render();
}
