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

package com.alibaba.himarket.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import com.alibaba.himarket.core.exception.BusinessException;
import com.alibaba.himarket.core.exception.ErrorCode;
import com.alibaba.himarket.core.security.ContextHolder;
import com.alibaba.himarket.core.skill.FileTreeBuilder;
import com.alibaba.himarket.core.utils.IdGenerator;
import com.alibaba.himarket.dto.params.asset.CreateDeveloperAssetParam;
import com.alibaba.himarket.dto.params.asset.QueryDeveloperAssetParam;
import com.alibaba.himarket.dto.params.asset.UpdateDeveloperAssetParam;
import com.alibaba.himarket.dto.result.asset.DeveloperAssetResult;
import com.alibaba.himarket.dto.result.common.FileContentResult;
import com.alibaba.himarket.dto.result.common.FileTreeNode;
import com.alibaba.himarket.dto.result.common.PageResult;
import com.alibaba.himarket.dto.result.nacos.NacosResult;
import com.alibaba.himarket.entity.DeveloperAsset;
import com.alibaba.himarket.repository.DeveloperAssetRepository;
import com.alibaba.himarket.repository.ProductPublicationRepository;
import com.alibaba.himarket.service.DeveloperAssetService;
import com.alibaba.himarket.service.NacosService;
import com.alibaba.himarket.service.SkillService;
import com.alibaba.himarket.support.asset.*;
import com.alibaba.himarket.support.enums.AssetType;
import com.alibaba.himarket.support.enums.ReviewStatus;
import com.alibaba.nacos.api.ai.model.agentspecs.AgentSpec;
import com.alibaba.nacos.api.ai.model.agentspecs.AgentSpecMeta;
import com.alibaba.nacos.api.ai.model.agentspecs.AgentSpecResource;
import com.alibaba.nacos.api.ai.model.skills.Skill;
import com.alibaba.nacos.api.ai.model.skills.SkillMeta;
import com.alibaba.nacos.api.ai.model.skills.SkillResource;
import com.alibaba.nacos.api.exception.NacosException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@Slf4j
@RequiredArgsConstructor
@Transactional
public class DeveloperAssetServiceImpl implements DeveloperAssetService {

    private static final long MAX_ZIP_SIZE = 10 * 1024 * 1024;
    private static final String DEVELOPER_PRIVATE_NAMESPACE = "developer-private";

    private final DeveloperAssetRepository developerAssetRepository;
    private final ProductPublicationRepository productPublicationRepository;
    private final ContextHolder contextHolder;
    private final NacosService nacosService;
    private final SkillService skillService;
    private final ObjectMapper objectMapper;

    // ===== 3.2 创建资产 =====

    @Override
    public DeveloperAssetResult createAsset(CreateDeveloperAssetParam param) {
        String ownerId = contextHolder.getUser();
        String portalId = contextHolder.getPortal();

        // 校验名称重复（排除 SUPERSEDED 和副本）
        boolean exists =
                developerAssetRepository
                        .existsByOwnerIdAndTypeAndNameAndReviewStatusNotAndParentAssetIdIsNull(
                                ownerId, param.getType(), param.getName(), ReviewStatus.SUPERSEDED);
        if (exists) {
            throw new BusinessException(ErrorCode.CONFLICT, "同类型下已存在同名资产");
        }

        // 构建 config
        DeveloperAssetConfig config = buildConfigFromParam(param.getType(), param);

        DeveloperAsset asset =
                DeveloperAsset.builder()
                        .assetId(IdGenerator.genAssetId())
                        .ownerId(ownerId)
                        .portalId(portalId)
                        .name(param.getName())
                        .type(param.getType())
                        .config(config)
                        .reviewStatus(ReviewStatus.DRAFT)
                        .build();

        developerAssetRepository.save(asset);
        log.info(
                "Created developer asset: {} type={} owner={}",
                asset.getAssetId(),
                param.getType(),
                ownerId);

        return toResult(asset);
    }

    // ===== 3.3 文件上传 =====

