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

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.bean.copier.CopyOptions;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.alibaba.himarket.core.constant.Resources;
import com.alibaba.himarket.core.exception.BusinessException;
import com.alibaba.himarket.core.exception.ErrorCode;
import com.alibaba.himarket.core.security.ContextHolder;
import com.alibaba.himarket.core.utils.IdGenerator;
import com.alibaba.himarket.dto.params.consumer.CreateSubscriptionParam;
import com.alibaba.himarket.dto.params.mcp.RegisterMcpParam;
import com.alibaba.himarket.dto.params.mcp.SaveMcpEndpointParam;
import com.alibaba.himarket.dto.params.mcp.SaveMcpMetaParam;
import com.alibaba.himarket.dto.params.mcp.SubscribeMcpParam;
import com.alibaba.himarket.dto.result.common.PageResult;
import com.alibaba.himarket.dto.result.consumer.ConsumerResult;
import com.alibaba.himarket.dto.result.consumer.CredentialContext;
import com.alibaba.himarket.dto.result.mcp.McpEndpointResult;
import com.alibaba.himarket.dto.result.mcp.McpMetaResult;
import com.alibaba.himarket.dto.result.mcp.MyEndpointResult;
import com.alibaba.himarket.entity.McpServerEndpoint;
import com.alibaba.himarket.entity.McpServerMeta;
import com.alibaba.himarket.entity.ProductRef;
import com.alibaba.himarket.entity.ProductSubscription;
import com.alibaba.himarket.repository.McpServerEndpointRepository;
import com.alibaba.himarket.repository.McpServerMetaRepository;
import com.alibaba.himarket.repository.ProductRefRepository;
import com.alibaba.himarket.repository.ProductRepository;
import com.alibaba.himarket.repository.SubscriptionRepository;
import com.alibaba.himarket.service.ConsumerService;
import com.alibaba.himarket.service.GatewayService;
import com.alibaba.himarket.service.McpSandboxDeployService;
import com.alibaba.himarket.service.McpServerService;
import com.alibaba.himarket.service.NacosService;
import com.alibaba.himarket.service.SandboxService;
import com.alibaba.himarket.support.chat.mcp.MCPTransportConfig;
import com.alibaba.himarket.support.consumer.ConsumerAuthConfig;
import com.alibaba.himarket.support.consumer.McpAuthConfig;
import com.alibaba.himarket.support.enums.MCPTransportMode;
import com.alibaba.himarket.support.enums.ProductStatus;
import com.alibaba.himarket.support.enums.SourceType;
import com.alibaba.himarket.support.enums.SubscriptionStatus;
import com.alibaba.himarket.support.product.NacosRefConfig;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
@Slf4j
public class McpServerServiceImpl implements McpServerService {

    private final McpServerMetaRepository metaRepository;
    private final McpServerEndpointRepository endpointRepository;
    private final ProductRefRepository productRefRepository;
    private final ProductRepository productRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final ContextHolder contextHolder;
    private final ConsumerService consumerService;
    private final GatewayService gatewayService;
    private final NacosService nacosService;
    private final SandboxService sandboxService;
    private final McpSandboxDeployService mcpSandboxDeployService;
    private final PlatformTransactionManager transactionManager;

    @Override
    @Transactional
    public McpMetaResult saveMeta(SaveMcpMetaParam param) {
        // 自动推断 sandboxRequired：
        // 1. stdio 协议强制需要沙箱托管
        // 2. 网关/Nacos 导入默认不需要
        // 3. 其他类型默认需要
        String protocol = StrUtil.blankToDefault(param.getProtocolType(), "");
        if (protocol.toLowerCase().contains("stdio")) {
            param.setSandboxRequired(true);
        } else if (param.getSandboxRequired() == null) {
            String paramOrigin = StrUtil.blankToDefault(param.getOrigin(), "ADMIN");
            param.setSandboxRequired(
                    !"GATEWAY".equalsIgnoreCase(paramOrigin)
                            && !"NACOS".equalsIgnoreCase(paramOrigin));
        }

        // 查找是否已存在同 productId + mcpName 的记录
        McpServerMeta meta =
                metaRepository
                        .findByProductIdAndMcpName(param.getProductId(), param.getMcpName())
                        .orElse(null);

        if (meta == null) {
            // 新建
            meta =
                    McpServerMeta.builder()
                            .mcpServerId(IdGenerator.genMcpServerId())
                            .productId(param.getProductId())
                            .mcpName(param.getMcpName())
                            .displayName(param.getDisplayName())
                            .description(param.getDescription())
                            .repoUrl(param.getRepoUrl())
                            .sourceType(param.getSourceType())
                            .origin(StrUtil.blankToDefault(param.getOrigin(), "ADMIN"))
                            .tags(param.getTags())
                            .icon(param.getIcon())
                            .protocolType(param.getProtocolType())
                            .connectionConfig(param.getConnectionConfig())
                            .extraParams(param.getExtraParams())
                            .serviceIntro(param.getServiceIntro())
                            .visibility(StrUtil.blankToDefault(param.getVisibility(), "PUBLIC"))
                            .publishStatus(
                                    StrUtil.blankToDefault(param.getPublishStatus(), "DRAFT"))
                            .toolsConfig(param.getToolsConfig())
                            .sandboxRequired(param.getSandboxRequired())
                            .createdBy(
                                    StrUtil.blankToDefault(
                                            param.getCreatedBy(), getCreatedByOrDefault()))
                            .build();
        } else {
            // 更新：只覆盖非 null 字段
            BeanUtil.copyProperties(
                    param,
                    meta,
                    CopyOptions.create()
                            .ignoreNullValue()
                            .setIgnoreProperties("productId", "mcpName"));
        }

        metaRepository.save(meta);

        // 同步创建/更新 ProductRef，使 MCP 配置在产品关联中可见
        syncProductRef(meta, param);

        return new McpMetaResult().convertFrom(meta);
    }

