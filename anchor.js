// Text-position + quote anchoring for annotations. Article plain text = paras.join('\n\n').
export const SEP = '\n\n';
export function paraBases(paras){ const b=[]; let o=0; for(const p of paras){ b.push(o); o+=p.length+SEP.length; } return b; }
// Offset of (node, offset) inside a paragraph element, counting only text nodes.
export function offsetIn(pEl, node, off){
  const r=document.createRange(); r.setStart(pEl,0);
  try{ r.setEnd(node,off); }catch(e){ return 0; }
  return r.toString().length;
}
function paraOf(node, root){
  let e=node.nodeType===3?node.parentNode:node;
  while(e && e!==root){ if(e.dataset && e.dataset.i!==undefined && e.tagName==='P') return e; e=e.parentNode; }
  return null;
}
// Convert a DOM Range inside root into {start,end} global offsets, clamped to paragraph content.
export function rangeToOffsets(range, root, bases, paras){
  let sp=paraOf(range.startContainer,root), ep=paraOf(range.endContainer,root);
  const ps=[...root.querySelectorAll('p[data-i]')]; if(!ps.length) return null;
  let s,e;
  if(sp) s=bases[+sp.dataset.i]+offsetIn(sp,range.startContainer,range.startOffset);
  else { const f=ps.find(p=>range.intersectsNode(p)); if(!f) return null; s=bases[+f.dataset.i]; }
  if(ep) e=bases[+ep.dataset.i]+offsetIn(ep,range.endContainer,range.endOffset);
  else { const l=[...ps].reverse().find(p=>range.intersectsNode(p)); if(!l) return null; const i=+l.dataset.i; e=bases[i]+paras[i].length; }
  if(e<=s) return null;
  return {start:s,end:e};
}
export function makeSelector(plain,start,end){
  return {start,end,quote:plain.slice(start,end),prefix:plain.slice(Math.max(0,start-32),start),suffix:plain.slice(end,end+32)};
}
// Re-anchor: trust offsets if quote still matches; otherwise find best quote occurrence by context.
export function resolve(plain,a){
  if(plain.slice(a.start,a.end)===a.quote) return {start:a.start,end:a.end};
  if(!a.quote) return null;
  let best=null,bs=-1,i=plain.indexOf(a.quote);
  while(i!==-1){
    let sc=0; const pre=plain.slice(Math.max(0,i-a.prefix.length),i), suf=plain.slice(i+a.quote.length,i+a.quote.length+a.suffix.length);
    for(let k=1;k<=Math.min(pre.length,a.prefix.length)&&pre[pre.length-k]===a.prefix[a.prefix.length-k];k++) sc++;
    for(let k=0;k<Math.min(suf.length,a.suffix.length)&&suf[k]===a.suffix[k];k++) sc++;
    sc-=Math.abs(i-a.start)/1e6;
    if(sc>bs){bs=sc;best=i;} i=plain.indexOf(a.quote,i+1);
  }
  return best===null?null:{start:best,end:best+a.quote.length};
}
// Split one paragraph into segments with the annotations covering each.
export function segments(text, base, anns){
  const pts=new Set([0,text.length]); const local=[];
  for(const a of anns){ const s=Math.max(0,a.rs-base), e=Math.min(text.length,a.re-base); if(e>s){ local.push({a,s,e}); pts.add(s); pts.add(e);} }
  const xs=[...pts].sort((x,y)=>x-y); const out=[];
  for(let k=0;k<xs.length-1;k++){ const s=xs[k],e=xs[k+1]; if(e<=s) continue; out.push({s,e,t:text.slice(s,e),anns:local.filter(l=>l.s<=s&&l.e>=e).map(l=>l.a)}); }
  return out;
}
