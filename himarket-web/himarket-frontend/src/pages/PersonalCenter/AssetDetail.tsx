import { useState, useEffect, useCallback, useRef } from "react";
import {
  Button,
  Tag,
  Descriptions,
  Modal,
  Spin,
  message,
  Space,
  Card,
  Tooltip,
} from "antd";
import {
  ArrowLeftOutlined,
  EditOutlined,
  DeleteOutlined,
  SendOutlined,
  UndoOutlined,
  ToolOutlined,
  ThunderboltOutlined,
  UserOutlined,
  ExclamationCircleOutlined,
  FileFilled,
  CodeOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import "github-markdown-css/github-markdown-light.css";
import { Layout } from "../../components/Layout";
import SkillFileTree from "../../components/skill/SkillFileTree";
import MarkdownRender from "../../components/MarkdownRender";
import {
  getAsset,
  deleteAsset,
  submitReview,
  withdrawReview,
  getAssetFiles,
  getAssetFileContent,
  type DeveloperAsset,
  type AssetType,
  type AssetFileTreeNode,
  type AssetFileContent,
} from "../../lib/apis/developerAssetApi";
import type { SkillFileTreeNode } from "../../lib/apis/cliProvider";
import { parseSkillMd } from "../../lib/skillMdUtils";
import dayjs from "dayjs";

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

function inferLanguage(path: string): string {
  const fileName = path.split("/").pop()?.toLowerCase() ?? "";
  if (fileName === "dockerfile") return "dockerfile";
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", java: "java", go: "go", rs: "rust", cpp: "cpp", c: "c",
    sh: "bash", bash: "bash", yaml: "yaml", yml: "yaml", json: "json",
    toml: "ini", xml: "xml", html: "xml", css: "css", md: "markdown",
    sql: "sql", rb: "ruby", kt: "kotlin", swift: "swift", h: "c", hpp: "cpp",
    cfg: "ini", ini: "ini",
  };
  return map[ext] ?? "plaintext";
}

/** 判断资产是否有 Nacos 文件（已上传过 ZIP 包） */
function hasNacosFiles(asset: DeveloperAsset): boolean {
  if (asset.type !== "AGENT_SKILL" && asset.type !== "WORKER") return false;
  const nacos = asset.config?.nacos;
  if (!nacos) return false;
  if (asset.type === "AGENT_SKILL") return !!nacos.skillName;
  return !!nacos.agentSpecName;
}

