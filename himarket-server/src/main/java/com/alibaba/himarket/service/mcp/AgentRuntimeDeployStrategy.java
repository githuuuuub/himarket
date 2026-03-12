package com.alibaba.himarket.service.mcp;

import cn.hutool.core.util.StrUtil;
import com.alibaba.himarket.core.exception.BusinessException;
import com.alibaba.himarket.core.exception.ErrorCode;
import com.alibaba.himarket.core.utils.K8sClientUtils;
import com.alibaba.himarket.entity.SandboxInstance;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.fabric8.kubernetes.api.model.GenericKubernetesResource;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.dsl.base.CustomResourceDefinitionContext;
import io.fabric8.kubernetes.client.utils.Serialization;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;

/**
 * AGENT_RUNTIME 类型沙箱部署策略。
 *
 * <p>从 classpath 加载 CRD YAML 模板（resources/crd-templates/），
 * 替换占位符后下发到沙箱集群。用户可自定义模板，只需保留占位符即可。
 *
 * <p>模板占位符：
 * RESOURCE_NAME, NAMESPACE, CLUSTER_ID, SHOW_NAME, PROTOCOL,
 * MCP_SERVERS_JSON, ACCESSES_YAML, ENV_YAML（仅 stdio 模板）
 */
@Component
@Slf4j
public class AgentRuntimeDeployStrategy implements McpSandboxDeployStrategy {

    private static final CustomResourceDefinitionContext CRD_CONTEXT =
            new CustomResourceDefinitionContext.Builder()
                    .withGroup("agentruntime.alibabacloud.com")
                    .withVersion("v1alpha1")
                    .withPlural("toolservers")
                    .withScope("Namespaced")
                    .build();

    private static final CustomResourceDefinitionContext ENDPOINT_CONTEXT =
            new CustomResourceDefinitionContext.Builder()
                    .withGroup("agentruntime.alibabacloud.com")
                    .withVersion("v1alpha1")
                    .withPlural("endpoints")
                    .withScope("Namespaced")
                    .build();

    /** 轮询 Endpoint 的最大等待时间和间隔（毫秒） */
    private static final long POLL_TIMEOUT_MS = 60_000;

    private static final long POLL_INTERVAL_MS = 3_000;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Override
    public String supportedSandboxType() {
        return "AGENT_RUNTIME";
    }

    @Override
    public String deploy(
            SandboxInstance sandbox,
            String mcpServerId,
            String mcpName,
            String userId,
            String transportType,
            String connectionConfig,
            String apiKey,
            String authType,
            String userParams) {
        if (StrUtil.isBlank(sandbox.getKubeConfig())) {
            throw new BusinessException(
                    ErrorCode.INVALID_REQUEST, "沙箱实例未配置 KubeConfig: " + sandbox.getSandboxId());
        }

        String namespace = StrUtil.blankToDefault(sandbox.getNamespace(), "default");
        String resourceName = buildResourceName(mcpName, userId);
        String accessName = "himarket-" + userId;
        boolean isStdio = "stdio".equalsIgnoreCase(transportType);
        boolean isBearer = "bearer".equalsIgnoreCase(authType);

        // 构建 mcpServers JSON，同时从中剥离 env 字段
        String[] mcpResult = buildMcpServersJson(mcpName, connectionConfig);
        String mcpServersJson = mcpResult[0];
        String configEnvJson = mcpResult[1];

        // 合并 env：connectionConfig 中的 env + 用户提交的 params
        String mergedEnvJson = mergeEnvJson(configEnvJson, userParams);
        String envYaml = "";
        if (StrUtil.isNotBlank(mergedEnvJson)) {
            envYaml = buildEnvYaml(mergedEnvJson);
        }

        // 只放模板里实际用到的占位符
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("RESOURCE_NAME", resourceName);
        vars.put("NAMESPACE", namespace);
        vars.put("CLUSTER_ID", extractClusterId(sandbox.getClusterAttribute()));
        vars.put("SHOW_NAME", resourceName);
        vars.put("PROTOCOL", transportType);
        vars.put("MCP_SERVERS_JSON", mcpServersJson);
        vars.put("ACCESSES_YAML", buildAccessesYaml(isBearer, accessName));
        vars.put("ENV_YAML", envYaml);

        // 选择模板
        String templateFile =
                isStdio
                        ? "crd-templates/toolserver-stdio.yaml"
                        : "crd-templates/toolserver-sse.yaml";

        // 加载模板 + 替换占位符
        String renderedYaml = renderTemplate(templateFile, vars);

        // 反序列化为 GenericKubernetesResource
        GenericKubernetesResource crd =
                Serialization.unmarshal(renderedYaml, GenericKubernetesResource.class);

        // 追加 labels
        if (crd.getMetadata().getLabels() == null) {
            crd.getMetadata().setLabels(new LinkedHashMap<>());
        }
        crd.getMetadata().getLabels().put("app.kubernetes.io/managed-by", "himarket");
        crd.getMetadata().getLabels().put("himarket.io/mcp-server-id", mcpServerId);
        crd.getMetadata().getLabels().put("himarket.io/user-id", userId);

        // 下发 CRD
        KubernetesClient client = K8sClientUtils.getClient(sandbox.getKubeConfig());
        client.genericKubernetesResources(CRD_CONTEXT)
                .inNamespace(namespace)
                .resource(crd)
                .createOrReplace();

        log.info(
                "[AgentRuntimeDeploy] CRD 下发成功: namespace={}, name={}, template={}",
                namespace,
                resourceName,
                templateFile);

        // 轮询 Endpoint CRD 获取真实 endpoint URL
        String endpointName = resourceName + "-primary";
        String endpointUrl = pollEndpointUrl(client, namespace, endpointName);

        // TODO: 临时将 https 替换为 http，绕过 SSL 证书验证问题，后续配置证书后改回
        if (endpointUrl != null && endpointUrl.startsWith("https://")) {
            endpointUrl = endpointUrl.replaceFirst("https://", "http://");
        }

        log.info("[AgentRuntimeDeploy] Endpoint URL 获取成功: {}", endpointUrl);
        return endpointUrl;
    }

