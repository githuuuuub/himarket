import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import {
  Spin, Tag, Button, message, Tabs, Alert, Table, Descriptions, Select, Input,
} from "antd";
import {
  ArrowLeftOutlined, AppstoreOutlined,
  CopyOutlined, ToolOutlined, CodeOutlined,
  LinkOutlined, ThunderboltOutlined, CheckOutlined,
  EditOutlined, CloseOutlined,
} from "@ant-design/icons";
import APIs from "../lib/apis";
import type { IProductDetail, IMcpMeta, ISandboxSimple } from "../lib/apis/product";
import { ProductIconRenderer } from "../components/icon/ProductIconRenderer";
import { getIconString } from "../lib/iconUtils";
import dayjs from "dayjs";

function McpDetail() {
  const { mcpProductId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<IProductDetail | null>(null);
  const [meta, setMeta] = useState<IMcpMeta | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<string>("intro");
  const [remoteTransport, setRemoteTransport] = useState<"sse" | "http">("sse");
  const [remoteAuthType, setRemoteAuthType] = useState<"none" | "bearer">("none");
  const [remoteParamValues, setRemoteParamValues] = useState<Record<string, string>>({});
  const [remoteConnecting, setRemoteConnecting] = useState(false);
  const [remoteConfigJson, setRemoteConfigJson] = useState<string>("");
  const [selectedSandbox, setSelectedSandbox] = useState<string | undefined>(undefined);
  const [sandboxList, setSandboxList] = useState<ISandboxSimple[]>([]);
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribedEndpoint, setSubscribedEndpoint] = useState<{ endpointId: string; endpointUrl: string; protocol: string; subscribeParams: string } | null>(null);
  const [remoteEditing, setRemoteEditing] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState(false);

  useEffect(() => {
    const fetchDetail = async () => {
      if (!mcpProductId) return;
      setLoading(true);
      setError("");
      try {
        // 获取产品详情
        const prodRes = await APIs.getProduct({ id: mcpProductId });
        if (prodRes.code === "SUCCESS" && prodRes.data) {
          setProduct(prodRes.data);
          // 获取 MCP meta
          try {
            const metaRes = await APIs.getProductMcpMeta(mcpProductId);
            if (metaRes.code === "SUCCESS" && metaRes.data?.length > 0) {
              setMeta(metaRes.data[0]);
            }
          } catch {
            // meta 可能不存在，不影响页面展示
          }
          // 检查是否已订阅（当前用户的 endpoint 列表中是否有该产品）
          try {
            const epRes = await APIs.getMyEndpoints();
            if (epRes.code === "SUCCESS" && epRes.data) {
              const myEp = epRes.data.find(ep => ep.productId === mcpProductId);
              if (myEp) {
                setSubscribed(true);
                setSubscribedEndpoint({
                  endpointId: myEp.endpointId,
                  endpointUrl: myEp.endpointUrl,
                  protocol: myEp.protocol,
                  subscribeParams: myEp.subscribeParams,
                });
                // 回显 Remote 参数
                if (myEp.subscribeParams) {
                  try {
                    const params = JSON.parse(myEp.subscribeParams);
                    if (params.sandboxId) setSelectedSandbox(params.sandboxId);
                    if (params.transportType) setRemoteTransport(params.transportType);
                    if (params.authType) setRemoteAuthType(params.authType);
                    if (params.extraParams) setRemoteParamValues(params.extraParams);
                  } catch { /* ignore */ }
                }
                // 回显 configJson（Remote 订阅的场景）
                if (myEp.endpointUrl && myEp.hostingType === "SANDBOX") {
                  const sName = (myEp.mcpName || "mcp-server").toLowerCase().replace(/\s+/g, "-");
                  const sConfig: Record<string, string> = { url: myEp.endpointUrl };
                  if (myEp.protocol?.toLowerCase() === "sse") sConfig.type = "sse";
                  setRemoteConfigJson(JSON.stringify({ mcpServers: { [sName]: sConfig } }, null, 2));
                }
              }
            }
          } catch {
            // 未登录或获取失败不影响页面
          }
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
  }, [mcpProductId]);

  // 获取沙箱列表
  useEffect(() => {
    const fetchSandboxes = async () => {
      setSandboxLoading(true);
      try {
        const res = await APIs.getActiveSandboxes();
        if (res.code === "SUCCESS" && res.data) {
          setSandboxList(res.data);
        }
      } catch {
        // 沙箱列表获取失败不影响页面
      } finally {
        setSandboxLoading(false);
      }
    };
    fetchSandboxes();
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success("已复制");
  };

  const handleTryNow = () => {
    if (product) {
      navigate("/chat", { state: { selectedProduct: product } });
    }
  };

  // 显示名称：优先 meta，fallback 到 product
  const displayName = meta?.displayName || meta?.mcpName || product?.name || "";
  const description = meta?.description || product?.description || "";
  const protocolType = meta?.protocolType || product?.mcpConfig?.meta?.protocol || "";
  const origin = meta?.origin || "";
  const repoUrl = meta?.repoUrl || "";
  const tags = meta?.tags ? meta.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
  const serviceIntro = meta?.serviceIntro || "";

  // 解析 tools：优先 meta.toolsConfig，fallback 到 product.mcpConfig.tools
  const parsedTools: any[] = (() => {
    const toolsSource = meta?.toolsConfig || product?.mcpConfig?.tools;
    if (!toolsSource) return [];
    try {
      const parsed = typeof toolsSource === "string" ? JSON.parse(toolsSource) : toolsSource;
      return parsed?.tools || [];
    } catch {
      return [];
    }
  })();

  // 来源标签
  const originMap: Record<string, { text: string; color: string }> = {
    GATEWAY: { text: "网关导入", color: "blue" },
    NACOS: { text: "Nacos导入", color: "cyan" },
    CUSTOM: { text: "自定义配置", color: "purple" },
  };
  const originTag = origin ? (originMap[origin] || { text: origin, color: "default" }) : null;

  // 解析 extraParams（管理员配置的参数列表）
  const extraParams: Array<{ key: string; name: string; position: string; required: boolean; description: string; example: string }> = (() => {
    if (!meta?.extraParams) return [];
    try {
      const parsed = JSON.parse(meta.extraParams);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  })();

  // Remote 连接：通过沙箱订阅
  const handleRemoteConnect = async () => {
    if (!selectedSandbox) {
      message.warning("请选择沙箱");
      return;
    }
    if (!mcpProductId) return;
    // 校验必填参数
    const missing = extraParams.filter(p => p.required && !remoteParamValues[p.name]?.trim());
    if (missing.length > 0) {
      message.warning(`请填写必填参数：${missing.map(p => p.name).join("、")}`);
      return;
    }
    setRemoteConnecting(true);
    try {
      const paramsJson = extraParams.length > 0 ? JSON.stringify(remoteParamValues) : undefined;
      const res = await APIs.subscribeMcp(mcpProductId, {
        sandboxId: selectedSandbox,
        transportType: remoteTransport,
        authType: remoteAuthType,
        params: paramsJson,
      });
      if (res.code === "SUCCESS" && res.data) {
        setSubscribed(true);
        setRemoteEditing(false);
        setSubscribedEndpoint({
          endpointId: res.data.endpointId,
          endpointUrl: res.data.endpointUrl,
          protocol: res.data.protocol,
          subscribeParams: res.data.subscribeParams,
        });
        // 从返回数据构建 configJson
        if (res.data.endpointUrl) {
          const sName = (meta?.mcpName || product?.name || "mcp-server").toLowerCase().replace(/\s+/g, "-");
          const sConfig: Record<string, string> = { url: res.data.endpointUrl };
          if (res.data.protocol?.toLowerCase() === "sse") sConfig.type = "sse";
          setRemoteConfigJson(JSON.stringify({ mcpServers: { [sName]: sConfig } }, null, 2));
        }
        message.success("订阅成功，连接配置已生成");
      } else {
        message.error("订阅失败");
      }
    } catch {
      message.error("订阅失败");
    } finally {
      setRemoteConnecting(false);
    }
  };

  // 订阅 MCP（SSE/HTTP 类型）
  const handleSubscribe = async () => {
    if (!mcpProductId) return;
    setSubscribing(true);
    try {
      const res = await APIs.subscribeMcp(mcpProductId);
      if (res.code === "SUCCESS" && res.data) {
        setSubscribed(true);
        setSubscribedEndpoint({
          endpointId: res.data.endpointId,
          endpointUrl: res.data.endpointUrl,
          protocol: res.data.protocol,
          subscribeParams: res.data.subscribeParams,
        });
        message.success("订阅成功");
      } else {
        message.error("订阅失败");
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || "订阅失败";
      message.error(msg);
    } finally {
      setSubscribing(false);
    }
  };

  // 取消订阅
  const handleUnsubscribe = async () => {
    if (!subscribedEndpoint?.endpointId) return;
    setUnsubscribing(true);
    try {
      const res = await APIs.unsubscribeMcp(subscribedEndpoint.endpointId);
      if (res.code === "SUCCESS") {
        setSubscribed(false);
        setSubscribedEndpoint(null);
        setRemoteConfigJson("");
        setRemoteEditing(false);
        message.success("已取消订阅");
      } else {
        message.error("取消订阅失败");
      }
    } catch (e: any) {
      message.error(e?.response?.data?.message || "取消订阅失败");
    } finally {
      setUnsubscribing(false);
    }
  };

  // 进入编辑模式（回显之前的参数）
  const handleStartEdit = () => {
    if (subscribedEndpoint?.subscribeParams) {
      try {
        const params = JSON.parse(subscribedEndpoint.subscribeParams);
        if (params.sandboxId) setSelectedSandbox(params.sandboxId);
        if (params.transportType) setRemoteTransport(params.transportType);
        if (params.authType) setRemoteAuthType(params.authType);
        if (params.extraParams) setRemoteParamValues(params.extraParams);
      } catch { /* ignore */ }
    }
    setRemoteEditing(true);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setRemoteEditing(false);
  };

  // 生成连接配置 JSON
  const getConfigJson = (protocol: string) => {
    if (!product) return "";
    const serverName = (meta?.mcpName || product.name).toLowerCase().replace(/\s+/g, "-");

    // 优先从 meta.connectionConfig 解析（管理员配置的完整连接信息）
    if (meta?.connectionConfig) {
      try {
        const connConfig = JSON.parse(meta.connectionConfig);
        // 如果 connectionConfig 本身就是完整的 mcpServers 格式，直接返回
        if (connConfig.mcpServers) return JSON.stringify(connConfig, null, 2);
        // 如果是 stdio 配置格式（有 command 字段）
        if (connConfig.command) {
          return JSON.stringify({ mcpServers: { [serverName]: connConfig } }, null, 2);
        }
        // 如果有 mcpServerConfig.domains，用它构建网络协议配置
        if (connConfig.mcpServerConfig?.domains?.length > 0) {
          const domain = connConfig.mcpServerConfig.domains[0];
          const port = domain.port ? `:${domain.port}` : "";
          const baseUrl = `${domain.protocol}://${domain.domain}${port}${connConfig.mcpServerConfig.path || ""}`;
          if (protocol === "sse") {
            return JSON.stringify({ mcpServers: { [serverName]: { type: "sse", url: `${baseUrl}/sse` } } }, null, 2);
          }
          return JSON.stringify({ mcpServers: { [serverName]: { url: baseUrl } } }, null, 2);
        }
        // 如果有 rawConfig（本地 stdio 等配置）
        if (connConfig.mcpServerConfig?.rawConfig) {
          return JSON.stringify(connConfig.mcpServerConfig.rawConfig, null, 2);
        }
      } catch { /* ignore */ }
    }

    // Fallback: 从 product.mcpConfig 构建
    const mcpConfig = product.mcpConfig;
    if (mcpConfig?.mcpServerConfig?.rawConfig) {
      return JSON.stringify(mcpConfig.mcpServerConfig.rawConfig, null, 2);
    }
    if (mcpConfig?.mcpServerConfig?.domains?.length > 0) {
      const domain = mcpConfig.mcpServerConfig.domains[0];
      const port = domain.port ? `:${domain.port}` : "";
      const baseUrl = `${domain.protocol}://${domain.domain}${port}${mcpConfig.mcpServerConfig.path || ""}`;
      if (protocol === "sse") {
        return JSON.stringify({ mcpServers: { [serverName]: { type: "sse", url: `${baseUrl}/sse` } } }, null, 2);
      }
      return JSON.stringify({ mcpServers: { [serverName]: { url: baseUrl } } }, null, 2);
    }

    // stdio fallback：用 repoUrl 或 mcpName 推断
    if (protocol === "stdio") {
      const pkg = meta?.repoUrl
        ? meta.repoUrl.replace(/^https?:\/\/www\.npmjs\.com\/package\//, "")
        : `@mcp/${serverName}`;
      return JSON.stringify({ mcpServers: { [serverName]: { type: "stdio", command: "npx", args: ["-y", pkg] } } }, null, 2);
    }

    return "{}";
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

  if (error || !product) {
    return (
      <Layout>
        <div className="p-8">
          <Alert message="错误" description={error || "MCP 不存在"} type="error" showIcon />
        </div>
      </Layout>
    );
  }

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
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {meta?.icon || product.icon ? (
                  <ProductIconRenderer className="w-full h-full object-cover" iconType={getIconString(meta?.icon ? { type: "URL", value: meta.icon } : product.icon)} />
                ) : (
                  <AppstoreOutlined className="text-purple-500 text-2xl" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                  <h1 className="text-xl font-bold text-gray-900">{displayName}</h1>
                  {originTag && (
                    <Tag color={originTag.color} className="border-0 m-0">{originTag.text}</Tag>
                  )}
                  {protocolType && protocolType.split(",").map(p => p.trim()).filter(Boolean).map(p => (
                    <Tag key={p} color="blue" className="border-0 m-0 bg-blue-50">{p.toUpperCase()}</Tag>
                  ))}
                </div>
                <p className="text-sm text-gray-500 leading-relaxed mb-3 max-w-2xl">
                  {description || "暂无描述"}
                </p>
                <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                  <span className="flex items-center gap-1">
                    <ToolOutlined /> {parsedTools.length} 个工具
                  </span>
                  <span>创建于 {dayjs(product.createAt).format("YYYY-MM-DD")}</span>
                  {product.categories?.[0] && (
                    <Tag className="m-0 border-0 bg-gray-50 text-gray-500 text-xs">{product.categories[0].name}</Tag>
                  )}
                  {tags.slice(0, 3).map((t) => (
                    <Tag key={t} className="m-0 border-0 bg-gray-50 text-gray-500 text-xs">{t}</Tag>
                  ))}
                </div>
              </div>
            </div>
            {/* 右侧: 操作按钮 */}
            <div className="flex-shrink-0 pt-1">
              <Button type="primary" size="large" onClick={handleTryNow}>
                立即体验
              </Button>
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
                        <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                          {serviceIntro || description || "暂无详细介绍"}
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
              {/* 连接配置 */}
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/50 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <LinkOutlined className="text-green-500" />
                  连接配置
                </h3>
                {(() => {
                  // 解析协议列表（支持逗号分隔多值，如 "stdio,sse"）
                  const protocols = protocolType
                    ? protocolType.toLowerCase().split(",").map(p => p.trim()).filter(Boolean)
                    : [];
                  if (protocols.length === 0) {
                    return (
                      <div className="text-xs text-gray-400 text-center py-4">
                        暂无连接配置信息
                      </div>
                    );
                  }

                  const hasStdio = protocols.includes("stdio");
                  const hasSse = protocols.includes("sse");
                  const hasHttp = protocols.includes("http");
                  const hasNetworkProtocol = hasSse || hasHttp;
                  const isGatewayOrNacos = origin === "GATEWAY" || origin === "NACOS";

                  // 构建 tab 列表
                  const tabItems: { key: string; label: string; children: React.ReactNode }[] = [];

                  // Remote tab（stdio 或有沙箱部署需求时展示）
                  if (hasStdio) {
                    tabItems.push({
                      key: "remote",
                      label: "Remote",
                      children: renderRemoteTab(),
                    });
                    tabItems.push({
                      key: "stdio",
                      label: "STDIO",
                      children: renderConfigJsonBlock(getConfigJson("stdio")),
                    });
                  }

                  // SSE tab
                  if (hasSse) {
                    tabItems.push({
                      key: "sse",
                      label: "SSE",
                      children: (() => {
                        if (isGatewayOrNacos || subscribed) {
                          return renderConfigJsonBlock(getConfigJson("sse"));
                        }
                        return <p className="text-xs text-gray-400 py-2">订阅后即可获取连接配置</p>;
                      })(),
                    });
                  }

                  // Streamable HTTP tab
                  if (hasHttp) {
                    tabItems.push({
                      key: "http",
                      label: "Streamable HTTP",
                      children: (() => {
                        if (isGatewayOrNacos || subscribed) {
                          return renderConfigJsonBlock(getConfigJson("http"));
                        }
                        return <p className="text-xs text-gray-400 py-2">订阅后即可获取连接配置</p>;
                      })(),
                    });
                  }

                  return (
                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        {protocols.map(p => (
                          <Tag key={p} className="m-0 border-0 bg-gray-100 text-gray-600 text-xs">{p.toUpperCase()}</Tag>
                        ))}
                        {subscribed && (
                          <Tag color="green" className="m-0 border-0">已订阅</Tag>
                        )}
                      </div>
                      <Tabs size="small" defaultActiveKey={tabItems[0]?.key} items={tabItems} />
                      {/* 订阅/取消订阅按钮（仅网络协议类型需要，stdio 在 Remote tab 内处理） */}
                      {hasNetworkProtocol && (
                        <div className="mt-3">
                          {!subscribed ? (
                            <div className="space-y-2">
                              {isGatewayOrNacos && (
                                <p className="text-xs text-gray-400">订阅后即可使用该连接</p>
                              )}
                              <Button
                                type="primary"
                                size="small"
                                icon={<ThunderboltOutlined />}
                                loading={subscribing}
                                onClick={handleSubscribe}
                                block
                              >
                                订阅
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="small"
                              danger
                              loading={unsubscribing}
                              onClick={handleUnsubscribe}
                              block
                            >
                              取消订阅
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* 基本信息 */}
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/50 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">基本信息</h3>
                <Descriptions column={1} size="small">
                  {originTag && (
                    <Descriptions.Item label="来源">
                      <Tag color={originTag.color} className="m-0 border-0">{originTag.text}</Tag>
                    </Descriptions.Item>
                  )}
                  {protocolType && (
                    <Descriptions.Item label="协议">
                      <div className="flex flex-wrap gap-1">
                        {protocolType.split(",").map(p => p.trim()).filter(Boolean).map(p => (
                          <Tag key={p} color="blue" className="m-0 border-0 bg-blue-50">{p.toUpperCase()}</Tag>
                        ))}
                      </div>
                    </Descriptions.Item>
                  )}
                  {repoUrl && (
                    <Descriptions.Item label="仓库地址">
                      <div className="flex items-center gap-1 max-w-full">
                        <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline truncate">
                          {repoUrl}
                        </a>
                        <CopyOutlined className="text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0" onClick={() => handleCopy(repoUrl)} />
                      </div>
                    </Descriptions.Item>
                  )}
                  <Descriptions.Item label="工具数">
                    {parsedTools.length} 个
                  </Descriptions.Item>
                  <Descriptions.Item label="创建时间">
                    {dayjs(product.createAt).format("YYYY-MM-DD HH:mm")}
                  </Descriptions.Item>
                  {product.categories?.length > 0 && (
                    <Descriptions.Item label="分类">
                      {product.categories.map(c => (
                        <Tag key={c.categoryId} className="m-0 border-0 bg-gray-50 text-gray-600 text-xs">{c.name}</Tag>
                      ))}
                    </Descriptions.Item>
                  )}
                  {tags.length > 0 && (
                    <Descriptions.Item label="标签">
                      <div className="flex flex-wrap gap-1">
                        {tags.map(t => (
                          <Tag key={t} className="m-0 border-0 bg-purple-50 text-purple-600 text-xs">{t}</Tag>
                        ))}
                      </div>
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

  function renderRemoteTab() {
    // 已订阅 + 非编辑模式：显示配置 + 取消订阅/修改按钮
    if (subscribed && !remoteEditing) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Tag color="green" className="m-0 border-0">已订阅</Tag>
          </div>
          {renderConfigJsonBlock(remoteConfigJson)}
          <div className="flex gap-2">
            <Button
              size="small"
              danger
              loading={unsubscribing}
              onClick={handleUnsubscribe}
              block
            >
              取消订阅
            </Button>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={handleStartEdit}
              block
            >
              修改
            </Button>
          </div>
        </div>
      );
    }

    // 未订阅 或 编辑模式：显示参数表单
    return (
      <div className="space-y-3">
        {!remoteEditing && (
          <p className="text-xs text-gray-400">订阅后即可获取连接配置</p>
        )}
        {/* 沙箱选择 */}
        <div>
          <div className="text-xs text-gray-500 mb-1.5">选择沙箱</div>
          <Select
            value={selectedSandbox}
            onChange={(v) => { setSelectedSandbox(v); setRemoteConfigJson(""); }}
            placeholder="请选择沙箱实例"
            size="small"
            className="w-full"
            loading={sandboxLoading}
            notFoundContent={sandboxLoading ? <Spin size="small" /> : "暂无可用沙箱"}
            options={sandboxList.map(s => ({
              value: s.sandboxId,
              label: s.sandboxName,
            }))}
          />
        </div>

        {/* 传输类型选择 */}
        <div>
          <div className="text-xs text-gray-500 mb-1.5">传输类型</div>
          <Select
            value={remoteTransport}
            onChange={(v) => { setRemoteTransport(v); setRemoteConfigJson(""); }}
            size="small"
            className="w-full"
            options={[
              { value: "sse", label: "SSE" },
              { value: "http", label: "Streamable HTTP" },
            ]}
          />
        </div>

        {/* 鉴权方式 */}
        <div>
          <div className="text-xs text-gray-500 mb-1.5">鉴权方式</div>
          <Select
            value={remoteAuthType}
            onChange={(v) => setRemoteAuthType(v)}
            size="small"
            className="w-full"
            options={[
              { value: "none", label: "无鉴权" },
              { value: "bearer", label: "Bearer Token", disabled: true },
            ]}
          />
        </div>

        {/* 参数输入 */}
        {extraParams.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1.5">参数配置</div>
            <div className="space-y-2">
              {extraParams.map((p) => (
                <div key={p.name}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-xs text-gray-600 font-mono">{p.name}</span>
                    {p.required && <span className="text-red-400 text-xs">*</span>}
                    {p.position && (
                      <Tag className="m-0 border-0 bg-gray-100 text-gray-400 text-[10px] leading-tight px-1 py-0">{p.position}</Tag>
                    )}
                  </div>
                  {p.description && (
                    <div className="text-[10px] text-gray-400 mb-0.5">{p.description}</div>
                  )}
                  <Input
                    size="small"
                    placeholder={p.example || `请输入 ${p.name}`}
                    value={remoteParamValues[p.name] || ""}
                    onChange={(e) => setRemoteParamValues(prev => ({ ...prev, [p.name]: e.target.value }))}
                    className="font-mono text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 按钮区域 */}
        {remoteEditing ? (
          <div className="flex gap-2">
            <Button
              size="small"
              icon={<CloseOutlined />}
              onClick={handleCancelEdit}
              block
            >
              取消
            </Button>
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              loading={remoteConnecting}
              onClick={handleRemoteConnect}
              block
            >
              确认修改
            </Button>
          </div>
        ) : (
          <Button
            type="primary"
            size="small"
            icon={<ThunderboltOutlined />}
            loading={remoteConnecting}
            onClick={handleRemoteConnect}
            block
          >
            订阅
          </Button>
        )}
        {remoteConnecting && (
          <div className="text-xs text-gray-400 text-center mt-2 animate-pulse">
            正在部署中，请稍候...
          </div>
        )}
      </div>
    );
  }

  // 统一的配置 JSON 展示块
  function renderConfigJsonBlock(json: string) {
    if (!json) {
      return <div className="text-xs text-gray-400 text-center py-4">已订阅，但暂无可用链接</div>;
    }
    return (
      <div className="relative">
        <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            className="absolute top-2 right-2 text-gray-400 hover:text-white z-10"
            onClick={() => handleCopy(json)}
          />
          <pre className="text-xs text-gray-100 font-mono whitespace-pre leading-relaxed">
            {json}
          </pre>
        </div>
      </div>
    );
  }

  // 从已订阅的 endpoint 构建配置 JSON
  function getSubscribedConfigJson() {
    if (!subscribedEndpoint?.endpointUrl) return "";
    const serverName = (meta?.mcpName || product?.name || "mcp-server").toLowerCase().replace(/\s+/g, "-");
    const protocol = subscribedEndpoint.protocol?.toLowerCase() || protocolType?.toLowerCase() || "sse";
    const serverConfig: Record<string, string> = { url: subscribedEndpoint.endpointUrl };
    if (protocol === "sse") serverConfig.type = "sse";
    return JSON.stringify({ mcpServers: { [serverName]: serverConfig } }, null, 2);
  }
}

export default McpDetail;
