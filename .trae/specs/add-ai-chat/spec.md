# AI Chat Assistant Spec

## Why
提供一个智能的产品推荐助手，用户可以通过自然语言描述需求，系统基于本地知识库自动匹配最相关的电子元器件产品并进行解答，从而提升用户体验和转化率。

## What Changes
- 在网页全局右下角增加一个 3D 动态悬浮、带粒子效果的 AI 对话按钮（与“回到顶部”按钮同大小，位于其左侧）。
- 增加一个悬浮聊天窗口，点击按钮后在屏幕下方展开，占据屏幕一半面积，圆角设计，颜色为稍带紫色的蓝色。
- 实现聊天流式输出 (Streaming) 并支持 Markdown 格式渲染，字体大小与商品字体保持一致。
- 实施严格的对话限制：单次会话最多 10 次发送，每次发送间隔 2 分钟；同 IP 在 3 小时内最多 30 次请求，24 小时内超 60 次则永久封禁。
- 在管理员后台增加“一键更新知识库”功能：调用阿里云 `text-embedding-v4` 接口，仅针对未向量化的产品进行增量更新。
- 后端新增基于余弦相似度的纯内存轻量级向量检索，并调用 `qwen3.5-flash` 接口结合检索结果生成回复。
- 在管理员后台增加 AI 系统提示词 (System Prompt) 与 API Key 的配置。

## Impact
- Affected specs: 页面全局 Layout (添加悬浮组件), 移动端与桌面端交互, 后端接口 (新增 `/api/chat` 和 `/admin/api/kb/update`), 数据库 Schema (新增 `banned_ips` 表和 `site_config` 新字段)。
- Affected code: 
  - `frontend/src/App.jsx`
  - `frontend/src/components/AiChat.jsx` (新建)
  - `frontend/src/index.css`
  - `backend/index.js`
  - `backend/initPocketBase.js`
  - `backend/admin-mobile.html`

## ADDED Requirements
### Requirement: 智能对话 UI
系统必须在所有页面右下角提供一个 3D 粒子效果的悬浮对话按钮，点击可打开聊天框。
#### Scenario: 基础交互
- **WHEN** 用户点击 AI 悬浮按钮
- **THEN** 从下方弹出占据半屏的聊天框，初始包含一句“Hello！welcome ~”。
- **WHEN** 用户点击聊天框外部
- **THEN** 聊天框收起，且再次打开时对话状态保留（刷新页面后才重置）。

### Requirement: 对话与知识库检索
系统必须根据用户的提问检索知识库，并利用大模型生成产品推荐。
#### Scenario: 提问推荐
- **WHEN** 用户发送问题
- **THEN** 后端将其向量化，与本地产品向量对比，取出 Top N 相关产品，拼接到提示词中，调用 Qwen 模型流式输出 Markdown 格式的回答。

### Requirement: 严格的限流与封禁机制
系统必须对用户的请求频率进行限制。
#### Scenario: 触发限流
- **WHEN** 用户距离上次发送不到 2 分钟时尝试发送
- **THEN** 前端禁用发送按钮并显示倒计时提示。
- **WHEN** 某 IP 在 24 小时内请求次数达到 60 次
- **THEN** 后端将其永久加入 `banned_ips` 数据库，拒绝该 IP 的所有后续 `/api/chat` 请求。

### Requirement: 后台知识库增量更新
管理员可以在后台配置 API Key 并一键同步产品数据到知识库。
#### Scenario: 增量同步
- **WHEN** 管理员点击“更新知识库”
- **THEN** 后端扫描数据库中的所有产品，过滤出尚未在本地向量库中存在的产品，调用 Embedding API 进行向量化并保存。