    @Override
    public DeveloperAssetResult uploadPackage(String assetId, MultipartFile file)
            throws IOException {
        DeveloperAsset asset = findAssetAndCheckOwner(assetId);

        // 校验状态
        if (asset.getReviewStatus() != ReviewStatus.DRAFT
                && asset.getReviewStatus() != ReviewStatus.REJECTED) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "只有草稿或审核拒绝状态的资产才能上传文件包");
        }

        // 校验类型
        if (asset.getType() != AssetType.AGENT_SKILL && asset.getType() != AssetType.WORKER) {
            throw new BusinessException(
                    ErrorCode.INVALID_REQUEST, "只有 Skill 和 Worker 类型的资产支持上传文件包");
        }

        // 校验文件
        if (file.isEmpty() || file.getSize() > MAX_ZIP_SIZE) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "ZIP 文件不能为空且不能超过 10MB");
        }

        byte[] zipBytes = file.getBytes();
        String ownerId = contextHolder.getUser();

        // 获取默认 Nacos 实例
        NacosResult defaultNacos = nacosService.getDefaultNacosInstance();
        if (defaultNacos == null) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "未配置默认 Nacos 实例");
        }
        String nacosId = defaultNacos.getNacosId();

        if (asset.getType() == AssetType.AGENT_SKILL) {
            uploadSkillPackage(asset, nacosId, ownerId, zipBytes);
        } else {
            uploadWorkerPackage(asset, nacosId, ownerId, zipBytes);
        }

        developerAssetRepository.save(asset);
        log.info("Uploaded package for asset: {} type={}", assetId, asset.getType());

        return toResult(asset);
    }

    // ===== 3.4 列表、详情、更新、删除 =====

    @Override
    @Transactional(readOnly = true)
    public PageResult<DeveloperAssetResult> listAssets(
            QueryDeveloperAssetParam param, Pageable pageable) {
        String ownerId = contextHolder.getUser();

        // 按创建时间倒序
        Pageable sortedPageable =
                PageRequest.of(
                        pageable.getPageNumber(),
                        pageable.getPageSize(),
                        Sort.by(Sort.Direction.DESC, "createAt"));

        Page<DeveloperAsset> page;
        boolean showSuperseded = param.getShowSuperseded() != null && param.getShowSuperseded();

        if (showSuperseded) {
            page = developerAssetRepository.findByOwnerId(ownerId, sortedPageable);
        } else {
            page =
                    developerAssetRepository.findByOwnerIdAndReviewStatusNot(
                            ownerId, ReviewStatus.SUPERSEDED, sortedPageable);
        }

        return new PageResult<DeveloperAssetResult>().convertFrom(page, this::toResult);
    }

    @Override
    @Transactional(readOnly = true)
    public DeveloperAssetResult getAsset(String assetId) {
        DeveloperAsset asset = findAssetAndCheckOwner(assetId);
        return toResult(asset);
    }

    @Override
    public DeveloperAssetResult updateAsset(String assetId, UpdateDeveloperAssetParam param) {
        DeveloperAsset asset = findAssetAndCheckOwner(assetId);

        // 校验状态
        if (asset.getReviewStatus() != ReviewStatus.DRAFT
                && asset.getReviewStatus() != ReviewStatus.REJECTED) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "审核中或已通过的资产不允许编辑");
        }

        // REJECTED 状态编辑后重置为 DRAFT
        if (asset.getReviewStatus() == ReviewStatus.REJECTED) {
            asset.setReviewStatus(ReviewStatus.DRAFT);
            asset.setReviewComment(null);
            asset.setReviewedBy(null);
            asset.setReviewedAt(null);
        }

        // 更新字段
        DeveloperAssetConfig config = asset.getConfig();
        if (param.getDescription() != null) {
            config.setDescription(param.getDescription());
        }
        if (param.getIcon() != null) {
            config.setIcon(param.getIcon());
        }

        // 更新类型特有配置
        if (param.getConfig() != null) {
            updateTypeSpecificConfig(asset, param.getConfig());
        }

        developerAssetRepository.save(asset);
        log.info("Updated developer asset: {}", assetId);

        return toResult(asset);
    }

    @Override
    public void deleteAsset(String assetId) {
        DeveloperAsset asset = findAssetAndCheckOwner(assetId);

        if (asset.getReviewStatus() == ReviewStatus.PENDING_REVIEW) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "审核中的资产不允许删除，请先撤回审核");
        }
        if (asset.getReviewStatus() == ReviewStatus.APPROVED) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "已通过审核的资产不允许删除");
        }

        // 清理 Nacos 私有 namespace 中的资源
        cleanupNacosResource(asset);

        developerAssetRepository.delete(asset);
        log.info("Deleted developer asset: {}", assetId);
    }

    // ===== 3.5 显示状态映射 =====

    private String computeDisplayStatus(DeveloperAsset asset) {
        ReviewStatus status = asset.getReviewStatus();

        switch (status) {
            case DRAFT:
                return "草稿";
            case PENDING_REVIEW:
                return "审核中";
            case REJECTED:
                return "审核拒绝";
            case SUPERSEDED:
                return "已替代";
            case APPROVED:
                return computeApprovedDisplayStatus(asset);
            default:
                return status.name();
        }
    }

    private String computeApprovedDisplayStatus(DeveloperAsset asset) {
        String productId = asset.getProductId();
        if (StrUtil.isBlank(productId)) {
            return "待发布";
        }

        // 检查是否有发布记录
        boolean hasPublication = productPublicationRepository.existsByProductId(productId);
        if (hasPublication) {
            return "已发布";
        }

        // 无发布记录，检查是否有下架原因
        if (StrUtil.isNotBlank(asset.getUnpublishedReason())) {
            return "已下架";
        }

        return "待发布";
    }

    // ===== 5.1 提交审核 =====

    @Override
    public void submitReview(String assetId) {
        DeveloperAsset asset = findAssetAndCheckOwner(assetId);

        // 校验当前状态为 DRAFT
        if (asset.getReviewStatus() != ReviewStatus.DRAFT) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "只有草稿状态的资产才能提交审核");
        }

        // 校验必填信息完整性
        validateRequiredFieldsForSubmit(asset);

        // 更新状态
        asset.setReviewStatus(ReviewStatus.PENDING_REVIEW);
        asset.setSubmittedAt(LocalDateTime.now());
        developerAssetRepository.save(asset);

        log.info("Submitted asset for review: {}", assetId);
    }

    // ===== 5.2 撤回审核 =====

    @Override
    public void withdrawReview(String assetId) {
        DeveloperAsset asset = findAssetAndCheckOwner(assetId);

        // 使用乐观锁更新状态
        int updated =
                developerAssetRepository.updateReviewStatus(
                        assetId, ReviewStatus.PENDING_REVIEW, ReviewStatus.DRAFT, null);

        if (updated == 0) {
            throw new BusinessException(ErrorCode.CONFLICT, "该资产已被审核，无法撤回");
        }

        log.info("Withdrew review for asset: {}", assetId);
    }

    // ===== 内部方法 =====

    private DeveloperAsset findAssetAndCheckOwner(String assetId) {
        DeveloperAsset asset =
                developerAssetRepository
                        .findByAssetId(assetId)
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                ErrorCode.NOT_FOUND, "developer_asset", assetId));

        String currentUser = contextHolder.getUser();
        if (!asset.getOwnerId().equals(currentUser)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "无权访问该资产");
        }

        return asset;
    }

    private DeveloperAssetResult toResult(DeveloperAsset asset) {
        DeveloperAssetResult result = new DeveloperAssetResult().convertFrom(asset);
        result.setDisplayStatus(computeDisplayStatus(asset));
        return result;
    }

    @SuppressWarnings("unchecked")
    private DeveloperAssetConfig buildConfigFromParam(
            AssetType type, CreateDeveloperAssetParam param) {
        Map<String, Object> configMap = param.getConfig();

        switch (type) {
            case MCP_SERVER:
                McpServerAssetConfig mcpConfig = new McpServerAssetConfig();
                mcpConfig.setType("MCP_SERVER");
                mcpConfig.setVersion("1.0.0");
                mcpConfig.setDescription(param.getDescription());
                mcpConfig.setIcon(param.getIcon());
                if (configMap != null) {
                    mcpConfig.setProtocolType((String) configMap.get("protocolType"));
                    mcpConfig.setUrl((String) configMap.get("url"));
                    mcpConfig.setHeaders((Map<String, String>) configMap.get("headers"));
                    if (configMap.get("mcpConfig") instanceof Map) {
                        mcpConfig.setMcpConfig((Map<String, Object>) configMap.get("mcpConfig"));
                    }
                    mcpConfig.setRepoUrl((String) configMap.get("repoUrl"));
                    if (configMap.get("tags") instanceof java.util.List) {
                        mcpConfig.setTags((java.util.List<String>) configMap.get("tags"));
                    }
                    if (configMap.get("sandboxRequired") instanceof Boolean) {
                        mcpConfig.setSandboxRequired((Boolean) configMap.get("sandboxRequired"));
                    }
                    mcpConfig.setExtraParams((String) configMap.get("extraParams"));
                    mcpConfig.setServiceIntro((String) configMap.get("serviceIntro"));
                    mcpConfig.setMcpConfigJson((String) configMap.get("mcpConfigJson"));
                }
                return mcpConfig;

            case AGENT_SKILL:
                SkillAssetConfig skillConfig = new SkillAssetConfig();
                skillConfig.setType("AGENT_SKILL");
                skillConfig.setVersion("1.0.0");
                skillConfig.setDescription(param.getDescription());
                skillConfig.setIcon(param.getIcon());
                return skillConfig;

            case WORKER:
                WorkerAssetConfig workerConfig = new WorkerAssetConfig();
                workerConfig.setType("WORKER");
                workerConfig.setVersion("1.0.0");
                workerConfig.setDescription(param.getDescription());
                workerConfig.setIcon(param.getIcon());
                return workerConfig;

            default:
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "不支持的资产类型: " + type);
        }
    }

    private void uploadSkillPackage(
            DeveloperAsset asset, String nacosId, String ownerId, byte[] zipBytes) {
        SkillAssetConfig config = (SkillAssetConfig) asset.getConfig();
        NacosInfo nacos = config.getNacos();

        // 如果已有旧版本，先删除
        if (nacos != null && StrUtil.isNotBlank(nacos.getSkillName())) {
            try {
                skillService.deleteSkill(
                        nacos.getNacosId(), nacos.getNamespace(), nacos.getSkillName());
                log.info(
                        "Deleted old Skill from Nacos: {} in {}",
                        nacos.getSkillName(),
                        nacos.getNamespace());
            } catch (Exception e) {
                log.warn("Failed to delete old Skill from Nacos, continuing with upload", e);
            }
        }

        // 上传新版本（overwrite=true 覆盖已有 working version）
        String skillName =
                skillService.uploadSkillFromZip(
                        nacosId, DEVELOPER_PRIVATE_NAMESPACE, zipBytes, true);
        log.info("Uploaded Skill to Nacos private namespace: {}", skillName);

        // 立即发布为 online，否则 Skill 停留在 editing 状态：
        // 1. Nacos 前端看不到（默认只展示 online 版本）
        // 2. getSkillDetail 读不到文件内容
        // 3. 再次上传会被 editing version 阻塞
        try {
            var skillMeta =
                    nacosService
                            .getAiMaintainerService(nacosId)
                            .skill()
                            .getSkillMeta(DEVELOPER_PRIVATE_NAMESPACE, skillName);
            String editingVer = skillMeta != null ? skillMeta.getEditingVersion() : null;
            if (StrUtil.isNotBlank(editingVer)) {
                nacosService
                        .getAiMaintainerService(nacosId)
                        .skill()
                        .forcePublish(DEVELOPER_PRIVATE_NAMESPACE, skillName, editingVer, true);
                log.info(
                        "Force-published Skill {} version {} in private namespace",
                        skillName,
                        editingVer);
            }
        } catch (Exception e) {
            log.warn("Failed to force-publish Skill {}, it remains in editing state", skillName, e);
        }

        // 更新 config 中的 nacos 信息
        NacosInfo newNacos =
                NacosInfo.builder()
                        .nacosId(nacosId)
                        .namespace(DEVELOPER_PRIVATE_NAMESPACE)
                        .skillName(skillName)
                        .build();
        config.setNacos(newNacos);
    }

    private void uploadWorkerPackage(
            DeveloperAsset asset, String nacosId, String ownerId, byte[] zipBytes) {
        WorkerAssetConfig config = (WorkerAssetConfig) asset.getConfig();
        NacosInfo nacos = config.getNacos();

        // 如果已有旧版本，先删除
        if (nacos != null && StrUtil.isNotBlank(nacos.getAgentSpecName())) {
            try {
                nacosService
                        .getAiMaintainerService(nacos.getNacosId())
                        .agentSpec()
                        .deleteAgentSpec(nacos.getNamespace(), nacos.getAgentSpecName());
                log.info(
                        "Deleted old AgentSpec from Nacos: {} in {}",
                        nacos.getAgentSpecName(),
                        nacos.getNamespace());
            } catch (Exception e) {
                log.warn("Failed to delete old AgentSpec from Nacos, continuing with upload", e);
            }
        }

        // Worker 上传使用 AiMaintainerService 的 agentSpec 接口
        try {
            String agentSpecName =
                    nacosService
                            .getAiMaintainerService(nacosId)
                            .agentSpec()
                            .uploadAgentSpecFromZip(DEVELOPER_PRIVATE_NAMESPACE, zipBytes, true);
            log.info("Uploaded Worker to Nacos private namespace: {}", agentSpecName);

            // 立即发布为 online（和 Skill 同理）
            try {
                var specMeta =
                        nacosService
                                .getAiMaintainerService(nacosId)
                                .agentSpec()
                                .getAgentSpecAdminDetail(
                                        DEVELOPER_PRIVATE_NAMESPACE, agentSpecName);
                String editingVer = specMeta != null ? specMeta.getEditingVersion() : null;
                if (StrUtil.isNotBlank(editingVer)) {
                    nacosService
                            .getAiMaintainerService(nacosId)
                            .agentSpec()
                            .publish(DEVELOPER_PRIVATE_NAMESPACE, agentSpecName, editingVer, true);
                    log.info(
                            "Published AgentSpec {} version {} in private namespace",
                            agentSpecName,
                            editingVer);
                }
            } catch (Exception pubEx) {
                log.warn(
                        "Failed to publish AgentSpec {}, it remains in editing state",
                        agentSpecName,
                        pubEx);
            }

            // 更新 config 中的 nacos 信息
            NacosInfo newNacos =
                    NacosInfo.builder()
                            .nacosId(nacosId)
                            .namespace(DEVELOPER_PRIVATE_NAMESPACE)
                            .agentSpecName(agentSpecName)
                            .build();
            config.setNacos(newNacos);
        } catch (NacosException e) {
            log.error("Failed to upload Worker to Nacos", e);
            throw new BusinessException(
                    ErrorCode.INTERNAL_ERROR, "上传 Worker 到 Nacos 失败: " + e.getMessage());
        }
    }

    private void cleanupNacosResource(DeveloperAsset asset) {
        if (asset.getType() == AssetType.AGENT_SKILL) {
            SkillAssetConfig config = (SkillAssetConfig) asset.getConfig();
            NacosInfo nacos = config.getNacos();
            if (nacos != null && StrUtil.isNotBlank(nacos.getSkillName())) {
                try {
                    skillService.deleteSkill(
                            nacos.getNacosId(), nacos.getNamespace(), nacos.getSkillName());
                    log.info("Cleaned up Skill from Nacos: {}", nacos.getSkillName());
                } catch (Exception e) {
                    log.warn("Failed to cleanup Skill from Nacos", e);
                }
            }
        } else if (asset.getType() == AssetType.WORKER) {
            WorkerAssetConfig config = (WorkerAssetConfig) asset.getConfig();
            NacosInfo nacos = config.getNacos();
            if (nacos != null && StrUtil.isNotBlank(nacos.getAgentSpecName())) {
                try {
                    nacosService
                            .getAiMaintainerService(nacos.getNacosId())
                            .agentSpec()
                            .deleteAgentSpec(nacos.getNamespace(), nacos.getAgentSpecName());
                    log.info("Cleaned up AgentSpec from Nacos: {}", nacos.getAgentSpecName());
                } catch (Exception e) {
                    log.warn("Failed to cleanup AgentSpec from Nacos", e);
                }
            }
        }
    }

    private void validateRequiredFieldsForSubmit(DeveloperAsset asset) {
        // 所有类型：名称、描述非空
        if (StrUtil.isBlank(asset.getName())) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "缺少必填字段：名称");
        }
        DeveloperAssetConfig config = asset.getConfig();
        if (config == null || StrUtil.isBlank(config.getDescription())) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "缺少必填字段：描述");
        }

        switch (asset.getType()) {
            case MCP_SERVER:
                if (!(config instanceof McpServerAssetConfig)) {
                    throw new BusinessException(ErrorCode.INVALID_REQUEST, "MCP_SERVER 配置信息异常");
                }
                McpServerAssetConfig mcpConfig = (McpServerAssetConfig) config;
                if (StrUtil.isBlank(mcpConfig.getProtocolType())) {
                    throw new BusinessException(ErrorCode.INVALID_REQUEST, "缺少必填字段：协议类型");
                }
                if (StrUtil.isBlank(mcpConfig.getUrl())) {
                    throw new BusinessException(ErrorCode.INVALID_REQUEST, "缺少必填字段：URL");
                }
                break;

            case AGENT_SKILL:
                if (!(config instanceof SkillAssetConfig)) {
                    throw new BusinessException(ErrorCode.INVALID_REQUEST, "AGENT_SKILL 配置信息异常");
                }
                SkillAssetConfig skillConfig = (SkillAssetConfig) config;
                if (skillConfig.getNacos() == null
                        || StrUtil.isBlank(skillConfig.getNacos().getSkillName())) {
                    throw new BusinessException(ErrorCode.INVALID_REQUEST, "请先上传 Skill 文件包");
                }
                break;

            case WORKER:
                if (!(config instanceof WorkerAssetConfig)) {
                    throw new BusinessException(ErrorCode.INVALID_REQUEST, "WORKER 配置信息异常");
                }
                WorkerAssetConfig workerConfig = (WorkerAssetConfig) config;
                if (workerConfig.getNacos() == null
                        || StrUtil.isBlank(workerConfig.getNacos().getAgentSpecName())) {
                    throw new BusinessException(ErrorCode.INVALID_REQUEST, "请先上传 Worker 文件包");
                }
                break;

            default:
                throw new BusinessException(
                        ErrorCode.INVALID_PARAMETER, "不支持的资产类型: " + asset.getType());
        }
    }

    @SuppressWarnings("unchecked")
    private void updateTypeSpecificConfig(DeveloperAsset asset, Map<String, Object> configMap) {
        DeveloperAssetConfig config = asset.getConfig();

        if (asset.getType() == AssetType.MCP_SERVER && config instanceof McpServerAssetConfig) {
            McpServerAssetConfig mcpConfig = (McpServerAssetConfig) config;
            if (configMap.containsKey("protocolType")) {
                mcpConfig.setProtocolType((String) configMap.get("protocolType"));
            }
            if (configMap.containsKey("url")) {
                mcpConfig.setUrl((String) configMap.get("url"));
            }
            if (configMap.containsKey("headers")) {
                mcpConfig.setHeaders((Map<String, String>) configMap.get("headers"));
            }
            if (configMap.containsKey("mcpConfig") && configMap.get("mcpConfig") instanceof Map) {
                mcpConfig.setMcpConfig((Map<String, Object>) configMap.get("mcpConfig"));
            }
            if (configMap.containsKey("repoUrl")) {
                mcpConfig.setRepoUrl((String) configMap.get("repoUrl"));
            }
            if (configMap.containsKey("tags") && configMap.get("tags") instanceof java.util.List) {
                mcpConfig.setTags((java.util.List<String>) configMap.get("tags"));
            }
            if (configMap.containsKey("sandboxRequired")
                    && configMap.get("sandboxRequired") instanceof Boolean) {
                mcpConfig.setSandboxRequired((Boolean) configMap.get("sandboxRequired"));
            }
            if (configMap.containsKey("extraParams")) {
                mcpConfig.setExtraParams((String) configMap.get("extraParams"));
            }
            if (configMap.containsKey("serviceIntro")) {
                mcpConfig.setServiceIntro((String) configMap.get("serviceIntro"));
            }
            if (configMap.containsKey("mcpConfigJson")) {
                mcpConfig.setMcpConfigJson((String) configMap.get("mcpConfigJson"));
            }
        }
        // AGENT_SKILL 和 WORKER 的 nacos 信息通过 uploadPackage 更新，不在此处处理
    }

    // ===== 文件浏览 =====

    @Override
    public List<FileTreeNode> getAssetFiles(String assetId) {
        DeveloperAsset asset = findAssetAndCheckOwner(assetId);
        NacosInfo nacos = extractNacosInfo(asset);
        if (nacos == null) {
            return Collections.emptyList();
        }

        try {
            if (asset.getType() == AssetType.AGENT_SKILL) {
                String version = resolveLatestSkillVersion(nacos);
                Skill skill =
                        skillService.getSkillDetail(
                                nacos.getNacosId(),
                                nacos.getNamespace(),
                                nacos.getSkillName(),
                                version);
                return FileTreeBuilder.build(skill);
            } else {
                // WORKER
                String version = resolveLatestAgentSpecVersion(nacos);
                AgentSpec spec =
                        nacosService
                                .getAiMaintainerService(nacos.getNacosId())
                                .agentSpec()
                                .getAgentSpecVersionDetail(
                                        nacos.getNamespace(), nacos.getAgentSpecName(), version);
                return buildWorkerFileTree(spec);
            }
        } catch (Exception e) {
            log.warn("Failed to fetch file tree for asset {}", assetId, e);
            return Collections.emptyList();
        }
    }

    @Override
    public FileContentResult getAssetFileContent(String assetId, String path) {
        DeveloperAsset asset = findAssetAndCheckOwner(assetId);
        NacosInfo nacos = extractNacosInfo(asset);
        if (nacos == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "该资产未上传文件包");
        }

        try {
            if (asset.getType() == AssetType.AGENT_SKILL) {
                return getSkillFileContent(nacos, path);
            } else {
                return getWorkerFileContent(nacos, path);
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Failed to fetch file content for asset {} path {}", assetId, path, e);
            throw new BusinessException(ErrorCode.NOT_FOUND, "文件", path);
        }
    }

    /**
     * Resolves the latest Skill version from Nacos metadata. Checks the "latest" label first, then
     * falls back to the most recent version by createTime.
     */
    private String resolveLatestSkillVersion(NacosInfo nacos) {
        try {
            SkillMeta meta =
                    nacosService
                            .getAiMaintainerService(nacos.getNacosId())
                            .skill()
                            .getSkillMeta(nacos.getNamespace(), nacos.getSkillName());
            if (meta == null || CollUtil.isEmpty(meta.getVersions())) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "Skill 版本", nacos.getSkillName());
            }
            if (meta.getLabels() != null && StrUtil.isNotBlank(meta.getLabels().get("latest"))) {
                return meta.getLabels().get("latest");
            }
            return meta.getVersions().stream()
                    .sorted(
                            Comparator.comparing(
                                            SkillMeta.SkillVersionSummary::getCreateTime,
                                            Comparator.nullsLast(Long::compareTo))
                                    .reversed())
                    .map(SkillMeta.SkillVersionSummary::getVersion)
                    .findFirst()
                    .orElseThrow(
                            () ->
                                    new BusinessException(
                                            ErrorCode.NOT_FOUND, "Skill 版本", nacos.getSkillName()));
        } catch (NacosException e) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "Skill 版本", nacos.getSkillName());
        }
    }

    /**
     * Resolves the latest AgentSpec version from Nacos metadata. Checks the "latest" label first,
     * then falls back to the most recent version by createTime.
     */
    private String resolveLatestAgentSpecVersion(NacosInfo nacos) {
        try {
            AgentSpecMeta meta =
                    nacosService
                            .getAiMaintainerService(nacos.getNacosId())
                            .agentSpec()
                            .getAgentSpecAdminDetail(
                                    nacos.getNamespace(), nacos.getAgentSpecName());
            if (meta == null || CollUtil.isEmpty(meta.getVersions())) {
                throw new BusinessException(
                        ErrorCode.NOT_FOUND, "AgentSpec 版本", nacos.getAgentSpecName());
            }
            if (meta.getLabels() != null && StrUtil.isNotBlank(meta.getLabels().get("latest"))) {
                return meta.getLabels().get("latest");
            }
            return meta.getVersions().stream()
                    .sorted(
                            Comparator.comparing(
                                            AgentSpecMeta.AgentSpecVersionSummary::getCreateTime,
                                            Comparator.nullsLast(Long::compareTo))
                                    .reversed())
                    .map(AgentSpecMeta.AgentSpecVersionSummary::getVersion)
                    .findFirst()
                    .orElseThrow(
                            () ->
                                    new BusinessException(
                                            ErrorCode.NOT_FOUND,
                                            "AgentSpec 版本",
                                            nacos.getAgentSpecName()));
        } catch (NacosException e) {
            throw new BusinessException(
                    ErrorCode.NOT_FOUND, "AgentSpec 版本", nacos.getAgentSpecName());
        }
    }

    private NacosInfo extractNacosInfo(DeveloperAsset asset) {
        if (asset.getType() != AssetType.AGENT_SKILL && asset.getType() != AssetType.WORKER) {
            return null;
        }
        DeveloperAssetConfig config = asset.getConfig();
        NacosInfo nacos = null;
        if (config instanceof SkillAssetConfig skillConfig) {
            nacos = skillConfig.getNacos();
        } else if (config instanceof WorkerAssetConfig workerConfig) {
            nacos = workerConfig.getNacos();
        }
        if (nacos == null || StrUtil.isBlank(nacos.getNacosId())) {
            return null;
        }
        if (asset.getType() == AssetType.AGENT_SKILL && StrUtil.isBlank(nacos.getSkillName())) {
            return null;
        }
        if (asset.getType() == AssetType.WORKER && StrUtil.isBlank(nacos.getAgentSpecName())) {
            return null;
        }
        return nacos;
    }

    private FileContentResult getSkillFileContent(NacosInfo nacos, String path) {
        String version = resolveLatestSkillVersion(nacos);
        Skill skill =
                skillService.getSkillDetail(
                        nacos.getNacosId(), nacos.getNamespace(), nacos.getSkillName(), version);

        // Virtual SKILL.md
        if ("SKILL.md".equals(path)) {
            String skillMd = com.alibaba.himarket.core.skill.SkillMdBuilder.build(skill);
            return FileContentResult.builder()
                    .path("SKILL.md")
                    .content(skillMd)
                    .encoding("text")
                    .size(skillMd.getBytes(StandardCharsets.UTF_8).length)
                    .build();
        }

        String skillNamePrefix = StrUtil.isNotBlank(skill.getName()) ? skill.getName() + "/" : "";

        if (skill.getResource() != null) {
            for (SkillResource resource : skill.getResource().values()) {
                String resourcePath = buildSkillResourcePath(resource);
                if (!skillNamePrefix.isEmpty() && resourcePath.startsWith(skillNamePrefix)) {
                    resourcePath = resourcePath.substring(skillNamePrefix.length());
                }
                if (path.equals(resourcePath)) {
                    Map<String, Object> meta = resource.getMetadata();
                    String encoding =
                            meta != null && "base64".equals(meta.get("encoding"))
                                    ? "base64"
                                    : "text";
                    String content = StrUtil.nullToDefault(resource.getContent(), "");
                    return FileContentResult.builder()
                            .path(resourcePath)
                            .content(content)
                            .encoding(encoding)
                            .size(content.getBytes(StandardCharsets.UTF_8).length)
                            .build();
                }
            }
        }
        throw new BusinessException(ErrorCode.NOT_FOUND, "文件", path);
    }

    private String buildSkillResourcePath(SkillResource resource) {
        String name = resource.getName() != null ? resource.getName() : "";
        String type = resource.getType();
        if (type != null && !type.isEmpty()) {
            return type + "/" + name;
        }
        return name;
    }

    private FileContentResult getWorkerFileContent(NacosInfo nacos, String path)
            throws NacosException {
        String version = resolveLatestAgentSpecVersion(nacos);
        AgentSpec spec =
                nacosService
                        .getAiMaintainerService(nacos.getNacosId())
                        .agentSpec()
                        .getAgentSpecVersionDetail(
                                nacos.getNamespace(), nacos.getAgentSpecName(), version);

        if ("manifest.json".equals(path)) {
            String content = StrUtil.nullToDefault(spec.getContent(), "");
            return FileContentResult.builder()
                    .path("manifest.json")
                    .content(content)
                    .encoding("text")
                    .size(content.getBytes(StandardCharsets.UTF_8).length)
                    .build();
        }

        String specNamePrefix = StrUtil.isNotBlank(spec.getName()) ? spec.getName() + "/" : "";

        if (spec.getResource() != null) {
            for (AgentSpecResource resource : spec.getResource().values()) {
                String resourcePath =
                        StrUtil.isNotBlank(resource.getType())
                                ? resource.getType() + "/" + resource.getName()
                                : resource.getName();
                if (!specNamePrefix.isEmpty() && resourcePath.startsWith(specNamePrefix)) {
                    resourcePath = resourcePath.substring(specNamePrefix.length());
                }
                if (path.equals(resourcePath)) {
                    Map<String, Object> meta = resource.getMetadata();
                    String encoding =
                            meta != null && meta.containsKey("encoding")
                                    ? String.valueOf(meta.get("encoding"))
                                    : "text";
                    String content = StrUtil.nullToDefault(resource.getContent(), "");
                    return FileContentResult.builder()
                            .path(resourcePath)
                            .content(content)
                            .encoding(encoding)
                            .size(content.getBytes(StandardCharsets.UTF_8).length)
                            .build();
                }
            }
        }
        throw new BusinessException(ErrorCode.NOT_FOUND, "文件", path);
    }

    private List<FileTreeNode> buildWorkerFileTree(AgentSpec spec) {
        Map<String, FileTreeNode> dirMap = new LinkedHashMap<>();
        List<FileTreeNode> rootChildren = new ArrayList<>();

        // Add manifest.json
        String manifestContent = StrUtil.nullToDefault(spec.getContent(), "");
        FileTreeNode manifestNode = new FileTreeNode();
        manifestNode.setName("manifest.json");
        manifestNode.setPath("manifest.json");
        manifestNode.setType("file");
        manifestNode.setEncoding("text");
        manifestNode.setSize(manifestContent.getBytes(StandardCharsets.UTF_8).length);
        rootChildren.add(manifestNode);

        String specNamePrefix = StrUtil.isNotBlank(spec.getName()) ? spec.getName() + "/" : "";

        if (spec.getResource() != null) {
            for (AgentSpecResource resource : spec.getResource().values()) {
                String resourcePath =
                        StrUtil.isNotBlank(resource.getType())
                                ? resource.getType() + "/" + resource.getName()
                                : resource.getName();
                if (!specNamePrefix.isEmpty() && resourcePath.startsWith(specNamePrefix)) {
                    resourcePath = resourcePath.substring(specNamePrefix.length());
                }

                String[] parts = resourcePath.split("/");
                List<FileTreeNode> currentChildren = rootChildren;
                StringBuilder dirPath = new StringBuilder();

                for (int i = 0; i < parts.length - 1; i++) {
                    if (!dirPath.isEmpty()) {
                        dirPath.append("/");
                    }
                    dirPath.append(parts[i]);
                    final String dirName = parts[i];
                    final String dirFullPath = dirPath.toString();
                    final List<FileTreeNode> parentChildren = currentChildren;

                    FileTreeNode dirNode =
                            dirMap.computeIfAbsent(
                                    dirFullPath,
                                    k -> {
                                        FileTreeNode newDir = new FileTreeNode();
                                        newDir.setName(dirName);
                                        newDir.setPath(dirFullPath);
                                        newDir.setType("directory");
                                        newDir.setChildren(new ArrayList<>());
                                        parentChildren.add(newDir);
                                        return newDir;
                                    });
                    currentChildren = dirNode.getChildren();
                }

                Map<String, Object> meta = resource.getMetadata();
                String encoding =
                        meta != null && meta.containsKey("encoding")
                                ? String.valueOf(meta.get("encoding"))
                                : "text";
                String content = StrUtil.nullToDefault(resource.getContent(), "");

                FileTreeNode fileNode = new FileTreeNode();
                fileNode.setName(parts[parts.length - 1]);
                fileNode.setPath(resourcePath);
                fileNode.setType("file");
                fileNode.setEncoding(encoding);
                fileNode.setSize(content.getBytes(StandardCharsets.UTF_8).length);
                currentChildren.add(fileNode);
            }
        }

        sortWorkerNodes(rootChildren);
        return rootChildren;
    }

    private void sortWorkerNodes(List<FileTreeNode> nodes) {
        nodes.sort(
                Comparator.comparing((FileTreeNode n) -> "file".equals(n.getType()) ? 1 : 0)
                        .thenComparing(FileTreeNode::getName, String.CASE_INSENSITIVE_ORDER));
        for (FileTreeNode node : nodes) {
            if (node.getChildren() != null && !node.getChildren().isEmpty()) {
                sortWorkerNodes(node.getChildren());
            }
        }
    }
}
