'use strict';
const $ = id => document.getElementById(id);
const observer = document.body.dataset.role === 'observer';
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let config, currentReport, requestNumber = 0, pendingSubmission = null, pendingEnrollment = null;
let csrfToken = '', signedInUser;
const loginPath = observer ? '/company/login' : '/parent/login';
function signInAgain() { $('report').replaceChildren(); $('student').replaceChildren(); $('intro').textContent=''; location.replace(loginPath); }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
function status(message, error = false) { $('status').textContent = message; $('status').className = error ? 'error' : ''; }

function showLiveToast(message) {
  let toast = $('live-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'live-toast';
    toast.className = 'live-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span class="live-dot pulse"></span> ${escapeHTML(message)}`;
  toast.classList.add('visible');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('visible'), 4000);
}

async function handleSyncEvent(type, data) {
  if (type === 'observation_saved') {
    const activeSid = $('student')?.value;
    if (activeSid && (data.student_id === activeSid || data.studentId === activeSid)) {
      showLiveToast(`Live Sync: New observation recorded for ${currentReport?.student?.name || 'learner'}`);
      await loadReport(true);
    }
  } else if (type === 'student_enrolled') {
    showLiveToast(`Live Sync: New student ${data.name || ''} enrolled`);
    await loadRoster($('student')?.value);
  } else if (type === 'assignment_updated') {
    await loadRoster($('student')?.value);
  }
}

function initLiveSync() {
  if ('BroadcastChannel' in window) {
    const liveChannel = new BroadcastChannel('edutainal_live_sync');
    liveChannel.onmessage = (e) => {
      const msg = e.data || {};
      handleSyncEvent(msg.type, msg);
    };
  }
  try {
    const sse = new EventSource('/api/v1/events');
    sse.addEventListener('observation_saved', (e) => {
      try {
        const data = JSON.parse(e.data);
        handleSyncEvent('observation_saved', data);
      } catch(err) {}
    });
    sse.addEventListener('student_enrolled', (e) => {
      try {
        const data = JSON.parse(e.data);
        handleSyncEvent('student_enrolled', data);
      } catch(err) {}
    });
    sse.addEventListener('assignment_updated', () => {
      handleSyncEvent('assignment_updated', {});
    });
  } catch(err) {}
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
    'X-Portal': observer ? 'company' : 'parent',
    ...(options.headers || {})
  };
  const response = await fetch('/api/v1' + path, {...options, headers, signal: AbortSignal.timeout(15000)});
  if (response.status === 401) { signInAgain(); throw new Error('Please sign in again.'); }
  const data = await response.json();
  if (!response.ok) throw new Error(Array.isArray(data.detail) ? data.detail.map(e => `${e.loc.slice(1).join('.')}: ${e.msg}`).join('; ') : data.detail || 'Request failed');
  return data;
}

function render(report) {
  currentReport = report;
  $('intro').textContent = `${report.student.name} · Age ${report.student.age} · ${report.student.world_tier.toUpperCase()} programme`;
  document.querySelectorAll('nav a').forEach(link => {
    const url = new URL(link.href);
    url.searchParams.set('student', report.student.id);
    link.href = url.pathname + url.search + url.hash;
  });
  Dashboard.show(report);
}

async function loadReport(silent = false) {
  const n = ++requestNumber, sid = $('student').value;
  if (!silent) {
    $('report').innerHTML = '';
    currentReport = null;
  }
  if (!sid) { $('intro').textContent = ''; $('assessment').hidden = true; $('report').innerHTML = '<div class="empty">No children are assigned to this account yet. Contact the Edutainal team, or enroll and assign a student from the company portal.</div>'; return; }
  if (!silent) status('Loading saved observations…');
  try {
    const report = await api(`/students/${encodeURIComponent(sid)}/analytics`);
    if (n !== requestNumber) return;
    render(report); $('assessment').hidden = !observer; status('Up to date · ' + new Date().toLocaleTimeString());
    const dot = document.querySelector('.live-dot');
    if (dot) {
      dot.classList.add('pulse');
      setTimeout(() => dot.classList.remove('pulse'), 2500);
    }
  } catch(e) { if(n === requestNumber) { $('assessment').hidden = true; status(e.message, true); } }
}

async function loadRoster(selected) {
  const students = await api('/students');
  $('student').innerHTML = students.map(s => `<option value="${escapeHTML(s.id)}">${escapeHTML(s.name)}</option>`).join('');
  const requested = selected || new URLSearchParams(location.search).get('student');
  if (requested && students.some(s => s.id === requested)) $('student').value = requested;
  await loadReport();
}

