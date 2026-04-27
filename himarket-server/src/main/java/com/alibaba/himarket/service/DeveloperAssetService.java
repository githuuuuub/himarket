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

import com.alibaba.himarket.dto.params.asset.CreateDeveloperAssetParam;
import com.alibaba.himarket.dto.params.asset.QueryDeveloperAssetParam;
import com.alibaba.himarket.dto.params.asset.UpdateDeveloperAssetParam;
import com.alibaba.himarket.dto.result.asset.DeveloperAssetResult;
import com.alibaba.himarket.dto.result.common.FileContentResult;
import com.alibaba.himarket.dto.result.common.FileTreeNode;
import com.alibaba.himarket.dto.result.common.PageResult;
import java.io.IOException;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.web.multipart.MultipartFile;

/** 开发者资产管理服务 */
public interface DeveloperAssetService {

    /**
     * 创建资产
     *
     * @param param 创建参数
     * @return 创建结果
     */
    DeveloperAssetResult createAsset(CreateDeveloperAssetParam param);

    /**
     * 资产列表
     *
     * @param param 查询参数
     * @param pageable 分页参数
     * @return 分页结果
     */
    PageResult<DeveloperAssetResult> listAssets(QueryDeveloperAssetParam param, Pageable pageable);

    /**
     * 资产详情
     *
     * @param assetId 资产 ID
     * @return 资产详情
     */
    DeveloperAssetResult getAsset(String assetId);

    /**
     * 更新资产（仅 DRAFT/REJECTED 状态）
     *
     * @param assetId 资产 ID
     * @param param 更新参数
     * @return 更新结果
     */
    DeveloperAssetResult updateAsset(String assetId, UpdateDeveloperAssetParam param);

    /**
     * 删除资产（仅 DRAFT/REJECTED 状态）
     *
     * @param assetId 资产 ID
     */
    void deleteAsset(String assetId);

    /**
     * 上传 Skill/Worker ZIP 包
     *
     * @param assetId 资产 ID
     * @param file ZIP 文件
     * @return 更新后的资产信息
     * @throws IOException IO 异常
     */
    DeveloperAssetResult uploadPackage(String assetId, MultipartFile file) throws IOException;

    /**
     * 提交审核
     *
     * @param assetId 资产 ID
     */
    void submitReview(String assetId);

    /**
     * 撤回审核
     *
     * @param assetId 资产 ID
     */
    void withdrawReview(String assetId);

    /**
     * 获取资产文件树（从 Nacos 私有 namespace 读取）
     *
     * <p>仅支持 AGENT_SKILL 和 WORKER 类型且已上传过 ZIP 包的资产
     *
     * @param assetId 资产 ID
     * @return 文件树节点列表
     */
    List<FileTreeNode> getAssetFiles(String assetId);

    /**
     * 获取资产文件内容（从 Nacos 私有 namespace 读取）
     *
     * @param assetId 资产 ID
     * @param path 文件路径
     * @return 文件内容
     */
    FileContentResult getAssetFileContent(String assetId, String path);
}
