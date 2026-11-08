export function parseId(raw) {
  if (!/^\d+$/.test(String(raw))) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function parsePositiveInt(value, fallback, max) {
  if (value == null || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) return null;
  const number = Number(value);
  return number >= 1 && number <= max ? number : null;
}

export function parseNonNegativeInt(value) {
  if (value == null || value === '') return undefined;
  if (!/^\d+$/.test(String(value))) return null;
  return Number(value);
}
