import { useState, useEffect, useCallback } from 'react'
import { Button, Table, message, Modal, Tabs, Tag, Form, Input, Select, Steps, Result, Space, Tooltip, Checkbox } from 'antd'
import {
  PlusOutlined, ApiOutlined, CheckCircleOutlined, LoadingOutlined,
  EditOutlined, CloudServerOutlined, AppstoreOutlined, CloseCircleOutlined,
  ReloadOutlined, SyncOutlined, SettingOutlined,
} from '@ant-design/icons'
import { formatDateTime } from '@/lib/utils'
import { sandboxApi } from '@/lib/api'

// ==================== 类型定义 ====================

export type SandboxType = 'AGENT_RUNTIME' | 'SELF_HOSTED'

export interface SandboxInstance {
  sandboxId: string
  sandboxName: string
  sandboxType: SandboxType
  clusterAttribute?: string
  apiServer: string
  namespace: string
  description?: string
  extraConfig?: string
  status: 'RUNNING' | 'STOPPED' | 'ERROR'
  statusMessage?: string
  lastCheckedAt?: string
  createAt: string
}

interface ResourceSpec {
  cpuRequest?: string
  cpuLimit?: string
  memoryRequest?: string
  memoryLimit?: string
  ephemeralStorage?: string
}

interface ExtraConfig {
  resourceSpec?: ResourceSpec
  image?: string
  capabilities?: string[]
}

const CAPABILITY_OPTIONS = [
  { label: 'MCP 托管', value: 'MCP_HOSTING' },
  { label: 'Agent 托管', value: 'AGENT_HOSTING' },
  { label: 'Coding 环境', value: 'CODING' },
]

const RESOURCE_PRESETS = [
  { label: '小型 (0.5C1G)', cpuLimit: '500m', cpuRequest: '125m', memoryLimit: '1Gi', memoryRequest: '256Mi', storage: '1Gi' },
  { label: '中型 (2C4G)', cpuLimit: '2', cpuRequest: '500m', memoryLimit: '4Gi', memoryRequest: '1Gi', storage: '1Gi' },
  { label: '大型 (4C8G)', cpuLimit: '4', cpuRequest: '1', memoryLimit: '8Gi', memoryRequest: '2Gi', storage: '1Gi' },
]

