# Ubuntu 24 保姆级部署教程（最新架构：PocketBase + Node.js BFF + React + AI智能助手）

本教程针对**最新升级的架构**（前端 React + 后端 Node.js + PocketBase 数据库 + 阿里云大模型 API）编写。特别针对 **2核2G** 的轻量级服务器进行了部署与内存优化指南，确保系统稳定不崩溃。

## ⚠️ 关于旧服务器数据的清空与迁移

**强烈建议不要直接清空原服务器数据！**
因为新架构使用了全新的 PocketBase 数据库，且增加了本地的 AI 向量知识库。为了保证数据安全和一致性：

1. **保留** **`scraped_data/`** **目录**：这是你辛辛苦苦抓取的原始产品图片和信息，务必备份。
2. **全新目录部署**：建议在服务器上创建一个新的目录（如 `/var/www/webtrade-v2`）进行部署，确认新站运行无误后，再停掉旧版服务。
3. **⭐ 最优迁移方案（推荐）**：你在本地 Windows 上测试通过后，直接将本地的 `backend/pb_data` (数据库) 和 `backend/data` (AI 向量知识库) 两个文件夹**原封不动地打包上传**到服务器的 `backend/` 目录下。这样你的产品、账号、API Key 甚至知识库都直接生效，无需在服务器上重新跑耗时的导入和向量化任务！

***

## 0. 清理旧版服务与配置（如果有）

如果你的服务器上正在运行旧版的 WEBtrade 系统，在部署新版前，需要先停用并清理旧版的服务，以免端口冲突或影响新架构的运行。

```bash
# 1. 停用并禁用旧版后端和管理员服务
sudo systemctl stop webtrade-backend webtrade-admin
sudo systemctl disable webtrade-backend webtrade-admin

# 2. 删除旧版服务的 systemd 配置文件
sudo rm -f /etc/systemd/system/webtrade-backend.service
sudo rm -f /etc/systemd/system/webtrade-admin.service
sudo systemctl daemon-reload

# 3. 移除旧版 Nginx 配置
sudo rm -f /etc/nginx/sites-enabled/webtrade.conf
sudo rm -f /etc/nginx/sites-enabled/webtrade-admin.conf
sudo rm -f /etc/nginx/sites-available/webtrade.conf
sudo rm -f /etc/nginx/sites-available/webtrade-admin.conf
sudo systemctl reload nginx
```

*(注意：请不要直接删除旧版的* *`/var/www/webtrade`* *文件夹，里面可能还有你需要的原始图片数据)*

***

## 1. 云平台安全组/防火墙（先做）

在云控制台的安全组里放行：

- `22/tcp`（SSH）
- `80/tcp`（主站 HTTP，用于签发证书及跳转）
- `443/tcp`（主站 HTTPS）
- `8088/tcp`（管理员入口）

不需要对外放行：

- `3001/tcp`（Node BFF 后端）
- `8090/tcp`（PocketBase 数据库）
  这两个端口只在服务器本地通信，通过 Nginx 代理对外暴露。

***

## 2. 内存优化配置（针对 2核2G 机器必做！）

2G 内存的服务器在运行 Node.js 加上大模型请求时可能会出现内存峰值导致进程被杀（OOM）。我们需要开启 Swap 虚拟内存：

```bash
# 1. 登录服务器
ssh root@你的服务器公网IP

# 2. 创建 2GB 的 Swap 文件
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 3. 设置开机自动挂载 Swap
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 4. 检查是否成功（看到 Swap 一行有 2.0G 即可）
free -h
```

***

## 3. 域名（可选）：DNS 解析

在你的域名解析里添加 A 记录：

- 主机记录：`@` 或 `www`
- 记录值：你的服务器公网 IP

等待解析生效。如果没有域名，可以用公网 IP 走 HTTP 访问测试，但无法配置 HTTPS。

***

## 4. 系统环境准备

### 3.1 更新系统并安装基础依赖

```bash
sudo apt update
sudo apt install -y git nginx curl build-essential unzip zip
```

### 3.2 安装 Node.js (推荐 20 LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

验证安装：

```bash
node -v
npm -v
```

***

## 5. 放置代码到服务器

我们创建一个全新的部署目录，避免与旧架构冲突：

```bash
sudo mkdir -p /var/www/webtrade-v2
sudo chown -R $USER:$USER /var/www/webtrade-v2
```

你可以通过 Git 拉取代码，或者使用 WinSCP/FileZilla 等工具直接把本地的 `WEBtrade-plus` 文件夹内容上传到 `/var/www/webtrade-v2`。

**🚨 核心提醒**：
为了省去在 2核2G 服务器上重新生成数千个产品 AI 向量的巨大压力，**强烈建议把本地调试好的以下两个文件夹一起上传**到 `/var/www/webtrade-v2/backend/` 下：

1. `pb_data` （PocketBase 数据库文件，包含你的配置和产品）
2. `data` （里面有 `embeddings.json`，是你花钱在本地跑出来的 AI 知识库）

确保上传后，目录结构如下：

- `/var/www/webtrade-v2/frontend/`
- `/var/www/webtrade-v2/backend/` （内含 `pb_data` 和 `data`）
- `/var/www/webtrade-v2/scraped_data/` （旧架构的原始图片）

***

## 6. 安装 PocketBase (Linux版)

