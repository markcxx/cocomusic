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

## 失败恢复

打包或上传失败时不会公开不完整的版本，可以重试失败任务。需要使用更新后的发布脚本时，在 Actions → Resume Release 填写原标签和构建运行 ID；工作流会验证产物来自标签对应的提交，再复用安装包发布。

已公开版本的附件不会被覆盖。代码有修复时，应发布新的版本标签。

Actions Artifact 用于构建任务间传递文件，保留 3 天，发布成功后清理；正式安装包保留在 GitHub Releases。

[返回项目首页](../README.md)
