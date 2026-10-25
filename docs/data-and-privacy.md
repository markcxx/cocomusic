# 数据与隐私

音乐平台请求从用户本机发出，登录和播放仍会与相应平台及其内容服务通信。

本地音乐索引（`library.json`）和下载记录（`downloads.json`）与会话文件保存在同一目录。应用只读取你添加的文件夹和打开的文件，不会移动或修改它们。下载的歌曲默认保存到 `~/Music/CoCo Music`，可以在下载管理中更改。默认只下载歌曲，并尝试写入歌名、歌手、专辑及内嵌封面；标签或封面写入失败时保留原始音频，并在下载列表提示。可以在歌曲更多菜单或已下载列表中单独下载歌词，也可以在设置中启用同时下载同名 `.lrc` 文件。

桌面端界面设置、音量、播放模式、队列、播放进度、搜索历史及最近播放保存在 Electron 的 `userData/preferences.json` 中，不依赖本机服务端口。Windows 使用 `%APPDATA%/CoCo Music`，macOS 使用 `~/Library/Application Support/CoCo Music`，Linux 使用 `$XDG_CONFIG_HOME/CoCo Music`（默认 `~/.config/CoCo Music`）。首次读取时会迁移当前来源下已有的 localStorage 偏好，已保存的桌面偏好优先。JSON 索引与偏好采用临时文件替换和上一版本备份，读取损坏文件时尝试恢复备份。

账号会话保存在本机 `sessions.json` 中，桌面模式使用 Electron 的 `userData` 目录；独立 Web 开发模式默认使用 `~/.cocomusic`，也可通过 `COCO_DATA_DIR` 指定目录。会话文件以 JSON 形式保存，并非加密凭据保险库；写入时设置 `0600` 权限，实际保护效果取决于操作系统与文件系统。请勿公开该文件或将其附在问题反馈中。

[返回项目首页](../README.md)
