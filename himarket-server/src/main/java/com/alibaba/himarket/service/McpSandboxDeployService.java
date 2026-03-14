package com.alibaba.himarket.service;

/**
 * MCP 沙箱部署服务：负责向沙箱集群部署 MCP Server 并获取 endpoint URL。
 *
 * <p>根据沙箱类型（sandboxType）分发到不同的部署策略。
 */
public interface McpSandboxDeployService {

    /**
     * 部署 MCP Server 到指定沙箱集群，返回 endpoint URL。
     *
     * @param sandboxId       沙箱实例 ID
     * @param mcpServerId     MCP Server ID
     * @param mcpName         MCP Server 名称
     * @param userId          订阅用户 ID
     * @param transportType   传输类型：sse / http
     * @param connectionConfig MCP 冷数据中的连接配置 JSON
     * @param apiKey          用户的 API Key
     * @param authType        鉴权方式：none / bearer
     * @param userParams      用户提交的参数值 JSON
     * @param extraParamsDef  额外参数定义 JSON（含 position 信息）
     * @return endpoint URL
     */
    String deploy(
            String sandboxId,
            String mcpServerId,
            String mcpName,
            String userId,
            String transportType,
            String connectionConfig,
            String apiKey,
            String authType,
            String userParams,
            String extraParamsDef);

    /**
     * 删除沙箱集群中的 ToolServer CRD。
     *
     * @param sandboxId 沙箱实例 ID
     * @param mcpName   MCP Server 名称
     * @param userId    订阅用户 ID
     */
    void undeploy(String sandboxId, String mcpName, String userId);
}
