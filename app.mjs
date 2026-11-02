import { SIZES, STORAGE_KEY, validDate, validatePoints, validateBackup, validateDateRange, analyze } from './core.mjs';

const $ = (selector) => document.querySelector(selector);
const colors = { S: '#bcf578', M: '#ab9bff', L: '#f6af73' };
const number = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('pl-PL', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const dayMs = 86400000;
const state = { points: [], excluded: new Set(), sizes: new Set(SIZES), dateRange: {}, ready: false, recovery: false };
let analysis;

function announce(message) { $('#status').textContent = message; }
function error(message) { $('#error').textContent = message; $('#error').hidden = false; }
function clearError() { $('#error').hidden = true; }
function snapshot() { return { version: 1, points: state.points, excluded: [...state.excluded] }; }
function persist() {
  if (state.recovery) {
    error('Lokalna kopia jest nieczytelna i nie została nadpisana. Zmiany w tej karcie nie zapisują się automatycznie. Wyeksportuj je jako JSON lub zaimportuj poprawną kopię, aby zastąpić uszkodzony zapis.');
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
    return true;
  } catch (cause) {
    error(`Nie udało się zapisać zmian w przeglądarce (${cause.message}). Zmiany pozostają w tej karcie — wyeksportuj kopię JSON przed jej zamknięciem.`);
    return false;
  }
}
function formatDate(value) { return dateFormat.format(new Date(`${value}T00:00:00Z`)); }
function timestamp(point) { return Date.parse(`${point.date}T00:00:00Z`); }

function render() {
  analysis = analyze(state.points, state.sizes, state.excluded, state.dateRange);
  const { visible, active } = analysis;
  $('#sample-count').textContent = active.length;
  const excludedCount = visible.length - active.length;
  $('#sample-detail').textContent = `${excludedCount} wykluczonych${active.length < 10 ? ' · mała próba' : ` · z ${visible.length} elementów`}`;
  for (const key of ['p50', 'p85', 'p95']) $(`#${key}`).textContent = analysis[key] === null ? '—' : number.format(analysis[key]);
  $('#count-all').textContent = state.points.length;
  for (const size of SIZES) {
    $(`#count-${size}`).textContent = state.points.filter((point) => point.size === size).length;
    const button = $(`[data-size="${size}"]`);
    button.setAttribute('aria-pressed', state.sizes.has(size));
    button.classList.toggle('active', state.sizes.has(size) && state.sizes.size !== 3);
  }
  $('[data-size="all"]').classList.toggle('active', state.sizes.size === 3);
  $('[data-size="all"]').setAttribute('aria-pressed', state.sizes.size === 3);
  const dates = visible.map((point) => point.date).sort();
  $('#date-range').textContent = dates.length ? `${formatDate(dates[0])} – ${formatDate(dates.at(-1))}` : 'Brak wybranych danych';
  $('#restore-button').disabled = state.excluded.size === 0;
  renderChart();
  renderTable();
}

function svgElement(tag, attributes = {}, text) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderChart() {
  if (!state.ready) return;
  const chart = $('#chart');
  $('#tooltip').hidden = true;
  chart.replaceChildren();
  const points = analysis.visible.filter((point) => $('#show-excluded').checked || !state.excluded.has(point.id));
  $('#chart-empty').hidden = points.length > 0;
  const width = Math.max(260, chart.getBoundingClientRect().width);
  const height = chart.getBoundingClientRect().height;
  chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const margin = { top: 20, right: 69, bottom: 38, left: 47 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const times = points.map(timestamp);
  let minTime = times.length ? Math.min(...times) : Date.UTC(2024, 0, 1);
  let maxTime = times.length ? Math.max(...times) : Date.UTC(2025, 0, 1);
  const padding = Math.max((maxTime - minTime) * .035, 7 * dayMs);
  minTime -= padding;
  maxTime += padding;
  const peak = Math.max(1, ...points.map((point) => point.days));
  const rawStep = peak / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].find((value) => value * magnitude >= rawStep) * magnitude;
  const maxY = Math.ceil(peak / step) * step;
  const x = (time) => margin.left + ((time - minTime) / (maxTime - minTime)) * plotWidth;
  const y = (days) => margin.top + (1 - days / maxY) * plotHeight;
  for (let value = 0; value <= maxY + step / 100; value += step) {
    chart.append(svgElement('line', { x1: margin.left, x2: width - margin.right, y1: y(value), y2: y(value), class: 'chart-grid' }));
    chart.append(svgElement('text', { x: margin.left - 10, y: y(value) + 3, 'text-anchor': 'end', class: 'chart-axis' }, number.format(value)));
  }
  const ticks = Math.max(2, Math.floor(plotWidth / 88));
  for (let index = 0; index <= ticks; index++) {
    const time = minTime + (index / ticks) * (maxTime - minTime);
    const label = maxTime - minTime < 70 * dayMs
      ? new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(time)
      : shortDate.format(time);
    chart.append(svgElement('text', { x: x(time), y: height - 12, 'text-anchor': 'middle', class: 'chart-axis' }, label));
  }
  let previousLabel = -Infinity;
  for (const [key, color] of [['p95', '#f6af73'], ['p85', '#bcf578'], ['p50', '#ab9bff']]) {
    const value = analysis[key];
    if (value === null) continue;
    chart.append(svgElement('line', { x1: margin.left, x2: width - margin.right, y1: y(value), y2: y(value), class: 'percentile-line', stroke: color }));
    const labelY = Math.max(y(value) + 3, previousLabel + 15);
    previousLabel = labelY;
    chart.append(svgElement('text', { x: width - margin.right + 8, y: labelY, fill: color, class: 'percentile-label' }, key.toUpperCase()));
  }
  for (const point of [...points].sort((a, b) => Number(state.excluded.has(b.id)) - Number(state.excluded.has(a.id)))) {
    const excluded = state.excluded.has(point.id);
    const circle = svgElement('circle', {
      cx: x(timestamp(point)), cy: y(point.days), r: 5, fill: colors[point.size], stroke: colors[point.size],
      class: `data-point${excluded ? ' excluded' : ''}`, tabindex: 0, role: 'button',
      'aria-label': `${point.size}, ${number.format(point.days)} dni, ${formatDate(point.date)}. ${excluded ? 'Przywróć do analizy' : 'Wyklucz z analizy'}`,
      'aria-pressed': !excluded, 'data-id': point.id,
    });
    circle.append(svgElement('title', {}, `${point.size} · ${number.format(point.days)} dni · ${formatDate(point.date)}`));
    circle.addEventListener('click', () => togglePoint(point.id, 'chart'));
    circle.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); togglePoint(point.id, 'chart'); }
    });
    const showTooltip = () => {
      const tooltip = $('#tooltip');
      tooltip.replaceChildren();
      const strong = document.createElement('strong');
      strong.textContent = `${point.size} · ${number.format(point.days)} dni`;
      const detail = document.createElement('small');
      detail.textContent = formatDate(point.date);
      const action = document.createElement('small');
      action.textContent = excluded ? 'Kliknij, aby przywrócić' : 'Kliknij, aby wykluczyć';
      tooltip.append(strong, detail, action);
      tooltip.hidden = false;
      tooltip.style.left = `${Math.max(4, Math.min(x(timestamp(point)) + 15, width - tooltip.offsetWidth - 4))}px`;
      tooltip.style.top = `${Math.max(0, y(point.days) - 70)}px`;
    };
    circle.addEventListener('pointerenter', showTooltip);
    circle.addEventListener('focus', showTooltip);
    circle.addEventListener('pointerleave', () => { $('#tooltip').hidden = true; });
    circle.addEventListener('blur', () => { $('#tooltip').hidden = true; });
    chart.append(circle);
  }
}

