/**
 * 资产审核管理 API
 */

import api from "./api";

// ==================== 类型定义 ====================

export type AssetType = "MCP_SERVER" | "AGENT_SKILL" | "WORKER";

export type ReviewStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SUPERSEDED";

export interface AssetReviewItem {
  assetId: string;
  name: string;
  type: AssetType;
  ownerName: string;
  submittedAt: string;
  isUpdateCopy: boolean;
  parentProductName?: string;
}

export interface AssetReviewDetail {
  assetId: string;
  name: string;
  type: AssetType;
  config: {
    version?: string;
    description?: string;
    icon?: string;
    protocolType?: string;
    url?: string;
    headers?: Record<string, string>;
    nacos?: {
      nacosId?: string;
      namespace?: string;
      skillName?: string;
      agentSpecName?: string;
    };
  };
  reviewStatus: ReviewStatus;
  submittedAt: string;
  parentAssetId?: string;
  ownerId: string;
  ownerName: string;
  isUpdateCopy: boolean;
  parentProductName?: string;
}

export interface ApproveResult {
  productId: string;
  updateApplied: boolean;
}

export interface PageResult<T> {
  content: T[];
  number: number;
  size: number;
  totalElements: number;
}

// ==================== API 调用 ====================

export const assetReviewApi = {
  /** 待审核列表 */
  listPendingReviews: (params?: { page?: number; size?: number }) => {
    return api.get("/admin/asset-reviews", { params });
  },

  /** 审核详情 */
  getReviewDetail: (assetId: string) => {
    return api.get(`/admin/asset-reviews/${assetId}`);
  },

  /** 审核通过 */
  approveAsset: (assetId: string, applyUpdate?: boolean) => {
    return api.post(`/admin/asset-reviews/${assetId}/approve`, {
      applyUpdate: applyUpdate || false,
    });
  },

  /** 审核拒绝 */
  rejectAsset: (assetId: string, comment: string) => {
    return api.post(`/admin/asset-reviews/${assetId}/reject`, {
      comment,
    });
  },

  /** 获取资产文件树 */
  getAssetFiles: (assetId: string) => {
    return api.get(`/admin/asset-reviews/${assetId}/files`);
  },

  /** 获取资产文件内容 */
  getAssetFileContent: (assetId: string, filePath: string) => {
    return api.get(`/admin/asset-reviews/${assetId}/files/${filePath}`);
  },
};

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
