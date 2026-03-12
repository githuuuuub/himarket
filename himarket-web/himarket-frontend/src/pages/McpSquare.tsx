import { useState, useEffect, useRef, useCallback } from "react";
import {
  SearchOutlined, ToolOutlined, AppstoreOutlined, CopyOutlined,
  CloudServerOutlined, LinkOutlined, DeleteOutlined, StarOutlined, PlusOutlined,
} from "@ant-design/icons";
import { Input, Spin, message, Button, Badge, Popconfirm } from "antd";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { CategoryMenu } from "../components/square/CategoryMenu";
import APIs, { type ICategory } from "../lib/apis";
import { getIconString } from "../lib/iconUtils";
import type { IProductDetail, IMcpMeta, IMyEndpoint } from "../lib/apis/product";
import { ProductIconRenderer } from "../components/icon/ProductIconRenderer";
import dayjs from "dayjs";
import BackToTopButton from "../components/scroll-to-top";

interface McpProductItem {
  product: IProductDetail;
  meta: IMcpMeta | null;
}

function McpSquare() {
  const navigate = useNavigate();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"market" | "my">("market");

  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [mcpItems, setMcpItems] = useState<McpProductItem[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; count: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 30;

  const [myEndpoints, setMyEndpoints] = useState<IMyEndpoint[]>([]);
  const [myMcpsLoading, setMyMcpsLoading] = useState(false);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await APIs.getCategoriesByProductType({ productType: "MCP_SERVER" });
        if (response.code === "SUCCESS" && response.data?.content) {
          const list = response.data.content.map((cat: ICategory) => ({
            id: cat.categoryId, name: cat.name, count: 0,
          }));
          setCategories(list.length > 0 ? [{ id: "all", name: "全部", count: 0 }, ...list] : []);
        }
      } catch (error) {
        console.error("Failed to fetch categories:", error);
      }
    };
    fetchCategories();
  }, []);

  const fetchMetaForProducts = async (products: IProductDetail[]): Promise<McpProductItem[]> => {
    const results = await Promise.allSettled(
      products.map(async (product) => {
        try {
          const res = await APIs.getProductMcpMeta(product.productId);
          const metaList = res.code === "SUCCESS" ? res.data : [];
          return { product, meta: metaList?.[0] || null };
        } catch {
          return { product, meta: null };
        }
      })
    );
    return results
      .filter((r): r is PromiseFulfilledResult<McpProductItem> => r.status === "fulfilled")
      .map((r) => r.value);
  };

  useEffect(() => {
    if (activeTab !== "market") return;
    const fetchProducts = async () => {
      setLoading(true);
      setMcpItems([]);
      setCurrentPage(0);
      setHasMore(true);
      try {
        const categoryIds = activeCategory === "all" ? undefined : [activeCategory];
        const response = await APIs.getProducts({ type: "MCP_SERVER", categoryIds, page: 0, size: PAGE_SIZE });
        if (response.code === "SUCCESS" && response.data?.content) {
          const prods = response.data.content;
          setHasMore(response.data.totalElements > prods.length);
          setMcpItems(await fetchMetaForProducts(prods));
        }
      } catch (error) {
        console.error("Failed to fetch products:", error);
        message.error("获取MCP Server列表失败");
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [activeCategory, activeTab]);

  const fetchMyEndpoints = useCallback(async () => {
    setMyMcpsLoading(true);
    try {
      const response = await APIs.getMyEndpoints();
      if (response.code === "SUCCESS" && response.data) setMyEndpoints(response.data);
    } catch (error) {
      console.error("Failed to fetch my endpoints:", error);
    } finally {
      setMyMcpsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "my") fetchMyEndpoints();
  }, [activeTab, fetchMyEndpoints]);

  const loadMoreProducts = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const categoryIds = activeCategory === "all" ? undefined : [activeCategory];
      const nextPage = currentPage + 1;
      const response = await APIs.getProducts({ type: "MCP_SERVER", categoryIds, page: nextPage, size: PAGE_SIZE });
      if (response.code === "SUCCESS" && response.data?.content) {
        const newItems = await fetchMetaForProducts(response.data.content);
        setMcpItems(prev => [...prev, ...newItems]);
        setCurrentPage(nextPage);
        setHasMore(response.data.totalElements > mcpItems.length + response.data.content.length);
      }
    } catch (error) {
      console.error("Failed to load more:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [activeCategory, currentPage, hasMore, loadingMore, mcpItems]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) loadMoreProducts();
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [loadMoreProducts]);

  const filteredItems = mcpItems.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = item.meta?.displayName || item.meta?.mcpName || item.product.name;
    const desc = item.meta?.description || item.product.description;
    return name.toLowerCase().includes(q) || desc?.toLowerCase().includes(q);
  });

  const handleCopyEndpoint = (endpoint: string) => {
    navigator.clipboard.writeText(endpoint);
    message.success("已复制 MCP 链接");
  };

  const handleDisconnect = async (endpointId: string) => {
    try {
      const response = await APIs.unsubscribeMcp(endpointId);
      if (response.code === "SUCCESS") {
        message.success("已取消订阅");
        fetchMyEndpoints();
      }
    } catch (error: any) {
      message.error(error?.message || "取消订阅失败");
    }
  };

  return (
    <Layout>
      <div className="flex h-[calc(100vh-96px)]">
        {/* 左侧分类菜单 - 仅广场 tab 且有分类时显示 */}
        {activeTab === "market" && categories.length > 0 && (
          <CategoryMenu
            categories={categories}
            activeCategory={activeCategory}
            onSelectCategory={setActiveCategory}
          />
        )}

        {/* 右侧内容区域 */}
        <div className="flex-1 flex flex-col relative">
          {/* 顶部：Tab 切换 + 搜索框 */}
          <div className="flex items-center justify-between mb-2 pl-4">
            <div className="flex items-center gap-1 bg-gray-100/80 rounded-xl p-1">
              <button
                onClick={() => setActiveTab("market")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === "market"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <AppstoreOutlined className="mr-1.5" />广场
              </button>
              <button
                onClick={() => setActiveTab("my")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                  activeTab === "my"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <StarOutlined className="mr-0.5" />我的
                {myEndpoints.length > 0 && (
                  <Badge count={myEndpoints.length} size="small" />
                )}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate("/mcp/create")}
                className="rounded-xl"
              >
                创建 MCP
              </Button>
              <Input
              placeholder="搜索 MCP Server..."
              prefix={<SearchOutlined className="text-gray-400" />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-80 rounded-xl"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.6)",
                backdropFilter: "blur(10px)",
              }}
              allowClear
            />
            </div>
          </div>

          {/* 内容区域 */}
          <div className="flex-1 relative overflow-auto" ref={scrollContainerRef}>
            <div className="h-full p-4">
              {activeTab === "market" ? (
                <MarketContent
                  loading={loading}
                  loadingMore={loadingMore}
                  items={filteredItems}
                  onViewDetail={(pid) => navigate(`/mcp/${pid}`)}
                  onTryNow={(product) => navigate("/chat", { state: { selectedProduct: product } })}
                />
              ) : (
                <MyMcpContent
                  endpoints={myEndpoints}
                  loading={myMcpsLoading}
                  onDisconnect={handleDisconnect}
                  onCopy={handleCopyEndpoint}
                  onViewDetail={(pid) => navigate(`/mcp/${pid}`)}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      <BackToTopButton container={scrollContainerRef.current!} />
    </Layout>
  );
}

/* ==================== 广场内容 ==================== */
function MarketContent({ loading, loadingMore, items, onViewDetail, onTryNow }: {
  loading: boolean;
  loadingMore: boolean;
  items: McpProductItem[];
  onViewDetail: (productId: string) => void;
  onTryNow: (product: IProductDetail) => void;
}) {
  if (loading) {
    return <div className="flex items-center justify-center h-full"><Spin size="large" tip="加载中..." /></div>;
  }

  if (items.length === 0) {
    return <div className="col-span-full flex items-center justify-center py-20 text-gray-400">暂无数据</div>;
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item) => (
          <McpCard
            key={item.product.productId}
            item={item}
            onViewDetail={() => onViewDetail(item.product.productId)}
            onTryNow={() => onTryNow(item.product)}
          />
        ))}
      </div>
      {loadingMore && (
        <div className="flex items-center justify-center py-8"><Spin tip="加载更多..." /></div>
      )}
    </>
  );
}

