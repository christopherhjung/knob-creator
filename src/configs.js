// Saved configurations, kept in the browser's localStorage.

const STORAGE_KEY = 'knobCreator.configs';

function storage() {
  try {
    return localStorage;
  } catch {
    return null; // access itself can throw when site data is blocked
  }
}

export function readConfigs() {
  try {
    const configs = JSON.parse(storage()?.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(configs) ? configs.filter((config) => typeof config?.name === 'string') : [];
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

/** Saves a configuration, replacing one with the same name. @returns {boolean} success */
export function saveConfig(config) {
  const configs = readConfigs();
  const index = configs.findIndex(({ name }) => name === config.name);
  if (index >= 0) configs[index] = config;
  else configs.push(config);
  return writeConfigs(configs);
}

/** @returns {boolean} success */
export function deleteConfig(name) {
  return writeConfigs(readConfigs().filter((config) => config.name !== name));
}

/**
 * Copies saved values onto `values`. Sliders can change between versions, so anything
 * missing or no longer valid falls back to its default and numbers stay in range.
 */
export function applyConfig(values, params, saved) {
  for (const { key, value, min, max, options } of params) {
    const candidate = saved?.[key];
    if (options) {
      values[key] = options.some((option) => option.value === candidate) ? candidate : value;
    } else {
      values[key] = Number.isFinite(candidate) ? Math.min(max, Math.max(min, candidate)) : value;
    }
  }
}
