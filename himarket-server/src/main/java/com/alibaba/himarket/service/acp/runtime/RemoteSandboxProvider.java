package com.alibaba.himarket.service.acp.runtime;

import com.alibaba.himarket.config.AcpProperties;
import com.alibaba.himarket.entity.SandboxInstance;
import com.alibaba.himarket.repository.SandboxInstanceRepository;
import java.io.IOException;
import java.net.URI;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 远程沙箱提供者。
 *
 * <p>优先从数据库（SandboxInstance）获取连接信息，fallback 到 application.yml 静态配置。
 * Sidecar 可以部署在 K8s Pod、Docker 容器或裸机上，只要地址可达即可。
 * 所有用户共用同一个 Sidecar，通过 {@code /workspace/{userId}} 实现工作目录隔离。
 *
 * <p>文件操作使用绝对路径（参考 OpenSandbox execd 设计），由本 Provider 负责将相对路径
 * 转换为基于 {@code workspacePath} 的绝对路径，Sidecar 端不再需要知道用户上下文。
 */
@Component
public class RemoteSandboxProvider implements SandboxProvider {

    private static final Logger logger = LoggerFactory.getLogger(RemoteSandboxProvider.class);

    private final SandboxHttpClient sandboxHttpClient;
    private final AcpProperties acpProperties;
    private final SandboxInstanceRepository sandboxInstanceRepository;

    public RemoteSandboxProvider(
            SandboxHttpClient sandboxHttpClient,
            AcpProperties acpProperties,
            SandboxInstanceRepository sandboxInstanceRepository) {
        this.sandboxHttpClient = sandboxHttpClient;
        this.acpProperties = acpProperties;
        this.sandboxInstanceRepository = sandboxInstanceRepository;
    }

    @Override
    public SandboxType getType() {
        return SandboxType.REMOTE;
    }

    @Override
    public SandboxInfo acquire(SandboxConfig config) {
        if (config.userId() == null || config.userId().isBlank()) {
            throw new IllegalArgumentException("userId 不能为空");
        }
        String userId = config.userId();
        if (userId.contains("..") || userId.contains("/")) {
            throw new IllegalArgumentException("userId 包含非法字符: " + userId);
        }

        String host;
        int port;

        // 优先从数据库获取 SandboxInstance 连接信息
        if (config.sandboxInstanceId() != null && !config.sandboxInstanceId().isBlank()) {
            SandboxInstance instance =
                    sandboxInstanceRepository
                            .findBySandboxId(config.sandboxInstanceId())
                            .orElseThrow(
                                    () ->
                                            new IllegalArgumentException(
                                                    "Sandbox 实例不存在: "
                                                            + config.sandboxInstanceId()));
            host = extractHost(instance.getApiServer());
            port = extractPort(instance.getApiServer());
            logger.info(
                    "[RemoteSandboxProvider] acquire from DB instance: sandboxId={}, host={}:{}",
                    config.sandboxInstanceId(),
                    host,
                    port);
        } else {
            // Fallback 到静态配置
            AcpProperties.RemoteConfig remoteConfig = acpProperties.getRemote();
            host = remoteConfig.getHost();
            port = remoteConfig.getPort();
            logger.info(
                    "[RemoteSandboxProvider] acquire from static config: host={}:{}", host, port);
        }

        String workspacePath = "/workspace/" + userId;

        logger.info(
                "[RemoteSandboxProvider] acquire: userId={}, host={}:{}, workspacePath={}",
                userId,
                host,
                port,
                workspacePath);

        return new SandboxInfo(
                SandboxType.REMOTE, "sandbox-remote", host, port, workspacePath, true, Map.of());
    }

    @Override
    public void release(SandboxInfo info) {
        // 空操作：远程 Sidecar 生命周期由外部管理
    }

    @Override
    public boolean healthCheck(SandboxInfo info) {
        return sandboxHttpClient.healthCheckWithLog(sidecarBaseUrl(info), info.sandboxId());
    }

    @Override
    public void writeFile(SandboxInfo info, String relativePath, String content)
            throws IOException {
        String absolutePath = toAbsolutePath(info, relativePath);
        sandboxHttpClient.writeFile(sidecarBaseUrl(info), info.sandboxId(), absolutePath, content);
    }

    @Override
    public String readFile(SandboxInfo info, String relativePath) throws IOException {
        String absolutePath = toAbsolutePath(info, relativePath);
        return sandboxHttpClient.readFile(sidecarBaseUrl(info), info.sandboxId(), absolutePath);
    }

    @Override
    public int extractArchive(SandboxInfo info, byte[] tarGzBytes) throws IOException {
        return sandboxHttpClient.extractArchive(
                sidecarBaseUrl(info), info.sandboxId(), tarGzBytes, info.workspacePath());
    }

    @Override
    public RuntimeAdapter connectSidecar(SandboxInfo info, RuntimeConfig config) {
        RemoteRuntimeAdapter adapter = new RemoteRuntimeAdapter(info.host(), info.sidecarPort());

        String command = config.getCommand();
        String args = config.getArgs() != null ? String.join(" ", config.getArgs()) : null;

        URI wsUri =
                info.sidecarWsUri(
                        command, args != null ? args : "", config.getEnv(), info.workspacePath());

        adapter.connect(wsUri);
        return adapter;
    }

    /**
     * 判断是否有可用的远程沙箱（数据库中有 ACTIVE 实例 或 静态配置已设置）。
     */
    public boolean isAvailable() {
        if (acpProperties.getRemote().isConfigured()) {
            return true;
        }
        return sandboxInstanceRepository.countByStatus("RUNNING") > 0;
    }

    private String sidecarBaseUrl(SandboxInfo info) {
        return "http://" + info.host() + ":" + info.sidecarPort();
    }

    /**
     * 从 apiServer URL 提取 host。
     * 例如 "https://47.243.156.37:6443/" → "47.243.156.37"
     */
    private String extractHost(String apiServer) {
        if (apiServer == null) {
            throw new IllegalArgumentException("apiServer 不能为空");
        }
        String cleaned = apiServer.replaceFirst("^https?://", "").replaceFirst("/+$", "");
        int colonIdx = cleaned.lastIndexOf(':');
        return colonIdx > 0 ? cleaned.substring(0, colonIdx) : cleaned;
    }

    /**
     * 从 apiServer URL 提取端口，默认 8080（Sidecar 端口）。
     */
    private int extractPort(String apiServer) {
        // Sidecar 端口固定 8080，apiServer 的端口是 K8s API 端口，不是 Sidecar 端口
        return 8080;
    }

    private String toAbsolutePath(SandboxInfo info, String relativePath) {
        String wp = info.workspacePath();
        if (wp == null || wp.isEmpty()) {
            return relativePath;
        }
        String cleaned = relativePath;
        if (cleaned.startsWith("./")) {
            cleaned = cleaned.substring(2);
        } else if (cleaned.startsWith("/")) {
            return cleaned;
        }
        return wp.endsWith("/") ? wp + cleaned : wp + "/" + cleaned;
    }
}
