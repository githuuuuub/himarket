# MCP Server 配置表设计

## 表名：`mcp_server_config`

用于存储 MCP Server 的完整配置信息，支持自定义创建、网关导入、第三方同步等多种来源。

## 字段说明

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | bigint, 自增 | 是 | AUTO_INCREMENT | 物理主键 |
| `mcp_server_id` | varchar(64), 唯一 | 是 | - | 业务主键，UUID，对外暴露用这个而不是自增 id |
| `product_id` | varchar(64) | 是 | - | 关联 `product` 表，表示这个 MCP 配置属于哪个 API Product |
| `mcp_server_name` | varchar(128) | 是 | - | MCP 英文名称，同一个 product 下唯一，作为 MCP 的标识符，如 `weather-mcp-server` |
| `display_name` | varchar(128) | 是 | - | MCP 中文名称，用于前端展示，如"天气查询服务" |
| `description` | varchar(512) | 否 | NULL | MCP 功能描述，市场列表页展示的简介文字 |
| `repo_url` | varchar(512) | 否 | NULL | 仓库地址，指向 MCP Server 的源码仓库 |
| `tags` | json | 否 | NULL | 自定义标签数组，如 `["天气", "工具"]`，用于市场筛选和展示 |
| `icon` | json | 否 | NULL | 图标配置，兼容两种模式：`{"type":"url","value":"https://..."}` 或 `{"type":"base64","value":"data:image/..."}` |
| `protocol_type` | varchar(32) | 是 | - | 协议类型：`stdio` / `sse` / `http`，决定连接方式和参数类型 |
| `connection_config` | json | 是 | - | MCP 连接配置 JSON，用户粘贴的 mcpServers JSON（解析后去掉 env/headers 的纯配置） |
| `extra_params` | json | 否 | NULL | 额外参数列表，`[{name, position, required, description, example}]`。stdio 为环境变量，sse/http 为 header/query 参数 |
| `service_intro` | longtext | 否 | NULL | 服务介绍 Markdown 文档，详情页渲染用 |
| `source_type` | varchar(32) | 否 | NULL | 来源类型：`npm` / `docker` / `git` / `config`，描述 MCP Server 的安装/部署方式 |
| `origin` | varchar(32) | 是 | `'ADMIN'` | 创建来源：`ADMIN`（管理员创建）/ `GATEWAY`（网关导入）/ `USER`（用户自建）/ `THIRD_PARTY`（第三方市场同步） |
| `visibility` | varchar(16) | 是 | `'PUBLIC'` | 可见性：`PUBLIC`（市场公开可见）/ `PRIVATE`（仅创建者可见） |
| `publish_status` | varchar(32) | 是 | `'DRAFT'` | 发布状态：`DRAFT`（草稿）→ `PENDING_REVIEW`（待审核）→ `PUBLISHED`（已发布）/ `REJECTED`（被拒绝） |
| `gateway_id` | varchar(64) | 否 | NULL | 关联的网关 ID，从网关导入时记录来源网关，其他来源为空 |
| `third_party_source` | varchar(128) | 否 | NULL | 第三方来源标识，如 `mcp-registry`，从第三方市场同步时记录来源 |
| `tools_config` | json | 否 | NULL | MCP 提供的 tools 列表，`{"tools":[{"name":"getWeather","description":"..."}]}`，预留字段 |
| `created_by` | varchar(64) | 否 | NULL | 创建人标识，关联 admin 或 user |
| `created_at` | datetime(3) | 否 | CURRENT_TIMESTAMP(3) | 创建时间 |
| `updated_at` | datetime(3) | 否 | CURRENT_TIMESTAMP(3) ON UPDATE | 更新时间，自动维护 |

## 索引

| 索引名 | 类型 | 字段 | 说明 |
|--------|------|------|------|
| `PRIMARY` | 主键 | `id` | 物理主键 |
| `uk_mcp_server_id` | 唯一索引 | `mcp_server_id` | 业务主键唯一 |
| `uk_product_mcp_name` | 唯一索引 | `product_id`, `mcp_server_name` | 同一 product 下 MCP 名称唯一 |
| `idx_publish_status` | 普通索引 | `publish_status` | 按发布状态查询（市场列表筛选） |
| `idx_origin` | 普通索引 | `origin` | 按来源查询 |
| `idx_product_id` | 普通索引 | `product_id` | 按 product 查询关联的 MCP 配置 |

## 建表 SQL

```sql
CREATE TABLE IF NOT EXISTS `mcp_server_config` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `mcp_server_id` varchar(64) NOT NULL,
    `product_id` varchar(64) NOT NULL,
    `mcp_server_name` varchar(128) NOT NULL,
    `display_name` varchar(128) NOT NULL,
    `description` varchar(512) DEFAULT NULL,
    `repo_url` varchar(512) DEFAULT NULL,
    `tags` json DEFAULT NULL,
    `icon` json DEFAULT NULL,
    `protocol_type` varchar(32) NOT NULL,
    `connection_config` json NOT NULL,
    `extra_params` json DEFAULT NULL,
    `service_intro` longtext DEFAULT NULL,
    `source_type` varchar(32) DEFAULT NULL COMMENT 'npm / docker / git / config',
    `origin` varchar(32) NOT NULL DEFAULT 'ADMIN' COMMENT 'ADMIN / GATEWAY / USER / THIRD_PARTY',
    `visibility` varchar(16) NOT NULL DEFAULT 'PUBLIC' COMMENT 'PUBLIC / PRIVATE',
    `publish_status` varchar(32) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT / PENDING_REVIEW / PUBLISHED / REJECTED',
    `gateway_id` varchar(64) DEFAULT NULL,
    `third_party_source` varchar(128) DEFAULT NULL,
    `tools_config` json DEFAULT NULL,
    `created_by` varchar(64) DEFAULT NULL,
    `created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_mcp_server_id` (`mcp_server_id`),
    UNIQUE KEY `uk_product_mcp_name` (`product_id`, `mcp_server_name`),
    KEY `idx_publish_status` (`publish_status`),
    KEY `idx_origin` (`origin`),
    KEY `idx_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## 枚举值参考

### `protocol_type`
- `stdio` — 标准输入输出，本地进程通信
- `sse` — Server-Sent Events，HTTP 长连接
- `http` — Streamable HTTP，标准 HTTP 请求

### `origin`
- `ADMIN` — 管理员在后台创建
- `GATEWAY` — 从网关自动导入
- `USER` — 用户自行创建
- `THIRD_PARTY` — 从第三方 MCP 市场同步

### `visibility`
- `PUBLIC` — 市场公开可见，所有用户可浏览和订阅
- `PRIVATE` — 仅创建者可见

### `publish_status`
- `DRAFT` — 草稿，未提交审核
- `PENDING_REVIEW` — 已提交，等待审核
- `PUBLISHED` — 审核通过，已发布到市场
- `REJECTED` — 审核未通过

### `source_type`
- `npm` — NPM 包
- `docker` — Docker 镜像
- `git` — Git 仓库源码
- `config` — 纯配置（无独立部署包）
