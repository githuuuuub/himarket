import { useState, useEffect, useRef } from "react";
import {
  FolderFilled,
  FolderOpenFilled,
  FileFilled,
  FileMarkdownFilled,
  FileTextFilled,
  CodeFilled,
  SettingFilled,
  Html5Filled,
  FileZipFilled,
  FileImageFilled,
  JavaScriptOutlined,
  JavaOutlined,
  PythonOutlined,
  DockerOutlined,
  RightOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { Spin, Tooltip } from "antd";
import JSZip from "jszip";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import "github-markdown-css/github-markdown-light.css";
import { parseSkillMd } from "../../lib/skillMdUtils";
import MarkdownRender from "../MarkdownRender";

// ── Types ──────────────────────────────────────────────

export interface ZipTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: ZipTreeNode[];
}

interface ZipFileContent {
  path: string;
  content: string;
  isBinary: boolean;
  size: number;
}

interface ZipFilePreviewProps {
  /** The raw File object from the upload */
  file: File | null;
}

// Max file content size for preview (1MB)
const MAX_PREVIEW_SIZE = 1024 * 1024;

// Binary file extensions
const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "ico", "svg", "webp",
  "mp3", "mp4", "wav", "avi", "mov", "mkv",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "zip", "tar", "gz", "rar", "7z",
  "exe", "dll", "so", "dylib",
  "woff", "woff2", "ttf", "eot", "otf",
  "class", "jar", "pyc", "o",
]);

// ── Helpers ────────────────────────────────────────────

function isBinaryFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return BINARY_EXTENSIONS.has(ext);
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function buildTree(zip: JSZip): ZipTreeNode[] {
  const root: ZipTreeNode[] = [];
  const dirMap = new Map<string, ZipTreeNode>();

  // Collect all entries
  const entries: { path: string; dir: boolean; size: number }[] = [];
  zip.forEach((relativePath, zipEntry) => {
    entries.push({
      path: relativePath,
      dir: zipEntry.dir,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      size: (zipEntry as any)._data?.uncompressedSize ?? 0,
    });
  });

  // Sort: directories first, then alphabetically
  entries.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const entry of entries) {
    const parts = entry.path.replace(/\/$/, "").split("/");
    const name = parts[parts.length - 1];
    if (!name) continue;

    const node: ZipTreeNode = {
      name,
      path: entry.path.replace(/\/$/, ""),
      type: entry.dir ? "directory" : "file",
      size: entry.dir ? undefined : entry.size,
      children: entry.dir ? [] : undefined,
    };

    if (entry.dir) {
      dirMap.set(node.path, node);
    }

    // Find parent
    const parentPath = parts.slice(0, -1).join("/");
    if (parentPath && dirMap.has(parentPath)) {
      dirMap.get(parentPath)!.children!.push(node);
    } else {
      root.push(node);
    }
  }

  return root;
}

// ── File icon by extension ───────────────────────────

const iconClass = "flex-shrink-0";
const iconStyle = { fontSize: 14 };

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const lowerName = name.toLowerCase();

  if (lowerName === "dockerfile")
    return <DockerOutlined className={iconClass} style={{ ...iconStyle, color: "#1a9ad0" }} />;
  if (lowerName === ".gitignore" || lowerName === "license" || lowerName === "notice")
    return <FileTextFilled className={iconClass} style={{ ...iconStyle, color: "#999" }} />;

  switch (ext) {
    case "md":
      return <FileMarkdownFilled className={iconClass} style={{ ...iconStyle, color: "#1a72bd" }} />;
    case "json":
      return <SettingFilled className={iconClass} style={{ ...iconStyle, color: "#7568b8" }} />;
    case "yaml":
    case "yml":
      return <SettingFilled className={iconClass} style={{ ...iconStyle, color: "#c88a0a" }} />;
    case "toml":
      return <SettingFilled className={iconClass} style={{ ...iconStyle, color: "#c88a0a" }} />;
    case "xml":
      return <CodeFilled className={iconClass} style={{ ...iconStyle, color: "#cc5e1e" }} />;
    case "html":
      return <Html5Filled className={iconClass} style={{ ...iconStyle, color: "#d94020" }} />;
    case "css":
      return <CodeFilled className={iconClass} style={{ ...iconStyle, color: "#2060b0" }} />;
    case "js":
    case "jsx":
      return <JavaScriptOutlined className={iconClass} style={{ ...iconStyle, color: "#c89008" }} />;
    case "ts":
    case "tsx":
      return <CodeFilled className={iconClass} style={{ ...iconStyle, color: "#1e68b0" }} />;
    case "py":
      return <PythonOutlined className={iconClass} style={{ ...iconStyle, color: "#2060a0" }} />;
    case "java":
      return <JavaOutlined className={iconClass} style={{ ...iconStyle, color: "#cc5818" }} />;
    case "sh":
    case "bash":
      return <CodeFilled className={iconClass} style={{ ...iconStyle, color: "#208848" }} />;
    case "zip":
    case "tar":
    case "gz":
      return <FileZipFilled className={iconClass} style={{ ...iconStyle, color: "#b88520" }} />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
      return <FileImageFilled className={iconClass} style={{ ...iconStyle, color: "#5848b0" }} />;
    case "txt":
    case "log":
    case "csv":
      return <FileTextFilled className={iconClass} style={{ ...iconStyle, color: "#999" }} />;
    default:
      return <FileFilled className={iconClass} style={{ ...iconStyle, color: "#3880c0" }} />;
  }
}

