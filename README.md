# WEBtrade-plus 项目技术架构报告

生产维护、备份结论、已完成发布和回滚步骤见 [主站维护记录](ops/MAINTENANCE.md)。维护版启动前须配置 `ADMIN_PASSWORD` 与 `PB_ADMIN_PASSWORD` 环境变量；依赖安装和前端构建在本地进行。

## 一、 系统概览

WEBtrade-plus 是一个面向海外（主打英国市场）的 B2B/B2C 电子元器件产品展示与推荐系统。系统采用了前后端分离的现代化 Web 架构，集成了基于大语言模型（LLM）的智能知识库客服功能，以及完善的后台产品管理系统（支持单件/批量上传）。

项目整体设计轻量、高效，适合部署在资源受限的服务器（如 2核2G Ubuntu）上，通过 SQLite 和本地向量 JSON 库实现了低内存消耗的数据存储。

## 二、 系统架构设计

### 1. 前端架构 (Frontend)
- **核心技术栈：** React 18 + Vite + TailwindCSS
- **状态管理：** React Hooks (useState, useEffect)
- **路由控制：** React Router DOM
- **UI 风格：** 响应式深蓝工业科技风，使用城市建筑背景及适配手机的压缩静态图片。
- **与后端通信：** 使用 `fetch` 和 Axios 与 BFF (Backend for Frontend) 层通信，配置请求复用短期缓存。

### 2. 后端架构 (Backend BFF层)
- **核心技术栈：** Node.js + Express
- **主要职责：** 
  - 作为前端和底层数据库之间的桥梁（BFF）。
  - 处理复杂的业务逻辑：如处理 CSV/ZIP 批量导入、图片解析。
  - **AI 模块代理：** 封装对阿里云百炼（DashScope）API 的调用，计算余弦相似度，避免前端暴露 API Key。
- **关键库：** `multer` (文件上传), `adm-zip` (解压), `csv-parse` (解析CSV), `openai` (兼容DashScope SDK)。

### 3. 数据层 (Database & Vector Store)
- **主数据库 (PocketBase)：**
  - 使用 Go 语言编写的轻量级单文件数据库系统，底层基于 SQLite (`pb_data/data.db`)。
  - 负责存储所有的产品信息、网站配置、图片文件和管理员账号。
  - 自带 REST API 接口，后端 Express 通过 HTTP 请求与其交互。
- **向量知识库 (Vector Store)：**
  - 极简的本地 JSON 存储方案（`backend/data/embeddings.json`）。
  - 在内存受限（2G）的服务器上，不使用 ChromaDB 等重型向量库，而是通过 Node.js 在内存中直接计算余弦相似度进行 RAG（检索增强生成）召回。

---

## 三、 目录结构与核心文件说明

### 1. 根目录结构
```text
/WEBtrade-plus
├── backend/            # 后端及数据库服务
├── frontend/           # 前端 React 源代码
├── scraped_data/       # 爬虫抓取的原始数据备用目录
├── start_website.bat   # Windows 环境本地一键启动脚本
└── DEPLOYMENT_UBUNTU24.md # Ubuntu 服务器生产环境部署文档
```

### 2. 前端核心文件 (`/frontend/src/`)
- **`App.jsx`**: 全局路由配置，挂载导航栏（`Navbar`）、底部（`Footer`）和全局悬浮的 AI 聊天组件（`AiChat`）。
- **`pages/Products.jsx`**: **核心业务页面**。提供全站搜索、分类筛选、每批 24 条的产品目录、可分享详情链接及询价跳转；短期内存快照帮助恢复列表和滚动位置。
- **`components/AiChat.jsx`**: **AI 聊天核心组件**。点击入口后按需加载面板，处理发送、字数与次数限制及请求冷却；收到回复后才加载 Markdown 渲染模块，加载失败时保留纯文本。

