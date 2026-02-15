/**
 * GitHub API 数据采集脚本
 * 从阮一峰周刊 ruanyf/weekly 的「谁在招人」系列 Issues 中采集评论数据
 *
 * 功能：
 * - 搜索所有「谁在招人」Issues
 * - 从 issue body 解析历史帖链接
 * - 使用 GraphQL API 获取评论（支持 isMinimized 过滤）
 * - 增量采集：已有数据时只拉取新评论
 * - 指数退避重试 + rate limit 监控
 * - 保存为 data/raw/{issueNumber}.json
 */

import { Octokit } from "@octokit/rest";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(__dirname, "../data/raw");

const OWNER = "ruanyf";
const REPO = "weekly";

// --- Types ---

interface RawComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  isMinimized: boolean;
}

interface IssueData {
  issueNumber: number;
  title: string;
  yearMonth: string;
  state: "open" | "closed";
  body: string;
  comments: RawComment[];
  fetchedAt: string;
}

// --- Octokit setup ---

function createOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error(
      "[ERROR] GITHUB_TOKEN 未设置。本脚本使用 GraphQL API 获取评论的 isMinimized 字段，需要认证。"
    );
    console.error(
      "请设置环境变量: export GITHUB_TOKEN=ghp_your_token_here"
    );
    process.exit(1);
  }
  return new Octokit({ auth: token });
}

// --- Rate limit & retry ---

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 5
): Promise<T> {
  let delay = 1000;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err.status ?? err.response?.status;
      const isRateLimit = status === 403 || status === 429;
      const isServerError = status >= 500;

      if (attempt === maxRetries || (!isRateLimit && !isServerError)) {
        throw err;
      }

      // For rate limit, check reset time from headers
      if (isRateLimit && err.response?.headers?.["x-ratelimit-reset"]) {
        const resetAt =
          Number(err.response.headers["x-ratelimit-reset"]) * 1000;
        const waitMs = Math.max(resetAt - Date.now() + 1000, delay);
        console.log(
          `  [RATE LIMIT] ${label} - 等待 ${Math.ceil(waitMs / 1000)}s（第 ${attempt}/${maxRetries} 次重试）`
        );
        await sleep(waitMs);
      } else {
        console.log(
          `  [RETRY] ${label} - ${Math.ceil(delay / 1000)}s 后重试（第 ${attempt}/${maxRetries} 次）`
        );
        await sleep(delay);
      }
      delay = Math.min(delay * 2, 60000);
    }
  }
  throw new Error(`Unreachable`);
}

async function checkRateLimit(octokit: Octokit): Promise<void> {
  try {
    const { data } = await octokit.rateLimit.get();
    const graphql = data.resources.graphql;
    const core = data.resources.core;
    console.log(
      `[Rate Limit] REST: ${core.remaining}/${core.limit} | GraphQL: ${graphql.remaining}/${graphql.limit}`
    );
    // If GraphQL limit is low, wait for reset
    if (graphql.remaining < 10) {
      const waitMs = graphql.reset * 1000 - Date.now() + 1000;
      if (waitMs > 0) {
        console.log(
          `  GraphQL 限额即将耗尽，等待 ${Math.ceil(waitMs / 1000)}s...`
        );
        await sleep(waitMs);
      }
    }
  } catch {
    // Ignore rate limit check failures
  }
}

// --- Year-month extraction ---

function extractYearMonth(title: string): string {
  // Pattern: "谁在招人？（2024年1月）" or "谁在招人（2024年12月）"
  // Also handle: "谁在招人？(2024年1月)" with half-width parens
  const match = title.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
  if (match) {
    const year = match[1];
    const month = match[2].padStart(2, "0");
    return `${year}-${month}`;
  }
  // Fallback: try to find just a year
  const yearMatch = title.match(/(\d{4})/);
  if (yearMatch) {
    return `${yearMatch[1]}-01`;
  }
  return "unknown";
}

// --- Issue body link parsing ---

