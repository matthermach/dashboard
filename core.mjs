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

export function analyzeThroughput(days) {
  if (!Array.isArray(days) || !days.length || days.length > 20000) {
    throw new Error('Dane przepustowości muszą zawierać od 1 do 20 000 dni.');
  }
  const seen = new Set();
  for (const day of days) {
    if (!day || !validDate(day.date) || !Number.isSafeInteger(day.count) || day.count < 0 || seen.has(day.date)) {
      throw new Error('Nieprawidłowe dane przepustowości: wymagane są unikalne daty i nieujemne całkowite liczby elementów.');
    }
    seen.add(day.date);
  }
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const start = `${sorted[0].date.slice(0, 4)}-01-07`;
  const eligible = sorted.filter((day) => day.date >= start);
  if (!eligible.length) throw new Error('Brak danych przepustowości od 7 stycznia.');
  const dayMs = 86400000;
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const lastTime = Date.parse(`${eligible.at(-1).date}T00:00:00Z`);
  const weekMs = 7 * dayMs;
  const weeks = Array.from({ length: Math.floor((lastTime - startTime) / weekMs) + 1 }, (_, index) => {
    const time = startTime + index * weekMs;
    return {
      start: new Date(time).toISOString().slice(0, 10),
      end: new Date(time + 6 * dayMs).toISOString().slice(0, 10),
      count: 0,
      observedDays: 0,
    };
  });
  for (const day of eligible) {
    const index = Math.floor((Date.parse(`${day.date}T00:00:00Z`) - startTime) / weekMs);
    weeks[index].count += day.count;
    weeks[index].observedDays++;
    if (!Number.isSafeInteger(weeks[index].count)) throw new Error('Tygodniowa suma przepustowości przekracza bezpieczny zakres liczb.');
  }
  for (const [index, week] of weeks.entries()) {
    week.movingRange = index === 0 ? null : Math.abs(week.count - weeks[index - 1].count);
  }
  const total = weeks.reduce((sum, week) => sum + week.count, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Łączna przepustowość przekracza bezpieczny zakres liczb.');
  const mean = total / weeks.length;
  const meanMR = weeks.length > 1
    ? weeks.slice(1).reduce((sum, week) => sum + week.movingRange, 0) / (weeks.length - 1)
    : null;
  return {
    start, through: eligible.at(-1).date, weeks, total, mean, meanMR,
    xLimits: meanMR === null ? null : { lower: mean - 2.66 * meanMR, upper: mean + 2.66 * meanMR },
    mrLimits: meanMR === null ? null : { lower: meanMR - 3.27 * meanMR, upper: meanMR + 3.27 * meanMR },
  };
}
