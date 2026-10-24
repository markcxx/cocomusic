<div align="center">

<img src="public/images/logo.svg" width="88" height="88" alt="CoCo Music 图标" />

# CoCo Music

面向多个音乐平台的第三方桌面播放器，让发现、收藏与聆听汇聚在一个简洁的界面里。

[项目主页](https://github.com/markcxx/cocomusic) · [问题反馈](https://github.com/markcxx/cocomusic/issues)

</div>

> 项目处于早期开发阶段（0.0.x）。已接入网易云音乐、QQ 音乐和酷狗音乐，可在 设置 › 曲库 中切换。安装包尚未经过代码签名，各系统的兼容性仍在验证中。

## 项目介绍

CoCo Music 希望提供统一、轻量的音乐体验，并通过独立的曲库适配层逐步接入更多音乐平台。它是独立开发的第三方客户端，与所接入的平台不存在官方隶属或合作关系。

音乐、封面、歌词和账号服务由对应平台提供。歌曲是否可播放、可用音质及试听范围取决于平台授权、账号权益和地区限制；本项目不提供音乐版权，也不承诺解除平台限制。

## 当前能力

- **发现音乐**：推荐歌单、新歌与专辑、歌手浏览、分类歌单及排行榜。
- **统一搜索**：搜索歌曲、歌单、专辑和歌手，提供搜索建议与热门搜索。
- **播放体验**：播放队列、进度与音量控制、列表循环、随机播放、单曲循环及顺序播放。
- **歌词与歌曲信息**：同步歌词、平台提供的翻译歌词及评论浏览。
- **账号与收藏**：各平台扫码登录、喜欢的歌曲、歌单创建与管理。
- **本地与下载**：本地音乐、下载管理、最近播放、播放队列。
- **桌面集成**：桌面歌词、迷你模式、系统毛玻璃窗口、全局快捷键、音频文件“打开方式”。

## 平台支持

| 桌面系统 | 安装包 | 文件 |
| --- | --- | --- |
| macOS 12+ | DMG / ZIP，Apple Silicon 与 Intel 分开提供 | `CoCo-Music-<版本>-mac-arm64.dmg`、`…-mac-x64.dmg` |
| Windows 10/11 | NSIS 安装程序，x64 | `CoCo-Music-<版本>-win-x64-Setup.exe` |
| Linux | AppImage 与 deb，x64 | `CoCo-Music-<版本>-linux-x86_64.AppImage`、`…-linux-amd64.deb` |

安装包可在 [Releases](https://github.com/markcxx/cocomusic/releases) 下载。目前没有代码签名证书，首次打开时系统会提示：

- **macOS**：提示“无法验证开发者”时，在访达中右键应用选择“打开”；若提示“已损坏”，在终端执行 `xattr -cr "/Applications/CoCo Music.app"` 后再打开。
- **Windows**：SmartScreen 提示时点“更多信息 → 仍要运行”。
- **Linux**：AppImage 需先 `chmod +x` 再运行；deb 用 `sudo apt install ./CoCo-Music-*.deb` 安装。

## 本地开发

需要 Node.js 20.9 或更高版本及 npm。请使用受所依赖 Electron 版本支持的桌面系统。

```bash
git clone https://github.com/markcxx/cocomusic.git
cd cocomusic
npm ci
npm run dev
```

`npm run dev` 启动 Electron 与本机 Next.js 服务，支持界面热更新；主进程变更会重新启动 Electron，preload 变更会刷新窗口。

仅预览 Web 界面时，可执行：

```bash
npm run dev:web
```

然后访问 <http://127.0.0.1:3457>。该模式用于本机开发，不具备完整桌面能力，也不启用桌面会话令牌校验，请勿将其直接暴露到公网。

如运行环境缺少原生 SWC 绑定，可尝试 `COCO_WEBPACK=1 npm run dev`（POSIX shell）。

### 测试“打开方式”

安装包会把 CoCo Music 注册为 MP3、FLAC、M4A/AAC、WAV、OGG/Opus 的可选打开方式（不会抢占系统默认播放器）。被打开的文件会加入本地音乐，并立即开始播放。

- **开发时模拟**：执行 `npm run dev -- ~/Music/某首歌.mp3`（可以传多个文件）。`--` 后面的文件会像在系统里“用 CoCo Music 打开”一样传给应用。
- **运行中再次打开**：应用运行时，在另一个终端执行 `npx electron . ~/Music/另一首.flac`。新进程会把文件交给已运行的窗口后立即退出，这和 Windows 双击文件的流程一致。
- **真实安装测试**：执行 `npm run dist:dir`，然后打开 `release/` 中的应用。
  - macOS：先把应用拖到“应用程序”文件夹，再在访达中右键音频文件，选“打开方式 → CoCo Music”。
  - Windows：需要先用 `npm run dist` 生成的安装包安装，之后在资源管理器中右键音频文件，选“打开方式”。

macOS 的“打开方式”列表由启动服务缓存，安装后如果没出现，注销重新登录一次即可。

## 构建与检查

| 命令 | 用途 |
| --- | --- |
| `npm run build` | 编译 Electron 与 Next.js，准备 standalone 产物 |
| `npm start` | 使用已有构建产物启动桌面应用 |
| `npm run dist:dir` | 构建并输出未压缩的应用目录 |
| `npm run dist` | 构建并生成当前系统对应的安装包 |
| `npm run dist:mac` / `dist:win` / `dist:linux` | 只打对应系统的包（需在该系统上执行） |
| `npm run typecheck` | 检查前端与 Electron 的 TypeScript 类型 |
| `npm run lint` | 执行 ESLint 检查 |
| `npm test` | 运行现有测试，需要支持 `--experimental-strip-types` 的 Node.js 版本 |

安装包输出到 `release/`。

### 发布新版本

日常推送与 Pull Request 仅执行类型检查、Lint、测试和发布规则检查，不生成安装包。版本标签触发全平台打包，并在文件齐全、远程附件的 SHA256 校验通过后自动发布到 [Releases](https://github.com/markcxx/cocomusic/releases)，无需手动编辑说明或点击 Publish。

1. 由 AI 助手根据上一个版本以来的提交和实际差异，整理面向用户的中文更新说明，保存到 `.github/release-notes/<版本>.md`。首次发布总结现有功能与已知限制。
2. 更新 `package.json` 与锁文件中的版本号，运行检查并提交。
3. 推送代码和对应版本标签。例如 `git tag -a v0.0.2 -m "CoCo Music 0.0.2"`，然后执行 `git push origin main --follow-tags`。
4. 工作流验证标签、版本号与更新说明，构建 macOS（arm64 + x64）、Windows、Linux 安装包，生成 `SHA256SUMS.txt`，上传并校验全部附件后自动公开 Release。

试用版本使用 `0.0.2-rc.1`、`0.0.2-beta.1` 等版本号和对应标签，自动发布为 Pre-release，不覆盖 Latest；`0.0.2` 等不带预发行后缀的版本自动发布为正式版并设为 Latest。`0.0.x` 不会仅因为主版本号为零而被标为 Pre-release。

工作流在确认附件齐全前使用临时草稿，完成后自动公开。打包或上传失败时不会公开不完整的版本；可重试失败任务；如果需要使用更新后的发布脚本，在 Actions › Resume Release 填写原标签和构建运行 ID，它会验证所有平台已成功、产物来自标签对应的提交后复用安装包发布，无需重打包。已公开版本的附件不会被覆盖。若代码需要修复，应发布新的版本标签。

Actions Artifact 仅用于构建任务之间传递文件，保留 3 天，发布成功后自动清理本次临时产物；正式安装包保留在 Release。手动运行 Actions › Release › Run workflow 仅用于诊断打包，不创建 Release，日常试用优先使用 `-rc` 标签。

## 项目结构

```text
cocomusic/
├── src/
│   ├── app/                 Next.js 页面与本机 API 路由
│   ├── components/          播放器、曲库、账号及通用界面组件
│   ├── lib/                 前端请求、状态辅助与工具函数
│   ├── server/music/        曲库适配、账号会话与平台实现
│   ├── types/               共享类型
│   └── proxy.ts             本机请求守卫
├── electron/               主进程、preload 与 IPC 定义
├── public/                 图标与字体等静态资源
├── scripts/                开发、依赖检查及打包辅助脚本
└── electron-builder.yml    桌面安装包配置
```

界面与业务 API 由 Next.js 提供，Electron 负责窗口及本机服务生命周期。桌面模式下服务监听 `127.0.0.1`，通过会话令牌与来源检查限制访问；渲染进程开启上下文隔离与沙箱，通过 preload 暴露有限的桌面接口。

## 数据与隐私

音乐平台请求从用户本机发出，登录和播放仍会与相应平台及其内容服务通信。

本地音乐索引（`library.json`）和下载记录（`downloads.json`）与会话文件保存在同一目录。应用只读取你添加的文件夹和打开的文件，不会移动或修改它们。下载的歌曲默认保存到 `~/Music/CoCo Music`，可以在下载管理中更改；歌词会一并保存为同名 `.lrc` 文件。

账号会话保存在本机 `sessions.json` 中，桌面模式使用 Electron 的 `userData` 目录；独立 Web 开发模式默认使用 `~/.cocomusic`，也可通过 `COCO_DATA_DIR` 指定目录。会话文件以 JSON 形式保存，并非加密凭据保险库；写入时设置 `0600` 权限，实际保护效果取决于操作系统与文件系统。请勿公开该文件或将其附在问题反馈中。

## 反馈与参与

欢迎通过 [Issues](https://github.com/markcxx/cocomusic/issues) 提交可复现的问题或功能建议。报告问题时，请附上系统及架构、Node.js 与应用版本、复现步骤、预期结果和实际结果，并移除 Cookie、令牌及个人信息。

涉及新平台接入或较大的设计变更时，建议先通过 Issue 讨论。提交变更前，请运行与改动相关的类型检查、代码检查和测试。

## 版权与许可

Copyright © 2026 markcxx.

本项目采用 [GNU General Public License v3.0（GPL-3.0-only）](LICENSE) 授权。你可以依照协议使用、修改和再分发本项目；分发受 GPL 覆盖的原版或衍生版本时，须保留版权与许可声明，依照 GPL-3.0 提供对应源码，并按同一协议授权。

GPL-3.0 允许商业使用与商业分发。本项目按协议提供，不附带任何担保。完整条款以 [LICENSE](LICENSE) 为准。

第三方依赖与资源仍遵循各自的许可证。随项目分发的 Geo 字体许可见 [public/fonts/OFL.txt](public/fonts/OFL.txt)。音乐平台的名称、商标及内容属于各自权利人。
