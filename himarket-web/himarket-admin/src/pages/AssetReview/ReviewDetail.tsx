import React, { useState, useEffect, useCallback } from "react";
import {
  Button,
  Card,
  Descriptions,
  Tag,
  Modal,
  Input,
  message,
  Spin,
  Alert,
  Space,
  Tree,
} from "antd";
import type { DataNode } from "antd/es/tree";
import {
  ArrowLeftOutlined,
  CheckOutlined,
  CloseOutlined,
  FileOutlined,
  FolderOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import {
  assetReviewApi,
  type AssetReviewDetail as ReviewDetailType,
  type AssetType,
  type AssetFileTreeNode,
  type AssetFileContent,
} from "@/lib/assetReviewApi";
import dayjs from "dayjs";

const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  MCP_SERVER: "MCP Server",
  AGENT_SKILL: "Agent Skill",
  WORKER: "Worker",
};

const ASSET_TYPE_COLOR: Record<AssetType, string> = {
  MCP_SERVER: "blue",
  AGENT_SKILL: "purple",
  WORKER: "cyan",
};

/** Convert our file tree nodes to Ant Design Tree DataNode format */
function toAntTreeData(nodes: AssetFileTreeNode[]): DataNode[] {
  return nodes.map((n) => ({
    key: n.path,
    title: n.name,
    icon: n.type === "directory" ? <FolderOutlined /> : <FileOutlined />,
    isLeaf: n.type === "file",
    children: n.children ? toAntTreeData(n.children) : undefined,
  }));
}

/** Check if asset has Nacos files */
function hasNacosFiles(detail: ReviewDetailType): boolean {
  if (detail.type !== "AGENT_SKILL" && detail.type !== "WORKER") return false;
  const nacos = detail.config?.nacos;
  if (!nacos) return false;
  if (detail.type === "AGENT_SKILL") return !!nacos.skillName;
  return !!nacos.agentSpecName;
}

