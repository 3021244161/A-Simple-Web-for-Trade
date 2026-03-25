# Tasks

- [x] Task 1: 升级数据库 Schema 与配置字段
  - [x] SubTask 1.1: 修改 `backend/initPocketBase.js`，在 `site_config` 中增加 `dashscope_api_key` 和 `ai_system_prompt` 字段。
  - [x] SubTask 1.2: 在 `backend/initPocketBase.js` 中新增 `banned_ips` 集合，字段为 `ip` (text, unique) 和 `reason` (text)。
  - [x] SubTask 1.3: 运行 `node backend/initPocketBase.js` 更新数据库。

- [x] Task 2: 后端安装依赖并实现封禁与限流逻辑
  - [x] SubTask 2.1: 在后端安装 `openai` (用于调用百炼 API) 和 `express-rate-limit`。
  - [x] SubTask 2.2: 在 `backend/index.js` 中实现基于内存和 PocketBase 的高级限流中间件 (3小时30次限制，24小时60次永久封禁至 `banned_ips`)。

- [x] Task 3: 实现轻量级知识库与 Embedding 同步接口
  - [x] SubTask 3.1: 在 `backend/index.js` 新增 `/admin/api/kb/update` 接口。
  - [x] SubTask 3.2: 该接口遍历数据库产品，对比本地文件 (如 `backend/data/embeddings.json`)，筛选出增量产品。
  - [x] SubTask 3.3: 调用阿里云 `text-embedding-v4` 对增量产品标题和描述进行向量化，追加保存到本地 JSON 文件中。

- [x] Task 4: 实现大模型流式对话接口
  - [x] SubTask 4.1: 在 `backend/index.js` 新增 `/api/chat` 接口，支持 SSE (Server-Sent Events) 流式响应。
  - [x] SubTask 4.2: 接口内计算用户问题的向量，使用余弦相似度匹配出最相关的 Top 5 产品。
  - [x] SubTask 4.3: 构建包含相关产品信息的 Prompt，调用阿里云 `qwen3.5-flash` 进行对话生成并流式返回给前端。

- [x] Task 5: 管理员后台界面更新
  - [x] SubTask 5.1: 在 `backend/admin-mobile.html` 的站点配置中增加 DashScope API Key 和 System Prompt 的输入框。
  - [x] SubTask 5.2: 增加一个独立的“更新知识库”卡片和按钮，点击调用同步接口并显示进度/结果。

- [x] Task 6: 前端 AI Chat 组件开发与集成
  - [x] SubTask 6.1: 前端安装 `react-markdown` 依赖。
  - [x] SubTask 6.2: 创建 `frontend/src/components/AiChat.jsx` 组件，包含 3D 悬浮粒子按钮 (位于返回顶部按钮左侧) 和占据屏幕下半部的紫蓝色圆角对话框。
  - [x] SubTask 6.3: 实现对话逻辑：流式接收文本并 Markdown 渲染，字体大小适配商品字体；单次会话上限 10 条；每次发送后强制 2 分钟冷却倒计时（底部小字提示）；点击对话框外部收起。
  - [x] SubTask 6.4: 将 `AiChat` 组件全局引入到 `frontend/src/App.jsx` 中。

# Task Dependencies
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 2] and [Task 3]
- [Task 5] depends on [Task 1] and [Task 3]
- [Task 6] depends on [Task 4]