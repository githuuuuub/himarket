/**
 * MCP广场相关接口 - Mock 数据版本
 */
import type { RespI } from "../request";

// ==================== 类型定义 ====================

export interface IMcpCold {
  id: number;
  name: string;
  description: string;
  icon: string;
  sourceType: string;
  sourceUrl: string;
  toolsConfig: string;
  origin: "ADMIN" | "GATEWAY" | "USER" | "THIRD_PARTY";
  visibility: "PUBLIC" | "PRIVATE";
  publishStatus: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED";
  gatewayId: string;
  thirdPartySource: string;
  createdBy: string;
  createAt: string;
  subscribed: boolean;
}

export interface IMcpHot {
  id: number;
  mcpColdId: number;
  endpointType: "SSE" | "HTTP" | "STDIO";
  mcpEndpoint: string;
  hotSource: "GATEWAY" | "AGENTRUN" | "USER_DIRECT";
  sandboxInstanceId: string;
  gatewayId: string;
  status: "RUNNING" | "STOPPED" | "FAILED";
  createAt: string;
}

export interface IMcpSubscription {
  subscriptionId: number;
  mcpCold: IMcpCold;
  mcpHot: IMcpHot;
  status: "ACTIVE" | "CANCELLED";
  createAt: string;
}

interface McpMarketListResp {
  content: IMcpCold[];
  number: number;
  size: number;
  totalElements: number;
}

// ==================== Mock 数据 ====================

