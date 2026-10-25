<p align="center">
  <img src="public/images/logo.svg" width="96" height="96" alt="CoCo Music" />
</p>

<h1 align="center">CoCo Music</h1>

<p align="center">一个开源的多平台桌面音乐播放器。</p>

<p align="center">
  网易云音乐 · QQ 音乐 · 酷狗音乐<br />
  macOS · Windows · Linux
</p>

<p align="center">
  <a href="https://github.com/markcxx/cocomusic/releases">下载安装</a> ·
  <a href="#界面预览">界面预览</a> ·
  <a href="docs/development.md">开发指南</a> ·
  <a href="https://github.com/markcxx/cocomusic/issues">反馈问题</a>
</p>

<p align="center">
  <a href="https://github.com/markcxx/cocomusic/releases/latest"><img src="https://img.shields.io/github/v/release/markcxx/cocomusic?label=version&amp;color=7152A5" alt="最新版本" /></a>
  <a href="https://github.com/markcxx/cocomusic/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/markcxx/cocomusic/ci.yml?branch=main&amp;label=CI&amp;logo=githubactions&amp;logoColor=white" alt="CI 状态" /></a>
  <a href="https://github.com/markcxx/cocomusic/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/markcxx/cocomusic/release.yml?label=release&amp;logo=githubactions&amp;logoColor=white" alt="发布构建状态" /></a>
  <a href="https://github.com/markcxx/cocomusic/releases"><img src="https://img.shields.io/github/downloads/markcxx/cocomusic/total?color=7152A5" alt="累计下载量" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/markcxx/cocomusic?color=7152A5" alt="GPL-3.0 许可证" /></a>
</p>

<p align="center">
  <a href="#下载"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-7152A5" alt="支持 macOS、Windows 和 Linux" /></a>
  <a href="package.json"><img src="https://img.shields.io/github/package-json/dependency-version/markcxx/cocomusic/dev/electron?label=Electron&amp;logo=electron&amp;logoColor=white&amp;color=47848F" alt="Electron 版本" /></a>
  <a href="package.json"><img src="https://img.shields.io/github/package-json/dependency-version/markcxx/cocomusic/next?label=Next.js&amp;logo=nextdotjs&amp;logoColor=white&amp;color=111111" alt="Next.js 版本" /></a>
  <a href="package.json"><img src="https://img.shields.io/github/package-json/dependency-version/markcxx/cocomusic/react?label=React&amp;logo=react&amp;logoColor=white&amp;color=149ECA" alt="React 版本" /></a>
  <a href="package.json"><img src="https://img.shields.io/github/package-json/dependency-version/markcxx/cocomusic/dev/typescript?label=TypeScript&amp;logo=typescript&amp;logoColor=white&amp;color=3178C6" alt="TypeScript 版本" /></a>
</p>

## 界面预览

### 音乐发现

![首页：推荐歌单与音乐发现](docs/screenshots/home.jpg)

### 歌词播放页

![歌词播放页：专辑封面、同步歌词与播放控制](docs/screenshots/lyrics.jpg)

### 歌单详情

![歌单详情：封面、歌单信息与歌曲列表](docs/screenshots/playlist.jpg)

### 桌面歌词

![桌面歌词：悬浮显示、双行歌词与逐字高亮](docs/screenshots/desktop-lyrics.jpg)

### macOS 菜单栏歌词

![macOS 菜单栏歌词：当前歌词与逐字高亮，菜单栏局部实拍](docs/screenshots/macos-menubar-lyrics.png)

<details>
  <summary>查看更多：排行榜</summary>

![排行榜](docs/screenshots/charts.jpg)

</details>

截图来自应用实际运行界面；桌面歌词与菜单栏歌词为 macOS 实拍，菜单栏截图保留了歌词区域。音乐内容随平台更新。

## 功能

- **多平台曲库** — 切换网易云音乐、QQ 音乐和酷狗音乐，浏览推荐、歌单、专辑、歌手与排行榜。
- **搜索与收藏** — 搜索歌曲、歌单、专辑和歌手，扫码登录后同步喜欢的歌曲与管理歌单。
- **播放与歌词** — 播放队列、多种播放模式、同步歌词、翻译歌词与歌曲评论。
- **本地音乐** — 导入文件夹、拖入音频文件，或通过系统“打开方式”播放。
- **歌曲下载** — 管理下载任务，写入歌曲信息与封面；支持单独下载歌词。
- **桌面体验** — 桌面歌词、迷你播放器、系统托盘、全局快捷键，以及主题与外观设置。

## 下载

前往 [Releases](https://github.com/markcxx/cocomusic/releases) 获取安装包。

| 系统 | 架构 | 安装包 |
| --- | --- | --- |
| macOS | Apple Silicon / Intel | DMG、ZIP |
| Windows | x64 | EXE 安装程序 |
| Linux | x64 | AppImage、deb |

项目仍在早期开发阶段，跨平台兼容性持续完善中。目前安装包没有开发者代码签名，首次打开可能出现系统提示，详见[安装说明](docs/installation.md)。

## 本地开发

建议使用 Node.js 22 和 npm。

```bash
git clone https://github.com/markcxx/cocomusic.git
cd cocomusic
npm ci
npm run dev
```

更多命令、项目结构与贡献说明，请阅读[开发指南](docs/development.md)。

## 反馈与参与

欢迎通过 [Issues](https://github.com/markcxx/cocomusic/issues) 报告问题、提出建议，也欢迎提交 Pull Request。报告问题时请附上应用版本、操作系统和复现步骤，并移除账号凭据等个人信息。

- [开发与贡献](docs/development.md)
- [安装说明](docs/installation.md)
- [数据与隐私](docs/data-and-privacy.md)
- [版本发布](docs/releasing.md)

## 许可与说明

本项目采用 [GPL-3.0-only](LICENSE) 协议开源。

CoCo Music 是独立开发的第三方客户端，与所接入平台无官方隶属或合作关系。音乐、封面及歌词等内容归各自权利人所有；播放范围和音质取决于平台授权、账号权益及地区限制。

第三方依赖与资源遵循各自许可证，Geo 字体许可见 [OFL.txt](public/fonts/OFL.txt)。
