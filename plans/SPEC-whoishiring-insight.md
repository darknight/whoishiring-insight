---
title: Who Is Hiring Insight - 招聘市场洞察平台
slug: whoishiring-insight
created: 2026-02-13
last-updated: 2026-02-13 14:00
status: draft
progress: 0/12
---

# Who Is Hiring Insight - 招聘市场洞察平台

## Overview

从阮一峰周刊的"谁在招人"系列 GitHub Issues（2019.8 - 2026.2，约70+个月度帖子）中，使用 LLM 提取结构化招聘数据，构建一个现代简约风格的数据可视化网站，展示中国程序员招聘市场的历史趋势和深度洞察。

## Background

### Problem Statement

阮一峰周刊的"谁在招人"帖子是中国程序员社区最重要的免费招聘信息源之一，但这些数据散落在数十个 GitHub Issues 中，格式不统一，无法进行系统性的分析。开发者无法直观了解：
- 招聘市场整体冷暖变化
- 哪些技术栈需求在上升/下降
- 不同城市的招聘活跃度
- 薪资水平的变化趋势

### Target Users

- 正在找工作的程序员：了解市场趋势，做出更好的求职决策
- 技术管理者/HR：了解竞争格局和市场行情
- 技术社区成员：关注行业动态

### Success Criteria

1. 成功采集并解析 70+ 个月度帖子中的所有招聘信息
2. 提取准确率 > 90%（公司名、岗位、地点等核心字段）
3. 网站加载速度 < 3s，Lighthouse 性能分 > 90
4. 至少 10 个有意义的可视化图表
5. 支持 Cloudflare Pages 部署和月度自动更新

## Functional Requirements

### Core Features

1. **数据采集管道**
   - 通过 GitHub API 爬取所有历史"谁在招人" Issues 的评论
   - 解析 issue body 中的历史帖链接，递归获取所有月份数据
   - **过滤被折叠的评论**：GitHub API 中被维护者折叠（minimized）的评论直接跳过，这些通常是不符合发帖规范的内容
   - **过滤求职者帖子**：只保留招聘方发布的信息，忽略求职者的自我推荐帖（由 LLM 在解析阶段判断）
   - 原始数据本地缓存，避免重复请求

2. **LLM 结构化提取**
   - 使用 Claude API 将每条招聘评论解析为结构化 JSON
   - LLM 需先判断帖子类型（招聘 vs 求职 vs 其他），仅对招聘帖提取结构化数据
   - 提取字段：公司名、岗位列表、工作地点、薪资范围、技术栈要求、经验要求、学历要求、远程/现场、联系方式、公司类型（大厂/创业/外企等）
   - 结果持久化为 JSON 数据文件

3. **数据分析与统计**
   - 月度发帖数量趋势
   - 地域分布（城市热力图 / 排名）
   - 技术栈需求趋势（按语言/框架/工具分类）
   - 岗位类型分布变化（前端/后端/全栈/AI/DevOps 等）
   - 薪资区间统计（有数据的帖子）
   - 远程岗位占比趋势
   - 高频招聘公司排名
   - 学历/经验要求变化趋势
   - 海外岗位趋势
   - 公司类型分布（大厂 vs 创业 vs 外企）

4. **可视化展示**
   - 首页 Overview：关键指标卡片 + 核心趋势图
   - 趋势页：时间线相关的所有趋势图表
   - 地域页：城市分布地图和排名
   - 技术栈页：技术需求的变化和对比
   - 公司页：公司维度的分析

5. **交互功能**
   - 时间范围筛选器（按年/季度/自定义区间）
   - 图表 hover 展示详细数据
   - 响应式设计，支持移动端

### Non-functional Requirements

- 纯静态站点，无需后端服务器
- 首屏加载 < 3s
- 支持深色/浅色主题
- SEO 友好（Astro SSG）
- 数据更新不需要重新部署代码，只需重新构建

## Technical Design

### Architecture Overview

