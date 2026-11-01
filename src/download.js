/** Saves in-memory bytes as a file in the browser. */
export function downloadFile(bytes, filename, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}