// ── Tree Node Component ──────────────────────────────

interface TreeNodeProps {
  node: ZipTreeNode;
  selectedPath?: string;
  onSelect: (path: string) => void;
  depth: number;
}

function TreeNode({ node, selectedPath, onSelect, depth }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const isDir = node.type === "directory";
  const isSelected = node.path === selectedPath;

  return (
    <div>
      <Tooltip title={node.name} placement="right" mouseEnterDelay={0.8}>
        <div
          className={`
            flex items-center gap-1 px-1 py-[2px] rounded cursor-pointer text-[13px] select-none
            transition-colors duration-100
            ${isSelected ? "bg-blue-100 text-gray-900" : "hover:bg-gray-100 text-gray-700"}
          `}
          style={{ paddingLeft: `${4 + depth * 16}px` }}
          onClick={() => (isDir ? setExpanded((v) => !v) : onSelect(node.path))}
        >
          {isDir ? (
            <span className="w-4 flex items-center justify-center flex-shrink-0 text-[10px] text-gray-400">
              {expanded ? <DownOutlined /> : <RightOutlined />}
            </span>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          {isDir ? (
            expanded ? (
              <FolderOpenFilled className="text-amber-500 flex-shrink-0 text-sm" />
            ) : (
              <FolderFilled className="text-amber-400 flex-shrink-0 text-sm" />
            )
          ) : (
            <FileIcon name={node.name} />
          )}
          <span className="truncate ml-0.5">{node.name}</span>
          {!isDir && node.size !== undefined && (
            <span className="ml-auto text-[11px] text-gray-400 flex-shrink-0 pl-2">
              {formatFileSize(node.size)}
            </span>
          )}
        </div>
      </Tooltip>
      {isDir && expanded && node.children && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── File Content Preview ─────────────────────────────

function FileContentPreview({ fileContent }: { fileContent: ZipFileContent | null }) {
  if (!fileContent) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <FileFilled className="text-4xl mb-2 text-gray-300" />
          <p className="text-sm">点击左侧文件查看内容</p>
        </div>
      </div>
    );
  }

  if (fileContent.isBinary) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <FileZipFilled className="text-4xl mb-2 text-gray-300" />
          <p className="text-sm">二进制文件，不支持预览</p>
        </div>
      </div>
    );
  }

  if (fileContent.size > MAX_PREVIEW_SIZE) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <FileTextFilled className="text-4xl mb-2 text-gray-300" />
          <p className="text-sm">文件过大（{formatFileSize(fileContent.size)}），不支持预览</p>
          <p className="text-xs mt-1">仅支持预览 1MB 以内的文件</p>
        </div>
      </div>
    );
  }

  // Markdown: render as rich text
  if (fileContent.path.endsWith(".md")) {
    const fileName = fileContent.path.split("/").pop()?.toUpperCase() ?? "";
    // SKILL.md 使用 SkillMdOverview（带 frontmatter 表格）
    if (fileName === "SKILL.MD") {
      return <SkillMdOverview content={fileContent.content} />;
    }
    // 其他 .md 文件用 MarkdownRender
    return (
      <div className="overflow-auto h-full p-4">
        <div className="markdown-body text-sm">
          <MarkdownRender content={fileContent.content} />
        </div>
      </div>
    );
  }

  // Code files: syntax highlighting
  const lang = getLanguage(fileContent.path);
  const highlighted = (() => {
    try {
      if (lang && lang !== "plaintext" && hljs.getLanguage(lang)) {
        return hljs.highlight(fileContent.content, { language: lang }).value;
      }
      return hljs.highlightAuto(fileContent.content).value;
    } catch {
      return fileContent.content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
  })();

  const lineCount = fileContent.content.split("\n").length;
  const codeFont = "'Menlo', 'Monaco', 'Courier New', monospace";

  return (
    <div className="overflow-auto h-full bg-white">
      <div className="flex min-h-full">
        <div
          className="flex-shrink-0 py-3 pr-3 pl-3 text-right select-none border-r border-gray-100 sticky left-0 bg-white z-10"
          style={{ fontFamily: codeFont, fontSize: "12px", lineHeight: "20px" }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className="text-gray-300">
              {i + 1}
            </div>
          ))}
        </div>
        <pre
          className="flex-1 py-3 pl-4 pr-4 m-0 bg-white"
          style={{
            fontFamily: codeFont,
            fontSize: "12px",
            lineHeight: "20px",
            whiteSpace: "pre",
            wordBreak: "normal",
          }}
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
}

