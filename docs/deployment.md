# Cloudflare Pages 部署

本仓库是纯静态 Vite SPA，不需要服务器、KV、R2、D1、Cloudflare Worker 或第三方训练服务。当前尚未部署；维护者决定后续公开地址。

## Pages 设置

- Repository: `ider-zh/snake-agent-lab`
- Root directory: `/`
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: `24`（`.node-version` 已提供；也可在 Pages 设置 `NODE_VERSION=24`）
- 不需要任何应用 secret 或 API token
- 首次预览请选择实现分支，验收后再决定生产分支；不要把未验收版本自动合并到 main

[Cloudflare 官方 Vite 部署说明](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/)与[构建配置](https://developers.cloudflare.com/pages/configuration/build-configuration/)确认静态构建命令/输出目录设置。`wrangler.jsonc` 记录 Pages 输出目录，未保存任何账号或凭证。Wrangler 仅是维护者将来选择的部署方式，不是应用运行依赖。

## 文件与安全边界

- `public/_redirects` 提供 SPA 回退
- `public/_headers` 提供 MIME 嗅探防护、referrer 策略、禁用无用设备权限、同源 CSP 和 hashed assets 长缓存
- CSP 允许同源模块 Worker、blob 下载、PixiJS WebGL 资源，不允许外部脚本/模型/网络连接
- 静态资源由 Pages 托管；模型、replay 和训练在用户浏览器内，IndexedDB 按 origin 隔离
- 预览域名与正式域名的本地数据不会自动迁移；需要导出后再导入
- 没有 Service Worker 缓存，不会通过旧离线资源隐藏新部署

Headers 行为依据 [Pages 官方文档](https://developers.cloudflare.com/pages/configuration/headers/)。正式站点上仍需实际验证 Worker、WebGL、下载、文件导入和 IndexedDB。

## 验收清单

1. `npm ci && npm run check`
2. 在 HP 本地运行 `npm run dev`，验证键盘/触控、四棋盘、暂停、后台可见性
3. `npx playwright install chromium && npm run test:e2e`
4. 部署后打开真实 HTTPS URL，再次测试训练 Worker、checkpoint 导入/导出、CSV 与回放
5. 确认没有 CSP 错误、404、意外网络请求；移动窄屏无横向溢出
6. 记录最终 commit SHA、浏览器、设备、实际测试结果；未测浏览器不得标成支持验证通过
