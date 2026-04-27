import { useState, useRef, useCallback } from "react";
import {
  Form,
  Input,
  Button,
  Upload,
  message,
  Tooltip,
} from "antd";
import {
  ArrowLeftOutlined,
  UploadOutlined,
  FileZipOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  FileFilled,
  CodeOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import "github-markdown-css/github-markdown-light.css";
import { Layout } from "../../components/Layout";
import { createAsset, uploadPackage } from "../../lib/apis/developerAssetApi";
import { parseSkillMd } from "../../lib/skillMdUtils";
import MarkdownRender from "../../components/MarkdownRender";
import SkillFileTree from "../../components/skill/SkillFileTree";
import type { SkillFileTreeNode } from "../../lib/apis/cliProvider";
import type { ZipTreeNode } from "../../components/skill/ZipFilePreview";

// ── helpers ──────────────────────────────────────────

function inferLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", java: "java", go: "go", rs: "rust", cpp: "cpp", c: "c",
    sh: "bash", bash: "bash", yaml: "yaml", yml: "yaml", json: "json",
    toml: "ini", xml: "xml", html: "xml", css: "css", md: "markdown",
    sql: "sql", rb: "ruby", kt: "kotlin", swift: "swift",
  };
  return map[ext] ?? "plaintext";
}

function SkillOverview({ content }: { content: string }) {
  const { frontmatter, body } = parseSkillMd(content);
  const fmEntries = Object.entries(frontmatter);
  return (
    <div className="markdown-body text-sm">
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
    </div>
  );
}

// ── tree node (reuse from ZipFilePreview internals) ──

const BINARY_EXTENSIONS = new Set([
  "png","jpg","jpeg","gif","bmp","ico","svg","webp","mp3","mp4","wav",
  "pdf","doc","docx","xls","xlsx","ppt","pptx","zip","tar","gz","rar","7z",
  "exe","dll","so","dylib","woff","woff2","ttf","eot","otf","class","jar","pyc","o",
]);

function isBinaryFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return BINARY_EXTENSIONS.has(ext);
}

// ── main component ───────────────────────────────────