function getLanguage(path: string): string {
  const fileName = path.split("/").pop()?.toLowerCase() ?? "";
  if (fileName === "dockerfile") return "dockerfile";
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    py: "python",
    js: "javascript",
    ts: "typescript",
    tsx: "typescript",
    jsx: "javascript",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    sh: "bash",
    bash: "bash",
    css: "css",
    html: "xml",
    xml: "xml",
    sql: "sql",
    java: "java",
    go: "go",
    rs: "rust",
    rb: "ruby",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    toml: "ini",
    cfg: "ini",
    ini: "ini",
    md: "markdown",
  };
  return map[ext] || "plaintext";
}

// ── SKILL.md Overview ────────────────────────────────

function SkillMdOverview({ content }: { content: string }) {
  const { frontmatter, body } = parseSkillMd(content);
  const fmEntries = Object.entries(frontmatter);
  return (
    <div className="overflow-auto h-full p-4">
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
    </div>
  );
}

// ── Main Component ───────────────────────────────────

export default function ZipFilePreview({ file }: ZipFilePreviewProps) {
  const [loading, setLoading] = useState(false);
  const [tree, setTree] = useState<ZipTreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [fileContent, setFileContent] = useState<ZipFileContent | null>(null);
  const [skillMdContent, setSkillMdContent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "file">("overview");
  const zipRef = useRef<JSZip | null>(null);

  // Parse ZIP when file changes
  useEffect(() => {
    if (!file) {
      setTree([]);
      setSelectedPath(undefined);
      setFileContent(null);
      setSkillMdContent(null);
      zipRef.current = null;
      return;
    }

    let cancelled = false;
    setLoading(true);

    const parseZip = async () => {
      try {
        const zip = await JSZip.loadAsync(file);
        if (cancelled) return;
        zipRef.current = zip;

        const nodes = buildTree(zip);
        setTree(nodes);
        setSelectedPath(undefined);
        setFileContent(null);

        // Check for SKILL.md
        const skillMdEntry = zip.file(/^([^/]+\/)?SKILL\.md$/i);
        if (skillMdEntry.length > 0) {
          const content = await skillMdEntry[0].async("string");
          if (!cancelled) {
            setSkillMdContent(content);
            setActiveTab("overview");
          }
        } else {
          setSkillMdContent(null);
          setActiveTab("file");
        }
      } catch {
        if (!cancelled) {
          setTree([]);
          setSkillMdContent(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    parseZip();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Load file content when selecting a file
  const handleSelectFile = async (path: string) => {
    setSelectedPath(path);
    setActiveTab("file");

    if (!zipRef.current) return;

    const zipEntry = zipRef.current.file(path);
    if (!zipEntry) return;

    if (isBinaryFile(path)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entrySize = (zipEntry as any)._data?.uncompressedSize ?? 0;
      setFileContent({
        path,
        content: "",
        isBinary: true,
        size: entrySize,
      });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const size = (zipEntry as any)._data?.uncompressedSize ?? 0;
    if (size > MAX_PREVIEW_SIZE) {
      setFileContent({
        path,
        content: "",
        isBinary: false,
        size,
      });
      return;
    }

    try {
      const content = await zipEntry.async("string");
      setFileContent({ path, content, isBinary: false, size: content.length });
    } catch {
      setFileContent({ path, content: "", isBinary: true, size: 0 });
    }
  };

  if (!file) return null;

  if (loading) {
    return (
      <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="flex items-center justify-center py-12">
          <Spin tip="正在解析 ZIP 文件..." />
        </div>
      </div>
    );
  }

  if (tree.length === 0) return null;

  return (
    <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Tab bar */}
      {skillMdContent && (
        <div className="flex border-b border-gray-100 bg-gray-50/50">
          <button
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === "overview"
                ? "text-purple-600 border-b-2 border-purple-500 bg-white"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("overview")}
          >
            SKILL.md 概览
          </button>
          <button
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === "file"
                ? "text-purple-600 border-b-2 border-purple-500 bg-white"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("file")}
          >
            文件浏览
          </button>
        </div>
      )}

      {/* Content */}
      {activeTab === "overview" && skillMdContent ? (
        <div style={{ height: 480 }}>
          <SkillMdOverview content={skillMdContent} />
        </div>
      ) : (
        <div className="flex" style={{ height: 480 }}>
          {/* Left: File tree */}
          <div className="w-56 flex-shrink-0 border-r border-gray-100 overflow-auto py-1">
            {tree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
                depth={0}
              />
            ))}
          </div>
          {/* Right: File content */}
          <div className="flex-1 min-w-0 overflow-hidden">
            {selectedPath && fileContent && (
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-gray-50/50 text-xs text-gray-500">
                <span className="truncate">{fileContent.path}</span>
                {fileContent.size > 0 && (
                  <span className="flex-shrink-0 text-gray-400">
                    {formatFileSize(fileContent.size)}
                  </span>
                )}
              </div>
            )}
            <div style={{ height: selectedPath && fileContent ? "calc(100% - 30px)" : "100%" }}>
              <FileContentPreview fileContent={fileContent} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
