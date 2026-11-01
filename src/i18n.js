// English text is the key; German lives in the table below, so a missing entry
// falls back to readable English. Numbers inside a text become {n}, which lets
// computed messages share one entry.
const GERMAN = {
  // Page
  Model: 'Modell',
  Slicer: 'Slicer',
  Sections: 'Bereiche',
  Language: 'Sprache',
  'Dimensions in mm': 'Maße in mm',
  'Download STL': 'STL herunterladen',
  'Slice & download G-code': 'Slicen & G-Code herunterladen',
  'Anycubic i3 Mega · {n} mm nozzle · {n} mm filament': 'Anycubic i3 Mega · {n} mm Düse · {n} mm Filament',
  '{n} triangles · {n} cm³': '{n} Dreiecke · {n} cm³',

  // Saved configurations
  Configurations: 'Konfigurationen',
  'Saved in this browser only.': 'Wird nur in diesem Browser gespeichert.',
  'Configuration name': 'Name der Konfiguration',
  'No saved configurations yet.': 'Noch keine gespeicherten Konfigurationen.',
  Save: 'Speichern',
  Load: 'Laden',
  Delete: 'Löschen',
  'Saved.': 'Gespeichert.',
  'Loaded.': 'Geladen.',
  'Could not save in this browser.': 'Speichern ist in diesem Browser nicht möglich.',
  'Delete this configuration?': 'Diese Konfiguration löschen?',
  'Replace the saved configuration with this name?': 'Gespeicherte Konfiguration mit diesem Namen ersetzen?',

  // Model settings
  Stud: 'Zapfen',
  Diameter: 'Durchmesser',
  Height: 'Höhe',
  'Bolt bore (0 = none)': 'Schraubenbohrung (0 = keine)',
  'Oval body': 'Ovaler Körper',
  Length: 'Länge',
  Width: 'Breite',
  'Top edge rounding': 'Kantenrundung oben',
  'Nut pocket': 'Muttertasche',
  'Nut size': 'Muttergröße',
  'M3 ({n} mm)': 'M3 ({n} mm)',
  'Floor thickness': 'Bodendicke',
  Clearance: 'Spiel',
  'Grip grooves': 'Griffrillen',
  'Grooves per pack (0 = none)': 'Rillen pro Gruppe (0 = keine)',
  'Distance between grooves': 'Abstand der Rillen',
  'Groove diameter': 'Rillendurchmesser',
  'Position (% tip to centre)': 'Position (% Spitze bis Mitte)',
  'Extra hole': 'Zusatzloch',
  'Diameter (0 = none)': 'Durchmesser (0 = keins)',
  'Position (% centre to edge)': 'Position (% Mitte bis Rand)',

  // Slicer settings
  Print: 'Druck',
  Orientation: 'Ausrichtung',
  'Stud down': 'Zapfen unten',
  'Top face down': 'Oberseite unten',
  Material: 'Material',
  'Bed layout': 'Bettbelegung',
  'Knobs on the bed': 'Drehknöpfe auf dem Bett',
  'Gap between knobs': 'Abstand der Drehknöpfe',
  Quality: 'Qualität',
  'Layer height': 'Schichthöhe',
  'Wall lines': 'Wandlinien',
  'Top and bottom layers': 'Deck- und Bodenschichten',
  Infill: 'Füllung',
  'Density (%)': 'Dichte (%)',
  Pattern: 'Muster',
  Grid: 'Gitter',
  Lines: 'Linien',
  Triangles: 'Dreiecke',
  Cubic: 'Kubisch',
  Gyroid: 'Gyroid',
  Temperature: 'Temperatur',
  'Nozzle (°C)': 'Düse (°C)',
  'Bed (°C)': 'Bett (°C)',
  'Fan (%)': 'Lüfter (%)',
  Speed: 'Geschwindigkeit',
  'Print (mm/s)': 'Druck (mm/s)',
  'Travel (mm/s)': 'Leerfahrt (mm/s)',
  Retraction: 'Rückzug',
  'Distance (0 = off)': 'Strecke (0 = aus)',
  'Speed (mm/s)': 'Geschwindigkeit (mm/s)',
  'Supports and adhesion': 'Stützen und Betthaftung',
  Supports: 'Stützen',
  None: 'Keine',
  'From bed': 'Vom Bett',
  Everywhere: 'Überall',
  'Bed adhesion': 'Betthaftung',
  Skirt: 'Skirt',
  Brim: 'Brim',
  Raft: 'Raft',

  // Units in screen reader labels
  lines: 'Linien',
  layers: 'Schichten',
  knobs: 'Drehknöpfe',
  grooves: 'Rillen',

  // Model warnings
  'The bore is at least as wide as the stud and removes it.':
    'Die Bohrung ist mindestens so breit wie der Zapfen und entfernt ihn.',
  'The floor reaches the top face, so there is no nut pocket.':
    'Der Boden reicht bis zur Oberseite, daher gibt es keine Muttertasche.',
  'The bore is wider than the nut, so the nut has nothing to sit on.':
    'Die Bohrung ist breiter als die Mutter, die Mutter hat also keine Auflage.',
  'The side wall around the pocket is only {n} mm thick.':
    'Die Seitenwand um die Tasche ist nur {n} mm dick.',
  'The rounding reaches the pocket, so the rim is lower than the top face.':
    'Die Rundung reicht bis zur Tasche, der Rand liegt daher tiefer als die Oberseite.',
  'A grip groove is only {n} mm from the nut pocket.':
    'Eine Griffrille ist nur {n} mm von der Muttertasche entfernt.',
  'A grip groove is only {n} mm from the extra hole.':
    'Eine Griffrille ist nur {n} mm vom Zusatzloch entfernt.',
  'The extra hole is only {n} mm from the nut pocket.':
    'Das Zusatzloch ist nur {n} mm von der Muttertasche entfernt.',
  'The extra hole is only {n} mm from the outer edge.':
    'Das Zusatzloch ist nur {n} mm vom Außenrand entfernt.',
  'The nut pocket cuts all the way through the body.':
    'Die Muttertasche geht ganz durch den Körper.',
  'The floor under the pocket is only {n} mm thick.':
    'Der Boden unter der Tasche ist nur {n} mm dick.',
  'The model has split into {n} separate pieces.':
    'Das Modell ist in {n} einzelne Teile zerfallen.',

  // Slicer messages
  'Slicing…': 'Wird gesliced…',
  'Done.': 'Fertig.',
  'Done: {n} layers.': 'Fertig: {n} Schichten.',
  '{n} × {n} grid, {n} × {n} mm': '{n} × {n} Raster, {n} × {n} mm',
  'Too many knobs: {n} fit on the bed at this size and gap.':
    'Zu viele Drehknöpfe: Bei dieser Größe und diesem Abstand passen {n} auf das Bett.',
  'The slicer engine could not be loaded. Run slicer/build.sh to compile it.':
    'Die Slicer-Engine konnte nicht geladen werden. Mit slicer/build.sh lässt sie sich kompilieren.',
};

const STORAGE_KEY = 'language';
const NUMBER = /(?<![\w.])\d+(?:\.\d+)?/g; // "i3" and "M3" are names, not numbers

function storedLanguage() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage can be blocked; the default still works
  }
}

let language = storedLanguage() === 'en' ? 'en' : 'de';
const listeners = [];

export const getLanguage = () => language;

export const onLanguageChange = (listener) => listeners.push(listener);

export function setLanguage(next) {
  language = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Only the next visit loses the choice.
  }
  listeners.forEach((listener) => listener());
}

/** Translates English text into the current language. */
export function t(text) {
  if (language === 'en') return text;
  if (text in GERMAN) return GERMAN[text];

  const numbers = text.match(NUMBER) ?? [];
  const template = GERMAN[text.replace(NUMBER, '{n}')];
  if (!template) return text;
  return template.replace(/\{n\}/g, () => numbers.shift().replace('.', ','));
}
