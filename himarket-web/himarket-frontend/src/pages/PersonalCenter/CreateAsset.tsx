import { useSearchParams, Navigate } from "react-router-dom";
import CreateMcpServer from "./CreateMcpServer";
import CreateSkill from "./CreateSkill";
import CreateWorker from "./CreateWorker";

/**
 * 创建资产路由分发器
 * 根据 URL 参数 type 展示不同的创建页面
 * /personal-center/create?type=MCP_SERVER → MCP Server 创建页
 * /personal-center/create?type=AGENT_SKILL → Skill 创建页
 * /personal-center/create?type=WORKER → Worker 创建页
 */
function CreateAsset() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type");

  switch (type) {
    case "MCP_SERVER":
      return <CreateMcpServer />;
    case "AGENT_SKILL":
      return <CreateSkill />;
    case "WORKER":
      return <CreateWorker />;
    default:
      // 没有 type 参数或无效类型，重定向回个人中心
      return <Navigate to="/personal-center" replace />;
  }
}

export default CreateAsset;
