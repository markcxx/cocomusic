# 开发指南

CoCo Music 使用 Electron、Next.js、React 和 TypeScript。Electron 负责桌面集成，Next.js 提供界面和本机 API，三个音乐平台通过统一的适配接口接入。

## 开始开发

建议使用 Node.js 22 和 npm。

```bash
git clone https://github.com/markcxx/cocomusic.git
cd cocomusic
npm ci
npm run dev
```

界面支持热更新；主进程变更后会重启 Electron，preload 变更后会刷新窗口。

仅预览 Web 界面时运行 `npm run dev:web`，访问 `http://127.0.0.1:3457`。此模式没有完整桌面能力，也不启用桌面会话令牌校验，只用于本机开发，请勿暴露到公网。

缺少原生 SWC 绑定时，可尝试 `COCO_WEBPACK=1 npm run dev`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动桌面开发环境 |
| `npm run typecheck` | 检查前端和 Electron 类型 |
| `npm run lint` | 运行 ESLint |
| `npm test` | 运行单元与集成测试 |
| `npm run build` | 构建界面、本机服务和 Electron |
| `npm start` | 从已有构建启动应用 |
| `npm run dist:dir` | 生成未压缩的应用目录 |
| `npm run dist:mac` / `dist:win` / `dist:linux` | 在对应系统生成安装包 |
| `npm run icons` | 重新生成图标资源；macOS 原生资源需要 Xcode 26+ |

安装包输出到 `release/`。

## 项目结构

```text
src/app/             页面与本机 API
src/components/      界面组件与播放器
src/lib/             前端请求、状态及工具
src/server/music/    音乐平台适配与账号服务
src/server/local/    本地音乐与下载
src/types/           共享类型
electron/            桌面主进程、preload 与 IPC
public/              静态资源
build/               应用图标与打包资源
scripts/             开发及构建脚本
```

桌面服务只监听 `127.0.0.1`，通过会话令牌和来源检查限制访问。渲染进程启用上下文隔离和沙箱，通过 preload 调用有限的桌面接口。

## 测试文件关联

安装包会将应用注册为 MP3、FLAC、M4A/AAC、WAV、OGG/Opus 的可选打开方式，不会主动替换系统默认播放器。

- 开发时模拟 `npm run dev -- ~/Music/song.mp3`。
- 应用运行中执行 `npx electron . ~/Music/another.flac`，验证单实例文件转交。
- 运行 `npm run dist:dir` 后使用真实应用测试；Windows 的系统文件关联需要安装 NSIS 安装包。

## 图标维护

`public/images/logo.svg` 用于界面、Windows 和 Linux 图标；`build/CoCoMusic.icon` 是 macOS 的 Icon Composer 源文件。更新标志时请同步其中的 SVG 图层，再运行 `npm run icons`。

macOS 安装包同时包含原生 `Assets.car` 和兼容旧系统的 ICNS。已提交生成资源，日常构建不要求本机安装完整 Xcode。

## 贡献

欢迎提交修复、功能建议和新平台适配。较大的改动建议先通过 [Issue](https://github.com/markcxx/cocomusic/issues) 讨论。提交前请运行类型检查、Lint 和与改动相关的测试；问题反馈中请移除 Cookie、令牌与个人信息。

[返回项目首页](../README.md) · [发布指南](releasing.md)
