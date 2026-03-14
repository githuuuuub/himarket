package com.alibaba.himarket.dto.params.mcp;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 保存 MCP Server 元信息参数（创建/更新共用）。
 */
@Data
public class SaveMcpMetaParam {

    @NotBlank(message = "关联产品ID不能为空")
    private String productId;

    @NotBlank(message = "MCP 英文名称不能为空")
    @Pattern(regexp = "^[a-z][a-z0-9-]*$", message = "小写字母开头，仅含小写字母、数字、连字符")
    @Size(max = 63, message = "不超过 63 个字符")
    private String mcpName;

    @NotBlank(message = "MCP 展示名称不能为空")
    @Size(max = 128, message = "不超过 128 个字符")
    private String displayName;

    private String description;

    private String repoUrl;

    private String sourceType;

    private String origin;

    /**
     * 网关导入时的网关ID
     */
    private String gatewayId;

    /**
     * Nacos导入时的Nacos实例ID
     */
    private String nacosId;

    /**
     * 网关/Nacos 的 refConfig JSON（用于 ProductRef 关联）
     */
    private String refConfig;

    /**
     * JSON 字符串
     */
    private String tags;

    /**
     * JSON 字符串
     */
    private String icon;

    @NotBlank(message = "协议类型不能为空")
    private String protocolType;

    @NotBlank(message = "连接配置不能为空")
    private String connectionConfig;

    /**
     * JSON 字符串
     */
    private String extraParams;

    private String serviceIntro;

    private String visibility;

    private String publishStatus;

    /**
     * JSON 字符串
     */
    private String toolsConfig;

    /**
     * 创建者（外部系统可传入用户ID）
     */
    private String createdBy;

    /** 是否需要沙箱托管 */
    private Boolean sandboxRequired;
}