```
数据采集管道（Node.js 脚本）
├── GitHub API 爬虫 → 原始 Markdown 数据
├── Claude API 解析 → 结构化 JSON
└── 统计聚合脚本 → 预计算的图表数据

Astro 静态站点
├── Svelte 组件 → 交互式图表和 UI
├── ECharts → 数据可视化
└── 预计算 JSON → 构建时导入

CI/CD
├── GitHub Actions → 月度定时任务
└── Cloudflare Pages → 自动部署
```

### Technology Choices

| 类别 | 技术 | 版本 | 理由 |
|------|------|------|------|
| 编程语言 | TypeScript | 5.x | 类型安全、开发体验好 |
| 站点框架 | Astro | 5.x / 6.x | 内容优先的静态站点生成器，性能极佳，已被 Cloudflare 收购 |
| UI 框架 | Svelte | 5.x | 轻量、编译时优化、runes 响应式系统 |
| 图表库 | ECharts | 5.x | 功能丰富、中文生态好、支持地图等复杂图表 |
| 样式 | Tailwind CSS | 4.x | 快速开发、一致性好 |
| 包管理器 | pnpm | latest | 速度快、磁盘空间省、严格依赖解析 |
| 运行时 | Node.js | 24 LTS | 稳定、Astro + Svelte 5 完全兼容 |
| 数据采集 | Octokit | latest | GitHub API 官方 TypeScript SDK |
| 数据解析 | @anthropic-ai/sdk | latest | Claude API 官方 SDK，使用 Haiku 模型控制成本 |
| 部署 | Cloudflare Pages | - | 全球 CDN、免费额度充足 |
| CI/CD | GitHub Actions | - | 月度定时采集 + 自动构建部署 |

