# 实现计划：MCP 详情页重新设计

## 概述

重写 `McpMarketDetail.tsx` 组件，将渐变 Hero Banner 布局替换为 ModelScope 风格的简洁白色头部 + 左右分栏 + Tab 切换布局。所有改动集中在单个文件中。

## 任务

- [x] 1. 重写 Header 区域
  - [x] 1.1 移除渐变 Hero Banner，替换为白色/浅色卡片样式的 Header
    - 使用 flex 布局，左侧放置 MCP 图标、名称、Origin 标签、描述文本
    - 右侧放置订阅按钮（未订阅）或"已订阅"状态标识（已订阅）
    - 名称下方显示工具数量和创建日期元数据
    - 保留返回按钮在 Header 上方
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 8.1_

- [x] 2. 实现左右分栏布局与 Tab 切换
  - [x] 2.1 构建左右分栏主体结构
    - Left Panel 占 65% 宽度，Right Panel 占 35% 宽度
    - Right Panel 使用 sticky 定位
    - 使用 Ant Design Tabs 组件实现"介绍"和"工具列表"两个 Tab
    - 新增 `activeTab` state 控制 Tab 切换
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 实现介绍 Tab 内容
    - 展示 `cold.description` 内容
    - description 为空时显示"暂无详细介绍"占位文本
    - _Requirements: 4.1, 4.2_

  - [x] 2.3 实现工具列表 Tab（表格形式）
    - 使用 Ant Design Table 替代 Collapse 组件
    - 列：工具名称（font-mono 等宽字体）、描述
    - 支持展开行显示 inputSchema 参数详情
    - 表格上方显示工具总数
    - toolsConfig 为空或解析失败时显示空状态
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. 实现右侧面板
  - [x] 3.1 实现连接配置代码块
    - 未订阅时：显示占位配置 JSON（示例 URL），提示需要先订阅
    - 已订阅且有 mcpHot 端点：显示实际连接配置 JSON
    - JSON 格式：`{ "mcpServers": { "name": { "type": "sse", "url": "..." } } }`
    - 提供复制按钮，点击后复制到剪贴板并显示成功提示
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 3.2 实现基本信息卡片
    - 使用 Ant Design Descriptions 展示：来源、源类型、源地址、工具数量、创建日期、创建者
    - 源地址渲染为可点击外部链接，旁边提供复制按钮
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 4. 订阅交互与状态更新
  - [x] 4.1 确保订阅流程正确
    - 点击订阅按钮调用 API，成功后更新 `cold.subscribed` 和 `mcpHot` state
    - 订阅成功后 Header 按钮变为"已订阅"状态
    - 订阅成功后连接配置代码块立即更新为实际配置
    - 订阅中按钮显示 loading 状态
    - 订阅失败显示 message.error 错误提示
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 5. Checkpoint - 确保页面功能完整
  - 确保所有功能正常工作，如有问题请告知。

- [ ]* 6. 编写单元测试
  - [ ]* 6.1 编写 Header 渲染测试
    - 测试未订阅状态下显示订阅按钮
    - 测试已订阅状态下显示"已订阅"标识
    - _Requirements: 1.2, 1.3_

  - [ ]* 6.2 编写工具列表和空状态测试
    - 测试工具以表格形式展示
    - 测试 toolsConfig 为空时的空状态显示
    - _Requirements: 3.1, 3.4_

  - [ ]* 6.3 编写连接配置条件渲染测试
    - 测试未订阅时显示占位配置
    - 测试已订阅时显示实际配置
    - _Requirements: 5.1, 5.2_

  - [ ]* 6.4 编写属性测试：连接配置 JSON 格式
    - **Property 1: 连接配置 JSON 格式正确性**
    - 使用 fast-check 生成随机 MCP 名称和端点 URL
    - 验证生成的 JSON 对象结构符合 `{ mcpServers: { name: { type, url } } }` 规范
    - **Validates: Requirements 5.3**

- [ ] 7. Final Checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请告知。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加快 MVP 进度
- 所有改动集中在 `src/pages/McpMarketDetail.tsx` 单个文件
- 复用现有 API 和类型定义，不需要修改 `mcpMarket.ts`
- 属性测试验证连接配置 JSON 格式的通用正确性
