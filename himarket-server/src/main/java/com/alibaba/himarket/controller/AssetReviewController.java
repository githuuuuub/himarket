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

package com.alibaba.himarket.controller;

import com.alibaba.himarket.core.annotation.AdminAuth;
import com.alibaba.himarket.dto.params.asset.ApproveAssetParam;
import com.alibaba.himarket.dto.params.asset.RejectAssetParam;
import com.alibaba.himarket.dto.result.asset.ApproveAssetResult;
import com.alibaba.himarket.dto.result.asset.AssetReviewDetailResult;
import com.alibaba.himarket.dto.result.asset.AssetReviewResult;
import com.alibaba.himarket.dto.result.common.FileContentResult;
import com.alibaba.himarket.dto.result.common.FileTreeNode;
import com.alibaba.himarket.dto.result.common.PageResult;
import com.alibaba.himarket.service.AssetReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Asset Review Management", description = "管理员资产审核管理")
@RestController
@RequestMapping("/admin/asset-reviews")
@AdminAuth
@Slf4j
@RequiredArgsConstructor
public class AssetReviewController {

    private final AssetReviewService assetReviewService;

    @Operation(summary = "待审核列表")
    @GetMapping
    public PageResult<AssetReviewResult> listPendingReviews(
            @PageableDefault(size = 20) Pageable pageable) {
        return assetReviewService.listPendingReviews(pageable);
    }

    @Operation(summary = "审核详情")
    @GetMapping("/{assetId}")
    public AssetReviewDetailResult getReviewDetail(@PathVariable String assetId) {
        return assetReviewService.getReviewDetail(assetId);
    }

    @Operation(summary = "审核通过")
    @PostMapping("/{assetId}/approve")
    public ApproveAssetResult approveAsset(
            @PathVariable String assetId, @RequestBody(required = false) ApproveAssetParam param) {
        boolean applyUpdate = param != null && Boolean.TRUE.equals(param.getApplyUpdate());
        return assetReviewService.approveAsset(assetId, applyUpdate);
    }

    @Operation(summary = "审核拒绝")
    @PostMapping("/{assetId}/reject")
    public void rejectAsset(
            @PathVariable String assetId, @RequestBody @Valid RejectAssetParam param) {
        assetReviewService.rejectAsset(assetId, param.getComment());
    }

    @Operation(summary = "获取资产文件树（审核用）")
    @GetMapping("/{assetId}/files")
    public java.util.List<FileTreeNode> getAssetFiles(@PathVariable String assetId) {
        return assetReviewService.getAssetFiles(assetId);
    }

    @Operation(summary = "获取资产文件内容（审核用）")
    @GetMapping("/{assetId}/files/{*filePath}")
    public FileContentResult getAssetFileContent(
            @PathVariable String assetId, @PathVariable String filePath) {
        // Remove leading slash from wildcard path
        if (filePath.startsWith("/")) {
            filePath = filePath.substring(1);
        }
        return assetReviewService.getAssetFileContent(assetId, filePath);
    }
}
