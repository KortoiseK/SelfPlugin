# step-explainer — Claude Code 中文步骤解释器

让 Claude Code 的每一步操作都自动附带**一行中文大白话解释**。适合不熟悉编程术语的中文用户：权限弹窗弹出来之前，你就已经知道它要干什么了。

## 功能

| 场景 | 自动显示 |
|---|---|
| 执行只读命令（如 `git status`、`ls`） | `📖 只读命令（不会改动任何东西）：git status` |
| 执行有风险命令（如 `npm install`、`git push`） | `⚠️ 要执行命令（可能改动文件或远程数据，请留意）：npm install` |
| 修改/创建文件 | `✏️ 要修改文件：xxx（查找并替换一段文本）` / `📝 要写入/创建文件：xxx` |
| 联网查询 | `🌐 要联网搜索：xxx` |
| 派出子任务 / 向你提问 | `🤖 要派一个子任务…` / `📋 Claude 正在向你提问：…` |

另外附带：

- **`/explain` 命令**：随时输入 `/explain`（或 `/explain 3`），让 Claude 把最近几步做了什么详细讲给你听。
- **行为规范 skill**：让 Claude 在提问/请求确认时用大白话解释每个选项的含义和后果。
- **静音开关**：不想看解释时，在 `~/.claude/hooks/` 下创建 `explain-step.off`（完全静音）或 `explain-step.quiet`（只保留风险类提醒），删除文件即恢复。

解释只是**显示给你看的标注**，不改变 Claude Code 的任何权限流程，也不会阻塞操作。

## 安装

要求：电脑装有 [Node.js](https://nodejs.org/)（v14+ 即可）。

### 方法一：插件市场安装（推荐）

在 Claude Code 里依次输入：

```
/plugin marketplace add <你的GitHub用户名>/step-explainer
/plugin install step-explainer@step-explainer-marketplace
```

装完重启 Claude Code 生效。

### 方法二：手动安装

把本仓库的文件复制到你的用户目录：

- `hooks/explain-step.js` → `~/.claude/hooks/explain-step.js`
- `skills/plain-explain/` → `~/.claude/skills/plain-explain/`
- `commands/explain.md` → `~/.claude/commands/explain.md`

然后在 `~/.claude/settings.json` 里加上：

```json
"hooks": {
  "PreToolUse": [
    {
      "matcher": "Bash|Edit|Write|WebFetch|WebSearch|Agent|Task|AskUserQuestion",
      "hooks": [
        {
          "type": "command",
          "command": "node C:/Users/<你的用户名>/.claude/hooks/explain-step.js",
          "timeout": 10
        }
      ]
    }
  ]
}
```

（把 `<你的用户名>` 换成你电脑的用户名；若提示不支持 `args` 可忽略。）重启 Claude Code 生效。

## 卸载

- 插件市场安装：`/plugin uninstall step-explainer@step-explainer-marketplace`
- 手动安装：删除上述三个位置的文件，并从 `settings.json` 移除 `hooks` 配置段

## 许可证

[MIT](LICENSE)
