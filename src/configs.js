// Saved configurations, kept in the browser's localStorage.

const STORAGE_KEY = 'knobCreator.configs';

function storage() {
  try {
    return localStorage;
  } catch {
    return null; // access itself can throw when site data is blocked
  }
}

// Configurations saved before there was more than one model have no type.
const typeOf = (config) => config.type ?? 'knob';
const same = (a, b) => a.name === b.name && typeOf(a) === typeOf(b);

/** @param {string} [type] only configurations of this model */
export function readConfigs(type) {
  try {
    const configs = JSON.parse(storage()?.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(configs)) return [];
    return configs.filter((config) => typeof config?.name === 'string' && (!type || typeOf(config) === type));
  } catch {
    return []; // damaged data must not stop the app from starting
  }
}

function writeConfigs(configs) {
  try {
    storage().setItem(STORAGE_KEY, JSON.stringify(configs));
    return true;
  } catch {
    return false; // blocked or full
  }
}

/** Saves a configuration, replacing one of the same model and name. @returns {boolean} success */
export function saveConfig(config) {
  const configs = readConfigs();
  const index = configs.findIndex((other) => same(other, config));
  if (index >= 0) configs[index] = config;
  else configs.push(config);
  return writeConfigs(configs);
}

/** @param {{name: string, type?: string}} config @returns {boolean} success */
export function deleteConfig(config) {
  return writeConfigs(readConfigs().filter((other) => !same(other, config)));
}

/**
 * Copies saved values onto `values`. Sliders can change between versions, so anything
 * missing or no longer valid falls back to its default and numbers stay in range.
 */
export function applyConfig(values, params, saved) {
  for (const { key, value, min, max, options, validate } of params) {
    const candidate = saved?.[key];
    if (validate) {
      values[key] = structuredClone(validate(candidate) ? candidate : value);
    } else if (options) {
      values[key] = options.some((option) => option.value === candidate) ? candidate : value;
    } else {
      values[key] = Number.isFinite(candidate) ? Math.min(max, Math.max(min, candidate)) : value;
    }
  }
}
