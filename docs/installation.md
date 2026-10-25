# 安装与首次启动

请从 [GitHub Releases](https://github.com/markcxx/cocomusic/releases) 下载适合系统与处理器架构的安装包。

| 系统 | 安装方式 |
| --- | --- |
| macOS · Apple Silicon | 下载 `mac-arm64.dmg`，将应用拖入“应用程序” |
| macOS · Intel | 下载 `mac-x64.dmg`，将应用拖入“应用程序” |
| Windows · x64 | 运行 `win-x64-Setup.exe` |
| Linux · x64 | 使用 AppImage，或安装 deb 包 |

项目目前没有开发者代码签名，首次运行可能收到系统提示。请确认安装包来自项目的官方 Release，再按系统提示操作。

## macOS

尝试在访达中右键应用，选择“打开”，或在系统设置的“隐私与安全性”中查看允许打开的选项。

如果确认安装包来源可靠，但系统仍提示应用已损坏，可以针对这个应用移除隔离标记后重试。

```bash
xattr -cr "/Applications/CoCo Music.app"
```

## Windows

遇到 SmartScreen 提示时，可查看“更多信息”中的运行选项。建议使用安装包安装，以启用系统文件关联。

## Linux

AppImage 需要可执行权限。

```bash
chmod +x CoCo-Music-*.AppImage
```

Debian / Ubuntu 可以使用 apt 安装 deb 包。

```bash
sudo apt install ./CoCo-Music-*.deb
```

[返回项目首页](../README.md)
