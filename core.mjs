export const SIZES = ['S', 'M', 'L'];
export const STORAGE_KEY = 'flowlens-dashboard-v1';

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validatePoints(points) {
  if (!Array.isArray(points) || points.length > 20000) throw new Error('Dane muszą być listą maksymalnie 20 000 punktów.');
  const ids = new Set();
  return points.map((point) => {
    if (!point || typeof point.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(point.id)
      || ids.has(point.id) || !SIZES.includes(point.size) || !validDate(point.date)
      || typeof point.days !== 'number' || !Number.isFinite(point.days) || point.days <= 0
      || !['xlsx', 'local'].includes(point.source)) {
      throw new Error('Nieprawidłowy punkt: sprawdź unikalne ID, rozmiar S/M/L, datę i dodatni czas w dniach.');
    }
    ids.add(point.id);
    return { id: point.id, size: point.size, date: point.date, days: point.days, source: point.source };
  });
}

export function validateBackup(input) {
  if (!input || input.version !== 1) throw new Error('Nieobsługiwany format kopii. Wybierz eksport JSON z FlowLens.');
  const points = validatePoints(input.points);
  const ids = new Set(points.map((point) => point.id));
  if (!Array.isArray(input.excluded) || input.excluded.some((id) => !ids.has(id))
    || new Set(input.excluded).size !== input.excluded.length) {
    throw new Error('Kopia zawiera nieprawidłową listę wykluczeń.');
  }
  return { version: 1, points, excluded: [...input.excluded] };
}

export function percentile(values, probability) {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error('Percentyl musi mieścić się w zakresie 0–1.');
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return sorted[lower] * (1 - fraction) + sorted[Math.ceil(index)] * fraction;
}

export function validateDateRange({ from = '', to = '' } = {}) {
  if ((from !== '' && !validDate(from)) || (to !== '' && !validDate(to))) {
    throw new Error('Podaj poprawne daty ukończenia od 1900-01-01 do 9999-12-31.');
  }
  if (from && to && from > to) throw new Error('Data „od” nie może być późniejsza niż data „do”.');
}

export function analyze(points, sizes, excluded, dateRange = {}) {
  validateDateRange(dateRange);
  const { from, to } = dateRange;
  const visible = points.filter((point) => sizes.has(point.size)
    && (!from || point.date >= from) && (!to || point.date <= to));
  const active = visible.filter((point) => !excluded.has(point.id));
  const values = active.map((point) => point.days);
  return { visible, active, p50: percentile(values, .5), p85: percentile(values, .85), p95: percentile(values, .95) };
}
