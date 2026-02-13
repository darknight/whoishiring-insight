/**
 * 数据聚合统计脚本
 *
 * 读取 data/parsed/ 下的解析结果，按多个维度聚合统计，
 * 生成前端图表所需的 JSON 数据文件到 src/data/。
 *
 * 输出文件:
 * - src/data/monthly-stats.json  — MonthlyStats[]
 * - src/data/overview.json       — 首页总览
 * - src/data/city-stats.json     — 城市维度
 * - src/data/tech-stats.json     — 技术栈维度
 * - src/data/company-stats.json  — 公司维度
 * - src/data/trend-stats.json    — 趋势维度
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { JobPosting, MonthlyStats } from "../src/types/index.ts";

// ── 路径 ──────────────────────────────────────────────

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const PARSED_DIR = join(ROOT, "data/parsed");
const OUT_DIR = join(ROOT, "src/data");

// ── 技术栈同义词映射（全小写 key → 标准名称）────────

const TECH_SYNONYMS: Record<string, string> = {
  "react.js": "React",
  "reactjs": "React",
  "react": "React",
  "vue.js": "Vue",
  "vuejs": "Vue",
  "vue": "Vue",
  "vue2": "Vue",
  "vue3": "Vue",
  "angular.js": "Angular",
  "angularjs": "Angular",
  "angular": "Angular",
  "svelte": "Svelte",
  "next.js": "Next.js",
  "nextjs": "Next.js",
  "next": "Next.js",
  "nuxt.js": "Nuxt.js",
  "nuxtjs": "Nuxt.js",
  "nuxt": "Nuxt.js",
  "node.js": "Node.js",
  "nodejs": "Node.js",
  "node": "Node.js",
  "express.js": "Express",
  "expressjs": "Express",
  "express": "Express",
  "nestjs": "NestJS",
  "nest.js": "NestJS",
  "nest": "NestJS",
  "typescript": "TypeScript",
  "ts": "TypeScript",
  "javascript": "JavaScript",
  "js": "JavaScript",
  "python": "Python",
  "py": "Python",
  "golang": "Go",
  "go": "Go",
  "java": "Java",
  "rust": "Rust",
  "c++": "C++",
  "cpp": "C++",
  "c#": "C#",
  "csharp": "C#",
  "php": "PHP",
  "ruby": "Ruby",
  "kotlin": "Kotlin",
  "swift": "Swift",
  "dart": "Dart",
  "scala": "Scala",
  "elixir": "Elixir",
  "lua": "Lua",
  "r": "R",
  "spring": "Spring",
  "spring boot": "Spring Boot",
  "springboot": "Spring Boot",
  "django": "Django",
  "fastapi": "FastAPI",
  "flask": "Flask",
  "gin": "Gin",
  "fiber": "Fiber",
  "laravel": "Laravel",
  "rails": "Rails",
  "ruby on rails": "Rails",
  "mysql": "MySQL",
  "postgresql": "PostgreSQL",
  "postgres": "PostgreSQL",
  "pg": "PostgreSQL",
  "mongodb": "MongoDB",
  "mongo": "MongoDB",
  "redis": "Redis",
  "elasticsearch": "Elasticsearch",
  "es": "Elasticsearch",
  "sqlite": "SQLite",
  "cassandra": "Cassandra",
  "clickhouse": "ClickHouse",
  "tidb": "TiDB",
  "aws": "AWS",
  "docker": "Docker",
  "kubernetes": "Kubernetes",
  "k8s": "Kubernetes",
  "linux": "Linux",
  "ci/cd": "CI/CD",
  "cicd": "CI/CD",
  "jenkins": "Jenkins",
  "terraform": "Terraform",
  "ansible": "Ansible",
  "nginx": "Nginx",
  "graphql": "GraphQL",
  "grpc": "gRPC",
  "kafka": "Kafka",
  "rabbitmq": "RabbitMQ",
  "pytorch": "PyTorch",
  "tensorflow": "TensorFlow",
  "llm": "LLM",
  "nlp": "NLP",
  "大模型": "LLM",
  "机器学习": "ML",
  "深度学习": "Deep Learning",
  "react native": "React Native",
  "flutter": "Flutter",
  "electron": "Electron",
  "webpack": "Webpack",
  "vite": "Vite",
  "tailwindcss": "Tailwind CSS",
  "tailwind css": "Tailwind CSS",
  "tailwind": "Tailwind CSS",
  "three.js": "Three.js",
  "threejs": "Three.js",
};

// ── 技术栈分类 ────────────────────────────────────────

const TECH_CATEGORIES: Record<string, string[]> = {
  "语言": [
    "TypeScript", "JavaScript", "Python", "Go", "Java", "Rust", "C++", "C#",
    "PHP", "Ruby", "Kotlin", "Swift", "Dart", "Scala", "Elixir", "Lua", "R",
  ],
  "前端框架": [
    "React", "Vue", "Angular", "Svelte", "Next.js", "Nuxt.js",
    "React Native", "Flutter", "Electron", "Webpack", "Vite", "Tailwind CSS",
    "Three.js",
  ],
  "后端框架": [
    "Node.js", "Spring", "Spring Boot", "Django", "FastAPI", "Flask",
    "Express", "Gin", "Fiber", "NestJS", "Laravel", "Rails",
  ],
  "数据库": [
    "MySQL", "PostgreSQL", "MongoDB", "Redis", "Elasticsearch", "SQLite",
    "Cassandra", "ClickHouse", "TiDB",
  ],
  "云/DevOps": [
    "AWS", "Docker", "Kubernetes", "Linux", "CI/CD", "Jenkins",
    "Terraform", "Ansible", "Nginx",
  ],
  "AI/ML": [
    "PyTorch", "TensorFlow", "LLM", "NLP", "ML", "Deep Learning",
  ],
  "中间件": [
    "GraphQL", "gRPC", "Kafka", "RabbitMQ",
  ],
};

// 反转为 techName → category
const TECH_TO_CATEGORY: Record<string, string> = {};
for (const [cat, techs] of Object.entries(TECH_CATEGORIES)) {
  for (const t of techs) {
    TECH_TO_CATEGORY[t] = cat;
  }
}

// ── 薪资解析 ──────────────────────────────────────────

interface SalaryBucket {
  range: string;
  count: number;
}

/** 尝试将自由文本薪资解析为月薪 k 区间 [min, max] */
function parseSalaryToMonthlyK(raw: string): [number, number] | null {
  const s = raw.trim().toLowerCase();

  // 面议 / 暂无 / 不限
  if (/面议|议|暂无|不限|competitive/i.test(s)) return null;

  // "15k-25k" or "15K~25K" or "15-25k" or "15k-25K"
  {
    const m = s.match(/(\d+(?:\.\d+)?)\s*k?\s*[-~至到]\s*(\d+(?:\.\d+)?)\s*k/i);
    if (m) return [Number(m[1]), Number(m[2])];
  }

  // "15k-25k" without trailing k (both have k)
  {
    const m = s.match(/(\d+(?:\.\d+)?)\s*k\s*[-~至到]\s*(\d+(?:\.\d+)?)\s*k?/i);
    if (m) return [Number(m[1]), Number(m[2])];
  }

  // "20-40万/年" or "20万-40万" yearly
  {
    const m = s.match(/(\d+(?:\.\d+)?)\s*万?\s*[-~至到]\s*(\d+(?:\.\d+)?)\s*万/);
    if (m) {
      const isYearly = /年/.test(s);
      const divisor = isYearly ? 12 : 1;
      return [
        Math.round((Number(m[1]) * 10) / divisor),
        Math.round((Number(m[2]) * 10) / divisor),
      ];
    }
  }

  // "25k" single value
  {
    const m = s.match(/(\d+(?:\.\d+)?)\s*k/i);
    if (m) {
      const v = Number(m[1]);
      return [v, v];
    }
  }

  return null;
}