const ReviewDetail: React.FC = () => {
  const navigate = useNavigate();
  const { assetId } = useParams<{ assetId: string }>();
  const [detail, setDetail] = useState<ReviewDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");

  // File browsing state
  const [fileTree, setFileTree] = useState<AssetFileTreeNode[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>();
  const [fileContent, setFileContent] = useState<AssetFileContent | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    try {
      const res = await assetReviewApi.getReviewDetail(assetId);
      const resData = res as unknown as {
        code: string;
        data: ReviewDetailType;
      };
      if (resData.code === "SUCCESS" && resData.data) {
        setDetail(resData.data);
      }
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Load file tree when detail is available
  useEffect(() => {
    if (!detail || !assetId || !hasNacosFiles(detail)) return;
    const loadFiles = async () => {
      try {
        const res = await assetReviewApi.getAssetFiles(assetId);
        const resData = res as unknown as { code: string; data: AssetFileTreeNode[] };
        if (resData.code === "SUCCESS" && Array.isArray(resData.data)) {
          setFileTree(resData.data);
        }
      } catch {
        // file browsing is optional
      }
    };
    loadFiles();
  }, [detail, assetId]);

  const handleSelectFile = useCallback(
    async (path: string) => {
      if (!assetId) return;
      setSelectedFilePath(path);
      setFileLoading(true);
      try {
        const res = await assetReviewApi.getAssetFileContent(assetId, path);
        const resData = res as unknown as { code: string; data: AssetFileContent };
        if (resData.code === "SUCCESS" && resData.data) {
          setFileContent(resData.data);
        }
      } catch {
        setFileContent(null);
      } finally {
        setFileLoading(false);
      }
    },
    [assetId]
  );

  const handleApprove = () => {
    Modal.confirm({
      title: "确认通过审核",
      content: "审核通过后将创建对应的产品记录，确定要通过吗？",
      okText: "通过",
      cancelText: "取消",
      onOk: async () => {
        if (!assetId) return;
        setActionLoading(true);
        try {
          const res = await assetReviewApi.approveAsset(assetId);
          const resData = res as unknown as {
            code: string;
            data: { productId: string };
          };
          if (resData.code === "SUCCESS") {
            message.success(
              `审核已通过，产品 ID: ${resData.data?.productId || "已创建"}`
            );
            navigate("/asset-reviews");
          }
        } catch {
          // handled by interceptor
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleReject = async () => {
    if (!rejectComment.trim()) {
      message.error("请输入拒绝原因");
      return;
    }
    if (!assetId) return;
    setActionLoading(true);
    try {
      const res = await assetReviewApi.rejectAsset(assetId, rejectComment.trim());
      const resData = res as unknown as { code: string };
      if (resData.code === "SUCCESS") {
        message.success("已拒绝");
        setRejectModalOpen(false);
        navigate("/asset-reviews");
      }
    } catch {
      // handled by interceptor
    } finally {
      setActionLoading(false);
    }
  };

  const renderConfigInfo = () => {
    if (!detail?.config) return null;
    const config = detail.config;

    if (detail.type === "MCP_SERVER") {
      return (
        <Card title="MCP 连接配置" size="small" className="mt-4">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="协议类型">
              {config.protocolType || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="服务地址">
              {config.url || "-"}
            </Descriptions.Item>
            {config.headers && Object.keys(config.headers).length > 0 && (
              <Descriptions.Item label="自定义 Headers">
                <pre className="text-xs bg-gray-50 p-2 rounded">
                  {JSON.stringify(config.headers, null, 2)}
                </pre>
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>
      );
    }

    if (detail.type === "AGENT_SKILL" || detail.type === "WORKER") {
      return (
        <Card title="文件包信息" size="small" className="mt-4">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Nacos Namespace">
              {config.nacos?.namespace || "-"}
            </Descriptions.Item>
            <Descriptions.Item
              label={detail.type === "AGENT_SKILL" ? "Skill 名称" : "AgentSpec 名称"}
            >
              {config.nacos?.skillName || config.nacos?.agentSpecName || "-"}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      );
    }

    return null;
  };

  const renderFileBrowser = () => {
    if (!detail || !hasNacosFiles(detail) || fileTree.length === 0) return null;

    const treeData = toAntTreeData(fileTree);
    const codeFont = "'Menlo', 'Monaco', 'Courier New', monospace";

    return (
      <Card title="文件浏览" size="small" className="mt-4">
        <div className="flex" style={{ minHeight: 400 }}>
          {/* Left: file tree */}
          <div
            className="flex-shrink-0 overflow-auto border-r border-gray-100 pr-2"
            style={{ width: 240 }}
          >
            <Tree
              showIcon
              defaultExpandAll
              treeData={treeData}
              selectedKeys={selectedFilePath ? [selectedFilePath] : []}
              onSelect={(keys) => {
                const key = keys[0] as string;
                if (key) {
                  // Only select files, not directories
                  const isFile = fileTree.some((n) => {
                    const find = (nodes: AssetFileTreeNode[]): boolean =>
                      nodes.some(
                        (node) =>
                          (node.path === key && node.type === "file") ||
                          (node.children ? find(node.children) : false)
                      );
                    return find([n]);
                  });
                  if (isFile) handleSelectFile(key);
                }
              }}
            />
          </div>
          {/* Right: file content */}
          <div className="flex-1 min-w-0 pl-4">
            {!selectedFilePath && (
              <div className="text-gray-400 text-sm text-center pt-16">
                点击左侧文件查看内容
              </div>
            )}
            {selectedFilePath && fileLoading && (
              <div className="flex justify-center pt-16">
                <Spin />
              </div>
            )}
            {selectedFilePath && !fileLoading && fileContent && (
              <div>
                <div className="text-xs text-gray-400 mb-2">
                  {fileContent.path}
                  {fileContent.size > 0 && (
                    <span className="ml-2">
                      ({fileContent.size < 1024
                        ? `${fileContent.size} B`
                        : `${(fileContent.size / 1024).toFixed(1)} KB`})
                    </span>
                  )}
                </div>
                {fileContent.encoding === "base64" ? (
                  <div className="text-gray-400 text-sm">二进制文件，不支持预览</div>
                ) : (
                  <pre
                    className="bg-gray-50 p-4 rounded-lg overflow-auto text-xs leading-5 max-h-[500px]"
                    style={{ fontFamily: codeFont }}
                  >
                    {fileContent.content}
                  </pre>
                )}
              </div>
            )}
            {selectedFilePath && !fileLoading && !fileContent && (
              <div className="text-gray-400 text-sm text-center pt-16">
                文件加载失败
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Spin size="large" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="text-center py-24 text-gray-400">审核记录不存在</div>
    );
  }

  return (
    <div>
      {/* 顶部 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/asset-reviews")}
          />
          <h2 className="text-xl font-semibold">审核详情</h2>
        </div>
        <Space>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={handleApprove}
            loading={actionLoading}
          >
            通过
          </Button>
          <Button
            danger
            icon={<CloseOutlined />}
            onClick={() => setRejectModalOpen(true)}
            loading={actionLoading}
          >
            拒绝
          </Button>
        </Space>
      </div>

      {/* 更新副本提示 */}
      {detail.isUpdateCopy && (
        <Alert
          message="该资产为已发布产品的更新版本"
          description={
            detail.parentProductName
              ? `关联产品: ${detail.parentProductName}`
              : undefined
          }
          type="info"
          showIcon
          className="mb-4"
        />
      )}

      {/* 基础信息 */}
      <Card title="资产信息" size="small">
        <Descriptions column={2} size="small">
          <Descriptions.Item label="资产名称">{detail.name}</Descriptions.Item>
          <Descriptions.Item label="类型">
            <Tag color={ASSET_TYPE_COLOR[detail.type]}>
              {ASSET_TYPE_LABEL[detail.type]}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="描述" span={2}>
            {detail.config?.description || "暂无描述"}
          </Descriptions.Item>
          <Descriptions.Item label="提交时间">
            {detail.submittedAt
              ? dayjs(detail.submittedAt).format("YYYY-MM-DD HH:mm")
              : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="资产 ID">{detail.assetId}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 提交者信息 */}
      <Card title="提交者信息" size="small" className="mt-4">
        <Descriptions column={2} size="small">
          <Descriptions.Item label="开发者名称">
            {detail.ownerName || "-"}
          </Descriptions.Item>
          <Descriptions.Item label="开发者 ID">
            {detail.ownerId || "-"}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 类型特有配置 */}
      {renderConfigInfo()}

      {/* 文件浏览（Skill/Worker） */}
      {renderFileBrowser()}

      {/* 拒绝对话框 */}
      <Modal
        title="拒绝审核"
        open={rejectModalOpen}
        onOk={handleReject}
        onCancel={() => {
          setRejectModalOpen(false);
          setRejectComment("");
        }}
        okText="确认拒绝"
        okType="danger"
        cancelText="取消"
        confirmLoading={actionLoading}
      >
        <div className="mb-2 text-gray-600">请输入拒绝原因（必填）：</div>
        <Input.TextArea
          rows={4}
          value={rejectComment}
          onChange={(e) => setRejectComment(e.target.value)}
          placeholder="请说明拒绝的原因，开发者将看到此信息"
        />
      </Modal>
    </div>
  );
};

export default ReviewDetail;