/* ==================== MCP 卡片（匹配 ModelCard 风格） ==================== */
function McpCard({ item, onViewDetail, onTryNow }: {
  item: McpProductItem;
  onViewDetail: () => void;
  onTryNow: () => void;
}) {
  const { product, meta } = item;
  const displayName = meta?.displayName || meta?.mcpName || product.name;
  const description = meta?.description || product.description;
  const protocolType = meta?.protocolType;

  const toolCount = (() => {
    const src = meta?.toolsConfig || product.mcpConfig?.tools;
    if (!src) return 0;
    try {
      const parsed = typeof src === "string" ? JSON.parse(src) : src;
      return parsed?.tools?.length || 0;
    } catch { return 0; }
  })();

  const tagList: string[] = (() => {
    if (!meta?.tags) return [];
    try {
      const parsed = JSON.parse(meta.tags);
      return Array.isArray(parsed) ? parsed : meta.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
    } catch {
      return meta.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
    }
  })();

  return (
    <div
      onClick={onViewDetail}
      className="
        bg-white/60 backdrop-blur-sm rounded-2xl p-5
        border border-white/40
        cursor-pointer
        transition-all duration-300 ease-in-out
        hover:bg-white hover:shadow-md hover:scale-[1.02] hover:border-colorPrimary/30
        active:scale-[0.98]
        relative overflow-hidden group
        h-[200px] flex flex-col
      "
    >
      {/* 头部：icon + 名称 + 标签 */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-colorPrimary/10 to-colorPrimary/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {meta?.icon || product.icon ? (
            <ProductIconRenderer className="w-full h-full object-cover" iconType={getIconString(meta?.icon ? { type: "URL", value: meta.icon } : product.icon)} />
          ) : (
            <AppstoreOutlined className="text-colorPrimary text-lg" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">{displayName}</h3>
          <div className="flex items-center gap-1.5 mt-1">
            {protocolType && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-colorPrimary/10 text-colorPrimary">
                {protocolType.toUpperCase()}
              </span>
            )}
            {toolCount > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-colorPrimary/5 text-colorPrimary/80">
                <ToolOutlined className="mr-0.5" />{toolCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 描述 */}
      <p className="max-h-12 text-sm mb-4 line-clamp-2 leading-relaxed flex-1 text-[#a3a3a3]">
        {description || "暂无描述"}
      </p>

      {/* 底部：标签 + 日期 - hover 时淡出 */}
      <div className="h-10 flex items-center justify-between text-xs transition-opacity duration-300 group-hover:opacity-0">
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {tagList.slice(0, 2).map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-100 truncate max-w-[80px]">
              {t}
            </span>
          ))}
          {!tagList.length && product.categories?.[0]?.name && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-100">
              {product.categories[0].name}
            </span>
          )}
        </div>
        <span className="flex-shrink-0 text-[#a3a3a3]">{dayjs(product.createAt).format("YYYY-MM-DD")}</span>
      </div>

      {/* Hover 操作按钮 */}
      <div className="
        absolute bottom-0 left-0 right-0 p-5
        opacity-0 translate-y-2
        group-hover:opacity-100 group-hover:translate-y-0
        transition-all duration-300 ease-out
        pointer-events-none group-hover:pointer-events-auto
      ">
        <div className="flex gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onViewDetail(); }}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 shadow-sm"
          >
            查看详情
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onTryNow(); }}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-colorPrimary hover:opacity-90 transition-all duration-200 shadow-sm"
          >
            立即体验
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==================== 我的 MCP 内容 ==================== */
function MyMcpContent({ endpoints, loading, onDisconnect, onCopy, onViewDetail }: {
  endpoints: IMyEndpoint[];
  loading: boolean;
  onDisconnect: (id: string) => void;
  onCopy: (url: string) => void;
  onViewDetail: (productId: string) => void;
}) {
  if (loading) {
    return <div className="flex items-center justify-center h-full"><Spin size="large" tip="加载中..." /></div>;
  }

  if (endpoints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <CloudServerOutlined className="text-5xl mb-4 text-gray-300" />
        <span className="text-sm">暂无已订阅的 MCP</span>
        <span className="text-xs mt-1 text-gray-300">去广场浏览并订阅 MCP Server</span>
      </div>
    );
  }

  return (
    <>
      <div className="text-xs text-gray-400 mb-3">共 {endpoints.length} 个已订阅</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {endpoints.map((ep) => (
          <MyEndpointCard
            key={ep.endpointId}
            endpoint={ep}
            onDisconnect={() => onDisconnect(ep.endpointId)}
            onCopy={() => onCopy(ep.endpointUrl)}
            onViewDetail={() => ep.productId && onViewDetail(ep.productId)}
          />
        ))}
      </div>
    </>
  );
}