function observerForms() {
  $('enrollment').hidden = false;
  $('enrollment').innerHTML = `<details class="panel"><summary>+ Enroll a student</summary><form id="enroll-form"><div class="form-grid"><label>Full name<input name="name" required maxlength="200"></label><label>Age<input name="age" type="number" min="4" max="25" required></label><label>Programme<select name="world_tier">${['genesis','hyper','imperium','meta'].map(t=>`<option>${t}</option>`).join('')}</select></label><label>Target sessions<input name="target_sessions" type="number" min="1" max="1000" value="50" required></label></div><div class="form-actions"><button>Enroll student</button></div></form></details>`;
  $('assessment').innerHTML = `<section class="panel"><p class="eyebrow">OBSERVER WORKSPACE</p><h2>Record learning evidence</h2><p>Record the session, assess observed skills, and optionally add test marks below. For a test-only session, leave all skills unobserved. The selected student receives this record.</p><form id="observation-form"><div class="form-grid">
  <label>Session date<input name="observed_on" type="date" value="${today()}" max="${today()}" required></label><label>Hours attended<input name="session_hours" type="number" min="0.25" max="12" step="0.25" value="3" required></label>
  <label>Learning zone<select name="zone_name">${config.zones.map(z=>`<option>${escapeHTML(z)}</option>`).join('')}</select></label><label>Project title<input name="project_title" maxlength="200" required></label><label class="wide">Activity / learning intention<input name="signature_experience" maxlength="200" required></label></div>
  <h3>Observed skills</h3><p class="muted">0 = not yet demonstrated · 25 = extensive support · 50 = some support · 75 = independent · 100 = applies and explains in a new context.</p><div class="rubric">${config.pillars.map((p,i)=>`<label>${p}<select name="skill_${i}"><option value="">Not observed</option>${[0,25,50,75,100].map(v=>`<option value="${v}">${v}</option>`).join('')}</select></label>`).join('')}</div>
  <div class="form-grid"><label class="wide">Evidence: what did the student do?<textarea name="mentor_notes" minlength="10" maxlength="4000" required></textarea></label><label>Breakthrough (optional)<textarea name="breakthrough_note" maxlength="4000"></textarea></label><label>Support needed (optional)<textarea name="friction_note" maxlength="4000"></textarea></label><label class="wide">Next activity or follow-up<textarea name="action_plan" minlength="5" maxlength="2000" required></textarea></label></div>
  <details><summary>Test result (optional)</summary><p>Add the marked result of a test taken during this session. Use the same test name for repeat assessments.</p><div class="form-grid"><label class="wide">Test name<input name="test_name" maxlength="200" placeholder="e.g. Robotics fundamentals"></label><label>Marks achieved<input name="test_score" type="number" min="0" step="any"></label><label>Maximum marks<input name="test_max" type="number" min="0.01" step="any"></label></div></details><details><summary>Behavioral observations & SDG tags (optional)</summary><p>Behavior: 1 = substantial support, 2 = prompted, 3 = independent, 4 = supports others.</p><div class="rubric">${['curiosity','autonomy','collaboration'].map(b=>`<label>${b}<select name="${b}"><option value="">Not observed</option>${[1,2,3,4].map(v=>`<option>${v}</option>`).join('')}</select></label>`).join('')}</div><label>SDG numbers, comma separated<input name="sdgs" placeholder="4, 9" pattern="[0-9, ]*"></label></details><div class="form-actions"><button id="save-observation">Save observation / test</button><button type="reset" class="secondary">Clear form</button></div><p id="save-status" role="status"></p></form></section>`;
  $('enroll-form').addEventListener('submit', async e => {
    e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
    const values = Object.fromEntries(new FormData(e.target)); values.age = Number(values.age); values.target_sessions = Number(values.target_sessions);
    const fingerprint = JSON.stringify(values);
    if (!pendingEnrollment || pendingEnrollment.fingerprint !== fingerprint) pendingEnrollment = {fingerprint,id:crypto.randomUUID()};
    values.id = pendingEnrollment.id;
    try {
      const s = await api('/students',{method:'POST',body:JSON.stringify(values)});
      pendingEnrollment=null; e.target.reset();
      if ('BroadcastChannel' in window) {
        const liveChannel = new BroadcastChannel('edutainal_live_sync');
        liveChannel.postMessage({type: 'student_enrolled', student_id: s.id, name: s.name});
        liveChannel.close();
      }
      await loadRoster(s.id); await ParentAccounts.load(); status('Student enrolled. No scores assigned until observed.');
    } catch(e) { status(e.message + ' If this follows a connection failure, refresh the roster before enrolling again.',true); } finally {button.disabled=false;}
  });
  $('observation-form').addEventListener('reset', () => { pendingSubmission = null; $('save-status').textContent = ''; });
  $('observation-form').addEventListener('submit', async e => {
    e.preventDefault(); const form = e.target, values = Object.fromEntries(new FormData(form));
    const payload = {student_id:$('student').value, observed_on:values.observed_on, session_hours:Number(values.session_hours), zone_name:values.zone_name, project_title:values.project_title, signature_experience:values.signature_experience, mentor_notes:values.mentor_notes, action_plan:values.action_plan, breakthrough_note:values.breakthrough_note, friction_note:values.friction_note, steamre_rubric:config.pillars.map((_,i)=>values['skill_'+i] === '' ? null : Number(values['skill_'+i])), behavioral_scores:Object.fromEntries(['curiosity','autonomy','collaboration'].filter(b=>values[b]).map(b=>[b,Number(values[b])])), sdgs:values.sdgs.trim() ? values.sdgs.split(',').map(s=>Number(s.trim())) : []};
    if (values.test_name || values.test_score || values.test_max) {
      if (!values.test_name.trim() || values.test_score === '' || values.test_max === '') { $('save-status').textContent = 'Enter the test name, marks achieved, and maximum marks.'; return; }
      payload.test_result = {name:values.test_name, score:Number(values.test_score), max_score:Number(values.test_max)};
      if (payload.test_result.max_score <= 0 || payload.test_result.score > payload.test_result.max_score) { $('save-status').textContent = 'Marks must be between zero and the maximum score.'; return; }
    }
    const fingerprint = JSON.stringify(payload);
    if (!pendingSubmission || pendingSubmission.fingerprint !== fingerprint) pendingSubmission = {fingerprint,id:crypto.randomUUID()};
    payload.id = pendingSubmission.id;
    $('save-observation').disabled = true; $('student').disabled = true;
    $('save-status').textContent = 'Saving…';
    try {
      await api('/sessions', {method:'POST',body:JSON.stringify(payload)});
      form.reset();
      if ('BroadcastChannel' in window) {
        const liveChannel = new BroadcastChannel('edutainal_live_sync');
        liveChannel.postMessage({
          type: 'observation_saved',
          student_id: payload.student_id,
          zone_name: payload.zone_name,
          project_title: payload.project_title,
          observer_name: signedInUser?.name || 'Observer'
        });
        liveChannel.close();
      }
      await loadReport();
      $('save-status').textContent = 'Observation saved and synced in real-time across open portals.';
    } catch(e) { $('save-status').textContent = 'Save not confirmed: ' + e.message + '. Your form is retained. Retry with unchanged values to avoid duplicates.'; }
    finally { $('save-observation').disabled = false; $('student').disabled = false; }
  });
}

