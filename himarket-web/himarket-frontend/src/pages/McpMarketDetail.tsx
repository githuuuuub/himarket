import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import {
  Spin, Tag, Button, message, Tabs, Alert, Table, Descriptions, Popconfirm,
} from "antd";
import {
  ArrowLeftOutlined, AppstoreOutlined, CloudServerOutlined,
  CopyOutlined, ToolOutlined, CodeOutlined,
  GlobalOutlined, UserOutlined, SafetyCertificateOutlined,
  CheckCircleOutlined, LinkOutlined,
} from "@ant-design/icons";
import APIs from "../lib/apis";
import type { IMcpCold, IMcpHot } from "../lib/apis/mcpMarket";
import MarkdownRender from "../components/MarkdownRender";
import dayjs from "dayjs";

function McpMarketDetail() {
  const { mcpColdId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [cold, setCold] = useState<IMcpCold | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState(false);
  const [error, setError] = useState("");
  const [mcpHot, setMcpHot] = useState<IMcpHot | null>(null);
  const [activeTab, setActiveTab] = useState<string>("intro");

  useEffect(() => {
    const fetchDetail = async () => {
      if (!mcpColdId) return;
      setLoading(true);
      setError("");
      try {
        const response = await APIs.getMcpDetail({ mcpColdId: Number(mcpColdId) });
        if (response.code === "SUCCESS" && response.data) {
          setCold(response.data);
        } else {
          setError("MCP 不存在");
        }
      } catch (e: any) {
        setError(e?.message || "加载失败");
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [mcpColdId]);

  const handleSubscribe = async () => {
    if (!cold) return;
    setSubscribing(true);
    try {
      const response = await APIs.subscribeMcp({ mcpColdId: cold.id });
      if (response.code === "SUCCESS" && response.data) {
        message.success("订阅成功");
        setCold({ ...cold, subscribed: true });
        setMcpHot(response.data.mcpHot);
      }
    } catch (e: any) {
      message.error(e?.message || "订阅失败");
    } finally {
      setSubscribing(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!cold) return;
    setUnsubscribing(true);
    try {
      const response = await APIs.unsubscribeMcp({ mcpColdId: cold.id });
      if (response.code === "SUCCESS") {
        message.success("已取消订阅");
        setCold({ ...cold, subscribed: false });
        setMcpHot(null);
      }
    } catch (e: any) {
      message.error(e?.message || "取消订阅失败");
    } finally {
      setUnsubscribing(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success("已复制");
  };

  // 解析 tools
  const parsedTools: any[] = (() => {
    if (!cold?.toolsConfig) return [];
    try {
      const parsed = JSON.parse(cold.toolsConfig);
      return parsed?.tools || [];
    } catch {
      return [];
    }
  })();

  // 来源标签
  const originMap: Record<string, { text: string; color: string; icon: React.ReactNode }> = {
    ADMIN: { text: "官方", color: "orange", icon: <SafetyCertificateOutlined /> },
    GATEWAY: { text: "网关", color: "blue", icon: <CloudServerOutlined /> },
    USER: { text: "社区", color: "purple", icon: <UserOutlined /> },
    THIRD_PARTY: { text: "第三方", color: "pink", icon: <GlobalOutlined /> },
  };

  // 根据冷数据 sourceType 推断可用的协议 tab
  const getColdProtocols = (): Array<"sse" | "http" | "stdio"> => {
    if (!cold) return [];
    const st = cold.sourceType?.toLowerCase();
    if (st === "npm" || st === "git") return ["stdio"];
    if (st === "docker") return ["sse", "http"];
    if (st === "config") return ["sse"];
    // 默认展示 sse
    return ["sse"];
  };

  // 计算当前应该展示的协议 tabs
  const getAvailableProtocols = (): Array<"sse" | "http" | "stdio"> => {
    const protocols = new Set<"sse" | "http" | "stdio">(getColdProtocols());
    // 热数据有实际端点类型时，加入对应 tab
    if (mcpHot?.endpointType) {
      protocols.add(mcpHot.endpointType.toLowerCase() as "sse" | "http" | "stdio");
    }
    // 保持固定顺序
    return (["sse", "http", "stdio"] as const).filter((p) => protocols.has(p));
  };

  // 生成连接配置 JSON（按协议类型）
  const getConfigJson = (protocol: "sse" | "http" | "stdio") => {
    if (!cold) return "";
    const serverName = cold.name.toLowerCase().replace(/\s+/g, "-");
    const hasRealEndpoint = cold.subscribed && mcpHot?.mcpEndpoint;

    if (protocol === "stdio") {
      const pkg = cold.sourceType === "npm" && cold.sourceUrl
        ? cold.sourceUrl.replace(/^https?:\/\/www\.npmjs\.com\/package\//, "")
        : `@mcp/${serverName}`;
      return JSON.stringify({
        mcpServers: {
          [serverName]: {
            type: "stdio",
            command: "npx",
            args: ["-y", pkg],
          },
        },
      }, null, 2);
    }

    const baseUrl = hasRealEndpoint ? mcpHot!.mcpEndpoint.replace(/\/(sse|mcp)\/?$/, "") : `https://example.com/mcp/${serverName}`;
    return JSON.stringify({
      mcpServers: {
        [serverName]: {
          type: protocol,
          url: protocol === "sse" ? `${baseUrl}/sse` : `${baseUrl}/mcp`,
        },
      },
    }, null, 2);
  };

  // 判断某个 tab 是否有真实数据（热数据匹配 or stdio 类型）
  const isRealConfig = (protocol: "sse" | "http" | "stdio") => {
    if (protocol === "stdio") return true; // stdio 始终是真实的本地配置
    return cold?.subscribed && mcpHot?.endpointType?.toLowerCase() === protocol;
  };

  // 工具表格列
  const toolColumns = [
    {
      title: "工具名称",
      dataIndex: "name",
      key: "name",
      width: 200,
      render: (name: string) => (
        <span className="font-mono text-sm font-medium text-gray-800">
          <CodeOutlined className="text-indigo-400 mr-1.5" />
          {name}
        </span>
      ),
    },
    {
      title: "描述",
      dataIndex: "description",
      key: "description",
      render: (desc: string) => (
        <span className="text-sm text-gray-600">{desc || "暂无描述"}</span>
      ),
    },
  ];

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-[60vh]">
          <Spin size="large" tip="加载中..." />
        </div>
      </Layout>
    );
  }

  if (error || !cold) {
    return (
      <Layout>
        <div className="p-8">
          <Alert message="错误" description={error || "MCP 不存在"} type="error" showIcon />
        </div>
      </Layout>
    );
  }

  const origin = originMap[cold.origin] || { text: cold.origin, color: "default", icon: null };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* 返回按钮 */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 mb-4 px-4 py-2 rounded-xl text-gray-600 hover:text-colorPrimary hover:bg-colorPrimaryBgHover transition-all duration-200 text-sm"
        >
          <ArrowLeftOutlined />
          <span>返回</span>
        </button>

        {/* Header - 毛玻璃卡片 */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/50 p-6 mb-6">
          <div className="flex items-start justify-between gap-6">
            {/* 左侧: 图标 + 信息 */}
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center flex-shrink-0">
                <AppstoreOutlined className="text-purple-500 text-2xl" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                  <h1 className="text-xl font-bold text-gray-900">{cold.name}</h1>
                  <Tag color={origin.color} className="border-0 flex items-center gap-1 m-0">
                    {origin.icon} {origin.text}
                  </Tag>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed mb-3 max-w-2xl">
                  {cold.description || "暂无描述"}
                </p>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <ToolOutlined /> {parsedTools.length} 个工具
                  </span>
                  <span>创建于 {dayjs(cold.createAt).format("YYYY-MM-DD")}</span>
                  {cold.createdBy && <span>by {cold.createdBy}</span>}
                </div>
              </div>
            </div>
            {/* 右侧: 订阅/取消订阅 */}
            <div className="flex-shrink-0 pt-1 flex items-center gap-2">
              {cold.subscribed ? (
                <>
                  <Tag
                    color="green"
                    className="border-0 px-3 py-1 text-sm flex items-center gap-1.5 m-0"
                  >
                    <CheckCircleOutlined /> 已订阅
                  </Tag>
                  <Popconfirm
                    title="确认取消订阅？"
                    description="取消后将无法直接使用此 MCP"
                    onConfirm={handleUnsubscribe}
                    okText="确认"
                    cancelText="取消"
                  >
                    <Button
                      size="small"
                      danger
                      loading={unsubscribing}
                    >
                      取消订阅
                    </Button>
                  </Popconfirm>
                </>
              ) : (
                <Button
                  type="primary"
                  size="large"
                  loading={subscribing}
                  onClick={handleSubscribe}
                >
                  订阅此 MCP
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* 主体 - 左右分栏 */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* 左侧: Tab 内容 */}
          <div className="w-full lg:w-[65%]">
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/50">
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                className="px-6 pt-2"
                items={[
                  {
                    key: "intro",
                    label: "介绍",
                    children: (
                      <div className="pb-6 min-h-[300px]">
                        <div className="markdown-body text-sm" style={{ backgroundColor: 'transparent' }}>
                          <MarkdownRender content={cold.description || "暂无详细介绍"} />
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "tools",
                    label: (
                      <span className="flex items-center gap-1.5">
                        工具列表
                        <span className="text-xs text-gray-400">({parsedTools.length})</span>
                      </span>
                    ),
                    children: (
                      <div className="pb-6 min-h-[300px]">
                        {parsedTools.length > 0 ? (
                          <>
                            <div className="text-xs text-gray-400 mb-3">
                              共 {parsedTools.length} 个工具
                            </div>
                            <Table
                              dataSource={parsedTools.map((t: any, i: number) => ({ ...t, key: i }))}
                              columns={toolColumns}
                              pagination={false}
                              size="small"
                              expandable={{
                                expandedRowRender: (tool: any) => {
                                  if (!tool.inputSchema) return <span className="text-xs text-gray-400">无参数信息</span>;
                                  return (
                                    <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto text-gray-600">
                                      {JSON.stringify(tool.inputSchema, null, 2)}
                                    </pre>
                                  );
                                },
                                rowExpandable: () => true,
                              }}
                            />
                          </>
                        ) : (
                          <div className="text-gray-400 text-center py-12">
                            <ToolOutlined className="text-3xl mb-2 block" />
                            暂无工具信息
                          </div>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </div>

          {/* 右侧: 连接配置 + 基本信息 */}
          <div className="w-full lg:w-[35%]">
            <div className="lg:sticky lg:top-4 space-y-4">
              {/* 连接配置 - 按可用协议动态展示 */}
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/50 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <LinkOutlined className="text-green-500" />
                  连接配置
                </h3>
                {(() => {
                  const protocols = getAvailableProtocols();
                  if (protocols.length === 0) {
                    return (
                      <div className="text-xs text-gray-400 text-center py-4">
                        <CloudServerOutlined className="text-2xl mb-2 block" />
                        暂无连接配置信息
                      </div>
                    );
                  }
                  if (protocols.length === 1) {
                    const protocol = protocols[0];
                    const real = isRealConfig(protocol);
                    return (
                      <div className="relative">
                        <div className="mb-2">
                          <Tag className="m-0 border-0 bg-gray-100 text-gray-600 text-xs">{protocol.toUpperCase()}</Tag>
                        </div>
                        <div className={`bg-gray-900 rounded-lg p-4 overflow-x-auto ${!real ? "opacity-70" : ""}`}>
                          <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            className="absolute top-10 right-2 text-gray-400 hover:text-white z-10"
                            onClick={() => handleCopy(getConfigJson(protocol))}
                          />
                          <pre className="text-xs text-gray-100 font-mono whitespace-pre leading-relaxed">
                            {getConfigJson(protocol)}
                          </pre>
                        </div>
                        {!real && protocol !== "stdio" && (
                          <div className="mt-2 text-xs text-gray-400 text-center">
                            订阅后获取实际连接地址
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <Tabs
                      size="small"
                      defaultActiveKey={mcpHot?.endpointType?.toLowerCase() || protocols[0]}
                      items={protocols.map((protocol) => {
                        const real = isRealConfig(protocol);
                        return {
                          key: protocol,
                          label: protocol.toUpperCase(),
                          children: (
                            <div className="relative">
                              <div className={`bg-gray-900 rounded-lg p-4 overflow-x-auto ${!real ? "opacity-70" : ""}`}>
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<CopyOutlined />}
                                  className="absolute top-2 right-2 text-gray-400 hover:text-white z-10"
                                  onClick={() => handleCopy(getConfigJson(protocol))}
                                />
                                <pre className="text-xs text-gray-100 font-mono whitespace-pre leading-relaxed">
                                  {getConfigJson(protocol)}
                                </pre>
                              </div>
                              {!real && protocol !== "stdio" && (
                                <div className="mt-2 text-xs text-gray-400 text-center">
                                  订阅后获取实际连接地址
                                </div>
                              )}
                              {real && mcpHot?.mcpEndpoint && protocol !== "stdio" && (
                                <div className="mt-2 text-xs text-gray-400">
                                  {mcpHot.hotSource === "GATEWAY" ? "网关" : mcpHot.hotSource === "AGENTRUN" ? "沙箱托管" : "直连"}
                                </div>
                              )}
                            </div>
                          ),
                        };
                      })}
                    />
                  );
                })()}
              </div>

              {/* 基本信息 */}
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/50 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">基本信息</h3>
                <Descriptions column={1} size="small" className="mcp-detail-desc">
                  <Descriptions.Item label="来源">
                    <Tag color={origin.color} className="m-0 border-0">{origin.text}</Tag>
                  </Descriptions.Item>
                  {cold.sourceType && (
                    <Descriptions.Item label="源类型">
                      <Tag className="m-0 border-0 bg-gray-100">{cold.sourceType}</Tag>
                    </Descriptions.Item>
                  )}
                  {cold.sourceUrl && (
                    <Descriptions.Item label="源地址">
                      <div className="flex items-center gap-1 max-w-full">
                        <a
                          href={cold.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline truncate"
                        >
                          {cold.sourceUrl}
                        </a>
                        <CopyOutlined
                          className="text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0"
                          onClick={() => handleCopy(cold.sourceUrl)}
                        />
                      </div>
                    </Descriptions.Item>
                  )}
                  <Descriptions.Item label="工具数">
                    {parsedTools.length} 个
                  </Descriptions.Item>
                  <Descriptions.Item label="创建时间">
                    {dayjs(cold.createAt).format("YYYY-MM-DD HH:mm")}
                  </Descriptions.Item>
                  {cold.createdBy && (
                    <Descriptions.Item label="创建者">
                      {cold.createdBy}
                    </Descriptions.Item>
                  )}
                  {cold.gatewayId && (
                    <Descriptions.Item label="网关ID">
                      <span className="font-mono text-xs">{cold.gatewayId}</span>
                    </Descriptions.Item>
                  )}
                  {cold.thirdPartySource && (
                    <Descriptions.Item label="第三方来源">
                      {cold.thirdPartySource}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default McpMarketDetail;