    @Override
    @Transactional
    public McpMetaResult registerMcp(RegisterMcpParam param) {
        // 0. 非 stdio 协议校验：connectionConfig 必须包含可提取的连接地址
        String protocol = param.getProtocolType();
        if (!"stdio".equalsIgnoreCase(protocol)) {
            String connCfg = param.getConnectionConfig();
            if (StrUtil.isBlank(connCfg)) {
                throw new BusinessException(
                        ErrorCode.INVALID_REQUEST, "非 stdio 协议必须提供 connectionConfig（包含连接地址）");
            }
            try {
                cn.hutool.json.JSONObject connJson = JSONUtil.parseObj(connCfg);
                String url = extractEndpointUrl(connJson, param.getMcpName(), protocol);
                if (StrUtil.isBlank(url)) {
                    throw new BusinessException(
                            ErrorCode.INVALID_REQUEST, "connectionConfig 中未找到有效的连接地址（url）");
                }
            } catch (BusinessException e) {
                throw e;
            } catch (Exception e) {
                throw new BusinessException(
                        ErrorCode.INVALID_REQUEST,
                        "connectionConfig 格式错误或缺少连接地址: " + e.getMessage());
            }
        }

        // 1. 自动创建 Product（以 mcpName 为名称）
        String productId = IdGenerator.genApiProductId();
        com.alibaba.himarket.entity.Product product =
                com.alibaba.himarket.entity.Product.builder()
                        .productId(productId)
                        .name(param.getMcpName())
                        .type(com.alibaba.himarket.support.enums.ProductType.MCP_SERVER)
                        .description(param.getDescription())
                        .status(ProductStatus.PENDING)
                        .enableConsumerAuth(false)
                        .autoApprove(true)
                        .build();

        // 解析 icon JSON
        if (StrUtil.isNotBlank(param.getIcon())) {
            try {
                product.setIcon(
                        JSONUtil.toBean(
                                param.getIcon(), com.alibaba.himarket.support.product.Icon.class));
            } catch (Exception e) {
                log.warn("解析 icon JSON 失败: {}", e.getMessage());
            }
        }

        productRepository.save(product);

        // 2. 构建 SaveMcpMetaParam 并调用 saveMeta
        SaveMcpMetaParam metaParam = new SaveMcpMetaParam();
        metaParam.setProductId(productId);
        metaParam.setMcpName(param.getMcpName());
        metaParam.setDisplayName(param.getDisplayName());
        metaParam.setDescription(param.getDescription());
        metaParam.setRepoUrl(param.getRepoUrl());
        metaParam.setSourceType("config");
        metaParam.setOrigin(StrUtil.blankToDefault(param.getOrigin(), "OPEN_API"));
        metaParam.setTags(param.getTags());
        metaParam.setIcon(param.getIcon());
        metaParam.setProtocolType(param.getProtocolType());
        metaParam.setConnectionConfig(param.getConnectionConfig());
        metaParam.setExtraParams(param.getExtraParams());
        metaParam.setServiceIntro(param.getServiceIntro());
        metaParam.setVisibility(StrUtil.blankToDefault(param.getVisibility(), "PUBLIC"));
        metaParam.setPublishStatus(StrUtil.blankToDefault(param.getPublishStatus(), "PENDING"));
        metaParam.setToolsConfig(param.getToolsConfig());
        metaParam.setCreatedBy(param.getCreatedBy());
        metaParam.setSandboxRequired(param.getSandboxRequired());

        return saveMeta(metaParam);
    }

    @Override
    public McpMetaResult getMeta(String mcpServerId) {
        McpServerMeta meta = findMeta(mcpServerId);
        return new McpMetaResult().convertFrom(meta);
    }

