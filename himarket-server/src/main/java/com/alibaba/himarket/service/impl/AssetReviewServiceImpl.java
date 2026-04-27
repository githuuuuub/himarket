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
import com.alibaba.himarket.dto.result.asset.ApproveAssetResult;
import com.alibaba.himarket.dto.result.asset.AssetReviewDetailResult;
import com.alibaba.himarket.dto.result.asset.AssetReviewResult;
import com.alibaba.himarket.dto.result.common.FileContentResult;
import com.alibaba.himarket.dto.result.common.FileTreeNode;
import com.alibaba.himarket.dto.result.common.PageResult;
import com.alibaba.himarket.dto.result.nacos.NacosResult;
import com.alibaba.himarket.entity.DeveloperAsset;
import com.alibaba.himarket.entity.NacosInstance;
import com.alibaba.himarket.entity.Product;
import com.alibaba.himarket.repository.DeveloperAssetRepository;
import com.alibaba.himarket.repository.DeveloperRepository;
import com.alibaba.himarket.repository.ProductRepository;
import com.alibaba.himarket.service.AssetReviewService;
import com.alibaba.himarket.service.NacosService;
import com.alibaba.himarket.service.SkillService;
import com.alibaba.himarket.support.asset.*;
import com.alibaba.himarket.support.enums.AssetType;
import com.alibaba.himarket.support.enums.ProductStatus;
import com.alibaba.himarket.support.enums.ProductType;
import com.alibaba.himarket.support.enums.ReviewStatus;
import com.alibaba.himarket.support.product.ProductFeature;
import com.alibaba.himarket.support.product.SkillConfig;
import com.alibaba.himarket.support.product.WorkerConfig;
import com.alibaba.nacos.api.ai.model.agentspecs.AgentSpec;
import com.alibaba.nacos.api.ai.model.agentspecs.AgentSpecMeta;
import com.alibaba.nacos.api.ai.model.agentspecs.AgentSpecResource;
import com.alibaba.nacos.api.ai.model.skills.Skill;
import com.alibaba.nacos.api.ai.model.skills.SkillMeta;
import com.alibaba.nacos.api.ai.model.skills.SkillResource;
import com.alibaba.nacos.api.exception.NacosException;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
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

@Service
@Slf4j
@RequiredArgsConstructor
@Transactional
public class AssetReviewServiceImpl implements AssetReviewService {

    private final DeveloperAssetRepository developerAssetRepository;
    private final DeveloperRepository developerRepository;
    private final ProductRepository productRepository;
    private final ContextHolder contextHolder;
    private final NacosService nacosService;
    private final SkillService skillService;

    @Override
    @Transactional(readOnly = true)
    public PageResult<AssetReviewResult> listPendingReviews(Pageable pageable) {
        String portalId = contextHolder.getPortal();

        Pageable sortedPageable =
                PageRequest.of(
                        pageable.getPageNumber(),
                        pageable.getPageSize(),
                        Sort.by(Sort.Direction.ASC, "submittedAt"));

        Page<DeveloperAsset> page =
                developerAssetRepository.findByPortalIdAndReviewStatus(
                        portalId, ReviewStatus.PENDING_REVIEW, sortedPageable);

        return new PageResult<AssetReviewResult>().convertFrom(page, this::toReviewResult);
    }

    @Override
    @Transactional(readOnly = true)
    public AssetReviewDetailResult getReviewDetail(String assetId) {
        DeveloperAsset asset = findAssetAndCheckPortal(assetId);

        AssetReviewDetailResult result = new AssetReviewDetailResult();
        result.setAssetId(asset.getAssetId());
        result.setName(asset.getName());
        result.setType(asset.getType());
        result.setConfig(asset.getConfig());
        result.setReviewStatus(asset.getReviewStatus());
        result.setSubmittedAt(asset.getSubmittedAt());
        result.setParentAssetId(asset.getParentAssetId());
        result.setOwnerId(asset.getOwnerId());

        // 提交者名称
        developerRepository
                .findByDeveloperId(asset.getOwnerId())
                .ifPresent(dev -> result.setOwnerName(dev.getUsername()));

        // 副本信息
        if (StrUtil.isNotBlank(asset.getParentAssetId())) {
            result.setUpdateCopy(true);
            developerAssetRepository
                    .findByAssetId(asset.getParentAssetId())
                    .ifPresent(
                            parent -> {
                                if (StrUtil.isNotBlank(parent.getProductId())) {
                                    productRepository
                                            .findByProductId(parent.getProductId())
                                            .ifPresent(
                                                    product ->
                                                            result.setParentProductName(
                                                                    product.getName()));
                                }
                            });
        }

        return result;
    }