### 3. 后端核心文件 (`/backend/`)
- **`index.js`**: **后端核心入口文件**。
  - 包含 Express 服务器的初始化。
  - `POST /admin/api/bulk-import`: 处理产品的 CSV+ZIP 批量上传。
  - `GET /admin/api/kb/update`: 通过 SSE (Server-Sent Events) 向前端实时推送知识库更新进度。
  - `POST /api/chat`: 接收前端提问，读取 `embeddings.json` 计算相似度找寻相关产品，然后组装 Prompt 调用 `qwen3.5-flash` 进行回复。
- **`admin-mobile.html`**: **管理员后台界面**。这是一个独立渲染的 HTML 页面（非 React），提供了网站配置、产品增删改查、CSV批量导入、AI 提示词配置和知识库一键更新功能。
- **`bin/pocketbase.exe`**: 数据库主程序。
- **`pb_data/`**: 存放真实的 SQLite 数据库文件（`data.db`）和上传的图片资源。
- **`data/embeddings.json`**: 本地化轻量级向量知识库文件，存放所有产品的向量化数据。

---

## 四、 核心功能与接口 (API) 设计

### 1. AI 智能推荐对话 (RAG架构)
**功能流程：**
1. 管理员在后台配置所需的“对话模型”和“向量模型”（如未配置则使用默认值），并点击“更新知识库”。
2. 后端读取数据库中所有产品，调用配置的文本向量模型（如 `text-embedding-v3`）将产品标题和描述转化为向量，保存到 `embeddings.json`。
3. 用户在前台发送消息。
4. 后端再次调用 embedding API 向量化用户消息，与本地 JSON 中的产品向量进行 **Cosine Similarity (余弦相似度)** 计算。
5. 取出相似度最高的 Top 5 产品信息，作为上下文拼接进 System Prompt。
6. 调用配置的对话大模型（如 `qwen-plus`）生成回答并返回给前端。

**核心接口：**
- `POST /api/chat`：处理聊天请求，包含 IP 限流逻辑（1分钟冷却，3小时30次，24小时60次拉黑）。

### 2. 产品批量导入
**功能流程：**
1. 管理员上传一个包含产品字段的 `.csv` 文件和一个包含对应图片的 `.zip` 文件。
2. 后端使用 `multer` 接收文件，`adm-zip` 解压图片到临时目录，`csv-parse` 解析文本。
3. 自动匹配 CSV 中的图片 ID 与解压出来的图片文件，生成随机唯一的 `source_path` 避免数据库冲突。
4. 将数据批量写入 PocketBase。

**核心接口：**
- `POST /admin/api/bulk-import`：接收 `multipart/form-data`。

### 3. 实时知识库更新与 SSE
为了防止在生成大量产品向量时前端请求超时，并提供良好的用户体验，采用了 SSE 技术。
- `GET /admin/api/kb/update`
- 后端在 `index.js` 中使用 `res.write('data: ' + message + '\n\n')` 不断推送处理进度。前端在 `admin-mobile.html` 中通过 `EventSource` 监听实时日志。

---

## 五、 系统运行机制

本系统实际上同时运行了三个服务：
1. **PocketBase 数据库服务** (默认端口 `8090`)：负责底层数据 CRUD 和图片托管。
2. **Node.js BFF 代理服务** (默认端口 `3001`)：负责复杂业务逻辑、AI 代理、并托管前端静态文件和管理员 HTML。
3. **Vite 前端开发服务** (默认端口 `5173`，仅本地开发时使用)。

在生产环境中（如 Ubuntu），前端代码会被打包成静态文件交由 Node.js (或 Nginx) 统一代理，从而只需要对外暴露一个端口。

## 六、 第三方服务依赖
- **阿里云百炼 (DashScope) API**：
  - 系统支持在后台管理员界面动态配置大语言模型名称，参数将存储在 SQLite 数据库 `site_config` 中。
  - **默认对话模型**：`qwen-plus` 或 `qwen3.5-flash` (支持多轮对话与角色扮演)。
  - **默认文本向量模型**：`text-embedding-v3` (将文本转化为高维向量，用于语义搜索)。
  - **调用方式**：通过兼容 OpenAI 的 SDK 格式进行调用，`baseURL` 配置为 `https://dashscope.aliyuncs.com/compatible-mode/v1`。