function togglePoint(id, surface) {
  if (state.excluded.has(id)) state.excluded.delete(id);
  else state.excluded.add(id);
  clearError();
  persist();
  render();
  announce(state.excluded.has(id) ? 'Element wykluczony z prognoz.' : 'Element przywrócony do prognoz.');
  const selector = surface === 'chart' ? '#chart circle' : '#data-body button';
  [...document.querySelectorAll(selector)].find((element) => element.dataset.id === id)?.focus({ preventScroll: true });
}

function cell(text, className) {
  const element = document.createElement('td');
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function renderTable() {
  const body = $('#data-body');
  body.replaceChildren();
  const sorted = [...analysis.visible].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const numbering = new Map(state.points.map((point, index) => [point.id, index + 1]));
  for (const point of sorted) {
    const row = document.createElement('tr');
    const excluded = state.excluded.has(point.id);
    row.classList.toggle('is-excluded', excluded);
    row.append(cell(`FL-${String(numbering.get(point.id)).padStart(3, '0')}`));
    const sizeCell = cell();
    const badge = document.createElement('span');
    badge.className = 'size-badge';
    const dot = document.createElement('i');
    dot.className = `dot size-${point.size}`;
    badge.append(dot, ` ${point.size}`);
    sizeCell.append(badge);
    row.append(sizeCell, cell(formatDate(point.date)), cell(`${number.format(point.days)} dni`));
    const sourceCell = cell();
    const source = document.createElement('span');
    source.className = 'source-tag';
    source.textContent = point.source === 'xlsx' ? 'XLSX' : 'Lokalnie';
    sourceCell.append(source);
    row.append(sourceCell);
    const actionCell = cell();
    const button = document.createElement('button');
    button.className = 'row-toggle';
    button.dataset.id = point.id;
    button.setAttribute('aria-pressed', !excluded);
    button.setAttribute('aria-label', `${excluded ? 'Przywróć' : 'Wyklucz'} FL-${String(numbering.get(point.id)).padStart(3, '0')}`);
    button.textContent = excluded ? 'Przywróć' : 'Uwzględniony';
    button.addEventListener('click', () => togglePoint(point.id, 'table'));
    actionCell.append(button);
    row.append(actionCell);
    body.append(row);
  }
  if (!sorted.length) {
    const row = document.createElement('tr');
    const empty = cell('Brak elementów dla wybranych filtrów.', 'empty-row');
    empty.colSpan = 6;
    row.append(empty);
    body.append(row);
  }
  $('#table-count').textContent = sorted.length;
  $('#table-summary').textContent = `${analysis.active.length} w analizie · ${sorted.length - analysis.active.length} wykluczonych · ${state.points.length} łącznie`;
}

for (const button of document.querySelectorAll('[data-size]')) {
  button.addEventListener('click', () => {
    if (!state.ready) return;
    const size = button.dataset.size;
    if (size === 'all') state.sizes = new Set(SIZES);
    else if (state.sizes.size === 3) state.sizes = new Set([size]);
    else if (state.sizes.has(size)) state.sizes.delete(size);
    else state.sizes.add(size);
    render();
    announce(`W analizie: ${analysis.active.length} elementów.`);
  });
}
$('#date-filter-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!state.ready) return;
  const dateRange = { from: $('#date-from').value, to: $('#date-to').value };
  try {
    validateDateRange(dateRange);
    state.dateRange = dateRange;
    $('#date-filter-error').hidden = true;
    render();
    announce(`Zastosowano zakres dat ukończenia. W analizie: ${analysis.active.length} elementów.`);
  } catch (cause) {
    $('#date-filter-error').textContent = cause.message;
    $('#date-filter-error').hidden = false;
  }
});
$('#date-filter-form').addEventListener('reset', () => {
  state.dateRange = {};
  $('#date-filter-error').hidden = true;
  if (!state.ready) return;
  render();
  announce(`Wyczyszczono filtr dat. W analizie: ${analysis.active.length} elementów.`);
});
$('#show-excluded').addEventListener('change', renderChart);
$('#restore-button').addEventListener('click', () => {
  if (!state.ready) return;
  state.excluded.clear();
  clearError();
  persist();
  render();
  announce('Przywrócono wszystkie wykluczone elementy, także poza aktywnymi filtrami.');
});
$('#completion-date').value = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
$('#add-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!state.ready) return;
  const data = new FormData(event.currentTarget);
  try {
    const point = validatePoints([{ id: `local-${crypto.randomUUID()}`, size: data.get('size'), days: Number(data.get('duration')), date: data.get('date'), source: 'local' }])[0];
    if (state.points.length >= 20000) throw new Error('Osiągnięto limit 20 000 punktów.');
    if (!validDate(point.date)) throw new Error('Podaj poprawną datę ukończenia.');
    state.points.push(point);
    state.sizes.add(point.size);
    clearError();
    const saved = persist();
    render();
    $('#duration').value = '';
    $('#duration').focus();
    const outsideRange = (state.dateRange.from && point.date < state.dateRange.from)
      || (state.dateRange.to && point.date > state.dateRange.to);
    announce(`Dodano element ${point.size}, ${number.format(point.days)} dni.${saved ? ' Zapisano lokalnie.' : ' Zapis lokalny nie powiódł się.'}${outsideRange ? ' Punkt poza wybranym zakresem dat — wyczyść filtr dat, aby go zobaczyć.' : ''}`);
  } catch (cause) { error(`Nie dodano elementu: ${cause.message}`); }
});
$('#export-button').addEventListener('click', () => {
  if (!state.ready) return;
  const blob = new Blob([JSON.stringify({ ...snapshot(), exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `flowlens-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce('Wyeksportowano kopię wszystkich punktów i wykluczeń.');
});
$('#import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file || !state.ready) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Plik jest zbyt duży (maksymalnie 10 MB).');
    const backup = validateBackup(JSON.parse(await file.text()));
    if (!window.confirm(`Zastąpić bieżące dane kopią zawierającą ${backup.points.length} punktów i ${backup.excluded.length} wykluczeń? Przed importem warto wyeksportować bieżącą kopię.`)) return;
    state.points = backup.points;
    state.excluded = new Set(backup.excluded);
    state.sizes = new Set(SIZES);
    state.recovery = false;
    clearError();
    persist();
    render();
    announce(`Zaimportowano ${state.points.length} punktów.`);
  } catch (cause) { error(`Nie zaimportowano kopii: ${cause.message}`); }
  finally { event.target.value = ''; }
});
new ResizeObserver(() => renderChart()).observe($('#chart-wrap'));

async function initialize() {
  let base;
  try {
    const response = await fetch('./data.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    base = validatePoints(await response.json());
  } catch (cause) {
    error(`Nie udało się wczytać danych XLSX (${cause.message}). Odśwież stronę lub sprawdź publikację data.json.`);
    return;
  }
  state.points = base;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const backup = validateBackup(JSON.parse(saved));
      // Local copies keep a complete snapshot; newly published XLSX rows are merged by stable ID.
      const localIds = new Set(backup.points.map((point) => point.id));
      state.points = validatePoints([...backup.points, ...base.filter((point) => !localIds.has(point.id))]);
      state.excluded = new Set(backup.excluded);
    }
  } catch (cause) {
    state.recovery = true;
    error(`Nie można odczytać lokalnej kopii (${cause.message}). Pokazano dane XLSX bez nadpisywania kopii. Zmiany nie zapiszą się automatycznie — wyeksportuj je do JSON. Import poprawnej kopii pozwoli zastąpić uszkodzony zapis.`);
  }
  state.ready = true;
  render();
}
initialize();
