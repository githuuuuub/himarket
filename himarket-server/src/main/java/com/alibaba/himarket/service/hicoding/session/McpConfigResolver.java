package com.alibaba.himarket.service.hicoding.session;

import com.alibaba.himarket.core.security.ContextHolder;
import com.alibaba.himarket.service.McpServerService;
import com.alibaba.himarket.support.chat.mcp.MCPTransportConfig;
import com.alibaba.himarket.support.enums.MCPTransportMode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 根据 MCP 产品 ID 列表解析完整 MCP 连接配置的服务。
 *
 * <p>统一从 mcp_server_endpoint 热数据表获取用户订阅的真实 endpoint URL，
 * 与 HiChat 的 {@code ChatService.buildMCPConfigs()} 使用相同的数据源，
 * 确保沙箱部署的 MCP 也能正确获取到 endpoint。
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class McpConfigResolver {

    private final McpServerService mcpServerService;
    private final ContextHolder contextHolder;

    /**
     * 根据 MCP 产品 ID 列表解析完整 MCP 连接配置。
     *
     * @param mcpEntries 前端传入的 MCP 标识符列表
     * @return 解析后的 ResolvedMcpEntry 列表（无订阅 endpoint 的条目被跳过）
     */
    public List<ResolvedSessionConfig.ResolvedMcpEntry> resolve(
            List<CliSessionConfig.McpServerEntry> mcpEntries) {
        if (mcpEntries == null || mcpEntries.isEmpty()) {
            return Collections.emptyList();
        }

        String userId = contextHolder.getUser();
        List<String> productIds =
                mcpEntries.stream()
                        .map(CliSessionConfig.McpServerEntry::getProductId)
                        .collect(Collectors.toList());

        // 从 endpoint 热数据表获取用户订阅的真实 MCP 传输配置
        List<MCPTransportConfig> transportConfigs =
                mcpServerService.resolveTransportConfigs(productIds, userId);

        // 转换为 ResolvedMcpEntry
        List<ResolvedSessionConfig.ResolvedMcpEntry> result = new ArrayList<>();
        for (MCPTransportConfig config : transportConfigs) {
            ResolvedSessionConfig.ResolvedMcpEntry entry =
                    new ResolvedSessionConfig.ResolvedMcpEntry();
            entry.setName(config.getMcpServerName());
            entry.setUrl(config.getUrl());
            entry.setTransportType(
                    config.getTransportMode() == MCPTransportMode.STREAMABLE_HTTP
                            ? "streamable-http"
                            : "sse");
            entry.setHeaders(config.getHeaders());
            result.add(entry);
        }
        return result;
    }
}