function bucketizeSalary(minK: number, maxK: number): string {
  const avg = (minK + maxK) / 2;
  if (avg < 10) return "<10k";
  if (avg < 15) return "10k-15k";
  if (avg < 20) return "15k-20k";
  if (avg < 25) return "20k-25k";
  if (avg < 30) return "25k-30k";
  if (avg < 40) return "30k-40k";
  if (avg < 50) return "40k-50k";
  return "50k+";
}

const SALARY_BUCKET_ORDER = [
  "<10k", "10k-15k", "15k-20k", "20k-25k",
  "25k-30k", "30k-40k", "40k-50k", "50k+",
];

// ── 辅助函数 ──────────────────────────────────────────

function normalizeTech(raw: string): string {
  const key = raw.trim().toLowerCase();
  return TECH_SYNONYMS[key] ?? raw.trim();
}

function incrementMap(map: Record<string, number>, key: string, amount = 1): void {
  map[key] = (map[key] ?? 0) + amount;
}

function sortedEntries(map: Record<string, number>): Array<{ name: string; count: number }> {
  return Object.entries(map)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function topN(map: Record<string, number>, n: number): Array<{ name: string; count: number }> {
  return sortedEntries(map).slice(0, n);
}

// ── 数据加载 ──────────────────────────────────────────

interface ParsedIssue {
  issueNumber: number;
  yearMonth: string;
  postings: JobPosting[];
  skipped: unknown[];
  errors: unknown[];
}

function loadAllPostings(): JobPosting[] {
  if (!existsSync(PARSED_DIR)) return [];

  const files = readdirSync(PARSED_DIR).filter((f) => f.endsWith(".json"));
  const allPostings: JobPosting[] = [];

  for (const file of files) {
    try {
      const data = JSON.parse(
        readFileSync(join(PARSED_DIR, file), "utf-8"),
      ) as ParsedIssue;
      if (data.postings?.length) {
        allPostings.push(...data.postings);
      }
    } catch (err) {
      console.warn(`  跳过无效文件: ${file} — ${err}`);
    }
  }

  return allPostings;
}

// ── 聚合逻辑 ──────────────────────────────────────────

function aggregate(postings: JobPosting[]) {
  // 按月分组
  const byMonth = new Map<string, JobPosting[]>();
  for (const p of postings) {
    const ym = p.yearMonth || "unknown";
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym)!.push(p);
  }

  // 排序月份
  const sortedMonths = [...byMonth.keys()].sort();

  // ── 1) monthly-stats ──

  const monthlyStats: MonthlyStats[] = sortedMonths.map((ym) => {
    const posts = byMonth.get(ym)!;
    const byCity: Record<string, number> = {};
    const byTechStack: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byCompanyType: Record<string, number> = {};
    let remoteCount = 0;
    let overseasCount = 0;

    for (const p of posts) {
      // 城市
      for (const loc of p.location) {
        incrementMap(byCity, loc);
      }
      // 技术栈
      for (const tech of p.techStack) {
        incrementMap(byTechStack, normalizeTech(tech));
      }
      // 岗位分类
      for (const pos of p.positions) {
        if (pos.category) incrementMap(byCategory, pos.category);
      }
      // 公司类型
      if (p.companyType) incrementMap(byCompanyType, p.companyType);
      // 远程 & 海外
      if (p.isRemote) remoteCount++;
      if (p.isOverseas) overseasCount++;
    }

    return {
      yearMonth: ym,
      totalPostings: posts.length,
      byCity,
      byTechStack,
      byCategory,
      byCompanyType,
      remoteCount,
      overseasCount,
    };
  });

  // ── 全局聚合 ──

  const globalCity: Record<string, number> = {};
  const globalTech: Record<string, number> = {};
  const globalCategory: Record<string, number> = {};
  const globalCompanyType: Record<string, number> = {};
  const globalCompany: Record<string, number> = {};
  const globalExperience: Record<string, number> = {};
  const globalEducation: Record<string, number> = {};
  let totalRemote = 0;
  let totalOverseas = 0;

  const salaryBuckets: Record<string, number> = {};
  let salaryValidCount = 0;

  for (const p of postings) {
    for (const loc of p.location) incrementMap(globalCity, loc);
    for (const tech of p.techStack) incrementMap(globalTech, normalizeTech(tech));
    for (const pos of p.positions) {
      if (pos.category) incrementMap(globalCategory, pos.category);
    }
    if (p.companyType) incrementMap(globalCompanyType, p.companyType);
    if (p.company) incrementMap(globalCompany, p.company);
    if (p.isRemote) totalRemote++;
    if (p.isOverseas) totalOverseas++;
    if (p.experienceReq) incrementMap(globalExperience, p.experienceReq);
    if (p.educationReq) incrementMap(globalEducation, p.educationReq);

    // 薪资
    if (p.salaryRange) {
      const parsed = parseSalaryToMonthlyK(p.salaryRange);
      if (parsed) {
        salaryValidCount++;
        const bucket = bucketizeSalary(parsed[0], parsed[1]);
        incrementMap(salaryBuckets, bucket);
      }
    }
  }

  const total = postings.length;

  // ── 2) overview ──

  const overview = {
    totalPostings: total,
    totalMonths: sortedMonths.length,
    dateRange: {
      start: sortedMonths[0] ?? "",
      end: sortedMonths[sortedMonths.length - 1] ?? "",
    },
    topCities: topN(globalCity, 10),
    topTechStack: topN(globalTech, 10),
    topCompanies: topN(globalCompany, 10),
    remotePercentage: total > 0 ? round2((totalRemote / total) * 100) : 0,
    overseasPercentage: total > 0 ? round2((totalOverseas / total) * 100) : 0,
  };

  // ── 3) city-stats ──

  const cityRankings = sortedEntries(globalCity);

  // 城市趋势: top 20 城市的月度趋势
  const topCityNames = new Set(cityRankings.slice(0, 20).map((c) => c.name));
  const cityTrends: Record<string, Array<{ yearMonth: string; count: number }>> = {};
  for (const name of topCityNames) {
    cityTrends[name] = sortedMonths.map((ym) => ({
      yearMonth: ym,
      count: byMonth.get(ym)!.filter((p) => p.location.includes(name)).length,
    }));
  }

  const cityStats = { rankings: cityRankings, trends: cityTrends };

  // ── 4) tech-stats ──

  const techRankings = sortedEntries(globalTech);

  // 技术趋势: top 20 技术的月度趋势
  const topTechNames = new Set(techRankings.slice(0, 20).map((t) => t.name));
  const techTrends: Record<string, Array<{ yearMonth: string; count: number }>> = {};
  for (const name of topTechNames) {
    techTrends[name] = sortedMonths.map((ym) => ({
      yearMonth: ym,
      count: byMonth.get(ym)!.filter((p) =>
        p.techStack.some((t) => normalizeTech(t) === name),
      ).length,
    }));
  }

  // 按分类归组
  const techByCategory: Record<string, Array<{ name: string; count: number }>> = {};
  for (const { name, count } of techRankings) {
    const cat = TECH_TO_CATEGORY[name] ?? "其他";
    if (!techByCategory[cat]) techByCategory[cat] = [];
    techByCategory[cat].push({ name, count });
  }

  const techStats = { rankings: techRankings, trends: techTrends, byCategory: techByCategory };

  // ── 5) company-stats ──

  const companyRankings = sortedEntries(globalCompany);

  const salaryDistribution: SalaryBucket[] = SALARY_BUCKET_ORDER
    .map((range) => ({ range, count: salaryBuckets[range] ?? 0 }))
    .filter((b) => b.count > 0);

  const companyStats = {
    rankings: companyRankings,
    byType: globalCompanyType,
    salaryDistribution,
    salaryValidSamples: salaryValidCount,
  };

  // ── 6) trend-stats ──

  // 发帖趋势
  const postingTrend = sortedMonths.map((ym) => ({
    yearMonth: ym,
    count: byMonth.get(ym)!.length,
  }));

  // 岗位分类趋势
  const allCategories = [...new Set(postings.flatMap((p) => p.positions.map((pos) => pos.category)).filter(Boolean))];
  const categoryTrend: Record<string, Array<{ yearMonth: string; count: number }>> = {};
  for (const cat of allCategories) {
    categoryTrend[cat] = sortedMonths.map((ym) => ({
      yearMonth: ym,
      count: byMonth.get(ym)!.filter((p) =>
        p.positions.some((pos) => pos.category === cat),
      ).length,
    }));
  }

  // 远程趋势
  const remoteTrend = sortedMonths.map((ym) => {
    const posts = byMonth.get(ym)!;
    const count = posts.filter((p) => p.isRemote).length;
    return {
      yearMonth: ym,
      count,
      percentage: posts.length > 0 ? round2((count / posts.length) * 100) : 0,
    };
  });

  // 海外趋势
  const overseasTrend = sortedMonths.map((ym) => {
    const posts = byMonth.get(ym)!;
    const count = posts.filter((p) => p.isOverseas).length;
    return {
      yearMonth: ym,
      count,
      percentage: posts.length > 0 ? round2((count / posts.length) * 100) : 0,
    };
  });

  // 经验要求趋势
  const allExpReqs = [...new Set(postings.map((p) => p.experienceReq).filter(Boolean))] as string[];
  const experienceTrend: Record<string, Array<{ yearMonth: string; count: number }>> = {};
  for (const exp of allExpReqs) {
    experienceTrend[exp] = sortedMonths.map((ym) => ({
      yearMonth: ym,
      count: byMonth.get(ym)!.filter((p) => p.experienceReq === exp).length,
    }));
  }

  // 学历要求趋势
  const allEduReqs = [...new Set(postings.map((p) => p.educationReq).filter(Boolean))] as string[];
  const educationTrend: Record<string, Array<{ yearMonth: string; count: number }>> = {};
  for (const edu of allEduReqs) {
    educationTrend[edu] = sortedMonths.map((ym) => ({
      yearMonth: ym,
      count: byMonth.get(ym)!.filter((p) => p.educationReq === edu).length,
    }));
  }

  const trendStats = {
    postingTrend,
    categoryTrend,
    remoteTrend,
    overseasTrend,
    experienceTrend,
    educationTrend,
  };

  return { monthlyStats, overview, cityStats, techStats, companyStats, trendStats };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── 空数据模板 ────────────────────────────────────────

function emptyData() {
  return {
    monthlyStats: [] as MonthlyStats[],
    overview: {
      totalPostings: 0,
      totalMonths: 0,
      dateRange: { start: "", end: "" },
      topCities: [],
      topTechStack: [],
      topCompanies: [],
      remotePercentage: 0,
      overseasPercentage: 0,
    },
    cityStats: { rankings: [], trends: {} },
    techStats: { rankings: [], trends: {}, byCategory: {} },
    companyStats: { rankings: [], byType: {}, salaryDistribution: [], salaryValidSamples: 0 },
    trendStats: {
      postingTrend: [],
      categoryTrend: {},
      remoteTrend: [],
      overseasTrend: [],
      experienceTrend: {},
      educationTrend: {},
    },
  };
}

// ── Mock 数据生成 ─────────────────────────────────────

function generateMockPostings(): JobPosting[] {
  const cities = ["北京", "上海", "深圳", "杭州", "广州", "成都", "南京", "武汉", "苏州", "厦门", "远程"];
  const companies = [
    { name: "字节跳动", type: "大厂" },
    { name: "阿里巴巴", type: "大厂" },
    { name: "腾讯", type: "大厂" },
    { name: "美团", type: "大厂" },
    { name: "拼多多", type: "大厂" },
    { name: "小红书", type: "大厂" },
    { name: "蚂蚁集团", type: "大厂" },
    { name: "快手", type: "大厂" },
    { name: "Shopify", type: "外企" },
    { name: "Google", type: "外企" },
    { name: "Microsoft", type: "外企" },
    { name: "Amazon", type: "外企" },
    { name: "智谱AI", type: "创业" },
    { name: "月之暗面", type: "创业" },
    { name: "零一万物", type: "创业" },
    { name: "飞书深诺", type: "创业" },
    { name: "PingCAP", type: "创业" },
    { name: "涛思数据", type: "创业" },
    { name: "声网", type: "创业" },
    { name: "极氪", type: "创业" },
    { name: "中国银行软件中心", type: "国企" },
    { name: "中兴通讯", type: "国企" },
  ];
  const techStacks = [
    ["React", "TypeScript", "Node.js", "MySQL"],
    ["Vue", "JavaScript", "Python", "PostgreSQL"],
    ["React", "TypeScript", "Go", "Redis", "Kubernetes"],
    ["Java", "Spring Boot", "MySQL", "Redis", "Docker"],
    ["Python", "Django", "PostgreSQL", "AWS"],
    ["Go", "gRPC", "Kubernetes", "Docker", "Linux"],
    ["React", "Next.js", "TypeScript", "MongoDB"],
    ["Vue", "TypeScript", "Node.js", "Elasticsearch"],
    ["Python", "PyTorch", "TensorFlow", "LLM"],
    ["Rust", "C++", "Linux", "Docker"],
    ["React Native", "TypeScript", "Node.js"],
    ["Flutter", "Dart", "Go", "PostgreSQL"],
    ["Java", "Spring", "Kafka", "Redis", "MySQL"],
    ["Python", "FastAPI", "PostgreSQL", "Docker", "AWS"],
    ["TypeScript", "NestJS", "GraphQL", "MongoDB"],
  ];
  const positionSets: Array<{ title: string; category: string }[]> = [
    [{ title: "高级前端工程师", category: "前端" }],
    [{ title: "后端开发工程师", category: "后端" }],
    [{ title: "全栈工程师", category: "全栈" }],
    [{ title: "AI算法工程师", category: "AI/ML" }],
    [{ title: "DevOps工程师", category: "DevOps" }],
    [{ title: "iOS开发工程师", category: "移动端" }],
    [{ title: "Android开发工程师", category: "移动端" }],
    [{ title: "数据工程师", category: "数据" }],
    [{ title: "测试工程师", category: "测试" }],
    [{ title: "前端开发", category: "前端" }, { title: "后端开发", category: "后端" }],
  ];
  const salaryRanges = ["15k-25k", "20k-35k", "25k-40k", "30k-50k", "40k-60k", "20-40万/年", "15k-20k", "10k-15k", null, null, "面议"];
  const experienceReqs = ["1-3年", "3-5年", "5年以上", "不限", "1年以上", "2-4年", null];
  const educationReqs = ["本科", "硕士", "本科及以上", "不限", null];

  // 生成 2019-08 到 2026-02 的月份
  const months: string[] = [];
  for (let y = 2019; y <= 2026; y++) {
    const startM = y === 2019 ? 8 : 1;
    const endM = y === 2026 ? 2 : 12;
    for (let m = startM; m <= endM; m++) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
    }
  }

  const postings: JobPosting[] = [];
  let idCounter = 1;

  // 模拟趋势: 早期帖数少，逐渐增长，2023-2024 有下降，2025 后 AI 岗位增多
  for (const ym of months) {
    const [year, month] = ym.split("-").map(Number);
    // 基础帖子数随时间增长
    let baseCount = 15 + Math.floor((year - 2019) * 5) + Math.floor(Math.random() * 10);
    // 2023 下半年-2024 稍有下降
    if ((year === 2023 && month >= 7) || year === 2024) {
      baseCount = Math.max(10, baseCount - 8);
    }
    // 2025+ AI 热潮
    if (year >= 2025) {
      baseCount += 5;
    }

    const postCount = Math.max(5, baseCount);
    const issueNumber = 1000 + (year - 2019) * 100 + month;

    for (let i = 0; i < postCount; i++) {
      const companyInfo = companies[Math.floor(Math.random() * companies.length)];
      const stack = techStacks[Math.floor(Math.random() * techStacks.length)];
      const positions = positionSets[Math.floor(Math.random() * positionSets.length)];
      const salary = salaryRanges[Math.floor(Math.random() * salaryRanges.length)];
      const exp = experienceReqs[Math.floor(Math.random() * experienceReqs.length)];
      const edu = educationReqs[Math.floor(Math.random() * educationReqs.length)];

      // 城市: 大厂倾向于大城市，创业公司偏远程
      let cityPool = cities.slice(0, 6);
      if (companyInfo.type === "创业") cityPool = [...cities.slice(0, 8), "远程", "远程"];
      if (companyInfo.type === "外企") cityPool = ["上海", "北京", "远程"];
      const location = [cityPool[Math.floor(Math.random() * cityPool.length)]];

      const isRemote = location[0] === "远程" || Math.random() < 0.12;
      const isOverseas = companyInfo.type === "外企" && Math.random() < 0.3;

      // 2025+ 更多 AI 岗位
      let finalStack = [...stack];
      let finalPositions = [...positions];
      if (year >= 2025 && Math.random() < 0.3) {
        finalStack = ["Python", "PyTorch", "LLM", "TypeScript"];
        finalPositions = [{ title: "AI算法工程师", category: "AI/ML" }];
      }

      postings.push({
        id: `${issueNumber}-${idCounter}`,
        issueNumber,
        commentId: idCounter * 100,
        yearMonth: ym,
        author: `user${Math.floor(Math.random() * 500)}`,
        rawContent: "(mock data)",
        company: companyInfo.name,
        companyType: companyInfo.type,
        positions: finalPositions,
        location,
        isRemote,
        isOverseas: isOverseas && !isRemote ? true : false,
        salaryRange: salary ?? undefined,
        techStack: finalStack,
        experienceReq: exp ?? undefined,
        educationReq: edu ?? undefined,
        contact: `hr@${companyInfo.name.toLowerCase().replace(/[^a-z]/g, "")}.com`,
      });
      idCounter++;
    }
  }

  return postings;
}