由于你在本地使用的是 Windows 版的 `pocketbase.exe`，在 Ubuntu 上我们需要下载 Linux 版本的 PocketBase：

```bash
cd /var/www/webtrade-v2/backend
mkdir -p bin
wget https://github.com/pocketbase/pocketbase/releases/download/v0.22.4/pocketbase_0.22.4_linux_amd64.zip
unzip pocketbase_0.22.4_linux_amd64.zip -d bin/
chmod +x bin/pocketbase
```

***

## 7. 安装依赖与构建前端

```bash
cd /var/www/webtrade-v2

# 1. 安装后端依赖 (包含新引入的 openai, adm-zip 等)
cd backend
npm ci --omit=dev

# 2. 安装前端依赖并打包
cd ../frontend
npm ci
npm run build
```

执行完毕后，确保 `/var/www/webtrade-v2/frontend/dist` 目录生成成功。

***

## 8. 配置常驻服务 (systemd)

我们需要将 PocketBase 和 Node.js BFF 配置为开机自启的后台服务。

### 8.1 配置 PocketBase 服务

```bash
sudo tee /etc/systemd/system/webtrade-pb.service > /dev/null <<'EOF'
[Unit]
Description=WEBtrade PocketBase Database
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/webtrade-v2/backend
# 明确指定 pb_data 的路径，确保数据不丢失
ExecStart=/var/www/webtrade-v2/backend/bin/pocketbase serve --http="0.0.0.0:8090" --dir="/var/www/webtrade-v2/backend/pb_data"
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
```

### 8.2 配置 Node.js BFF 服务

为了防止 2核2G 机器爆内存，我们在启动 Node.js 时限制它的最大内存使用量为 1024MB。

```bash
sudo tee /etc/systemd/system/webtrade-bff.service > /dev/null <<'EOF'
[Unit]
Description=WEBtrade Node.js BFF
After=network.target webtrade-pb.service

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/webtrade-v2/backend
# 限制 Node 内存为 1G，防止撑爆服务器
ExecStart=/usr/bin/node --max-old-space-size=1024 index.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=PB_URL=http://0.0.0.0:8090
Environment=ADMIN_USERNAME=admin
Environment=ADMIN_PASSWORD=admin123456

[Install]
WantedBy=multi-user.target
EOF
```

*(注意：请将上面* *`ADMIN_PASSWORD=admin123456`* *改为你的强密码，这是你登录* *`8088`* *后台的密码)*

### 8.3 启动新版服务

```bash
# 启动新版服务
sudo systemctl daemon-reload
sudo systemctl enable --now webtrade-pb
sudo systemctl enable --now webtrade-bff

# 检查运行状态，确保都是 active (running)
我
```

***

## 9. 配置 Nginx 代理

我们使用 Nginx 作为 Web 服务器，将请求分发给前端静态文件和后端 API。

### 9.1 创建新版主站配置 (80 端口)

如果没有域名，下面的 `server_name` 保持 `_` 即可；如果有域名，替换为你的域名。

```bash
sudo tee /etc/nginx/sites-available/webtrade-v2.conf > /dev/null <<'EOF'
server {
    listen 80;
    server_name _;

    root /var/www/webtrade-v2/frontend/dist;
    index index.html;
    client_max_body_size 50m;

    # 拦截直接通过主站端口访问管理员接口（安全考虑）
    location /admin/ {
        deny all;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 代理 API 请求 (包括 AI 聊天的 /api/chat)
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # 为了支持 AI 流式输出或长连接，禁用缓冲并延长超时
        proxy_buffering off;
        proxy_read_timeout 300s;
    }

    location /images/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /site-assets/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
    }
}
EOF
```

### 9.2 创建管理员后台配置 (8088 端口)

```bash
sudo tee /etc/nginx/sites-available/webtrade-admin-v2.conf > /dev/null <<'EOF'
server {
    listen 8088;
    server_name _;

    client_max_body_size 50m;

    # 将 8088 的所有请求转发到 BFF 后端
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 同样为后台的知识库更新 SSE 流关闭缓冲
        proxy_buffering off;
        proxy_read_timeout 600s;
    }
}
EOF
```

### 9.3 启用 Nginx 配置

```bash
sudo ln -sf /etc/nginx/sites-available/webtrade-v2.conf /etc/nginx/sites-enabled/webtrade-v2.conf
sudo ln -sf /etc/nginx/sites-available/webtrade-admin-v2.conf /etc/nginx/sites-enabled/webtrade-admin-v2.conf

sudo nginx -t
sudo systemctl reload nginx
```

***

## 10. HTTPS 证书配置（需要域名）

如果你已经把域名解析到了服务器：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

Certbot 会自动修改主站的 Nginx 配置，将其升级为 443 HTTPS 并配置 80 重定向。

***

## 11. 验证部署结果

1. **访问主站**：在浏览器输入 `http://你的IP`，点击右下角测试 **AI Assistant** 是否能正常回复。
2. **访问管理员后台**：输入 `http://你的IP:8088/admin/mobile`，使用 `admin` 和密码登录。
3. **检查 AI 知识库配置**：确保站点配置里的 `DashScope API Key` 还在。如果你没有上传本地的 `data/embeddings.json`，请在后台点击一次“更新知识库”重新生成。

恭喜，搭载 AI 助手的全新架构网站已在 Ubuntu 上部署完毕！