function parseHistoryLinks(body: string): number[] {
  // Find links to other "谁在招人" issues in this repo
  // Pattern: https://github.com/ruanyf/weekly/issues/NNN
  const issueNumbers: number[] = [];
  const regex = /github\.com\/ruanyf\/weekly\/issues\/(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    issueNumbers.push(Number(match[1]));
  }
  return [...new Set(issueNumbers)];
}

// --- GraphQL comment fetching ---

const COMMENTS_QUERY = `
query($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      comments(first: 100, after: $cursor) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          databaseId
          author {
            login
          }
          body
          createdAt
          updatedAt
          isMinimized
        }
      }
    }
  }
}
`;

async function fetchCommentsGraphQL(
  octokit: Octokit,
  issueNumber: number
): Promise<{ comments: RawComment[]; totalCount: number }> {
  const allComments: RawComment[] = [];
  let cursor: string | null = null;
  let totalCount = 0;
  let page = 0;

  while (true) {
    page++;
    const result: any = await withRetry(
      () =>
        octokit.graphql(COMMENTS_QUERY, {
          owner: OWNER,
          repo: REPO,
          number: issueNumber,
          cursor,
        }),
      `GraphQL comments #${issueNumber} page ${page}`
    );

    const commentsData = result.repository.issue.comments;
    totalCount = commentsData.totalCount;

    for (const node of commentsData.nodes) {
      allComments.push({
        id: node.databaseId,
        author: node.author?.login ?? "[deleted]",
        body: node.body,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        isMinimized: node.isMinimized,
      });
    }

    if (!commentsData.pageInfo.hasNextPage) break;
    cursor = commentsData.pageInfo.endCursor;

    // Brief pause between pages to be gentle on the API
    await sleep(200);
  }

  return { comments: allComments, totalCount };
}

// --- Search for "谁在招人" issues ---

interface IssueInfo {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
}

async function searchHiringIssues(octokit: Octokit): Promise<IssueInfo[]> {
  const issues: IssueInfo[] = [];
  let page = 1;

  while (true) {
    console.log(`[搜索] 搜索 Issues - 第 ${page} 页...`);
    const { data } = await withRetry(
      () =>
        octokit.rest.search.issuesAndPullRequests({
          q: `repo:${OWNER}/${REPO} "谁在招人" in:title is:issue`,
          per_page: 100,
          page,
          sort: "created",
          order: "asc",
        }),
      `搜索 Issues 第 ${page} 页`
    );

    for (const item of data.items) {
      issues.push({
        number: item.number,
        title: item.title,
        body: item.body ?? "",
        state: item.state as "open" | "closed",
      });
    }

    // Search API returns total_count; check if we've fetched all
    if (issues.length >= data.total_count || data.items.length === 0) break;

    page++;
    await sleep(500); // Search API has stricter rate limits
  }

  return issues;
}

// --- Init/Incremental mode detection ---

function isInitMode(): boolean {
  if (!existsSync(RAW_DIR)) return true;
  try {
    const files = readdirSync(RAW_DIR).filter((f) => f.endsWith(".json"));
    return files.length === 0;
  } catch {
    return true;
  }
}

// --- Load / save ---