function AssetDetail() {
  const navigate = useNavigate();
  const { assetId } = useParams<{ assetId: string }>();
  const [asset, setAsset] = useState<DeveloperAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // 文件浏览状态
  const [fileTree, setFileTree] = useState<AssetFileTreeNode[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>();
  const [fileContent, setFileContent] = useState<AssetFileContent | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "file">("overview");
  const [overviewContent, setOverviewContent] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [mdRawMode, setMdRawMode] = useState(true);
  const [treeWidth, setTreeWidth] = useState(224);
  const isDragging = useRef(false);

  const fetchAsset = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    try {
      const res = await getAsset(assetId);
      if (res.code === "SUCCESS" && res.data) {
        setAsset(res.data);
      }
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    fetchAsset();
  }, [fetchAsset]);

  // 加载文件树
  useEffect(() => {
    if (!asset || !assetId || !hasNacosFiles(asset)) return;

    const loadFiles = async () => {
      try {
        const filesRes = await getAssetFiles(assetId);
        if (filesRes.code === "SUCCESS" && Array.isArray(filesRes.data) && filesRes.data.length > 0) {
          setFileTree(filesRes.data);

          // 检查是否有 SKILL.md（Skill 类型）或 manifest.json（Worker 类型）
          const hasSkillMd = filesRes.data.some((n: AssetFileTreeNode) => n.path === "SKILL.md");
          const overviewFile = hasSkillMd ? "SKILL.md" : null;

          if (overviewFile) {
            setOverviewLoading(true);
            setSelectedFilePath(overviewFile);
            try {
              const contentRes = await getAssetFileContent(assetId, overviewFile);
              if (contentRes.code === "SUCCESS" && contentRes.data) {
                setFileContent(contentRes.data);
                setOverviewContent(contentRes.data.content);
              }
            } catch {
              // ignore
            } finally {
              setOverviewLoading(false);
            }
          } else {
            setActiveTab("file");
          }
        }
      } catch {
        // ignore - file browsing is optional
      }
    };

    loadFiles();
  }, [asset, assetId]);

  const handleSelectFile = useCallback(async (path: string) => {
    if (!assetId) return;
    setSelectedFilePath(path);
    setActiveTab("file");
    setMdRawMode(true);
    setFileLoading(true);
    try {
      const res = await getAssetFileContent(assetId, path);
      if (res.code === "SUCCESS" && res.data) {
        setFileContent(res.data);
      }
    } catch {
      setFileContent(null);
    } finally {
      setFileLoading(false);
    }
  }, [assetId]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startWidth = treeWidth;
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      setTreeWidth(Math.min(520, Math.max(160, startWidth + ev.clientX - startX)));
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleDelete = () => {
    Modal.confirm({
      title: "确认删除",
      icon: <ExclamationCircleOutlined />,
      content: "删除后不可恢复，确定要删除该资产吗？",
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        if (!assetId) return;
        setActionLoading(true);
        try {
          await deleteAsset(assetId);
          message.success("删除成功");
          navigate("/personal-center");
        } catch {
          // handled by interceptor
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleSubmitReview = () => {
    Modal.confirm({
      title: "提交审核",
      icon: <SendOutlined />,
      content: "提交后资产将进入审核流程，确定要提交吗？",
      okText: "提交",
      cancelText: "取消",
      onOk: async () => {
        if (!assetId) return;
        setActionLoading(true);
        try {
          await submitReview(assetId);
          message.success("已提交审核");
          fetchAsset();
        } catch {
          // handled by interceptor
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleWithdrawReview = () => {
    Modal.confirm({
      title: "撤回审核",
      icon: <UndoOutlined />,
      content: "撤回后资产将回到草稿状态，确定要撤回吗？",
      okText: "撤回",
      cancelText: "取消",
      onOk: async () => {
        if (!assetId) return;
        setActionLoading(true);
        try {
          await withdrawReview(assetId);
          message.success("已撤回审核");
          fetchAsset();
        } catch {
          // handled by interceptor
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const renderStatusTag = (displayStatus: string) => {
    const config = DISPLAY_STATUS_MAP[displayStatus] || {
      label: displayStatus,
      color: "default",
    };
    return (
      <Tag color={config.color} className="text-sm">
        {config.label}
      </Tag>
    );
  };

  const renderActions = () => {
    if (!asset) return null;
    const status = asset.displayStatus || "草稿";

    switch (status) {
      case "草稿":
        return (
          <Space>
            <Button
              icon={<EditOutlined />}
              onClick={() => navigate(`/personal-center/${asset.assetId}/edit`)}
            >
              编辑
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleDelete}
              loading={actionLoading}
            >
              删除
            </Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSubmitReview}
              loading={actionLoading}
            >
              发布到市场
            </Button>
          </Space>
        );
      case "审核中":
        return (
          <Button
            icon={<UndoOutlined />}
            onClick={handleWithdrawReview}
            loading={actionLoading}
          >
            撤回审核
          </Button>
        );
      case "审核拒绝":
        return (
          <Space>
            <Button
              icon={<EditOutlined />}
              onClick={() => navigate(`/personal-center/${asset.assetId}/edit`)}
            >
              编辑
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleDelete}
              loading={actionLoading}
            >
              删除
            </Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSubmitReview}
              loading={actionLoading}
            >
              重新提交
            </Button>
          </Space>
        );
      case "待发布":
      case "已发布":
        return (
          <Space>
            {asset.productId && (
              <span className="text-sm text-gray-500">
                关联产品 ID: {asset.productId}
              </span>
            )}
          </Space>
        );
      case "已下架":
        return (
          <Space>
            {asset.unpublishedReason && (
              <span className="text-sm text-red-500">
                下架原因: {asset.unpublishedReason}
              </span>
            )}
          </Space>
        );
      default:
        return null;
    }
  };

  const renderConfigInfo = () => {
    if (!asset?.config) return null;
    const config = asset.config;

    if (asset.type === "MCP_SERVER") {
      return (
        <Card title="MCP 连接配置" size="small" className="mt-4 rounded-xl">
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

    if (asset.type === "AGENT_SKILL" || asset.type === "WORKER") {
      return (
        <Card title="文件包信息" size="small" className="mt-4 rounded-xl">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Nacos Namespace">
              {config.nacos?.namespace || "-"}
            </Descriptions.Item>
            <Descriptions.Item
              label={
                asset.type === "AGENT_SKILL" ? "Skill 名称" : "AgentSpec 名称"
              }
            >
              {config.nacos?.skillName ||
                config.nacos?.agentSpecName ||
                "未上传"}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      );
    }

    return null;
  };

  const renderFilePreview = () => {
    if (!selectedFilePath) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400">
          <div className="text-center">
            <FileFilled className="text-5xl mb-3 text-gray-300" />
            <p className="text-sm text-gray-400">点击左侧文件查看内容</p>
          </div>
        </div>
      );
    }
    if (fileLoading) {
      return (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      );
    }
    if (!fileContent) {
      return <div className="text-gray-400 text-center py-16 text-sm">文件加载失败</div>;
    }
    if (fileContent.encoding === "base64") {
      return (
        <div className="text-gray-400 text-center py-16 text-sm">二进制文件，不支持预览</div>
      );
    }

    // Markdown files: toggle between source and preview
    if (selectedFilePath.endsWith(".md")) {
      const highlighted = (() => {
        try {
          if (hljs.getLanguage("markdown")) {
            return hljs.highlight(fileContent.content, { language: "markdown" }).value;
          }
          return hljs.highlightAuto(fileContent.content).value;
        } catch {
          return fileContent.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
      })();
      const lineCount = fileContent.content.split("\n").length;
      const codeFont = "'Menlo', 'Monaco', 'Courier New', monospace";
      return (
        <div className="flex-1 overflow-auto bg-white h-full flex flex-col relative">
          <div className="absolute top-2 right-3 z-20">
            <Tooltip title={mdRawMode ? "渲染预览" : "源代码"}>
              <button
                onClick={() => setMdRawMode(!mdRawMode)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                {mdRawMode ? <EyeOutlined /> : <CodeOutlined />}
                <span>{mdRawMode ? "Preview" : "Source"}</span>
              </button>
            </Tooltip>
          </div>
          {mdRawMode ? (
            <div className="flex flex-1 overflow-auto">
              <div
                className="flex-shrink-0 py-3 pr-3 pl-4 text-right select-none sticky left-0 bg-white z-10"
                style={{ fontFamily: codeFont, fontSize: "13px", lineHeight: "20px", borderRight: "1px solid #f0f0f0" }}
              >
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i} className="text-gray-300">{i + 1}</div>
                ))}
              </div>
              <pre className="flex-1 py-3 pl-5 pr-4 m-0 bg-white" style={{ fontFamily: codeFont, fontSize: "13px", lineHeight: "20px" }}>
                <code className="hljs language-markdown" dangerouslySetInnerHTML={{ __html: highlighted }} />
              </pre>
            </div>
          ) : (
            <div className="flex-1 overflow-auto px-6 pb-6 pt-8">
              <div className="markdown-body text-sm">
                <MarkdownRender content={fileContent.content} />
              </div>
            </div>
          )}
        </div>
      );
    }

    // Code files: syntax highlighting
    const lang = inferLanguage(selectedFilePath);
    const highlighted = (() => {
      try {
        if (lang && lang !== "plaintext" && hljs.getLanguage(lang)) {
          return hljs.highlight(fileContent.content, { language: lang }).value;
        }
        return hljs.highlightAuto(fileContent.content).value;
      } catch {
        return fileContent.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }
    })();
    const lineCount = fileContent.content.split("\n").length;
    const codeFont = "'Menlo', 'Monaco', 'Courier New', monospace";

    return (
      <div className="flex-1 overflow-auto bg-white h-full">
        <div className="flex min-h-full">
          <div
            className="flex-shrink-0 py-3 pr-3 pl-4 text-right select-none sticky left-0 bg-white z-10"
            style={{ fontFamily: codeFont, fontSize: "13px", lineHeight: "20px", borderRight: "1px solid #f0f0f0" }}
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} className="text-gray-300">{i + 1}</div>
            ))}
          </div>
          <pre
            className="flex-1 py-3 pl-5 pr-4 m-0 bg-white"
            style={{ fontFamily: codeFont, fontSize: "13px", lineHeight: "20px", whiteSpace: "pre", wordBreak: "normal" }}
          >
            <code
              className="hljs"
              style={{ background: "transparent", padding: 0 }}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          </pre>
        </div>
      </div>
    );
  };

  const renderFileBrowser = () => {
    if (!asset || !hasNacosFiles(asset) || fileTree.length === 0) return null;

    const hasOverview = overviewContent !== null;

    return (
      <div className="mt-4">
        <div
          className="bg-white rounded-xl overflow-hidden flex flex-col"
          style={{ height: "calc(100vh - 420px)", minHeight: 400, border: "1px solid #f0f0f0" }}
        >
          {/* Tab header */}
          <div className="flex gap-6 px-4 pt-3 flex-shrink-0" style={{ borderBottom: "1px solid #f0f0f0" }}>
            {hasOverview && (
              <button
                className={`pb-2 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === "overview"
                    ? "text-blue-600 border-blue-600"
                    : "text-gray-500 border-transparent hover:text-gray-700"
                }`}
                onClick={() => setActiveTab("overview")}
              >
                Overview
              </button>
            )}
            <button
              className={`pb-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "file"
                  ? "text-blue-600 border-blue-600"
                  : "text-gray-500 border-transparent hover:text-gray-700"
              }`}
              onClick={() => setActiveTab("file")}
            >
              File
            </button>
          </div>

          {/* Overview tab */}
          {activeTab === "overview" && hasOverview && (
            <div className="flex-1 overflow-auto p-6">
              {overviewLoading ? (
                <div className="flex justify-center pt-8">
                  <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="markdown-body text-sm">
                  {(() => {
                    const { frontmatter, body } = parseSkillMd(overviewContent!);
                    const fmEntries = Object.entries(frontmatter);
                    return (
                      <>
                        {fmEntries.length > 0 && (
                          <table className="mb-6 w-full text-[13px] border-collapse">
                            <thead>
                              <tr className="bg-[#f6f8fa]">
                                {fmEntries.map(([k]) => (
                                  <th key={k} className="border border-[#d0d7de] px-3 py-1.5 text-left font-semibold text-[#1f2328]">{k}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                {fmEntries.map(([k, v]) => (
                                  <td key={k} className="border border-[#d0d7de] px-3 py-1.5 text-[#1f2328] align-top">{v}</td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        )}
                        <MarkdownRender content={body} />
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* File tab */}
          {activeTab === "file" && (
            <div className="flex flex-1 min-h-0">
              {/* File tree */}
              <div
                className="bg-white overflow-y-auto overflow-x-hidden flex-shrink-0 p-2"
                style={{ width: treeWidth, borderRight: "1px solid #f0f0f0" }}
              >
                <SkillFileTree
                  nodes={fileTree as unknown as SkillFileTreeNode[]}
                  selectedPath={selectedFilePath}
                  onSelect={handleSelectFile}
                />
              </div>
              {/* Drag handle */}
              <div
                onMouseDown={handleDragStart}
                className="w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-200 transition-colors bg-transparent"
              />
              {/* File preview */}
              <div className="flex-1 overflow-auto flex flex-col">
                {renderFilePreview()}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-[calc(100vh-96px)]">
          <Spin size="large" />
        </div>
      </Layout>
    );
  }

  if (!asset) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[calc(100vh-96px)]">
          <span className="text-gray-400">资产不存在</span>
          <Button type="link" onClick={() => navigate("/personal-center")}>
            返回列表
          </Button>
        </div>
      </Layout>
    );
  }

  const showFileBrowser = hasNacosFiles(asset);

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-96px)] overflow-auto scrollbar-hide">
        {/* 顶部 */}
        <div className="flex-shrink-0 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate("/personal-center")}
                className="rounded-xl"
              />
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 text-lg">
                {ASSET_TYPE_ICON[asset.type]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-medium text-gray-900">
                    {asset.name}
                  </span>
                  {renderStatusTag(asset.displayStatus || "草稿")}
                </div>
                <span className="text-sm text-gray-400">
                  {ASSET_TYPE_LABEL[asset.type]}
                </span>
              </div>
            </div>
            {renderActions()}
          </div>
        </div>

        {/* 内容 */}
        <div className="flex-1 px-6 pb-8">
          <div className={showFileBrowser ? "" : "max-w-3xl mx-auto"}>
            {/* 审核拒绝原因 */}
            {asset.displayStatus === "审核拒绝" && asset.reviewComment && (
              <Card
                className="mb-4 rounded-xl border-red-200 bg-red-50"
                size="small"
              >
                <div className="text-red-600">
                  <strong>拒绝原因：</strong>
                  {asset.reviewComment}
                </div>
                {asset.reviewedBy && (
                  <div className="text-xs text-red-400 mt-1">
                    审核人: {asset.reviewedBy} |{" "}
                    {asset.reviewedAt
                      ? dayjs(asset.reviewedAt).format("YYYY-MM-DD HH:mm")
                      : ""}
                  </div>
                )}
              </Card>
            )}

            {/* 基础信息 */}
            <Card title="基础信息" size="small" className="rounded-xl">
              <Descriptions column={2} size="small">
                <Descriptions.Item label="资产 ID">
                  {asset.assetId}
                </Descriptions.Item>
                <Descriptions.Item label="类型">
                  {ASSET_TYPE_LABEL[asset.type]}
                </Descriptions.Item>
                <Descriptions.Item label="描述" span={2}>
                  {asset.config?.description || "暂无描述"}
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">
                  {asset.createAt
                    ? dayjs(asset.createAt).format("YYYY-MM-DD HH:mm")
                    : "-"}
                </Descriptions.Item>
                <Descriptions.Item label="更新时间">
                  {asset.updatedAt
                    ? dayjs(asset.updatedAt).format("YYYY-MM-DD HH:mm")
                    : "-"}
                </Descriptions.Item>
                {asset.productId && (
                  <Descriptions.Item label="关联产品 ID">
                    {asset.productId}
                  </Descriptions.Item>
                )}
                {asset.submittedAt && (
                  <Descriptions.Item label="提交审核时间">
                    {dayjs(asset.submittedAt).format("YYYY-MM-DD HH:mm")}
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Card>

            {/* 类型特有配置 */}
            {renderConfigInfo()}

            {/* 文件浏览器（仅 Skill/Worker 且已上传 ZIP 包） */}
            {renderFileBrowser()}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default AssetDetail;
