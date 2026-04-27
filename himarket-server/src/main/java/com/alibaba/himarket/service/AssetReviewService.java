/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

package com.alibaba.himarket.service;

import com.alibaba.himarket.dto.result.asset.ApproveAssetResult;
import com.alibaba.himarket.dto.result.asset.AssetReviewDetailResult;
import com.alibaba.himarket.dto.result.asset.AssetReviewResult;
import com.alibaba.himarket.dto.result.common.FileContentResult;
import com.alibaba.himarket.dto.result.common.FileTreeNode;
import com.alibaba.himarket.dto.result.common.PageResult;
import org.springframework.data.domain.Pageable;

/** 资产审核服务 */
public interface AssetReviewService {

    PageResult<AssetReviewResult> listPendingReviews(Pageable pageable);

    AssetReviewDetailResult getReviewDetail(String assetId);

    ApproveAssetResult approveAsset(String assetId, boolean applyUpdate);

    void rejectAsset(String assetId, String comment);

    /** 获取资产文件树（管理员审核用，校验 portalId） */
    java.util.List<FileTreeNode> getAssetFiles(String assetId);

    /** 获取资产文件内容（管理员审核用，校验 portalId） */
    FileContentResult getAssetFileContent(String assetId, String path);
}
