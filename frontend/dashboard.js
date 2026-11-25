'use strict';

/**
 * Edutainal Maverick World — Dashboard Renderer (Stitch Interactive Design Specification)
 * Generates all analytical components, interactive SVG trajectory charts, octagonal
 * radar charts, chronological session heatmaps, action pathways, and project journals
 * with full micro-interactions, animated states, and responsive data exploration.
 */
const Dashboard = (() => {
  const pillarColors = ['#168b81', '#5276d2', '#b083d4', '#dc9c3c', '#d9718b', '#44a7bb', '#83a64a', '#65738c'];
  const pillarNames = ['Science', 'Technology', 'Research', 'Engineering', 'Arts', 'Mathematics', 'Energy', 'Resilience'];

  const state = {
    student: null,
    from: '',
    to: '',
    zone: '',
    skill: 1,
    tab: 'overview',
    search: '',
    selectedPillars: [0, 1, 3, 5],
    activeClassIdx: null,
    expandedSkill: null,
    expandedBehavior: null,
    showNextChecklist: false,
    checklistChecked: {1: true, 2: false, 3: false},
    reviewedClasses: new Set()
  };

  let source, summary;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const byId = id => document.getElementById(id);
  const fmt = n => n === null || n === undefined ? '—' : new Intl.NumberFormat('en', {maximumFractionDigits: 1}).format(n);
  const dateLabel = value => new Date(value + 'T12:00:00').toLocaleDateString('en', {day:'numeric', month:'short'});
  const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  // ── Floating Dynamic Tooltip Handlers ─────────────────────────────────────────
  function showTooltip(html, x, y) {
    const tip = byId('dashboard-tooltip');
    if (!tip) return;
    tip.innerHTML = html;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    tip.classList.add('visible');
  }

  function hideTooltip() {
    const tip = byId('dashboard-tooltip');
    if (tip) tip.classList.remove('visible');
  }

  // ── 1. Top KPI Strip (4 Interactive Cards) ──────────────────────────────────
  function renderKpiStrip() {
    const target = source.student.target_sessions || 50;
    const sessionPct = Math.min(100, Math.round((summary.sessions / target) * 100));
    const remaining = Math.max(0, target - summary.sessions);
    const avgHours = summary.sessions ? (summary.hours / summary.sessions).toFixed(1) : '—';
    const activeZones = summary.zones.filter(z => z.sessions).length;
    const latestObs = summary.logs.at(-1);

    // Sparkline path generator from session hours
    const logs = summary.logs.slice(-8);
    const maxH = Math.max(4, ...logs.map(l => l.session_hours || 2));
    const points = logs.map((l, idx) => {
      const x = 5 + (idx / Math.max(1, logs.length - 1)) * 70;
      const y = 24 - ((l.session_hours || 2) / maxH) * 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const sparklinePath = points.length > 1 ? `M${points.join(' L')}` : 'M5,20 L75,10';
    const lastPt = points.length ? points.at(-1).split(',') : [75, 10];

    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <!-- Card 1: Completed Sessions -->
        <div class="card-interactive bg-surface-container-lowest/90 backdrop-blur-xl rounded-xl p-3 shadow-sm border border-secondary-container/40 flex flex-col justify-between group" data-kpi-action="sessions" title="Click to inspect latest classroom trajectory">
          <div class="flex items-start justify-between">
            <div class="flex flex-col">
              <span class="font-eyebrow text-on-surface-variant uppercase text-[9px] group-hover:text-primary transition-colors">Completed Sessions</span>
              <span class="text-base font-bold text-dark-petrol mt-0.5 flex items-center gap-1.5">
                <span>${summary.sessions} Classes</span>
                <span class="material-symbols-outlined text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">north_east</span>
              </span>
            </div>
            <span class="px-1.5 py-0.5 rounded bg-trend-up-bg text-trend-up font-label-micro text-[10px] font-semibold">+${summary.logs.slice(-3).length} recent</span>
          </div>
          <div class="mt-2.5 flex flex-col gap-1">
            <div class="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
              <div class="bg-primary h-full rounded-full transition-all duration-700" style="width: ${sessionPct}%"></div>
            </div>
            <div class="flex items-center justify-between text-on-surface-variant text-[11px] pt-0.5">
              <span>${sessionPct}% of Milestone</span>
              <span class="font-medium text-dark-petrol">${remaining} remaining</span>
            </div>
          </div>
        </div>

        <!-- Card 2: Total Learning Hours -->
        <div class="card-interactive bg-surface-container-lowest/90 backdrop-blur-xl rounded-xl p-3 shadow-sm border border-secondary-container/40 flex flex-col justify-between group" data-kpi-action="hours" title="Click to view learning zones breakdown">
          <div class="flex items-start justify-between">
            <div class="flex flex-col">
              <span class="font-eyebrow text-on-surface-variant uppercase text-[9px] group-hover:text-primary transition-colors">Recorded Time</span>
              <span class="text-base font-bold text-dark-petrol mt-0.5 flex items-center gap-1.5">
                <span>${fmt(summary.hours)} hrs</span>
                <span class="material-symbols-outlined text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">schedule</span>
              </span>
            </div>
            <span class="px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container font-label-micro text-[10px] font-semibold">Deep Immersion</span>
          </div>
          <div class="mt-2.5 flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-[11px] text-on-surface-variant">Avg. ${avgHours} hrs/class</span>
              <span class="text-[10px] text-trend-up font-medium">100% On-Site</span>
            </div>
            <svg class="w-14 h-5 text-skill-technology group-hover:scale-105 transition-transform" fill="none" viewBox="0 0 80 28">
              <path d="${sparklinePath}" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"></path>
              <circle cx="${lastPt[0]}" cy="${lastPt[1]}" fill="currentColor" r="2.5" class="animate-pulse"></circle>
            </svg>
          </div>
        </div>

        <!-- Card 3: STEAMRE Evidence -->
        <div class="card-interactive bg-surface-container-lowest/90 backdrop-blur-xl rounded-xl p-3 shadow-sm border border-secondary-container/40 flex flex-col justify-between group" data-kpi-action="skills" title="Click to explore the Skill Breakdown Matrix">
          <div class="flex items-start justify-between">
            <div class="flex flex-col">
              <span class="font-eyebrow text-on-surface-variant uppercase text-[9px] group-hover:text-primary transition-colors">STEAMRE Evidence</span>
              <span class="text-base font-bold text-dark-petrol mt-0.5 flex items-center gap-1.5">
                <span>${summary.coverage} / 8 Pillars</span>
                <span class="material-symbols-outlined text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">table_chart</span>
              </span>
            </div>
            <span class="px-1.5 py-0.5 rounded bg-trend-up-bg text-trend-up font-label-micro text-[10px] font-semibold">${Math.round((summary.observed/8)*100)}% Observed</span>
          </div>
          <div class="mt-2.5 flex flex-col gap-1">
            <div class="flex items-center gap-1">
              ${summary.skills.map((s, idx) => `
                <span class="w-2 h-2 rounded-full transition-transform hover:scale-150 ${s.observations >= 3 ? '' : 'opacity-40'}" style="background: ${pillarColors[idx]}" title="${s.name}: ${s.observations} observations"></span>
              `).join('')}
            </div>
            <span class="text-[11px] text-on-surface-variant truncate pt-0.5">
              ${summary.coverage >= 8 ? 'All 8 pillars qualified' : `${8 - summary.coverage} awaiting repeated evidence`}
            </span>
          </div>
        </div>

        <!-- Card 4: Zones Explored -->
        <div class="card-interactive bg-surface-container-lowest/90 backdrop-blur-xl rounded-xl p-3 shadow-sm border border-secondary-container/40 flex flex-col justify-between group" data-kpi-action="zones" title="Click to explore multi-disciplinary Action Pathways">
          <div class="flex items-start justify-between">
            <div class="flex flex-col">
              <span class="font-eyebrow text-on-surface-variant uppercase text-[9px] group-hover:text-primary transition-colors">Zones Explored</span>
              <span class="text-base font-bold text-dark-petrol mt-0.5 flex items-center gap-1.5">
                <span>${activeZones} / 10 Zones</span>
                <span class="material-symbols-outlined text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">route</span>
              </span>
            </div>
            <span class="px-1.5 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed font-label-micro text-[10px] font-semibold">Multi-Disciplinary</span>
          </div>
          <div class="mt-2.5 flex items-center justify-between text-on-surface-variant text-[11px]">
            <span class="truncate">${latestObs ? 'Active: ' + esc(latestObs.zone_name) : 'Ready'}</span>
            <span class="text-[10px] text-primary font-semibold shrink-0 group-hover:underline">${summary.pathways.length} Pathways →</span>
          </div>
        </div>
      </div>
    `;
  }

  // ── 2. SVG Octagonal Radar Chart (Interactive with Hover & Click) ─────────
  function renderRadarSvg() {
    const cx = 120, cy = 100, r = 65;
    const point = (i, scale) => [
      cx + Math.sin(i * Math.PI / 4) * r * scale,
      cy - Math.cos(i * Math.PI / 4) * r * scale
    ];
    const coords = p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

    // Concentric grid polygons (50%, 75%, 100%)
    let svg = [0.5, 0.75, 1.0].map((scale, idx) => {
      const pts = Array.from({length: 8}, (_, i) => coords(point(i, scale))).join(' ');
      const strokeClass = idx === 1 ? 'stroke-dasharray="2 2" stroke-width="0.5"' : 'stroke-width="0.75"';
      return `<polygon fill="none" points="${pts}" stroke="#bec9c6" ${strokeClass}/>`;
    }).join('');

    // Axis rays from center
    svg += Array.from({length: 8}, (_, i) => {
      const end = point(i, 1.0);
      return `<line x1="${cx}" y1="${cy}" x2="${end[0].toFixed(1)}" y2="${end[1].toFixed(1)}" stroke="#bec9c6" stroke-width="0.5"/>`;
    }).join('');

    // Build evaluated polygon. Skip unobserved skills (strict gap preservation)
    const validPoints = [];
    summary.skills.forEach((s, i) => {
      if (s.score !== null) {
        const p = point(i, Math.max(0.2, s.score / 100));
        validPoints.push({p, i, s});
      }
    });

    if (validPoints.length >= 3) {
      const polyPts = validPoints.map(v => coords(v.p)).join(' ');
      svg += `<polygon points="${polyPts}" fill="#006860" fill-opacity="0.22" stroke="#006860" stroke-width="1.5" class="transition-all duration-300"/>`;
    }

    // Connect gaps with dashed line if skills are missing
    for (let j = 0; j < validPoints.length; j++) {
      const curr = validPoints[j];
      const next = validPoints[(j + 1) % validPoints.length];
      if ((next.i - curr.i + 8) % 8 > 1) {
        svg += `<line x1="${curr.p[0].toFixed(1)}" y1="${curr.p[1].toFixed(1)}" x2="${next.p[0].toFixed(1)}" y2="${next.p[1].toFixed(1)}" stroke="#83a64a" stroke-dasharray="3 2" stroke-width="1.2"/>`;
      }
    }

    // Render interactive nodes & labels
    summary.skills.forEach((s, i) => {
      const lbl = point(i, 1.28);
      const isObserved = s.score !== null;
      const isSelectedPillar = state.selectedPillars.includes(i);

      if (isObserved) {
        const pt = point(i, Math.max(0.2, s.score / 100));
        svg += `
          <circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="${isSelectedPillar ? '4.5' : '3.5'}"
                  fill="${pillarColors[i]}" stroke="white" stroke-width="${isSelectedPillar ? '2' : '1'}"
                  cursor="pointer" class="transition-transform duration-200 hover:scale-150"
                  data-radar-pillar="${i}"
                  data-tooltip="<strong>${s.name}</strong><br>Score: ${Math.round(s.score)}/100 · ${s.observations} observations<br><span class='text-[#a1f1e6]'>Click to filter timeline</span>">
          </circle>
        `;
      } else {
        const unobs = point(i, 0.5);
        svg += `
          <circle cx="${unobs[0].toFixed(1)}" cy="${unobs[1].toFixed(1)}" r="2.5"
                  fill="none" stroke="${pillarColors[i]}" stroke-dasharray="2 2" stroke-width="1"
                  cursor="pointer"
                  data-radar-pillar="${i}"
                  data-tooltip="<strong>${s.name}</strong><br>Awaiting classroom observation">
          </circle>
        `;
      }
      const anchor = i === 0 || i === 4 ? 'middle' : i < 4 ? 'start' : 'end';
      svg += `
        <text x="${lbl[0].toFixed(1)}" y="${lbl[1].toFixed(1)}" fill="${pillarColors[i]}" font-size="7.5"
              font-weight="${isSelectedPillar ? '800' : '600'}" text-anchor="${anchor}" dominant-baseline="middle"
              cursor="pointer" data-radar-pillar="${i}">
          ${s.name} (${s.score !== null ? Math.round(s.score) : '—'})
        </text>
      `;
    });

    return `
      <div class="flex justify-center items-center py-1">
        <svg class="w-full max-w-[240px] h-auto overflow-visible font-label-micro text-label-micro" viewBox="0 0 240 200" role="img" aria-label="STEAMRE 8-Pillar Radar Profile">
          ${svg}
        </svg>
      </div>
    `;
  }

  // ── 3. Class-by-Class Progress Timeline & Interactive Drawer ──────────────
  function renderProgressTimeline() {
    const logs = summary.logs;
    if (!logs.length) {
      return `
        <div class="p-6 text-center bg-surface-container/30 rounded-lg animate-fade-slide">
          <p class="text-xs text-on-surface-variant">No classes recorded in the selected period. Expand filters or record observations.</p>
        </div>
      `;
    }

    const activeIdx = state.activeClassIdx !== null && state.activeClassIdx < logs.length ? state.activeClassIdx : logs.length - 1;
    const activeLog = logs[activeIdx] || logs.at(-1);

    // SVG coordinate math for compact width
    const svgWidth = Math.max(620, logs.length * 42);
    const paddingX = 30;
    const innerW = svgWidth - paddingX * 2;
    const yTop = 15, yBottom = 95;

    const xPos = idx => logs.length === 1 ? svgWidth / 2 : paddingX + (idx / (logs.length - 1)) * innerW;

    // Trajectory calculation using active pillar mean or overall average
    const points = logs.map((l, idx) => {
      const activeRubrics = l.steamre_rubric.filter((v, i) => state.selectedPillars.includes(i) && v !== null);
      const avg = activeRubrics.length ? activeRubrics.reduce((a, b) => a + b, 0) / activeRubrics.length : (l.steamre_rubric.filter(v => v !== null)[0] || 50);
      const y = yBottom - (avg / 100) * (yBottom - yTop);
      return {x: xPos(idx), y, avg, log: l, idx};
    });

    const polylinePts = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPts = `30,105 ${polylinePts} ${points.at(-1).x.toFixed(1)},105`;

    let gridLines = [20, 60, 100].map(val => {
      const y = yBottom - (val / 100) * (yBottom - yTop);
      return `
        <line x1="25" x2="${svgWidth - 15}" y1="${y}" y2="${y}" stroke="#bec9c6" stroke-dasharray="3 3" stroke-width="0.5"/>
        <text x="10" y="${y + 3}" fill="#6e7977" font-size="8">${val}</text>
      `;
    }).join('');

    let nodes = points.map(p => {
      const isSelected = p.idx === activeIdx;
      const tooltip = `<strong>Class ${p.idx + 1}</strong> (${dateLabel(p.log.observed_on)})<br>${esc(p.log.project_title)}<br>Score: <span class='text-primary-fixed font-bold'>${Math.round(p.avg)}/100</span> · ${esc(p.log.zone_name)}`;
      if (isSelected) {
        return `
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="#a1f1e6" fill-opacity="0.5" class="animate-pulse pointer-events-none"/>
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="#004e48" stroke="white" stroke-width="1.5" cursor="pointer" data-class-idx="${p.idx}" data-tooltip="${tooltip}"/>
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2" fill="#ffffff" pointer-events="none"/>
        `;
      }
      return `
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#ffffff" stroke="#006860" stroke-width="1.5"
                cursor="pointer" class="transition-transform duration-150 hover:scale-150"
                data-class-idx="${p.idx}" data-tooltip="${tooltip}">
        </circle>
      `;
    }).join('');

    let xLabels = points.map(p => `
      <text x="${p.x.toFixed(1)}" y="116" fill="${p.idx === activeIdx ? '#004e48' : '#6e7977'}" font-size="8" font-weight="${p.idx === activeIdx ? '700' : '400'}" text-anchor="middle" cursor="pointer" data-class-idx="${p.idx}">C${p.idx + 1}</text>
    `).join('');

    // Demonstrated marks breakdown in active class
    const demonstrated = activeLog.steamre_rubric
      .map((val, i) => ({val, name: pillarNames[i], color: pillarColors[i], idx: i}))
      .filter(item => item.val !== null);

    const isReviewed = state.reviewedClasses.has(activeLog.id);

    return `
      <!-- Pillar Filter Chips -->
      <div class="flex flex-wrap items-center gap-1 pb-1">
        <span class="text-[10px] text-on-surface-variant mr-1 font-semibold">Filter:</span>
        ${pillarNames.map((name, i) => {
          const isSelected = state.selectedPillars.includes(i);
          return `
            <button type="button" class="chip-interactive px-2 py-0.5 rounded-full text-[10px] transition-all flex items-center gap-1 ${isSelected ? 'font-semibold ring-1 shadow-xs' : 'opacity-60 bg-surface-container'}" style="${isSelected ? `background: ${pillarColors[i]}20; color: ${pillarColors[i]}; ring-color: ${pillarColors[i]}60;` : ''}" data-pillar-toggle="${i}" title="Toggle ${name} trajectory">
              <span class="w-1.5 h-1.5 rounded-full" style="background: ${pillarColors[i]}"></span>
              <span>${name}</span>
            </button>
          `;
        }).join('')}
      </div>

      <!-- Horizontal SVG Timeline Compact -->
      <div class="w-full bg-surface-container/30 rounded-lg p-2.5 overflow-x-auto">
        <div class="min-w-[560px]">
          <svg class="w-full h-28 overflow-visible font-label-micro" viewBox="0 0 ${svgWidth} 125">
            <defs>
              <linearGradient id="scoreGrad" x1="0%" x2="0%" y1="0%" y2="100%">
                <stop offset="0%" stop-color="#006860" stop-opacity="0.25"/>
                <stop offset="100%" stop-color="#006860" stop-opacity="0.0"/>
              </linearGradient>
            </defs>
            ${gridLines}
            <polygon fill="url(#scoreGrad)" points="${areaPts}" class="transition-all duration-300"/>
            <polyline fill="none" points="${polylinePts}" stroke="#006860" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" class="transition-all duration-300"/>
            ${nodes}
            ${xLabels}
          </svg>
        </div>
        <div class="flex items-center justify-between mt-1 pt-1 border-t border-secondary-container/30 text-[10px]">
          <span class="text-on-surface-variant">Class 1 (${Math.round(points[0].avg)} pts) → Class ${logs.length} (${Math.round(points.at(-1).avg)} pts)</span>
          <span class="px-1.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-semibold animate-pulse">Active Focus: Class ${activeIdx + 1} (${dateLabel(activeLog.observed_on)})</span>
        </div>
      </div>

      <!-- Class Detail Drawer (Stitch Focus Box Compact) -->
      <div class="bg-surface-container-lowest/90 backdrop-blur-xl rounded-xl p-3 shadow-sm border-l-2 border-primary flex flex-col gap-2.5 mt-1 animate-fade-slide" id="active-class-drawer">
        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-1.5">
              <span class="px-1.5 py-0.5 rounded bg-primary text-on-primary font-eyebrow uppercase text-[9px]">Class ${activeIdx + 1} Focus</span>
              <span class="text-[10px] text-on-surface-variant">${activeLog.observed_on} · ${activeLog.session_hours} hrs</span>
            </div>
            <h3 class="text-xs text-dark-petrol mt-1 font-bold">${esc(activeLog.project_title)}</h3>
            <p class="text-[11px] text-secondary">Zone: ${esc(activeLog.zone_name)} · Observer: ${esc(activeLog.observer_name || 'Edutainal Mentor')}</p>
          </div>
          <div class="flex items-center gap-1.5">
            <button type="button" class="btn-interactive inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${isReviewed ? 'bg-trend-up-bg text-trend-up border border-trend-up/40' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'} text-[10px] font-semibold shrink-0" data-toggle-reviewed="${activeLog.id}">
              <span class="material-symbols-outlined text-xs">${isReviewed ? 'task_alt' : 'radio_button_unchecked'}</span>
              <span>${isReviewed ? 'Acknowledged' : 'Mark Reviewed'}</span>
            </button>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold-accent/20 text-tertiary text-[10px] font-semibold shrink-0">
              <span class="material-symbols-outlined text-xs text-tertiary">verified</span>
              Verified Evidence
            </span>
          </div>
        </div>

        <!-- Demonstrated Marks in this session -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          ${demonstrated.length ? demonstrated.slice(0, 3).map(d => `
            <div class="card-interactive p-2 rounded-lg bg-surface-container-low flex flex-col group" data-pillar-focus="${d.idx}" title="Click to filter by ${d.name}">
              <div class="flex items-center justify-between">
                <span class="text-[9px] font-semibold uppercase group-hover:underline" style="color: ${d.color}">${d.name}</span>
                <span class="text-xs font-bold text-dark-petrol">${d.val} / 100</span>
              </div>
              <span class="text-[10px] text-on-surface-variant mt-0.5 truncate">${esc(activeLog.signature_experience || 'Laboratory session demonstration')}</span>
            </div>
          `).join('') : '<div class="p-2 rounded-lg bg-surface-container-low text-xs text-on-surface-variant">Test-focused class; no rubric ratings assigned.</div>'}
        </div>

        <!-- Mentor Observation Note -->
        <div class="p-2.5 rounded-lg bg-surface-container/40 flex flex-col gap-1">
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-sm text-primary">psychology</span>
            <span class="text-[11px] font-semibold text-dark-petrol">Mentor Observation Note</span>
          </div>
          <p class="text-xs text-on-surface italic leading-relaxed">
            "${esc(activeLog.mentor_notes)}"
          </p>
          ${activeLog.breakthrough_note ? `<p class="text-[10px] text-trend-up mt-0.5"><strong>Breakthrough:</strong> ${esc(activeLog.breakthrough_note)}</p>` : ''}
          ${activeLog.friction_note ? `<p class="text-[10px] text-trend-down"><strong>Support:</strong> ${esc(activeLog.friction_note)}</p>` : ''}
        </div>

        <!-- Actionable Next Steps -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-secondary-container/40 text-xs">
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-primary text-sm">forward</span>
            <span class="text-on-surface"><strong>Actionable Next Step:</strong> ${esc(activeLog.action_plan)}</span>
          </div>
          <div class="flex items-center gap-1 shrink-0 text-[10px] text-on-surface-variant">
            <span>${esc(activeLog.observer_name || 'Lab Fellow')}</span>
            <span class="material-symbols-outlined text-xs text-trend-up">verified_user</span>
          </div>
        </div>
      </div>
    `;
  }

  // ── 4. Tab 1: Class Overview Full Layout ────────────────────────────────────
  function renderOverviewTab() {
    const strongest = summary.skills.filter(s => s.score !== null).sort((a,b) => b.score - a.score)[0];
    const topSurge = summary.skills.filter(s => s.trend !== null).sort((a,b) => b.trend - a.trend)[0];
    const maxZoneHours = Math.max(1, ...summary.zones.map(z => z.hours));

    return `
      <!-- Section 3: Main Dual-Column Grid (7 : 5 Compact) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start mt-3">
        <!-- Left: Timeline & Class Inspection (Col 7) -->
        <div class="lg:col-span-7 flex flex-col gap-3.5">
          <div class="bg-surface-container-lowest/90 backdrop-blur-xl rounded-xl p-3.5 shadow-sm border border-secondary-container/40 flex flex-col gap-2.5">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div>
                <h2 class="text-sm text-dark-petrol font-bold">Class-by-Class Progress Timeline</h2>
                <p class="text-xs text-on-surface-variant">Click any class node to inspect mentor observations, rubric scores, and authentic project breakthroughs</p>
              </div>
            </div>
            ${renderProgressTimeline()}
          </div>
        </div>

        <!-- Right: 8-Pillar Map & Velocity (Col 5) -->
        <div class="lg:col-span-5 flex flex-col gap-3.5">
          <!-- Radar Chart Card -->
          <div class="bg-surface-container-lowest/90 backdrop-blur-xl rounded-xl p-3.5 shadow-sm border border-secondary-container/40 flex flex-col gap-2.5">
            <div class="flex items-center justify-between">
              <h2 class="text-sm text-dark-petrol font-bold">8-Pillar STEAMRE Map</h2>
              <span class="font-eyebrow px-2 py-0.5 rounded bg-surface-container text-secondary uppercase text-[9px]">Rubric Verified</span>
            </div>
            <p class="text-[11px] text-on-surface-variant">
              Every score stems from verifiable classroom evidence, not predictive algorithms. Unobserved dimensions remain open gaps.
            </p>
            ${renderRadarSvg()}
            <!-- Legend indicators -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1.5 border-t border-secondary-container/40">
              ${summary.skills.slice(0, 4).map((s, idx) => `
                <div class="chip-interactive flex items-center gap-1 cursor-pointer p-0.5 rounded hover:bg-surface-container" data-radar-pillar="${idx}">
                  <span class="w-2 h-2 rounded-full shrink-0" style="background: ${pillarColors[idx]}"></span>
                  <span class="text-[10px] text-on-surface truncate">${s.name}: ${s.score !== null ? Math.round(s.score) : '—'}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Trailing Velocity Widget -->
          <div class="bg-surface-container-lowest/90 backdrop-blur-xl rounded-xl p-3.5 shadow-sm border border-secondary-container/40 flex flex-col gap-2.5">
            <div class="flex items-center justify-between">
              <div>
                <span class="font-eyebrow text-on-surface-variant uppercase text-[9px]">Trajectory Shift</span>
                <h3 class="text-xs text-dark-petrol font-bold">Trailing 3-Class Velocity</h3>
              </div>
              <div class="flex items-center gap-1 px-2 py-0.5 rounded bg-trend-up-bg text-trend-up text-xs font-bold">
                <span class="material-symbols-outlined text-sm">trending_up</span>
                <span>${topSurge && topSurge.trend > 0 ? `+${fmt(topSurge.trend)} pts Momentum` : 'Stable'}</span>
              </div>
            </div>
            <div class="flex flex-col gap-1.5">
              ${topSurge ? `
                <div class="card-interactive p-2 rounded-lg bg-surface-container-low flex items-center justify-between group" data-pillar-focus="${topSurge.index}" title="Click to filter by ${topSurge.name}">
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-skill-resilience shrink-0"></span>
                    <div class="flex flex-col">
                      <span class="text-xs font-semibold text-dark-petrol group-hover:underline">Top Surging: ${topSurge.name}</span>
                      <span class="text-[10px] text-on-surface-variant">Weighted score: ${fmt(topSurge.score)} / 100</span>
                    </div>
                  </div>
                  <span class="text-xs text-trend-up font-bold bg-trend-up-bg px-2 py-0.5 rounded">+${fmt(topSurge.trend)} pts</span>
                </div>
              ` : ''}
              ${strongest ? `
                <div class="card-interactive p-2 rounded-lg bg-surface-container-low flex items-center justify-between group" data-pillar-focus="${strongest.index}" title="Click to filter by ${strongest.name}">
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-skill-engineering shrink-0"></span>
                    <div class="flex flex-col">
                      <span class="text-xs font-semibold text-dark-petrol group-hover:underline">Highest Demonstration: ${strongest.name}</span>
                      <span class="text-[10px] text-on-surface-variant">${strongest.observations} recorded sessions</span>
                    </div>
                  </div>
                  <span class="text-xs text-primary font-bold bg-primary-fixed px-2 py-0.5 rounded">${fmt(strongest.score)} pts</span>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Section 4: Bottom Grid (3 Interactive Panels) -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-3.5">
        <!-- Panel 1: Zone Engagement Hours -->
        <div class="bg-surface-container-lowest/90 backdrop-blur-xl rounded-xl p-3.5 shadow-sm border border-secondary-container/40 flex flex-col justify-between gap-2.5">
          <div>
            <div class="flex items-center justify-between">
              <h3 class="text-xs text-dark-petrol font-bold">Zone Engagement Hours</h3>
              <span class="text-[10px] text-secondary font-medium">${fmt(summary.hours)} hrs total</span>
            </div>
            <p class="text-[11px] text-on-surface-variant mt-0.5">Click any zone below to filter timeline &amp; evidence</p>
          </div>
          <div class="flex flex-col gap-2">
            ${summary.zones.slice(0, 5).map(z => {
              const isSelected = state.zone === z.name;
              return `
                <div class="card-interactive flex flex-col gap-0.5 p-1 rounded-md ${isSelected ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-surface-container'}" data-zone-select="${esc(z.name)}" title="Toggle ${esc(z.name)} filter">
                  <div class="flex justify-between text-xs">
                    <span class="font-semibold ${isSelected ? 'text-primary' : 'text-dark-petrol'} flex items-center gap-1">
                      ${isSelected ? '<span class="material-symbols-outlined text-xs text-primary">check_circle</span>' : ''}
                      <span>${esc(z.name)}</span>
                    </span>
                    <span class="text-[10px] text-on-surface-variant">${fmt(z.hours)} hrs</span>
                  </div>
                  <div class="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                    <div class="bg-primary h-1.5 rounded-full transition-all duration-700" style="width: ${(z.hours / maxZoneHours) * 100}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Panel 2: Behavioral Rubric Evaluation (Interactive Descriptors) -->
        <div class="bg-surface-container-lowest/90 backdrop-blur-xl rounded-xl p-3.5 shadow-sm border border-secondary-container/40 flex flex-col justify-between gap-2.5">
          <div>
            <div class="flex items-center justify-between">
              <h3 class="text-xs text-dark-petrol font-bold">Behavioral Rubric Evaluation</h3>
              <span class="text-[9px] px-1.5 py-0.5 rounded bg-surface-container text-secondary">Scale: 1-4</span>
            </div>
            <p class="text-[11px] text-on-surface-variant mt-0.5">Click any behavioral marker to inspect evaluation criteria</p>
          </div>
          <div class="flex flex-col gap-1.5">
            ${summary.behavior.map(b => {
              const rating = b.score || 3;
              const isExpanded = state.expandedBehavior === b.name;
              const badge = rating >= 3.5 ? 'Exemplary' : rating >= 2.5 ? 'Proficient' : 'Developing';
              const badgeClass = rating >= 3.5 ? 'bg-trend-up-bg text-trend-up' : 'bg-secondary-container text-on-secondary-container';
              return `
                <div class="card-interactive p-2 rounded-lg bg-surface-container/30 flex flex-col gap-1 text-xs" data-behavior-toggle="${b.name}">
                  <div class="flex items-center justify-between">
                    <div class="flex flex-col">
                      <span class="font-semibold text-dark-petrol capitalize flex items-center gap-1">
                        <span>${b.name}</span>
                        <span class="material-symbols-outlined text-xs text-on-surface-variant transition-transform ${isExpanded ? 'rotate-180' : ''}">expand_more</span>
                      </span>
                      <span class="text-[10px] text-on-surface-variant">${b.count} evaluated sessions</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <span class="text-[10px] font-bold text-dark-petrol">${fmt(b.score)} / 4</span>
                      <span class="px-1.5 py-0.5 rounded ${badgeClass} text-[9px] font-semibold">${badge}</span>
                    </div>
                  </div>
                  ${isExpanded ? `
                    <div class="mt-1 pt-1 border-t border-secondary-container/40 text-[10px] text-on-surface leading-tight animate-fade-slide">
                      <strong>Rubric Descriptor:</strong> Level 3/4 indicates independent exploration, resilient error debugging, and active collaborative assistance to classmates.
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
          <p class="text-[10px] text-secondary italic pt-1 border-t border-secondary-container/30">
            "Demonstrates autonomous inquiry, self-corrects during trial runs, and assists peers."
          </p>
        </div>

        <!-- Panel 3: Next Scheduled Class & Action Item (Interactive Checklist) -->
        <div class="bg-surface-container-lowest/90 backdrop-blur-xl rounded-xl p-3.5 shadow-sm border border-secondary-container/40 flex flex-col justify-between gap-2.5">
          <div>
            <div class="flex items-center justify-between">
              <h3 class="text-xs text-dark-petrol font-bold">Next Milestone Directive</h3>
              <span class="px-1.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed text-[10px] font-semibold">Class ${summary.sessions + 1}</span>
            </div>
            <div class="flex items-center gap-1.5 text-primary text-xs font-semibold mt-1">
              <span class="material-symbols-outlined text-sm">event</span>
              <span>Upcoming Session · Robotics Lab</span>
            </div>
          </div>
          <div class="p-2.5 rounded-lg bg-surface-container-low flex flex-col gap-1.5">
            <span class="font-eyebrow text-secondary uppercase text-[9px]">Session Blueprint</span>
            <span class="text-xs text-dark-petrol font-bold">${source.next_actions[0] ? esc(source.next_actions[0]) : 'Consolidate empirical rubric observations'}</span>
            <p class="text-[11px] text-on-surface-variant">
              Targeting closed-loop autonomous verification and multi-sensor calibration.
            </p>

            <!-- Interactive Checklist Toggle -->
            <button type="button" class="btn-interactive text-[10px] font-semibold text-primary flex items-center gap-1 mt-1 text-left" data-toggle-checklist="true">
              <span class="material-symbols-outlined text-xs">${state.showNextChecklist ? 'check_box' : 'checklist'}</span>
              <span>${state.showNextChecklist ? 'Hide Preparation Checklist' : 'Open Parent Preparation Checklist'}</span>
            </button>

            ${state.showNextChecklist ? `
              <div class="mt-1 flex flex-col gap-1 text-[10px] text-dark-petrol bg-surface-container/60 p-2 rounded-lg animate-fade-slide">
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" data-check-item="1" ${state.checklistChecked[1] ? 'checked' : ''} class="rounded text-primary focus:ring-0">
                  <span class="${state.checklistChecked[1] ? 'line-through opacity-60' : ''}">Review Rover Ultrasonic CAD diagram</span>
                </label>
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" data-check-item="2" ${state.checklistChecked[2] ? 'checked' : ''} class="rounded text-primary focus:ring-0">
                  <span class="${state.checklistChecked[2] ? 'line-through opacity-60' : ''}">Inspect motor gear teeth wear</span>
                </label>
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" data-check-item="3" ${state.checklistChecked[3] ? 'checked' : ''} class="rounded text-primary focus:ring-0">
                  <span class="${state.checklistChecked[3] ? 'line-through opacity-60' : ''}">Confirm battery pack full charge (7.4V)</span>
                </label>
              </div>
            ` : ''}
          </div>
          <div class="flex flex-col gap-1 pt-1 border-t border-secondary-container/40 text-[11px]">
            <span class="text-[10px] text-secondary">Every result starts with verifiable evidence.</span>
          </div>
        </div>
      </div>
    `;
  }

  // ── 5. Tab 2: Skill Breakdown & Session Heatmap (Interactive Table & Matrix)
  function renderSkillsTab() {
    return `
      <div class="flex flex-col gap-3.5 mt-3 animate-fade-slide">
        <!-- Matrix Progression Table Compact with Expandable Drawers -->
        <div class="rounded-xl bg-surface-container-lowest shadow-sm border border-secondary-container/40 overflow-hidden">
          <div class="p-3 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 class="text-sm text-on-surface font-semibold">Pillar Evidence Progression Matrix</h2>
              <p class="text-[11px] text-on-surface-variant">Click any row to view verified mastery history, breakthroughs, and rubrics.</p>
            </div>
            <div class="flex items-center gap-1.5 text-on-surface-variant text-[10px] bg-surface-container px-2.5 py-1 rounded-full">
              <span class="material-symbols-outlined text-xs text-primary">verified</span>
              <span>Double-blind observer verification required for score increments &gt;10 pts</span>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-surface-container-high/60 text-on-surface-variant font-eyebrow uppercase tracking-wider text-[9px]">
                  <th class="py-2 px-3">Pillar / Skill</th>
                  <th class="py-2 px-3">Weighted Score</th>
                  <th class="py-2 px-3 text-center">Observations</th>
                  <th class="py-2 px-3">Evidence Status</th>
                  <th class="py-2 px-3 text-center">Trailing Delta</th>
                  <th class="py-2 px-3">Last Verified</th>
                  <th class="py-2 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-container/60 text-xs">
                ${summary.skills.map((s, idx) => {
                  const isExpanded = state.expandedSkill === idx;
                  return `
                    <tr class="hover:bg-surface-container-low transition-colors cursor-pointer group" data-expand-skill="${idx}">
                      <td class="py-2 px-3">
                        <div class="flex items-center gap-2">
                          <div class="w-2.5 h-2.5 rounded-full shrink-0 group-hover:scale-125 transition-transform" style="background: ${pillarColors[idx]}"></div>
                          <div>
                            <span class="font-semibold text-on-surface block text-xs group-hover:text-primary transition-colors flex items-center gap-1">
                              <span>${s.name}</span>
                              <span class="material-symbols-outlined text-xs text-on-surface-variant transition-transform ${isExpanded ? 'rotate-180' : ''}">expand_more</span>
                            </span>
                            <span class="text-[10px] text-on-surface-variant">${s.observations ? 'Calibrated rubric dimension' : 'Awaiting baseline observation'}</span>
                          </div>
                        </div>
                      </td>
                      <td class="py-2 px-3 text-xs text-on-surface">
                        <div class="flex items-center gap-2">
                          <span class="w-6 font-bold">${s.score !== null ? Math.round(s.score) : '--'}</span>
                          <div class="w-20 bg-surface-container rounded-full h-1.5 overflow-hidden">
                            <div class="h-1.5 rounded-full transition-all duration-700" style="width: ${s.score || 0}%; background: ${pillarColors[idx]}"></div>
                          </div>
                        </div>
                      </td>
                      <td class="py-2 px-3 text-center text-xs text-on-surface font-semibold">${s.observations}</td>
                      <td class="py-2 px-3">
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${s.observations >= 3 ? 'bg-trend-up-bg text-trend-up' : s.observations ? 'bg-secondary-container text-on-secondary-container' : 'bg-trend-neutral-bg text-trend-neutral'} text-[9px] font-semibold uppercase">
                          ${s.observations >= 3 ? 'Repeated Evidence' : s.observations ? 'Early Evidence' : 'Awaiting'}
                        </span>
                      </td>
                      <td class="py-2 px-3 text-center text-xs ${s.trend > 0 ? 'text-trend-up font-bold' : 'text-on-surface-variant'}">
                        ${s.trend !== null ? (s.trend > 0 ? '+' : '') + fmt(s.trend) : '—'}
                      </td>
                      <td class="py-2 px-3 text-[10px] text-on-surface-variant">${s.last_observed || 'Pending'}</td>
                      <td class="py-2 px-3 text-center">
                        <button type="button" class="btn-interactive p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container" data-skill-explore="${idx}" title="Explore Trend on Timeline">
                          <span class="material-symbols-outlined text-sm text-primary">timeline</span>
                        </button>
                      </td>
                    </tr>
                    ${isExpanded ? `
                      <tr class="bg-surface-container-low/70 animate-fade-slide">
                        <td colspan="7" class="p-3 text-xs">
                          <div class="flex flex-col gap-2 bg-surface-container-lowest/80 p-2.5 rounded-lg border border-secondary-container/40">
                            <div class="flex items-center justify-between">
                              <span class="font-bold text-dark-petrol flex items-center gap-1.5">
                                <span class="w-2 h-2 rounded-full" style="background: ${pillarColors[idx]}"></span>
                                <span>${s.name} Observation History &amp; Qualitative Notes</span>
                              </span>
                              <button type="button" class="btn-interactive px-2 py-0.5 rounded bg-primary text-white text-[10px] font-semibold" data-skill-explore="${idx}">
                                View Trajectory on Timeline
                              </button>
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                              ${summary.logs.filter(l => l.steamre_rubric[idx] !== null).slice(-3).map(l => `
                                <div class="p-2 rounded bg-surface text-[11px] border border-secondary-container/30">
                                  <div class="flex justify-between font-semibold text-dark-petrol">
                                    <span>${l.observed_on} · ${esc(l.project_title)}</span>
                                    <span class="text-primary font-bold">${l.steamre_rubric[idx]}/100</span>
                                  </div>
                                  <p class="text-[10px] text-on-surface-variant mt-0.5 italic">"${esc(l.mentor_notes.slice(0, 90))}..."</p>
                                </div>
                              `).join('') || '<div class="text-[10px] text-on-surface-variant">No direct observations recorded yet.</div>'}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ` : ''}
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Chronological Session Heatmap Compact & Interactive -->
        <div class="relative rounded-xl bg-surface-container-lowest p-3.5 shadow-sm border border-secondary-container/40 flex flex-col gap-3" id="heatmap-container">
          <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-2">
            <div>
              <div class="flex items-center gap-1.5">
                <span class="p-1 rounded-lg bg-primary-container text-on-primary"><span class="material-symbols-outlined text-sm">grid_on</span></span>
                <h2 class="text-sm text-on-surface font-semibold">Chronological Session Heatmap</h2>
              </div>
              <p class="text-[11px] text-on-surface-variant mt-0.5">Hover on any cell for detailed feedback; click to inspect that class.</p>
            </div>
            <!-- Heatmap Legend -->
            <div class="flex flex-wrap items-center gap-3 bg-surface-container-low px-3 py-1 rounded-xl text-[10px]">
              <span class="font-eyebrow text-on-surface-variant uppercase text-[9px]">Rubric Depth:</span>
              <div class="flex items-center gap-1"><div class="w-3 h-3 rounded bg-primary/20"></div><span class="text-on-surface-variant">25</span></div>
              <div class="flex items-center gap-1"><div class="w-3 h-3 rounded bg-primary/45"></div><span class="text-on-surface-variant">50</span></div>
              <div class="flex items-center gap-1"><div class="w-3 h-3 rounded bg-primary/75"></div><span class="text-on-surface-variant">75</span></div>
              <div class="flex items-center gap-1"><div class="w-3 h-3 rounded bg-primary"></div><span class="text-on-surface font-semibold">100</span></div>
              <div class="flex items-center gap-1"><div class="w-3 h-3 rounded bg-trend-neutral-bg text-[8px] text-trend-neutral flex items-center justify-center">--</div><span class="text-trend-neutral">Unseen</span></div>
            </div>
          </div>

          <div class="overflow-x-auto pb-1">
            <table class="w-full border-separate border-spacing-1 text-center min-w-[720px]">
              <thead>
                <tr>
                  <th class="text-left font-eyebrow text-on-surface-variant uppercase p-1.5 w-28 text-[9px]">Class / Date</th>
                  ${pillarNames.map((name, i) => `
                    <th class="font-semibold p-1.5 text-xs" style="color: ${pillarColors[i]}">
                      <div class="flex items-center justify-center gap-1">
                        <span class="w-2 h-2 rounded-full" style="background: ${pillarColors[i]}"></span>${name}
                      </div>
                    </th>
                  `).join('')}
                </tr>
              </thead>
              <tbody>
                ${summary.logs.map((l, sIdx) => `
                  <tr>
                    <td class="text-left text-[10px] text-on-surface font-semibold p-1.5 flex items-center justify-between cursor-pointer hover:text-primary transition-colors" data-class-jump="${sIdx}">
                      <span>Class ${sIdx + 1}</span><span class="text-on-surface-variant font-normal">${dateLabel(l.observed_on)}</span>
                    </td>
                    ${l.steamre_rubric.map((score, pIdx) => {
                      if (score === null) {
                        return `<td class="h-7 rounded bg-trend-neutral-bg text-trend-neutral text-[9px]">--</td>`;
                      }
                      const opacity = Math.max(0.2, score / 100);
                      const textColor = score >= 60 ? 'text-surface-container-lowest' : 'text-dark-petrol';
                      const tip = `<strong>${pillarNames[pIdx]} (${score}/100)</strong><br>Class ${sIdx + 1}: ${esc(l.project_title)}<br><span class='text-primary-fixed'>Click to inspect class</span>`;
                      return `
                        <td class="h-7 rounded text-[10px] font-bold cursor-pointer transition-all duration-150 hover:scale-125 hover:z-20 hover:shadow-md ${textColor}"
                            style="background: rgba(0, 104, 96, ${opacity})"
                            data-class-jump="${sIdx}"
                            data-tooltip="${tip}">
                          ${score}
                        </td>
                      `;
                    }).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ── 6. Tab 3: Test Trajectories (Interactive Cards) ────────────────────────
  function renderTestsTab() {
    const tests = summary.logs.filter(l => l.test_result);
    if (!tests.length) {
      return `
        <div class="p-8 text-center bg-surface-container-lowest rounded-xl border border-secondary-container/40 mt-3 flex flex-col items-center gap-2 animate-fade-slide">
          <span class="material-symbols-outlined text-3xl text-secondary">monitoring</span>
          <h3 class="text-sm text-dark-petrol font-bold">No Marked Tests in Selected Period</h3>
          <p class="text-xs text-on-surface-variant max-w-md">Company observers can record standardized test marks with an observation to compare repeated attempts.</p>
        </div>
      `;
    }

    const groups = new Map();
    tests.forEach(l => {
      const key = l.test_result.name;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    });

    return `
      <div class="flex flex-col gap-3 mt-3 animate-fade-slide">
        ${[...groups].map(([name, logs]) => {
          const first = logs[0].test_result;
          const latest = logs.at(-1).test_result;
          const firstPct = (first.score / first.max_score) * 100;
          const latestPct = (latest.score / latest.max_score) * 100;
          const deltaPct = logs.length > 1 ? latestPct - firstPct : null;

          return `
            <div class="card-interactive bg-surface-container-lowest/90 backdrop-blur-xl rounded-xl p-3.5 shadow-sm border border-secondary-container/40 flex flex-col gap-2.5">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-sm text-dark-petrol font-bold">${esc(name)}</h3>
                  <p class="text-[11px] text-on-surface-variant">${logs.length} evaluated attempt${logs.length > 1 ? 's' : ''} · First vs Latest attempt</p>
                </div>
                ${deltaPct !== null ? `
                  <span class="px-2 py-0.5 rounded ${deltaPct >= 0 ? 'bg-trend-up-bg text-trend-up' : 'bg-trend-down-bg text-trend-down'} text-xs font-bold">
                    ${deltaPct >= 0 ? '+' : ''}${fmt(deltaPct)}% Delta
                  </span>
                ` : '<span class="px-2 py-0.5 rounded bg-surface-container text-[10px]">Initial Baseline</span>'}
              </div>

              <!-- Bar tracks with animated widths -->
              <div class="flex flex-col gap-2 py-1">
                ${logs.map(l => {
                  const pct = (l.test_result.score / l.test_result.max_score) * 100;
                  return `
                    <div class="flex flex-col gap-0.5">
                      <div class="flex justify-between text-xs">
                        <span class="font-medium text-on-surface">${dateLabel(l.observed_on)} · ${esc(l.project_title)}</span>
                        <span class="font-bold text-dark-petrol">${l.test_result.score} / ${l.test_result.max_score} <small class="text-on-surface-variant font-normal">(${fmt(pct)}%)</small></span>
                      </div>
                      <div class="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                        <div class="bg-skill-technology h-1.5 rounded-full transition-all duration-700" style="width: ${pct}%"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>

              <div class="p-2.5 rounded-lg bg-surface-container-low text-xs text-on-surface-variant">
                <strong>Latest Feedback:</strong> "${esc(logs.at(-1).mentor_notes)}"
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // ── 7. Tab 4: Pathways & Mentor Action Plan (Interactive Tracks) ───────────
  function renderPathwaysTab() {
    return `
      <div class="flex flex-col gap-4 mt-3 animate-fade-slide">
        <!-- Curated Exploration Pathways -->
        <div class="flex flex-col gap-2.5">
          <div>
            <span class="font-eyebrow text-primary uppercase tracking-widest text-[9px]">Evidence-Gated Tracks</span>
            <h2 class="text-sm text-on-surface font-bold">Curated Multi-Disciplinary Tracks</h2>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            ${summary.pathways.length ? summary.pathways.map((p, idx) => `
              <article class="card-interactive rounded-xl bg-surface-container-lowest p-3.5 shadow-sm border border-secondary-container/40 flex flex-col justify-between gap-2.5 group">
                <div class="flex flex-col gap-2">
                  <div class="flex items-center justify-between">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-on-primary text-[9px] font-bold uppercase tracking-wider">
                      <span class="material-symbols-outlined text-xs">verified</span>
                      Active
                    </span>
                    <span class="font-bold text-primary text-sm">${fmt(p.alignment)}%</span>
                  </div>
                  <h3 class="text-xs text-on-surface font-bold group-hover:text-primary transition-colors">${esc(p.title)}</h3>
                  <p class="text-xs text-on-surface-variant leading-relaxed">${esc(p.activity)}</p>
                  <div class="flex flex-wrap gap-1 pt-1">
                    ${p.basis.map(b => `<span class="px-1.5 py-0.5 rounded bg-surface-container text-[9px] text-secondary font-medium">${esc(b)}</span>`).join('')}
                  </div>
                </div>
                <div class="pt-2 border-t border-secondary-container/30 flex items-center justify-between text-[10px]">
                  <span class="text-on-surface-variant">3+ observations met</span>
                  <span class="text-primary font-semibold">Track #0${idx + 1}</span>
                </div>
              </article>
            `).join('') : `
              <div class="col-span-full p-6 text-center bg-surface-container-lowest rounded-xl border border-secondary-container/40 text-xs text-on-surface-variant">
                Each pathway requires at least 3 verified observations across all constituent pillars.
              </div>
            `}
          </div>
        </div>

        <!-- Mentor Action Plan Directives -->
        <div class="grid grid-cols-1 xl:grid-cols-12 gap-3.5">
          <div class="xl:col-span-7 rounded-xl bg-surface-container-lowest p-3.5 shadow-sm border border-secondary-container/40 flex flex-col gap-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="h-7 w-7 rounded-lg bg-surface-container flex items-center justify-center text-primary"><span class="material-symbols-outlined text-base">assignment_turned_in</span></div>
                <h3 class="text-xs text-on-surface font-bold">Immediate Targets &amp; Lab Exercises</h3>
              </div>
              <span class="font-eyebrow text-trend-up uppercase font-bold text-[9px]">Direct Mentor Actions</span>
            </div>
            <div class="flex flex-col gap-2">
              ${source.next_actions.map((action, aIdx) => `
                <div class="card-interactive rounded-lg bg-surface-container/60 p-2.5 flex items-start gap-2.5">
                  <div class="h-5 w-5 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">0${aIdx + 1}</div>
                  <div class="flex flex-col gap-0.5">
                    <span class="text-[9px] px-1.5 py-0.2 rounded bg-secondary-container text-on-secondary-container font-bold uppercase w-fit">Directive 0${aIdx + 1}</span>
                    <p class="text-xs text-on-surface font-semibold">${esc(action)}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="xl:col-span-5 rounded-xl bg-dark-petrol text-surface-container-lowest p-3.5 shadow-sm flex flex-col justify-between gap-3">
            <div>
              <div class="flex items-center gap-1.5 mb-1">
                <span class="material-symbols-outlined text-gold-accent text-sm">bolt</span>
                <span class="font-eyebrow text-gold-accent uppercase text-[9px]">Cognitive Breakthroughs</span>
              </div>
              <h3 class="text-xs font-bold text-surface-container-lowest">Empirical Growth Observations</h3>
              <p class="text-[11px] text-surface-variant mt-1.5">
                ${summary.logs.filter(l => l.breakthrough_note).slice(-2).map(l => `"${esc(l.breakthrough_note)}"`).join(' · ') || 'Breakthroughs recorded during laboratory testing will appear here.'}
              </p>
            </div>
            <div class="p-2.5 rounded-lg bg-company-dark/60 text-[10px] text-surface-variant">
              <span>UN SDG Alignment:</span>
              <div class="flex flex-wrap gap-1 mt-1">
                <span class="px-1.5 py-0.5 rounded bg-surface-container text-dark-petrol font-bold">SDG 4: Quality Education</span>
                <span class="px-1.5 py-0.5 rounded bg-surface-container text-dark-petrol font-bold">SDG 9: Industry & Innovation</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ── 8. Tab 5: Project Journal & Portfolio (Search & Details) ───────────────
  function renderPortfolioTab() {
    const query = state.search.trim().toLowerCase();
    const rows = [...summary.logs].reverse().filter(l =>
      [l.project_title, l.zone_name, l.mentor_notes, l.observer_name || ''].some(v => v.toLowerCase().includes(query))
    );

    return `
      <div class="flex flex-col gap-3.5 mt-3 animate-fade-slide">
        <div class="rounded-xl bg-surface-container-lowest p-3.5 shadow-sm border border-secondary-container/40 flex flex-col gap-2.5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 class="text-sm text-dark-petrol font-bold">Project Portfolio &amp; Session Journal</h2>
              <p class="text-[11px] text-on-surface-variant">Complete laboratory history with qualitative observer notes, breakthroughs, and SDG tags.</p>
            </div>
            <div class="relative min-w-[220px]">
              <input type="search" id="project-search" placeholder="Search project title, zone, mentor…" value="${esc(state.search)}" class="w-full pl-8 pr-7 py-1.5 rounded-lg bg-surface-container text-xs border-0 focus:ring-1 focus:ring-primary">
              <span class="material-symbols-outlined text-sm text-on-surface-variant absolute left-2.5 top-1/2 -translate-y-1/2">search</span>
              ${state.search ? `
                <button type="button" id="clear-search" class="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-dark-petrol p-0.5">
                  <span class="material-symbols-outlined text-xs">close</span>
                </button>
              ` : ''}
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-surface-container-high/60 text-on-surface-variant font-eyebrow uppercase text-[9px]">
                  <th class="py-2 px-3">Date</th>
                  <th class="py-2 px-3">Project &amp; Learning Experience</th>
                  <th class="py-2 px-3">Learning Zone</th>
                  <th class="py-2 px-3">Duration</th>
                  <th class="py-2 px-3">Observer</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-container/60 text-xs">
                ${rows.length ? rows.map(l => `
                  <tr class="hover:bg-surface-container-low transition-colors">
                    <td class="py-2.5 px-3 text-[10px] text-on-surface-variant whitespace-nowrap">${l.observed_on}</td>
                    <td class="py-2.5 px-3">
                      <details class="cursor-pointer group">
                        <summary class="font-semibold text-primary hover:underline text-xs flex items-center gap-1.5">
                          <span class="material-symbols-outlined text-xs text-primary transition-transform group-open:rotate-90">arrow_right</span>
                          <span>${esc(l.project_title)}</span>
                        </summary>
                        <div class="mt-1.5 p-2.5 rounded-lg bg-surface-container-low flex flex-col gap-1.5 text-xs animate-fade-slide">
                          <p><strong>Learning Intention:</strong> ${esc(l.signature_experience)}</p>
                          <p><strong>Mentor Evidence:</strong> ${esc(l.mentor_notes)}</p>
                          ${l.breakthrough_note ? `<p class="text-trend-up"><strong>Breakthrough:</strong> ${esc(l.breakthrough_note)}</p>` : ''}
                          ${l.friction_note ? `<p class="text-trend-down"><strong>Support:</strong> ${esc(l.friction_note)}</p>` : ''}
                          <p class="text-primary font-medium"><strong>Next step:</strong> ${esc(l.action_plan)}</p>
                          <span class="text-[9px] text-on-surface-variant">SDGs: ${l.sdgs.map(s => 'SDG ' + s).join(' · ') || 'Framework aligned'} · Record: ${esc(l.id)}</span>
                        </div>
                      </details>
                    </td>
                    <td class="py-2.5 px-3"><span class="px-1.5 py-0.5 rounded-full bg-surface-container text-[10px] font-medium">${esc(l.zone_name)}</span></td>
                    <td class="py-2.5 px-3 text-[10px]">${l.session_hours} hrs</td>
                    <td class="py-2.5 px-3 text-xs">${esc(l.observer_name || 'Lab Fellow')}</td>
                  </tr>
                `).join('') : `
                  <tr><td colspan="5" class="py-6 text-center text-xs text-on-surface-variant">No projects match the current search or filters.</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ── 9. Master Render Function ─────────────────────────────────────────────
  function render() {
    summary = PortalAnalytics.summarize(source, state, localToday());
    const student = source.student;
    const active = !!(state.from || state.to || state.zone);

    // Sync fixed sidebar active states
    document.querySelectorAll('#sidebar-nav button[data-tab]').forEach(btn => {
      const isCurrent = btn.dataset.tab === state.tab;
      if (isCurrent) {
        btn.className = 'w-full flex items-center gap-2.5 px-2.5 py-2 transition-colors bg-primary-container text-on-primary font-semibold rounded-lg shadow-sm text-left text-xs';
      } else {
        btn.className = 'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-surface-container-highest hover:bg-company-dark/40 hover:text-surface-container-lowest transition-colors font-label-default text-xs text-left';
      }
    });

    byId('report').innerHTML = `
      <!-- Interactive Container Compact -->
      <div class="max-w-[1440px] mx-auto w-full px-2 sm:px-4 py-2 flex flex-col gap-2.5">

        <!-- Section 1: Filter Bar & Context Welcome Compact -->
        <div class="bg-surface-container-lowest/90 backdrop-blur-xl rounded-xl p-3.5 shadow-sm border border-secondary-container/40 flex flex-col gap-2.5">
          <!-- Print-Only Official Report Header -->
          <div class="print-only-header pb-3 border-b border-secondary-container mb-1 items-center justify-between">
            <div class="flex items-center gap-3">
              <img src="/assets/edutainal_maverick_world_logo.png" alt="Edutainal Maverick World" class="h-9 w-auto object-contain">
              <div>
                <h2 class="text-sm font-bold text-on-surface uppercase tracking-wide">EDUTAINAL MAVERICK WORLD</h2>
                <p class="text-[9px] text-secondary font-mono">OFFICIAL STUDENT LEARNING EVIDENCE &amp; PROGRESS REPORT</p>
              </div>
            </div>
            <div class="text-right text-[9px] text-on-surface-variant font-mono">
              <p>Student: <strong>${esc(student.name)}</strong> (${esc(student.id)})</p>
              <p>World Tier: <strong>${esc(student.world_tier || 'Genesis').toUpperCase()}</strong> · Date: ${localToday()}</p>
            </div>
          </div>

          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
            <div class="flex flex-col gap-0.5">
              <div class="flex items-center gap-1.5">
                <span class="font-eyebrow text-primary uppercase tracking-widest text-[9px]">Parent Console · Verified Learning Evidence</span>
                <span class="w-1 h-1 rounded-full bg-gold-accent"></span>
                <span class="font-eyebrow text-secondary uppercase text-[9px]">Learning, made visible</span>
              </div>
              <h1 class="text-sm sm:text-base text-on-surface font-semibold">
                Welcome back! Here is ${esc(student.name)}'s verified learning evidence and classroom trajectory.
              </h1>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button type="button" id="export-pdf" class="btn-interactive inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary hover:bg-primary-container text-xs transition-all shadow-sm font-semibold">
                <span class="material-symbols-outlined text-base">picture_as_pdf</span>
                <span>Export PDF</span>
              </button>
            </div>
          </div>

          <!-- Controls & Filter Strip -->
          <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-secondary-container/40">
            <div class="flex flex-wrap items-center gap-2">
              <!-- Date range selector -->
              <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container text-on-surface text-xs">
                <span class="material-symbols-outlined text-sm text-secondary">date_range</span>
                <input type="date" id="filter-from" value="${state.from}" max="${state.to || localToday()}" class="bg-transparent border-0 p-0 text-xs text-on-surface font-medium focus:ring-0 cursor-pointer">
                <span class="text-on-surface-variant font-mono">→</span>
                <input type="date" id="filter-to" value="${state.to}" min="${state.from}" max="${localToday()}" class="bg-transparent border-0 p-0 text-xs text-on-surface font-medium focus:ring-0 cursor-pointer">
              </div>

              <!-- Zone filter dropdown -->
              <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container text-on-surface text-xs">
                <span class="material-symbols-outlined text-sm text-skill-science">science</span>
                <span class="text-xs">Zone:</span>
                <select id="filter-zone" class="bg-transparent border-0 p-0 text-xs font-semibold text-primary focus:ring-0 cursor-pointer">
                  <option value="">All 10 Zones</option>
                  ${source.zones.map(z => `<option value="${esc(z.name)}" ${state.zone === z.name ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}
                </select>
              </div>

              <!-- Reset Filter Button -->
              <button type="button" id="clear-filters" class="btn-interactive inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors text-xs">
                <span class="material-symbols-outlined text-sm">restart_alt</span>
                <span>Reset</span>
              </button>
            </div>

            <!-- Verification Meta Pill -->
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-trend-up-bg text-trend-up text-[10px] font-semibold">
              <span class="w-1.5 h-1.5 rounded-full bg-live-broadcast pulse"></span>
              <span>${summary.sessions} of ${source.total_sessions} sessions</span>
              <span class="text-outline-variant">·</span>
              <span>Live Synced</span>
            </div>
          </div>
        </div>

        <!-- Section 2: Top KPI Summary Strip (4 Cards) -->
        ${renderKpiStrip()}

        <!-- Section 3: Dynamic Tab View Panels with Transition Animation -->
        <div id="tab-content" class="w-full animate-fade-slide">
          ${state.tab === 'overview' ? renderOverviewTab() : ''}
          ${state.tab === 'skills' ? renderSkillsTab() : ''}
          ${state.tab === 'tests' ? renderTestsTab() : ''}
          ${state.tab === 'pathways' ? renderPathwaysTab() : ''}
          ${state.tab === 'portfolio' ? renderPortfolioTab() : ''}
        </div>

      </div>
    `;

    bindEvents();
  }

  // ── 10. Comprehensive Event Bindings ──────────────────────────────────────
  function bindEvents() {
    // Tab switching from sidebar or inline
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.onclick = () => {
        state.tab = btn.dataset.tab;
        render();
      };
    });

    // KPI Card Interactions
    document.querySelectorAll('[data-kpi-action]').forEach(card => {
      card.onclick = () => {
        const action = card.dataset.kpiAction;
        if (action === 'skills') {
          state.tab = 'skills';
          render();
        } else if (action === 'zones') {
          state.tab = 'pathways';
          render();
        } else if (action === 'sessions') {
          state.tab = 'overview';
          state.activeClassIdx = summary.logs.length ? summary.logs.length - 1 : null;
          render();
          const target = byId('active-class-drawer');
          if (target) target.scrollIntoView({behavior: 'smooth', block: 'nearest'});
        } else if (action === 'hours') {
          state.tab = 'overview';
          render();
          const zEl = byId('filter-zone');
          if (zEl) zEl.focus();
        }
      };
    });

    // Date filters
    ['from', 'to'].forEach(key => {
      const el = byId('filter-' + key);
      if (el) el.onchange = e => { state[key] = e.target.value; render(); };
    });

    // Zone filter
    const zEl = byId('filter-zone');
    if (zEl) zEl.onchange = e => { state.zone = e.target.value; render(); };

    // Reset filters
    const clearBtn = byId('clear-filters');
    if (clearBtn) clearBtn.onclick = () => { state.from = ''; state.to = ''; state.zone = ''; render(); };

    // Zone selection from bottom panel
    document.querySelectorAll('[data-zone-select]').forEach(btn => {
      btn.onclick = () => {
        state.zone = state.zone === btn.dataset.zoneSelect ? '' : btn.dataset.zoneSelect;
        render();
      };
    });

    // Pillar filter toggle chips on overview timeline
    document.querySelectorAll('[data-pillar-toggle]').forEach(btn => {
      btn.onclick = () => {
        const pIdx = Number(btn.dataset.pillarToggle);
        if (state.selectedPillars.includes(pIdx)) {
          if (state.selectedPillars.length > 1) {
            state.selectedPillars = state.selectedPillars.filter(idx => idx !== pIdx);
          }
        } else {
          state.selectedPillars.push(pIdx);
        }
        render();
      };
    });

    // Class node clicking on timeline
    document.querySelectorAll('[data-class-idx]').forEach(el => {
      el.onclick = () => {
        state.activeClassIdx = Number(el.dataset.classIdx);
        render();
      };
    });

    // Jump to class from heatmap
    document.querySelectorAll('[data-class-jump]').forEach(el => {
      el.onclick = () => {
        state.activeClassIdx = Number(el.dataset.classJump);
        state.tab = 'overview';
        render();
        const target = byId('active-class-drawer');
        if (target) target.scrollIntoView({behavior: 'smooth', block: 'nearest'});
      };
    });

    // Radar Pillar clicking & hovering
    document.querySelectorAll('[data-radar-pillar]').forEach(el => {
      el.onclick = () => {
        const pIdx = Number(el.dataset.radarPillar);
        state.selectedPillars = [pIdx];
        render();
      };
    });

    // Focus pillar from drawer marks or velocity cards
    document.querySelectorAll('[data-pillar-focus]').forEach(el => {
      el.onclick = () => {
        const pIdx = Number(el.dataset.pillarFocus);
        state.selectedPillars = [pIdx];
        render();
      };
    });

    // Toggle reviewed state on active class
    document.querySelectorAll('[data-toggle-reviewed]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const obsId = btn.dataset.toggleReviewed;
        if (state.reviewedClasses.has(obsId)) {
          state.reviewedClasses.delete(obsId);
        } else {
          state.reviewedClasses.add(obsId);
        }
        render();
      };
    });

    // Expand behavioral rubric criteria
    document.querySelectorAll('[data-behavior-toggle]').forEach(el => {
      el.onclick = () => {
        const trait = el.dataset.behaviorToggle;
        state.expandedBehavior = state.expandedBehavior === trait ? null : trait;
        render();
      };
    });

    // Toggle next checklist
    document.querySelectorAll('[data-toggle-checklist]').forEach(btn => {
      btn.onclick = () => {
        state.showNextChecklist = !state.showNextChecklist;
        render();
      };
    });

    // Checklist checkboxes
    document.querySelectorAll('[data-check-item]').forEach(cb => {
      cb.onchange = e => {
        state.checklistChecked[cb.dataset.checkItem] = e.target.checked;
        render();
      };
    });

    // Expand skill row in matrix
    document.querySelectorAll('[data-expand-skill]').forEach(row => {
      row.onclick = e => {
        if (e.target.closest('button')) return;
        const sIdx = Number(row.dataset.expandSkill);
        state.expandedSkill = state.expandedSkill === sIdx ? null : sIdx;
        render();
      };
    });

    // Explore skill on timeline from matrix button
    document.querySelectorAll('[data-skill-explore]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const pIdx = Number(btn.dataset.skillExplore);
        state.selectedPillars = [pIdx];
        state.tab = 'overview';
        render();
      };
    });

    // Project journal search
    const pSearch = byId('project-search');
    if (pSearch) {
      pSearch.oninput = e => {
        state.search = e.target.value;
        const host = byId('tab-content');
        if (host && state.tab === 'portfolio') {
          host.innerHTML = renderPortfolioTab();
          const renewed = byId('project-search');
          if (renewed) {
            renewed.focus();
            renewed.selectionStart = renewed.selectionEnd = renewed.value.length;
          }
          bindEvents();
        }
      };
    }

    const clearSearch = byId('clear-search');
    if (clearSearch) {
      clearSearch.onclick = () => {
        state.search = '';
        render();
      };
    }

    // PDF Export
    const pdfBtn = byId('export-pdf') || byId('export-csv');
    if (pdfBtn) {
      pdfBtn.onclick = () => {
        const originalTitle = document.title;
        const studentName = source.student?.name || 'Student';
        document.title = `${studentName} - Edutainal Learning Evidence Report - ${localToday()}`;
        window.print();
        setTimeout(() => { document.title = originalTitle; }, 1000);
      };
    }

    // Dynamic Tooltips on Hover
    document.querySelectorAll('[data-tooltip]').forEach(el => {
      el.onmouseenter = e => {
        const rect = el.getBoundingClientRect();
        showTooltip(el.dataset.tooltip, rect.left + rect.width / 2, rect.top);
      };
      el.onmouseleave = () => hideTooltip();
    });
  }

  function show(report) {
    if (document.body.dataset.role !== 'parent') return;
    source = report;
    if (state.student !== report.student.id) {
      state.student = report.student.id;
      state.from = '';
      state.to = '';
      state.zone = '';
      state.search = '';
      state.activeClassIdx = null;
      state.expandedSkill = null;
      state.expandedBehavior = null;
      state.showNextChecklist = false;
      state.reviewedClasses = new Set();
      state.checklistChecked = {1: false, 2: false, 3: false};
      state.skill = Math.max(0, report.skills.findIndex(s => s.score !== null));
    }
    render();
  }

  return {show};
})();