    @Override
    public ApproveAssetResult approveAsset(String assetId, boolean applyUpdate) {
        DeveloperAsset asset = findAssetAndCheckPortal(assetId);

        if (asset.getReviewStatus() != ReviewStatus.PENDING_REVIEW) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "只有待审核状态的资产才能审核通过");
        }

        String adminId = contextHolder.getUser();

        // Step 1: 外部资源操作
        String officialSkillName = null;
        String officialAgentSpecName = null;
        String officialNacosId = null;
        String officialNamespace = null;

        if (asset.getType() == AssetType.AGENT_SKILL) {
            SkillAssetConfig skillAssetConfig = (SkillAssetConfig) asset.getConfig();
            NacosInfo nacos = skillAssetConfig.getNacos();
            if (nacos == null || StrUtil.isBlank(nacos.getSkillName())) {
                throw new BusinessException(ErrorCode.INVALID_REQUEST, "Skill 资产缺少 Nacos 信息");
            }

            NacosResult defaultNacos = nacosService.getDefaultNacosInstance();
            if (defaultNacos == null) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR, "未配置默认 Nacos 实例");
            }
            officialNacosId = defaultNacos.getNacosId();
            officialNamespace =
                    StrUtil.isNotBlank(defaultNacos.getDefaultNamespace())
                            ? defaultNacos.getDefaultNamespace()
                            : "public";

            // 从私有 namespace 下载 Skill ZIP，在正式 namespace 创建
            try {
                byte[] zipBytes =
                        downloadSkillZipFromNacos(
                                nacos.getNacosId(), nacos.getNamespace(), nacos.getSkillName());
                officialSkillName =
                        skillService.uploadSkillFromZip(
                                officialNacosId, officialNamespace, zipBytes);
                log.info(
                        "Created Skill in official namespace: {} -> {}",
                        nacos.getSkillName(),
                        officialSkillName);
            } catch (BusinessException e) {
                throw e;
            } catch (Exception e) {
                log.error("Failed to create Skill in official namespace", e);
                throw new BusinessException(
                        ErrorCode.INTERNAL_ERROR, "创建正式 Skill 失败: " + e.getMessage());
            }
        } else if (asset.getType() == AssetType.WORKER) {
            WorkerAssetConfig workerAssetConfig = (WorkerAssetConfig) asset.getConfig();
            NacosInfo nacos = workerAssetConfig.getNacos();
            if (nacos == null || StrUtil.isBlank(nacos.getAgentSpecName())) {
                throw new BusinessException(ErrorCode.INVALID_REQUEST, "Worker 资产缺少 Nacos 信息");
            }

            NacosResult defaultNacos = nacosService.getDefaultNacosInstance();
            if (defaultNacos == null) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR, "未配置默认 Nacos 实例");
            }
            officialNacosId = defaultNacos.getNacosId();
            officialNamespace =
                    StrUtil.isNotBlank(defaultNacos.getDefaultNamespace())
                            ? defaultNacos.getDefaultNamespace()
                            : "public";

            // 从私有 namespace 下载 AgentSpec ZIP，在正式 namespace 创建
            try {
                byte[] zipBytes =
                        downloadAgentSpecZipFromNacos(
                                nacos.getNacosId(), nacos.getNamespace(), nacos.getAgentSpecName());
                officialAgentSpecName =
                        nacosService
                                .getAiMaintainerService(officialNacosId)
                                .agentSpec()
                                .uploadAgentSpecFromZip(officialNamespace, zipBytes, true);
                log.info(
                        "Created AgentSpec in official namespace: {} -> {}",
                        nacos.getAgentSpecName(),
                        officialAgentSpecName);
            } catch (NacosException e) {
                log.error("Failed to create AgentSpec in official namespace", e);
                throw new BusinessException(
                        ErrorCode.INTERNAL_ERROR, "创建正式 Worker 失败: " + e.getMessage());
            } catch (BusinessException e) {
                throw e;
            } catch (Exception e) {
                log.error("Failed to create AgentSpec in official namespace", e);
                throw new BusinessException(
                        ErrorCode.INTERNAL_ERROR, "创建正式 Worker 失败: " + e.getMessage());
            }
        }
        // MCP_SERVER: 无外部操作

        // Step 2: 创建 Product 记录
        String productId = IdGenerator.genApiProductId();
        Product product = buildProductFromAsset(asset, productId, adminId);

        // 设置 Skill/Worker 的正式 Nacos 信息
        if (asset.getType() == AssetType.AGENT_SKILL && officialSkillName != null) {
            ProductFeature feature = new ProductFeature();
            feature.setSkillConfig(
                    SkillConfig.builder()
                            .nacosId(officialNacosId)
                            .namespace(officialNamespace)
                            .skillName(officialSkillName)
                            .build());
            product.setFeature(feature);
        } else if (asset.getType() == AssetType.WORKER && officialAgentSpecName != null) {
            ProductFeature feature = new ProductFeature();
            feature.setWorkerConfig(
                    WorkerConfig.builder()
                            .nacosId(officialNacosId)
                            .namespace(officialNamespace)
                            .agentSpecName(officialAgentSpecName)
                            .build());
            product.setFeature(feature);
        }

        productRepository.save(product);
        log.info("Created product {} from asset {}", productId, assetId);

        // Step 3: 更新 asset 状态
        asset.setReviewStatus(ReviewStatus.APPROVED);
        asset.setReviewedBy(adminId);
        asset.setReviewedAt(LocalDateTime.now());
        asset.setProductId(productId);
        developerAssetRepository.save(asset);

        log.info("Approved asset: {} -> product: {}", assetId, productId);

        return ApproveAssetResult.builder().productId(productId).updateApplied(false).build();
    }

    @Override
    public void rejectAsset(String assetId, String comment) {
        if (StrUtil.isBlank(comment)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "拒绝审核时必须填写原因");
        }

        DeveloperAsset asset = findAssetAndCheckPortal(assetId);

        if (asset.getReviewStatus() != ReviewStatus.PENDING_REVIEW) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "只有待审核状态的资产才能拒绝");
        }

        String adminId = contextHolder.getUser();

        asset.setReviewStatus(ReviewStatus.REJECTED);
        asset.setReviewComment(comment);
        asset.setReviewedBy(adminId);
        asset.setReviewedAt(LocalDateTime.now());
        developerAssetRepository.save(asset);

        log.info("Rejected asset: {} reason: {}", assetId, comment);
    }

    // ===== 内部方法 =====

    private DeveloperAsset findAssetAndCheckPortal(String assetId) {
        DeveloperAsset asset =
                developerAssetRepository
                        .findByAssetId(assetId)
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                ErrorCode.NOT_FOUND, "developer_asset", assetId));

        String currentPortal = contextHolder.getPortal();
        if (!asset.getPortalId().equals(currentPortal)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "无权审核其他门户的资产");
        }

        return asset;
    }

    private AssetReviewResult toReviewResult(DeveloperAsset asset) {
        AssetReviewResult result = new AssetReviewResult();
        result.setAssetId(asset.getAssetId());
        result.setName(asset.getName());
        result.setType(asset.getType());
        result.setSubmittedAt(asset.getSubmittedAt());

        // 提交者名称
        developerRepository
                .findByDeveloperId(asset.getOwnerId())
                .ifPresent(dev -> result.setOwnerName(dev.getUsername()));

        // 副本信息
        if (StrUtil.isNotBlank(asset.getParentAssetId())) {
            result.setUpdateCopy(true);
            developerAssetRepository
                    .findByAssetId(asset.getParentAssetId())
                    .ifPresent(
                            parent -> {
                                if (StrUtil.isNotBlank(parent.getProductId())) {
                                    productRepository
                                            .findByProductId(parent.getProductId())
                                            .ifPresent(
                                                    product ->
                                                            result.setParentProductName(
                                                                    product.getName()));
                                }
                            });
        }

        return result;
    }

    private Product buildProductFromAsset(DeveloperAsset asset, String productId, String adminId) {
        DeveloperAssetConfig config = asset.getConfig();

        ProductType productType = mapAssetTypeToProductType(asset.getType());

        return Product.builder()
                .productId(productId)
                .adminId(adminId)
                .name(asset.getName())
                .type(productType)
                .description(config.getDescription())
                .status(ProductStatus.PENDING)
                .build();
    }

    private ProductType mapAssetTypeToProductType(AssetType assetType) {
        switch (assetType) {
            case MCP_SERVER:
                return ProductType.MCP_SERVER;
            case AGENT_SKILL:
                return ProductType.AGENT_SKILL;
            case WORKER:
                return ProductType.WORKER;
            default:
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "不支持的资产类型: " + assetType);
        }
    }

    /**
     * 通过 Nacos HTTP API 下载 Skill ZIP 包
     */
    private byte[] downloadSkillZipFromNacos(String nacosId, String namespace, String skillName) {
        NacosInstance nacosInstance = nacosService.findNacosInstanceById(nacosId);
        String baseUrl =
                StrUtil.isNotBlank(nacosInstance.getServerUrl())
                        ? nacosInstance.getServerUrl()
                        : nacosInstance.getDisplayServerUrl();

        try {
            StringBuilder urlBuilder = new StringBuilder();
            urlBuilder.append(baseUrl);
            if (!baseUrl.endsWith("/")) {
                urlBuilder.append("/");
            }
            urlBuilder.append("v3/console/ai/skills/version/download?");
            urlBuilder.append("namespaceId=").append(namespace);
            urlBuilder
                    .append("&skillName=")
                    .append(URLEncoder.encode(skillName, StandardCharsets.UTF_8.name()));

            appendNacosAuth(urlBuilder, nacosInstance);

            return downloadFromUrl(urlBuilder.toString());
        } catch (Exception e) {
            log.error("Failed to download Skill ZIP from Nacos: {}", skillName, e);
            throw new BusinessException(
                    ErrorCode.INTERNAL_ERROR, "从 Nacos 下载 Skill 失败: " + e.getMessage());
        }
    }

    /**
     * 通过 Nacos HTTP API 下载 AgentSpec ZIP 包
     */
    private byte[] downloadAgentSpecZipFromNacos(
            String nacosId, String namespace, String agentSpecName) {
        NacosInstance nacosInstance = nacosService.findNacosInstanceById(nacosId);
        String baseUrl =
                StrUtil.isNotBlank(nacosInstance.getServerUrl())
                        ? nacosInstance.getServerUrl()
                        : nacosInstance.getDisplayServerUrl();

        try {
            StringBuilder urlBuilder = new StringBuilder();
            urlBuilder.append(baseUrl);
            if (!baseUrl.endsWith("/")) {
                urlBuilder.append("/");
            }
            urlBuilder.append("v3/console/ai/agentSpecs/version/download?");
            urlBuilder.append("namespaceId=").append(namespace);
            urlBuilder
                    .append("&agentSpecName=")
                    .append(URLEncoder.encode(agentSpecName, StandardCharsets.UTF_8.name()));

            appendNacosAuth(urlBuilder, nacosInstance);

            return downloadFromUrl(urlBuilder.toString());
        } catch (Exception e) {
            log.error("Failed to download AgentSpec ZIP from Nacos: {}", agentSpecName, e);
            throw new BusinessException(
                    ErrorCode.INTERNAL_ERROR, "从 Nacos 下载 Worker 失败: " + e.getMessage());
        }
    }

    private void appendNacosAuth(StringBuilder urlBuilder, NacosInstance nacosInstance) {
        try {
            if (StrUtil.isNotBlank(nacosInstance.getUsername())
                    && StrUtil.isNotBlank(nacosInstance.getPassword())) {
                urlBuilder
                        .append("&username=")
                        .append(
                                URLEncoder.encode(
                                        nacosInstance.getUsername(),
                                        StandardCharsets.UTF_8.name()));
                urlBuilder
                        .append("&password=")
                        .append(
                                URLEncoder.encode(
                                        nacosInstance.getPassword(),
                                        StandardCharsets.UTF_8.name()));
            }
        } catch (Exception e) {
            log.warn("Failed to encode Nacos auth params", e);
        }
    }

    private byte[] downloadFromUrl(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);

        int responseCode = conn.getResponseCode();
        if (responseCode != HttpURLConnection.HTTP_OK) {
            throw new BusinessException(
                    ErrorCode.INTERNAL_ERROR, "Nacos 下载返回非 200 状态码: " + responseCode);
        }

        try (InputStream input = conn.getInputStream();
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            input.transferTo(output);
            return output.toByteArray();
        }
    }

    // ===== 文件浏览（管理员审核用） =====

    @Override
    @Transactional(readOnly = true)
    public List<FileTreeNode> getAssetFiles(String assetId) {
        DeveloperAsset asset = findAssetAndCheckPortal(assetId);
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
            } else if (asset.getType() == AssetType.WORKER) {
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
        }
        return Collections.emptyList();
    }

    @Override
    @Transactional(readOnly = true)
    public FileContentResult getAssetFileContent(String assetId, String path) {
        DeveloperAsset asset = findAssetAndCheckPortal(assetId);
        NacosInfo nacos = extractNacosInfo(asset);
        if (nacos == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "该资产未上传文件包");
        }
        try {
            if (asset.getType() == AssetType.AGENT_SKILL) {
                return getSkillFileContent(nacos, path);
            } else if (asset.getType() == AssetType.WORKER) {
                return getWorkerFileContent(nacos, path);
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Failed to fetch file content for asset {} path {}", assetId, path, e);
        }
        throw new BusinessException(ErrorCode.NOT_FOUND, "文件", path);
    }

    private NacosInfo extractNacosInfo(DeveloperAsset asset) {
        if (asset.getType() != AssetType.AGENT_SKILL && asset.getType() != AssetType.WORKER) {
            return null;
        }
        DeveloperAssetConfig config = asset.getConfig();
        NacosInfo nacos = null;
        if (config instanceof SkillAssetConfig sc) {
            nacos = sc.getNacos();
        } else if (config instanceof WorkerAssetConfig wc) {
            nacos = wc.getNacos();
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

    private FileContentResult getSkillFileContent(NacosInfo nacos, String path) {
        String version = resolveLatestSkillVersion(nacos);
        Skill skill =
                skillService.getSkillDetail(
                        nacos.getNacosId(), nacos.getNamespace(), nacos.getSkillName(), version);
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
                String resourcePath =
                        resource.getType() != null && !resource.getType().isEmpty()
                                ? resource.getType() + "/" + resource.getName()
                                : resource.getName();
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
        List<FileTreeNode> rootChildren = new ArrayList<>();
        Map<String, FileTreeNode> dirMap = new LinkedHashMap<>();
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
                    if (!dirPath.isEmpty()) dirPath.append("/");
                    dirPath.append(parts[i]);
                    final String dirName = parts[i];
                    final String dirFullPath = dirPath.toString();
                    final List<FileTreeNode> parentChildren = currentChildren;
                    FileTreeNode dirNode =
                            dirMap.computeIfAbsent(
                                    dirFullPath,
                                    k -> {
                                        FileTreeNode d = new FileTreeNode();
                                        d.setName(dirName);
                                        d.setPath(dirFullPath);
                                        d.setType("directory");
                                        d.setChildren(new ArrayList<>());
                                        parentChildren.add(d);
                                        return d;
                                    });
                    currentChildren = dirNode.getChildren();
                }
                String content = StrUtil.nullToDefault(resource.getContent(), "");
                Map<String, Object> meta = resource.getMetadata();
                String encoding =
                        meta != null && meta.containsKey("encoding")
                                ? String.valueOf(meta.get("encoding"))
                                : "text";
                FileTreeNode fileNode = new FileTreeNode();
                fileNode.setName(parts[parts.length - 1]);
                fileNode.setPath(resourcePath);
                fileNode.setType("file");
                fileNode.setEncoding(encoding);
                fileNode.setSize(content.getBytes(StandardCharsets.UTF_8).length);
                currentChildren.add(fileNode);
            }
        }
        return rootChildren;
    }
}
