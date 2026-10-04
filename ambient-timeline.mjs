const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function regions(end,anchors=[]){
 end=Math.max(1,end);
 let a=anchors[0],b=anchors[1];
 if(!(a>0&&b>a&&b<end))return [0,end/3,end*2/3,end];
 a=clamp(a,end*.12,end*.55);b=clamp(b,a+end*.15,end*.88);
 return [0,a,b,end];
}
export function sample(y,bounds,blend=200,motionSpan=Infinity){
 const end=bounds[3];y=clamp(y,0,end);
 const half=Math.min(blend/2,(bounds[1]-bounds[0])/4,(bounds[2]-bounds[1])/4,(end-bounds[2])/4);
 const item=(index,weight)=>({index,progress:clamp((y-bounds[index])/Math.min(bounds[index+1]-bounds[index],Math.max(1,motionSpan)),0,1),weight});
 for(let i=1;i<3;i++)if(Math.abs(y-bounds[i])<half){const p=(y-bounds[i]+half)/(2*half);return [item(i-1,1-p),item(i,p)]}
 const i=y<bounds[1]?0:y<bounds[2]?1:2;return [item(i,1)];
}
export function needed(y,bounds,viewport,direction=1){
 const current=y<bounds[1]?0:y<bounds[2]?1:2,result=[current];
 if(direction>=0&&current<2&&bounds[current+1]-y<viewport*1.25)result.push(current+1);
 if(direction<0&&current>0&&y-bounds[current]<viewport*1.25)result.push(current-1);
 return result;
}
export function fastMove(delta,elapsed,viewport){return Math.abs(delta)>Math.max(60,viewport*.06)&&Math.abs(delta)/Math.max(1,elapsed)>2.2}
export function frameTime(progress,duration){return Number.isFinite(duration)?clamp(progress,0,1)*Math.max(0,duration-.06):null}
