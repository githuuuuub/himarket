# Sandbox 实例表设计

## 表名：`sandbox_instance`

用于存储沙箱运行环境实例的配置信息，支持 AgentRuntime 和自建 Sandbox 两种类型。

## 字段说明

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | bigint, 自增 | 是 | AUTO_INCREMENT | 物理主键 |
| `sandbox_id` | varchar(64), 唯一 | 是 | - | 业务主键，格式 `sandbox-xxxx`，对外暴露用这个而不是自增 id |
| `admin_id` | varchar(64) | 是 | - | 创建人，关联管理员 ID |
| `sandbox_name` | varchar(64) | 是 | - | 实例名称，同一管理员下唯一 |
| `sandbox_type` | varchar(32) | 是 | - | 实例类型：`AGENT_RUNTIME` / `SELF_HOSTED` |
| `cluster_attribute` | json | 否 | NULL | 集群属性 JSON，包含 clusterId、clusterName、slbType、vpcId、mappingIP、mappingPort 等，方便后期扩展 |
| `api_server` | varchar(256) | 否 | NULL | K8s Master URL，从 KubeConfig 中解析提取 |
| `namespace` | varchar(128) | 否 | NULL | K8s Namespace，用户导入时选择 |
| `kube_config` | text | 否 | NULL | 完整的 KubeConfig 文本，包含集群连接所需的全部信息 |
| `description` | varchar(512) | 否 | NULL | 实例描述 |
| `extra_config` | json | 否 | NULL | 扩展配置 JSON，不同沙箱类型的特定参数，如 E2B 的 API Key、OpenSandbox 的 runtime 版本等 |
| `status` | varchar(32) | 是 | `'RUNNING'` | 实例状态：`RUNNING` / `STOPPED` / `ERROR` |
| `created_at` | datetime(3) | 否 | CURRENT_TIMESTAMP(3) | 创建时间 |
| `updated_at` | datetime(3) | 否 | CURRENT_TIMESTAMP(3) ON UPDATE | 更新时间，自动维护 |

## 索引

| 索引名 | 类型 | 字段 | 说明 |
|--------|------|------|------|
| `PRIMARY` | 主键 | `id` | 物理主键 |
| `uk_sandbox_id` | 唯一索引 | `sandbox_id` | 业务主键唯一 |
| `uk_admin_sandbox_name` | 唯一索引 | `admin_id`, `sandbox_name` | 同一管理员下实例名称不能重复 |
| `uk_api_server_namespace` | 唯一索引 | `api_server`, `namespace` | 同一集群同一 Namespace 不能重复导入 |
| `idx_admin_id` | 普通索引 | `admin_id` | 按管理员查询 |
| `idx_sandbox_type` | 普通索引 | `sandbox_type` | 按实例类型查询 |

## 建表 SQL

```sql
CREATE TABLE IF NOT EXISTS `sandbox_instance` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `sandbox_id` varchar(64) NOT NULL,
    `admin_id` varchar(64) NOT NULL,
    `sandbox_name` varchar(64) NOT NULL,
    `sandbox_type` varchar(32) NOT NULL COMMENT 'AGENT_RUNTIME / SELF_HOSTED',
    `cluster_attribute` json DEFAULT NULL COMMENT '集群属性JSON: clusterId, clusterName, slbType, vpcId, mappingIP, mappingPort等',
    `api_server` varchar(256) DEFAULT NULL,
    `namespace` varchar(128) DEFAULT NULL,
    `kube_config` text DEFAULT NULL,
    `description` varchar(512) DEFAULT NULL,
    `extra_config` json DEFAULT NULL COMMENT '扩展配置，不同sandbox类型的特定参数',
    `status` varchar(32) NOT NULL DEFAULT 'RUNNING' COMMENT 'RUNNING / STOPPED / ERROR',
    `created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_sandbox_id` (`sandbox_id`),
    UNIQUE KEY `uk_admin_sandbox_name` (`admin_id`, `sandbox_name`),
    UNIQUE KEY `uk_api_server_namespace` (`api_server`, `namespace`),
    KEY `idx_admin_id` (`admin_id`),
    KEY `idx_sandbox_type` (`sandbox_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## 枚举值参考

### `sandbox_type`
- `AGENT_RUNTIME` — AgentRuntime 实例
- `SELF_HOSTED` — 自建 Sandbox 实例

### `status`
- `RUNNING` — 运行中
- `STOPPED` — 已停止
- `ERROR` — 异常

## 唯一性约束说明

1. 同一管理员下不允许创建同名实例（`uk_admin_sandbox_name`）
2. 同一个 K8s 集群（apiServer）的同一个 Namespace 不允许重复导入（`uk_api_server_namespace`）
