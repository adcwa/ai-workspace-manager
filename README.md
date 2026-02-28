# AI Workspace Manager

一个用于 **Multi-Repo + git worktree** 场景的本地 Web 工具：

- 支持维护多个 workspace 配置（例如 auth、billing、search 等）。
- 配置持久化保存到本地 `~/.ai-workspace-manager/config.json`。
- 通过界面执行 `git worktree add -b <feature>` 批量创建工作区。
- 通过界面删除工作目录并执行 `git worktree prune` 进行清理。

## 快速启动

```bash
npm install
npx .
```

或：

```bash
npm start
```

默认启动地址：`http://localhost:4173`

## Repos JSON 格式

```json
[
  { "name": "repo-a" },
  { "name": "repo-b", "basePath": "custom/repo-b", "targetName": "repo-b" }
]
```

字段说明：

- `name`: 仓库名称（用于日志展示）。
- `basePath`（可选）: 在 `baseRoot` 下的实际相对路径。
- `targetName`（可选）: 创建到 workspace 时的目录名。

## 典型配置

- `baseRoot`: `~/git-base`
- `workspaceRoot`: `~/workspace`
- `featureBranch`: `feat/auth-v2`
