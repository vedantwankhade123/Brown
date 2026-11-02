const assert=require('node:assert/strict');
const geometry=require('../src/renderer/geometry-diagrams');
const planner=require('../src/renderer/visual-planner');
const pipeline=require('../src/renderer/request-pipeline');
(async()=>{
 const request='can u explain with a diagram to me how to find the radius of a circle';
 assert.equal(planner.plan(request).family,'geometry');
 assert.equal(planner.plan('Draw a flowchart for calculating a circle radius').family,'flowchart');
 assert.equal(planner.plan('A bar chart of circle sales').family,'chart');
 assert.equal(planner.plan('Draw a sphere with its radius').family,'artifact');
 let calls=0;
 for(const shape of geometry.shapes){
  const selected=planner.plan('Explain with a diagram a '+shape);
  const spec=geometry.supplied(request,selected);
  assert.deepEqual(planner.validate(spec,selected),[]);
  const answer=await planner.generate({request:'Explain with a diagram a '+shape,selection:selected,generate:async()=>{calls++;throw Error('No model needed for symbolic construction');}});
  assert(answer.includes('```geometry'));
  const rendered=geometry.render(JSON.parse(answer.match(/```geometry\n([\s\S]*?)```/)[1]));
  assert(rendered.includes('<svg')&&rendered.includes('not to scale'));
 }
 assert.equal(calls,0);
 const answer=await planner.generate({request,generate:async()=>{throw Error('No diagram model call expected');}});
 assert(answer.includes('\\frac{d}{2}')&&answer.includes('\\sqrt'));
 assert(!answer.includes('decision')&&!answer.includes('flowchart'));
 const spec=geometry.supplied(request,planner.plan(request));
 assert(geometry.validate({...spec,shape:'sphere'}).length);
 assert(geometry.validate({...spec,shape:'rectangle'},{shape:'circle'}).length);
 assert(!geometry.render({...spec,title:'<script>alert(1)</script>',labels:{radius:'<img onerror=x>'}}).includes('<script>'));
 assert.equal(geometry.supplied('Circle radius with diameter 10 cm',{shape:'circle'}),null,'numeric problems stay on the supplied-data model path');
 const cap=pipeline.registry().find(item=>item.id==='geometry');assert(cap.visual);
 assert.deepEqual(pipeline.validateAnswer(answer,{visual:true,capability:'geometry',visualSelection:{family:'geometry',shape:'circle'},deliverables:['geometry']}),[]);
 console.log('PASS: geometry routing, symbolic shape construction without model calls, radius formulas, safe SVG, shape validation and explicit flowchart/chart preservation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
