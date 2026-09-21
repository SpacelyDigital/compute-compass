(function (root) {
  'use strict';
  const levels = ['starter', 'advanced', 'frontier'];
  const facilities = ['home', 'dedicated', 'datacenter', 'auto'];
  const roleNames = { text:'Language model & tools', vision:'Vision / document model', image:'Image generation', imageEdit:'Image editing', video:'Video generation', transcription:'Speech transcription', voice:'Voice generation', stems:'Audio cleanup', music:'Music generation', threeD:'3D generation', restoration:'Restoration / upscaling', finetune:'Adapter fine-tuning', training:'Training from scratch' };
  const customHardware = [
    {id:'custom-cuda',name:'Other NVIDIA GPU computer',backend:'cuda',ram:64,memory:24,gpus:1},
    {id:'custom-rocm',name:'Other AMD GPU computer',backend:'rocm',ram:64,memory:24,gpus:1},
    {id:'custom-metal',name:'Other Apple Silicon Mac',backend:'metal',ram:64,memory:64,gpus:1,unified:true},
    {id:'custom-cpu',name:'Other CPU-only computer',backend:'cpu',ram:32,memory:0,gpus:0}
  ].map(h=>({...h,class:'custom',price:[0,0],priceKind:'owned',storage:1000,facility:'home',speed:1,power:0,availability:'user-configured',source:'',note:'User-entered existing hardware. Memory can be estimated, but the exact chip, driver and runtime are not validated. No performance ranking is available.',custom:true}));
  const defaults = { selected:['chat','coding','agents','image','video'], budget:10000, priority:'capacity', level:'starter', precision:'efficient', concurrency:'assistant', llm:8, trainingSize:7, context:8192, video:1080, users:1, mediaWorkers:1, deployment:'auto', facility:'auto', multiple:true, expert:false, offload:false, wait:false, owned:[],prices:{} };
  const clone = v => JSON.parse(JSON.stringify(v));
  const clamp = (v,a,b) => Math.max(a,Math.min(b,Number(v)||0));
  const round = n => Math.round(n*10)/10;
  const sum = a => a.reduce((x,y)=>x+y,0);
  const profile = (id,catalog) => [...catalog.hardware,...customHardware].find(h=>h.id===id);
  function normalize(input, catalog) {
    const s = { ...clone(defaults), ...(input && typeof input==='object' ? input : {}) };
    s.selected = [...new Set(Array.isArray(s.selected) ? s.selected : [])].filter(id=>catalog.usecases.some(c=>c.id===id));
    s.budget = Math.round(clamp(s.budget,0,5000000));
    for (const [k,vals] of Object.entries({priority:['capacity','balanced','speed','value'],level:levels,precision:['efficient','native'],concurrency:['queued','assistant','resident'],facility:facilities,deployment:['auto','personal','service']})) if(!vals.includes(s[k]))s[k]=defaults[k];
    for(const [k,vals] of Object.entries({llm:[8,32,70,120,400],trainingSize:[1,7,32,70,400],context:[8192,32768,131072],video:[720,1080,2160]})) if(!vals.includes(Number(s[k])))s[k]=defaults[k];else s[k]=Number(s[k]);
    s.users=Math.round(clamp(s.users,1,10000));s.mediaWorkers=Math.round(clamp(s.mediaWorkers,1,128));
    for(const k of ['multiple','expert','offload','wait'])s[k]=s[k]===true;
    s.owned = (Array.isArray(s.owned)?s.owned:[]).slice(0,8).filter(d=>d && profile(d.id,catalog)).map((d,i)=>{const h=profile(d.id,catalog),ram=Math.round(clamp(d.ram??h.ram,4,131072));return {id:d.id,uid:'owned-'+i,ram,memory:h.unified?ram:Math.round(clamp(d.memory??h.memory,0,4096)),storage:Math.round(clamp(d.storage??h.storage,0,1000000)),usable:round(clamp(d.usable||0,0,131072)),gpus:h.custom&&!h.unified&&h.backend!=='cpu'?Math.round(clamp(d.gpus??1,1,8)):h.gpus};});
    s.prices=Object.fromEntries(Object.entries(s.prices&&typeof s.prices==='object'?s.prices:{}).filter(([id,v])=>catalog.hardware.some(h=>h.id===id)&&Array.isArray(v)&&v.length===2&&v.every(n=>Number.isFinite(Number(n))&&Number(n)>0)).map(([id,v])=>[id,[Math.round(clamp(v[0],1,10000000)),Math.round(clamp(v[1],1,10000000))].sort((a,b)=>a-b)]));
    return s;
  }
  function requirements(state, catalog) {
    const s=normalize(state,catalog), li=levels.indexOf(s.level), cases=catalog.usecases.filter(c=>s.selected.includes(c.id)), map=new Map();
    for(const c of cases){
      let peak=(s.precision==='native'?c.native:c.working)[li];
      if(c.role==='video')peak*=s.video===720?.75:s.video===2160?1.5:1;
      const r=map.get(c.role)||{role:c.role,name:roleNames[c.role],working:0,resident:0,ram:0,disk:0,ids:[],warnings:[],synthetic:false};
      r.working=Math.max(r.working,peak);r.ram=Math.max(r.ram,c.ram);r.disk=Math.max(r.disk,c.disk*(li===0?1:li===1?2:4)*(s.precision==='native'?1.8:1));r.ids.push(c.id);if(c.warning)r.warnings.push(c.warning);map.set(c.role,r);
    }
    if(cases.length && s.concurrency==='assistant' && !map.has('text'))map.set('text',{role:'text',name:'Persistent local coordinator',working:0,resident:0,ram:16,disk:30,ids:[],warnings:[],synthetic:true});
    for(const r of map.values()){
      if(r.role==='text'){
        const weights=s.llm*(s.precision==='native'?2:.5625);
        const cacheBase={8:1,32:2.5,70:4,120:6,400:10}[s.llm];
        const concurrentCache=cacheBase*(s.context/8192);
        const runtime=Math.max(2,s.llm*.04), extras=(r.ids.includes('rag')?4:0)+(r.ids.includes('agents')?2:0)+(r.ids.includes('research')?2:0);
        r.working=weights+concurrentCache+runtime+extras;r.resident=weights+runtime+extras;
        r.math={parameters:s.llm,bits:s.precision==='native'?16:4.5,weights:round(weights),cache:round(concurrentCache),runtime:round(runtime+extras)};
        r.cachePerRequest=concurrentCache;r.units=s.users;
        r.disk=Math.max(r.disk,weights*1.3+30);
        r.warnings.push('Language memory is arithmetic with an illustrative KV-cache allowance, not a measured model benchmark. Architecture, cache compression and serving configuration can change it substantially.');
      }else if(['finetune','training'].includes(r.role)){
        const n=s.trainingSize,activation=n*(li===0?.8:li===1?2:4)+4;
        if(r.role==='finetune'){
          const weights=n*(s.precision==='native'?2:.5625),adapter=n*.3;
          r.resident=weights+adapter+2;r.working=r.resident+activation;
          r.math={kind:'adapter',parameters:n,bits:s.precision==='native'?16:4.5,weights:round(weights),adapter:round(adapter),activation:round(activation),runtime:2};
        }else{
          r.resident=n*18;r.working=r.resident+activation;
          r.math={kind:'training',parameters:n,bytes:18,state:round(r.resident),activation:round(activation)};
        }
        r.disk=Math.max(r.disk,n*(r.role==='training'?40:4)+100);
        r.warnings.push('Training estimates assume a transformer, checkpointing and a small batch. Architecture, sequence length, optimizer, adapter rank and batch size must be benchmarked; this is not a training-time estimate.');
      }else r.resident=r.working*.72;
      r.working=Math.ceil(r.working);r.resident=Math.ceil(r.resident);r.disk=Math.ceil(r.disk);r.ram=Math.max(r.ram,li===2?64:16);
      r.units=r.units||(['image','imageEdit','video','music','voice','transcription','stems','restoration','threeD'].includes(r.role)?s.mediaWorkers:1);
      r.shardable=['text','training','finetune'].includes(r.role);
    }
    return [...map.values()].sort((a,b)=>b.working-a.working);
  }
  function budgetFromSlider(v){return Math.round((Math.exp(clamp(v,0,1000)/1000*Math.log(5000001))-1)/100)*100;}
  function sliderFromBudget(v){return Math.round(Math.log(clamp(v,0,5000000)+1)/Math.log(5000001)*1000);}
  function capacity(h){
    const physical=h.backend==='cpu'?h.ram:h.unified?Math.min(h.memory,h.ram):Math.min(h.memory,h.planningMemory??h.memory);
    if(h.usable>0)return Math.max(0,Math.min(physical,h.usable));
    return round(Math.max(0,physical-(h.backend==='cpu'?Math.max(6,physical*.15):h.unified?Math.max(12,physical*.2):Math.max(2,physical*.08))));
  }
  function loadPeak(items,mode){
    if(!items.length)return 0;
    const roles=[...new Set(items.map(r=>r.role))],active=role=>sum(items.filter(r=>r.role===role).map(r=>r.working));
    if(mode==='queued')return Math.max(...roles.map(active));
    if(mode==='resident')return sum(items.map(r=>r.resident))+sum(items.filter(r=>r.role==='text').map(r=>Math.max(0,r.working-r.resident)))+Math.max(0,...roles.filter(role=>role!=='text').map(role=>sum(items.filter(r=>r.role===role).map(r=>Math.max(0,r.working-r.resident)))));
    return active('text')+Math.max(0,...roles.filter(role=>role!=='text').map(active));
  }
  function managedService(s){return s.deployment==='service'||s.deployment==='auto'&&s.users>=25;}
  function compatibility(h,r,s){
    if(r.role==='text'&&managedService(s)&&!h.owned&&!['server','rack'].includes(h.class)&&!(h.class==='workstation'&&h.gpus>=2))return {ok:false,risk:0,note:'Managed-service policy targets new server-class nodes or multi-GPU professional workstations. Owned devices can still contribute. Switch deployment to personal/experimental to explore new consumer fleets; this is an operational policy, not a chip limit.'};
    if(h.backend==='cpu')return ['text','transcription','voice','stems'].includes(r.role)?{ok:true,risk:2,note:'CPU execution can be slow; no latency promise. Verify a CPU-supported model.'}:{ok:false,risk:9,note:'This planner does not recommend CPU-only execution for this workload.'};
    if(h.custom)return {ok:r.role!=='threeD'||h.backend==='cuda'||s.expert,risk:4,note:'Custom chip: verify the exact GPU, driver, runtime and model. Capacity alone does not establish support or speed.'};
    if(h.backend==='cuda')return {ok:true,risk:h.arm?1:0,note:h.arm?'Check Linux Arm packages and custom-node builds.':'Check the exact model, driver and CUDA runtime.'};
    if(r.role==='threeD' || (r.role==='training'&&r.ids.includes('train')))return {ok:s.expert,risk:5,note:'Specific trainer / 3D port required; not certified by the backend label.'};
    if(['video','music','image','imageEdit','restoration'].includes(r.role))return {ok:true,risk:h.backend==='metal'?2:3,note:h.backend==='metal'?'A specifically supported Metal/MPS pipeline is required. CUDA-only nodes cannot run unchanged.':'A specifically supported ROCm pipeline is required. Review known issues; CUDA extensions cannot run unchanged.'};
    return {ok:true,risk:1,note:h.backend==='metal'?'Choose a supported MLX/Metal model and runtime.':'Verify exact GPU, OS and ROCm/HIP support.'};
  }
  function isEligible(h,s){
    if(facilities.indexOf(h.facility)>facilities.indexOf(s.facility))return false;
    if(!s.wait && ['preorder','announced','out-of-stock'].includes(h.availability))return false;
    if(h.price[0]>s.budget)return false;
    return true;
  }
  function hostPeak(items,s){
    const host=items.map(r=>({...r,working:Math.max(r.ram-16,r.offload?r.originalWorking:0),resident:Math.max(r.ram-16,r.offload?r.originalResident:0)}));
    return items.length?16+loadPeak(host,s.concurrency):0;
  }
  function evaluateOrdered(devices,reqs,s){
    const slots=[];
    for(const d of devices)for(let k=0;k<Math.max(1,d.gpus);k++)slots.push({device:d,card:k,domain:Math.floor(k/(d.gpusPerDomain||Math.max(1,d.gpus))),cap:capacity(d),items:[],reserved:false});
    const hostKey=q=>q.device.uid+':'+q.domain;
    const hostItems=new Map(slots.map(q=>[hostKey(q),[]]));
    const hostAvailable=h=>h.ram/(h.gpusPerDomain?Math.ceil(h.gpus/h.gpusPerDomain):1);
    const assignments=[],missing=[];
    for(const r of reqs){
      let remaining=r.units||1,replica=0;
      while(remaining>0){
      let options=[];
      for(let i=0;i<slots.length;i++){
        const slot=slots[i],h=slot.device,compat=compatibility(h,r,s);
        if(slot.reserved||!compat.ok)continue;
        if(r.role==='text'&&slot.items.some(t=>t.role==='text'))continue;
        let portion=1,record={...r};
        if(r.role==='text'){
          let lo=0,hi=remaining;
          while(lo<hi){const mid=Math.ceil((lo+hi)/2),trial={...r,working:r.resident+r.cachePerRequest*mid};if(loadPeak([...slot.items,trial],s.concurrency)<=slot.cap)lo=mid;else hi=mid-1;}
          portion=lo;record={...r,working:r.resident+r.cachePerRequest*Math.max(1,portion)};
        }
        if(hostAvailable(h)<hostPeak([...hostItems.get(hostKey(slot)),record],s))continue;
        const normal=loadPeak([...slot.items,record],s.concurrency);
        if(normal<=slot.cap){
          const separate=s.concurrency==='assistant' && ((r.role==='text'&&slot.items.some(t=>t.role!=='text'))||(r.role!=='text'&&slot.items.some(t=>t.role==='text')));
          const score=compat.risk*8 + normal/Math.max(1,slot.cap)*5 + (separate?5:0) + (h.owned?0:1) - h.speed*.15-portion*10;
          options.push({index:i,score,compat,mode:'resident',allocated:record.working,load:normal,record,units:Math.max(1,portion)});
        }else if(s.offload&&!h.unified&&h.backend==='cuda'&&!['training','finetune','threeD'].includes(r.role)){
          const slice=Math.max(8,Math.min(24,r.working*.25));
          const off={...r,working:slice,resident:Math.min(slice,r.resident),offload:true,originalWorking:r.working,originalResident:r.resident};
          const newLoad=loadPeak([...slot.items,off],s.concurrency);
          const hostNeed=hostPeak([...hostItems.get(hostKey(slot)),off],s);
          if(newLoad<=slot.cap && hostNeed<=hostAvailable(h))options.push({index:i,score:40+compat.risk*8+newLoad/slot.cap,compat,mode:'offload',allocated:slice,load:newLoad,record:off,hostNeed,units:1});
        }
      }
      if(s.expert&&r.shardable){
        for(const h of devices.filter(d=>d.gpus>1)){
          for(let domain=0;domain<Math.ceil(h.gpus/(h.gpusPerDomain||h.gpus));domain++){
          const indexes=slots.map((q,i)=>q.device.uid===h.uid&&q.domain===domain&&!q.reserved&&q.items.length===0?i:-1).filter(i=>i>=0);
          const compat=compatibility(h,r,s), per=capacity(h)*.85;
          const runtime=r.math?.runtime||0,weights=r.role==='text'?r.resident-runtime:0;
          const minCards=Math.max(2,r.role==='text'?Math.ceil(weights/Math.max(.01,per-runtime-r.cachePerRequest)):Math.ceil(r.working/Math.max(1,per)));
          for(let need=minCards;need<=indexes.length;need++){
            const units=r.role==='text'?Math.min(remaining,Math.floor((per-weights/need-runtime)/r.cachePerRequest)):1;
            const rec=r.role==='text'?{...r,resident:weights+runtime*need,working:weights+(runtime+r.cachePerRequest*units)*need}:r;
            if(compat.ok&&units>0&&need>=2&&need<=indexes.length&&rec.working<=need*per&&hostAvailable(h)>=hostPeak([...hostItems.get(h.uid+':'+domain),rec],s))options.push({index:indexes[0],indices:indexes.slice(0,need),score:25+compat.risk*8-units*10/need,compat,mode:'sharded',allocated:rec.working,load:rec.working,record:rec,units});
          }
          }
        }
      }
      options.sort((a,b)=>a.score-b.score||a.index-b.index);
      const best=options[0];
      if(!best){missing.push({...r,unplaced:remaining});break;}
      const slot=slots[best.index];
      hostItems.get(hostKey(slot)).push(best.record);
      if(best.indices)for(const i of best.indices){slots[i].reserved=true;slots[i].items.push({...best.record,working:best.record.working/best.indices.length,resident:best.record.resident/best.indices.length});}
      else slot.items.push(best.record);
      assignments.push({id:r.role+':'+replica++,role:r.role,device:slot.device.uid,card:slot.card,mode:best.mode,allocated:round(best.allocated),need:best.record.working,cards:best.indices?.length||1,units:best.units||1,risk:best.compat.risk,note:best.compat.note,hostNeed:best.hostNeed||0});
      remaining-=best.units||1;
      }
    }
    const usedIds=new Set(assignments.map(a=>a.device));
    const used=devices.filter(d=>usedIds.has(d.uid));
    const purchases=used.filter(d=>!d.owned);
    const low=sum(purchases.map(d=>d.price[0])), high=sum(purchases.map(d=>d.price[1]));
    const unassignedCount=missing.length;
    const workloadCovered=reqs.reduce((n,r)=>n+Math.max(1,r.ids.length)*(1-(missing.find(m=>m.role===r.role)?.unplaced||0)/(r.units||1)),0);
    const risk=assignments.length?sum(assignments.map(a=>a.risk))/assignments.length:0, offloads=assignments.filter(a=>a.mode==='offload').length, shard=assignments.filter(a=>a.mode==='sharded').length;
    const usedSlots=slots.filter(q=>q.items.length);
    const margins=usedSlots.map(q=>1-loadPeak(q.items,s.concurrency)/Math.max(1,q.cap));
    const headroom=margins.length?sum(margins.map(m=>Math.min(.35,Math.max(0,m))))/margins.length:0;
    const perf=assignments.length?sum(assignments.map(a=>devices.find(d=>d.uid===a.device).speed*(a.mode==='offload'?.25:1)))/assignments.length:0;
    const hasSeparate=s.concurrency==='assistant'&&assignments.some(a=>a.role==='text'&&assignments.some(b=>b.role!=='text'&&b.device!==a.device));
    const storageIssues=used.map(d=>({device:d.uid,needed:50+sum(reqs.filter(r=>assignments.some(a=>a.role===r.role&&a.device===d.uid)).map(r=>r.disk)),available:d.storage})).filter(x=>x.needed>x.available);
    const costPenalty=Math.log10(1+high/500)*(s.priority==='value'?65:s.priority==='speed'?12:32);
    const power=sum(used.map(d=>d.power||0));
    const facilityNeeded=facilities[Math.max(used.length>=8||power>10000?2:used.length>=3||power>2000?1:0,...used.map(d=>facilities.indexOf(d.facility)))];
    const facilityFit=facilities.indexOf(facilityNeeded)<=facilities.indexOf(s.facility);
    const score=workloadCovered*1000-unassignedCount*10000-risk*4-(offloads?60:0)-(shard?12:0)+headroom*(s.priority==='capacity'?65:25)+perf*(s.priority==='speed'?6:.3)+(hasSeparate?6:0)-costPenalty-purchases.length*.75-storageIssues.length*50-(high>s.budget?150:0)-(facilityFit?0:100000);
    const serving={requested:reqs.find(r=>r.role==='text')?.units||0,planned:sum(assignments.filter(a=>a.role==='text').map(a=>a.units)),replicas:assignments.filter(a=>a.role==='text').length,mediaRequested:sum(reqs.filter(r=>!['text','training','finetune','vision'].includes(r.role)).map(r=>r.units)),mediaPlanned:sum(assignments.filter(a=>!['text','training','finetune','vision'].includes(a.role)).map(a=>a.units))};
    return {devices:used,assignments,missing,low,high,score,headroom,perf,offloads,shard,storageIssues,hasSeparate,serving,facilityNeeded,facilityFit,host:used.map(d=>({device:d.uid,peak:sum([...hostItems].filter(([k])=>k.startsWith(d.uid+':')).map(([,items])=>hostPeak(items,s))),available:d.ram})),slots:usedSlots.map(q=>({device:q.device.uid,card:q.card,capacity:q.cap,peak:round(loadPeak(q.items,s.concurrency)),roles:q.items.map(r=>r.role)})),full:missing.length===0&&storageIssues.length===0&&facilityFit,budgetFit:high<=s.budget,quoteRequired:purchases.some(d=>['procurement-allowance','conflicting-listings'].includes(d.priceKind)),power};
  }
  function comparePlans(a,b){return Number(b.full&&b.budgetFit)-Number(a.full&&a.budgetFit)||b.score-a.score||a.high-b.high;}
  function evaluate(devices,reqs,s){
    const allowed=devices.filter(d=>facilities.indexOf(d.facility)<=facilities.indexOf(s.facility));
    const count=r=>allowed.filter(d=>compatibility(d,r,s).ok&&d.ram>=r.ram&&(capacity(d)>=r.working||s.offload||s.expert&&r.shardable&&d.gpus>1)).length;
    const constrained=[...reqs].sort((a,b)=>count(a)-count(b)||b.working-a.working);
    const orders=[constrained,reqs,[...reqs].reverse()],seen=new Set();
    return orders.filter(order=>{const key=order.map(r=>r.role).join('|');if(seen.has(key))return false;seen.add(key);return true;}).map(order=>evaluateOrdered(allowed,order,s)).sort(comparePlans)[0];
  }
  function recommend(input,catalog,options={}){
    const state=normalize(input,catalog),reqs=requirements(state,catalog);
    if(!reqs.length)return {state,requirements:[],best:null,alternatives:[],warnings:[],candidates:0};
    const owned=state.owned.map((d,i)=>({...profile(d.id,catalog),...d,uid:'owned-'+i,owned:true}));
    const eligible=catalog.hardware.map(h=>state.prices[h.id]?{...h,price:state.prices[h.id],priceKind:'user-quote'}:h).filter(h=>isEligible(h,state)&&reqs.some(r=>compatibility(h,r,state).ok&&h.ram>=r.ram&&(capacity(h)>=r.working||state.offload||state.expert&&r.shardable&&h.gpus>1)));
    const plans=[];
    const signatures=new Set();
    const add=list=>{
      if(list.length>128||sum(list.map(h=>h.price[0]))>state.budget)return null;
      const signature=list.map(h=>h.id).sort().join('|');if(signatures.has(signature))return null;signatures.add(signature);
      const p=evaluate([...owned,...list.map((h,i)=>({...h,uid:'new-'+i,owned:false}))],reqs,state);plans.push(p);return p;
    };
    const existing=add([]),single=new Map();
    for(const h of eligible)single.set(h.id,add([h]));
    if(state.multiple&&!(reqs.length===1&&reqs[0].units>1))for(let i=0;i<eligible.length;i++)for(let j=i;j<eligible.length;j++)if(eligible[i].price[0]+eligible[j].price[0]<=state.budget)add([eligible[i],eligible[j]]);
    if(state.multiple){
      // Homogeneous fleets. Size from admitted units, not an arbitrary two-machine cap.
      for(const h of eligible){
        const one=single.get(h.id);if(!one)continue;
        const perRole=r=>sum(one.assignments.filter(a=>a.role===r.role).map(a=>a.units))-sum(existing.assignments.filter(a=>a.role===r.role).map(a=>a.units));
        const counts=reqs.filter(r=>perRole(r)>0).map(r=>Math.ceil(Math.max(0,r.units-sum(existing.assignments.filter(a=>a.role===r.role).map(a=>a.units)))/perRole(r)));
        const needed=Math.max(1,...counts),affordable=Math.min(128,Math.floor(state.budget/h.price[1]));
        for(const n of new Set([needed,needed+1,Math.min(needed,affordable)]))if(n>=2&&n<=128)add(Array(n).fill(h));
      }
      // Dedicated family packages let inference replicas and media workers use different nodes.
      const packages=reqs.map(r=>eligible.map(h=>{
        const unit=evaluate([{...h,uid:'unit',owned:false}],[r],{...state,facility:'auto'});
        const covered=sum(unit.assignments.map(a=>a.units));if(!covered)return null;
        const n=Math.ceil(r.units/covered);if(n>128||n*h.price[0]>state.budget)return null;
        return {h,n,cost:n*h.price[1],risk:unit.assignments[0]?.risk||0,offload:unit.offloads>0};
      }).filter(Boolean));
      for(const variant of ['value','compatibility','headroom']){
        const list=[];
        for(const group of packages){
          const sorted=[...group].sort((a,b)=>{
            if(a.offload!==b.offload)return Number(a.offload)-Number(b.offload);
            if(variant==='compatibility'&&a.risk!==b.risk)return a.risk-b.risk;
            if(variant==='headroom')return a.cost/(Math.min(1.5,capacity(a.h)/32)) - b.cost/(Math.min(1.5,capacity(b.h)/32));
            return a.cost-b.cost;
          });
          const pick=sorted.find(x=>list.length+x.n<=128&&sum(list.map(h=>h.price[0]))+x.n*x.h.price[0]<=state.budget);
          if(pick)list.push(...Array(pick.n).fill(pick.h));
        }
        if(list.length)add(list);
      }
    }
    plans.sort((a,b)=>{
      if(state.priority==='value'&&a.full&&b.full&&a.budgetFit&&b.budgetFit)return a.high-b.high||comparePlans(a,b);
      return comparePlans(a,b);
    });
    const keys=new Set(),unique=[];
    for(const p of plans){const key=p.devices.map(d=>d.id+(d.owned?'owned':'new')).sort().join('|')+'::'+p.assignments.map(a=>a.role+':'+a.mode).sort().join('|');if(!keys.has(key)){keys.add(key);unique.push(p);}}
    const best=unique[0];
    const warnings=[];
    if(state.precision==='native')warnings.push('The 16-bit weight target does not guarantee better-looking media or correct answers. Published original weights can use other precisions. Verify each actual component.');
    if(state.video===2160&&state.selected.includes('video'))warnings.push('4K here means a delivery workflow that may generate smaller frames and upscale. It is not a promise of native 4K video inference.');
    if(state.concurrency==='resident')warnings.push('Residency mode adds all resident weights and all admitted LLM caches, plus the largest concurrent media-family workspace. Different media families take turns.');
    if(state.users>1)warnings.push('Active LLM requests are spread across model replicas. Each copy repeats its own weights and admits its own context cache. These are memory-admission slots, not a guarantee of token speed, response latency or requests per second.');
    if(state.mediaWorkers>1)warnings.push('Each media family has '+state.mediaWorkers+' concurrent worker copies. Different media families take turns unless placed on separate devices. Completion time is unmeasured.');
    if(managedService(state))warnings.push('Managed-service architecture: new LLM replicas target server nodes or multi-GPU professional workstations. This favors service operations over consumer fleets; change deployment to personal/experimental if that restriction is not appropriate. Load balancing, monitoring, failover and shared storage are extra design work and costs.');
    if(best?.offloads)warnings.push('Offload is a conditional software path, not a proven recipe. It can be dramatically slower and needs a runtime-specific memory test.');
    if(best?.shard)warnings.push('Sharded tasks require a distributed runtime that supports the exact model. Devices do not automatically form one memory pool.');
    if(best?.shard)warnings.push('Sharded LLM estimates repeat runtime and full per-request KV cache on each GPU. Cache partitioning requires a supported recipe. Sharding stays within the declared GPU fabric: one server, or the NVL72 rack domain. Separate systems and separate MI355X rack nodes are not combined.');
    if(best?.quoteRequired)warnings.push('Enterprise allowances and conflicting retail listings require a delivered, configured quote. Budget fit is provisional.');
    if(!best?.budgetFit)warnings.push('The upper new-hardware estimate exceeds your budget by $'+Math.max(0,best.high-state.budget).toLocaleString('en-US')+'. This is not an approved purchase budget.');
    for(const x of best?.storageIssues||[])warnings.push('Storage gap: '+best.devices.find(d=>d.uid===x.device).name+' needs approximately '+Math.ceil(x.needed)+'GB free SSD space; '+x.available+'GB is configured. Extra storage cost is not included.');
    for(const d of owned.filter(d=>facilities.indexOf(d.facility)>facilities.indexOf(state.facility)))warnings.push(d.name+' is already owned but excluded from placement: it requires '+d.facility+' infrastructure. Confirm power, cooling and facilities.');
    if(best&&!best.facilityFit)warnings.push('The selected fleet requires '+best.facilityNeeded+' infrastructure under the planner’s conservative size/power rules. It does not fit the selected location.');
    if(state.priority==='speed')warnings.push('Throughput preference uses a rough, authored hardware-class ranking, not measured timings for your model. Benchmark finalists; memory bandwidth alone cannot predict video generation time.');
    if(state.concurrency==='resident')warnings.push('Text tasks share one chosen LLM, and OCR / visual understanding share one compatible vision model. Other model families are counted separately. Select a measured recipe if your tasks need multiple LLMs or vision models.');
    for(const r of reqs)warnings.push(...r.warnings.filter(w=>!w.startsWith('Language memory')));
    let escalation=null;
    if(options.escalate!==false&&best&&!best.full&&facilities.indexOf(state.facility)<2&&state.budget>=30000){
      const expanded=recommend({...state,facility:'datacenter' },catalog,{escalate:false});
      if(expanded.best&&(expanded.best.full||expanded.best.serving.planned>best.serving.planned||expanded.best.missing.length<best.missing.length))escalation={plan:expanded.best,facility:'datacenter',candidates:expanded.candidates};
    }
    return {state,requirements:reqs,best,alternatives:unique.filter(p=>p!==best&&p.devices.length&&p.missing.length<=best.missing.length+1).slice(0,3),warnings:[...new Set(warnings)],candidates:plans.length,eligible:eligible.length,escalation,managedService:managedService(state)};
  }
  // Public planner choices deliberately omit the old demand and location gates.
  // Low-level allocation still accepts demand counts for fixed-hardware probes.
  function plannerState(input,catalog){
    const s=normalize(input,catalog);
    delete s.users;delete s.mediaWorkers;delete s.facility;
    return s;
  }
  function plannerInput(input,catalog){return {...plannerState(input,catalog),users:1,mediaWorkers:1,facility:'auto'};}
  function blockers(result,catalog){
    const p=result.best;if(!p)return [];
    const s=plannerInput(result.state,catalog),out=[];
    if(!p.budgetFit)out.push({kind:'budget',message:'Budget: the upper hardware estimate is $'+p.high.toLocaleString('en-US')+', which is $'+(p.high-s.budget).toLocaleString('en-US')+' above your limit.'});
    for(const gap of p.storageIssues){const d=p.devices.find(d=>d.uid===gap.device);out.push({kind:'storage',message:d.name+': approximately '+Math.ceil(gap.needed)+'GB free SSD space is needed; only '+gap.available+'GB is configured.'});}
    for(const r of p.missing){
      const available=catalog.hardware.filter(h=>s.wait||!['preorder','announced','out-of-stock'].includes(h.availability));
      const isolated=available.map(h=>evaluate([{...h,price:s.prices[h.id]||h.price,uid:'probe',owned:false}],[{...r,units:1}],s)).filter(x=>x.full);
      let message;
      if(isolated.length){
        const cheapest=isolated.sort((a,b)=>a.high-b.high)[0];
        message=cheapest.high>s.budget?'A catalog machine that fits this workload alone has an upper estimate of $'+cheapest.high.toLocaleString('en-US')+', above your budget.':!s.multiple?'No complete combined placement was found with only one new machine allowed. Enable multiple machines or reduce the combined workload.':'It can fit alone, but no complete combined placement was found under the budget, memory, storage and runtime settings. More budget or less simultaneous residency may help.';
      }else if(r.shardable&&!s.expert&&available.some(h=>h.gpus>1&&compatibility(h,r,{...s,expert:true}).ok&&evaluate([{...h,uid:'probe',owned:false}],[{...r,units:1}],{...s,expert:true}).full)){
        message='This workload needs a supported multi-GPU setup in this catalog. “Split one model across GPUs” is off. Separate Macs do not combine their memory.';
      }else message='No single catalog placement meets its '+r.working+'GB active-memory estimate, '+r.ram+'GB host-RAM floor and initial storage needs with the allowed software paths and availability. Reduce model size/context or change the allowed software paths; a larger budget alone may not solve it.';
      out.push({kind:'workload',role:r.role,message:r.name+': '+message});
    }
    return out;
  }
  function potentialCapacity(p,reqs,input){
    if(!p?.full)return {available:false,reason:'No capacity estimate for the full workload until all selected families and initial storage fit.',rows:[]};
    // Freeze the selected architecture. Adding request slots must not change the purchase policy.
    const s={...input,facility:'auto',users:1,mediaWorkers:1,deployment:input.deployment==='service'?'service':'personal'};
    const rows=reqs.filter(r=>!['training','finetune','vision'].includes(r.role)).map(r=>{
      const limit=r.role==='text'?10000:128;
      const fit=n=>evaluate(p.devices,reqs.map(q=>q.role===r.role?{...q,units:n}:q),s);
      let lo=1,hi=limit,best=fit(1);
      while(lo<hi){const mid=Math.ceil((lo+hi)/2),trial=fit(mid);if(trial.full){lo=mid;best=trial;}else hi=mid-1;}
      return {role:r.role,name:r.name,count:lo,atSearchLimit:lo===limit,limit,replicas:best.assignments.filter(a=>a.role===r.role).length};
    });
    return {available:true,rows,scope:'Each row grows one workload on the same hardware while the other selected workloads keep their baseline allocation. These separate ceilings cannot be added together. Placement may change. Counts are memory estimates, not measured speed or a guaranteed mathematical maximum.'};
  }
  function plan(input,catalog){
    const s=plannerInput(input,catalog),result=recommend(s,catalog,{escalate:false});
    result.state=plannerState(s,catalog);result.blockers=blockers(result,catalog);
    result.feasible=!!result.best?.full&&result.best.budgetFit;
    result.potential=potentialCapacity(result.best,result.requirements,s);
    return result;
  }
  function findFullFit(input,catalog){
    const original=plannerInput(input,catalog);
    // This is a comparison only. Preserve model size, precision, context and software choices.
    const within=recommend(original,catalog,{escalate:false});
    if(within.best?.full&&within.best.budgetFit)return {status:'within-budget',plan:within.best,changes:[],originalBudget:original.budget,searchCeiling:original.budget};
    const expanded=recommend({...original,budget:5000000,priority:'value'},catalog,{escalate:false});
    if(expanded.best?.full&&expanded.best.budgetFit)return {status:'budget-change',plan:expanded.best,changes:[{field:'budget',from:original.budget,to:expanded.best.high}],originalBudget:original.budget,searchCeiling:5000000};
    const diagnostic={...expanded,state:plannerState(original,catalog)};
    return {status:'no-fit',plan:null,changes:[],originalBudget:original.budget,searchCeiling:5000000,blockers:blockers(diagnostic,catalog)};
  }
  const api={defaults,normalize,plannerState,plan,findFullFit,potentialCapacity,requirements,recommend,capacity,loadPeak,hostPeak,compatibility,budgetFromSlider,sliderFromBudget,roleNames,evaluate,profile,customHardware};
  root.HardwareAdvisor=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
