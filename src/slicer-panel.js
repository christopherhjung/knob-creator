import { createControls } from './controls.js';
import { downloadFile } from './download.js';
import { onLanguageChange, t } from './i18n.js';
import { sliceStl } from './slicer.js';
import { bedLayout, defaultSlicerValues, slicerParams } from './slicer-settings.js';

/**
 * Wires up the Slicer tab.
 * @param {() => object} getModel the model being edited, from MODELS
 * @param {() => DataView} getStl returns the current model as binary STL
 * @param {() => number[]} getFootprint returns its width and depth on the bed
 * @returns {{values: object, refresh: () => void, render: () => void}} the slicer values,
 *   `refresh` for when the model changes and `render` for when `values` or the model were replaced
 */
export function createSlicerPanel(getModel, getStl, getFootprint) {
  const status = document.querySelector('#slicer-status');
  const progress = document.querySelector('#slicer-progress');
  const button = document.querySelector('#slice');
  const layoutText = document.querySelector('#slicer-layout');
  const values = defaultSlicerValues();
  let slicing = false;

  function refreshLayout() {
    const layout = bedLayout(values, getFootprint());
    layoutText.textContent = t(layout.fits
      ? `${layout.cols} × ${layout.rows} grid, ${layout.width.toFixed(1)} × ${layout.depth.toFixed(1)} mm`
      : `Too many copies: ${layout.capacity} fit on the bed at this size and gap.`);
    button.disabled = slicing || !layout.fits;
    button.title = layout.fits ? '' : layoutText.textContent; // the button stays visible on every tab
  }

  function renderControls() {
    const { orientations } = getModel();
    if (!orientations.includes(values.orientation)) values.orientation = orientations[0];
    createControls(document.querySelector('#slicer-controls'), slicerParams(orientations), values, refreshLayout);
  }
  onLanguageChange(() => {
    renderControls();
    status.textContent = '';
    status.title = '';
    refreshLayout();
  });

  button.addEventListener('click', async () => {
    slicing = true;
    button.disabled = true;
    progress.hidden = false;
    progress.value = 0;
    status.textContent = t('Slicing…');
    status.title = '';

    try {
      const stl = getStl();
      const buffer = stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength);
      const { positions } = bedLayout(values, getFootprint());
      const gcode = await sliceStl(buffer, values, positions, (percent) => { progress.value = percent; });

      downloadFile(gcode, `${getModel().file}.gcode`, 'text/x-gcode');
      const layers = /;LAYER_COUNT:(\d+)/.exec(new TextDecoder().decode(gcode.subarray(0, 8192)));
      status.textContent = t(layers ? `Done: ${layers[1]} layers.` : 'Done.');
    } catch (error) {
      status.textContent = t(error.message);
      status.title = status.textContent; // the header cuts long messages off
    } finally {
      slicing = false;
      refreshLayout();
      progress.hidden = true;
    }
  });

  return {
    values,
    refresh: refreshLayout,
    render() {
      renderControls();
      refreshLayout();
    },
  };
}
