import { useState, useEffect, useCallback } from "react";
import {
  Button,
  Form,
  Input,
  Select,
  Upload,
  message,
  Card,
  Space,
  Spin,
} from "antd";
import {
  ArrowLeftOutlined,
  UploadOutlined,
  PlusOutlined,
  MinusCircleOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "../../components/Layout";
import {
  getAsset,
  updateAsset,
  uploadPackage,
  type DeveloperAsset,
} from "../../lib/apis/developerAssetApi";

const PROTOCOL_OPTIONS = [
  { label: "SSE", value: "sse" },
  { label: "HTTP (Streamable)", value: "http" },
  { label: "Stdio", value: "stdio" },
];

function EditAsset() {
  const navigate = useNavigate();
  const { assetId } = useParams<{ assetId: string }>();
  const [form] = Form.useForm();
  const [asset, setAsset] = useState<DeveloperAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const fetchAsset = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    try {
      const res = await getAsset(assetId);
      if (res.code === "SUCCESS" && res.data) {
        const data = res.data;
        setAsset(data);

        // 预填表单
        const config = data.config || {};
        form.setFieldsValue({
          description: config.description || "",
          icon: config.icon || "",
        });

        if (data.type === "MCP_SERVER") {
          form.setFieldsValue({
            protocolType: config.protocolType || "",
            url: config.url || "",
            headers: config.headers
              ? Object.entries(config.headers).map(([key, value]) => ({
                  key,
                  value,
                }))
              : [],
          });
        }
      }
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [assetId, form]);

  useEffect(() => {
    fetchAsset();
  }, [fetchAsset]);

  const handleSubmit = async () => {
    if (!assetId || !asset) return;
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const config: Record<string, unknown> = {
        description: values.description || "",
        icon: values.icon || "",
      };

      if (asset.type === "MCP_SERVER") {
        config.protocolType = values.protocolType;
        config.url = values.url;
        if (values.headers && values.headers.length > 0) {
          const headers: Record<string, string> = {};
          values.headers.forEach((h: { key: string; value: string }) => {
            if (h.key) headers[h.key] = h.value || "";
          });
          config.headers = headers;
        }
      }

      await updateAsset(assetId, {
        description: values.description,
        icon: values.icon,
        config,
      });

      // 如果有新的 ZIP 包上传
      if (
        (asset.type === "AGENT_SKILL" || asset.type === "WORKER") &&
        fileList.length > 0 &&
        fileList[0].originFileObj
      ) {
        try {
          await uploadPackage(assetId, fileList[0].originFileObj as File);
        } catch {
          message.warning("资产已更新，但文件上传失败，请重试");
          navigate(`/personal-center/${assetId}`);
          return;
        }
      }

      message.success("更新成功");
      navigate(`/personal-center/${assetId}`);
    } catch {
      // form validation error
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-[calc(100vh-96px)]">
          <Spin size="large" />
        </div>
      </Layout>
    );
  }

  if (!asset) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[calc(100vh-96px)]">
          <span className="text-gray-400">资产不存在</span>
          <Button type="link" onClick={() => navigate("/personal-center")}>
            返回列表
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-96px)] overflow-auto scrollbar-hide">
        <div className="flex-shrink-0 px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/personal-center/${assetId}`)}
              className="rounded-xl"
            />
            <span className="text-lg font-medium text-gray-900">编辑资产</span>
          </div>
        </div>

        <div className="flex-1 px-6 pb-8">
          <Card className="max-w-2xl mx-auto rounded-xl">
            <Form form={form} layout="vertical" requiredMark="optional">
              {/* 名称（只读） */}
              <Form.Item label="资产名称">
                <Input value={asset.name} disabled />
              </Form.Item>

              {/* 类型（只读） */}
              <Form.Item label="资产类型">
                <Input
                  value={
                    asset.type === "MCP_SERVER"
                      ? "MCP Server"
                      : asset.type === "AGENT_SKILL"
                        ? "Agent Skill"
                        : "Worker"
                  }
                  disabled
                />
              </Form.Item>

              <Form.Item label="描述" name="description">
                <Input.TextArea rows={3} placeholder="描述资产的功能和用途" />
              </Form.Item>

              <Form.Item label="图标 URL" name="icon">
                <Input placeholder="可选，输入图标 URL" />
              </Form.Item>

              {/* MCP_SERVER 配置 */}
              {asset.type === "MCP_SERVER" && (
                <>
                  <Form.Item
                    label="协议类型"
                    name="protocolType"
                    rules={[
                      {
                        required: true,
                        message: "请选择协议类型",
                      },
                    ]}
                  >
                    <Select
                      placeholder="选择协议类型"
                      options={PROTOCOL_OPTIONS}
                    />
                  </Form.Item>

                  <Form.Item
                    label="服务地址"
                    name="url"
                    rules={[
                      {
                        required: true,
                        message: "请输入服务地址",
                      },
                    ]}
                  >
                    <Input placeholder="例如 https://example.com/mcp/sse" />
                  </Form.Item>

                  <Form.Item label="自定义 Headers">
                    <Form.List name="headers">
                      {(fields, { add, remove }) => (
                        <>
                          {fields.map(({ key, name, ...rest }) => (
                            <Space
                              key={key}
                              className="flex mb-2"
                              align="baseline"
                            >
                              <Form.Item
                                {...rest}
                                name={[name, "key"]}
                                className="mb-0"
                              >
                                <Input placeholder="Header Key" />
                              </Form.Item>
                              <Form.Item
                                {...rest}
                                name={[name, "value"]}
                                className="mb-0"
                              >
                                <Input placeholder="Header Value" />
                              </Form.Item>
                              <MinusCircleOutlined
                                onClick={() => remove(name)}
                                className="text-gray-400 hover:text-red-500"
                              />
                            </Space>
                          ))}
                          <Button
                            type="dashed"
                            onClick={() => add()}
                            block
                            icon={<PlusOutlined />}
                          >
                            添加 Header
                          </Button>
                        </>
                      )}
                    </Form.List>
                  </Form.Item>
                </>
              )}

              {/* AGENT_SKILL / WORKER 文件上传 */}
              {(asset.type === "AGENT_SKILL" || asset.type === "WORKER") && (
                <Form.Item
                  label="重新上传 ZIP 包"
                  extra={
                    asset.config?.nacos?.skillName ||
                    asset.config?.nacos?.agentSpecName
                      ? `当前已上传: ${asset.config?.nacos?.skillName || asset.config?.nacos?.agentSpecName}`
                      : "尚未上传文件包"
                  }
                >
                  <Upload
                    fileList={fileList}
                    beforeUpload={file => {
                      const isZip =
                        file.type === "application/zip" ||
                        file.type === "application/x-zip-compressed" ||
                        file.name.endsWith(".zip");
                      if (!isZip) {
                        message.error("只支持 ZIP 格式文件");
                        return Upload.LIST_IGNORE;
                      }
                      setFileList([file]);
                      return false;
                    }}
                    onRemove={() => setFileList([])}
                    maxCount={1}
                    accept=".zip"
                  >
                    <Button icon={<UploadOutlined />}>选择文件</Button>
                  </Upload>
                </Form.Item>
              )}

              <Form.Item className="mt-6">
                <Space>
                  <Button
                    type="primary"
                    onClick={handleSubmit}
                    loading={submitting}
                  >
                    保存
                  </Button>
                  <Button
                    onClick={() => navigate(`/personal-center/${assetId}`)}
                  >
                    取消
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

export default EditAsset;