function CreateSkill() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const zipFileRef = useRef<File | null>(null);
  const [zipFileName, setZipFileName] = useState<string | null>(null);
  const [zipFileSize, setZipFileSize] = useState<number>(0);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);

  // file browser state (mirrors SkillDetail pattern)
  const [fileTree, setFileTree] = useState<SkillFileTreeNode[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>();
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileBinary, setFileBinary] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "file">("overview");
  const [overviewContent, setOverviewContent] = useState<string | null>(null);
  const [mdRawMode, setMdRawMode] = useState(true);
  const [treeWidth, setTreeWidth] = useState(224);
  const isDragging = useRef(false);
  const zipRef = useRef<JSZip | null>(null);

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const clearFile = () => {
    zipFileRef.current = null;
    setZipFileName(null);
    setZipFileSize(0);
    setZipFile(null);
    setFileTree([]);
    setSelectedFilePath(undefined);
    setFileContent(null);
    setOverviewContent(null);
    zipRef.current = null;
  };

  // build tree from JSZip → SkillFileTreeNode format
  const buildTree = (zip: JSZip): SkillFileTreeNode[] => {
    const root: SkillFileTreeNode[] = [];
    const dirMap = new Map<string, SkillFileTreeNode>();
    const entries: { path: string; dir: boolean; size: number }[] = [];
    zip.forEach((relativePath, zipEntry) => {
      entries.push({ path: relativePath, dir: zipEntry.dir, size: (zipEntry as any)._data?.uncompressedSize ?? 0 });
    });
    entries.sort((a, b) => { if (a.dir !== b.dir) return a.dir ? -1 : 1; return a.path.localeCompare(b.path); });
    for (const entry of entries) {
      const parts = entry.path.replace(/\/$/, "").split("/");
      const name = parts[parts.length - 1];
      if (!name) continue;
      const node: SkillFileTreeNode = { name, path: entry.path.replace(/\/$/, ""), type: entry.dir ? "directory" : "file", size: entry.dir ? undefined : entry.size, children: entry.dir ? [] : undefined };
      if (entry.dir) dirMap.set(node.path, node);
      const parentPath = parts.slice(0, -1).join("/");
      if (parentPath && dirMap.has(parentPath)) { dirMap.get(parentPath)!.children!.push(node); } else { root.push(node); }
    }
    return root;
  };

  const parseZipAndFillForm = async (file: File) => {
    setParsing(true);
    try {
      const zip = await JSZip.loadAsync(file);
      zipRef.current = zip;

      // build file tree
      const nodes = buildTree(zip);
      setFileTree(nodes);

      // look for SKILL.md
      const skillMdEntry = zip.file(/^([^/]+\/)?SKILL\.md$/i);
      if (skillMdEntry.length > 0) {
        const content = await skillMdEntry[0].async("string");
        setOverviewContent(content);
        setActiveTab("overview");

        const { frontmatter } = parseSkillMd(content);
        if (frontmatter.name && !form.getFieldValue("name")) form.setFieldValue("name", frontmatter.name);
        if (frontmatter.description && !form.getFieldValue("description")) form.setFieldValue("description", frontmatter.description);
        if (frontmatter.icon && !form.getFieldValue("icon")) form.setFieldValue("icon", frontmatter.icon);
      } else {
        setOverviewContent(null);
        setActiveTab("file");
      }
    } catch {
      // ZIP parsing failed
    } finally {
      setParsing(false);
    }
  };

  const handleFileUpload = (file: File) => {
    const isZip = file.type === "application/zip" || file.type === "application/x-zip-compressed" || file.name.endsWith(".zip");
    if (!isZip) { message.error("只支持 ZIP 格式文件"); return Upload.LIST_IGNORE; }
    zipFileRef.current = file;
    setZipFileName(file.name);
    setZipFileSize(file.size);
    setZipFile(file);
    parseZipAndFillForm(file);
    return false;
  };

  // select file from tree
  const handleSelectFile = useCallback(async (path: string) => {
    setSelectedFilePath(path);
    setActiveTab("file");
    setMdRawMode(true);
    setFileBinary(false);
    if (!zipRef.current) return;
    const zipEntry = zipRef.current.file(path);
    if (!zipEntry) return;
    if (isBinaryFile(path)) { setFileBinary(true); setFileContent(null); return; }
    try {
      const content = await zipEntry.async("string");
      setFileContent(content);
    } catch { setFileBinary(true); setFileContent(null); }
  }, []);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startWidth = treeWidth;
    const onMove = (ev: MouseEvent) => { if (!isDragging.current) return; setTreeWidth(Math.min(520, Math.max(160, startWidth + ev.clientX - startX))); };
    const onUp = () => { isDragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleSubmit = async () => {
    try {
      await form.validateFields(["name"]);
      if (!zipFileRef.current) { message.warning("请先上传 ZIP 文件"); return; }
      const values = form.getFieldsValue(true);
      setSubmitting(true);
      const config: Record<string, unknown> = { description: values.description || "", icon: values.icon || "" };
      const res = await createAsset({ name: values.name, type: "AGENT_SKILL", description: values.description, icon: values.icon, config });
      if (res.code !== "SUCCESS" || !res.data) { message.error(res.message || "创建失败"); return; }
      const newAssetId = res.data.assetId;
      if (zipFileRef.current) {
        try { await uploadPackage(newAssetId, zipFileRef.current); }
        catch (uploadError: any) {
          const errorMsg = uploadError?.response?.data?.message || uploadError?.message || "文件上传失败";
          message.warning(`资产已创建，但文件上传失败：${errorMsg}，请在详情页重新上传`);
          navigate(`/personal-center/${newAssetId}`); return;
        }
      }
      message.success("Agent Skill 资产创建成功");
      navigate(`/personal-center/${newAssetId}`);
    } catch (error: any) { if (error?.errorFields) return; message.error(error?.message || "创建失败"); }
    finally { setSubmitting(false); }
  };

  // ── file preview (same as SkillDetail) ─────────────

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
    if (fileBinary) {
      return <div className="text-gray-400 text-center py-16 text-sm">二进制文件，不支持预览</div>;
    }
    if (fileContent === null) {
      return <div className="text-gray-400 text-center py-16 text-sm">文件加载失败</div>;
    }

    // Markdown
    if (selectedFilePath.endsWith(".md")) {
      const highlighted = (() => {
        try { return hljs.getLanguage("markdown") ? hljs.highlight(fileContent, { language: "markdown" }).value : hljs.highlightAuto(fileContent).value; }
        catch { return fileContent.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
      })();
      const lineCount = fileContent.split("\n").length;
      const codeFont = "'Menlo', 'Monaco', 'Courier New', monospace";
      return (
        <div className="flex-1 overflow-auto bg-white h-full flex flex-col relative">
          <div className="absolute top-2 right-3 z-20">
            <Tooltip title={mdRawMode ? "渲染预览" : "源代码"}>
              <button onClick={() => setMdRawMode(!mdRawMode)} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                {mdRawMode ? <EyeOutlined /> : <CodeOutlined />}
                <span>{mdRawMode ? "Preview" : "Source"}</span>
              </button>
            </Tooltip>
          </div>
          {mdRawMode ? (
            <div className="flex flex-1 overflow-auto">
              <div className="flex-shrink-0 py-3 pr-3 pl-4 text-right select-none sticky left-0 bg-white z-10" style={{ fontFamily: codeFont, fontSize: "13px", lineHeight: "20px", borderRight: "1px solid #f0f0f0" }}>
                {Array.from({ length: lineCount }, (_, i) => (<div key={i} className="text-gray-300">{i + 1}</div>))}
              </div>
              <pre className="flex-1 py-3 pl-5 pr-4 m-0 bg-white" style={{ fontFamily: codeFont, fontSize: "13px", lineHeight: "20px" }}>
                <code className="hljs language-markdown" dangerouslySetInnerHTML={{ __html: highlighted }} />
              </pre>
            </div>
          ) : (
            <div className="flex-1 overflow-auto px-6 pb-6 pt-8">
              {selectedFilePath.toUpperCase().endsWith("SKILL.MD") ? <SkillOverview content={fileContent} /> : <div className="markdown-body text-sm"><MarkdownRender content={fileContent} /></div>}
            </div>
          )}
        </div>
      );
    }

    // Code
    const lang = inferLanguage(selectedFilePath);
    const highlighted = (() => {
      try { return lang && lang !== "plaintext" && hljs.getLanguage(lang) ? hljs.highlight(fileContent, { language: lang }).value : hljs.highlightAuto(fileContent).value; }
      catch { return fileContent.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    })();
    const lineCount = fileContent.split("\n").length;
    const codeFont = "'Menlo', 'Monaco', 'Courier New', monospace";
    return (
      <div className="flex-1 overflow-auto bg-white h-full">
        <div className="flex min-h-full">
          <div className="flex-shrink-0 py-3 pr-3 pl-4 text-right select-none sticky left-0 bg-white z-10" style={{ fontFamily: codeFont, fontSize: "13px", lineHeight: "20px", borderRight: "1px solid #f0f0f0" }}>
            {Array.from({ length: lineCount }, (_, i) => (<div key={i} className="text-gray-300">{i + 1}</div>))}
          </div>
          <pre className="flex-1 py-3 pl-5 pr-4 m-0 bg-white" style={{ fontFamily: codeFont, fontSize: "13px", lineHeight: "20px", whiteSpace: "pre", wordBreak: "normal" }}>
            <code className="hljs" style={{ background: "transparent", padding: 0 }} dangerouslySetInnerHTML={{ __html: highlighted }} />
          </pre>
        </div>
      </div>
    );
  };

  const hasFiles = fileTree.length > 0;
  const hasOverview = overviewContent !== null;

  return (
    <Layout>
      <div className="py-8 flex flex-col gap-4">
        {/* Page header — same style as SkillDetail */}
        <div className="flex-shrink-0">
          <button
            onClick={() => navigate("/personal-center")}
            className="flex items-center gap-2 mb-4 px-4 py-2 rounded-xl text-gray-600 hover:text-colorPrimary hover:bg-colorPrimaryBgHover transition-all duration-200"
          >
            <ArrowLeftOutlined />
            <span>返回个人中心</span>
          </button>

          <div className="flex items-center gap-4 mb-3">
            <div className="w-16 h-16 rounded-xl flex-shrink-0 flex items-center justify-center bg-purple-50 border border-gray-200">
              <ThunderboltOutlined className="text-2xl text-purple-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold text-gray-900 mb-1">创建 Agent Skill</h1>
              <div className="text-sm text-gray-400">上传技能包，自动解析 SKILL.md 预填信息</div>
            </div>
          </div>

          {/* Upload area — compact inline */}
          <div className="mt-2">
            <Upload.Dragger
              beforeUpload={handleFileUpload}
              onRemove={() => clearFile()}
              maxCount={1}
              accept=".zip"
              showUploadList={false}
              style={{ borderRadius: 12, borderColor: zipFileName ? '#52c41a' : undefined, background: zipFileName ? '#f6ffed' : undefined }}
            >
              {!zipFileName ? (
                <div className="py-3">
                  <p className="text-2xl text-gray-300 mb-1"><UploadOutlined /></p>
                  <p className="text-sm text-gray-500">点击或拖拽 ZIP 文件到此区域上传</p>
                  <p className="text-xs text-gray-400">上传后自动解析 SKILL.md 并预填表单信息</p>
                </div>
              ) : (
                <div className="py-2 flex items-center justify-center gap-3">
                  <CheckCircleOutlined className="text-xl text-green-500" />
                  <div className="text-left">
                    <span className="text-sm text-gray-700 font-medium">{zipFileName}</span>
                    <span className="text-xs text-gray-400 ml-2">{zipFileSize ? formatFileSize(zipFileSize) : ""}{parsing ? " · 解析中..." : ""}</span>
                  </div>
                  <span className="text-xs text-blue-500 cursor-pointer hover:underline ml-2">重新选择</span>
                </div>
              )}
            </Upload.Dragger>
          </div>
        </div>

        {/* Main content — left: file viewer, right: form sidebar */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left: file viewer (same as SkillDetail) */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-lg overflow-hidden flex flex-col" style={{ height: "calc(100vh - 340px)", minHeight: 460, border: "1px solid #f0f0f0" }}>
              {/* Tab header */}
              <div className="flex gap-6 px-4 pt-3 flex-shrink-0" style={{ borderBottom: "1px solid #f0f0f0" }}>
                {hasOverview && (
                  <button
                    className={`pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === "overview" ? "text-blue-600 border-blue-600" : "text-gray-500 border-transparent hover:text-gray-700"}`}
                    onClick={() => setActiveTab("overview")}
                  >
                    Overview
                  </button>
                )}
                <button
                  className={`pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === "file" ? "text-blue-600 border-blue-600" : "text-gray-500 border-transparent hover:text-gray-700"}`}
                  onClick={() => setActiveTab("file")}
                >
                  File
                </button>
              </div>

              {/* Overview tab */}
              {activeTab === "overview" && hasOverview && (
                <div className="flex-1 overflow-auto p-6">
                  <SkillOverview content={overviewContent!} />
                </div>
              )}

              {/* File tab */}
              {activeTab === "file" && (
                <div className="flex flex-1 min-h-0">
                  <div className="bg-white overflow-y-auto overflow-x-hidden flex-shrink-0 p-2" style={{ width: treeWidth, borderRight: "1px solid #f0f0f0" }}>
                    {hasFiles ? (
                      <SkillFileTree nodes={fileTree} selectedPath={selectedFilePath} onSelect={handleSelectFile} />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                        {zipFile ? "无文件" : "上传 ZIP 后查看文件"}
                      </div>
                    )}
                  </div>
                  <div onMouseDown={handleDragStart} className="w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-200 transition-colors bg-transparent" />
                  <div className="flex-1 overflow-auto flex flex-col">
                    {renderFilePreview()}
                  </div>
                </div>
              )}

              {/* Empty state when no file uploaded */}
              {!hasFiles && !hasOverview && (
                <div className="flex-1 flex items-center justify-center text-gray-300">
                  <div className="text-center">
                    <FileZipOutlined className="text-5xl mb-3" />
                    <p className="text-sm text-gray-400">上传 ZIP 文件后在此预览内容</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar: form + actions */}
          <div className="w-full lg:w-[360px] flex-shrink-0 space-y-3">
            <div className="bg-white rounded-xl overflow-hidden shadow-sm" style={{ border: "1px solid #e8eaef" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #edeef3" }}>
                <span className="text-sm font-semibold text-gray-800">基础信息</span>
                <span className="text-xs text-gray-400 ml-2">从 SKILL.md 自动解析</span>
              </div>
              <div className="px-4 py-4">
                <Form form={form} layout="vertical" requiredMark="optional" size="middle">
                  <Form.Item
                    name="name"
                    label="Skill 名称"
                    rules={[{ required: true, message: "请输入名称" }, { max: 128, message: "不超过128字符" }]}
                  >
                    <Input placeholder="输入 Agent Skill 名称" />
                  </Form.Item>
                  <Form.Item name="description" label="描述">
                    <Input.TextArea placeholder="描述该技能包的功能和用途" autoSize={{ minRows: 2, maxRows: 4 }} />
                  </Form.Item>
                  <Form.Item name="icon" label="图标 URL">
                    <Input placeholder="可选，输入图标 URL" />
                  </Form.Item>
                </Form>
              </div>
              <div className="px-4 py-3" style={{ borderTop: "1px solid #edeef3" }}>
                <Button type="primary" onClick={handleSubmit} loading={submitting} block size="middle">
                  创建资产
                </Button>
                <Button onClick={() => navigate("/personal-center")} block className="mt-2" size="middle">
                  取消
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default CreateSkill;
