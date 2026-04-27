/**
 * 开发者资产管理 API
 */

import request, { type RespI } from "../request";

// ==================== 类型定义 ====================

export type AssetType = "MCP_SERVER" | "AGENT_SKILL" | "WORKER";

export type ReviewStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SUPERSEDED";

export type DisplayStatus =
  | "草稿"
  | "审核中"
  | "审核拒绝"
  | "待发布"
  | "已发布"
  | "已下架"
  | "已替代";

export interface AssetNacosInfo {
  nacosId?: string;
  namespace?: string;
  skillName?: string;
  agentSpecName?: string;
}

export interface DeveloperAssetConfig {
  version?: string;
  description?: string;
  icon?: string;
  // MCP_SERVER 特有
  protocolType?: string;
  url?: string;
  headers?: Record<string, string>;
  // AGENT_SKILL / WORKER 特有
  nacos?: AssetNacosInfo;
}

export interface DeveloperAsset {
  assetId: string;
  ownerId: string;
  portalId: string;
  name: string;
  type: AssetType;
  config: DeveloperAssetConfig;
  reviewStatus: ReviewStatus;
  reviewComment?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  submittedAt?: string;
  productId?: string;
  parentAssetId?: string;
  unpublishedReason?: string;
  unpublishedBy?: string;
  unpublishedAt?: string;
  displayStatus?: DisplayStatus | string;
  createAt?: string;
  updatedAt?: string;
}

export interface PageResult<T> {
  content: T[];
  number: number;
  size: number;
  totalElements: number;
}

// ==================== 请求参数 ====================

export interface CreateAssetParams {
  name: string;
  type: AssetType;
  description?: string;
  icon?: string;
  config?: Record<string, unknown>;
}

export interface UpdateAssetParams {
  description?: string;
  icon?: string;
  config?: Record<string, unknown>;
}

export interface ListAssetsParams {
  type?: string;
  status?: string;
  keyword?: string;
  showSuperseded?: boolean;
  page?: number;
  size?: number;
}

// ==================== API 调用 ====================

/** 创建资产 */
export function createAsset(data: CreateAssetParams) {
  return request.post<RespI<DeveloperAsset>, RespI<DeveloperAsset>>(
    "/developer/assets",
    data
  );
}

/** 资产列表 */
export function listAssets(params: ListAssetsParams) {
  return request.get<
    RespI<PageResult<DeveloperAsset>>,
    RespI<PageResult<DeveloperAsset>>
  >("/developer/assets", { params });
}

/** 资产详情 */
export function getAsset(assetId: string) {
  return request.get<RespI<DeveloperAsset>, RespI<DeveloperAsset>>(
    `/developer/assets/${assetId}`
  );
}

/** 更新资产 */
export function updateAsset(assetId: string, data: UpdateAssetParams) {
  return request.put<RespI<DeveloperAsset>, RespI<DeveloperAsset>>(
    `/developer/assets/${assetId}`,
    data
  );
}

/** 删除资产 */
export function deleteAsset(assetId: string) {
  return request.delete<RespI<void>, RespI<void>>(
    `/developer/assets/${assetId}`
  );
}

/** 上传 Skill/Worker ZIP 包 */
export function uploadPackage(assetId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request.post<RespI<DeveloperAsset>, RespI<DeveloperAsset>>(
    `/developer/assets/${assetId}/package`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 60000,
    }
  );
}

/** 提交审核 */
export function submitReview(assetId: string) {
  return request.post<RespI<void>, RespI<void>>(
    `/developer/assets/${assetId}/submit-review`
  );
}

/** 撤回审核 */
export function withdrawReview(assetId: string) {
  return request.post<RespI<void>, RespI<void>>(
    `/developer/assets/${assetId}/withdraw-review`
  );
}

// ==================== 文件浏览 ====================

export interface AssetFileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  encoding?: string;
  size?: number;
  children?: AssetFileTreeNode[];
}

export interface AssetFileContent {
  path: string;
  content: string;
  encoding: string;
  size: number;
}

/** 获取资产文件树 */
export function getAssetFiles(assetId: string) {
  return request.get<
    RespI<AssetFileTreeNode[]>,
    RespI<AssetFileTreeNode[]>
  >(`/developer/assets/${assetId}/files`);
}

/** 获取资产文件内容 */
export function getAssetFileContent(assetId: string, filePath: string) {
  return request.get<RespI<AssetFileContent>, RespI<AssetFileContent>>(
    `/developer/assets/${assetId}/files/${filePath}`
  );
}
