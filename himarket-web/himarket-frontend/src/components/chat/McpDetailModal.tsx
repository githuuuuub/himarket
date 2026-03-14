import { useEffect, useState } from "react";
import { Modal, Spin, Tag, Button, message, Select, Input, Tabs } from "antd";
import {
  AppstoreOutlined, ThunderboltOutlined,
  LinkOutlined, EditOutlined, CloseOutlined, CheckOutlined,
} from "@ant-design/icons";
import APIs from "../../lib/apis";
import type { IProductDetail, IMcpMeta, ISandboxSimple } from "../../lib/apis/product";
import { ProductIconRenderer } from "../icon/ProductIconRenderer";
import { getIconString } from "../../lib/iconUtils";

interface McpDetailModalProps {
  open: boolean;
  product: IProductDetail | null;
  onClose: () => void;
  /** 订阅成功后的回调（刷新外层订阅列表） */
  onSubscribed?: () => void;
}

function McpDetailModal({ open, product, onClose, onSubscribed }: McpDetailModalProps) {
  const [meta, setMeta] = useState<IMcpMeta | null>(null);
  const [loading, setLoading] = useState(false);

  // 订阅相关状态
  const [subscribed, setSubscribed] = useState(false);
  const [subscribedEndpoint, setSubscribedEndpoint] = useState<{
    endpointId: string; endpointUrl: string; protocol: string; subscribeParams: string;
  } | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState(false);

  // Remote 表单状态
  const [selectedSandbox, setSelectedSandbox] = useState<string>();
  const [sandboxList, setSandboxList] = useState<ISandboxSimple[]>([]);
  const [remoteTransport, setRemoteTransport] = useState<"sse" | "http">("sse");
  const [remoteAuthType, setRemoteAuthType] = useState<"none" | "bearer">("none");
  const [remoteParamValues, setRemoteParamValues] = useState<Record<string, string>>({});
  const [remoteConnecting, setRemoteConnecting] = useState(false);
  const [remoteEditing, setRemoteEditing] = useState(false);

  // 加载 meta + 订阅状态 + 沙箱列表
  useEffect(() => {
    if (!open || !product) {
      setMeta(null); setSubscribed(false); setSubscribedEndpoint(null);
      setRemoteEditing(false); return;
    }
    setLoading(true);
    const pid = product.productId;

    Promise.all([
      APIs.getProductMcpMeta(pid).catch(() => null),
      APIs.getMyEndpoints().catch(() => null),
      APIs.getActiveSandboxes().catch(() => null),
    ]).then(([metaRes, epRes, sbRes]) => {
      if (metaRes?.code === "SUCCESS" && metaRes.data?.length > 0) setMeta(metaRes.data[0]);
      if (epRes?.code === "SUCCESS" && epRes.data) {
        const myEp = epRes.data.find(ep => ep.productId === pid);
        if (myEp) {
          setSubscribed(true);
          setSubscribedEndpoint({
            endpointId: myEp.endpointId, endpointUrl: myEp.endpointUrl,
            protocol: myEp.protocol, subscribeParams: myEp.subscribeParams,
          });
          if (myEp.subscribeParams) {
            try {
              const p = JSON.parse(myEp.subscribeParams);
              if (p.sandboxId) setSelectedSandbox(p.sandboxId);
              if (p.transportType) setRemoteTransport(p.transportType);
              if (p.authType) setRemoteAuthType(p.authType);
              if (p.extraParams) setRemoteParamValues(p.extraParams);
            } catch { /* ignore */ }
          }
        }
      }
      if (sbRes?.code === "SUCCESS" && sbRes.data) setSandboxList(sbRes.data);
    }).finally(() => setLoading(false));
  }, [open, product?.productId]);

  if (!product) return null;

  const displayName = meta?.displayName || meta?.mcpName || product.name;
  const description = meta?.description || product.description || "";
  const protocolType = meta?.protocolType || "";
  const origin = meta?.origin || "";

  const extraParams: Array<{ key: string; name: string; position: string; required: boolean; description: string; example: string }> = (() => {
    if (!meta?.extraParams) return [];
    try { const p = JSON.parse(meta.extraParams); return Array.isArray(p) ? p : []; } catch { return []; }
  })();

  const protocols = protocolType ? protocolType.toLowerCase().split(",").map(p => p.trim()).filter(Boolean) : [];
  const hasStdio = protocols.includes("stdio");
  const hasSse = protocols.includes("sse");
  const hasHttp = protocols.includes("http");
  const hasNetworkProtocol = hasSse || hasHttp;
  const isGatewayOrNacos = origin === "GATEWAY" || origin === "NACOS";

  // SSE/HTTP 直接订阅
  const handleSubscribe = async () => {
    if (!product) return;
    setSubscribing(true);
    try {
      const res = await APIs.subscribeMcp(product.productId);
      if (res.code === "SUCCESS" && res.data) {
        setSubscribed(true);
        setSubscribedEndpoint({ endpointId: res.data.endpointId, endpointUrl: res.data.endpointUrl, protocol: res.data.protocol, subscribeParams: res.data.subscribeParams });
        message.success("订阅成功");
        onSubscribed?.();
      } else { message.error("订阅失败"); }
    } catch { message.error("订阅失败"); }
    finally { setSubscribing(false); }
  };

  // Remote 订阅（通过沙箱）
  const handleRemoteConnect = async () => {
    if (!selectedSandbox) { message.warning("请选择沙箱"); return; }
    const missing = extraParams.filter(p => p.required && !remoteParamValues[p.name]?.trim());
    if (missing.length > 0) { message.warning(`请填写必填参数：${missing.map(p => p.name).join("、")}`); return; }
    setRemoteConnecting(true);
    try {
      const paramsJson = extraParams.length > 0 ? JSON.stringify(remoteParamValues) : undefined;
      const res = await APIs.subscribeMcp(product!.productId, { sandboxId: selectedSandbox, transportType: remoteTransport, authType: remoteAuthType, params: paramsJson });
      if (res.code === "SUCCESS" && res.data) {
        setSubscribed(true); setRemoteEditing(false);
        setSubscribedEndpoint({ endpointId: res.data.endpointId, endpointUrl: res.data.endpointUrl, protocol: res.data.protocol, subscribeParams: res.data.subscribeParams });
        message.success("订阅成功");
        onSubscribed?.();
      } else { message.error("订阅失败"); }
    } catch { message.error("订阅失败"); }
    finally { setRemoteConnecting(false); }
  };

  // 取消订阅
  const handleUnsubscribe = async () => {
    if (!subscribedEndpoint?.endpointId) return;
    setUnsubscribing(true);
    try {
      const res = await APIs.unsubscribeMcp(subscribedEndpoint.endpointId);
      if (res.code === "SUCCESS") {
        setSubscribed(false); setSubscribedEndpoint(null); setRemoteEditing(false);
        message.success("已取消订阅");
        onSubscribed?.();
      } else { message.error("取消订阅失败"); }
    } catch { message.error("取消订阅失败"); }
    finally { setUnsubscribing(false); }
  };

  // Remote tab 渲染
  const renderRemoteTab = () => {
    if (subscribed && !remoteEditing) {
      return (
        <div className="space-y-3">
          {subscribedEndpoint?.endpointUrl && (
            <div className="text-xs font-mono text-gray-500 bg-gray-50 rounded-lg p-2 break-all">
              {subscribedEndpoint.endpointUrl}
            </div>
          )}
          <div className="flex gap-2">
            <Button size="small" danger loading={unsubscribing} onClick={handleUnsubscribe} block>取消订阅</Button>
            <Button size="small" icon={<EditOutlined />} onClick={() => setRemoteEditing(true)} block>修改</Button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div>
          <div className="text-xs text-gray-500 mb-1">选择沙箱</div>
          <Select value={selectedSandbox} onChange={v => setSelectedSandbox(v)} placeholder="请选择沙箱实例" size="small" className="w-full"
            notFoundContent="暂无可用沙箱"
            options={sandboxList.map(s => ({ value: s.sandboxId, label: s.sandboxName }))} />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">传输类型</div>
          <Select value={remoteTransport} onChange={v => setRemoteTransport(v)} size="small" className="w-full"
            options={[{ value: "sse", label: "SSE" }, { value: "http", label: "Streamable HTTP" }]} />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">鉴权方式</div>
          <Select value={remoteAuthType} onChange={v => setRemoteAuthType(v)} size="small" className="w-full"
            options={[{ value: "none", label: "无鉴权" }, { value: "bearer", label: "Bearer Token", disabled: true }]} />
        </div>
        {extraParams.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1">参数配置</div>
            <div className="space-y-2">
              {extraParams.map(p => (
                <div key={p.name}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-xs text-gray-600 font-mono">{p.name}</span>
                    {p.required && <span className="text-red-400 text-xs">*</span>}
                  </div>
                  {p.description && <div className="text-[10px] text-gray-400 mb-0.5">{p.description}</div>}
                  <Input size="small" placeholder={p.example || `请输入 ${p.name}`} value={remoteParamValues[p.name] || ""}
                    onChange={e => setRemoteParamValues(prev => ({ ...prev, [p.name]: e.target.value }))} className="font-mono text-xs" />
                </div>
              ))}
            </div>
          </div>
        )}
        {remoteEditing ? (
          <div className="flex gap-2">
            <Button size="small" icon={<CloseOutlined />} onClick={() => setRemoteEditing(false)} block>取消</Button>
            <Button type="primary" size="small" icon={<CheckOutlined />} loading={remoteConnecting} onClick={handleRemoteConnect} block>确认修改</Button>
          </div>
        ) : (
          <Button type="primary" size="small" icon={<ThunderboltOutlined />} loading={remoteConnecting} onClick={handleRemoteConnect} block>订阅</Button>
        )}
        {remoteConnecting && <div className="text-xs text-gray-400 text-center animate-pulse">正在部署中，请稍候...</div>}
      </div>
    );
  };

  // 构建连接配置 tab
  const buildTabItems = () => {
    const items: { key: string; label: string; children: React.ReactNode }[] = [];
    if (hasStdio || meta?.sandboxRequired) {
      items.push({ key: "remote", label: "Remote", children: renderRemoteTab() });
    }
    if (hasSse) {
      items.push({ key: "sse", label: "SSE", children: subscribed || isGatewayOrNacos
        ? <div className="text-xs font-mono text-gray-500 bg-gray-50 rounded-lg p-2 break-all">{subscribedEndpoint?.endpointUrl || "订阅后获取"}</div>
        : <p className="text-xs text-gray-400 py-2">订阅后即可获取连接配置</p> });
    }
    if (hasHttp) {
      items.push({ key: "http", label: "Streamable HTTP", children: subscribed || isGatewayOrNacos
        ? <div className="text-xs font-mono text-gray-500 bg-gray-50 rounded-lg p-2 break-all">{subscribedEndpoint?.endpointUrl || "订阅后获取"}</div>
        : <p className="text-xs text-gray-400 py-2">订阅后即可获取连接配置</p> });
    }
    return items;
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={520} destroyOnClose closable title={null}>
      {loading ? (
        <div className="flex justify-center py-12"><Spin size="large" /></div>
      ) : (
        <div className="space-y-4">
          {/* 紧凑 Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {meta?.icon || product.icon ? (
                <ProductIconRenderer className="w-full h-full object-cover" iconType={getIconString(meta?.icon ? { type: "URL", value: meta.icon } : product.icon)} />
              ) : (
                <AppstoreOutlined className="text-purple-500 text-lg" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold text-gray-900 truncate">{displayName}</div>
              {meta?.mcpName && <div className="text-[11px] text-gray-400 font-mono truncate">{meta.mcpName}</div>}
            </div>
          </div>

          {description && <p className="text-xs text-gray-500 leading-relaxed">{description}</p>}

          {/* 连接配置区域 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
              <LinkOutlined className="text-green-500" />连接配置
            </h3>
            {protocols.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-4">暂无连接配置信息</div>
            ) : (
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  {protocols.map(p => (
                    <Tag key={p} className="m-0 border-0 bg-gray-100 text-gray-600 text-xs">{p.toUpperCase()}</Tag>
                  ))}
                  {subscribed && <Tag color="green" className="m-0 border-0">已订阅</Tag>}
                </div>
                <Tabs size="small" defaultActiveKey={buildTabItems()[0]?.key} items={buildTabItems()} />
                {/* SSE/HTTP 的订阅按钮 */}
                {hasNetworkProtocol && !hasStdio && !meta?.sandboxRequired && (
                  <div className="mt-2">
                    {!subscribed ? (
                      <Button type="primary" size="small" icon={<ThunderboltOutlined />} loading={subscribing} onClick={handleSubscribe} block>订阅</Button>
                    ) : (
                      <Button size="small" danger loading={unsubscribing} onClick={handleUnsubscribe} block>取消订阅</Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default McpDetailModal;
