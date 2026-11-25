const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = name => fs.readFileSync(path.join(__dirname, '..', 'frontend', name), 'utf8');
function harness(role) {
  const elements = new Map();
  const calls = [];
  const document = {
    body: {dataset: {role}, classList: {remove() {}}},
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        innerHTML: '', textContent: '', value: '', hidden: false,
        replaceChildren() { this.innerHTML = ''; },
        classList: {add() {}, remove() {}},
      });
      return elements.get(id);
    },
    querySelectorAll: () => [],
    querySelector: () => null,
  };
  const context = vm.createContext({
    document, window: {addEventListener() {}},
    location: {search: '', replace() {}}, URLSearchParams, AbortSignal,
    // Hold initial authentication until the test explicitly exercises a function.
    fetch: () => new Promise(() => {}),
    Dashboard: {show: report => calls.push(['parent', report])},
    CompanyDashboard: {show: report => calls.push(['company', report])},
  });
  return {context, elements, calls, document};
}

const report = {
  student: {id: 'learner', name: 'Learner <script>', age: 10, world_tier: 'hyper'},
  total_sessions: 1, total_hours: 1.5,
  skills: [{name: 'Science', observations: 1}, {name: 'Technology', observations: 0}],
  logs: [{id: 'record-1', observed_on: '2026-11-20', project_title: '<img src=x onerror=alert(1)>',
    signature_experience: 'Build a circuit', mentor_notes: 'Observed evidence',
    action_plan: 'Try another circuit', zone_name: 'Robotics', session_hours: 1.5,
    steamre_rubric: [0, null], behavioral_scores: {}, sdgs: [],
    test_result: {name: 'Circuit basics', score: 0, max_score: 10}}],
};

for (const [role, renderer] of [['parent', 'parent'], ['observer', 'company']]) {
  test(`${role} dispatches only to its own report renderer`, () => {
    const app = harness(role);
    vm.runInContext(source('portal.js'), app.context);
    app.context.report = report;
    vm.runInContext('render(report)', app.context);
    assert.equal(app.calls.length, 1);
    assert.equal(app.calls[0][0], renderer);
    assert.equal(app.document.getElementById('breadcrumb-student').textContent, report.student.name);
  });
}

test('company records escape content and preserve zero versus unobserved scores', () => {
  const app = harness('observer');
  vm.runInContext(source('company-dashboard.js'), app.context);
  app.context.report = report;
  vm.runInContext('CompanyDashboard.show(report)', app.context);
  const html = app.document.getElementById('report').innerHTML;
  assert.match(html, /Company workspace/);
  assert.doesNotMatch(html, /Parent Console|Welcome back|data-tab=/);
  assert.match(html, /0 \/ 100/);
  assert.match(html, /Not observed/);
  assert.match(html, /Circuit basics: 0 \/ 10/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img|<script>/);
});

test('each renderer refuses the opposite portal', () => {
  for (const [role, file, name] of [['parent', 'company-dashboard.js', 'CompanyDashboard'], ['observer', 'dashboard.js', 'Dashboard']]) {
    const app = harness(role);
    vm.runInContext(source(file), app.context);
    vm.runInContext(`${name}.show(null)`, app.context);
    assert.equal(app.document.getElementById('report').innerHTML, '');
  }
});

test('failed silent refresh clears previously displayed child evidence', async () => {
  const app = harness('parent');
  vm.runInContext(source('portal.js'), app.context);
  app.document.getElementById('report').innerHTML = 'Previous child evidence';
  app.document.getElementById('student').value = 'revoked-child';
  await vm.runInContext("api = async () => { throw new Error('Student is not assigned'); }; loadReport(true)", app.context);
  assert.equal(app.document.getElementById('report').innerHTML, '');
  assert.equal(app.document.getElementById('assessment').hidden, true);
  assert.match(app.document.getElementById('status').textContent, /not assigned/);
});

test('late response for the previous child cannot overwrite the selected child', async () => {
  const app = harness('parent');
  vm.runInContext(source('portal.js'), app.context);
  app.context.replies = [];
  vm.runInContext('api = () => new Promise(resolve => replies.push(resolve))', app.context);
  app.document.getElementById('student').value = 'first';
  const first = vm.runInContext('loadReport()', app.context);
  app.document.getElementById('student').value = 'second';
  const second = vm.runInContext('loadReport()', app.context);
  const secondReport = {...report, student: {...report.student, id: 'second'}};
  app.context.replies[1](secondReport);
  await second;
  app.context.replies[0](report);
  await first;
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0][1].student.id, 'second');
});
