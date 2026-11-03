import { ROADMAP_STORAGE_KEY, calendarMonths, emptyPlan, validatePlan, forecastRoadmap } from './roadmap-core.mjs';

const escape = (value) => String(value).replace(/[&<>"']/g, (character) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const id = () => crypto.randomUUID();
const $ = (selector) => document.querySelector(selector);
const percent = (value) => new Intl.NumberFormat('pl-PL', { style: 'percent', maximumFractionDigits: 1 }).format(value);
const dateLabel = (value) => value ? new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${value}T00:00:00Z`)) : 'Poza horyzontem';
const removeButton = (action, entry) => `<button type="button" class="button secondary small" data-action="${action}" data-id="${entry.id}" aria-label="Usuń ${escape(entry.name)}">Usuń</button>`;
const orderButtons = (kind, entry, index, length) => `<span class="roadmap-order"><button type="button" class="button secondary small" data-action="move-${kind}" data-id="${entry.id}" data-direction="-1" aria-label="Wyższy priorytet: ${escape(entry.name)}" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" class="button secondary small" data-action="move-${kind}" data-id="${entry.id}" data-direction="1" aria-label="Niższy priorytet: ${escape(entry.name)}" ${index === length - 1 ? 'disabled' : ''}>↓</button></span>`;
const options = (entries, selected) => entries.map((entry) =>
  `<option value="${entry.id}" ${entry.id === selected ? 'selected' : ''}>${escape(entry.name)}</option>`).join('');
const dateInput = (label, value, entity, field) => `<label class="roadmap-field">${label}<input class="text-input" type="date" min="1900-01-01" max="9999-12-31" data-entity="${entity.id}" data-field="${field}" value="${escape(value)}" ${field === 'start' && !('teamId' in entity) ? 'required' : ''}></label>`;

export function initializeRoadmap() {
  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  let plan = emptyPlan(month);
  let recovery = false;
  let unsaved = false;
  let result = null;
  const error = (message) => { $('#roadmap-error').textContent = message; $('#roadmap-error').hidden = false; };
  try {
    const saved = localStorage.getItem(ROADMAP_STORAGE_KEY);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      validatePlan(parsed);
      plan = parsed;
    }
  } catch (cause) {
    recovery = true;
    error(`Nie wczytano lokalnego planu: ${cause.message} Zapis nie zostanie nadpisany. Eksportuj zmiany z tej karty lub importuj poprawną kopię.`);
  }

  function persist() {
    if (recovery) {
      unsaved = true;
      error('Lokalny zapis jest niedostępny lub uszkodzony i nie został nadpisany. Eksportuj plan z tej karty lub importuj poprawną kopię.');
      return false;
    }
    try {
      localStorage.setItem(ROADMAP_STORAGE_KEY, JSON.stringify(plan));
      unsaved = false;
      return true;
    } catch (cause) {
      unsaved = true;
      error(`Nie zapisano planu w przeglądarce: ${cause.message} Eksportuj JSON przed zamknięciem karty.`);
      return false;
    }
  }

  function change(mutate) {
    const next = structuredClone(plan);
    try {
      mutate(next);
      validatePlan(next);
      plan = next;
      result = null;
      $('#roadmap-error').hidden = true;
      const saved = persist();
      render();
      $('#roadmap-status').textContent = saved ? 'Plan zapisany lokalnie. Oblicz prognozę dla aktualnych danych.' : 'Zmiany tylko w tej karcie — wykonaj eksport.';
      return true;
    } catch (cause) {
      render();
      error(cause.message);
      return false;
    }
  }

  function render() {
    $('#roadmap-month').value = plan.startMonth;
    $('#roadmap-team-count').textContent = plan.teams.length;
    $('#roadmap-initiative-count').textContent = plan.initiatives.length;
    $('#roadmap-skills').innerHTML = plan.skills.map((skill) => `<div class="roadmap-entity"><label class="roadmap-field">Nazwa kompetencji<input class="text-input" maxlength="100" required data-entity="${skill.id}" data-field="name" value="${escape(skill.name)}"></label>${removeButton('remove-skill', skill)}</div>`).join('') || '<p class="roadmap-empty">Dodaj kompetencje, aby przypisać je zespołom.</p>';
    $('#roadmap-teams').innerHTML = plan.teams.map((team) => `<div class="roadmap-team"><div class="roadmap-entity"><label class="roadmap-field">Nazwa zespołu<input class="text-input" maxlength="100" required data-entity="${team.id}" data-field="name" value="${escape(team.name)}"></label>${removeButton('remove-team', team)}</div><fieldset class="roadmap-checks"><legend>Kompetencje zespołu ${escape(team.name)}</legend>${plan.skills.map((skill) => `<label><input type="checkbox" data-action="team-skill" data-team="${team.id}" data-skill="${skill.id}" ${team.skillIds.includes(skill.id) ? 'checked' : ''}>${escape(skill.name)}</label>`).join('') || '<p class="roadmap-empty">Najpierw dodaj kompetencję.</p>'}</fieldset></div>`).join('') || '<p class="roadmap-empty">Dodaj zespoły ręcznie.</p>';
    renderCapacity();
    $('#roadmap-initiatives').innerHTML = plan.initiatives.map((initiative, index) => renderInitiative(initiative, index)).join('') || '<p class="roadmap-empty">Dodaj co najmniej dwie inicjatywy.</p>';
    renderResults();
  }

  function renderCapacity() {
    const months = calendarMonths(plan.startMonth);
    const rows = plan.teams.flatMap((team) => team.skillIds.map((skillId) => {
      const skill = plan.skills.find((entry) => entry.id === skillId);
      return `<tr><th scope="row">${escape(team.name)} · ${escape(skill.name)}</th>${months.map((m) => `<td><input class="text-input capacity-input" type="number" min="0" max="100000" step="0.01" required aria-label="${escape(team.name)} ${escape(skill.name)}, ${m}, osobodni" data-action="capacity" data-team="${team.id}" data-skill="${skillId}" data-month="${m}" value="${team.capacity[skillId]?.[m] ?? 0}"></td>`).join('')}</tr>`;
    }));
    $('#roadmap-capacity').innerHTML = rows.length ? `<table class="capacity-table"><caption class="sr-only">Capacity zespołów i kompetencji w osobodniach przez 12 miesięcy</caption><thead><tr><th scope="col">ZESPÓŁ · KOMPETENCJA</th>${months.map((m) => `<th scope="col">${new Intl.DateTimeFormat('pl-PL', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`))}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p class="roadmap-empty">Zaznacz kompetencje zespołów, aby uzupełnić kalendarz.</p>';
  }

  function renderInitiative(initiative, index) {
    const teams = plan.teams.filter((team) => initiative.teamIds.includes(team.id));
    const assignments = teams.flatMap((team) => team.skillIds.map((skillId) => ({
      id: `${team.id}/${skillId}`, name: `${team.name} · ${plan.skills.find((skill) => skill.id === skillId).name}`,
    })));
    return `<article class="roadmap-initiative" data-initiative="${initiative.id}">
      <div class="roadmap-entity"><span class="small-tag">Priorytet ${index + 1}</span><label class="roadmap-field">Nazwa inicjatywy<input class="text-input" maxlength="100" required data-entity="${initiative.id}" data-field="name" value="${escape(initiative.name)}"></label>${orderButtons('initiative', initiative, index, plan.initiatives.length)}${removeButton('remove-initiative', initiative)}</div>
      <fieldset class="roadmap-checks"><legend>Zaangażowane zespoły</legend>${plan.teams.map((team) => `<label><input type="checkbox" data-action="initiative-team" data-team="${team.id}" data-initiative="${initiative.id}" ${initiative.teamIds.includes(team.id) ? 'checked' : ''}>${escape(team.name)}</label>`).join('') || '<p class="roadmap-empty">Najpierw dodaj zespół.</p>'}</fieldset>
      <div class="roadmap-dates">${dateInput('Start inicjatywy', initiative.start, initiative, 'start')}${dateInput('Fixed date · opcjonalny termin', initiative.fixedDate, initiative, 'fixedDate')}</div>
      <div class="table-scroll roadmap-items"><table><caption class="sr-only">Elementy inicjatywy ${escape(initiative.name)}</caption><thead><tr><th scope="col">ELEMENT</th><th scope="col">ZESPÓŁ · KOMPETENCJA</th><th scope="col">MIN / MAX · OSOBODNI</th><th scope="col">START / FIXED DATE</th><th scope="col">PRIORYTET / USUŃ</th></tr></thead><tbody>${initiative.items.map((item, itemIndex) => `<tr><td><input class="text-input" maxlength="100" required aria-label="Nazwa elementu" data-entity="${item.id}" data-field="name" value="${escape(item.name)}"></td><td><select class="text-input" aria-label="Zespół i kompetencja dla ${escape(item.name)}" data-entity="${item.id}" data-field="assignment">${options(assignments, `${item.teamId}/${item.skillId}`)}</select></td><td><div class="roadmap-estimates"><label>Min<input class="text-input" type="number" min="0.01" max="100000" step="0.01" required data-entity="${item.id}" data-field="min" value="${item.min}"></label><label>Max<input class="text-input" type="number" min="0.01" max="100000" step="0.01" required data-entity="${item.id}" data-field="max" value="${item.max}"></label></div></td><td>${dateInput('Start · opcjonalny', item.start, item, 'start')}${dateInput('Fixed date · opcjonalny', item.fixedDate, item, 'fixedDate')}</td><td>${orderButtons('item', item, itemIndex, initiative.items.length)}${removeButton('remove-item', item)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty-row">Brak elementów. Dodaj pracę dla zaangażowanych zespołów.</td></tr>'}</tbody></table></div>
      <form class="roadmap-item-form" data-initiative="${initiative.id}"><label class="roadmap-field">Nowy element<input class="text-input" name="name" maxlength="100" placeholder="np. API płatności" required></label><label class="roadmap-field">Zespół · kompetencja<select class="text-input" name="assignment" required><option value="">Wybierz pulę capacity</option>${options(assignments)}</select></label><label class="roadmap-field">Min · osobodni<input class="text-input" name="min" type="number" min="0.01" max="100000" step="0.01" required></label><label class="roadmap-field">Max · osobodni<input class="text-input" name="max" type="number" min="0.01" max="100000" step="0.01" required></label><label class="roadmap-field">Start · opcjonalny<input class="text-input" name="start" type="date" min="1900-01-01" max="9999-12-31"></label><label class="roadmap-field">Fixed date · opcjonalny<input class="text-input" name="fixedDate" type="date" min="1900-01-01" max="9999-12-31"></label><button class="button primary" ${assignments.length ? '' : 'disabled'}>Dodaj element</button></form></article>`;
  }

  function renderResults() {
    const host = $('#roadmap-results');
    if (!result) {
      host.innerHTML = '<p class="roadmap-empty">Skonfiguruj plan i oblicz prognozę. Każda zmiana unieważnia poprzedni wynik.</p>';
      return;
    }
    const start = Date.parse(`${result.start}T00:00:00Z`);
    const horizon = Date.parse(`${result.end}T00:00:00Z`) + 86400000;
    const position = (day) => Math.max(0, Math.min(100, 100 * (Date.parse(`${day}T00:00:00Z`) - start) / (horizon - start)));
    const row = (entry, initiative = false) => {
      const forecast = result.results.get(entry.id);
      const left = position(forecast.start || result.start);
      const right = forecast.p85 ? position(forecast.p85) + 100 * 86400000 / (horizon - start) : 100;
      const risk = !forecast.p85 || (forecast.deadlineRate !== null && forecast.deadlineRate < .85);
      const detail = initiative ? 'Wszystkie elementy' : `${plan.teams.find((team) => team.id === entry.teamId).name} · ${plan.skills.find((skill) => skill.id === entry.skillId).name}`;
      const deadline = entry.fixedDate ? `<span class="${forecast.deadlineRate < .85 ? 'roadmap-risk' : ''}">Fixed: ${dateLabel(entry.fixedDate)} · szansa ${percent(forecast.deadlineRate)}${forecast.deadlineRate < .85 ? ' · ryzyko opóźnienia' : ''}</span>` : '';
      const marker = entry.fixedDate && entry.fixedDate >= result.start && entry.fixedDate <= result.end ? `<span class="gantt-deadline" style="left:${position(entry.fixedDate)}%" title="Fixed date: ${entry.fixedDate}" aria-hidden="true"></span>` : '';
      const grid = result.months.map((m) => `<span class="gantt-grid" style="left:${position(`${m}-01`)}%" aria-hidden="true"></span>`).join('');
      return `<div class="gantt-row ${initiative ? 'gantt-initiative' : ''}"><div class="gantt-label"><strong>${escape(entry.name)}</strong><small>${escape(detail)}</small></div><div class="gantt-track" aria-label="${escape(entry.name)}: start P50 ${dateLabel(forecast.start)}, koniec P85 ${dateLabel(forecast.p85)}">${grid}<span class="gantt-bar ${risk ? 'gantt-risk' : ''} ${forecast.p85 ? '' : 'gantt-overflow'}" style="left:${left}%;width:${Math.max(.3, right - left)}%">${forecast.p85 ? 'P85' : 'Poza horyzontem →'}</span>${marker}</div><div class="gantt-detail"><strong class="${risk ? 'roadmap-risk' : ''}">P85: ${dateLabel(forecast.p85)}</strong><span>P50: ${dateLabel(forecast.p50)} · ukończenie w roku: ${percent(forecast.completionRate)}</span>${deadline}</div></div>`;
    };
    host.innerHTML = `<p class="roadmap-empty">${result.trials.toLocaleString('pl-PL')} symulacji · ${dateLabel(result.start)}–${dateLabel(result.end)}. Pasek: start P50 → koniec P85, przerywana linia: fixed date. Dokładne wyniki obok każdego wiersza.</p><div class="gantt-scroll"><div class="gantt"><div class="gantt-row gantt-header"><div>INICJATYWA / ELEMENT</div><div class="gantt-months">${result.months.map((m, index) => {
      const end = index === result.months.length - 1 ? 100 : position(`${result.months[index + 1]}-01`);
      return `<span style="width:${end - position(`${m}-01`)}%">${m}</span>`;
    }).join('')}</div><div>PROGNOZA / TERMIN</div></div>${plan.initiatives.map((initiative) => row(initiative, true) + initiative.items.map((item) => row(item)).join('')).join('')}</div></div>`;
  }

  const findEntity = (next, entityId) => [...next.skills, ...next.teams, ...next.initiatives, ...next.initiatives.flatMap((initiative) => initiative.items)].find((entry) => entry.id === entityId);
  const removeItems = (next, predicate) => {
    for (const initiative of next.initiatives) initiative.items = initiative.items.filter((item) => !predicate(item));
  };
  const confirmRemoval = () => window.confirm('Usunięcie odłączy przypisania i usunie powiązane elementy oraz capacity, jeśli dotyczy. Kontynuować?');

  for (const kind of ['skill', 'team', 'initiative']) {
    $(`#${kind}-form`).addEventListener('submit', (event) => {
      event.preventDefault();
      const input = $(`#${kind}-name`);
      if (change((next) => {
        const entry = { id: id(), name: input.value.trim() };
        if (kind === 'skill') next.skills.push(entry);
        if (kind === 'team') next.teams.push({ ...entry, skillIds: [], capacity: {} });
        if (kind === 'initiative') next.initiatives.push({ ...entry, teamIds: [], start: `${next.startMonth}-01`, fixedDate: '', items: [] });
      })) input.value = '';
    });
  }

  $('#roadmap-initiatives').addEventListener('submit', (event) => {
    const form = event.target.closest('.roadmap-item-form');
    if (!form) return;
    event.preventDefault();
    const fields = new FormData(form);
    const [teamId, skillId] = fields.get('assignment').split('/');
    change((next) => next.initiatives.find((initiative) => initiative.id === form.dataset.initiative).items.push({
      id: id(), name: fields.get('name').trim(), teamId, skillId,
      min: Number(fields.get('min')), max: Number(fields.get('max')),
      start: fields.get('start'), fixedDate: fields.get('fixedDate'),
    }));
  });

  $('#roadmap-panel').addEventListener('change', (event) => {
    const input = event.target;
    if (!input.matches('input, select') || input.type === 'file') return;
    if (!input.dataset.action && !input.dataset.field && input.id !== 'roadmap-month') return;
    if (!input.checkValidity()) {
      input.reportValidity();
      render();
      error('Podaj poprawną wartość pola. Poprzedni plan nie został zmieniony.');
      return;
    }
    const data = input.dataset;
    if (input.type === 'checkbox' && !input.checked && !confirmRemoval()) { input.checked = true; return; }
    change((next) => {
      if (input.id === 'roadmap-month') next.startMonth = input.value;
      else if (data.action === 'capacity') {
        const team = next.teams.find((entry) => entry.id === data.team);
        team.capacity[data.skill] ??= {};
        team.capacity[data.skill][data.month] = Number(input.value);
      } else if (data.action === 'team-skill') {
        const team = next.teams.find((entry) => entry.id === data.team);
        if (input.checked) team.skillIds.push(data.skill);
        else {
          team.skillIds = team.skillIds.filter((skillId) => skillId !== data.skill);
          delete team.capacity[data.skill];
          removeItems(next, (item) => item.teamId === team.id && item.skillId === data.skill);
        }
      } else if (data.action === 'initiative-team') {
        const initiative = next.initiatives.find((entry) => entry.id === data.initiative);
        if (input.checked) initiative.teamIds.push(data.team);
        else {
          initiative.teamIds = initiative.teamIds.filter((teamId) => teamId !== data.team);
          initiative.items = initiative.items.filter((item) => item.teamId !== data.team);
        }
      } else if (data.field) {
        const entity = findEntity(next, data.entity);
        if (data.field === 'assignment') [entity.teamId, entity.skillId] = input.value.split('/');
        else entity[data.field] = ['min', 'max'].includes(data.field) ? Number(input.value) : input.value.trim();
      }
    });
  });

  $('#roadmap-panel').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, id: entryId, direction } = button.dataset;
    if (action.startsWith('remove-') && !confirmRemoval()) return;
    change((next) => {
      if (action === 'remove-skill') {
        next.skills = next.skills.filter((entry) => entry.id !== entryId);
        for (const team of next.teams) {
          team.skillIds = team.skillIds.filter((skillId) => skillId !== entryId);
          delete team.capacity[entryId];
        }
        removeItems(next, (item) => item.skillId === entryId);
      } else if (action === 'remove-team') {
        next.teams = next.teams.filter((entry) => entry.id !== entryId);
        for (const initiative of next.initiatives) initiative.teamIds = initiative.teamIds.filter((teamId) => teamId !== entryId);
        removeItems(next, (item) => item.teamId === entryId);
      } else if (action === 'remove-initiative') next.initiatives = next.initiatives.filter((entry) => entry.id !== entryId);
      else if (action === 'remove-item') removeItems(next, (item) => item.id === entryId);
      else if (action.startsWith('move-')) {
        const list = action === 'move-initiative' ? next.initiatives : next.initiatives.find((initiative) => initiative.items.some((item) => item.id === entryId)).items;
        const index = list.findIndex((entry) => entry.id === entryId);
        const target = index + Number(direction);
        if (target < 0 || target >= list.length) throw new Error('Nieprawidłowa zmiana priorytetu.');
        [list[index], list[target]] = [list[target], list[index]];
      }
    });
  });

  $('#roadmap-run').addEventListener('click', () => {
    try {
      result = forecastRoadmap(plan);
      if (!recovery && !unsaved) $('#roadmap-error').hidden = true;
      renderResults();
      $('#roadmap-status').textContent = `Obliczono 2 000 symulacji. Wyniki P85 są dostępne na wykresie i w opisach wierszy.${recovery || unsaved ? ' Plan nie jest zapisany — wykonaj eksport.' : ''}`;
    } catch (cause) {
      result = null;
      renderResults();
      error(`Nie obliczono prognozy: ${cause.message}`);
    }
  });
  $('#roadmap-export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `flowlens-roadmap-${plan.startMonth}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#roadmap-import').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('Plik przekracza limit 5 MB.');
      const imported = JSON.parse(await file.text());
      validatePlan(imported);
      if (!window.confirm('Zastąpić cały lokalny plan importowaną kopią?')) return;
      plan = imported;
      recovery = false;
      result = null;
      $('#roadmap-error').hidden = true;
      const saved = persist();
      render();
      $('#roadmap-status').textContent = saved ? 'Plan zaimportowany i zapisany lokalnie.' : 'Plan zaimportowany tylko do tej karty. Wykonaj eksport.';
    } catch (cause) { error(`Nie zaimportowano planu: ${cause.message}`); }
    finally { event.target.value = ''; }
  });
  render();
}
