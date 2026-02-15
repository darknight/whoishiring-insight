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
  // ── 前端框架 & 库 ──
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
  "jquery": "jQuery",
  "antd": "Ant Design",
  "antdesign": "Ant Design",
  "ant design": "Ant Design",
  "ant-design": "Ant Design",
  "element-ui": "Element UI",
  "elementui": "Element UI",
  "element ui": "Element UI",
  "element": "Element UI",
  "bootstrap": "Bootstrap",
  "rxjs": "RxJS",
  "mobx": "MobX",
  "redux": "Redux",
  "vuex": "Vuex",
  "pinia": "Pinia",
  "d3.js": "D3.js",
  "d3js": "D3.js",
  "d3": "D3.js",
  "echarts": "ECharts",
  "three.js": "Three.js",
  "threejs": "Three.js",
  "sass": "SASS/SCSS",
  "scss": "SASS/SCSS",
  "less": "Less",
  "canvas": "Canvas",
  "webgl": "WebGL",
  "svg": "SVG",

  // ── 构建工具 ──
  "webpack": "Webpack",
  "vite": "Vite",
  "gulp": "Gulp",
  "rollup": "Rollup",
  "babel": "Babel",
  "esbuild": "esbuild",
  "tailwindcss": "Tailwind CSS",
  "tailwind css": "Tailwind CSS",
  "tailwind": "Tailwind CSS",

  // ── 语言 ──
  "typescript": "TypeScript",
  "ts": "TypeScript",
  "javascript": "JavaScript",
  "js": "JavaScript",
  "html5": "HTML",
  "html": "HTML",
  "h5": "HTML",
  "css3": "CSS",
  "css": "CSS",
  "es5": "ES6+",
  "es6": "ES6+",
  "es6+": "ES6+",
  "es7": "ES6+",
  "es2015": "ES6+",
  "ecmascript": "ES6+",
  "python": "Python",
  "py": "Python",
  "golang": "Go",
  "go": "Go",
  "java": "Java",
  "rust": "Rust",
  "c++": "C++",
  "cpp": "C++",
  "c/c++": "C++",
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
  "c": "C",
  "objective-c": "Objective-C",
  "objectivec": "Objective-C",
  "objc": "Objective-C",
  "oc": "Objective-C",
  "perl": "Perl",
  "haskell": "Haskell",
  "ocaml": "OCaml",
  "shell": "Shell",
  "bash": "Shell",
  "groovy": "Groovy",
  "clojure": "Clojure",
  "erlang": "Erlang",

  // ── Node.js & 后端框架 ──
  "node.js": "Node.js",
  "nodejs": "Node.js",
  "node": "Node.js",
  "express.js": "Express",
  "expressjs": "Express",
  "express": "Express",
  "nestjs": "NestJS",
  "nest.js": "NestJS",
  "nest": "NestJS",
  "koa": "Koa",
  "koa2": "Koa",
  "koa.js": "Koa",
  "egg.js": "Egg.js",
  "eggjs": "Egg.js",
  "egg": "Egg.js",
  "midway": "Midway",
  "midway.js": "Midway",

  // ── Java 生态 ──
  "spring": "Spring",
  "spring boot": "Spring Boot",
  "springboot": "Spring Boot",
  "spring cloud": "Spring Cloud",
  "springcloud": "Spring Cloud",
  "spring mvc": "Spring MVC",
  "springmvc": "Spring MVC",
  "mybatis": "MyBatis",
  "mybatis-plus": "MyBatis",
  "ibatis": "MyBatis",
  "hibernate": "Hibernate",
  "netty": "Netty",
  "dubbo": "Dubbo",
  "maven": "Maven",
  "gradle": "Gradle",

  // ── Python 生态 ──
  "django": "Django",
  "fastapi": "FastAPI",
  "flask": "Flask",

  // ── Go 生态 ──
  "gin": "Gin",
  "fiber": "Fiber",

  // ── 其他后端 ──
  "laravel": "Laravel",
  "rails": "Rails",
  "ruby on rails": "Rails",
  ".net": ".NET",
  "dotnet": ".NET",
  "asp.net": ".NET",

  // ── 数据库 ──
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
  "oracle": "Oracle",
  "hbase": "HBase",
  "hive": "Hive",
  "sql server": "SQL Server",
  "sqlserver": "SQL Server",
  "mssql": "SQL Server",
  "neo4j": "Neo4j",
  "memcached": "Memcached",
  "memcache": "Memcached",
  "zookeeper": "ZooKeeper",
  "zk": "ZooKeeper",

  // ── 云 & DevOps ──
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
  "azure": "Azure",
  "gcp": "GCP",
  "google cloud": "GCP",
  "prometheus": "Prometheus",
  "grafana": "Grafana",
  "helm": "Helm",
  "istio": "Istio",
  "elk": "ELK",
  "git": "Git",
  "gitlab": "GitLab",
  "github": "GitHub",

  // ── 中间件 & 通信 ──
  "graphql": "GraphQL",
  "grpc": "gRPC",
  "kafka": "Kafka",
  "rabbitmq": "RabbitMQ",
  "rocketmq": "RocketMQ",
  "thrift": "Thrift",
  "websocket": "WebSocket",

  // ── AI/ML ──
  "pytorch": "PyTorch",
  "tensorflow": "TensorFlow",
  "llm": "LLM",
  "nlp": "NLP",
  "大模型": "LLM",
  "机器学习": "ML",
  "深度学习": "Deep Learning",
  "bert": "BERT",
  "cuda": "CUDA",
  "opencv": "OpenCV",
  "transformer": "Transformer",
  "rag": "RAG",
  "langchain": "LangChain",
  "aigc": "AIGC",
  "cnn": "CNN",
  "rnn": "RNN",
  "lstm": "LSTM",
  "gpt": "GPT",
  "caffe": "Caffe",
  "mxnet": "MXNet",
  "scikit-learn": "Scikit-learn",
  "sklearn": "Scikit-learn",
  "pandas": "Pandas",
  "numpy": "NumPy",

  // ── 移动端 ──
  "react native": "React Native",
  "reactnative": "React Native",
  "rn": "React Native",
  "flutter": "Flutter",
  "electron": "Electron",
  "android": "Android",
  "ios": "iOS",
  "小程序": "小程序",
  "微信小程序": "小程序",
  "weex": "Weex",
  "taro": "Taro",
  "swiftui": "SwiftUI",
  "harmonyos": "HarmonyOS",
  "鸿蒙": "HarmonyOS",
  "uni-app": "uni-app",
  "uniapp": "uni-app",

  // ── 大数据 ──
  "hadoop": "Hadoop",
  "spark": "Spark",
  "flink": "Flink",
  "hdfs": "HDFS",
  "presto": "Presto",
  "storm": "Storm",
  "etl": "ETL",

  // ── 测试 ──
  "jest": "Jest",
  "cypress": "Cypress",
  "selenium": "Selenium",

  // ── 其他有价值映射 ──
  "serverless": "Serverless",
  "webassembly": "WebAssembly",
  "wasm": "WebAssembly",
  "微前端": "微前端",
  "jvm": "JVM",
  "区块链": "区块链",
  "blockchain": "区块链",
  "计算机视觉": "计算机视觉",
  "cv": "计算机视觉",
  "windows": "Windows",
  "macos": "macOS",
  "mpi": "MPI",
  "opencl": "OpenCL",
  "opengl": "OpenGL",
  "unix": "Unix",
  "自然语言处理": "NLP",
  "gpu": "GPU",
  "pwa": "PWA",
  "webrtc": "WebRTC",
  "yarn": "Yarn",
  "npm": "npm",
  "pnpm": "pnpm",
  "grunt": "Grunt",
  "puppet": "Puppet",
  "rpa": "RPA",
};

