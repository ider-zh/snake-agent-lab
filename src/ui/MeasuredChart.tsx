import { useId, useState } from 'react';

/** Every point comes from an experiment; an empty plot never invents a curve. */
export function Sparkline({ values, color = '#4a772d', label = '曲线' }: { values: number[]; color?: string; label?: string }) {
 const id = useId().replaceAll(':', '');
 const [inspection, setInspection] = useState<number|null>(null);
 const min = Math.min(0, ...values), max = Math.max(1, ...values);
 const x = (i: number) => 10 + i / Math.max(1, values.length - 1) * 380;
 const y = (value: number) => 92 - (value - min) / (max - min) * 76;
 const points = values.map((value, i) => `${x(i)},${y(value)}`).join(' ');
 const index = Math.min(inspection ?? values.length - 1, values.length - 1);
 return <figure className="measured-chart"><svg className="sparkline" viewBox="0 0 400 108" role="img" tabIndex={values.length ? 0 : undefined} aria-label={`${label}，${values.length} 个真实采样点${values.length ? `，最后值 ${values.at(-1)}。方向键检查采样点` : ''}`} onPointerMove={event => { if(values.length){const bounds=event.currentTarget.getBoundingClientRect();setInspection(Math.round(Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width))*(values.length-1)));}}} onPointerLeave={()=>setInspection(null)} onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setInspection(Math.max(0,Math.min(values.length-1,index+(event.key==='ArrowRight'?1:-1))));}}}>
  <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".2"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
  <path d="M10 92H390M10 54H390M10 16H390" stroke="#c6d4b8" strokeDasharray="3 5"/>
  {values.length>0?<><polygon points={`10,92 ${points} ${x(values.length-1)},92`} fill={`url(#${id})`}/><polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round"/><line x1={x(index)} y1="12" x2={x(index)} y2="96" stroke={color} opacity=".25"/><circle cx={x(index)} cy={y(values[index])} r="4" fill={color} stroke="#fffef8" strokeWidth="2"/></>:<text x="200" y="59" fill="#536c40" fontSize="13" textAnchor="middle">等待实际数据 · 开始后绘制</text>}
 </svg><figcaption aria-live={inspection===null?'off':'polite'}>{values.length?<><span>{inspection===null?'最近采样':`采样 ${index+1} / ${values.length}`}</span><strong>{new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(values[index])}</strong></>:<span>尚无采样，未预设结果</span>}</figcaption></figure>;
}