const MOCK_COLD_LIST: IMcpCold[] = [
  {
    id: 1, name: "Weather MCP", description: "获取全球天气预报数据，支持实时天气、未来7天预报、空气质量指数等查询能力。",
    icon: "", sourceType: "npm", sourceUrl: "https://www.npmjs.com/package/@anthropic/weather-mcp",
    toolsConfig: '{"tools":[{"name":"getWeather","description":"获取指定城市的实时天气数据，包括温度、湿度、风速等"},{"name":"getForecast","description":"获取未来7天的天气预报，支持按小时或按天查询"},{"name":"getAirQuality","description":"获取空气质量指数(AQI)及主要污染物浓度"}]}',
    origin: "ADMIN", visibility: "PUBLIC", publishStatus: "PUBLISHED",
    gatewayId: "", thirdPartySource: "", createdBy: "admin", createAt: "2026-02-15T10:00:00", subscribed: false,
  },
  {
    id: 2, name: "GitHub MCP Server", description: "GitHub API 集成，支持仓库管理、Issue 操作、PR 审查、代码搜索等功能。",
    icon: "", sourceType: "npm", sourceUrl: "https://github.com/modelcontextprotocol/servers",
    toolsConfig: '{"tools":[{"name":"searchRepos","description":"搜索 GitHub 仓库，支持按语言、星标数、更新时间等条件筛选"},{"name":"createIssue","description":"在指定仓库中创建 Issue，支持设置标签、指派人和里程碑"},{"name":"listPRs","description":"列出仓库的 Pull Request，支持按状态和作者筛选"},{"name":"getFileContent","description":"获取仓库中指定文件的内容，支持指定分支或 commit"},{"name":"createBranch","description":"基于指定 ref 创建新分支"}]}',
    origin: "ADMIN", visibility: "PUBLIC", publishStatus: "PUBLISHED",
    gatewayId: "", thirdPartySource: "", createdBy: "admin", createAt: "2026-02-10T08:30:00", subscribed: false,
  },
  {
    id: 3, name: "PostgreSQL MCP", description: "PostgreSQL 数据库查询工具，支持 SQL 执行、表结构查看、数据导出等操作。",
    icon: "", sourceType: "docker", sourceUrl: "docker.io/mcp/postgres:latest",
    toolsConfig: '{"tools":[{"name":"executeQuery","description":"执行 SQL 查询语句并返回结果集，支持参数化查询防止注入"},{"name":"listTables","description":"列出数据库中所有表及其行数、大小等基本信息"},{"name":"describeTable","description":"获取指定表的详细结构，包括列名、类型、约束、索引等"}]}',
    origin: "GATEWAY", visibility: "PUBLIC", publishStatus: "PUBLISHED",
    gatewayId: "gw-001", thirdPartySource: "", createdBy: "admin", createAt: "2026-02-08T14:20:00", subscribed: true,
  },
  {
    id: 4, name: "Slack MCP Server", description: "Slack 工作区集成，支持发送消息、管理频道、搜索历史消息、文件上传等。",
    icon: "", sourceType: "npm", sourceUrl: "https://www.npmjs.com/package/@anthropic/slack-mcp",
    toolsConfig: '{"tools":[{"name":"sendMessage","description":"向指定频道或用户发送消息，支持富文本和 Block Kit 格式"},{"name":"listChannels","description":"列出工作区中的所有频道，支持按类型和成员筛选"},{"name":"searchMessages","description":"全文搜索历史消息，支持按时间范围、频道、发送者筛选"},{"name":"uploadFile","description":"上传文件到指定频道，支持多种文件格式"}]}',
    origin: "THIRD_PARTY", visibility: "PUBLIC", publishStatus: "PUBLISHED",
    gatewayId: "", thirdPartySource: "mcp-registry", createdBy: "system", createAt: "2026-01-20T09:00:00", subscribed: false,
  },
  {
    id: 5, name: "Filesystem MCP", description: "本地文件系统操作工具，支持文件读写、目录浏览、文件搜索等功能。安全沙箱隔离。",
    icon: "", sourceType: "npm", sourceUrl: "https://www.npmjs.com/package/@anthropic/filesystem-mcp",
    toolsConfig: '{"tools":[{"name":"readFile","description":"读取指定路径的文件内容，支持文本和二进制文件"},{"name":"writeFile","description":"将内容写入指定路径的文件，支持创建和覆盖模式"},{"name":"listDirectory","description":"列出目录下的文件和子目录，支持递归和过滤"},{"name":"searchFiles","description":"按文件名或内容模式搜索文件，支持正则表达式"}]}',
    origin: "ADMIN", visibility: "PUBLIC", publishStatus: "PUBLISHED",
    gatewayId: "", thirdPartySource: "", createdBy: "admin", createAt: "2026-01-18T11:00:00", subscribed: false,
  },
  {
    id: 6, name: "Jira MCP Server", description: "Jira 项目管理集成，支持创建/更新 Issue、Sprint 管理、看板操作等。",
    icon: "", sourceType: "git", sourceUrl: "https://github.com/mcp-community/jira-mcp-server",
    toolsConfig: '{"tools":[{"name":"createIssue"},{"name":"updateIssue"},{"name":"listSprints"},{"name":"getBoard"}]}',
    origin: "USER", visibility: "PUBLIC", publishStatus: "PUBLISHED",
    gatewayId: "", thirdPartySource: "", createdBy: "user-001", createAt: "2026-01-15T16:30:00", subscribed: false,
  },
  {
    id: 7, name: "Elasticsearch MCP", description: "Elasticsearch 搜索引擎集成，支持全文搜索、聚合分析、索引管理等。",
    icon: "", sourceType: "docker", sourceUrl: "docker.io/mcp/elasticsearch:latest",
    toolsConfig: '{"tools":[{"name":"search"},{"name":"aggregate"},{"name":"createIndex"},{"name":"deleteIndex"}]}',
    origin: "GATEWAY", visibility: "PUBLIC", publishStatus: "PUBLISHED",
    gatewayId: "gw-002", thirdPartySource: "", createdBy: "admin", createAt: "2026-01-12T13:00:00", subscribed: false,
  },
  {
    id: 8, name: "Notion MCP Server", description: "Notion 知识库集成，支持页面创建/编辑、数据库查询、内容搜索等。",
    icon: "", sourceType: "npm", sourceUrl: "https://www.npmjs.com/package/@anthropic/notion-mcp",
    toolsConfig: '{"tools":[{"name":"createPage"},{"name":"queryDatabase"},{"name":"searchContent"},{"name":"updateBlock"}]}',
    origin: "THIRD_PARTY", visibility: "PUBLIC", publishStatus: "PUBLISHED",
    gatewayId: "", thirdPartySource: "mcp-registry", createdBy: "system", createAt: "2026-01-10T10:00:00", subscribed: false,
  },
  {
    id: 9, name: "Redis MCP", description: "Redis 缓存操作工具，支持键值操作、发布订阅、Stream 消息队列等。",
    icon: "", sourceType: "config", sourceUrl: "",
    toolsConfig: '{"tools":[{"name":"get"},{"name":"set"},{"name":"publish"},{"name":"subscribe"}]}',
    origin: "ADMIN", visibility: "PUBLIC", publishStatus: "PUBLISHED",
    gatewayId: "", thirdPartySource: "", createdBy: "admin", createAt: "2026-01-08T09:30:00", subscribed: false,
  },
  {
    id: 10, name: "Google Maps MCP", description: "Google Maps 地图服务集成，支持地理编码、路线规划、地点搜索、距离计算等。",
    icon: "", sourceType: "npm", sourceUrl: "https://www.npmjs.com/package/@mcp/google-maps",
    toolsConfig: '{"tools":[{"name":"geocode"},{"name":"directions"},{"name":"searchPlaces"},{"name":"distanceMatrix"}]}',
    origin: "THIRD_PARTY", visibility: "PUBLIC", publishStatus: "PUBLISHED",
    gatewayId: "", thirdPartySource: "mcp-registry", createdBy: "system", createAt: "2026-01-05T14:00:00", subscribed: false,
  },
  {
    id: 11, name: "AWS S3 MCP", description: "AWS S3 对象存储操作，支持文件上传下载、桶管理、预签名 URL 生成等。",
    icon: "", sourceType: "npm", sourceUrl: "https://www.npmjs.com/package/@mcp/aws-s3",
    toolsConfig: '{"tools":[{"name":"uploadObject"},{"name":"downloadObject"},{"name":"listBuckets"},{"name":"generatePresignedUrl"}]}',
    origin: "ADMIN", visibility: "PUBLIC", publishStatus: "PUBLISHED",
    gatewayId: "", thirdPartySource: "", createdBy: "admin", createAt: "2026-01-03T11:00:00", subscribed: false,
  },
  {
    id: 12, name: "DingTalk MCP", description: "钉钉集成，支持发送工作通知、群消息、审批流程创建、日程管理等。",
    icon: "", sourceType: "git", sourceUrl: "https://github.com/mcp-community/dingtalk-mcp",
    toolsConfig: '{"tools":[{"name":"sendWorkNotice"},{"name":"sendGroupMessage"},{"name":"createApproval"},{"name":"createSchedule"}]}',
    origin: "USER", visibility: "PUBLIC", publishStatus: "PUBLISHED",
    gatewayId: "", thirdPartySource: "", createdBy: "user-002", createAt: "2025-12-28T16:00:00", subscribed: false,
  },
];

