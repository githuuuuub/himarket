package com.alibaba.himarket.service.mcp;

import com.alibaba.himarket.entity.SandboxInstance;

/**
 * MCP 沙箱部署策略接口。
 *
 * <p>不同 sandboxType 对应不同的部署实现。
 */
public interface McpSandboxDeployStrategy {

    /**
     * 该策略支持的沙箱类型。
     */
    String supportedSandboxType();

    /**
     * 部署 MCP Server 到沙箱集群，返回 endpoint URL。
     *
     * @param sandbox         沙箱实例
     * @param mcpServerId     MCP Server ID
     * @param mcpName         MCP Server 名称
     * @param userId          订阅用户 ID
     * @param transportType   传输类型：sse / http
     * @param connectionConfig MCP 冷数据中的连接配置 JSON
     * @param apiKey          用户的 API Key（consumer credential token）
     * @param authType        鉴权方式：none / bearer
     * @return endpoint URL
     */
    String deploy(
            SandboxInstance sandbox,
            String mcpServerId,
            String mcpName,
            String userId,
            String transportType,
            String connectionConfig,
            String apiKey,
            String authType,
            String userParams);

    /**
     * 删除沙箱集群中的 ToolServer CRD。
     *
     * @param sandbox  沙箱实例
     * @param mcpName  MCP Server 名称
     * @param userId   订阅用户 ID
     */
    void undeploy(SandboxInstance sandbox, String mcpName, String userId);
}
