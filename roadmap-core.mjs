import { validDate } from './core.mjs';

export const ROADMAP_STORAGE_KEY = 'flowlens-roadmap-v1';
const DAY = 86400000;
const time = (date) => Date.parse(`${date}T00:00:00Z`);
export const isoDay = (value) => new Date(value).toISOString().slice(0, 10);

export function calendarMonths(startMonth) {
  if (typeof startMonth !== 'string' || !validDate(`${startMonth}-01`) || startMonth > '9998-12') {
    throw new Error('Podaj poprawny początek kalendarza od 1900-01 do 9998-12.');
  }
  const start = new Date(time(`${startMonth}-01`));
  return Array.from({ length: 12 }, (_, index) =>
    isoDay(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1)).slice(0, 7));
}

export function emptyPlan(startMonth) {
  calendarMonths(startMonth);
  return { version: 1, startMonth, skills: [], teams: [], initiatives: [] };
}

export function validatePlan(plan, forecasting = false) {
  if (!plan || plan.version !== 1) throw new Error('Nieobsługiwany format planu roadmapy.');
  const months = calendarMonths(plan.startMonth);
  const ids = new Set();
  const reservedIds = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);
  const entities = (list, limit, label) => {
    if (!Array.isArray(list) || list.length > limit) throw new Error(`${label}: limit ${limit}.`);
    for (const entry of list) {
      if (!entry || typeof entry.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(entry.id)
        || reservedIds.has(entry.id) || ids.has(entry.id) || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 100) {
        throw new Error(`${label}: wymagane są unikalne ID i niepusta nazwa (do 100 znaków).`);
      }
      ids.add(entry.id);
    }
  };
  entities(plan.skills, 30, 'Kompetencje');
  entities(plan.teams, 50, 'Zespoły');
  entities(plan.initiatives, 50, 'Inicjatywy');
  const skills = new Set(plan.skills.map((skill) => skill.id));
  const references = (list, allowed, label) => {
    if (!Array.isArray(list) || new Set(list).size !== list.length || list.some((id) => !allowed.has(id))) {
      throw new Error(`${label}: nieprawidłowe przypisania.`);
    }
  };
  const date = (value, label, optional = false) => {
    if (!(optional && value === '') && !validDate(value)) throw new Error(`${label}: podaj poprawną datę.`);
  };
  for (const team of plan.teams) {
    references(team.skillIds, skills, team.name);
    if (!team.capacity || typeof team.capacity !== 'object' || Array.isArray(team.capacity)) throw new Error(`${team.name}: brak kalendarza capacity.`);
    for (const [skillId, values] of Object.entries(team.capacity)) {
      if (!team.skillIds.includes(skillId) || !values || typeof values !== 'object' || Array.isArray(values)) {
        throw new Error(`${team.name}: nieprawidłowa kompetencja capacity.`);
      }
      for (const [month, value] of Object.entries(values)) {
        if (!/^\d{4}-\d{2}$/.test(month) || !validDate(`${month}-01`)
          || !Number.isFinite(value) || value < 0 || value > 100000) {
          throw new Error(`${team.name}: capacity musi być liczbą od 0 do 100 000 osobodni.`);
        }
      }
    }
  }
  const teams = new Map(plan.teams.map((team) => [team.id, team]));
  let count = 0;
  for (const initiative of plan.initiatives) {
    references(initiative.teamIds, new Set(teams.keys()), initiative.name);
    date(initiative.start, initiative.name);
    date(initiative.fixedDate, initiative.name, true);
    if (initiative.fixedDate && initiative.fixedDate < initiative.start) throw new Error(`${initiative.name}: fixed date nie może być przed startem.`);
    entities(initiative.items, 100, `Elementy ${initiative.name}`);
    count += initiative.items.length;
    for (const item of initiative.items) {
      const team = teams.get(item.teamId);
      if (!initiative.teamIds.includes(item.teamId) || !team?.skillIds.includes(item.skillId)) {
        throw new Error(`${item.name}: wybierz zaangażowany zespół i jego kompetencję.`);
      }
      if (!Number.isFinite(item.min) || !Number.isFinite(item.max) || item.min <= 0 || item.max < item.min || item.max > 100000) {
        throw new Error(`${item.name}: wymagane 0 < min ≤ max ≤ 100 000 osobodni.`);
      }
      date(item.start, item.name, true);
      date(item.fixedDate, item.name, true);
      if (item.fixedDate && item.fixedDate < (item.start > initiative.start ? item.start : initiative.start)) {
        throw new Error(`${item.name}: fixed date nie może być przed najwcześniejszym startem.`);
      }
    }
    if (forecasting && (!initiative.teamIds.length || !initiative.items.length)) {
      throw new Error(`${initiative.name}: zaznacz zespoły i dodaj co najmniej jeden element.`);
    }
  }
  if (count > 100) throw new Error('Plan może zawierać maksymalnie 100 elementów łącznie.');
  if (forecasting && plan.initiatives.length < 2) throw new Error('Dodaj co najmniej dwie inicjatywy.');
  return { plan, months };
}

