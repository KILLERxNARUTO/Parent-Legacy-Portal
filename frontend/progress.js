'use strict';
// Progress views keep each skill separate and never fill unobserved ratings.
const ProgressView = (() => {
  const palette = ['#168b81','#5276d2','#b083d4','#dc9c3c','#d9718b','#44a7bb','#83a64a','#65738c'];
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = v => new Intl.NumberFormat('en',{maximumFractionDigits:1}).format(v);
  const change = v => `${v > 0 ? '+' : ''}${number(v)} pts`;
  let data, selected = [0,1,3], student, chosenClass = null;
  function lineChart(rows, series, label, interactive = false) {
    const width = Math.max(interactive ? 740 : 420, rows.length * 58), left = 44, right = width - 30, top = 25, bottom = 235;
    const x = i => rows.length === 1 ? (left+right)/2 : left + i / (rows.length-1)*(right-left);
    const y = v => bottom-v/100*(bottom-top);
    let svg = [0,25,50,75,100].map(v=>`<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/><text x="32" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('');
    rows.forEach((row,i) => {
      svg += `<text x="${x(i)}" y="260" text-anchor="middle">Class ${row.classNumber}</text><text x="${x(i)}" y="277" text-anchor="middle" class="progress-date">${esc(row.observed_on.slice(5))}</text>`;
    });
    series.forEach(s => {
      let previous = null;
      rows.forEach((row,i) => {
        const value = s.value(row);
        if (value === null) {previous=null;return;}
        const point = [x(i),y(value)];
        if (previous) svg += `<line x1="${previous[0]}" y1="${previous[1]}" x2="${point[0]}" y2="${point[1]}" stroke="${s.color}" stroke-width="3"/>`;
        const title = `Class ${row.classNumber}, ${row.observed_on}, ${s.name}: ${number(value)}/100. ${row.project_title}`;
        svg += `<circle cx="${point[0]}" cy="${point[1]}" r="5" fill="${s.color}" stroke="white" stroke-width="2" ${interactive ? `tabindex="0" role="button" data-progress-class="${i}" aria-label="${esc(title)}"` : ''}><title>${esc(title)}</title></circle>`;
        if (rows.length <= 12 && series.length === 1) svg += `<text x="${point[0]}" y="${point[1]-12}" text-anchor="middle" class="point-value">${number(value)}</text>`;
        previous=point;
      });
    });
    return `<div class="progress-scroll" tabindex="0" role="region" aria-label="${esc(label)}; scroll horizontally for more classes"><svg class="class-progress-chart" style="min-width:${width}px" viewBox="0 0 ${width} 293" role="${interactive ? 'group' : 'img'}" aria-label="${esc(label)}">${svg}</svg></div>`;
  }
  function comparisonChart() {
    return `<div class="comparison-legend"><span><i class="earlier-key"></i>Earlier ratings</span><span><i class="recent-key"></i>Recent ratings</span></div><div class="comparison-rows">${data.comparisons.map(s => `<div class="comparison-row"><div class="comparison-label"><strong>${s.name}</strong><span class="${s.change !== null && s.change < 0 ? 'negative-change' : 'positive-change'}">${s.change === null ? 'Needs 2 ratings' : change(s.change)}</span></div>${s.count ? `<div class="comparison-pair"><div class="compare-track"><span class="earlier-bar" style="width:${s.earlier}%"></span></div><span>${number(s.earlier)}</span><div class="compare-track"><span class="recent-bar" style="width:${s.recent}%"></span></div><span>${number(s.recent)}</span></div><small>First ${s.count} vs latest ${s.count} rating${s.count===1?'':'s'} · classes ${s.firstClass}–${s.lastClass}</small>` : '<p class="comparison-empty">More observations needed to measure change.</p>'}</div>`).join('')}</div><p class="footnote">Each skill compares its first and last non-overlapping groups of up to 3 ratings within the filters. Changes in activities or marking can affect results.</p>`;
  }
  function testChart() {
    if (!data.tests.length) return '<div class="progress-no-data">No test results yet. Saved test attempts will show their progress here.</div>';
    return data.tests.map(test => {
      const first = test.attempts[0], last=test.attempts.at(-1);
      return `<article class="progress-test"><div class="progress-test-heading"><h3>${esc(test.name)}</h3><strong>${test.attempts.length > 1 ? change(last.percentage-first.percentage) : 'First attempt'}</strong></div>${lineChart(test.attempts,[{name:test.name,color:'#5276d2',value:r=>r.percentage}],test.name+' test percentages by class')}<p class="test-progress-caption">${test.attempts.length > 1 ? `Class ${first.classNumber}: <strong>${first.percentage}%</strong> → Class ${last.classNumber}: <strong>${last.percentage}%</strong>` : 'A second attempt will enable a comparison.'}</p></article>`;
    }).join('') + '<p class="footnote">Marks are shown as percentages of each test maximum. Compare attempts with similar difficulty and marking.</p>';
  }
  function drawClassDetail() {
    const host=document.getElementById('progress-class-detail');
    const row=data.classes[chosenClass];
    if (!row) {host.innerHTML='<p>Select a point on the graph to see the class, recorded skills, and mentor feedback.</p>';return;}
    host.innerHTML=`<div><span class="pill">Class ${row.classNumber} · ${row.observed_on}</span><h3>${esc(row.project_title)}</h3><small>${esc(row.zone_name)} · ${row.session_hours} hours</small></div><div class="class-score-list">${data.comparisons.filter(s=>row.steamre_rubric[s.index]!==null).map(s=>`<span>${s.name} <strong>${row.steamre_rubric[s.index]}/100</strong></span>`).join('') || '<span>No skill ratings in this class.</span>'}</div><p>${esc(row.mentor_notes)}</p><p><strong>Next step:</strong> ${esc(row.action_plan)}</p>`;
  }
  function drawTimeline() {
    const host=document.getElementById('class-timeline');
    const series=selected.map(i=>({name:data.comparisons[i].name,color:palette[i],value:r=>r.steamre_rubric[i]}));
    host.innerHTML=!series.length ? '<div class="progress-no-data">Select at least one skill above to draw its progress.</div>' : !data.classes.some(row=>selected.some(i=>row.steamre_rubric[i]!==null)) ? '<div class="progress-no-data">These skills have not been observed in the selected classes. Choose another skill or clear the filters.</div>' : lineChart(data.classes,series,'Observed skill scores across classes',true);
    host.querySelectorAll('[data-progress-class]').forEach(point=>{
      const select=()=>{chosenClass=Number(point.dataset.progressClass);drawClassDetail();};
      point.onclick=select;
      point.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();}};
    });
  }
  function mount(source, summary) {
    data=PortalAnalytics.progress(summary.logs,source.logs,summary.skills.map(s=>s.name));
    if(student!==source.student.id){student=source.student.id;selected=data.comparisons.filter(s=>s.observations>0).slice(0,3).map(s=>s.index);}
    chosenClass=null;
    const host=document.getElementById('student-progress');
    if(!data.classes.length){host.innerHTML='<section class="panel progress-no-data"><h2>Progress across classes</h2><p>No classes in this selection. Clear the filters or record observations for this student to build their progress graphs.</p></section>';return;}
    const improved=data.comparisons.filter(s=>s.change>0),declined=data.comparisons.filter(s=>s.change<0),stable=data.comparisons.filter(s=>s.change===0);
    host.innerHTML=`<section class="panel progress-hero"><div class="panel-heading"><div><p class="progress-eyebrow">YOUR CHILD’S PROGRESS</p><h2>How learning is changing, class by class</h2><p>Follow each skill through the selected classes. Select a point to see the observation behind it.</p></div><span class="pill">${data.classes.length} classes shown</span></div><div class="progress-summary"><span><strong>${improved.length}</strong> skills increased</span><span><strong>${stable.length}</strong> unchanged</span><span><strong>${declined.length}</strong> decreased</span><small>Earlier vs recent ratings · skills with at least 2 observations</small></div><div class="progress-skill-picker">${data.comparisons.map(s=>`<button type="button" class="skill-chip" data-progress-skill="${s.index}" aria-pressed="${selected.includes(s.index)}" style="--skill-color:${palette[s.index]}"><span class="dot" style="background:${palette[s.index]}"></span>${s.name}</button>`).join('')}</div><div id="class-timeline"></div><p class="progress-chart-note">Scores out of 100 · gaps mean a skill was not observed · class numbers follow the student’s saved session history.</p><div id="progress-class-detail" class="progress-class-detail" aria-live="polite"></div></section><div class="progress-comparison-grid"><section class="panel">${'<div class="panel-heading"><div><h2>Earlier vs recent skill performance</h2><p>See which skills have increased, stayed steady, or decreased.</p></div></div>'}${comparisonChart()}</section><section class="panel"><div class="panel-heading"><div><h2>Test results as classes progress</h2><p>Follow repeated attempts of the same named test.</p></div></div>${testChart()}</section></div>`;
    host.querySelectorAll('[data-progress-skill]').forEach(button=>{
      button.onclick=()=>{const i=Number(button.dataset.progressSkill);selected=selected.includes(i)?selected.filter(n=>n!==i):[...selected,i];button.setAttribute('aria-pressed',String(selected.includes(i)));drawTimeline();};
    });
    drawTimeline();drawClassDetail();
  }
  return {mount};
})();
