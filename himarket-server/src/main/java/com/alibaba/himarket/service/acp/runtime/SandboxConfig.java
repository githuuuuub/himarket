package com.alibaba.himarket.service.acp.runtime;

import java.util.Map;

/**
 * 沙箱创建/获取配置。
 * 统一各沙箱类型的配置参数。
 */
public record SandboxConfig(
        String userId,
        SandboxType type,
        String workspacePath,
        Map<String, String> env,
        Map<String, String> resources,
        // E2B 特有配置（未来）
        String e2bTemplate,
        // 本地特有配置
        int localSidecarPort,
        // 远程沙箱：关联的 SandboxInstance ID（从数据库获取连接信息）
        String sandboxInstanceId) {

    /** 向后兼容：不指定 sandboxInstanceId 的构造方式 */
    public SandboxConfig(
            String userId,
            SandboxType type,
            String workspacePath,
            Map<String, String> env,
            Map<String, String> resources,
            String e2bTemplate,
            int localSidecarPort) {
        this(userId, type, workspacePath, env, resources, e2bTemplate, localSidecarPort, null);
    }
}
