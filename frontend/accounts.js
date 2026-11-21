'use strict';
const ParentAccounts = (() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let roster = [];
  const choices = selected => roster.map(s=>`<label class="child-choice"><input type="checkbox" name="children" value="${esc(s.id)}" ${selected.includes(s.id)?'checked':''}><span>${esc(s.name)}</span></label>`).join('') || '<p>Enroll a student first to assign children.</p>';
  async function load() {
    const host=document.getElementById('parent-accounts');
    if (!host) return;
    host.hidden=false;
    host.innerHTML='<section class="panel"><h2>Parent accounts & child access</h2><p>Loading accounts…</p></section>';
    try {
      const [students, parents] = await Promise.all([api('/students'),api('/parents')]);roster=students;
      host.innerHTML=`<section class="panel"><h2>Parent accounts & child access</h2><p class="account-description">Create a separate login for each parent and select only their children. Assignment changes apply to their next request.</p><details class="create-parent"><summary>+ Create parent account</summary><form id="create-parent-form"><div class="form-grid"><label>Parent name<input name="name" required maxlength="200"></label><label>Username<input name="username" required minlength="3" maxlength="80" pattern="[a-z0-9][a-z0-9._@+\\-]{2,79}" autocomplete="off" placeholder="e.g. parent.aarav"></label><label class="wide">Initial password (12 or more characters)<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label></div><fieldset class="child-choices"><legend>Children this parent can view</legend>${choices([])}</fieldset><button type="submit">Create parent account</button><p class="account-status" role="status"></p></form></details><div class="parent-account-list">${parents.map(p=>`<details class="parent-account"><summary><strong>${esc(p.name)}</strong><span>${esc(p.username)} · ${p.students.length} children</span></summary><form data-parent-id="${esc(p.id)}"><fieldset class="child-choices"><legend>Assigned children</legend>${choices(p.students)}</fieldset><button type="submit" class="secondary">Save child access</button><p class="account-status" role="status"></p></form></details>`).join('') || '<p class="empty">No parent accounts yet. Create one above.</p>'}</div><p class="footnote">Share the username and initial password directly with the intended parent. Parents can change their password after signing in.</p></section>`;
      document.getElementById('create-parent-form').onsubmit=async event=>{
        event.preventDefault();const form=event.target,button=form.querySelector('button'),status=form.querySelector('.account-status');button.disabled=true;
        const payload={name:form.elements.name.value.trim(),username:form.elements.username.value.trim().toLowerCase(),password:form.elements.password.value,students:[...form.querySelectorAll('[name=children]:checked')].map(el=>el.value)};
        try {await api('/parents',{method:'POST',body:JSON.stringify(payload)});form.reset();await load();document.getElementById('status').textContent='Parent account created.';} catch(error){status.textContent=error.message;}finally{button.disabled=false;}
      };
      host.querySelectorAll('[data-parent-id]').forEach(form=>form.onsubmit=async event=>{
        event.preventDefault();const button=form.querySelector('button'),status=form.querySelector('.account-status');button.disabled=true;
        try{await api('/parents/'+encodeURIComponent(form.dataset.parentId)+'/children',{method:'PUT',body:JSON.stringify({students:[...form.querySelectorAll('[name=children]:checked')].map(el=>el.value)})});status.textContent='Child access updated.';const count=form.querySelectorAll('[name=children]:checked').length;form.closest('details').querySelector('summary span').textContent=form.closest('details').querySelector('summary span').textContent.split(' · ')[0]+' · '+count+' children';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}
      });
    } catch(error) {host.innerHTML=`<section class="panel"><p role="alert">${esc(error.message)}</p><button id="retry-parents" class="secondary">Retry loading accounts</button></section>`;document.getElementById('retry-parents').onclick=load;}
  }
  return {load};
})();
