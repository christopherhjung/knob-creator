/**
 * Renders one row per parameter into `form`: a dropdown if it has `options`,
 * otherwise a slider + number box.
 * Calls onChange(values) whenever a value changes.
 */
export function createControls(form, params, values, onChange) {
  const groups = new Map();
  const refreshers = [];
  const refreshAll = () => refreshers.forEach((refresh) => refresh());

  for (const param of params) {
    if (!groups.has(param.group)) {
      const fieldset = document.createElement('fieldset');
      fieldset.append(Object.assign(document.createElement('legend'), { textContent: param.group }));
      groups.set(param.group, fieldset);
      form.append(fieldset);
    }
    const create = param.options ? createSelectRow : createRow;
    groups.get(param.group).append(create(param, values, onChange, refreshers, refreshAll));
  }
}

// Scaled values can have long fractions; the model keeps them, the UI rounds them.
const display = (value) => Math.round(value * 100) / 100;

function createSelectRow({ key, label, options, apply }, values, onChange, refreshers, refreshAll) {
  const select = Object.assign(document.createElement('select'), { id: key });
  select.append(...options.map((option) => new Option(option.label, option.value)));
  select.value = values[key];
  select.addEventListener('change', () => {
    apply(values, Number(select.value));
    refreshAll();
    onChange(values);
  });
  return wrapRow(key, label, select);
}

function createRow({ key, label, unit = 'mm', min, max, step }, values, onChange, refreshers) {
  const range = Object.assign(document.createElement('input'), {
    type: 'range', id: key, min, max, step, value: values[key],
  });
  const number = Object.assign(document.createElement('input'), {
    type: 'number', min, max, step, value: display(values[key]),
  });
  number.setAttribute('aria-label', `${label} in ${unit}`);

  const set = (value) => {
    values[key] = value;
    range.value = value;
    onChange(values);
  };

  range.addEventListener('input', () => {
    number.value = range.value;
    set(range.valueAsNumber);
  });
  // While typing, apply only usable values: "1" on the way to "12" must not be rewritten.
  number.addEventListener('input', () => {
    const value = number.valueAsNumber;
    if (value >= min && value <= max) set(value);
  });
  number.addEventListener('change', () => {
    const value = Number.isFinite(number.valueAsNumber) ? number.valueAsNumber : values[key];
    const clamped = Math.min(max, Math.max(min, value));
    number.value = clamped;
    set(clamped);
  });

  refreshers.push(() => {
    range.value = values[key];
    number.value = display(values[key]);
  });

  return wrapRow(key, label, number, range);
}

function wrapRow(key, label, ...inputs) {
  const row = document.createElement('div');
  row.className = 'row';
  row.append(
    Object.assign(document.createElement('label'), { htmlFor: key, textContent: label }),
    ...inputs,
  );
  return row;
}
