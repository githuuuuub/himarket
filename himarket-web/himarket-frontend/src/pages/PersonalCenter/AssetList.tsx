import { useState, useEffect, useCallback } from "react";
import {
  Button,
  Select,
  Input,
  Tag,
  Empty,
  Spin,
  Pagination,
  Card,
  Modal,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  ArrowLeftOutlined,
  ToolOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { Layout } from "../../components/Layout";
import {
  listAssets,
  type DeveloperAsset,
  type AssetType,
  type DisplayStatus,
} from "../../lib/apis/developerAssetApi";
import dayjs from "dayjs";

const ASSET_TYPE_OPTIONS = [
  { label: "全部类型", value: "" },
  { label: "MCP Server", value: "MCP_SERVER" },
  { label: "Agent Skill", value: "AGENT_SKILL" },
  { label: "Worker", value: "WORKER" },
];

const STATUS_OPTIONS = [
  { label: "全部状态", value: "" },
  { label: "草稿", value: "DRAFT" },
  { label: "审核中", value: "PENDING_REVIEW" },
  { label: "审核拒绝", value: "REJECTED" },
  { label: "已通过", value: "APPROVED" },
];

const DISPLAY_STATUS_MAP: Record<string, { label: string; color: string }> = {
  草稿: { label: "草稿", color: "default" },
  审核中: { label: "审核中", color: "processing" },
  审核拒绝: { label: "审核拒绝", color: "error" },
  待发布: { label: "待发布", color: "warning" },
  已发布: { label: "已发布", color: "success" },
  已下架: { label: "已下架", color: "error" },
  已替代: { label: "已替代", color: "default" },
};

const ASSET_TYPE_ICON: Record<AssetType, React.ReactNode> = {
  MCP_SERVER: <ToolOutlined />,
  AGENT_SKILL: <ThunderboltOutlined />,
  WORKER: <UserOutlined />,
};

const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  MCP_SERVER: "MCP Server",
  AGENT_SKILL: "Agent Skill",
  WORKER: "Worker",
};

const ASSET_TYPE_CARDS = [
  {
    type: "MCP_SERVER" as AssetType,
    label: "MCP Server",
    description: "模型上下文协议服务",
    icon: <ToolOutlined />,
    color: "bg-blue-50 text-blue-600",
    borderColor: "hover:border-blue-400",
  },
  {
    type: "AGENT_SKILL" as AssetType,
    label: "Agent Skill",
    description: "智能体技能包",
    icon: <ThunderboltOutlined />,
    color: "bg-purple-50 text-purple-600",
    borderColor: "hover:border-purple-400",
  },
  {
    type: "WORKER" as AssetType,
    label: "Worker",
    description: "工作流执行器",
    icon: <UserOutlined />,
    color: "bg-green-50 text-green-600",
    borderColor: "hover:border-green-400",
  },
];

function AssetList() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<DeveloperAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(12);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [typeSelectOpen, setTypeSelectOpen] = useState(false);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAssets({
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        keyword: keyword || undefined,
        page,
        size: pageSize,
      });
      if (res.code === "SUCCESS" && res.data) {
        setAssets(res.data.content || []);
        setTotal(res.data.totalElements || 0);
      }
    } catch {
      // error handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, keyword, page, pageSize]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleSearch = (value: string) => {
    setKeyword(value);
    setPage(0);
  };

  const renderStatusTag = (displayStatus: DisplayStatus | string) => {
    const config = DISPLAY_STATUS_MAP[displayStatus] || {
      label: displayStatus,
      color: "default",
    };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-96px)] overflow-auto scrollbar-hide">
        {/* 顶部区域 */}
        <div className="flex-shrink-0 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate("/")}
                className="rounded-xl"
              />
              <span className="text-lg font-medium text-gray-900">
                个人中心
              </span>
              {total > 0 && (
                <span className="text-sm text-gray-400">共 {total} 个资产</span>
              )}
            </div>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setTypeSelectOpen(true)}
            >
              上传资产
            </Button>
          </div>

          {/* 筛选栏 */}
          <div className="flex items-center gap-3 mt-4">
            <Select
              value={typeFilter}
              onChange={v => {
                setTypeFilter(v);
                setPage(0);
              }}
              options={ASSET_TYPE_OPTIONS}
              style={{ width: 160 }}
              placeholder="资产类型"
            />
            <Select
              value={statusFilter}
              onChange={v => {
                setStatusFilter(v);
                setPage(0);
              }}
              options={STATUS_OPTIONS}
              style={{ width: 160 }}
              placeholder="状态"
            />
            <Input.Search
              placeholder="搜索资产名称"
              allowClear
              onSearch={handleSearch}
              style={{ width: 240 }}
              prefix={<SearchOutlined className="text-gray-400" />}
            />
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 px-6 pt-2 pb-4">
          <Spin spinning={loading}>
            {assets.length === 0 && !loading ? (
              <div className="flex justify-center py-24">
                <Empty description="暂无资产，点击上方按钮上传" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {assets.map(asset => (
                    <Card
                      key={asset.assetId}
                      hoverable
                      className="rounded-xl"
                      onClick={() =>
                        navigate(`/personal-center/${asset.assetId}`)
                      }
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 text-lg flex-shrink-0">
                          {ASSET_TYPE_ICON[asset.type]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-900 truncate">
                              {asset.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <Tag className="text-xs" bordered={false}>
                              {ASSET_TYPE_LABEL[asset.type]}
                            </Tag>
                            {renderStatusTag(asset.displayStatus || "草稿")}
                          </div>
                          <div className="text-xs text-gray-400 truncate">
                            {asset.config?.description || "暂无描述"}
                          </div>
                          <div className="text-xs text-gray-300 mt-2">
                            {dayjs(asset.createAt).format("YYYY-MM-DD HH:mm")}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
                {total > pageSize && (
                  <div className="flex justify-center mt-6">
                    <Pagination
                      current={page + 1}
                      pageSize={pageSize}
                      total={total}
                      onChange={p => setPage(p - 1)}
                      showSizeChanger={false}
                    />
                  </div>
                )}
              </>
            )}
          </Spin>
        </div>
      </div>

      {/* 资产类型选择弹窗 */}
      <Modal
        title={null}
        open={typeSelectOpen}
        onCancel={() => setTypeSelectOpen(false)}
        footer={null}
        width={640}
        centered
        destroyOnClose
      >
        <div className="pt-2 pb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">选择资产类型</h3>
          <p className="text-sm text-gray-400 mb-6">请选择要上传的资产类型，不同类型有不同的配置流程</p>
          <div className="grid grid-cols-3 gap-4">
            {ASSET_TYPE_CARDS.map(card => (
              <div
                key={card.type}
                onClick={() => {
                  setTypeSelectOpen(false);
                  navigate(`/personal-center/create?type=${card.type}`);
                }}
                className={`flex flex-col items-center gap-3 p-6 rounded-xl border border-gray-200 cursor-pointer transition-all duration-200 ${card.borderColor} hover:shadow-md hover:-translate-y-0.5 group`}
              >
                <div className={`w-14 h-14 rounded-xl ${card.color} flex items-center justify-center text-2xl transition-transform duration-200 group-hover:scale-110`}>
                  {card.icon}
                </div>
                <div className="text-center">
                  <div className="font-medium text-gray-900 text-sm">{card.label}</div>
                  <div className="text-xs text-gray-400 mt-1">{card.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </Layout>
  );
}

export default AssetList;
