/**
 * AI 结构化解析脚本
 *
 * 读取 data/raw/ 下的原始评论数据，使用 AI 模型提取结构化招聘信息。
 * - 支持多模型切换（通过 AI_MODEL 环境变量）
 * - 批量解析（每次 5 条评论）
 * - 增量解析：跳过已解析的评论，自动重试之前失败的
 * - 并发控制 + 指数退避
 *
 * 支持的模型格式（AI_MODEL 环境变量）：
 *   zhipu:glm-5                  （默认，性价比最高）
 *   openai:gpt-4o-mini
 *   anthropic:claude-haiku-4-5-20251001
 *   google:gemini-2.0-flash
 *
 * 对应的 API Key 环境变量：
 *   zhipu     → ZHIPU_API_KEY
 *   openai    → OPENAI_API_KEY
 *   anthropic → ANTHROPIC_API_KEY
 *   google    → GOOGLE_GENERATIVE_AI_API_KEY
 */

import { generateText, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { JobPosting, Position } from "../src/types/index.ts";

// ── 配置 ──────────────────────────────────────────────

const DEFAULT_MODEL = "zhipu:glm-4-flash";
const BATCH_SIZE = 10;
const MAX_CONCURRENCY = 2;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

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
- **contact**: 提取邮箱、微信号、链接等联系方式；多个用逗号分隔

## 批量模式

当用户提交多条评论时（用 [COMMENT N] 标记），你需要返回一个 JSON 数组，每个元素对应一条评论的解析结果，顺序与输入一致。`;

function buildBatchUserPrompt(comments: RawComment[]): string {
  const commentBlocks = comments
    .map(
      (c, i) =>
        `[COMMENT ${i + 1}]\n评论作者: ${c.author}\n评论内容:\n${c.body}`,
    )
    .join("\n\n");

  return `请分析以下 ${comments.length} 条评论并分别提取结构化数据。请返回一个 JSON 数组，按评论顺序一一对应。

${commentBlocks}`;
}

// ── 模型初始化 ───────────────────────────────────────

const PROVIDER_ENV_KEYS: Record<string, string> = {
  zhipu: "ZHIPU_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

function resolveModel(modelStr: string): LanguageModel {
  const colonIdx = modelStr.indexOf(":");
  if (colonIdx === -1) {
    throw new Error(
      `无效的模型格式: "${modelStr}"。请使用 provider:model 格式，如 openai:gpt-4o-mini`,
    );
  }
  const provider = modelStr.slice(0, colonIdx);
  const modelName = modelStr.slice(colonIdx + 1);

  switch (provider) {
    case "zhipu":
      return createOpenAI({
        baseURL: process.env.ZHIPU_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4",
        apiKey: process.env.ZHIPU_API_KEY,
      }).chat(modelName);
    case "openai":
      return createOpenAI().chat(modelName);
    case "anthropic":
      return createAnthropic()(modelName);
    case "google":
      return createGoogleGenerativeAI()(modelName);
    default:
      throw new Error(
        `不支持的 provider: "${provider}"。支持: zhipu, openai, anthropic, google`,
      );
  }
}

// ── AI 调用 ──────────────────────────────────────────

async function callBatchWithRetry(
  model: LanguageModel,
  comments: RawComment[],
): Promise<LLMResult[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { text } = await generateText({
        model,
        maxOutputTokens: 8192,
        system: SYSTEM_PROMPT,
        prompt: buildBatchUserPrompt(comments),
      });

      // 清理可能的 markdown 代码块标记
      const cleaned = text
        .replace(/^[\s\S]*?```(?:json)?\s*/i, "")
        .replace(/\s*```[\s\S]*$/, "")
        .trim() || text.trim();

      let parsed = JSON.parse(cleaned);

      // 如果返回单个对象而非数组（单条评论时常见），包装为数组
      if (!Array.isArray(parsed)) {
        parsed = [parsed];
      }

      // 校验返回数组长度是否与输入一致
      if (parsed.length !== comments.length) {
        throw new SyntaxError(
          `期望返回 ${comments.length} 个结果，实际返回 ${parsed.length}`,
        );
      }

      return parsed as LLMResult[];
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // 对速率限制和服务器错误进行重试
      const isRetryable =
        lastError.message.includes("rate_limit") ||
        lastError.message.includes("overloaded") ||
        lastError.message.includes("429") ||
        lastError.message.includes("529") ||
        lastError.message.includes("500") ||
        lastError.message.includes("503");

      if (isRetryable && attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
        console.warn(`  ⏳ 批次重试 (${attempt + 1}/${MAX_RETRIES})，等待 ${Math.round(delay)}ms...`);
        await sleep(delay);
        continue;
      }

      // JSON 解析失败也重试
      if (lastError instanceof SyntaxError && attempt < MAX_RETRIES - 1) {
        console.warn(`  ⏳ JSON 解析失败，重试 (${attempt + 1}/${MAX_RETRIES}): ${lastError.message}`);
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

async function parseIssue(model: LanguageModel, raw: RawIssue): Promise<ParsedIssue> {
  // 加载已有解析结果（增量解析）
  const parsedPath = join(PARSED_DIR, `${raw.issueNumber}.json`);
  let existing: ParsedIssue | null = null;

  if (existsSync(parsedPath)) {
    existing = JSON.parse(readFileSync(parsedPath, "utf-8")) as ParsedIssue;
  }

  // 构建已成功解析的 commentId 集合（不包含 errors，使其可自动重试）
  const existingCommentIds = new Set<number>();
  if (existing) {
    for (const p of existing.postings) existingCommentIds.add(p.commentId);
    for (const s of existing.skipped) existingCommentIds.add(s.commentId);
    // 注意：不将 errors 中的 commentId 加入集合，以便下次运行时自动重试
  }

  // Issue 作者（ruanyf）的评论是每月汇总帖，非招聘内容，直接跳过
  const ISSUE_AUTHOR = "ruanyf";

  // 过滤出需要解析的评论（排除已成功解析 + 被折叠的 + issue 作者的汇总帖）
  const skippedAuthor: SkippedComment[] = [];
  const newComments = raw.comments.filter((c) => {
    if (existingCommentIds.has(c.id) || c.isMinimized) return false;
    if (c.author === ISSUE_AUTHOR) {
      skippedAuthor.push({
        commentId: c.id,
        author: c.author,
        reason: "[other] Issue 作者汇总帖，跳过",
      });
      return false;
    }
    return true;
  });

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
    `  [${raw.issueNumber}] ${raw.yearMonth} — 共 ${raw.comments.length} 条评论，待解析 ${newComments.length} 条`,
  );

  // 将评论按 BATCH_SIZE 分组
  const batches: RawComment[][] = [];
  for (let i = 0; i < newComments.length; i += BATCH_SIZE) {
    batches.push(newComments.slice(i, i + BATCH_SIZE));
  }

  console.log(
    `    分为 ${batches.length} 个批次（每批最多 ${BATCH_SIZE} 条）`,
  );

  const newPostings: JobPosting[] = [];
  const newSkipped: SkippedComment[] = [];
  const newErrors: { commentId: number; error: string }[] = [];

  let processedBatches = 0;

  await withConcurrency(batches, MAX_CONCURRENCY, async (batch, _idx) => {
    try {
      const results = await callBatchWithRetry(model, batch);

      for (let i = 0; i < batch.length; i++) {
        const comment = batch[i];
        const result = results[i];

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
      }
    } catch (err: unknown) {
      // 整个批次失败时，将批次内所有评论记录为错误
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ 批次解析失败 (${batch.length} 条评论): ${msg}`);
      for (const comment of batch) {
        newErrors.push({ commentId: comment.id, error: msg });
      }
    }

    processedBatches++;
    const processedComments = Math.min(processedBatches * BATCH_SIZE, newComments.length);
    console.log(`    进度: ${processedComments}/${newComments.length} 条评论（${processedBatches}/${batches.length} 批次）`);
  });

  // 收集本次重试成功的 commentId 和跳过的作者 commentId
  const resolvedIds = new Set<number>();
  for (const p of newPostings) resolvedIds.add(p.commentId);
  for (const s of newSkipped) resolvedIds.add(s.commentId);
  for (const s of skippedAuthor) resolvedIds.add(s.commentId);

  // 合并已有结果和新结果，从旧 errors 中移除已解决的 commentId
  const remainingOldErrors = (existing?.errors ?? []).filter(
    (e) => !resolvedIds.has(e.commentId),
  );

  const result: ParsedIssue = {
    issueNumber: raw.issueNumber,
    yearMonth: raw.yearMonth,
    postings: [...(existing?.postings ?? []), ...newPostings],
    skipped: [...(existing?.skipped ?? []), ...newSkipped, ...skippedAuthor],
    errors: [...remainingOldErrors, ...newErrors],
  };

  return result;
}

// ── 主流程 ────────────────────────────────────────────

async function main() {
  const modelStr = process.env.AI_MODEL ?? DEFAULT_MODEL;
  const provider = modelStr.split(":")[0];
  const envKey = PROVIDER_ENV_KEYS[provider];

  if (envKey && !process.env[envKey]) {
    console.error(`错误: 请设置 ${envKey} 环境变量（当前模型: ${modelStr}）`);
    process.exit(1);
  }

  const model = resolveModel(modelStr);
  console.log(`使用模型: ${modelStr}\n`);

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
    const result = await parseIssue(model, raw);

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
