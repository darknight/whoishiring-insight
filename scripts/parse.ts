/**
 * Claude API 结构化解析脚本
 *
 * 读取 data/raw/ 下的原始评论数据，使用 Claude API 提取结构化招聘信息。
 * - 自动分类：招聘帖 / 求职帖 / 其他
 * - 仅对招聘帖提取结构化 JobPosting
 * - 增量解析：跳过已解析的评论
 * - 并发控制 + 指数退避
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { JobPosting, Position } from "../src/types/index.ts";

// ── 配置 ──────────────────────────────────────────────

const MODEL = "claude-haiku-4-5-20251001";
const MAX_CONCURRENCY = 5;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const RAW_DIR = join(ROOT, "data/raw");
const PARSED_DIR = join(ROOT, "data/parsed");

// ── 类型 ──────────────────────────────────────────────

interface RawComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  isMinimized: boolean;
}

interface RawIssue {
  issueNumber: number;
  title: string;
  yearMonth: string;
  comments: RawComment[];
}

interface SkippedComment {
  commentId: number;
  author: string;
  reason: string;
}

interface ParsedIssue {
  issueNumber: number;
  yearMonth: string;
  postings: JobPosting[];
  skipped: SkippedComment[];
  errors: { commentId: number; error: string }[];
}

interface LLMHiringResult {
  type: "hiring";
  company: string;
  companyType: string | null;
  positions: Position[];
  location: string[];
  isRemote: boolean;
  isOverseas: boolean;
  salaryRange: string | null;
  techStack: string[];
  experienceReq: string | null;
  educationReq: string | null;
  contact: string | null;
}

interface LLMSkipResult {
  type: "job_seeking" | "other";
  reason: string;
}

type LLMResult = LLMHiringResult | LLMSkipResult;

// ── Prompt ────────────────────────────────────────────

const SYSTEM_PROMPT = `你是一个专业的招聘信息结构化提取助手。你的任务是分析来自中文技术社区「谁在招人」帖子中的评论，判断其类型并提取结构化数据。

## 分类规则

每条评论属于以下三种类型之一：

1. **hiring** — 招聘帖：由公司/团队发布，目的是招募人才。特征：
   - 提到公司名称、团队名称
   - 列出招聘岗位、职位要求
   - 包含技术栈要求、薪资待遇、工作地点等
   - 语气为"我们在招"、"诚聘"、"急招"等

2. **job_seeking** — 求职帖：由个人发布，目的是找工作。特征：
   - 以第一人称描述自己的技能和经验
   - "求职"、"找工作"、"期望"、"求推荐"等关键词
   - 列出个人技术栈、工作年限
   - 附个人简历链接或联系方式

3. **other** — 其他：不属于招聘或求职，如闲聊、广告、工具推荐等

## 输出格式

你必须返回严格的 JSON（不要包含 markdown 代码块标记）。

### 招聘帖输出：
{
  "type": "hiring",
  "company": "公司名称",
  "companyType": "大厂" | "创业" | "外企" | "国企" | "远程" | null,
  "positions": [{"title": "岗位名称", "category": "分类"}],
  "location": ["城市1", "城市2"],
  "isRemote": false,
  "isOverseas": false,
  "salaryRange": "薪资范围文本 或 null",
  "techStack": ["技术1", "技术2"],
  "experienceReq": "经验要求 或 null",
  "educationReq": "学历要求 或 null",
  "contact": "联系方式 或 null"
}

### 求职帖或其他帖输出：
{
  "type": "job_seeking" | "other",
  "reason": "简要说明判断依据"
}

## 字段说明

- **company**: 尽量提取正式公司名；如只有团队名则使用团队名
- **companyType**: 大厂（BAT、字节、美团等）、创业（初创/中小公司）、外企（外资公司）、国企（国有企业）、远程（远程优先的公司）；无法判断则 null
- **positions.category**: 必须是以下之一：前端、后端、全栈、AI/ML、数据、DevOps、移动端、测试、安全、产品、设计、运营、其他
- **location**: 城市列表，如 ["北京", "上海"]。如果是远程不限地点，填 ["远程"]
- **isRemote**: 是否支持远程工作
- **isOverseas**: 工作地点是否在中国大陆以外（含港澳台）
- **techStack**: 提取所有提到的技术关键词，标准化命名（如 React 不要写 react.js）
- **contact**: 提取邮箱、微信号、链接等联系方式；多个用逗号分隔`;

function buildUserPrompt(comment: RawComment): string {
  return `请分析以下评论并提取结构化数据。

评论作者: ${comment.author}
评论内容:
${comment.body}`;
}

// ── Claude API 调用 ──────────────────────────────────

const client = new Anthropic();

async function callClaudeWithRetry(comment: RawComment): Promise<LLMResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: buildUserPrompt(comment) },
        ],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      // 清理可能的 markdown 代码块标记
      const cleaned = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();

      return JSON.parse(cleaned) as LLMResult;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // 对速率限制和服务器错误进行重试
      const isRetryable =
        lastError.message.includes("rate_limit") ||
        lastError.message.includes("overloaded") ||
        lastError.message.includes("529") ||
        lastError.message.includes("500") ||
        lastError.message.includes("503");

      if (isRetryable && attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
        console.warn(`  ⏳ 重试 (${attempt + 1}/${MAX_RETRIES})，等待 ${Math.round(delay)}ms...`);
        await sleep(delay);
        continue;
      }

      // JSON 解析失败也重试一次
      if (lastError instanceof SyntaxError && attempt < MAX_RETRIES - 1) {
        console.warn(`  ⏳ JSON 解析失败，重试 (${attempt + 1}/${MAX_RETRIES})...`);
        await sleep(BASE_DELAY_MS);
        continue;
      }

      break;
    }
  }

  throw lastError ?? new Error("Unknown error");
}

// ── 并发控制 ─────────────────────────────────────────

async function withConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 单个 Issue 解析 ──────────────────────────────────

async function parseIssue(raw: RawIssue): Promise<ParsedIssue> {
  // 加载已有解析结果（增量解析）
  const parsedPath = join(PARSED_DIR, `${raw.issueNumber}.json`);
  let existing: ParsedIssue | null = null;

  if (existsSync(parsedPath)) {
    existing = JSON.parse(readFileSync(parsedPath, "utf-8")) as ParsedIssue;
  }

  const existingCommentIds = new Set<number>();
  if (existing) {
    for (const p of existing.postings) existingCommentIds.add(p.commentId);
    for (const s of existing.skipped) existingCommentIds.add(s.commentId);
    for (const e of existing.errors) existingCommentIds.add(e.commentId);
  }

  // 过滤出需要解析的评论（排除已解析 + 被折叠的）
  const newComments = raw.comments.filter(
    (c) => !existingCommentIds.has(c.id) && !c.isMinimized,
  );

  if (newComments.length === 0) {
    console.log(`  [${raw.issueNumber}] 无新增评论，跳过`);
    return existing ?? {
      issueNumber: raw.issueNumber,
      yearMonth: raw.yearMonth,
      postings: [],
      skipped: [],
      errors: [],
    };
  }

  console.log(
    `  [${raw.issueNumber}] ${raw.yearMonth} — 共 ${raw.comments.length} 条评论，新增 ${newComments.length} 条`,
  );

  const newPostings: JobPosting[] = [];
  const newSkipped: SkippedComment[] = [];
  const newErrors: { commentId: number; error: string }[] = [];

  let processed = 0;

  await withConcurrency(newComments, MAX_CONCURRENCY, async (comment, _idx) => {
    try {
      const result = await callClaudeWithRetry(comment);

      if (result.type === "hiring") {
        const posting: JobPosting = {
          id: `${raw.issueNumber}-${comment.id}`,
          issueNumber: raw.issueNumber,
          commentId: comment.id,
          yearMonth: raw.yearMonth,
          author: comment.author,
          rawContent: comment.body,
          company: result.company,
          companyType: result.companyType ?? undefined,
          positions: result.positions,
          location: result.location,
          isRemote: result.isRemote ?? false,
          isOverseas: result.isOverseas ?? false,
          salaryRange: result.salaryRange ?? undefined,
          techStack: result.techStack ?? [],
          experienceReq: result.experienceReq ?? undefined,
          educationReq: result.educationReq ?? undefined,
          contact: result.contact ?? undefined,
        };
        newPostings.push(posting);
      } else {
        newSkipped.push({
          commentId: comment.id,
          author: comment.author,
          reason: `[${result.type}] ${result.reason}`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ 评论 ${comment.id} 解析失败: ${msg}`);
      newErrors.push({ commentId: comment.id, error: msg });
    }

    processed++;
    if (processed % 10 === 0 || processed === newComments.length) {
      console.log(`    进度: ${processed}/${newComments.length}`);
    }
  });

  // 合并已有结果和新结果
  const result: ParsedIssue = {
    issueNumber: raw.issueNumber,
    yearMonth: raw.yearMonth,
    postings: [...(existing?.postings ?? []), ...newPostings],
    skipped: [...(existing?.skipped ?? []), ...newSkipped],
    errors: [...(existing?.errors ?? []), ...newErrors],
  };

  return result;
}

// ── 主流程 ────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("错误: 请设置 ANTHROPIC_API_KEY 环境变量");
    process.exit(1);
  }

  if (!existsSync(RAW_DIR)) {
    console.error(`错误: 原始数据目录不存在: ${RAW_DIR}`);
    console.error("请先运行 pnpm run fetch 获取数据");
    process.exit(1);
  }

  if (!existsSync(PARSED_DIR)) {
    mkdirSync(PARSED_DIR, { recursive: true });
  }

  const files = readdirSync(RAW_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.log("没有找到原始数据文件");
    return;
  }

  console.log(`找到 ${files.length} 个 Issue 文件\n`);

  let totalPostings = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(RAW_DIR, file), "utf-8")) as RawIssue;
    const result = await parseIssue(raw);

    // 保存结果
    const outPath = join(PARSED_DIR, `${result.issueNumber}.json`);
    writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");

    const newHiring = result.postings.length;
    const newSkipped = result.skipped.length;
    const newErrors = result.errors.length;

    totalPostings += newHiring;
    totalSkipped += newSkipped;
    totalErrors += newErrors;

    console.log(
      `  ✅ 已保存 → ${outPath} (招聘: ${newHiring}, 跳过: ${newSkipped}, 错误: ${newErrors})\n`,
    );
  }

  console.log("═══════════════════════════════════════");
  console.log(`解析完成!`);
  console.log(`  招聘帖: ${totalPostings}`);
  console.log(`  跳过:   ${totalSkipped}`);
  console.log(`  错误:   ${totalErrors}`);
  console.log("═══════════════════════════════════════");
}

main().catch((err) => {
  console.error("致命错误:", err);
  process.exit(1);
});