    @Override
    public void undeploy(SandboxInstance sandbox, String mcpName, String userId) {
        if (StrUtil.isBlank(sandbox.getKubeConfig())) {
            throw new BusinessException(
                    ErrorCode.INVALID_REQUEST, "沙箱实例未配置 KubeConfig: " + sandbox.getSandboxId());
        }

        String namespace = StrUtil.blankToDefault(sandbox.getNamespace(), "default");
        String resourceName = buildResourceName(mcpName, userId);
        String endpointName = resourceName + "-primary";

        KubernetesClient client = K8sClientUtils.getClient(sandbox.getKubeConfig());

        // 删除 ToolServer CRD
        try {
            client.genericKubernetesResources(CRD_CONTEXT)
                    .inNamespace(namespace)
                    .withName(resourceName)
                    .delete();
            log.info(
                    "[AgentRuntimeDeploy] ToolServer CRD 删除成功: namespace={}, name={}",
                    namespace,
                    resourceName);
        } catch (Exception e) {
            log.warn(
                    "[AgentRuntimeDeploy] ToolServer CRD 删除失败（可能已不存在）: namespace={}, name={},"
                            + " error={}",
                    namespace,
                    resourceName,
                    e.getMessage());
            return;
        }

        // 轮询等待 Endpoint CRD 被沙箱清理
        waitEndpointDeleted(client, namespace, endpointName);
    }

