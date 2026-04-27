import React, { useState, useEffect, useCallback } from "react";
import { Table, Tag, Button, Select, Space } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import {
  assetReviewApi,
  type AssetReviewItem,
  type AssetType,
} from "@/lib/assetReviewApi";
import dayjs from "dayjs";

const ASSET_TYPE_OPTIONS = [
  { label: "全部类型", value: "" },
  { label: "MCP Server", value: "MCP_SERVER" },
  { label: "Agent Skill", value: "AGENT_SKILL" },
  { label: "Worker", value: "WORKER" },
];

const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  MCP_SERVER: "MCP Server",
  AGENT_SKILL: "Agent Skill",
  WORKER: "Worker",
};

const ASSET_TYPE_COLOR: Record<AssetType, string> = {
  MCP_SERVER: "blue",
  AGENT_SKILL: "purple",
  WORKER: "cyan",
};

const ReviewList: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<AssetReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [typeFilter, setTypeFilter] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await assetReviewApi.listPendingReviews({
        page,
        size: pageSize,
      });
      const resData = res as unknown as {
        code: string;
        data: {
          content: AssetReviewItem[];
          totalElements: number;
        };
      };
      if (resData.code === "SUCCESS" && resData.data) {
        let items = resData.data.content || [];
        // 前端筛选类型（后端暂未支持 type 参数）
        if (typeFilter) {
          items = items.filter(item => item.type === typeFilter);
        }
        setData(items);
        setTotal(resData.data.totalElements || 0);
      }
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, typeFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columns: ColumnsType<AssetReviewItem> = [
    {
      title: "资产名称",
      dataIndex: "name",
      key: "name",
      render: (name: string, record) => (
        <div>
          <span className="font-medium">{name}</span>
          {record.isUpdateCopy && (
            <Tag color="orange" className="ml-2 text-xs">
              更新版本
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 140,
      render: (type: AssetType) => (
        <Tag color={ASSET_TYPE_COLOR[type]}>{ASSET_TYPE_LABEL[type]}</Tag>
      ),
    },
    {
      title: "提交者",
      dataIndex: "ownerName",
      key: "ownerName",
      width: 140,
    },
    {
      title: "提交时间",
      dataIndex: "submittedAt",
      key: "submittedAt",
      width: 180,
      render: (time: string) =>
        time ? dayjs(time).format("YYYY-MM-DD HH:mm") : "-",
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      render: (_, record) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/asset-reviews/${record.assetId}`)}
        >
          审核
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">资产审核</h2>
        <Space>
          <Select
            value={typeFilter}
            onChange={v => {
              setTypeFilter(v);
              setPage(0);
            }}
            options={ASSET_TYPE_OPTIONS}
            style={{ width: 160 }}
          />
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="assetId"
        loading={loading}
        pagination={{
          current: page + 1,
          pageSize,
          total,
          onChange: (p, ps) => {
            setPage(p - 1);
            setPageSize(ps);
          },
          showSizeChanger: true,
          showTotal: t => `共 ${t} 条`,
        }}
      />
    </div>
  );
};

export default ReviewList;