// ── 输出 ──────────────────────────────────────────────

function writeJSON(filename: string, data: unknown): void {
  const filePath = join(OUT_DIR, filename);
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`  -> ${filePath}`);
}

// ── 主流程 ────────────────────────────────────────────

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log("=== whoishiring-insight 数据聚合 ===\n");

  // 加载真实数据
  let postings = loadAllPostings();
  let useMock = false;

  if (postings.length === 0) {
    console.log("data/parsed/ 没有数据，生成 mock 数据用于开发...\n");
    postings = generateMockPostings();
    useMock = true;
  } else {
    console.log(`加载了 ${postings.length} 条招聘帖\n`);
  }

  // 执行聚合
  const result = postings.length > 0 ? aggregate(postings) : emptyData();

  // 写入文件
  console.log("写入聚合数据文件:");
  writeJSON("monthly-stats.json", result.monthlyStats);
  writeJSON("overview.json", result.overview);
  writeJSON("city-stats.json", result.cityStats);
  writeJSON("tech-stats.json", result.techStats);
  writeJSON("company-stats.json", result.companyStats);
  writeJSON("trend-stats.json", result.trendStats);

  // 统计摘要
  console.log(`\n=== 聚合完成 ===`);
  console.log(`  数据来源: ${useMock ? "Mock 数据" : "真实数据"}`);
  console.log(`  招聘帖总数: ${result.overview.totalPostings}`);
  console.log(`  覆盖月份: ${result.overview.totalMonths}`);
  if (result.overview.dateRange.start) {
    console.log(`  时间范围: ${result.overview.dateRange.start} ~ ${result.overview.dateRange.end}`);
  }
  console.log(`  城市数: ${result.cityStats.rankings.length}`);
  console.log(`  技术栈数: ${result.techStats.rankings.length}`);
  console.log(`  公司数: ${result.companyStats.rankings.length}`);
}

main();
