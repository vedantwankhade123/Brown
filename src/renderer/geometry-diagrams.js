(function(root){
  'use strict';
  const shapes=['circle','triangle','rectangle'];
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function select(request){
    const p=String(request||'');
    // A deliberately requested process diagram remains a process diagram.
    if(/\b(?:flowchart|flow chart|tree|hierarchy|algorithm|pipeline|sequence|architecture|chart|plot)\b/i.test(p))return null;
    if(/\b(?:sphere|cone|cylinder|cube|cuboid)\b/i.test(p))return {family:'unsupported'};
    const shape=/\bcircles?\b/i.test(p)?'circle':/\btriangles?\b/i.test(p)?'triangle':/\brectangles?\b/i.test(p)?'rectangle':null;
    if(shape)return {family:'geometry',shape};
    if(/\b(?:geometr(?:y|ic)|radii|radius|diameter|circumference|polygon|angles?|sphere|cone|cylinder)\b/i.test(p))return {family:'unsupported'};
    return null;
  }
  function validate(spec,selected={}){
    const errors=[];
    if(!spec||spec.family!=='geometry'||!shapes.includes(spec.shape))return ['Choose a supported geometric construction: circle, triangle or rectangle.'];
    if(selected.shape&&spec.shape!==selected.shape)errors.push('Preserve the requested geometric shape.');
    if(typeof spec.title!=='string'||!spec.title.trim()||spec.title.length>100)errors.push('Provide a short geometry title.');
    if(spec.labels!==undefined&&(!spec.labels||typeof spec.labels!=='object'||Array.isArray(spec.labels)||Object.values(spec.labels).some(label=>typeof label!=='string'||label.length>40)))errors.push('Geometry labels must be short text.');
    return errors;
  }
  function supplied(request,selected){
    if(!selected.shape||/\d/.test(request))return null;
    const spec={family:'geometry',shape:selected.shape,title:({circle:'Radius and diameter of a circle',triangle:'Triangle: base and height',rectangle:'Rectangle: length and width'})[selected.shape]};
    spec.explanation=({
      circle:'The radius r runs from the center O to any point on the circle. The diameter d crosses the center and equals twice the radius. If you know the diameter, circumference C, or area A, use the corresponding formula below. A numerical radius needs at least one of those measurements.\n\n\\[r=\\frac{d}{2},\\qquad r=\\frac{C}{2\\pi},\\qquad r=\\sqrt{\\frac{A}{\\pi}}\\]',
      triangle:'The height h is perpendicular to the base b. The area is half the base times the height.\n\n\\[A=\\frac{1}{2}bh\\]',
      rectangle:'The length l and width w are perpendicular sides.\n\n\\[A=lw,\\qquad P=2(l+w)\\]'
    })[selected.shape];
    return spec;
  }
  function render(input){
    const spec=typeof input==='string'?JSON.parse(input):input,errors=validate(spec);if(errors.length)throw Error(errors.join(' '));
    const label=(key,fallback)=>escape(spec.labels?.[key]||fallback);
    const text=(x,y,value)=>`<text x="${x}" y="${y}" fill="currentColor" stroke="none" font-size="17" text-anchor="middle">${value}</text>`;
    let drawing;
    if(spec.shape==='circle')drawing=`<circle cx="280" cy="170" r="112" stroke="#72afff"/><path d="M168 170H392" stroke="#9b9b9b" stroke-dasharray="5 5"/><path d="M280 170L359.2 90.8" stroke="#ffd278" stroke-width="4"/><circle cx="280" cy="170" r="4" fill="currentColor" stroke="none"/>${text(270,197,label('center','O'))}${text(335,128,label('radius','r'))}${text(280,155,label('diameter','d = 2r'))}`;
    if(spec.shape==='triangle')drawing=`<path d="M120 270L440 270L310 65Z" stroke="#72afff"/><path d="M310 65V270" stroke="#ffd278" stroke-dasharray="6 5"/><path d="M310 252H328V270" stroke="#ffd278"/>${text(280,300,label('base','b'))}${text(331,176,label('height','h'))}`;
    if(spec.shape==='rectangle')drawing=`<rect x="120" y="80" width="320" height="190" stroke="#72afff"/>${text(280,300,label('length','l'))}${text(92,180,label('width','w'))}`;
    return `<div class="visual-diagram-container geometry-diagram"><div class="geometry-diagram-heading">${escape(spec.title)}</div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 340" role="img" aria-label="${escape(spec.title)}"><title>${escape(spec.title)}</title><g fill="none" stroke="currentColor" stroke-width="2.5" font-family="inherit">${drawing}</g></svg><p class="geometry-diagram-caption">Schematic · not to scale</p></div>`;
  }
  const api={shapes,select,validate,supplied,render};if(typeof module!=='undefined')module.exports=api;root.BrownGeometryDiagrams=api;
})(typeof window==='undefined'?globalThis:window);