    @Override
    public McpMetaResult getMetaByName(String mcpName) {
        McpServerMeta meta =
                metaRepository
                        .findByMcpName(mcpName)
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                ErrorCode.NOT_FOUND,
                                                Resources.MCP_SERVER_META,
                                                mcpName));
        return new McpMetaResult().convertFrom(meta);
    }

    @Override
    public PageResult<McpMetaResult> listMetaByOrigin(String origin, Pageable pageable) {
        Page<McpServerMeta> page = metaRepository.findByOrigin(origin, pageable);
        return new PageResult<McpMetaResult>()
                .convertFrom(page, m -> new McpMetaResult().convertFrom(m));
    }

    @Override
    public PageResult<McpMetaResult> listAllMeta(Pageable pageable) {
        Page<McpServerMeta> page = metaRepository.findAll(pageable);
        return new PageResult<McpMetaResult>()
                .convertFrom(page, m -> new McpMetaResult().convertFrom(m));
    }

    @Override
    public List<McpMetaResult> listMetaByProduct(String productId) {
        return metaRepository.findByProductId(productId).stream()
                .map(m -> new McpMetaResult().convertFrom(m))
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public void deleteMeta(String mcpServerId) {
        McpServerMeta meta = findMeta(mcpServerId);
        String productId = meta.getProductId();
        // 级联删除所有 endpoint
        endpointRepository.deleteByMcpServerId(mcpServerId);
        metaRepository.delete(meta);

        // 如果该产品下没有其他 MCP meta 了，删除 ProductRef 并重置产品状态
        List<McpServerMeta> remaining = metaRepository.findByProductId(productId);
        if (remaining.isEmpty()) {
            productRefRepository.deleteByProductId(productId);
            productRepository
                    .findByProductId(productId)
                    .ifPresent(
                            product -> {
                                product.setStatus(ProductStatus.PENDING);
                                productRepository.save(product);
                            });
        }
    }

    @Override
    @Transactional
    public void deleteMetaByProduct(String productId) {
        List<McpServerMeta> metas = metaRepository.findByProductId(productId);
        if (metas.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "该产品下没有 MCP 配置");
        }

        // 级联删除所有 endpoint 和 meta
        for (McpServerMeta meta : metas) {
            endpointRepository.deleteByMcpServerId(meta.getMcpServerId());
            metaRepository.delete(meta);
        }

        // 删除 ProductRef
        productRefRepository.deleteByProductId(productId);

        // 重置产品状态
        productRepository
                .findByProductId(productId)
                .ifPresent(
                        product -> {
                            product.setStatus(ProductStatus.PENDING);
                            productRepository.save(product);
                        });
    }

    @Override
    @Transactional
    public McpEndpointResult saveEndpoint(SaveMcpEndpointParam param) {
        // 校验 mcpServerId 存在
        McpServerMeta meta = findMeta(param.getMcpServerId());

        McpServerEndpoint endpoint =
                McpServerEndpoint.builder()
                        .endpointId(IdGenerator.genEndpointId())
                        .mcpServerId(param.getMcpServerId())
                        .mcpName(meta.getMcpName())
                        .endpointUrl(param.getEndpointUrl())
                        .hostingType(param.getHostingType())
                        .protocol(param.getProtocol())
                        .userId(StrUtil.blankToDefault(param.getUserId(), "*"))
                        .hostingInstanceId(param.getHostingInstanceId())
                        .hostingIdentifier(param.getHostingIdentifier())
                        .status("ACTIVE")
                        .build();

        endpointRepository.save(endpoint);
        return new McpEndpointResult().convertFrom(endpoint);
    }

    @Override
    public List<McpEndpointResult> listEndpoints(String mcpServerId) {
        return endpointRepository.findByMcpServerId(mcpServerId).stream()
                .map(e -> new McpEndpointResult().convertFrom(e))
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public void deleteEndpoint(String endpointId) {
        McpServerEndpoint endpoint =
                endpointRepository
                        .findByEndpointId(endpointId)
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                ErrorCode.NOT_FOUND,
                                                Resources.MCP_SERVER_ENDPOINT,
                                                endpointId));
        endpointRepository.delete(endpoint);
    }

    @Override
    public PageResult<McpMetaResult> listPublishedMcpServers(Pageable pageable) {
        Page<McpServerMeta> page =
                metaRepository.findByPublishStatusAndVisibility("PUBLISHED", "PUBLIC", pageable);
        return new PageResult<McpMetaResult>()
                .convertFrom(page, m -> new McpMetaResult().convertFrom(m));
    }

    @Override
    @Transactional
    public MyEndpointResult subscribe(String productId, SubscribeMcpParam param) {
        List<McpServerMeta> metas = metaRepository.findByProductId(productId);
        if (metas.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, Resources.MCP_SERVER_META, productId);
        }
        McpServerMeta meta = metas.get(0);
        String userId = contextHolder.getUser();
        String origin = meta.getOrigin();
        String protocol = meta.getProtocolType();

        // 判断是否为沙箱订阅（Remote 场景）
        boolean isSandbox = param != null && StrUtil.isNotBlank(param.getSandboxId());

        // 确定 hostingInstanceId（用于 upsert 去重）
        String hostingInstanceId = isSandbox ? param.getSandboxId() : "subscribe";

        // 检查是否已订阅：沙箱场景先删旧 CRD 再重建，直连场景不允许重复
        // 沙箱修改时可能换了沙箱，所以按 mcpServerId + userId 查所有 SANDBOX endpoint
        if (isSandbox) {
            List<McpServerEndpoint> existingEndpoints =
                    endpointRepository.findByMcpServerIdAndUserIdInAndStatus(
                            meta.getMcpServerId(), List.of(userId), "ACTIVE");
            for (McpServerEndpoint existing : existingEndpoints) {
                if ("SANDBOX".equalsIgnoreCase(existing.getHostingType())
                        && StrUtil.isNotBlank(existing.getHostingInstanceId())) {
                    try {
                        mcpSandboxDeployService.undeploy(
                                existing.getHostingInstanceId(), existing.getMcpName(), userId);
                        log.info(
                                "修改订阅：已删除旧 ToolServer CRD, sandboxId={}, mcpName={}",
                                existing.getHostingInstanceId(),
                                existing.getMcpName());
                    } catch (Exception e) {
                        log.warn("删除旧 ToolServer CRD 失败（继续重建）: {}", e.getMessage());
                    }
                }
                // 删除旧 endpoint 记录，后面 upsert 会创建新的
                endpointRepository.delete(existing);
            }
        } else {
            endpointRepository
                    .findByMcpServerIdAndUserIdAndHostingInstanceId(
                            meta.getMcpServerId(), userId, hostingInstanceId)
                    .ifPresent(
                            existing -> {
                                throw new BusinessException(ErrorCode.INVALID_REQUEST, "已订阅该 MCP");
                            });
        }

        // 网关来源：同步 consumer（挂起外层事务，避免内部异常标记 rollback-only）
        ProductRef productRef = productRefRepository.findByProductId(productId).orElse(null);
        if ("GATEWAY".equalsIgnoreCase(origin)
                && productRef != null
                && productRef.getSourceType() == SourceType.GATEWAY) {
            TransactionTemplate gatewayTx = new TransactionTemplate(transactionManager);
            gatewayTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_NOT_SUPPORTED);
            try {
                gatewayTx.executeWithoutResult(
                        status -> {
                            ConsumerResult primaryConsumer = consumerService.getPrimaryConsumer();
                            CreateSubscriptionParam subParam = new CreateSubscriptionParam();
                            subParam.setProductId(productId);
                            consumerService.subscribeProduct(
                                    primaryConsumer.getConsumerId(), subParam);
                            log.info(
                                    "网关 consumer 同步成功: productId={}, consumerId={}",
                                    productId,
                                    primaryConsumer.getConsumerId());
                        });
            } catch (Exception e) {
                // 网关同步失败不影响 MCP 订阅主流程
                log.info("网关 consumer 同步跳过: productId={}, reason={}", productId, e.getMessage());
            }
        }

        String endpointUrl;
        String hostingType;
        String subscribeParams = null;
        String hostingIdentifier = null;

        if (isSandbox) {
            // ===== 沙箱订阅：向沙箱集群下发 CRD 获取 endpoint =====
            var sandbox = sandboxService.getSandbox(param.getSandboxId());
            String transportType = param.getTransportType();

            // 获取用户的 API Key（default consumer credential）
            String apiKey = "";
            try {
                var credential = consumerService.getDefaultCredential(userId);
                if (credential != null && StrUtil.isNotBlank(credential.getApiKey())) {
                    apiKey = credential.getApiKey();
                }
            } catch (Exception e) {
                log.warn("获取用户 credential 失败，API Key 为空: {}", e.getMessage());
            }

            // 调用沙箱部署服务下发 CRD
            String authType = StrUtil.blankToDefault(param.getAuthType(), "none");
            endpointUrl =
                    mcpSandboxDeployService.deploy(
                            param.getSandboxId(),
                            meta.getMcpServerId(),
                            meta.getMcpName(),
                            userId,
                            transportType,
                            meta.getConnectionConfig(),
                            apiKey,
                            authType,
                            param.getParams(),
                            meta.getExtraParams());

            protocol = transportType;
            hostingType = "SANDBOX";
            hostingIdentifier = sandbox.getSandboxName();

            // 构建订阅参数
            cn.hutool.json.JSONObject subParams =
                    JSONUtil.createObj()
                            .set("sandboxId", param.getSandboxId())
                            .set("transportType", transportType)
                            .set("authType", authType);
            if (StrUtil.isNotBlank(param.getParams())) {
                subParams.set("extraParams", JSONUtil.parse(param.getParams()));
            }
            subscribeParams = subParams.toString();
        } else if ("stdio".equalsIgnoreCase(protocol)) {
            // ===== stdio 类型：占位，实际使用需通过沙箱 =====
            endpointUrl = "";
            hostingType = "SUBSCRIBE";
        } else {
            // ===== SSE/HTTP 直连 =====
            String connectionConfig = meta.getConnectionConfig();
            if (StrUtil.isNotBlank(connectionConfig)) {
                try {
                    cn.hutool.json.JSONObject connJson = JSONUtil.parseObj(connectionConfig);
                    endpointUrl = extractEndpointUrl(connJson, meta.getMcpName(), protocol);
                } catch (Exception e) {
                    endpointUrl = "";
                    log.warn("提取 endpoint URL 失败: {}", e.getMessage());
                }
            } else {
                endpointUrl = "";
            }
            hostingType =
                    "GATEWAY".equalsIgnoreCase(origin)
                            ? "GATEWAY"
                            : "NACOS".equalsIgnoreCase(origin) ? "NACOS" : "DIRECT";
        }

        // 保存到热数据表
        McpServerEndpoint endpoint =
                upsertEndpoint(
                        meta.getMcpServerId(),
                        meta.getMcpName(),
                        endpointUrl,
                        hostingType,
                        protocol,
                        userId,
                        hostingInstanceId,
                        hostingIdentifier,
                        subscribeParams);

        // 同步写入 product_subscription 表，使 Chat 页面的订阅状态一致
        syncProductSubscription(productId, userId, param);

        return buildMyEndpointResult(endpoint, meta);
    }

    @Override
    @Transactional
    public void unsubscribe(String endpointId) {
        McpServerEndpoint endpoint =
                endpointRepository
                        .findByEndpointId(endpointId)
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                ErrorCode.NOT_FOUND,
                                                Resources.MCP_SERVER_ENDPOINT,
                                                endpointId));
        String userId = contextHolder.getUser();
        if (!"*".equals(endpoint.getUserId()) && !userId.equals(endpoint.getUserId())) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "无权取消订阅");
        }

        McpServerMeta meta =
                metaRepository.findByMcpServerId(endpoint.getMcpServerId()).orElse(null);

        // 如果是沙箱部署的，删除 ToolServer CRD
        if ("SANDBOX".equalsIgnoreCase(endpoint.getHostingType())
                && StrUtil.isNotBlank(endpoint.getHostingInstanceId())) {
            try {
                mcpSandboxDeployService.undeploy(
                        endpoint.getHostingInstanceId(), endpoint.getMcpName(), userId);
            } catch (Exception e) {
                log.warn("删除 ToolServer CRD 失败（不影响取消订阅）: {}", e.getMessage());
            }
        }

        // 如果是网关来源，需要撤销 consumer 授权
        if (meta != null && "GATEWAY".equalsIgnoreCase(meta.getOrigin())) {
            try {
                ConsumerResult primaryConsumer = consumerService.getPrimaryConsumer();
                consumerService.unsubscribeProduct(
                        primaryConsumer.getConsumerId(), meta.getProductId());
                log.info(
                        "网关 consumer 取消订阅成功: productId={}, consumerId={}",
                        meta.getProductId(),
                        primaryConsumer.getConsumerId());
            } catch (Exception e) {
                log.warn("撤销网关 consumer 授权失败（不影响取消订阅）: {}", e.getMessage());
            }
        }

        endpointRepository.delete(endpoint);

        // 同步删除 product_subscription（仅当该产品下没有其他 endpoint 时）
        if (meta != null) {
            String productId = meta.getProductId();
            List<McpServerEndpoint> remaining =
                    endpointRepository.findByMcpServerIdAndUserIdInAndStatus(
                            meta.getMcpServerId(), List.of(userId, "*"), "ACTIVE");
            if (remaining.isEmpty()) {
                try {
                    ConsumerResult primaryConsumer = consumerService.getPrimaryConsumer();
                    subscriptionRepository.deleteByConsumerIdAndProductId(
                            primaryConsumer.getConsumerId(), productId);
                    log.info("同步删除 product_subscription: productId={}", productId);
                } catch (Exception e) {
                    log.warn("删除 product_subscription 失败（不影响取消订阅）: {}", e.getMessage());
                }
            }
        }
    }

    @Override
    public List<MyEndpointResult> listMyEndpoints() {
        String userId = contextHolder.getUser();
        List<McpServerEndpoint> endpoints = endpointRepository.findByUserIdIn(List.of(userId, "*"));

        List<String> mcpServerIds =
                endpoints.stream()
                        .map(McpServerEndpoint::getMcpServerId)
                        .distinct()
                        .collect(Collectors.toList());

        Map<String, McpServerMeta> metaMap =
                mcpServerIds.stream()
                        .map(id -> metaRepository.findByMcpServerId(id).orElse(null))
                        .filter(m -> m != null)
                        .collect(Collectors.toMap(McpServerMeta::getMcpServerId, m -> m));

        return endpoints.stream()
                .map(
                        ep -> {
                            McpServerMeta meta = metaMap.get(ep.getMcpServerId());
                            return MyEndpointResult.builder()
                                    .endpointId(ep.getEndpointId())
                                    .mcpServerId(ep.getMcpServerId())
                                    .endpointUrl(ep.getEndpointUrl())
                                    .hostingType(ep.getHostingType())
                                    .protocol(ep.getProtocol())
                                    .hostingInstanceId(ep.getHostingInstanceId())
                                    .subscribeParams(ep.getSubscribeParams())
                                    .status(ep.getStatus())
                                    .endpointCreatedAt(ep.getCreateAt())
                                    .productId(meta != null ? meta.getProductId() : null)
                                    .displayName(
                                            meta != null ? meta.getDisplayName() : ep.getMcpName())
                                    .mcpName(ep.getMcpName())
                                    .description(meta != null ? meta.getDescription() : null)
                                    .icon(meta != null ? meta.getIcon() : null)
                                    .tags(meta != null ? meta.getTags() : null)
                                    .protocolType(meta != null ? meta.getProtocolType() : null)
                                    .origin(meta != null ? meta.getOrigin() : null)
                                    .toolsConfig(meta != null ? meta.getToolsConfig() : null)
                                    .build();
                        })
                .collect(Collectors.toList());
    }

    // ==================== 解析 MCP 传输配置 ====================

    @Override
    public List<MCPTransportConfig> resolveTransportConfigs(
            List<String> productIds, String userId) {
        List<MCPTransportConfig> configs = new ArrayList<>();

        for (String productId : productIds) {
            List<McpServerMeta> metas = metaRepository.findByProductId(productId);
            if (metas.isEmpty()) {
                log.warn("[resolveTransportConfigs] 产品 {} 无 MCP meta，跳过", productId);
                continue;
            }

            McpServerMeta meta = metas.get(0);

            // 查找用户的 ACTIVE endpoint（包括 userId=* 的公共 endpoint）
            List<McpServerEndpoint> endpoints =
                    endpointRepository.findByMcpServerIdAndUserIdInAndStatus(
                            meta.getMcpServerId(), List.of(userId, "*"), "ACTIVE");

            if (endpoints.isEmpty()) {
                log.debug(
                        "[resolveTransportConfigs] 产品 {} 用户 {} 无订阅 endpoint，跳过", productId, userId);
                continue;
            }

            // 优先取用户自己的 endpoint，其次取公共的
            McpServerEndpoint endpoint =
                    endpoints.stream()
                            .filter(ep -> userId.equals(ep.getUserId()))
                            .findFirst()
                            .orElse(endpoints.get(0));

            if (StrUtil.isBlank(endpoint.getEndpointUrl())) {
                log.debug(
                        "[resolveTransportConfigs] endpoint {} URL 为空，跳过",
                        endpoint.getEndpointId());
                continue;
            }

            // 根据 protocol 确定 transportMode
            String protocol =
                    StrUtil.blankToDefault(endpoint.getProtocol(), meta.getProtocolType());
            MCPTransportMode transportMode =
                    ("HTTP".equalsIgnoreCase(protocol)
                                    || "StreamableHTTP".equalsIgnoreCase(protocol))
                            ? MCPTransportMode.STREAMABLE_HTTP
                            : MCPTransportMode.SSE;

            String url = endpoint.getEndpointUrl();
            if (transportMode == MCPTransportMode.SSE && !url.endsWith("/sse")) {
                url = url.endsWith("/") ? url + "sse" : url + "/sse";
            }

            configs.add(
                    MCPTransportConfig.builder()
                            .mcpServerName(endpoint.getMcpName())
                            .transportMode(transportMode)
                            .url(url)
                            .headers(resolveAuthHeaders(endpoint, meta, userId))
                            .build());
        }

        return configs;
    }

    // ==================== 私有方法 ====================

    /**
     * 同步写入 product_subscription 表。
     * 直接设为 APPROVED 状态；如果开了鉴权则保存 primary consumer 的 credential 信息。
     */
    private void syncProductSubscription(String productId, String userId, SubscribeMcpParam param) {
        TransactionTemplate txTemplate = new TransactionTemplate(transactionManager);
        txTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        try {
            txTemplate.executeWithoutResult(
                    status -> {
                        ConsumerResult primaryConsumer = consumerService.getPrimaryConsumer();
                        String consumerId = primaryConsumer.getConsumerId();

                        // 已存在则跳过
                        if (subscriptionRepository
                                .findByConsumerIdAndProductId(consumerId, productId)
                                .isPresent()) {
                            log.debug(
                                    "product_subscription 已存在，跳过: productId={}, consumerId={}",
                                    productId,
                                    consumerId);
                            return;
                        }

                        // 构建 consumerAuthConfig
                        ConsumerAuthConfig authConfig = null;
                        if (param != null && "bearer".equalsIgnoreCase(param.getAuthType())) {
                            authConfig =
                                    ConsumerAuthConfig.builder()
                                            .mcpAuthConfig(buildMcpAuthConfig(consumerId))
                                            .build();
                        }

                        ProductSubscription subscription =
                                ProductSubscription.builder()
                                        .subscriptionId(IdGenerator.genSubscriptionId())
                                        .productId(productId)
                                        .consumerId(consumerId)
                                        .status(SubscriptionStatus.APPROVED)
                                        .consumerAuthConfig(authConfig)
                                        .build();

                        subscriptionRepository.save(subscription);
                        log.info(
                                "同步写入 product_subscription: productId={}, consumerId={}",
                                productId,
                                consumerId);
                    });
        } catch (Exception e) {
            log.warn("同步 product_subscription 失败（不影响 MCP 订阅）: {}", e.getMessage());
        }
    }

    /**
     * 从 primary consumer 的 credential 构建 McpAuthConfig。
     * 仅支持 ApiKey 类型（source=Default 即 Bearer），其他类型抛异常。
     */
    private McpAuthConfig buildMcpAuthConfig(String consumerId) {
        var credential = consumerService.getCredential(consumerId);
        if (credential == null) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "当前用户未配置 credential，请先在管理端配置");
        }

        var apiKeyConfig = credential.getApiKeyConfig();
        if (apiKeyConfig == null
                || apiKeyConfig.getCredentials() == null
                || apiKeyConfig.getCredentials().isEmpty()) {
            throw new BusinessException(
                    ErrorCode.INVALID_REQUEST, "MCP 鉴权暂仅支持 API Key 方式，请修改 primary consumer 的鉴权配置");
        }

        String source = apiKeyConfig.getSource();
        String headerName = apiKeyConfig.getKey();
        String apiKey = apiKeyConfig.getCredentials().get(0).getApiKey();

        return McpAuthConfig.builder()
                .authType("bearer")
                .source(source)
                .headerName(headerName)
                .apiKey(apiKey)
                .consumerId(consumerId)
                .build();
    }

    private MyEndpointResult buildMyEndpointResult(McpServerEndpoint endpoint, McpServerMeta meta) {
        return MyEndpointResult.builder()
                .endpointId(endpoint.getEndpointId())
                .mcpServerId(endpoint.getMcpServerId())
                .endpointUrl(endpoint.getEndpointUrl())
                .hostingType(endpoint.getHostingType())
                .protocol(endpoint.getProtocol())
                .hostingInstanceId(endpoint.getHostingInstanceId())
                .subscribeParams(endpoint.getSubscribeParams())
                .status(endpoint.getStatus())
                .endpointCreatedAt(endpoint.getCreateAt())
                .productId(meta.getProductId())
                .displayName(meta.getDisplayName())
                .mcpName(meta.getMcpName())
                .description(meta.getDescription())
                .icon(meta.getIcon())
                .tags(meta.getTags())
                .protocolType(meta.getProtocolType())
                .origin(meta.getOrigin())
                .toolsConfig(meta.getToolsConfig())
                .build();
    }

    private McpServerMeta findMeta(String mcpServerId) {
        return metaRepository
                .findByMcpServerId(mcpServerId)
                .orElseThrow(
                        () ->
                                new BusinessException(
                                        ErrorCode.NOT_FOUND,
                                        Resources.MCP_SERVER_META,
                                        mcpServerId));
    }

    /**
     * 根据 endpoint 来源解析 auth headers。
     * 网关/Nacos 来源：使用用户的 consumer credential（API Key）。
     * 沙箱来源：沙箱代理层处理鉴权，不需要额外 headers。
     */
    private Map<String, String> resolveAuthHeaders(
            McpServerEndpoint endpoint, McpServerMeta meta, String userId) {
        String hostingType = endpoint.getHostingType();
        if ("GATEWAY".equalsIgnoreCase(hostingType) || "NACOS".equalsIgnoreCase(hostingType)) {
            try {
                CredentialContext credential = consumerService.getDefaultCredential(userId);
                Map<String, String> headers = credential.copyHeaders();
                return headers.isEmpty() ? null : headers;
            } catch (Exception e) {
                log.warn("[resolveAuthHeaders] 获取用户 credential 失败: {}", e.getMessage());
            }
        }
        return null;
    }

    /**
     * 将 MCP meta 数据同步到 ProductRef 表，使产品详情页能展示 MCP 配置。
     * 支持三种来源：CUSTOM（自定义）、GATEWAY（网关导入）、NACOS（Nacos导入）。
     * 与 saveMeta 在同一事务中，任一失败则全部回滚。
     */
    private void syncProductRef(McpServerMeta meta, SaveMcpMetaParam param) {
        String productId = meta.getProductId();
        String origin = StrUtil.blankToDefault(param.getOrigin(), "ADMIN");

        // 确定 SourceType
        SourceType refSourceType;
        if ("GATEWAY".equalsIgnoreCase(origin) && StrUtil.isNotBlank(param.getGatewayId())) {
            refSourceType = SourceType.GATEWAY;
        } else if ("NACOS".equalsIgnoreCase(origin) && StrUtil.isNotBlank(param.getNacosId())) {
            refSourceType = SourceType.NACOS;
        } else {
            refSourceType = SourceType.CUSTOM;
        }

        // 获取或构建 mcpConfig JSON
        String mcpConfigStr;
        if (refSourceType == SourceType.GATEWAY) {
            // 从网关拉取完整 MCP 配置，需要将 refConfig 转换为正确的类型
            Object refConfigObj = null;
            if (StrUtil.isNotBlank(param.getRefConfig())) {
                cn.hutool.json.JSONObject refJson = JSONUtil.parseObj(param.getRefConfig());
                String fromGatewayType = refJson.getStr("fromGatewayType");
                if ("HIGRESS".equals(fromGatewayType)) {
                    refConfigObj =
                            JSONUtil.toBean(
                                    param.getRefConfig(),
                                    com.alibaba.himarket.support.product.HigressRefConfig.class);
                } else {
                    refConfigObj =
                            JSONUtil.toBean(
                                    param.getRefConfig(),
                                    com.alibaba.himarket.support.product.APIGRefConfig.class);
                }
            }
            mcpConfigStr = gatewayService.fetchMcpConfig(param.getGatewayId(), refConfigObj);
        } else if (refSourceType == SourceType.NACOS) {
            // 从 Nacos 拉取完整 MCP 配置
            NacosRefConfig nacosRef =
                    StrUtil.isNotBlank(param.getRefConfig())
                            ? JSONUtil.toBean(param.getRefConfig(), NacosRefConfig.class)
                            : null;
            mcpConfigStr = nacosService.fetchMcpConfig(param.getNacosId(), nacosRef);
        } else {
            // 自定义：手动构建 MCPConfigResult 兼容的 JSON
            cn.hutool.json.JSONObject mcpServerConfig = JSONUtil.createObj();
            if (StrUtil.isNotBlank(meta.getConnectionConfig())) {
                mcpServerConfig.set("rawConfig", JSONUtil.parse(meta.getConnectionConfig()));
            }

            cn.hutool.json.JSONObject metaObj = JSONUtil.createObj();
            metaObj.set("source", "CUSTOM");
            metaObj.set("protocol", meta.getProtocolType());

            cn.hutool.json.JSONObject mcpConfigJson = JSONUtil.createObj();
            mcpConfigJson.set("mcpServerName", meta.getMcpName());
            mcpConfigJson.set("mcpServerConfig", mcpServerConfig);
            mcpConfigJson.set("tools", meta.getToolsConfig());
            mcpConfigJson.set("meta", metaObj);

            mcpConfigStr = mcpConfigJson.toString();
        }

        // 网关/Nacos 导入：将拉取到的完整配置回写到 meta，供前端展示连接信息和工具列表
        if (refSourceType != SourceType.CUSTOM && StrUtil.isNotBlank(mcpConfigStr)) {
            try {
                cn.hutool.json.JSONObject mcpJson = JSONUtil.parseObj(mcpConfigStr);
                // 同步协议类型
                String protocol = mcpJson.getByPath("meta.protocol", String.class);
                if (StrUtil.isNotBlank(protocol)) {
                    meta.setProtocolType(protocol);
                }
                // 同步工具配置
                String tools = mcpJson.getStr("tools");
                if (StrUtil.isNotBlank(tools) && StrUtil.isBlank(meta.getToolsConfig())) {
                    meta.setToolsConfig(tools);
                }
                // 将网关 domains 格式转换为标准 mcpServers 格式存入 connectionConfig
                String standardConfig =
                        convertToStandardConnectionConfig(mcpJson, meta.getMcpName(), protocol);
                meta.setConnectionConfig(
                        StrUtil.isNotBlank(standardConfig) ? standardConfig : mcpConfigStr);
            } catch (Exception e) {
                log.warn("解析网关配置失败，保留原始格式: {}", e.getMessage());
                meta.setConnectionConfig(mcpConfigStr);
            }
            metaRepository.save(meta);
        }

        // 创建或更新 ProductRef
        ProductRef ref = productRefRepository.findByProductId(productId).orElse(null);

        if (ref == null) {
            ref =
                    ProductRef.builder()
                            .productId(productId)
                            .sourceType(refSourceType)
                            .mcpConfig(mcpConfigStr)
                            .enabled(true)
                            .build();
        } else {
            ref.setSourceType(refSourceType);
            ref.setMcpConfig(mcpConfigStr);
            ref.setEnabled(true);
        }

        // 设置网关/Nacos 关联信息
        if (refSourceType == SourceType.GATEWAY) {
            ref.setGatewayId(param.getGatewayId());
            // 解析 refConfig 设置到对应字段
            if (StrUtil.isNotBlank(param.getRefConfig())) {
                cn.hutool.json.JSONObject refJson = JSONUtil.parseObj(param.getRefConfig());
                String fromGatewayType = refJson.getStr("fromGatewayType");
                if ("HIGRESS".equals(fromGatewayType)) {
                    ref.setHigressRefConfig(
                            JSONUtil.toBean(
                                    param.getRefConfig(),
                                    com.alibaba.himarket.support.product.HigressRefConfig.class));
                } else if ("ADP_AI_GATEWAY".equals(fromGatewayType)) {
                    ref.setAdpAIGatewayRefConfig(
                            JSONUtil.toBean(
                                    param.getRefConfig(),
                                    com.alibaba.himarket.support.product.APIGRefConfig.class));
                } else if ("APSARA_GATEWAY".equals(fromGatewayType)) {
                    ref.setApsaraGatewayRefConfig(
                            JSONUtil.toBean(
                                    param.getRefConfig(),
                                    com.alibaba.himarket.support.product.APIGRefConfig.class));
                } else {
                    ref.setApigRefConfig(
                            JSONUtil.toBean(
                                    param.getRefConfig(),
                                    com.alibaba.himarket.support.product.APIGRefConfig.class));
                }
            }
        } else if (refSourceType == SourceType.NACOS) {
            ref.setNacosId(param.getNacosId());
            if (StrUtil.isNotBlank(param.getRefConfig())) {
                ref.setNacosRefConfig(JSONUtil.toBean(param.getRefConfig(), NacosRefConfig.class));
            }
        }

        productRefRepository.save(ref);

        // 更新产品状态为 READY（PUBLISHED 和 PENDING 状态不变）
        productRepository
                .findByProductId(productId)
                .ifPresent(
                        product -> {
                            if (product.getStatus() != ProductStatus.PUBLISHED
                                    && product.getStatus() != ProductStatus.PENDING) {
                                product.setStatus(ProductStatus.READY);
                                productRepository.save(product);
                            }
                        });
    }

    /**
     * Upsert endpoint：按 mcpServerId + userId + hostingInstanceId 唯一约束更新或新建。
     */
    private McpServerEndpoint upsertEndpoint(
            String mcpServerId,
            String mcpName,
            String endpointUrl,
            String hostingType,
            String protocol,
            String userId,
            String hostingInstanceId,
            String hostingIdentifier,
            String subscribeParams) {
        McpServerEndpoint endpoint =
                endpointRepository
                        .findByMcpServerIdAndUserIdAndHostingInstanceId(
                                mcpServerId, userId, hostingInstanceId)
                        .orElse(null);

        if (endpoint == null) {
            endpoint =
                    McpServerEndpoint.builder()
                            .endpointId(IdGenerator.genEndpointId())
                            .mcpServerId(mcpServerId)
                            .mcpName(mcpName)
                            .endpointUrl(endpointUrl)
                            .hostingType(hostingType)
                            .protocol(protocol)
                            .userId(userId)
                            .hostingInstanceId(hostingInstanceId)
                            .hostingIdentifier(hostingIdentifier)
                            .subscribeParams(subscribeParams)
                            .status("ACTIVE")
                            .build();
        } else {
            endpoint.setEndpointUrl(endpointUrl);
            endpoint.setProtocol(protocol);
            endpoint.setHostingIdentifier(hostingIdentifier);
            endpoint.setSubscribeParams(subscribeParams);
            endpoint.setStatus("ACTIVE");
        }
        return endpointRepository.save(endpoint);
    }

    /**
     * 将网关/Nacos 返回的原始配置转换为标准 mcpServers 格式。
     * 网关格式：{ mcpServerConfig: { domains: [...], path: "..." }, meta: { protocol: "sse" } }
     * Nacos 格式：{ mcpServerConfig: { rawConfig: {...} } }
     * 转换后：{ "mcpServers": { "name": { "url": "...", "type": "sse" } } }
     *
     * @return 标准格式 JSON 字符串，无法转换时返回 null
     */
    private String convertToStandardConnectionConfig(
            cn.hutool.json.JSONObject mcpJson, String mcpName, String protocol) {
        String serverName =
                StrUtil.blankToDefault(mcpName, "mcp-server")
                        .toLowerCase()
                        .replaceAll("[^a-z0-9-]", "-");

        // Nacos rawConfig：已经是标准格式，直接包装
        cn.hutool.json.JSONObject serverConfig = mcpJson.getJSONObject("mcpServerConfig");
        if (serverConfig != null && serverConfig.get("rawConfig") != null) {
            Object rawConfig = serverConfig.get("rawConfig");
            cn.hutool.json.JSONObject rawJson;
            try {
                rawJson =
                        rawConfig instanceof cn.hutool.json.JSONObject
                                ? (cn.hutool.json.JSONObject) rawConfig
                                : JSONUtil.parseObj(rawConfig.toString());
            } catch (Exception e) {
                return null;
            }
            // rawConfig 本身可能已经是 mcpServers 格式
            if (rawJson.containsKey("mcpServers")) {
                return rawJson.toString();
            }
            // 单 server 格式（有 command 或 url）
            return JSONUtil.createObj()
                    .set("mcpServers", JSONUtil.createObj().set(serverName, rawJson))
                    .toString();
        }

        // 网关 domains 格式：解析 domains 拼接 URL
        if (serverConfig != null && serverConfig.getJSONArray("domains") != null) {
            cn.hutool.json.JSONArray domains = serverConfig.getJSONArray("domains");
            if (domains.isEmpty()) return null;

            // 优先取非 intranet 的 domain
            cn.hutool.json.JSONObject domain = null;
            for (int i = 0; i < domains.size(); i++) {
                cn.hutool.json.JSONObject d = domains.getJSONObject(i);
                if (!"intranet".equalsIgnoreCase(d.getStr("networkType"))) {
                    domain = d;
                    break;
                }
            }
            if (domain == null) domain = domains.getJSONObject(0);

            String scheme = StrUtil.blankToDefault(domain.getStr("protocol"), "https");
            String host = domain.getStr("domain");
            Integer port = domain.getInt("port");
            String path = serverConfig.getStr("path", "");

            if (StrUtil.isBlank(host)) return null;

            StringBuilder urlBuilder = new StringBuilder(scheme).append("://").append(host);
            if (port != null && port > 0 && port != 443 && port != 80) {
                urlBuilder.append(":").append(port);
            }
            if (StrUtil.isNotBlank(path)) {
                if (!path.startsWith("/")) urlBuilder.append("/");
                urlBuilder.append(path);
            }

            String url = urlBuilder.toString();
            boolean isSse = "sse".equalsIgnoreCase(protocol);
            if (isSse && !url.endsWith("/sse")) {
                url = url.endsWith("/") ? url + "sse" : url + "/sse";
            }

            cn.hutool.json.JSONObject serverEntry = JSONUtil.createObj().set("url", url);
            if (isSse) serverEntry.set("type", "sse");

            return JSONUtil.createObj()
                    .set("mcpServers", JSONUtil.createObj().set(serverName, serverEntry))
                    .toString();
        }

        return null;
    }

    /**
     * 获取 createdBy：优先从 SecurityContext 取当前用户，无登录态时返回 "open-api"。
     */
    private String getCreatedByOrDefault() {
        try {
            return contextHolder.getUser();
        } catch (Exception e) {
            return "open-api";
        }
    }

    /**
     * 从 connectionConfig JSON 中提取 endpoint URL。
     * 支持多种格式：直接 url 字段、mcpServers 格式、domains 格式。
     */
    private String extractEndpointUrl(
            cn.hutool.json.JSONObject connJson, String mcpName, String protocolType) {
        // 格式1: { "url": "..." }
        String url = connJson.getStr("url");
        if (StrUtil.isNotBlank(url)) return url;

        // 格式2: { "mcpServers": { "name": { "url": "..." } } }
        cn.hutool.json.JSONObject mcpServers = connJson.getJSONObject("mcpServers");
        if (mcpServers != null) {
            for (String key : mcpServers.keySet()) {
                cn.hutool.json.JSONObject server = mcpServers.getJSONObject(key);
                if (server != null && StrUtil.isNotBlank(server.getStr("url"))) {
                    return server.getStr("url");
                }
            }
        }

        // 格式3: { "mcpServerConfig": { "domains": [...] } }
        cn.hutool.json.JSONObject serverConfig = connJson.getJSONObject("mcpServerConfig");
        if (serverConfig != null) {
            cn.hutool.json.JSONArray domains = serverConfig.getJSONArray("domains");
            if (domains != null && !domains.isEmpty()) {
                cn.hutool.json.JSONObject domain = domains.getJSONObject(0);
                String protocol = domain.getStr("protocol", "https");
                String domainName = domain.getStr("domain");
                Integer port = domain.getInt("port");
                String path = serverConfig.getStr("path", "");
                String portStr = (port != null && port != 443 && port != 80) ? ":" + port : "";
                return protocol + "://" + domainName + portStr + path;
            }
        }

        throw new BusinessException(ErrorCode.INVALID_REQUEST, "无法从连接配置中提取 endpoint URL");
    }
}