    /**
     * 轮询等待 Endpoint CRD 被沙箱异步清理。
     * 如果超时仍未删除，仅打印警告不抛异常（不阻塞后续重建）。
     */
    private void waitEndpointDeleted(
            KubernetesClient client, String namespace, String endpointName) {
        long deadline = System.currentTimeMillis() + POLL_TIMEOUT_MS;

        while (System.currentTimeMillis() < deadline) {
            try {
                GenericKubernetesResource endpoint =
                        client.genericKubernetesResources(ENDPOINT_CONTEXT)
                                .inNamespace(namespace)
                                .withName(endpointName)
                                .get();

                if (endpoint == null) {
                    log.info(
                            "[AgentRuntimeDeploy] Endpoint 已清理: namespace={}, name={}",
                            namespace,
                            endpointName);
                    return;
                }
            } catch (Exception e) {
                // get 抛异常通常意味着资源不存在
                log.info(
                        "[AgentRuntimeDeploy] Endpoint 已清理（查询异常）: namespace={}, name={}",
                        namespace,
                        endpointName);
                return;
            }

            log.debug("[AgentRuntimeDeploy] Endpoint 尚未清理，继续等待: {}", endpointName);
            try {
                Thread.sleep(POLL_INTERVAL_MS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.warn("[AgentRuntimeDeploy] 等待 Endpoint 清理被中断");
                return;
            }
        }

        log.warn(
                "[AgentRuntimeDeploy] 等待 Endpoint 清理超时（{}秒），继续执行: {}",
                POLL_TIMEOUT_MS / 1000,
                endpointName);
    }

    // ==================== 私有方法 ====================

    /**
     * 从 classpath 加载模板并替换占位符。
     */
    private String renderTemplate(String templatePath, Map<String, String> variables) {
        try (InputStream is = getClass().getClassLoader().getResourceAsStream(templatePath)) {
            if (is == null) {
                throw new BusinessException(
                        ErrorCode.INVALID_REQUEST, "CRD 模板文件不存在: " + templatePath);
            }
            String template = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            for (Map.Entry<String, String> entry : variables.entrySet()) {
                template = template.replace("${" + entry.getKey() + "}", entry.getValue());
            }
            return template;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(
                    ErrorCode.INVALID_REQUEST, "读取 CRD 模板失败: " + e.getMessage());
        }
    }

    /**
     * 解析 connectionConfig JSON，构建 mcpServers JSON 并剥离 env。
     * env 应通过 CRD spec.env 传递，不应留在 mcpServers JSON 中。
     *
     * @return String[2]: [0]=mcpServersJson, [1]=提取的 env JSON（可能为 null）
     * @throws BusinessException connectionConfig 为空或无法解析时抛出
     */
    private String[] buildMcpServersJson(String mcpName, String connectionConfig) {
        if (StrUtil.isBlank(connectionConfig)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "MCP connectionConfig 为空，无法部署");
        }

        String serverName = StrUtil.blankToDefault(mcpName, "mcp-server");

        try {
            McpConnectionConfig config = McpConnectionConfig.parse(connectionConfig);

            // 格式3: { mcpServerConfig: { rawConfig: {...} } } → 递归解析 rawConfig
            if (config.isWrappedFormat()) {
                return buildMcpServersJson(mcpName, config.getRawConfigJson());
            }

            // 格式1 或 格式2: 提取 env，构建不含 env 的 mcpServers JSON
            if (config.isMcpServersFormat() || config.isSingleServerFormat()) {
                Map<String, String> extractedEnv = config.extractAllEnv();
                String mcpJson = config.toMcpServersJsonWithoutEnv(serverName);
                String envJson =
                        extractedEnv.isEmpty()
                                ? null
                                : OBJECT_MAPPER.writeValueAsString(extractedEnv);
                return new String[] {mcpJson, envJson};
            }

            throw new BusinessException(
                    ErrorCode.INVALID_REQUEST, "无法识别 connectionConfig 格式，请检查 MCP 配置");
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(
                    ErrorCode.INVALID_REQUEST, "解析 connectionConfig 失败: " + e.getMessage());
        }
    }

    /**
     * 根据鉴权方式生成 CRD accesses YAML 片段。
     * bearer：包含 authentication + name + port + type。
     * none：只有 port + type，不含 authentication 和 name。
     */
    private String buildAccessesYaml(boolean isBearer, String accessName) {
        List<Map<String, Object>> accesses = new ArrayList<>();
        Map<String, Object> access = new LinkedHashMap<>();

        if (isBearer) {
            String secretName = accessName + "-secret";
            Map<String, Object> source = new LinkedHashMap<>();
            source.put("key", "API_KEY");
            source.put("name", secretName);
            source.put("optional", true);

            Map<String, Object> apiKey = new LinkedHashMap<>();
            apiKey.put("headerName", "Authorization");
            apiKey.put("source", source);

            Map<String, Object> authentication = new LinkedHashMap<>();
            authentication.put("apiKey", apiKey);

            access.put("authentication", authentication);
            access.put("name", accessName);
        }

        access.put("port", 80);
        access.put("type", "http");
        accesses.add(access);

        DumperOptions options = new DumperOptions();
        options.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        options.setIndent(2);
        Yaml yaml = new Yaml(options);
        String raw = yaml.dump(accesses);

        // 添加缩进前缀以匹配 CRD 模板层级
        StringBuilder sb = new StringBuilder();
        for (String line : raw.split("\n")) {
            sb.append("        ").append(line).append("\n");
        }
        return sb.toString().stripTrailing();
    }