function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let x = Math.imul(value ^ value >>> 15, 1 | value);
    x ^= x + Math.imul(x ^ x >>> 7, 61 | x);
    return ((x ^ x >>> 14) >>> 0) / 4294967296;
  };
}

export function forecastRoadmap(plan, { trials = 2000, seed = 852026 } = {}) {
  const { months } = validatePlan(plan, true);
  if (!Number.isInteger(trials) || trials < 1 || trials > 10000 || !Number.isSafeInteger(seed)) {
    throw new Error('Nieprawidłowa liczba symulacji lub ziarno losowania.');
  }
  const startTime = time(`${months[0]}-01`);
  const last = new Date(time(`${months.at(-1)}-01`));
  const endTime = Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1);
  const dates = Array.from({ length: (endTime - startTime) / DAY }, (_, index) => isoDay(startTime + index * DAY));
  const workingDays = new Map(months.map((month) => [month, dates.filter((day) => {
    const weekday = new Date(time(day)).getUTCDay();
    return day.startsWith(month) && weekday !== 0 && weekday !== 6;
  }).length]));
  const resources = new Map();
  for (const team of plan.teams) for (const skillId of team.skillIds) {
    resources.set(`${team.id}/${skillId}`, Float64Array.from(dates, (day) => {
      const weekday = new Date(time(day)).getUTCDay();
      const month = day.slice(0, 7);
      return weekday === 0 || weekday === 6 ? 0 : (team.capacity[skillId]?.[month] ?? 0) / workingDays.get(month);
    }));
  }
  const tasks = plan.initiatives.flatMap((initiative) => initiative.items.map((item) => ({
    ...item, initiativeId: initiative.id, release: Math.max(0,
      Math.ceil((time(item.start > initiative.start ? item.start : initiative.start) - startTime) / DAY)),
  })));
  const samples = new Map([...tasks, ...plan.initiatives].map((entry) => [entry.id, { ends: [], starts: [] }]));
  const random = randomGenerator(seed);
  for (let trial = 0; trial < trials; trial++) {
    const remaining = new Map([...resources].map(([key, values]) => [key, values.slice()]));
    const initiativeEnds = new Map(plan.initiatives.map((entry) => [entry.id, -1]));
    const initiativeStarts = new Map(plan.initiatives.map((entry) => [entry.id, Infinity]));
    for (const task of tasks) {
      let effort = task.min + random() * (task.max - task.min);
      const capacity = remaining.get(`${task.teamId}/${task.skillId}`);
      let first = Infinity;
      let end = Infinity;
      for (let day = task.release; day < dates.length; day++) {
        if (capacity[day] <= 0) continue;
        first = Math.min(first, day);
        const used = Math.min(effort, capacity[day]);
        capacity[day] -= used;
        effort -= used;
        if (effort <= 1e-9) { end = day; break; }
      }
      samples.get(task.id).ends.push(end);
      samples.get(task.id).starts.push(first);
      initiativeEnds.set(task.initiativeId, Math.max(initiativeEnds.get(task.initiativeId), end));
      initiativeStarts.set(task.initiativeId, Math.min(initiativeStarts.get(task.initiativeId), first));
    }
    for (const initiative of plan.initiatives) {
      samples.get(initiative.id).ends.push(initiativeEnds.get(initiative.id));
      samples.get(initiative.id).starts.push(initiativeStarts.get(initiative.id));
    }
  }
  const results = new Map([...samples].map(([id, sample]) => {
    const quantile = (values, p) => {
      const value = [...values].sort((a, b) => a - b)[Math.ceil(p * trials) - 1];
      return Number.isFinite(value) ? dates[value] : null;
    };
    const entry = tasks.find((task) => task.id === id) || plan.initiatives.find((initiative) => initiative.id === id);
    return [id, {
      p50: quantile(sample.ends, .5), p85: quantile(sample.ends, .85),
      start: quantile(sample.starts, .5),
      completionRate: sample.ends.filter(Number.isFinite).length / trials,
      deadlineRate: entry.fixedDate ? sample.ends.filter((day) => Number.isFinite(day) && dates[day] <= entry.fixedDate).length / trials : null,
    }];
  }));
  return { months, start: dates[0], end: dates.at(-1), trials, results };
}
