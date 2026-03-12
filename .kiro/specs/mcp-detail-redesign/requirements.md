# 需求文档

## 简介

重新设计 MCP 详情页（McpMarketDetail），参考 ModelScope MCP 详情页风格，将现有的渐变 Hero Banner 布局替换为简洁的白色头部 + 左右分栏 + Tab 切换的布局。主要改动包括：头部区域简化、左侧 Tab 内容区（介绍/工具列表）、右侧固定连接配置和基本信息卡片、以及订阅/取消订阅交互优化。

## 术语表

- **Detail_Page**: MCP 详情页组件（McpMarketDetail.tsx），展示单个 MCP 的完整信息
- **Header_Section**: 详情页顶部区域，展示 MCP 图标、名称、来源标签、描述和订阅按钮
- **Left_Panel**: 左侧内容区域（约 65% 宽度），包含 Tab 切换的介绍和工具列表
- **Right_Panel**: 右侧信息区域（约 35% 宽度），包含连接配置代码块和基本信息卡片
- **Tools_Tab**: 工具列表 Tab，以表格形式展示 MCP 提供的工具
- **Intro_Tab**: 介绍 Tab，展示 MCP 的描述信息
- **Config_Block**: 连接配置代码块，展示 JSON 格式的 MCP 连接信息
- **Info_Card**: 基本信息卡片，展示来源、源类型、源地址等元数据
- **IMcpCold**: MCP 冷数据接口类型，包含 MCP 的基本信息
- **IMcpHot**: MCP 热数据接口类型，包含 MCP 的运行时连接信息
- **Origin_Tag**: 来源标签，标识 MCP 的来源类型（官方/网关/社区/第三方）

## 需求

### 需求 1：头部区域重新设计

**用户故事：** 作为用户，我希望看到一个简洁清晰的 MCP 头部信息区域，以便快速了解 MCP 的基本信息并进行订阅操作。

#### 验收标准

1. WHEN Detail_Page 加载完成, THE Header_Section SHALL 以白色/浅色背景展示 MCP 图标、名称、Origin_Tag、描述文本
2. WHEN Detail_Page 展示未订阅的 MCP, THE Header_Section SHALL 在右侧显示"订阅"按钮
3. WHEN Detail_Page 展示已订阅的 MCP, THE Header_Section SHALL 在右侧显示"已订阅"状态标识替代订阅按钮
4. THE Header_Section SHALL 在名称下方展示工具数量和创建日期作为元数据信息
5. THE Header_Section SHALL 移除现有的渐变 Hero Banner 样式，使用简洁的白色/浅色卡片样式

### 需求 2：左右分栏布局与 Tab 切换

**用户故事：** 作为用户，我希望通过 Tab 切换查看 MCP 的介绍和工具列表，同时右侧始终显示连接配置信息，以便高效获取所需信息。

#### 验收标准

1. THE Detail_Page SHALL 采用左右分栏布局，Left_Panel 占约 65% 宽度，Right_Panel 占约 35% 宽度
2. THE Left_Panel SHALL 包含"介绍"和"工具列表"两个 Tab 页签
3. WHEN 用户切换 Left_Panel 的 Tab, THE Right_Panel SHALL 保持内容不变
4. THE Right_Panel SHALL 以 sticky 定位方式固定在视口中，跟随页面滚动保持可见

### 需求 3：工具列表 Tab

**用户故事：** 作为用户，我希望以表格形式查看 MCP 提供的所有工具及其参数信息，以便了解 MCP 的能力。

#### 验收标准

1. THE Tools_Tab SHALL 以表格形式展示工具列表，包含工具名称（等宽字体）和描述两列
2. WHEN 工具包含 inputSchema 参数信息, THE Tools_Tab SHALL 支持展开行显示参数详情
3. THE Tools_Tab SHALL 在表格上方显示工具总数
4. WHEN toolsConfig 为空或解析失败, THE Tools_Tab SHALL 显示"暂无工具信息"的空状态提示

### 需求 4：介绍 Tab

**用户故事：** 作为用户，我希望在介绍 Tab 中查看 MCP 的详细描述信息。

#### 验收标准

1. THE Intro_Tab SHALL 展示 MCP 的 description 字段内容
2. WHEN description 为空, THE Intro_Tab SHALL 显示"暂无详细介绍"的占位文本

### 需求 5：连接配置代码块

**用户故事：** 作为用户，我希望在详情页右侧始终看到连接配置信息，以便快速获取 MCP 的接入方式。

#### 验收标准

1. WHEN MCP 未被订阅, THE Config_Block SHALL 显示包含示例 URL 的占位配置，并提示用户需要先订阅
2. WHEN MCP 已被订阅且存在 mcpHot 端点信息, THE Config_Block SHALL 以 JSON 格式展示实际的连接配置
3. THE Config_Block SHALL 以 `{ "mcpServers": { "name": { "type": "sse", "url": "..." } } }` 的 JSON 格式展示配置
4. THE Config_Block SHALL 提供复制按钮，允许用户一键复制配置内容
5. WHEN 用户点击复制按钮, THE Config_Block SHALL 将配置内容复制到剪贴板并显示成功提示

### 需求 6：基本信息卡片

**用户故事：** 作为用户，我希望在右侧查看 MCP 的详细元数据信息，以便了解 MCP 的来源和技术细节。

#### 验收标准

1. THE Info_Card SHALL 展示以下信息：来源（Origin_Tag）、源类型、源地址（可复制）、工具数量、创建日期、创建者
2. WHEN 源地址存在, THE Info_Card SHALL 将源地址渲染为可点击的外部链接
3. WHEN 源地址存在, THE Info_Card SHALL 在源地址旁提供复制按钮

### 需求 7：详情页内订阅与取消订阅

**用户故事：** 作为用户，我希望在详情页内直接完成订阅操作，并在订阅后立即看到连接配置更新。

#### 验收标准

1. WHEN 用户点击订阅按钮, THE Detail_Page SHALL 调用订阅 API 并在成功后将按钮状态更新为"已订阅"
2. WHEN 订阅成功, THE Config_Block SHALL 立即更新为实际的连接配置信息
3. WHILE 订阅请求正在处理中, THE Header_Section SHALL 将订阅按钮显示为加载状态
4. IF 订阅请求失败, THEN THE Detail_Page SHALL 显示错误提示信息并保持原有状态

### 需求 8：页面导航与返回

**用户故事：** 作为用户，我希望能从详情页方便地返回 MCP 广场。

#### 验收标准

1. THE Detail_Page SHALL 在页面顶部提供返回按钮，点击后导航回上一页
2. WHEN 从 McpSquare 页面的"我的MCP"Tab 或"MCP广场"Tab 点击卡片进入, THE Detail_Page SHALL 正确加载对应 MCP 的详情数据
