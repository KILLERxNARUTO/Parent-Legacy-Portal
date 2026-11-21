'use strict';
// Pure calculations shared by the visual dashboard and its verification tests.
const PortalAnalytics = (() => {
  const round = n => Math.round((n + Number.EPSILON) * 10) / 10;
  const utcDay = value => Date.parse(value + 'T00:00:00Z');
  const chronological = (a, b) => a.observed_on.localeCompare(b.observed_on) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  function progress(logs, allLogs, names) {
    const numbered = new Map([...allLogs].sort(chronological).map((log, i) => [log.id, i + 1]));
    const classes = [...logs].sort(chronological).map(log => ({...log, classNumber: numbered.get(log.id)}));
    const comparisons = names.map((name, index) => {
      const observed = classes.filter(log => log.steamre_rubric[index] !== null);
      const count = Math.min(3, Math.floor(observed.length / 2));
      if (!count) return {name, index, count:0, earlier:null, recent:null, change:null, observations:observed.length};
      const mean = rows => rows.reduce((sum, log) => sum + log.steamre_rubric[index], 0) / rows.length;
      const earlier = mean(observed.slice(0,count)), recent = mean(observed.slice(-count));
      return {name, index, count, earlier:round(earlier), recent:round(recent), change:round(recent-earlier), observations:observed.length,
        firstClass:observed[0].classNumber, lastClass:observed.at(-1).classNumber};
    });
    const tests = new Map();
    classes.filter(log => log.test_result).forEach(log => {
      const name = log.test_result.name;
      if (!tests.has(name)) tests.set(name, []);
      tests.get(name).push({...log, percentage:round(log.test_result.score / log.test_result.max_score * 100)});
    });
    return {classes, comparisons, tests:[...tests].map(([name, attempts]) => ({name, attempts}))};
  }
  function summarize(source, filters, today) {
    const logs = source.logs.filter(l => (!filters.from || l.observed_on >= filters.from) &&
      (!filters.to || l.observed_on <= filters.to) && (!filters.zone || l.zone_name === filters.zone))
      .sort((a, b) => a.observed_on.localeCompare(b.observed_on) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    const skills = source.skills.map((skill, i) => {
      const samples = logs.filter(l => l.steamre_rubric[i] !== null).map(l => ({
        value: l.steamre_rubric[i], date: l.observed_on,
        weight: 2 ** (-Math.max(0, (utcDay(today) - utcDay(l.observed_on)) / 86400000) / 90)
      }));
      const weight = samples.reduce((s, x) => s + x.weight, 0);
      const score = weight ? round(samples.reduce((s, x) => s + x.value * x.weight, 0) / weight) : null;
      const mean = array => array.reduce((s, x) => s + x.value, 0) / array.length;
      return {name: skill.name, score, observations: samples.length,
        trend: samples.length >= 6 ? round(mean(samples.slice(-3)) - mean(samples.slice(-6, -3))) : null,
        last_observed: samples.at(-1)?.date || null};
    });
    const pathways = source.pathways.filter(p => p.basis.every(name => skills.find(s => s.name === name)?.observations >= 3))
      .map(p => ({...p, alignment: round(p.basis.reduce((sum, name) => sum + skills.find(s => s.name === name).score, 0) / p.basis.length)}))
      .sort((a, b) => b.alignment - a.alignment || a.title.localeCompare(b.title));
    const zones = source.zones.map(z => {
      const records = logs.filter(l => l.zone_name === z.name);
      return {name: z.name, sessions: records.length, hours: round(records.reduce((s, l) => s + l.session_hours, 0))};
    });
    const behavior = ['curiosity', 'autonomy', 'collaboration'].map(name => {
      const values = logs.map(l => l.behavioral_scores[name]).filter(v => v !== undefined);
      return {name, count: values.length, score: values.length ? round(values.reduce((s, v) => s + v, 0) / values.length) : null};
    });
    return {logs, skills, pathways, zones, behavior, sessions: logs.length,
      hours: Math.round(logs.reduce((s, l) => s + l.session_hours, 0) * 100) / 100,
      coverage: skills.filter(s => s.observations >= 3).length,
      observed: skills.filter(s => s.score !== null).length};
  }
  function csv(student, logs, pillars) {
    const cell = value => {
      let text = String(value ?? '');
      if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const rows = [['Student', 'Session ID', 'Date', 'Zone', 'Project', 'Hours', ...pillars, 'Observer', 'Evidence', 'Next step', 'Test name', 'Test score', 'Test maximum'],
      ...logs.map(l => [student.name, l.id, l.observed_on, l.zone_name, l.project_title, l.session_hours,
        ...l.steamre_rubric, l.observer_name, l.mentor_notes, l.action_plan, l.test_result?.name, l.test_result?.score, l.test_result?.max_score])];
    return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
  }
  return {summarize, csv, progress};
})();
if (typeof module !== 'undefined') module.exports = PortalAnalytics;
