export function rendererError(error: unknown): string {
  const detail = String(error);
  if (/unsafe-eval|content security policy|\bcsp\b/i.test(detail)) return `绘图初始化失败：安全策略兼容模块未能加载。请刷新页面或联系站点维护者。详情：${detail}`;
  if (/webgl|graphics context|context creation/i.test(detail)) return `绘图初始化失败：无法创建图形上下文。请检查浏览器 WebGL 与硬件加速设置。详情：${detail}`;
  return `绘图初始化失败：${detail}`;
}
