const test = require('node:test');
const assert = require('node:assert/strict');
const {summarize, csv} = require('../frontend/analytics.js');
const pillars = ['Science','Technology','Research','Engineering','Arts','Mathematics','Energy','Resilience'];
function fixture() {
  return {student:{name:'Learner'}, skills:pillars.map(name=>({name})), zones:[{name:'Robotics'},{name:'Code Craft'}],
    pathways:[{title:'Robotics',basis:['Science','Technology'],activity:'Build'}],
    logs:Array.from({length:6},(_,i)=>({id:String(i),created_at:'2026-10-01T00:00:00Z',
      observed_on:`2026-10-${String(i+1).padStart(2,'0')}`, zone_name:i<3?'Robotics':'Code Craft',
      steamre_rubric:[i<3?25:75,50,null,null,null,null,null,0],session_hours:1.5,
      behavioral_scores:i<3?{}:{curiosity:3}, project_title:'Project',observer_name:'Mentor',mentor_notes:'Evidence',action_plan:'Practice'}))};
}
test('filters recompute evidence, hours, trends and pathway thresholds',()=>{
  const source = fixture();
  const full = summarize(source,{},'2026-11-06');
  assert.equal(full.sessions,6); assert.equal(full.hours,9); assert.equal(full.skills[0].trend,50);
  assert.equal(full.skills[7].score,0); assert.equal(full.skills[2].score,null);
  assert.equal(full.behavior[0].score,3); assert.equal(full.behavior[0].count,3);
  assert.equal(full.pathways.length,1);
  const filtered = summarize(source,{from:'2026-10-02',to:'2026-10-03',zone:'Robotics'},'2026-11-06');
  assert.equal(filtered.sessions,2); assert.equal(filtered.hours,3);
  assert.equal(filtered.skills[0].score,25); assert.equal(filtered.skills[0].trend,null);
  assert.equal(filtered.pathways.length,0); assert.equal(filtered.behavior[0].score,null);
  assert.equal(source.logs.length,6);
});
test('no matches keeps unknown skills null and all counts zero',()=>{
  const result = summarize(fixture(),{from:'2026-11-01'},'2026-11-06');
  assert.equal(result.sessions,0); assert.equal(result.hours,0); assert.equal(result.coverage,0);
  assert.ok(result.skills.every(s=>s.score===null)); assert.equal(result.pathways.length,0);
});
test('export preserves null vs zero, quotes text and neutralizes formulas',()=>{
  const source = fixture(); source.logs[0].project_title = '=1+1';
  source.logs[0].mentor_notes = 'A "quoted" note, with a comma';
  const result = csv(source.student,[source.logs[0]],pillars);
  assert.ok(result.includes('"\'=1+1"')); assert.ok(result.includes('"A ""quoted"" note, with a comma"'));
  assert.ok(result.includes('"25","50","","","","","","0"'));
});
const {progress} = require('../frontend/analytics.js');
test('progress compares non-overlapping earlier and recent ratings and preserves class numbers',()=>{
  const source=fixture();
  const result=progress(source.logs,source.logs,pillars);
  assert.deepEqual(result.classes.map(l=>l.classNumber),[1,2,3,4,5,6]);
  assert.equal(result.comparisons[0].earlier,25);assert.equal(result.comparisons[0].recent,75);
  assert.equal(result.comparisons[0].change,50);assert.equal(result.comparisons[0].count,3);
  assert.equal(result.comparisons[2].change,null);assert.equal(result.comparisons[7].change,0);
  const filtered=progress(source.logs.slice(3),source.logs,pillars);
  assert.deepEqual(filtered.classes.map(l=>l.classNumber),[4,5,6]);assert.equal(filtered.comparisons[0].count,1);
});
test('progress exposes decreases and never infers improvement from one rating',()=>{
  const source=fixture();source.logs[0].steamre_rubric[0]=75;source.logs[5].steamre_rubric[0]=25;
  const result=progress([source.logs[5],source.logs[0]],source.logs,pillars);
  assert.equal(result.comparisons[0].change,-50);
  assert.equal(progress([source.logs[0]],source.logs,pillars).comparisons[0].change,null);
});
test('test trajectories normalize scores while keeping different tests separate',()=>{
  const source=fixture();
  source.logs[0].test_result={name:'Circuits',score:5,max_score:10};
  source.logs[4].test_result={name:'Coding',score:8,max_score:10};
  source.logs[5].test_result={name:'Circuits',score:18,max_score:20};
  const result=progress(source.logs,source.logs,pillars);
  assert.deepEqual(result.tests[0].attempts.map(l=>l.percentage),[50,90]);
  assert.deepEqual(result.tests[0].attempts.map(l=>l.classNumber),[1,6]);
  assert.equal(result.tests[1].name,'Coding');assert.equal(result.tests[1].attempts.length,1);
});