> **为什么不用 Bun？** Bun + Astro + Svelte 5 存在编译错误（[#15220](https://github.com/oven-sh/bun/issues/15220)）、栈溢出（[#25648](https://github.com/oven-sh/bun/issues/25648)）等未解决问题，Astro 官方标注 Bun 支持为实验性质。

### Local Development

```bash
# 安装依赖
pnpm install

# 启动开发服务器（默认 http://localhost:4321）
pnpm dev

# 构建静态站点
pnpm build

# 本地预览构建产物
pnpm preview

# 运行数据采集脚本
pnpm run fetch        # 从 GitHub 爬取原始数据
pnpm run parse        # 用 Claude API 解析结构化数据
pnpm run aggregate    # 聚合统计数据，生成图表 JSON

# 完整数据更新流程
pnpm run update       # fetch + parse + aggregate 一键执行

# 本地 Cloudflare Pages 预览（模拟生产环境）
pnpm run cf:preview   # 等同于 wrangler pages dev ./dist
```

### Cloudflare Pages Deployment

#### 项目配置

**`wrangler.jsonc`**:
```jsonc
{
  "name": "whoishiring-insight",
  "compatibility_date": "2026-02-13",
  "pages_build_output_dir": "./dist"
}
```

**`astro.config.ts`** 关键配置:
```typescript
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  output: 'static',  // 纯静态输出，不需要 @astrojs/cloudflare 适配器
  site: 'https://your-domain.com',
  integrations: [svelte(), tailwind()],
});
```

#### 自定义域名设置

1. **Cloudflare Dashboard** → Workers & Pages → 选择项目 → Custom domains → Set up a domain
2. **顶级域名** (example.com): 将域名的 nameservers 指向 Cloudflare，系统自动创建 CNAME
3. **子域名** (insight.example.com): 添加 CNAME 记录指向 `whoishiring-insight.pages.dev`
4. SSL 证书自动签发，如有 CAA 记录需添加 `cloudflare.com` 授权

#### GitHub Actions 自动部署

**`.github/workflows/deploy.yml`**:
```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=whoishiring-insight
```

**GitHub Secrets 需配置**:
- `CLOUDFLARE_API_TOKEN`: Cloudflare Dashboard → My Profile → API Tokens → 创建（权限: Cloudflare Pages Edit）
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Dashboard → Workers & Pages 右侧栏

#### 每周自动数据更新

**`.github/workflows/weekly-update.yml`**:
```yaml
name: Weekly Data Update

on:
  schedule:
    - cron: '0 1 * * 5'  # 每周五 UTC 01:00（北京时间 09:00）
  workflow_dispatch:       # 支持手动触发

jobs:
  update:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      deployments: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: Fetch & Parse new data
        run: pnpm run update
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - name: Commit updated data
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/
          git diff --staged --quiet || git commit -m "chore: update hiring data $(date +%Y-%m)"
          git push
      - run: pnpm build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=whoishiring-insight
```

**额外 Secrets**:
- `ANTHROPIC_API_KEY`: Claude API 密钥（用于 LLM 数据解析）

### Interface Design

**数据模型**:

```typescript
interface JobPosting {
  id: string;                    // 唯一标识
  issueNumber: number;           // GitHub Issue 编号
  commentId: number;             // GitHub Comment ID
  yearMonth: string;             // "2026-02" 格式
  author: string;                // GitHub 用户名
  rawContent: string;            // 原始 Markdown 内容

  // LLM 提取字段
  company: string;               // 公司名称
  companyType?: string;          // 大厂/创业/外企/国企
  positions: Position[];         // 岗位列表
  location: string[];            // 工作地点
  isRemote: boolean;             // 是否支持远程
  isOverseas: boolean;           // 是否海外岗位
  salaryRange?: string;          // 薪资范围
  techStack: string[];           // 技术栈要求
  experienceReq?: string;        // 经验要求
  educationReq?: string;         // 学历要求
  contact?: string;              // 联系方式
}

interface Position {
  title: string;                 // 岗位名称
  category: string;              // 前端/后端/全栈/AI/DevOps/产品/设计等
}

interface MonthlyStats {
  yearMonth: string;
  totalPostings: number;
  byCity: Record<string, number>;
  byTechStack: Record<string, number>;
  byCategory: Record<string, number>;
  byCompanyType: Record<string, number>;
  remoteCount: number;
  overseasCount: number;
}
```

## User Experience

### User Flow

1. 用户访问首页 → 看到关键数字（总帖子数、覆盖月份、热门城市）和核心趋势图
2. 可通过顶部导航切换到不同分析维度的页面
3. 每个页面有时间范围筛选器，可聚焦特定时间段
4. 图表支持 hover 查看详情，部分支持点击下钻

### UI/UX Requirements

- **风格**: 现代简约，类似 Linear/Vercel 的设计语言
- **配色**: 以中性色为主，图表使用和谐的数据可视化配色方案
- **排版**: 充足留白，清晰的层级关系
- **响应式**: 桌面端优先，移动端自适应
- **主题**: 支持浅色/深色切换
- **字体**: 中文使用系统字体栈，数字使用等宽字体

## Scope & Constraints

### In Scope

- 从 GitHub Issues 采集所有"谁在招人"历史数据
- LLM 提取结构化招聘信息
- 10+ 个可视化图表展示市场洞察
- 静态站点构建和部署
- 月度自动更新管道

### Out of Scope

- 实时数据更新（非静态方案）
- 用户注册/登录系统
- 招聘信息发布功能
- 与其他招聘平台数据对比
- 个性化推荐

### Constraints

- Claude API 调用成本：约 70+ Issues × 平均 20 条评论 = ~1400 次 API 调用，使用 Haiku 控制成本
- GitHub API 速率限制：需要处理分页和限流
- 数据质量：自由文本格式，部分帖子可能缺少关键信息

## Risks & Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM 提取准确率不足 | 统计数据不可靠 | 设计严格的 prompt，随机抽样人工验证 |
| GitHub API 速率限制 | 采集中断 | 实现增量采集、指数退避、本地缓存 |
| 帖子格式差异大 | 解析困难 | LLM 方案天然适应格式差异 |
| ECharts 包体积大 | 影响加载速度 | 按需引入、Tree shaking、懒加载 |
| 部分帖子无薪资信息 | 薪资分析不完整 | 明确标注"有数据的样本数"，不做过度推断 |

## Dependencies

- GitHub API（数据源）
- Claude API / Anthropic SDK（数据解析）
- Cloudflare Pages（部署）
- GitHub Actions（CI/CD）

## Open Questions

1. 是否需要支持数据导出（CSV/JSON）功能？
2. 是否要展示原始帖子链接，方便用户查看详情？
3. ECharts 中国地图需要额外的地图数据文件，是否需要地图可视化？

---

# Task List

## Progress Overview

| Status | Count |
|--------|-------|
| Total | 12 |
| Completed | 0 |
| Remaining | 12 |

## Tasks

### Phase 1: 数据采集与解析

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | 搭建项目基础结构（Astro + Svelte + Tailwind + ECharts + pnpm），配置 TypeScript，定义数据模型接口，配置 package.json scripts | ⬜ | Acceptance: `pnpm dev` 可运行，TypeScript 编译通过，数据模型定义完整，所有 scripts 就绪 |
| 2 | 实现 GitHub API 数据采集脚本：从 issue body 解析所有历史帖链接，爬取所有 Issues 的评论，过滤被折叠的评论，支持增量采集和本地缓存 | ⬜ | Acceptance: 能采集全部 70+ Issues 的评论数据，自动跳过 minimized 评论，保存为本地 JSON，支持断点续传 |
| 3 | 实现 Claude API 结构化提取：设计 prompt（含招聘/求职分类），批量解析招聘评论为 JobPosting JSON，过滤求职者帖子，结果持久化存储 | ⬜ | Acceptance: LLM 能正确区分招聘帖和求职帖，提取准确率 > 90%（抽样验证），所有评论解析完成并保存 |
| 4 | 实现数据聚合统计脚本：按月、城市、技术栈、岗位类型等维度预计算统计数据，生成图表所需的 JSON 数据文件 | ⬜ | Acceptance: 生成完整的 MonthlyStats 数据，覆盖所有分析维度 |

### Phase 2: 前端页面与可视化

| # | Task | Status | Notes |
|---|------|--------|-------|
| 5 | 实现全局布局：导航栏、页脚、深浅主题切换、响应式布局、时间范围筛选器组件 | ⬜ | Acceptance: 导航流畅、主题切换正常、移动端自适应、筛选器可用 |
| 6 | 实现首页 Overview：关键指标卡片（总帖数、覆盖月份、热门城市、热门技术栈）+ 月度发帖数量趋势核心图表 | ⬜ | Acceptance: 首页展示完整，数据准确，趋势图交互正常 |
| 7 | 实现趋势分析页：岗位类型分布变化、远程岗位占比趋势、学历/经验要求变化趋势、海外岗位趋势等时间线图表 | ⬜ | Acceptance: 至少 4 个趋势图表，支持时间筛选联动 |
| 8 | 实现地域分析页：城市招聘排名柱状图、城市占比变化趋势、热门城市对比 | ⬜ | Acceptance: 城市维度分析完整，图表交互正常 |
| 9 | 实现技术栈分析页：热门技术栈排名、技术栈需求趋势变化（按语言/框架分类）、技术栈词云 | ⬜ | Acceptance: 技术栈维度分析完整，趋势变化清晰可见 |
| 10 | 实现公司分析页：高频招聘公司排名、公司类型分布、薪资区间统计 | ⬜ | Acceptance: 公司维度分析完整，薪资数据标注样本量 |

### Phase 3: 部署与自动化

| # | Task | Status | Notes |
|---|------|--------|-------|
| 11 | 配置 Cloudflare Pages 部署：wrangler.jsonc、astro.config.ts 适配、自定义域名配置、deploy.yml GitHub Action | ⬜ | Acceptance: 网站成功部署到 Cloudflare Pages，push main 自动触发部署 |
| 12 | 配置 GitHub Actions 每周自动更新：weekly-update.yml 定时任务（每周五北京时间9点），爬取→解析→聚合→提交数据→构建→部署完整流程 | ⬜ | Acceptance: Action 可手动/定时触发，完整更新流程正常运行 |

---

## Execution Log

{Execution notes will be appended here}