/* ==================== 我的 MCP 卡片（匹配整体风格） ==================== */
function MyEndpointCard({ endpoint, onDisconnect, onCopy, onViewDetail }: {
  endpoint: IMyEndpoint;
  onDisconnect: () => void;
  onCopy: () => void;
  onViewDetail: () => void;
}) {
  const hostingLabel: Record<string, { text: string; color: string }> = {
    SANDBOX: { text: "沙箱", color: "bg-colorPrimary/10 text-colorPrimary" },
    DIRECT: { text: "直连", color: "bg-green-50 text-green-600" },
    GATEWAY: { text: "网关", color: "bg-blue-50 text-blue-600" },
    NACOS: { text: "Nacos", color: "bg-cyan-50 text-cyan-600" },
  };
  const hosting = hostingLabel[endpoint.hostingType] || { text: endpoint.hostingType, color: "bg-gray-50 text-gray-600" };

  return (
    <div
      onClick={onViewDetail}
      className="
        bg-white/60 backdrop-blur-sm rounded-2xl p-5
        border border-white/40
        cursor-pointer
        transition-all duration-300 ease-in-out
        hover:bg-white hover:shadow-md hover:scale-[1.02] hover:border-colorPrimary/30
        active:scale-[0.98]
      "
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-colorPrimary/10 to-colorPrimary/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {endpoint.icon ? (
            <ProductIconRenderer className="w-full h-full object-cover" iconType={getIconString({ type: "URL", value: endpoint.icon })} />
          ) : (
            <CloudServerOutlined className="text-colorPrimary text-lg" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">{endpoint.displayName || endpoint.mcpName}</h3>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${hosting.color}`}>{hosting.text}</span>
            {endpoint.protocol && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-colorPrimary/10 text-colorPrimary">
                {endpoint.protocol.toUpperCase()}
              </span>
            )}
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
              endpoint.status === "ACTIVE" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
            }`}>
              {endpoint.status === "ACTIVE" ? "运行中" : endpoint.status}
            </span>
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Popconfirm title="确认取消订阅？" onConfirm={onDisconnect} okText="确认" cancelText="取消">
            <Button type="text" size="small" icon={<DeleteOutlined />} className="text-gray-300 hover:text-red-500" />
          </Popconfirm>
        </div>
      </div>

      <p className="text-sm text-[#a3a3a3] line-clamp-2 mb-3">{endpoint.description || "暂无描述"}</p>

      {endpoint.endpointUrl && (
        <div
          className="bg-gray-50/80 rounded-xl px-3 py-2 flex items-center gap-2 group/url"
          onClick={(e) => e.stopPropagation()}
        >
          <LinkOutlined className="text-gray-300 text-xs flex-shrink-0" />
          <span className="text-[11px] text-gray-500 truncate flex-1 font-mono">{endpoint.endpointUrl}</span>
          <Button
            type="text" size="small" icon={<CopyOutlined />}
            onClick={onCopy}
            className="flex-shrink-0 text-gray-300 group-hover/url:text-colorPrimary"
          />
        </div>
      )}

      {endpoint.endpointCreatedAt && (
        <div className="text-[10px] text-[#a3a3a3] mt-2.5">
          订阅于 {dayjs(endpoint.endpointCreatedAt).format("YYYY-MM-DD HH:mm")}
        </div>
      )}
    </div>
  );
}

export default McpSquare;