function loadExistingData(issueNumber: number): IssueData | null {
  const filePath = resolve(RAW_DIR, `${issueNumber}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as IssueData;
  } catch {
    return null;
  }
}

function saveIssueData(data: IssueData): void {
  mkdirSync(RAW_DIR, { recursive: true });
  const filePath = resolve(RAW_DIR, `${data.issueNumber}.json`);
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// --- Comment-level merge logic ---

interface MergeStats {
  added: number;
  updated: number;
  skipped: number;
  removed: number;
}

function mergeComments(
  existingComments: RawComment[],
  fetchedComments: RawComment[]
): { merged: RawComment[]; stats: MergeStats } {
  const stats: MergeStats = { added: 0, updated: 0, skipped: 0, removed: 0 };

  // Build a map of existing comments by id for fast lookup
  const existingMap = new Map<number, RawComment>();
  for (const c of existingComments) {
    existingMap.set(c.id, c);
  }

  // Build the merged result from fetched comments (authoritative source)
  const merged: RawComment[] = [];
  const fetchedIds = new Set<number>();

  for (const fetched of fetchedComments) {
    fetchedIds.add(fetched.id);
    const existing = existingMap.get(fetched.id);

    if (!existing) {
      // New comment
      merged.push(fetched);
      stats.added++;
    } else if (existing.updatedAt !== fetched.updatedAt) {
      // Existing comment was updated
      merged.push(fetched);
      stats.updated++;
    } else {
      // No change
      merged.push(existing);
      stats.skipped++;
    }
  }

  // Count removed comments (existed before but not in fetched)
  for (const id of existingMap.keys()) {
    if (!fetchedIds.has(id)) {
      stats.removed++;
    }
  }

  return { merged, stats };
}

// --- Main ---

async function main() {
  console.log("=== whoishiring-insight 数据采集 ===\n");

  const octokit = createOctokit();
  await checkRateLimit(octokit);

  const initMode = isInitMode();
  console.log(`[模式] ${initMode ? "初始化模式（data/raw/ 为空）" : "增量模式（data/raw/ 已有数据）"}\n`);

  // 1) Search all "谁在招人" issues
  console.log("[步骤1] 搜索「谁在招人」Issues...");
  const hiringIssues = await searchHiringIssues(octokit);
  console.log(`  找到 ${hiringIssues.length} 个「谁在招人」Issues`);

  if (hiringIssues.length === 0) {
    console.log("未找到任何 Issue，退出。");
    return;
  }

  // Sort by issue number for consistent ordering
  hiringIssues.sort((a, b) => a.number - b.number);

  // Log state distribution
  const openCount = hiringIssues.filter((i) => i.state === "open").length;
  const closedCount = hiringIssues.filter((i) => i.state === "closed").length;
  console.log(`  其中 open: ${openCount}, closed: ${closedCount}\n`);

  // 2) Collect issue numbers referenced in issue bodies (historical links)
  const allIssueNumbers = new Set(hiringIssues.map((i) => i.number));
  for (const issue of hiringIssues) {
    const linked = parseHistoryLinks(issue.body);
    for (const n of linked) {
      allIssueNumbers.add(n);
    }
  }
  console.log(`  包含历史链接，共计 ${allIssueNumbers.size} 个 Issues\n`);

  // Build a map for quick lookup
  const issueMap = new Map<number, IssueInfo>(
    hiringIssues.map((i) => [i.number, i])
  );

  // For linked issues not in our initial search, fetch their details
  const missingNumbers = [...allIssueNumbers].filter(
    (n) => !issueMap.has(n)
  );
  if (missingNumbers.length > 0) {
    console.log(`[步骤1b] 获取 ${missingNumbers.length} 个历史链接 Issues 的详情...`);
    for (const num of missingNumbers) {
      try {
        const { data } = await withRetry(
          () =>
            octokit.rest.issues.get({
              owner: OWNER,
              repo: REPO,
              issue_number: num,
            }),
          `获取 Issue #${num}`
        );
        issueMap.set(num, {
          number: data.number,
          title: data.title,
          body: data.body ?? "",
          state: data.state as "open" | "closed",
        });
      } catch (err: any) {
        console.warn(`  跳过 Issue #${num}：${err.message}`);
      }
      await sleep(300);
    }
    console.log("");
  }

  // 3) Determine which issues to process based on mode
  const sortedIssueNumbers = [...allIssueNumbers].sort((a, b) => a - b);
  let issuesToProcess: number[];

  if (initMode) {
    // Init mode: process all issues (open + closed)
    issuesToProcess = sortedIssueNumbers;
    console.log(`[步骤2] 初始化模式：处理全部 ${issuesToProcess.length} 个 Issues...\n`);
  } else {
    // Incremental mode: only process open issues
    const skippedClosed: number[] = [];
    issuesToProcess = [];
    for (const num of sortedIssueNumbers) {
      const info = issueMap.get(num);
      const state = info?.state ?? "closed";
      if (state === "open") {
        issuesToProcess.push(num);
      } else {
        skippedClosed.push(num);
      }
    }
    console.log(
      `[步骤2] 增量模式：处理 ${issuesToProcess.length} 个 open Issues，跳过 ${skippedClosed.length} 个 closed Issues`
    );
    if (skippedClosed.length > 0) {
      console.log(
        `  跳过的 closed Issues: ${skippedClosed.map((n) => `#${n}`).join(", ")}`
      );
    }
    console.log("");
  }

  // 4) Fetch comments for each issue to process
  console.log("[步骤3] 获取评论数据...\n");
  let processed = 0;
  const totalToProcess = issuesToProcess.length;
  let totalStats: MergeStats = { added: 0, updated: 0, skipped: 0, removed: 0 };

  for (const issueNumber of issuesToProcess) {
    processed++;
    const issueInfo = issueMap.get(issueNumber);
    const title = issueInfo?.title ?? `Issue #${issueNumber}`;
    const yearMonth = extractYearMonth(title);
    const state = issueInfo?.state ?? "closed";

    console.log(
      `[${processed}/${totalToProcess}] #${issueNumber} ${title} (${yearMonth}) [${state}]`
    );

    // Load existing data for comment-level merge
    const existing = loadExistingData(issueNumber);

    try {
      // Fetch all comments via GraphQL
      const { comments: allFetchedComments, totalCount } =
        await fetchCommentsGraphQL(octokit, issueNumber);

      // Filter out minimized comments
      const validComments = allFetchedComments.filter((c) => !c.isMinimized);
      const minimizedCount = allFetchedComments.length - validComments.length;

      if (minimizedCount > 0) {
        console.log(`  过滤 ${minimizedCount} 条被折叠的评论`);
      }

      // Comment-level merge with existing data
      let finalComments: RawComment[];
      if (existing && existing.comments.length > 0) {
        // Merge: compare fetched comments with existing by id + updatedAt
        const { merged, stats } = mergeComments(existing.comments, validComments);
        finalComments = merged;

        // Accumulate global stats
        totalStats.added += stats.added;
        totalStats.updated += stats.updated;
        totalStats.skipped += stats.skipped;
        totalStats.removed += stats.removed;

        console.log(
          `  评论合并: 新增 ${stats.added}, 更新 ${stats.updated}, 跳过 ${stats.skipped}, 删除 ${stats.removed}` +
          `（API 总数: ${totalCount}）`
        );

        // If nothing changed at all, skip writing
        if (
          stats.added === 0 &&
          stats.updated === 0 &&
          stats.removed === 0 &&
          existing.state === state
        ) {
          console.log(`  无变化，跳过写入`);
          continue;
        }
      } else {
        finalComments = validComments;
        totalStats.added += validComments.length;
        console.log(
          `  新增 ${validComments.length} 条评论（API 总数: ${totalCount}）`
        );
      }

      const issueData: IssueData = {
        issueNumber,
        title,
        yearMonth,
        state,
        body: issueInfo?.body ?? "",
        comments: finalComments,
        fetchedAt: new Date().toISOString(),
      };

      saveIssueData(issueData);
    } catch (err: any) {
      console.error(`  获取 #${issueNumber} 失败: ${err.message}`);
      // Continue with other issues
    }

    // Check rate limit periodically
    if (processed % 5 === 0) {
      await checkRateLimit(octokit);
    }

    await sleep(500);
  }

  console.log("\n=== 采集完成 ===");

  // Print summary
  console.log(`\n[统计] 评论变更汇总:`);
  console.log(`  新增: ${totalStats.added}`);
  console.log(`  更新: ${totalStats.updated}`);
  console.log(`  跳过（无变化）: ${totalStats.skipped}`);
  console.log(`  删除（不再存在）: ${totalStats.removed}`);

  const allFiles = [...allIssueNumbers]
    .sort((a, b) => a - b)
    .filter((n) => existsSync(resolve(RAW_DIR, `${n}.json`)));
  console.log(
    `\n共有 ${allFiles.length} 个 Issue 数据文件在 data/raw/（本次处理 ${totalToProcess} 个）`
  );
}

main().catch((err) => {
  console.error("采集失败:", err);
  process.exit(1);
});