    /**
     * 合并 connectionConfig 中提取的 env 和用户提交的 params。
     * userParams 优先级更高（覆盖同名 key）。
     *
     * @return 合并后的 JSON 字符串，或 null
     */
    @SuppressWarnings("unchecked")
    private String mergeEnvJson(String configEnvJson, String userParams) {
        Map<String, Object> merged = new LinkedHashMap<>();
        if (StrUtil.isNotBlank(configEnvJson)) {
            try {
                merged.putAll(OBJECT_MAPPER.readValue(configEnvJson, Map.class));
            } catch (Exception e) {
                log.warn("解析 configEnvJson 失败: {}", e.getMessage());
            }
        }
        if (StrUtil.isNotBlank(userParams)) {
            try {
                merged.putAll(OBJECT_MAPPER.readValue(userParams, Map.class));
            } catch (Exception e) {
                log.warn("解析 userParams 失败: {}", e.getMessage());
            }
        }
        if (merged.isEmpty()) return null;
        try {
            return OBJECT_MAPPER.writeValueAsString(merged);
        } catch (Exception e) {
            log.warn("序列化 mergedEnv 失败: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 从 env JSON 构建 CRD spec.env YAML 片段。
     * envJson 格式：{"KEY": "value", ...}
     */
    @SuppressWarnings("unchecked")
    private String buildEnvYaml(String envJson) {
        try {
            Map<String, Object> params = OBJECT_MAPPER.readValue(envJson, Map.class);
            if (params.isEmpty()) {
                return "";
            }
            List<Map<String, String>> envList = new ArrayList<>();
            for (Map.Entry<String, Object> e : params.entrySet()) {
                Map<String, String> entry = new LinkedHashMap<>();
                entry.put("name", e.getKey());
                entry.put("value", e.getValue() != null ? e.getValue().toString() : "");
                envList.add(entry);
            }
            Map<String, Object> envMap = new LinkedHashMap<>();
            envMap.put("env", envList);

            DumperOptions options = new DumperOptions();
            options.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
            options.setIndent(2);
            Yaml yaml = new Yaml(options);
            String raw = yaml.dump(envMap);
            StringBuilder sb = new StringBuilder();
            for (String line : raw.split("\n")) {
                sb.append("      ").append(line).append("\n");
            }
            return sb.toString();
        } catch (Exception e) {
            log.warn("解析 envJson 构建 env 失败: {}", e.getMessage());
            return "";
        }
    }

    /**
     * 从 clusterAttribute JSON 中提取 clusterId。
     */
    @SuppressWarnings("unchecked")
    private String extractClusterId(String clusterAttribute) {
        if (StrUtil.isBlank(clusterAttribute)) {
            return "";
        }
        try {
            Map<String, Object> map = OBJECT_MAPPER.readValue(clusterAttribute, Map.class);
            Object clusterId = map.get("clusterId");
            return clusterId != null ? clusterId.toString() : "";
        } catch (Exception e) {
            log.warn("解析 clusterAttribute 失败: {}", e.getMessage());
            return "";
        }
    }

    /**
     * 构建 K8s 资源名称：mcpName + userId 后 8 位。
     */
    private String buildResourceName(String mcpName, String userId) {
        String name = StrUtil.blankToDefault(mcpName, "mcp-server");
        String userSuffix =
                (userId != null && userId.length() >= 8)
                        ? userId.substring(userId.length() - 8)
                        : StrUtil.blankToDefault(userId, "unknown");
        String raw = name + "-" + userSuffix;
        String sanitized =
                raw.toLowerCase()
                        .replaceAll("[^a-z0-9-]", "-")
                        .replaceAll("-+", "-")
                        .replaceAll("^-|-$", "");
        return sanitized.length() > 253 ? sanitized.substring(0, 253) : sanitized;
    }

    /**
     * 轮询 Endpoint CRD（kind: Endpoint）获取 status.url。
     * Endpoint 名称为 {toolserver名称}-primary。
     */
    private String pollEndpointUrl(KubernetesClient client, String namespace, String endpointName) {
        long deadline = System.currentTimeMillis() + POLL_TIMEOUT_MS;

        while (System.currentTimeMillis() < deadline) {
            try {
                GenericKubernetesResource endpoint =
                        client.genericKubernetesResources(ENDPOINT_CONTEXT)
                                .inNamespace(namespace)
                                .withName(endpointName)
                                .get();

                if (endpoint != null) {
                    Map<String, Object> status =
                            (Map<String, Object>) endpoint.getAdditionalProperties().get("status");
                    if (status != null) {
                        // 优先取顶层 status.url
                        String url =
                                status.get("url") != null ? status.get("url").toString() : null;
                        if (StrUtil.isNotBlank(url)) {
                            return url;
                        }
                        // fallback: 从 status.addresses 中取 internet 类型
                        Object addressesObj = status.get("addresses");
                        if (addressesObj instanceof java.util.List) {
                            for (Object addrObj : (java.util.List<?>) addressesObj) {
                                if (addrObj instanceof Map) {
                                    Map<String, Object> addr = (Map<String, Object>) addrObj;
                                    if ("internet".equals(addr.get("type"))
                                            && addr.get("url") != null) {
                                        return addr.get("url").toString();
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (Exception e) {
                log.debug("[AgentRuntimeDeploy] 轮询 Endpoint 异常（可能尚未创建）: {}", e.getMessage());
            }

            try {
                Thread.sleep(POLL_INTERVAL_MS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new BusinessException(ErrorCode.INVALID_REQUEST, "轮询 Endpoint 被中断");
            }
        }

        throw new BusinessException(
                ErrorCode.INVALID_REQUEST,
                "等待 Endpoint 就绪超时（" + (POLL_TIMEOUT_MS / 1000) + "秒）: " + endpointName);
    }
}
