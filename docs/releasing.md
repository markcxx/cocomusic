# 发布指南

## 准备版本

1. 根据上一版本以来的变更，在 `.github/release-notes/<版本>.md` 编写面向用户的中文更新说明。
2. 同步更新 `package.json` 和 `package-lock.json` 的版本号。
3. 运行类型检查、Lint、测试及发布规则检查，提交变更。
4. 创建并推送对应版本标签，例如 `v0.0.2`。

```bash
npm run typecheck
npm run lint
npm test
node --test .github/scripts/release.test.mjs

git tag -a v0.0.2 -m "CoCo Music 0.0.2"
git push origin main --follow-tags
```

## 自动发布

版本标签触发 macOS（Apple Silicon、Intel）、Windows 和 Linux 打包。工作流会验证版本号、更新说明与全部附件，生成 SHA256 校验文件，通过远程附件校验后公开 Release。

`-rc.1`、`-beta.1` 等后缀会生成预发行版，不覆盖 Latest；不带预发行后缀的版本会发布为正式版。`0.0.x` 不会仅因主版本号为零而标记为预发行版。

普通推送和 Pull Request 只执行检查。手动运行 Release 工作流用于诊断打包，不创建 Release。

## 应用内更新

应用通过 GitHub Releases API 检查更新（`electron/main/updater.ts`），启动 15 秒后和每 6 小时检查一次，也可在 设置 › 更新 手动检查。更新说明就是 Release 正文，也即 `.github/release-notes/<版本>.md`，会在更新弹窗和更新日志中显示；跨多个版本更新时会依次列出中间每个版本的说明。

- 安装包按 `electron-builder.yml` 中的文件名匹配，改动 `artifactName` 时需同步修改 `electron/main/update-core.ts` 的 `installAsset`。
- 检测到新版本后，用户可在更新弹窗或设置页点击“立即下载”，在应用内查看进度、取消或重试，无需打开 Release 页面。发现更新时自动弹窗，由用户选择下载或跳过版本；不会自动下载或在退出时自动安装，旧版自动下载偏好会被清除。
- 开发模式同样支持下载及打开安装包，但不会替换开发中的 Electron 应用。
- 下载后按 GitHub 附件摘要（或 `SHA256SUMS.txt`）校验 SHA-256，不通过不会安装。
- macOS 下载 ZIP 并在退出后替换应用；从 DMG 运行或无写入权限时改为打开 DMG。Windows 静默运行 NSIS 安装包并重新启动。Linux AppImage 原地替换，deb 交给系统安装器打开。
- 正式版渠道只提供不带预发行后缀的版本；预览版渠道同时提供 `-rc`、`-beta` 版本。

## 失败恢复

打包或上传失败时不会公开不完整的版本，可以重试失败任务。需要使用更新后的发布脚本时，在 Actions → Resume Release 填写原标签和构建运行 ID；工作流会验证产物来自标签对应的提交，再复用安装包发布。

已公开版本的附件不会被覆盖。代码有修复时，应发布新的版本标签。

Actions Artifact 用于构建任务间传递文件，保留 3 天，发布成功后清理；正式安装包保留在 GitHub Releases。

[返回项目首页](../README.md)