$('logout').onclick = async () => {
  try {
    await api('/auth/logout',{method:'POST',body:'{}'});
    if ('BroadcastChannel' in window) {
      const channel=new BroadcastChannel('portal-auth');
      channel.postMessage({portal: observer ? 'company' : 'parent'});
      channel.close();
    }
    signInAgain();
  } catch(error) { status(error.message,true); }
};
$('account-button').onclick = () => $('account-dialog').showModal();
$('close-account').onclick = () => { $('account-dialog').close(); $('password-form').reset(); $('password-status').textContent=''; };
$('password-form').onsubmit = async event => {
  event.preventDefault(); const form=event.target, button=form.querySelector('button[type=submit]');
  if (form.new_password.value !== form.confirm_password.value) { $('password-status').textContent='New passwords must match.'; return; }
  button.disabled=true;
  try {
    await api('/auth/password',{method:'POST',body:JSON.stringify({current_password:form.current_password.value,new_password:form.new_password.value})});
    form.reset();
    if ('BroadcastChannel' in window) {
      const channel=new BroadcastChannel('portal-auth');
      channel.postMessage({portal: observer ? 'company' : 'parent'});
      channel.close();
    }
    signInAgain();
  } catch(error) { $('password-status').textContent=error.message; } finally { button.disabled=false; }
};
if ('BroadcastChannel' in window) {
  const channel=new BroadcastChannel('portal-auth');
  channel.onmessage=(e)=>{
    const p = e.data && e.data.portal;
    if (!p || p === (observer ? 'company' : 'parent')) {
      $('report').replaceChildren();
      location.reload();
    }
  };
}
window.addEventListener('pageshow',event=>{if(event.persisted) location.reload();});
$('student').onchange = () => { if(observer && $('observation-form')) $('observation-form').reset(); loadReport(); };
$('refresh').onclick = () => loadRoster($('student').value).catch(e=>status(e.message,true));
$('print').onclick = () => window.print();

async function init() {
  $('eyebrow').textContent = observer ? 'OBSERVE • UNDERSTAND • SUPPORT' : 'YOUR CHILD’S LEARNING JOURNEY';
  $('heading').textContent = observer ? 'Company workspace' : 'Student analytics';
  try {
    signedInUser = await api('/auth/me');
    const expected = observer ? 'observer' : 'parent';
    if (signedInUser.role !== expected) { location.replace(signedInUser.role === 'observer' ? '/company' : '/parent'); return; }
    csrfToken = signedInUser.csrf_token;
    $('signed-in-name').textContent = signedInUser.name;
    config = await api('/config');
    $('mode-note').textContent = observer ? 'Company portal - manage student observations and parent access.' : 'Private parent portal - only your assigned children are shown.';
    if (observer) observerForms();
    document.body.classList.remove('session-loading');
    await loadRoster();
    if (observer) await ParentAccounts.load();
    initLiveSync();
  } catch(error) { status('Unable to load the portal: '+error.message,true); }
}
init();