// 已订阅的 mock 数据
let mockMyMcps: IMcpSubscription[] = [
  {
    subscriptionId: 101,
    mcpCold: MOCK_COLD_LIST[2], // PostgreSQL - 网关导入的
    mcpHot: {
      id: 201, mcpColdId: 3, endpointType: "SSE",
      mcpEndpoint: "https://gateway.example.com/mcp/postgresql-server/sse",
      hotSource: "GATEWAY", sandboxInstanceId: "", gatewayId: "gw-001",
      status: "RUNNING", createAt: "2026-02-08T14:20:00",
    },
    status: "ACTIVE", createAt: "2026-02-20T10:00:00",
  },
  {
    subscriptionId: 102,
    mcpCold: {
      id: 100, name: "My Custom Translator", description: "自定义翻译 MCP，支持中英日韩多语言互译，基于自建翻译模型。",
      icon: "", sourceType: "git", sourceUrl: "https://github.com/myuser/translator-mcp",
      toolsConfig: '{"tools":[{"name":"translate"},{"name":"detectLanguage"}]}',
      origin: "USER", visibility: "PRIVATE", publishStatus: "DRAFT",
      gatewayId: "", thirdPartySource: "", createdBy: "current-user", createAt: "2026-03-01T09:00:00", subscribed: true,
    },
    mcpHot: {
      id: 202, mcpColdId: 100, endpointType: "SSE",
      mcpEndpoint: "https://agentrun.example.com/sandbox/mcp/inst-abc123/sse",
      hotSource: "AGENTRUN", sandboxInstanceId: "inst-abc123", gatewayId: "",
      status: "RUNNING", createAt: "2026-03-01T09:01:00",
    },
    status: "ACTIVE", createAt: "2026-03-01T09:01:00",
  },
  {
    subscriptionId: 103,
    mcpCold: {
      id: 101, name: "Stock Price MCP", description: "实时股票行情查询，支持 A 股、港股、美股，提供 K 线数据和技术指标。",
      icon: "", sourceType: "", sourceUrl: "",
      toolsConfig: '{"tools":[{"name":"getQuote"},{"name":"getKLine"},{"name":"getTechnicalIndicator"}]}',
      origin: "USER", visibility: "PRIVATE", publishStatus: "PENDING_REVIEW",
      gatewayId: "", thirdPartySource: "", createdBy: "current-user", createAt: "2026-02-25T15:00:00", subscribed: true,
    },
    mcpHot: {
      id: 203, mcpColdId: 101, endpointType: "HTTP",
      mcpEndpoint: "https://my-stock-mcp.example.com/api/mcp",
      hotSource: "USER_DIRECT", sandboxInstanceId: "", gatewayId: "",
      status: "RUNNING", createAt: "2026-02-25T15:00:00",
    },
    status: "ACTIVE", createAt: "2026-02-25T15:00:00",
  },
];

