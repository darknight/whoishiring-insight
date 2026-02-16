# 部署方案

## 架构概览

```
GitHub repo (main branch)
  │
  ├── push to main ──────► deploy.yml ──► pnpm build ──► Cloudflare Pages
  │
  └── 每周五 09:00 CST ──► weekly-update.yml
                             ├── pnpm run fetch   (GitHub API 增量拉取)
                             ├── pnpm run parse   (AI 解析新评论)
                             ├── pnpm run aggregate (聚合统计)
                             ├── git commit & push (data/ + src/data/)
                             └── pnpm build ──► Cloudflare Pages
```

两条 workflow 互补：
- **deploy.yml** — 任何 push 到 main 都会自动构建部署（代码改动、手动修数据等）
- **weekly-update.yml** — 定时增量更新数据并部署（也支持手动 `workflow_dispatch`）

## 前置准备

### 1. Cloudflare 账号配置

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 记下 **Account ID**（右侧栏或 Workers & Pages 概览页）
3. 创建 API Token：
   - 进入 My Profile > API Tokens > Create Token
   - 使用 **Edit Cloudflare Workers** 模板
   - 确保权限包含：`Account / Cloudflare Pages / Edit`
   - 记录生成的 Token

### 2. 智谱 API Key

数据解析需要 AI 模型。当前使用智谱 GLM-4-flash：

1. 注册 [智谱开放平台](https://open.bigmodel.cn/)
2. 创建 API Key

### 3. GitHub 仓库 Secrets 配置

进入 GitHub repo > Settings > Secrets and variables > Actions，添加以下 **Secrets**：

| Secret 名称 | 值 | 用途 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token | Pages 部署 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID | Pages 部署 |
| `ZHIPU_API_KEY` | 智谱 API Key | AI 解析招聘数据 |

可选 **Variables**（Settings > Secrets and variables > Actions > Variables）：

| Variable 名称 | 默认值 | 说明 |
|---|---|---|
| `AI_MODEL` | `zhipu:glm-5` | weekly-update 使用的模型标识 |

> `GITHUB_TOKEN` 由 Actions 自动提供，无需手动设置。

## 首次部署

### Step 1: 创建 Cloudflare Pages 项目

有两种方式：

**方式 A：通过 Wrangler CLI（推荐）**

```bash
# 本地安装了 wrangler (devDependencies 已包含)
npx wrangler pages project create whoishiring-insight --production-branch main
```

**方式 B：通过 Dashboard**

1. 进入 Cloudflare Dashboard > Workers & Pages > Create
2. 选择 "Direct Upload"（不要选 Git 连接，我们用 GitHub Actions 部署）
3. 项目名填 `whoishiring-insight`

### Step 2: 推送代码触发部署

```bash
git push origin main
```

`deploy.yml` 会自动执行：`pnpm install` → `pnpm build` → `wrangler pages deploy`。

### Step 3: 验证

部署完成后访问：
- https://whoishiring-insight.pages.dev

在 GitHub repo > Actions 标签页可以看到 workflow 运行状态。

## 自定义域名

### 方式 A：域名已托管在 Cloudflare（推荐）

1. Cloudflare Dashboard > Workers & Pages > whoishiring-insight > Custom domains
2. 点击 "Set up a custom domain"
3. 输入域名（如 `hire.example.com`）
4. Cloudflare 会自动添加 CNAME 记录并配置 SSL

### 方式 B：域名在其他注册商

1. 在域名注册商的 DNS 管理中添加 CNAME 记录：

   ```
   hire.example.com  CNAME  whoishiring-insight.pages.dev
   ```

2. 回到 Cloudflare Pages 项目 > Custom domains > 添加域名
3. 等待 DNS 验证通过（可能需要几分钟）
4. SSL 证书会自动签发

### 更新 Astro 配置

域名确定后，更新 `astro.config.ts` 中的 `site`：

```typescript
export default defineConfig({
  site: 'https://hire.example.com', // 替换为实际域名
  // ...
});
```

## Workflow 说明

### deploy.yml — 代码部署

```yaml
触发条件: push to main
流程: checkout → pnpm install → pnpm build → wrangler pages deploy
```

纯粹的构建部署流程，不涉及数据更新。每次合并 PR 或直接 push 都会触发。

### weekly-update.yml — 定时数据更新

```yaml
触发条件: 每周五 UTC 01:00 (北京时间 09:00) 或手动触发
流程:
  1. pnpm run fetch    — 通过 GitHub API 拉取 ruanyf/weekly 的新 issue 评论
  2. pnpm run parse    — 用 AI 解析新增评论为结构化数据
  3. pnpm run aggregate — 聚合统计生成前端 JSON
  4. git commit & push — 将更新的数据提交回 main
  5. pnpm build        — 构建静态站点
  6. wrangler deploy   — 部署到 Cloudflare Pages
```

> 注意：步骤 4 的 push 也会触发 deploy.yml，但 weekly-update.yml 自身已经做了部署（步骤 5-6），所以 deploy.yml 这次运行是冗余但无害的。如果想避免双重部署，可以在 deploy.yml 中添加条件跳过 bot 提交。

### 手动触发数据更新

GitHub repo > Actions > Weekly Data Update > Run workflow

适用场景：首次部署后需要初始化历史数据、临时需要更新数据等。

## 环境变量参考

| 变量 | 来源 | 用于 |
|---|---|---|
| `GITHUB_TOKEN` | Actions 自动注入 | fetch.ts — 访问 GitHub API |
| `ZHIPU_API_KEY` | Secrets | parse.ts — 调用智谱 AI |
| `AI_MODEL` | Variables (可选) | parse.ts — 模型选择 |
| `CLOUDFLARE_API_TOKEN` | Secrets | wrangler — Pages 部署 |
| `CLOUDFLARE_ACCOUNT_ID` | Secrets | wrangler — Pages 部署 |

## 故障排查

### 数据更新失败

1. **GitHub API 限流** — `GITHUB_TOKEN` 默认 1000 请求/小时，fetch 做了增量拉取（跳过已关闭的 issue），通常够用
2. **AI 解析失败** — parse.ts 有自动重试机制，单条失败不影响整体。检查 `data/parsed/*.json` 中的 `errors` 字段
3. **无新数据** — 如果没有新评论，`git diff --staged --quiet` 会跳过提交，workflow 正常结束

### 部署失败

1. **wrangler 认证失败** — 检查 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 是否正确
2. **项目不存在** — 确认已创建名为 `whoishiring-insight` 的 Pages 项目
3. **构建失败** — 本地先跑 `pnpm build` 确认能通过

### 查看日志

- GitHub Actions 日志：repo > Actions > 点击具体 run
- Cloudflare Pages 部署日志：Dashboard > Workers & Pages > whoishiring-insight > Deployments
