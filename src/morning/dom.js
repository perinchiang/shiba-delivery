export const $ = id => document.getElementById(id);

export function write(id, value) {
  const el = $(id);
  if (el.textContent !== value) el.textContent = value;
}
