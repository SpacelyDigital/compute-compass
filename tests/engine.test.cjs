const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const E=require('../src/engine.js'),C=require('../src/catalog.json');
const base={...E.defaults,selected:['chat'],budget:0,priority:'value',concurrency:'queued',facility:'home',deployment:'personal',multiple:false,owned:[]};
const rec=(x={},c=C)=>E.recommend({...base,...x},c,{escalate:false});
const req=x=>E.requirements({...base,...x},C);
const owned=(id,uid=id,extra={})=>({...C.hardware.find(h=>h.id===id),uid,owned:true,...extra});
function invariants(r){
  const p=r.best;if(!p)return;
  for(const q of p.slots)assert(q.peak<=q.capacity+.11,'GPU allocation exceeds capacity');
  for(const q of p.host)assert(q.peak<=q.available+.11,'Host allocation exceeds RAM');
  for(const q of r.requirements){const assigned=p.assignments.filter(a=>a.role===q.role).reduce((n,a)=>n+a.units,0),missing=p.missing.find(m=>m.role===q.role)?.unplaced||0;assert.equal(assigned+missing,q.units,'Requested units are accounted for');}
  assert.equal(p.high,p.devices.filter(d=>!d.owned).reduce((n,d)=>n+d.price[1],0));
  assert.equal(p.full,!p.missing.length&&!p.storageIssues.length&&p.facilityFit);
}
test('catalog has 26 workloads and 45 unique, sourced hardware profiles',()=>{
  assert.equal(C.usecases.length,26);assert.equal(C.hardware.length,45);
  assert.equal(new Set(C.hardware.map(h=>h.id)).size,45);
  for(const h of C.hardware){assert(h.price[0]>0&&h.price[1]>=h.price[0]);assert.equal(new URL(h.source).protocol,'https:');assert(['estimate','used-estimate','procurement-allowance','conflicting-listings','listed-plus-allowance','configured-estimate'].includes(h.priceKind),h.id+': '+h.priceKind);}
});
test('empty selection gives no fabricated recommendation',()=>assert.equal(rec({selected:[]}).best,null));
test('zero budget never invents a purchase',()=>{const r=rec();assert.equal(r.best.high,0);assert.equal(r.best.full,false);assert.equal(r.best.devices.length,0);});
test('owned CPU can run small native inference at zero acquisition cost',()=>{const r=rec({owned:[{id:'cpu'}],precision:'native'});assert(r.best.full);assert.equal(r.best.high,0);assert.match(r.best.assignments[0].note,/slow/);});
test('value mode chooses cheapest sufficient catalog system',()=>{const r=rec({budget:10000});assert.equal(r.best.high,1800);assert.equal(r.best.devices[0].id,'cpu');});
test('upper-price overrun is preserved in warnings',()=>{const r=rec({budget:700});assert.equal(r.best.budgetFit,false);assert(r.warnings.some(w=>w.includes('exceeds your budget')));});
test('storage gap remains incomplete and visible',()=>{const r=rec({owned:[{id:'5090',storage:0}]});assert.equal(r.best.full,false);assert.equal(r.best.storageIssues.length,1);assert(r.warnings.some(w=>w.startsWith('Storage gap')));});
test('native inference repeats full 16-bit total weights',()=>{for(const llm of [8,70,400])assert.equal(req({llm,precision:'native'})[0].math.weights,llm*2);});
test('request count changes replica demand, not one giant model',()=>{const a=req({users:1})[0],b=req({users:1000})[0];assert.equal(a.working,b.working);assert.equal(b.units,1000);});
test('larger contexts increase per-request cache',()=>assert(req({context:131072})[0].cachePerRequest>req({context:8192})[0].cachePerRequest));
test('training target changes training memory independently of inference',()=>{const a=req({selected:['finetune'],trainingSize:7})[0],b=req({selected:['finetune'],trainingSize:400})[0];assert(b.working>a.working*20);assert.equal(req({selected:['train'],trainingSize:70})[0].math.state,1260);});
test('full training is not silently converted into quantized inference',()=>assert.equal(req({selected:['train'],precision:'efficient'})[0].working,req({selected:['train'],precision:'native'})[0].working));
test('two separate consumer computers never pool memory',()=>{const r=rec({llm:32,precision:'native',expert:true,owned:[{id:'5090'},{id:'5090'}]});assert(!r.best.full);assert.equal(r.best.assignments.length,0);});
test('edited physical memory bounds vendor planning memory',()=>{const h=owned('dgx-b300','b',{memory:32});assert(E.capacity(h)<=32);const r=rec({llm:70,precision:'native',facility:'datacenter',owned:[{id:'dgx-b300',memory:32}]});assert(!r.best.full);});
test('unified memory cannot bypass host minimum',()=>{const r=rec({selected:['coding'],owned:[{id:'macbook64',ram:16,usable:14}]});assert(!r.best.full);});
test('host memory is shared once across cards',()=>{const r=rec({selected:['coding','video'],concurrency:'assistant',precision:'native',facility:'dedicated',owned:[{id:'quad-pro6000',ram:64}]});assert(!r.best.full);invariants(r);});
test('constraint-aware placement preserves valid Mac plus CUDA split',()=>{const r=rec({selected:['chat','three-d'],llm:32,precision:'native',level:'advanced',concurrency:'assistant',facility:'dedicated',owned:[{id:'pro6000'},{id:'macbook128'}]});assert(r.best.full);assert.equal(r.best.high,0);assert.equal(r.best.assignments.find(a=>a.role==='text').device,'owned-1');});
test('owned data-center server does not become a home fit',()=>{const r=rec({owned:[{id:'dgx-b200'}]});assert(!r.best.full);assert(r.warnings.some(w=>w.includes('infrastructure')));});
test('separate audio and image-edit models remain separate',()=>{const rr=req({selected:['transcribe','voice','audio-clean','image','image-edit'],concurrency:'resident'});assert.equal(rr.length,5);assert.equal(new Set(rr.map(r=>r.role)).size,5);});
test('concurrency adds active text cache even in all-loaded mode',()=>{
  const x=[{role:'text',working:12,resident:10},{role:'image',working:20,resident:15},{role:'video',working:30,resident:20}];
  assert.equal(E.loadPeak(x,'queued'),30);assert.equal(E.loadPeak(x,'assistant'),42);assert.equal(E.loadPeak(x,'resident'),57);
  assert.equal(E.loadPeak([{role:'text',working:12,resident:10},{role:'text',working:12,resident:10}],'resident'),24);
});
test('parallel media copies add working memory rather than overlap',()=>assert.equal(E.loadPeak([{role:'image',working:20,resident:15},{role:'image',working:20,resident:15}],'queued'),40));
test('exact synthetic serving arithmetic: nine servers for 1000 slots',()=>{
  const h={id:'test',uid:'test',class:'server',facility:'datacenter',backend:'cuda',gpus:4,ram:512,memory:64,usable:64,storage:10000,speed:5,price:[100000,100000],owned:false,power:2000};
  const r={role:'text',name:'Test LLM',working:37,resident:36,cachePerRequest:1,units:1000,ram:48,disk:100,ids:['chat'],warnings:[],shardable:true,math:{runtime:4}};
  const p=E.evaluate(Array.from({length:9},(_,i)=>({...h,uid:'node'+i})),[r],{...base,facility:'datacenter',budget:1000000,deployment:'service'});
  assert(p.full);assert.equal(p.devices.length,9);assert.equal(p.high,900000);assert.equal(p.serving.planned,1000);assert.equal(p.serving.replicas,36);
  const partial=E.evaluate(Array.from({length:8},(_,i)=>({...h,uid:'node'+i})),[r],{...base,facility:'datacenter',budget:800000,deployment:'service'});
  assert.equal(partial.serving.planned,896);assert.equal(partial.missing[0].unplaced,104);
});
test('exactly two new fleet nodes can supplement one owned node',()=>{
  const c={...C,hardware:C.hardware.filter(h=>h.id==='dgx-b300')};
  const r=rec({users:5000,concurrency:'resident',facility:'auto',deployment:'service',budget:200000,multiple:true,owned:[{id:'dgx-b300'}],prices:{'dgx-b300':[100000,100000]}},c);
  assert(r.best.full);assert.equal(r.best.high,200000);assert.equal(r.best.devices.length,3);invariants(r);
});
test('intermediate shard group sizes are considered',()=>{
  const s={...base,users:18,llm:70,precision:'native',concurrency:'resident',expert:true,deployment:'service',facility:'auto'};
  const p=E.evaluate([owned('eight-pro6000')],E.requirements(s,C),s);assert.equal(p.serving.planned,18);assert.deepEqual(p.assignments.map(a=>a.cards),[4,4]);
});
test('expert mode does not reduce the tested unsharded serving fit',()=>{
  const s={...base,users:1000,llm:70,precision:'native',concurrency:'resident',deployment:'service',facility:'auto'};
  const a=E.evaluate([owned('dgx-b300')],E.requirements(s,C),s),b=E.evaluate([owned('dgx-b300')],E.requirements(s,C),{...s,expert:true});assert(b.serving.planned>=a.serving.planned);
});
test('1000 native70B requests produce a server fleet, not a pair of Macs',()=>{
  const r=rec({users:1000,llm:70,precision:'native',concurrency:'resident',deployment:'service',facility:'auto',budget:5000000,multiple:true,expert:true});
  assert(r.best.full&&r.best.budgetFit);assert.equal(r.best.serving.planned,1000);assert(r.best.devices.length>2);assert(r.best.devices.every(d=>['server','rack','workstation'].includes(d.class)));invariants(r);
});
test('rack metadata keeps MI355X replicas inside an eight-GPU node',()=>{
  const s={...base,selected:['train'],trainingSize:400,facility:'datacenter',expert:true};
  const p=E.evaluate([owned('mi355x-rack')],E.requirements(s,C),s);assert(!p.full);assert(p.assignments.every(a=>a.cards<=8));
});
test('home constraints offer a separately labeled data-center comparison',()=>{
  const r=E.recommend({...base,users:1000,llm:8,deployment:'service',budget:1000000,multiple:true},C);assert(!r.best.full);assert(r.escalation);assert.equal(r.state.facility,'home');assert(r.escalation.plan.serving.planned>0);
});
test('large budget alone does not recommend an unnecessary rack',()=>{const r=rec({budget:5000000,facility:'auto',multiple:true});assert(r.best.high<5000);assert(r.best.devices.every(d=>!['server','rack'].includes(d.class)));});
test('manual quotes affect only the matching whole-system price',()=>{const r=rec({budget:7000,prices:{'5090':[6365,6365]},selected:['video'],multiple:false});assert(r.state.prices['5090']);assert.equal(r.state.prices['5090'][1],6365);});
test('invalid inputs are normalized and unknown IDs rejected',()=>{const s=E.normalize({budget:-1,users:999999,mediaWorkers:0,selected:['chat','chat','nope'],owned:[{id:'none'}],prices:{evil:[1,1]}},C);assert.equal(s.budget,0);assert.equal(s.users,10000);assert.equal(s.mediaWorkers,1);assert.deepEqual(s.selected,['chat']);assert.equal(s.owned.length,0);assert.deepEqual(s.prices,{});});
test('custom profile memory and matching GPU count survive normalization',()=>{const s=E.normalize({owned:[{id:'custom-cuda',memory:48,ram:256,gpus:2}]},C);assert.equal(s.owned[0].gpus,2);assert.equal(s.owned[0].memory,48);});
test('budget slider endpoints and monotonicity',()=>{assert.equal(E.budgetFromSlider(0),0);assert.equal(E.budgetFromSlider(1000),5000000);let previous=0;for(let i=0;i<=1000;i++){const n=E.budgetFromSlider(i);assert(n>=previous);previous=n;}});
test('bundled HTML has no external runtime assets and blocks network connections',()=>{
  const html=fs.readFileSync(require('node:path').join(__dirname,'../Compute Compass.html'),'utf8');
  assert(!/\/\* APP_/.test(html));assert(html.includes("connect-src 'none'"));assert(html.includes('worker-src blob:'));
  assert(!/<script[^>]+src=/i.test(html));assert(!/<link[^>]+href=["']https?:/i.test(html));
  for(const [,source] of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(source);
  for(const name of ['engine.js','app.js'])assert(!/\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(fs.readFileSync(require('node:path').join(__dirname,'../src',name),'utf8')));
});
test('deterministic recommendation output',()=>assert.deepEqual(rec({budget:10000,multiple:true}),rec({budget:10000,multiple:true})));
test('public planner drops legacy location and demand inputs everywhere',()=>{
  const input={selected:['chat'],budget:10000,facility:'home',users:10000,mediaWorkers:128};
  const a=E.plan(input,C),b=E.plan({...input,facility:'auto',users:1,mediaWorkers:1},C);
  assert.deepEqual(a,b);for(const key of ['facility','users','mediaWorkers'])assert(!(key in a.state));assert.equal(a.requirements[0].units,1);
});
test('research training failure is explicit and hides whole-workload capacity',()=>{
  const r=E.plan({selected:['chat','train','video'],llm:120,context:131072,trainingSize:400,level:'frontier',precision:'native',concurrency:'resident',budget:5000000,expert:false,wait:true},C);
  assert(!r.feasible);assert(!r.potential.available);assert(r.blockers.some(b=>b.role==='training'&&b.message.includes('multi-GPU')));
});
test('facility is derived for an owned rack, not restricted by stale home input',()=>{
  const r=E.plan({selected:['chat'],budget:0,owned:[{id:'gb200'}],facility:'home'},C);assert(r.feasible);assert.equal(r.best.facilityNeeded,'datacenter');
});
test('fixed Mac capacity does not switch architecture policy at 25 requests',()=>{
  const s=E.normalize({...base,precision:'native',facility:'auto',deployment:'auto'},C),rr=E.requirements(s,C),p=E.evaluate([{...owned('macbook128'),owned:false}],rr,s);
  const capacity=E.potentialCapacity(p,rr,s);assert.equal(capacity.rows[0].count,84);assert.equal(p.devices.length,1);
});
test('capacity probes retain other families and produce a feasible witness',()=>{
  const input={selected:['chat','image','video'],concurrency:'resident',budget:0,owned:[{id:'pro6000',ram:256}]},r=E.plan(input,C),before=JSON.stringify(r.best);
  assert(r.potential.available);
  for(const peak of r.potential.rows){const rr=r.requirements.map(q=>q.role===peak.role?{...q,units:peak.count}:q),p=E.evaluate(r.best.devices,rr,E.normalize({...r.state,facility:'auto'},C));assert(p.full);assert(p.devices.every(d=>r.best.devices.some(x=>x.uid===d.uid)));}
  assert.equal(JSON.stringify(r.best),before);assert.match(r.potential.scope,/cannot be added/);
});
test('capacity reaching the search ceiling is marked as a lower bound',()=>{
  const s=E.normalize({...base,selected:['voice'],facility:'auto',concurrency:'queued'},C),rr=E.requirements(s,C),p=E.evaluate([owned('gb200')],rr,s),potential=E.potentialCapacity(p,rr,s);
  assert.equal(potential.rows[0].count,128);assert(potential.rows[0].atSearchLimit);
});
test('storage and budget gaps cannot receive a successful public fit',()=>{
  const storage=E.plan({selected:['chat'],budget:0,owned:[{id:'5090',storage:0}]},C);assert(!storage.feasible);assert(!storage.potential.available);assert(storage.blockers.some(b=>b.kind==='storage'));
  const budget=E.plan({selected:['chat'],budget:700},C);assert(!budget.feasible);assert(budget.blockers.some(b=>b.kind==='budget'));
});
test('full-fit search proposes a budget change without mutating model settings',()=>{
  const input={selected:['chat'],budget:0,llm:32,context:32768,precision:'native',expert:false,offload:false,wait:false},before=JSON.stringify(input),r=E.findFullFit(input,C);
  assert.equal(r.status,'budget-change');assert(r.plan.full&&r.plan.budgetFit);assert(r.plan.high<=5000000);assert.equal(r.changes.length,1);assert.equal(r.changes[0].field,'budget');assert.equal(JSON.stringify(input),before);
});
test('full-fit search never silently enables distributed software',()=>{
  const r=E.findFullFit({selected:['train'],trainingSize:400,level:'frontier',budget:5000000,expert:false},C);assert.equal(r.status,'no-fit');assert.equal(r.plan,null);assert(r.blockers.some(b=>b.message.includes('multi-GPU')));
});
test('a full fit exceeding the catalog search ceiling is not a successful comparison',()=>{
  const h={...C.hardware.find(h=>h.id==='gb200'),price:[4000000,6000000]},c={...C,hardware:[h]};
  const r=E.findFullFit({selected:['train'],trainingSize:400,level:'frontier',budget:0,expert:true},c);assert.equal(r.status,'no-fit');assert.equal(r.plan,null);
});
test('public UI removes demand/location controls and exposes failure and comparison actions',()=>{
  const html=fs.readFileSync(require('node:path').join(__dirname,'../src/index.html'),'utf8'),app=fs.readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8');
  assert(!/id="(?:facility|users|mediaWorkers)"/.test(html));assert(app.includes('Not possible with the current constraints'));assert(app.includes('Find a full-fit configuration'));assert(app.includes('find_full_fit_configuration'));
  assert(app.includes("querySelectorAll('#requirement-fit tbody tr')"));assert(!app.includes("querySelectorAll('.fit-table tbody tr')"),'Baseline labels must not overwrite peak-capacity outputs');
});