// ── 技术栈分类 ────────────────────────────────────────

const TECH_CATEGORIES: Record<string, string[]> = {
  "语言": [
    "TypeScript", "JavaScript", "Python", "Go", "Java", "Rust", "C++", "C#",
    "PHP", "Ruby", "Kotlin", "Swift", "Dart", "Scala", "Elixir", "Lua", "R",
    "C", "Objective-C", "Perl", "Haskell", "OCaml", "Shell", "Groovy",
    "Clojure", "Erlang",
  ],
  "前端": [
    "React", "Vue", "Angular", "Svelte", "Next.js", "Nuxt.js",
    "HTML", "CSS", "jQuery", "SASS/SCSS", "Less", "Ant Design", "Element UI",
    "Bootstrap", "ES6+", "Redux", "Vuex", "Pinia", "MobX", "RxJS",
    "Canvas", "WebGL", "SVG", "D3.js", "ECharts", "Three.js",
    "Webpack", "Vite", "Tailwind CSS", "Electron", "Gulp", "Rollup",
    "Babel", "esbuild", "微前端", "WebAssembly", "PWA", "WebRTC",
    "Grunt", "Yarn", "npm", "pnpm",
  ],
  "后端": [
    "Node.js", "Spring", "Spring Boot", "Django", "FastAPI", "Flask",
    "Express", "Gin", "Fiber", "NestJS", "Laravel", "Rails",
    "Spring Cloud", "Spring MVC", "MyBatis", "Hibernate", "Koa", "Egg.js",
    "Midway", ".NET", "Dubbo", "Maven", "Gradle", "JVM",
  ],
  "数据库": [
    "MySQL", "PostgreSQL", "MongoDB", "Redis", "Elasticsearch", "SQLite",
    "Cassandra", "ClickHouse", "TiDB", "Oracle", "HBase", "Hive",
    "SQL Server", "Neo4j", "Memcached", "ZooKeeper",
  ],
  "云/DevOps": [
    "AWS", "Docker", "Kubernetes", "Linux", "CI/CD", "Jenkins",
    "Terraform", "Ansible", "Nginx", "Azure", "GCP", "Prometheus",
    "Grafana", "Helm", "Istio", "ELK", "Git", "GitLab", "GitHub",
    "Serverless", "Windows", "macOS", "Unix", "Puppet",
  ],
  "AI/ML": [
    "PyTorch", "TensorFlow", "LLM", "NLP", "ML", "Deep Learning",
    "BERT", "CUDA", "OpenCV", "Transformer", "RAG", "LangChain", "AIGC",
    "CNN", "RNN", "LSTM", "GPT", "Caffe", "MXNet", "Scikit-learn",
    "Pandas", "NumPy", "计算机视觉", "GPU", "OpenCL", "MPI",
  ],
  "移动端": [
    "Android", "iOS", "小程序", "React Native", "Flutter", "Weex", "Taro",
    "SwiftUI", "HarmonyOS", "uni-app",
  ],
  "大数据": [
    "Hadoop", "Spark", "Flink", "Hive", "HDFS", "Presto", "Storm", "ETL",
  ],
  "中间件": [
    "GraphQL", "gRPC", "Kafka", "RabbitMQ", "RocketMQ", "Dubbo", "Netty",
    "ZooKeeper", "Thrift", "WebSocket",
  ],
  "测试": [
    "Jest", "Cypress", "Selenium",
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

// ── 城市归一化 ───────────────────────────────────────

/** 主要城市及其区域/地标关键词 */
const CITY_DISTRICTS: Record<string, string[]> = {
  "北京": ["海淀", "朝阳", "望京", "三里屯", "大悦城", "银科", "福码", "中青大厦"],
  "上海": ["浦东", "徐汇", "长宁", "杨浦", "张江", "闵行", "五角场", "唐镇", "世纪大道"],
  "深圳": ["南山", "宝安", "福田", "车公庙", "NEO"],
  "杭州": ["滨江", "余杭", "未来科技城", "未来 Park"],
  "广州": ["天河", "番禺", "白云", "增槎", "科学城", "大学城"],
  "南京": ["江宁", "九龙湖"],
  "武汉": ["武昌", "光谷"],
  "成都": [],
  "西安": [],
  "重庆": [],
  "长沙": ["开福"],
  "天津": ["南开"],
  "合肥": [],
  "苏州": [],
};

/** 省份→省会映射（对只写了省名的情况） */
const PROVINCE_TO_CITY: Record<string, string> = {
  "广东": "广州", "浙江": "杭州", "江苏": "南京", "湖北": "武汉",
  "安徽": "合肥", "河北": "石家庄", "河南": "郑州", "湖南": "长沙",
  "四川": "成都", "陕西": "西安",
};

/** 多城市缩写拆分 */
const MULTI_CITY_ABBRS: Record<string, string[]> = {
  "北上广深杭": ["北京", "上海", "广州", "深圳", "杭州"],
  "北上广深": ["北京", "上海", "广州", "深圳"],
  "北上深杭": ["北京", "上海", "深圳", "杭州"],
  "北/上/深/杭": ["北京", "上海", "深圳", "杭州"],
};

/** 无效/无意义的城市值 */
const INVALID_CITIES = new Set([
  "城市1", "城市2", "未知", "未提及", "未提供", "未提供具体城市",
  "无", "不限", "全国", "全球", "中国",
]);

/**
 * 将原始 location 字符串归一化为城市列表。
 * 返回空数组表示应该丢弃。
 */
function normalizeCity(raw: string): string[] {
  const s = raw.trim();
  if (!s) return [];

  // 无效值
  if (INVALID_CITIES.has(s)) return [];

  // 多城市缩写
  if (MULTI_CITY_ABBRS[s]) return MULTI_CITY_ABBRS[s];

  // 用 / 分隔的多城市："北京/上海"、"深圳/北京"
  if (s.includes("/") && !s.includes("远程")) {
    return s.split("/").flatMap((part) => normalizeCity(part.trim()));
  }

  // "远程 / 混合办公" → "远程"
  if (/远程|remote/i.test(s)) return ["远程"];

  // 尝试前缀匹配主要城市（处理 "上海长宁区"、"北京市朝阳区..." 等）
  for (const city of Object.keys(CITY_DISTRICTS)) {
    if (s.startsWith(city) || s.startsWith(city + "市")) return [city];
  }

  // 独立区名匹配（"海淀"、"望京"、"张江"）
  for (const [city, districts] of Object.entries(CITY_DISTRICTS)) {
    if (districts.some((d) => s.includes(d))) return [city];
  }

  // "安徽省合肥市" → "合肥"，"江苏 南通" → "南通"
  for (const [province, capital] of Object.entries(PROVINCE_TO_CITY)) {
    if (s.startsWith(province)) {
      // 如果省名后面跟了具体城市，尝试提取
      const afterProvince = s.replace(new RegExp(`^${province}[省\\s]*`), "");
      if (afterProvince) {
        const cityMatch = normalizeCity(afterProvince);
        if (cityMatch.length > 0) return cityMatch;
      }
      return [capital];
    }
  }

  // "X市" → "X"（去掉"市"后缀）
  const cityMatch = s.match(/^(.{2,4})市/);
  if (cityMatch) return [cityMatch[1]];

  // 海外城市标准化
  if (/迪拜/.test(s)) return ["迪拜"];
  if (/新加坡/.test(s)) return ["新加坡"];
  if (/大[坂阪]/.test(s)) return ["大阪"];

  // 其他保持原样
  return [s];
}

// ── 经验要求归类 ─────────────────────────────────────

function normalizeExperience(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "其他";
  const s = raw.trim();

  // 不限 / 无要求
  if (/不限|无要求|均可|皆可|没有硬性|无硬性|^无$/.test(s)) return "不限";

  // 应届 / 实习 / 校招
  if (/应届|实习|校招|毕业生|在校/.test(s)) return "应届/实习";

  // 提取年限数字
  const yearMatch = s.match(/(\d+)\s*[-~至到以]\s*(\d+)\s*年/);
  if (yearMatch) {
    const avg = (Number(yearMatch[1]) + Number(yearMatch[2])) / 2;
    if (avg <= 2) return "1-3年";
    if (avg <= 4) return "3-5年";
    if (avg <= 7) return "5-10年";
    return "10年+";
  }

  // "N年以上" / "N年+" / "至少N年"
  const minMatch = s.match(/(\d+)\s*年/);
  if (minMatch) {
    const n = Number(minMatch[1]);
    if (n <= 1) return "1-3年";
    if (n <= 3) return "1-3年";
    if (n <= 5) return "3-5年";
    if (n <= 10) return "5-10年";
    return "10年+";
  }

  // P6/P7 等级别映射
  if (/P[4-5]|T[3-4]|初级|junior/i.test(s)) return "1-3年";
  if (/P[6-7]|T[5-6]|高级|senior/i.test(s)) return "3-5年";
  if (/P[8-9]|T[7-9]|专家|staff|principal/i.test(s)) return "5-10年";

  // 社招（通常 3 年+）
  if (/社招/.test(s)) return "3-5年";

  return "其他";
}

// ── 学历要求归类 ─────────────────────────────────────

function normalizeEducation(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "其他";
  const s = raw.trim();

  if (/不限|无要求|均可/.test(s)) return "不限";
  if (/博士/.test(s)) return "博士";
  if (/硕士|研究生/.test(s)) return "硕士及以上";
  if (/本科|学士|统招|全日制|985|211|双一流/.test(s)) return "本科及以上";
  if (/大专|专科/.test(s)) return "大专及以上";

  return "其他";
}

// ── 辅助函数 ──────────────────────────────────────────

/** 应被过滤掉的非技术词（岗位名、软技能、方法论等） */
const NOISE_TERMS = new Set([
  // 岗位/角色名
  "前端", "后端", "测试", "运维", "产品", "设计", "数据", "安全", "架构", "算法",
  "全栈", "开发", "工程师", "程序员", "技术经理", "技术总监", "CTO", "项目经理",
  "leader", "tech lead",
  // 方法论 & 软技能
  "英语", "软件工程", "面向对象", "敏捷开发", "架构设计", "设计模式",
  "数据结构", "算法", "性能优化", "高并发", "微服务", "分布式系统",
  "高负载", "产品迭代", "逻辑思维", "互联网思维", "需求分析",
  "代码审查", "code review", "技术方案", "系统设计", "领域驱动",
  "高可用", "高性能", "负载均衡", "容灾", "异地多活",
  // 行业/业务词
  "物流", "仓储", "电商", "金融", "教育", "医疗", "游戏", "社交",
  "直播", "短视频", "支付", "广告", "搜索", "推荐",
  // 无效值
  "未知", "无", "岗位信息", "其他", "不限", "N/A", "n/a", "无要求",
  // 过于宽泛的技术/协议词
  "Web", "web", "API", "api", "SDK", "sdk", "HTTP", "http", "TCP", "tcp",
  "RESTful", "restful", "REST", "rest", "MVC", "mvc", "OOP", "oop",
  "SQL", "sql", "NoSQL", "nosql", "RPC", "rpc",
  "TCP/IP", "UDP", "HTTPS", "JSON", "XML", "YAML",
  "RESTful API", "Ajax", "DOM", "Native", "Hybrid",
  // 通用概念词
  "消息队列", "缓存", "数据库", "云计算", "云原生", "虚拟化", "容器化",
  "网络", "网络编程", "并发编程", "多线程", "异步",
  "MVVM", "MVP", "MVI", "Flux",
  "DevOps", "SRE", "DBA",
  "AI", "大数据", "3D", "IoT", "SaaS", "PaaS", "IaaS", "CDN",
  "中间件", "框架", "组件", "工具", "脚手架", "脚本",
  "ARM", "X86", "嵌入式",
  // 架构/模式词
  "分布式", "分布式存储", "分布式计算", "SOA", "CommonJS", "ESM",
  "Cloud Computing", "cloud computing",
  // 更多角色/方向词
  "移动端", "客户端", "服务端", "桌面端", "小游戏",
  // 硬件/平台词
  "Mac", "PC",
]);

function normalizeTech(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 30) return null;  // 过长的大概率是描述性短语
  const key = trimmed.toLowerCase();
  if (NOISE_TERMS.has(trimmed) || NOISE_TERMS.has(key)) return null;
  return TECH_SYNONYMS[key] ?? trimmed;
}

// ── 岗位分类归一化 ──────────────────────────────────

/** 标准岗位分类（AI 输出的 category 会被归一化到这些值） */
const CANONICAL_CATEGORIES: string[] = [
  "前端", "后端", "全栈", "移动端", "AI/ML", "数据",
  "测试", "DevOps", "安全", "游戏开发",
  "设计", "产品", "运营", "管理",
];

const CATEGORY_SYNONYMS: Record<string, string> = {
  // 前端变体
  "Web前端": "前端",
  "前端开发": "前端",
  "H5": "前端",
  // 后端变体
  "后端开发": "后端",
  "服务端": "后端",
  "服务端开发": "后端",
  "基础架构": "后端",
  "基础设施": "后端",
  "系统开发": "后端",
  "系统": "后端",
  "中间件": "后端",
  "网关": "后端",
  "存储": "后端",
  "云原生": "后端",
  "云": "后端",
  "软件": "后端",
  "开发": "后端",
  "研发": "后端",
  // 组合分类 → 取第一个
  "前端/后端": "全栈",
  "前端,后端": "全栈",
  "后端,前端": "全栈",
  "全栈,后端": "全栈",
  "后端, 移动端, 前端, 测试": "全栈",
  "移动端,后端": "全栈",
  // AI/ML
  "AI": "AI/ML",
  "机器学习": "AI/ML",
  "算法": "AI/ML",
  "AI应用开发": "AI/ML",
  // 数据
  "大数据": "数据",
  "数据库": "数据",
  "数据分析": "数据",
  "数据传输": "数据",
  "消息队列": "数据",
  "分析": "数据",
  // DevOps
  "运维": "DevOps",
  "SRE": "DevOps",
  "监控": "DevOps",
  "网络": "DevOps",
  "研发效能": "DevOps",
  // 安全
  "区块链": "安全",
  // 管理
  "项目管理": "管理",
  "技术经理": "管理",
  // 产品
  "产品经理": "产品",
  // 非技术岗 → null
  "人事": null as unknown as string,
  "人力资源": null as unknown as string,
  "法务": null as unknown as string,
  "财务": null as unknown as string,
  "行政": null as unknown as string,
  "销售": null as unknown as string,
  "咨询": null as unknown as string,
  "金融": null as unknown as string,
  "交易": null as unknown as string,
  "增长设计": null as unknown as string,
  "技术支持": null as unknown as string,
  "硬件": null as unknown as string,
  "研究": null as unknown as string,
  "RPA": null as unknown as string,
};

/** 归一化岗位分类，返回 null 表示应跳过 */
function normalizeCategory(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // 直接匹配标准分类
  if (CANONICAL_CATEGORIES.includes(trimmed)) return trimmed;
  // 同义词映射
  if (trimmed in CATEGORY_SYNONYMS) {
    return CATEGORY_SYNONYMS[trimmed];
  }
  return "其他";
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
      for (const loc of p.location ?? []) {
        for (const city of normalizeCity(loc)) {
          incrementMap(byCity, city);
        }
      }
      // 技术栈
      for (const tech of p.techStack ?? []) {
        const normalized = normalizeTech(tech);
        if (normalized) incrementMap(byTechStack, normalized);
      }
      // 岗位分类
      for (const pos of p.positions ?? []) {
        if (pos.category) {
          const cat = normalizeCategory(pos.category);
          if (cat) incrementMap(byCategory, cat);
        }
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
    for (const loc of p.location ?? []) {
      for (const city of normalizeCity(loc)) incrementMap(globalCity, city);
    }
    for (const tech of p.techStack ?? []) {
      const normalized = normalizeTech(tech);
      if (normalized) incrementMap(globalTech, normalized);
    }
    for (const pos of p.positions ?? []) {
      if (pos.category) {
        const cat = normalizeCategory(pos.category);
        if (cat) incrementMap(globalCategory, cat);
      }
    }
    if (p.companyType) incrementMap(globalCompanyType, p.companyType);
    if (p.company) incrementMap(globalCompany, p.company);
    if (p.isRemote) totalRemote++;
    if (p.isOverseas) totalOverseas++;
    if (p.experienceReq) incrementMap(globalExperience, normalizeExperience(p.experienceReq));
    if (p.educationReq) incrementMap(globalEducation, normalizeEducation(p.educationReq));

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
      count: byMonth.get(ym)!.filter((p) => (p.location ?? []).some((loc) => normalizeCity(loc).includes(name))).length,
    }));
  }

  const cityStats = { rankings: cityRankings, trends: cityTrends };

  // ── 4) tech-stats ──

  // 过滤掉 count < 3 的长尾技术，减少词云噪音
  const techRankings = sortedEntries(globalTech).filter((t) => t.count >= 3);

  // 技术趋势: top 20 技术的月度趋势
  const topTechNames = new Set(techRankings.slice(0, 20).map((t) => t.name));
  const techTrends: Record<string, Array<{ yearMonth: string; count: number }>> = {};
  for (const name of topTechNames) {
    techTrends[name] = sortedMonths.map((ym) => ({
      yearMonth: ym,
      count: byMonth.get(ym)!.filter((p) =>
        (p.techStack ?? []).some((t) => normalizeTech(t) === name),
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

  // 岗位分类趋势（使用归一化后的分类，过滤掉总计 < 5 的分类）
  const categoryCountMap: Record<string, number> = {};
  for (const p of postings) {
    for (const pos of p.positions ?? []) {
      if (pos.category) {
        const cat = normalizeCategory(pos.category);
        if (cat) incrementMap(categoryCountMap, cat);
      }
    }
  }
  const significantCategories = Object.entries(categoryCountMap)
    .filter(([, count]) => count >= 5)
    .map(([name]) => name);

  const categoryTrend: Record<string, Array<{ yearMonth: string; count: number }>> = {};
  for (const cat of significantCategories) {
    categoryTrend[cat] = sortedMonths.map((ym) => ({
      yearMonth: ym,
      count: byMonth.get(ym)!.filter((p) =>
        (p.positions ?? []).some((pos) => {
          if (!pos.category) return false;
          return normalizeCategory(pos.category) === cat;
        }),
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

  // 经验要求趋势（归类后）
  const EXP_CATEGORIES = ["不限", "应届/实习", "1-3年", "3-5年", "5-10年", "10年+", "其他"];
  const experienceTrend: Record<string, Array<{ yearMonth: string; count: number }>> = {};
  for (const cat of EXP_CATEGORIES) {
    experienceTrend[cat] = sortedMonths.map((ym) => ({
      yearMonth: ym,
      count: byMonth.get(ym)!.filter((p) => p.experienceReq && normalizeExperience(p.experienceReq) === cat).length,
    }));
  }

  // 学历要求趋势（归类后）
  const EDU_CATEGORIES = ["不限", "大专及以上", "本科及以上", "硕士及以上", "博士", "其他"];
  const educationTrend: Record<string, Array<{ yearMonth: string; count: number }>> = {};
  for (const cat of EDU_CATEGORIES) {
    educationTrend[cat] = sortedMonths.map((ym) => ({
      yearMonth: ym,
      count: byMonth.get(ym)!.filter((p) => p.educationReq && normalizeEducation(p.educationReq) === cat).length,
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
