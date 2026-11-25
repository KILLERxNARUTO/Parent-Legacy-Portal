'use strict';

// Company records deliberately do not render the parent learning dashboard.
const CompanyDashboard = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const fmt = value => new Intl.NumberFormat('en', {maximumFractionDigits: 1}).format(value);

  function show(report) {
    if (document.body.dataset.role !== 'observer') return;
    const logs = report.logs;
    const skills = report.skills;
    document.getElementById('report').innerHTML = `
      <section class="company-records" aria-labelledby="records-title">
        <div class="company-records-heading">
          <div>
            <p class="company-context">Company workspace · Student records</p>
            <h2 id="records-title">${esc(report.student.name)} — saved evidence</h2>
            <p>Review recorded sessions, rubric ratings and test marks for the selected learner</p>
          </div>
          <a class="company-action" href="#assessment">Record observation</a>
        </div>
        <dl class="company-metrics">
          <div><dt>Recorded sessions</dt><dd>${fmt(report.total_sessions)}</dd></div>
          <div><dt>Learning hours</dt><dd>${fmt(report.total_hours)}</dd></div>
          <div><dt>Skills observed</dt><dd>${skills.filter(skill => skill.observations > 0).length}<small> / ${skills.length}</small></dd></div>
          <div><dt>Marked tests</dt><dd>${logs.filter(log => log.test_result).length}</dd></div>
        </dl>
        ${logs.length ? `
          <div class="company-table-wrap">
            <table class="company-record-table">
              <caption>Saved observations, most recent first</caption>
              <thead><tr><th scope="col">Date</th><th scope="col">Session and evidence</th><th scope="col">Learning zone</th><th scope="col">Hours</th><th scope="col">Recorded by</th></tr></thead>
              <tbody>${logs.map(log => `
                <tr>
                  <td><time datetime="${esc(log.observed_on)}">${esc(log.observed_on)}</time></td>
                  <td><details class="company-evidence">
                    <summary>${esc(log.project_title)}</summary>
                    <div>
                      <p><strong>Learning intention</strong>${esc(log.signature_experience)}</p>
                      <p><strong>Mentor evidence</strong>${esc(log.mentor_notes)}</p>
                      ${log.breakthrough_note ? `<p><strong>Breakthrough</strong>${esc(log.breakthrough_note)}</p>` : ''}
                      ${log.friction_note ? `<p><strong>Support needed</strong>${esc(log.friction_note)}</p>` : ''}
                      <p><strong>Next activity</strong>${esc(log.action_plan)}</p>
                      <dl class="company-rubric">${skills.map((skill, index) => `<div><dt>${esc(skill.name)}</dt><dd>${log.steamre_rubric[index] == null ? 'Not observed' : `${fmt(log.steamre_rubric[index])} / 100`}</dd></div>`).join('')}</dl>
                      ${log.test_result ? `<p><strong>Test result</strong>${esc(log.test_result.name)}: ${fmt(log.test_result.score)} / ${fmt(log.test_result.max_score)}</p>` : ''}
                      ${Object.entries(log.behavioral_scores || {}).map(([name, score]) => `<p><strong>${esc(name)}</strong>${fmt(score)} / 4</p>`).join('')}
                      ${log.sdgs?.length ? `<p><strong>SDG tags</strong>${log.sdgs.map(esc).join(', ')}</p>` : ''}
                      <small>Record ${esc(log.id)}</small>
                    </div>
                  </details></td>
                  <td>${esc(log.zone_name)}</td>
                  <td class="company-number">${fmt(log.session_hours)}</td>
                  <td>${esc(log.observer_name || 'Not recorded')}</td>
                </tr>`).join('')}</tbody>
            </table>
          </div>` : '<p class="company-empty">No observations recorded for this learner. Record a session to begin their evidence history.</p>'}
      </section>`;
  }

  return {show};
})();
