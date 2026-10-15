import { useEffect, useRef, useState } from 'react';
import { useVisibility } from './visibility';

export function Film({ name, title, href }: { name: 'arena' | 'shortcut'; title: string; href: string }) {
  const { ref, active, reduced } = useVisibility();
  const video = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { if (active && !reduced) setLoaded(true); }, [active, reduced]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (!active || reduced || paused || failed || !loaded) { element.pause(); return; }
    let cancelled = false;
    void element.play().catch(() => { if (!cancelled) setPaused(true); });
    return () => { cancelled = true; element.pause(); };
  }, [active, reduced, paused, failed, loaded]);
  return <div ref={ref} className={`brand-film film-${name}`}>
    <a href={href} className="brand-film-link" aria-label={`${title}，进入对应实验区`}>
      <img src={`/media/${name}-poster.png`} alt={`${title}的真实运行预览`} loading="lazy" width="720" height="720"/>
      {!failed && <video ref={video} src={loaded ? `/media/${name}.webm` : undefined} poster={`/media/${name}-poster.png`} muted playsInline loop preload="none" aria-label={`${title}实录视频`} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => { setFailed(true); setPlaying(false); }} className={reduced ? 'film-static' : ''}/>}
      <span className="brand-film-enter">打开实验区 <span>↗</span></span>
    </a>
    <div className="brand-film-caption"><span><i/>{failed ? '视频暂不可用 · 静态预览' : reduced ? '静态预览 · 减少动态效果' : '项目运行实录 · 非模拟动画'}</span><button disabled={failed || reduced} onClick={() => { setLoaded(true); setPaused(playing); }} aria-label={`${playing ? '暂停' : '播放'}${title}视频`}>{playing ? 'Ⅱ 暂停' : '▷ 播放'}</button></div>
  </div>;
}