function parseExtraConfig(raw?: string): ExtraConfig {
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

// ==================== 组件 ====================

export default function SandboxConsoles() {
  const [sandboxes, setSandboxes] = useState<SandboxInstance[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<SandboxType>('AGENT_RUNTIME')
  const [modalVisible, setModalVisible] = useState(false)
  const [editingSandbox, setEditingSandbox] = useState<SandboxInstance | null>(null)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [fetching, setFetching] = useState(false)
  const [clusterFetched, setClusterFetched] = useState(false)
  const [fetchFailed, setFetchFailed] = useState(false)
  const [namespaceList, setNamespaceList] = useState<string[]>([])
  const [importStep, setImportStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [checkingId, setCheckingId] = useState<string | null>(null)

  const isAgentRuntime = activeTab === 'AGENT_RUNTIME'
  // AGENT_RUNTIME: 3 steps (基本信息 → 连接集群 → 配置沙箱)
  // SELF_HOSTED:   3 steps (基本信息 → 连接集群 → 选择Namespace)

  const fetchList = useCallback(async (type: SandboxType, page = 1, size = 10) => {
    setLoading(true)
    try {
      const res: any = await sandboxApi.getSandboxes({ sandboxType: type, page: page - 1, size })
      const data = res.data || res
      setSandboxes(data.content || [])
      setPagination({ current: page, pageSize: size, total: data.totalElements || 0 })
    } catch {
      setSandboxes([])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchList(activeTab) }, [fetchList, activeTab])

  const handleTabChange = (key: string) => {
    setActiveTab(key as SandboxType)
    setPagination((prev) => ({ ...prev, current: 1 }))
  }

  const resetModalState = () => {
    setClusterFetched(false)
    setFetchFailed(false)
    setNamespaceList([])
    setImportStep(0)
  }

  const handleDelete = (record: SandboxInstance) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除 Sandbox 实例「${record.sandboxName}」吗？`,
      onOk: async () => {
        await sandboxApi.deleteSandbox(record.sandboxId)
        message.success('删除成功')
        fetchList(activeTab, pagination.current, pagination.pageSize)
      },
    })
  }

  const handleEdit = (record: SandboxInstance) => {
    setEditingSandbox(record)
    const extra = parseExtraConfig(record.extraConfig)
    form.setFieldsValue({
      sandboxName: record.sandboxName,
      namespace: record.namespace,
      description: record.description,
      image: extra.image,
      capabilities: extra.capabilities || [],
      cpuRequest: extra.resourceSpec?.cpuRequest,
      cpuLimit: extra.resourceSpec?.cpuLimit,
      memoryRequest: extra.resourceSpec?.memoryRequest,
      memoryLimit: extra.resourceSpec?.memoryLimit,
      ephemeralStorage: extra.resourceSpec?.ephemeralStorage,
    })
    setClusterFetched(true)
    setFetchFailed(false)
    setNamespaceList([record.namespace])
    // 编辑时直接跳到 namespace 步骤（step 2）
    setImportStep(2)
    setModalVisible(true)
  }

  const handleAdd = () => {
    setEditingSandbox(null)
    form.resetFields()
    resetModalState()
    setModalVisible(true)
  }

  const handleHealthCheck = async (record: SandboxInstance) => {
    setCheckingId(record.sandboxId)
    try {
      const res: any = await sandboxApi.healthCheck(record.sandboxId)
      const updated = res.data || res
      setSandboxes((prev) =>
        prev.map((s) => (s.sandboxId === record.sandboxId ? { ...s, ...updated } : s))
      )
      if (updated.status === 'RUNNING') {
        message.success(`${record.sandboxName} 连接正常`)
      } else {
        message.warning(`${record.sandboxName} 状态异常: ${updated.statusMessage || '未知错误'}`)
      }
    } catch {
      message.error('健康检查失败')
    } finally {
      setCheckingId(null)
    }
  }

  const handleFetchCluster = async () => {
    const kubeConfig = form.getFieldValue('kubeConfig')
    if (!kubeConfig) { message.warning('请先粘贴 KubeConfig'); return }
    setFetching(true)
    setClusterFetched(false)
    setFetchFailed(false)
    setNamespaceList([])
    form.setFieldsValue({ namespace: undefined })
    try {
      const res: any = await sandboxApi.fetchClusterInfo(kubeConfig)
      const result = res.data || res
      if (result.ok) {
        setClusterFetched(true)
        setNamespaceList(result.namespaces || [])
        setImportStep(2)
        message.success(`获取成功，发现 ${(result.namespaces || []).length} 个 Namespace`)
      } else {
        setFetchFailed(true)
        message.error(result.message || '获取集群信息失败，请检查 KubeConfig')
      }
    } catch {
      setFetchFailed(true)
      message.error('获取集群信息异常')
    } finally { setFetching(false) }
  }

  const applyResourcePreset = (preset: typeof RESOURCE_PRESETS[0]) => {
    form.setFieldsValue({
      cpuRequest: preset.cpuRequest,
      cpuLimit: preset.cpuLimit,
      memoryRequest: preset.memoryRequest,
      memoryLimit: preset.memoryLimit,
      ephemeralStorage: preset.storage,
    })
  }

  const handleModalOk = async () => {
    if (!clusterFetched) { message.warning('请先获取集群信息并选择 Namespace'); return }
    try {
      const values = form.getFieldsValue(true)
      setSubmitting(true)

      const resourceSpec = (values.cpuRequest || values.cpuLimit || values.memoryRequest || values.memoryLimit || values.ephemeralStorage)
        ? {
            cpuRequest: values.cpuRequest || undefined,
            cpuLimit: values.cpuLimit || undefined,
            memoryRequest: values.memoryRequest || undefined,
            memoryLimit: values.memoryLimit || undefined,
            ephemeralStorage: values.ephemeralStorage || undefined,
          }
        : undefined

      if (editingSandbox) {
        await sandboxApi.updateSandbox(editingSandbox.sandboxId, {
          sandboxName: values.sandboxName,
          kubeConfig: values.kubeConfig,
          namespace: values.namespace,
          description: values.description,
          resourceSpec,
          image: values.image || undefined,
          capabilities: values.capabilities?.length ? values.capabilities : undefined,
        })
        message.success('更新成功')
      } else {
        await sandboxApi.importSandbox({
          sandboxName: values.sandboxName,
          sandboxType: activeTab,
          kubeConfig: values.kubeConfig,
          namespace: values.namespace,
          description: values.description,
          resourceSpec,
          image: values.image || undefined,
          capabilities: values.capabilities?.length ? values.capabilities : undefined,
        })
        message.success('导入成功')
      }
      setModalVisible(false)
      form.resetFields()
      setEditingSandbox(null)
      resetModalState()
      fetchList(activeTab, pagination.current, pagination.pageSize)
    } catch { /* validation or API error */ }
    finally { setSubmitting(false) }
  }

  const handleModalCancel = () => {
    setModalVisible(false)
    form.resetFields()
    setEditingSandbox(null)
    resetModalState()
  }

  const statusTag = (status: SandboxInstance['status']) => {
    const map = {
      RUNNING: { color: 'green', text: '运行中' },
      STOPPED: { color: 'default', text: '已停止' },
      ERROR: { color: 'red', text: '异常' },
    }
    const s = map[status]
    return <Tag color={s.color}>{s.text}</Tag>
  }

  const capabilityLabel = (cap: string) => {
    const found = CAPABILITY_OPTIONS.find((c) => c.value === cap)
    return found ? found.label : cap
  }

  const columns = [
    {
      title: '实例名称/ID', key: 'nameAndId', width: 260,
      render: (_: any, record: SandboxInstance) => (
        <div>
          <div className="text-sm font-medium text-gray-900 truncate">{record.sandboxName}</div>
          <div className="text-xs text-gray-500 truncate">{record.sandboxId}</div>
        </div>
      ),
    },
    {
      title: 'API Server', dataIndex: 'apiServer', key: 'apiServer', ellipsis: true,
      render: (v: string) => <span className="text-xs font-mono">{v}</span>,
    },
    {
      title: 'Namespace', dataIndex: 'namespace', key: 'namespace', width: 140,
      render: (v: string) => <Tag className="m-0 font-mono">{v}</Tag>,
    },
    ...(isAgentRuntime ? [{
      title: '功能 / 规格', key: 'spec', width: 200,
      render: (_: any, record: SandboxInstance) => {
        const extra = parseExtraConfig(record.extraConfig)
        return (
          <div className="space-y-1">
            {extra.capabilities?.length ? (
              <div className="flex flex-wrap gap-1">
                {extra.capabilities.map((c) => <Tag key={c} color="blue" className="m-0 text-xs">{capabilityLabel(c)}</Tag>)}
              </div>
            ) : null}
            {extra.resourceSpec?.cpuLimit && (
              <div className="text-xs text-gray-500">{extra.resourceSpec.cpuLimit}C / {extra.resourceSpec.memoryLimit}</div>
            )}
            {extra.image && (
              <Tooltip title={extra.image}>
                <div className="text-xs text-gray-400 truncate max-w-[180px]">{extra.image.split('/').pop()}</div>
              </Tooltip>
            )}
          </div>
        )
      },
    }] : []),
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 160,
      render: (_: SandboxInstance['status'], record: SandboxInstance) => (
        <div>
          {statusTag(record.status)}
          {record.statusMessage && record.status === 'ERROR' && (
            <Tooltip title={record.statusMessage}>
              <div className="text-xs text-red-400 truncate mt-0.5 max-w-[140px] cursor-help">{record.statusMessage}</div>
            </Tooltip>
          )}
          {record.lastCheckedAt && (
            <div className="text-xs text-gray-400 mt-0.5">检查于 {formatDateTime(record.lastCheckedAt)}</div>
          )}
        </div>
      ),
    },
    {
      title: '创建时间', dataIndex: 'createAt', key: 'createAt', width: 180,
      render: (date: string) => formatDateTime(date),
    },
    {
      title: '操作', key: 'action', width: 200,
      render: (_: any, record: SandboxInstance) => (
        <>
          <Tooltip title="检查集群连通性">
            <Button
              type="link" size="small"
              icon={checkingId === record.sandboxId ? <SyncOutlined spin /> : <ReloadOutlined />}
              loading={checkingId === record.sandboxId}
              onClick={() => handleHealthCheck(record)}
            >检查</Button>
          </Tooltip>
          <Button type="link" onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" danger onClick={() => handleDelete(record)}>删除</Button>
        </>
      ),
    },
  ]

  const renderTable = () => (
    <Table
      columns={columns} dataSource={sandboxes} rowKey="sandboxId" loading={loading}
      pagination={{
        ...pagination, showSizeChanger: true, showQuickJumper: true,
        showTotal: (total: number) => `共 ${total} 条`,
        onChange: (page: number, size: number) => fetchList(activeTab, page, size),
        onShowSizeChange: (_: number, size: number) => fetchList(activeTab, 1, size),
      }}
    />
  )

  const tabItems = [
    {
      key: 'AGENT_RUNTIME', label: 'AgentRuntime',
      children: (
        <div className="bg-white rounded-lg">
          <div className="py-4 pl-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">AgentRuntime 实例</h3>
            <p className="text-sm text-gray-500 mt-1">导入 AgentRuntime 实例，用于 MCP Server 沙箱运行</p>
          </div>
          {renderTable()}
        </div>
      ),
    },
    {
      key: 'SELF_HOSTED', label: '自建 Sandbox',
      children: (
        <div className="bg-white rounded-lg">
          <div className="py-4 pl-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">自建 Sandbox 实例</h3>
            <p className="text-sm text-gray-500 mt-1">导入自建的 Sandbox 实例，用于自定义 MCP 运行环境</p>
          </div>
          {renderTable()}
        </div>
      ),
    },
  ]

  const stepItems = [
    { title: '基本信息', icon: <EditOutlined /> },
    { title: '连接集群', icon: <CloudServerOutlined /> },
    { title: isAgentRuntime ? '配置沙箱' : '选择 Namespace', icon: isAgentRuntime ? <SettingOutlined /> : <AppstoreOutlined /> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sandbox 实例</h1>
          <p className="text-gray-500 mt-2">管理和配置您的沙箱运行环境</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          导入{isAgentRuntime ? ' AgentRuntime' : ' Sandbox'} 实例
        </Button>
      </div>

      <Tabs activeKey={activeTab} onChange={handleTabChange} items={tabItems} />

      <Modal
        title={editingSandbox ? '编辑 Sandbox 实例' : `导入${isAgentRuntime ? ' AgentRuntime' : ' Sandbox'} 实例`}
        open={modalVisible}
        onCancel={handleModalCancel}
        footer={null}
        width={720}
        destroyOnClose
      >
        <Steps current={importStep} size="small" className="mt-2 mb-6 px-4" items={stepItems} />

        <Form form={form} layout="vertical" className="px-1" preserve>
          {/* ── Step 0: 基本信息 ── */}
          {importStep === 0 && (
            <div style={{ minHeight: 200 }}>
              <div className="text-sm text-gray-500 mb-4">为 Sandbox 实例设置一个名称，方便后续管理和识别。</div>
              <Form.Item name="sandboxName" label="实例名称" rules={[{ required: true, message: '请输入实例名称' }]}>
                <Input placeholder="例如：生产环境 AgentRuntime" size="large" />
              </Form.Item>
              <Form.Item name="description" label="描述（选填）">
                <Input.TextArea placeholder="简要描述该实例的用途" autoSize={{ minRows: 2, maxRows: 4 }} />
              </Form.Item>
            </div>
          )}

          {/* ── Step 1: 连接集群 ── */}
          {importStep === 1 && (
            <div style={{ minHeight: 200 }}>
              <div className="text-sm text-gray-500 mb-4">粘贴 Kubernetes 集群的 KubeConfig 文件内容，然后点击下方按钮验证连接。</div>
              <Form.Item name="kubeConfig" label="KubeConfig" rules={[{ required: true, message: '请粘贴 KubeConfig 内容' }]}>
                <Input.TextArea
                  placeholder={`apiVersion: v1\nclusters:\n- cluster:\n    server: https://your-k8s-api:6443\n  name: my-cluster\n...`}
                  autoSize={{ minRows: 10, maxRows: 18 }}
                  className="font-mono text-xs"
                  onChange={() => { setClusterFetched(false); setFetchFailed(false); setNamespaceList([]); form.setFieldsValue({ namespace: undefined }) }}
                />
              </Form.Item>
              {clusterFetched ? (
                <div className="flex items-center gap-2 text-green-600 text-sm"><CheckCircleOutlined /> 集群连接成功</div>
              ) : fetchFailed ? (
                <div className="flex items-center gap-2 text-red-500 text-sm"><CloseCircleOutlined /> 连接失败，请检查 KubeConfig</div>
              ) : null}
            </div>
          )}

          {/* ── Step 2: 配置沙箱 ── */}
          {importStep === 2 && (
            <div style={{ minHeight: 200 }}>
              {namespaceList.length > 0 ? (
                <>
                  <div className="text-sm text-gray-500 mb-4">
                    选择目标命名空间{isAgentRuntime ? '，并配置沙箱的资源规格与功能' : ''}。
                  </div>

                  <Form.Item name="namespace" label="Namespace" rules={[{ required: true, message: '请选择 Namespace' }]}>
                    <Select placeholder="请选择 Namespace" showSearch>
                      {namespaceList.map((ns) => <Select.Option key={ns} value={ns}>{ns}</Select.Option>)}
                    </Select>
                  </Form.Item>

                  {isAgentRuntime && (
                    <>
                      {/* 容器镜像 */}
                      <Form.Item name="image" label="容器镜像" rules={[{ required: true, message: '请输入容器镜像' }]}>
                        <Input placeholder="例如：registry.example.com/agent-runtime:latest" />
                      </Form.Item>

                      {/* 沙箱功能 */}
                      <Form.Item name="capabilities" label="沙箱功能">
                        <Checkbox.Group options={CAPABILITY_OPTIONS} />
                      </Form.Item>

                      {/* 资源规格 */}
                      <div className="border-t border-gray-100 mt-2 pt-3 mb-3">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-gray-700">资源规格</span>
                          <Space size={4}>
                            {RESOURCE_PRESETS.map((p) => (
                              <Button key={p.label} size="small" onClick={() => applyResourcePreset(p)}>{p.label}</Button>
                            ))}
                          </Space>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-4">
                        <Form.Item name="cpuRequest" label="CPU Request">
                          <Input placeholder="125m" />
                        </Form.Item>
                        <Form.Item name="cpuLimit" label="CPU Limit">
                          <Input placeholder="500m" />
                        </Form.Item>
                        <Form.Item name="memoryRequest" label="Memory Request">
                          <Input placeholder="256Mi" />
                        </Form.Item>
                        <Form.Item name="memoryLimit" label="Memory Limit">
                          <Input placeholder="1Gi" />
                        </Form.Item>
                      </div>
                      <Form.Item name="ephemeralStorage" label="临时存储空间" initialValue="1Gi">
                        <Input placeholder="1Gi" />
                      </Form.Item>
                    </>
                  )}
                </>
              ) : (
                <Result status="warning" title="未获取到 Namespace" subTitle="请返回上一步检查 KubeConfig 并重新获取集群信息" />
              )}
            </div>
          )}
        </Form>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
          <div>
            {importStep > 0 && !editingSandbox && (
              <Button onClick={() => setImportStep(importStep - 1)}>上一步</Button>
            )}
          </div>
          <Space>
            <Button onClick={handleModalCancel}>取消</Button>
            {importStep === 0 && (
              <Button type="primary" onClick={async () => {
                try { await form.validateFields(['sandboxName']); setImportStep(1) } catch { /* */ }
              }}>下一步</Button>
            )}
            {importStep === 1 && (
              <Button type="primary" icon={fetching ? <LoadingOutlined /> : <ApiOutlined />} loading={fetching} onClick={handleFetchCluster}>
                {clusterFetched ? '下一步' : '获取集群信息'}
              </Button>
            )}
            {importStep === 2 && (
              <Button type="primary" loading={submitting} onClick={async () => {
                try {
                  const fields = isAgentRuntime ? ['namespace', 'image'] : ['namespace']
                  await form.validateFields(fields)
                  handleModalOk()
                } catch { /* */ }
              }}>{editingSandbox ? '保存' : '确认导入'}</Button>
            )}
          </Space>
        </div>
      </Modal>
    </div>
  )
}
