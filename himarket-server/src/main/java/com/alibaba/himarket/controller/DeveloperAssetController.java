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

import com.alibaba.himarket.core.annotation.DeveloperAuth;
import com.alibaba.himarket.dto.params.asset.CreateDeveloperAssetParam;
import com.alibaba.himarket.dto.params.asset.QueryDeveloperAssetParam;
import com.alibaba.himarket.dto.params.asset.UpdateDeveloperAssetParam;
import com.alibaba.himarket.dto.result.asset.DeveloperAssetResult;
import com.alibaba.himarket.dto.result.common.FileContentResult;
import com.alibaba.himarket.dto.result.common.FileTreeNode;
import com.alibaba.himarket.dto.result.common.PageResult;
import com.alibaba.himarket.service.DeveloperAssetService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@Tag(name = "Developer Asset Management", description = "开发者资产 CRUD 管理")
@RestController
@RequestMapping("/developer/assets")
@DeveloperAuth
@Slf4j
@RequiredArgsConstructor
public class DeveloperAssetController {

    private final DeveloperAssetService developerAssetService;

    @Operation(summary = "创建资产")
    @PostMapping
    public DeveloperAssetResult createAsset(@RequestBody @Valid CreateDeveloperAssetParam param) {
        return developerAssetService.createAsset(param);
    }

    @Operation(summary = "资产列表")
    @GetMapping
    public PageResult<DeveloperAssetResult> listAssets(
            QueryDeveloperAssetParam param, @PageableDefault(size = 20) Pageable pageable) {
        return developerAssetService.listAssets(param, pageable);
    }

    @Operation(summary = "资产详情")
    @GetMapping("/{assetId}")
    public DeveloperAssetResult getAsset(@PathVariable String assetId) {
        return developerAssetService.getAsset(assetId);
    }

    @Operation(summary = "更新资产")
    @PutMapping("/{assetId}")
    public DeveloperAssetResult updateAsset(
            @PathVariable String assetId, @RequestBody @Valid UpdateDeveloperAssetParam param) {
        return developerAssetService.updateAsset(assetId, param);
    }

    @Operation(summary = "删除资产")
    @DeleteMapping("/{assetId}")
    public void deleteAsset(@PathVariable String assetId) {
        developerAssetService.deleteAsset(assetId);
    }

    @Operation(summary = "上传 Skill/Worker ZIP 包")
    @PostMapping(value = "/{assetId}/package", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public DeveloperAssetResult uploadPackage(
            @PathVariable String assetId, @RequestParam("file") MultipartFile file)
            throws IOException {
        return developerAssetService.uploadPackage(assetId, file);
    }

    @Operation(summary = "提交审核")
    @PostMapping("/{assetId}/submit-review")
    public void submitReview(@PathVariable String assetId) {
        developerAssetService.submitReview(assetId);
    }

    @Operation(summary = "撤回审核")
    @PostMapping("/{assetId}/withdraw-review")
    public void withdrawReview(@PathVariable String assetId) {
        developerAssetService.withdrawReview(assetId);
    }

    @Operation(summary = "获取资产文件树")
    @GetMapping("/{assetId}/files")
    public List<FileTreeNode> getAssetFiles(@PathVariable String assetId) {
        return developerAssetService.getAssetFiles(assetId);
    }

    @Operation(summary = "获取资产文件内容")
    @GetMapping("/{assetId}/files/{*filePath}")
    public FileContentResult getAssetFileContent(
            @PathVariable String assetId, @PathVariable String filePath) {
        String path = filePath.startsWith("/") ? filePath.substring(1) : filePath;
        return developerAssetService.getAssetFileContent(assetId, path);
    }
}