// ==================== Mock 工具函数 ====================

function mockDelay(ms = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockSuccess<T>(data: T): RespI<T> {
  return { code: "SUCCESS", message: undefined, data } as RespI<T>;
}

// ==================== Mock API ====================

/** 获取MCP广场列表 */
export async function getMcpMarketList(params: {
  keyword?: string;
  page?: number;
  size?: number;
}) {
  await mockDelay(300);
  let list = MOCK_COLD_LIST;
  if (params.keyword) {
    const kw = params.keyword.toLowerCase();
    list = list.filter(
      (c) => c.name.toLowerCase().includes(kw) || c.description.toLowerCase().includes(kw)
    );
  }
  // 同步已订阅状态
  const subscribedIds = new Set(mockMyMcps.map((s) => s.mcpCold.id));
  list = list.map((c) => ({ ...c, subscribed: subscribedIds.has(c.id) }));

  const page = params.page || 0;
  const size = params.size || 30;
  const start = page * size;
  const content = list.slice(start, start + size);
  return mockSuccess<McpMarketListResp>({
    content,
    number: page,
    size,
    totalElements: list.length,
  });
}

/** 获取MCP详情 */
export async function getMcpDetail(params: { mcpColdId: number }) {
  await mockDelay(200);
  const cold = MOCK_COLD_LIST.find((c) => c.id === params.mcpColdId);
  if (!cold) throw new Error("MCP不存在");
  return mockSuccess(cold);
}

/** 订阅MCP */
export async function subscribeMcp(params: { mcpColdId: number }) {
  await mockDelay(800);
  const cold = MOCK_COLD_LIST.find((c) => c.id === params.mcpColdId);
  if (!cold) throw new Error("MCP不存在");

  // 检查是否已订阅
  if (mockMyMcps.some((s) => s.mcpCold.id === params.mcpColdId)) {
    throw new Error("已经订阅过该MCP");
  }

  // 模拟冷→热转换
  const isGateway = cold.origin === "GATEWAY";
  const hot: IMcpHot = {
    id: 300 + params.mcpColdId,
    mcpColdId: params.mcpColdId,
    endpointType: "SSE",
    mcpEndpoint: isGateway
      ? `https://gateway.example.com/mcp/${cold.name.toLowerCase().replace(/\s+/g, "-")}/sse`
      : `https://agentrun.example.com/sandbox/mcp/inst-${Date.now()}/sse`,
    hotSource: isGateway ? "GATEWAY" : "AGENTRUN",
    sandboxInstanceId: isGateway ? "" : `inst-${Date.now()}`,
    gatewayId: cold.gatewayId || "",
    status: "RUNNING",
    createAt: new Date().toISOString(),
  };

  const sub: IMcpSubscription = {
    subscriptionId: 200 + params.mcpColdId,
    mcpCold: { ...cold, subscribed: true },
    mcpHot: hot,
    status: "ACTIVE",
    createAt: new Date().toISOString(),
  };
  mockMyMcps = [...mockMyMcps, sub];
  cold.subscribed = true;

  return mockSuccess(sub);
}

/** 取消订阅 */
export async function unsubscribeMcp(params: { mcpColdId: number }) {
  await mockDelay(400);
  mockMyMcps = mockMyMcps.filter((s) => s.mcpCold.id !== params.mcpColdId);
  const cold = MOCK_COLD_LIST.find((c) => c.id === params.mcpColdId);
  if (cold) cold.subscribed = false;
  return mockSuccess(undefined as void);
}

/** 获取我的MCP列表 */
export async function getMyMcps() {
  await mockDelay(300);
  return mockSuccess(mockMyMcps);
}

/** 用户创建MCP */
export async function createMcpByUser(data: {
  name: string;
  description?: string;
  icon?: string;
  sourceType?: string;
  sourceUrl?: string;
  envVars?: string;
  toolsConfig?: string;
  directEndpoint?: string;
  directEndpointType?: string;
}) {
  await mockDelay(1000);
  const newId = 1000 + Math.floor(Math.random() * 9000);
  const isDirect = !!data.directEndpoint;

  const newCold: IMcpCold = {
    id: newId,
    name: data.name,
    description: data.description || "",
    icon: data.icon || "",
    sourceType: data.sourceType || "",
    sourceUrl: data.sourceUrl || "",
    toolsConfig: data.toolsConfig || "",
    origin: "USER",
    visibility: "PRIVATE",
    publishStatus: "DRAFT",
    gatewayId: "",
    thirdPartySource: "",
    createdBy: "current-user",
    createAt: new Date().toISOString(),
    subscribed: true,
  };

  const newHot: IMcpHot = {
    id: 3000 + newId,
    mcpColdId: newId,
    endpointType: (data.directEndpointType as "SSE" | "HTTP") || "SSE",
    mcpEndpoint: isDirect
      ? data.directEndpoint!
      : `https://agentrun.example.com/sandbox/mcp/inst-${Date.now()}/sse`,
    hotSource: isDirect ? "USER_DIRECT" : "AGENTRUN",
    sandboxInstanceId: isDirect ? "" : `inst-${Date.now()}`,
    gatewayId: "",
    status: "RUNNING",
    createAt: new Date().toISOString(),
  };

  mockMyMcps = [
    ...mockMyMcps,
    {
      subscriptionId: 5000 + newId,
      mcpCold: newCold,
      mcpHot: newHot,
      status: "ACTIVE",
      createAt: new Date().toISOString(),
    },
  ];

  return mockSuccess(newCold);
}

/** 发布MCP到市场 */
export async function publishMcp(params: { mcpColdId: number }) {
  await mockDelay(500);
  mockMyMcps = mockMyMcps.map((s) => {
    if (s.mcpCold.id === params.mcpColdId) {
      return {
        ...s,
        mcpCold: { ...s.mcpCold, publishStatus: "PENDING_REVIEW" as const },
      };
    }
    return s;
  });
  return mockSuccess(undefined as void);
}

/** 取消发布(撤回审核或从市场下架) */
export async function unpublishMcp(params: { mcpColdId: number }) {
  await mockDelay(500);
  mockMyMcps = mockMyMcps.map((s) => {
    if (s.mcpCold.id === params.mcpColdId) {
      return {
        ...s,
        mcpCold: { ...s.mcpCold, publishStatus: "DRAFT" as const, visibility: "PRIVATE" as const },
      };
    }
    return s;
  });
  // 同时从广场冷数据中移除(如果有的话)
  return mockSuccess(undefined as void);
}
