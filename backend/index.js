const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const {
  PB_URL,
  escapeFilter,
  adminAuth,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  buildProductImageUrl,
  buildPbFileUrl,
  createFileForm
} = require('./pbClient');

const AdmZip = require('adm-zip');
const { parse } = require('csv-parse/sync');
const { OpenAI } = require('openai');
const axios = require('axios');

const app = express();
  app.set('trust proxy', 1); // Enable proxy trust for Nginx to get correct client IP
  const upload = multer({ dest: path.join(__dirname, '.tmp_uploads') });
const PORT = Number(process.env.PORT || 3001);
const ADMIN_COOKIE = 'wb_admin_token';
const ADMIN_USER = process.env.ADMIN_USERNAME || 'admin123';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || '@#Wmy666888#<>';
const SCRAPED_ROOT = path.join(__dirname, '..', 'scraped_data');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const contactLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  message: { error: 'Too many requests, please try again later.' }
});

const hostOrigin = (req) => `${req.protocol}://${req.get('host')}`;
const toProduct = (record, req) => ({
  id: record.id,
  category: record.category || '',
  title: record.title || '',
  name: record.title || '',
  description: record.description || '',
  images: Array.isArray(record.images)
    ? record.images.map((fileName) => buildProductImageUrl(hostOrigin(req), record.id, fileName))
    : []
});

const getSiteConfigRecord = async (token) => {
  const list = await listRecords('site_config', { page: 1, perPage: 1 }, token);
  return list.items?.[0] || null;
};

const getFsCategories = () => {
  if (!fs.existsSync(SCRAPED_ROOT)) return [];
  return fs
    .readdirSync(SCRAPED_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(Boolean);
};

const getAllDbCategories = async (token) => {
  const categories = new Set();
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const data = await listRecords('products', {
      page,
      perPage: 500,
      fields: 'category'
    }, token);
    totalPages = Number(data.totalPages || 1);
    (data.items || []).forEach((item) => {
      if (item.category) categories.add(item.category);
    });
    page += 1;
  }
  return [...categories];
};

const requireAdmin = async (req, res, next) => {
  if (!req.cookies?.[ADMIN_COOKIE]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.pbToken = req.cookies[ADMIN_COOKIE];
  next();
};

app.get('/images/:id/:fileName', async (req, res) => {
  try {
    const token = await adminAuth();
    const record = await getRecord('products', req.params.id, token);
    const fileName = decodeURIComponent(req.params.fileName || '');
    if (!Array.isArray(record.images) || !record.images.includes(fileName)) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Instead of redirecting to localhost (which fails on client side),
    // we pipe the image from pocketbase through our node server
    const pbUrl = buildPbFileUrl('products', record.id, fileName);
    // console.log(`[DEBUG] Fetching image from: ${pbUrl}`);
    const response = await axios.get(pbUrl, { responseType: 'stream' });
    res.set('Content-Type', response.headers['content-type']);
    response.data.pipe(res);
  } catch (error) {
    console.error(`Error proxying image ${req.params.id}/${req.params.fileName}:`, error.message);
    res.status(404).json({ error: 'Image not found' });
  }
});

app.get('/site-assets/:fileName', async (req, res) => {
  try {
    const token = await adminAuth();
    const config = await getSiteConfigRecord(token);
    const fileName = decodeURIComponent(req.params.fileName || '');
    
    // Check if the requested file is the QR code
    if (config?.wechat_qr && config.wechat_qr === fileName) {
      const pbUrl = buildPbFileUrl('site_config', config.id, config.wechat_qr);
      const response = await axios.get(pbUrl, { responseType: 'stream' });
      res.set('Content-Type', response.headers['content-type']);
      return response.data.pipe(res);
    }
    // Handle array case for PocketBase v0.20+ if it returns array for multiple files
    if (Array.isArray(config?.wechat_qr) && config.wechat_qr.includes(fileName)) {
       const pbUrl = buildPbFileUrl('site_config', config.id, fileName);
       const response = await axios.get(pbUrl, { responseType: 'stream' });
       res.set('Content-Type', response.headers['content-type']);
       return response.data.pipe(res);
    }

    // Check if the requested file is the Logo
    if (config?.site_logo && config.site_logo === fileName) {
      const pbUrl = buildPbFileUrl('site_config', config.id, config.site_logo);
      const response = await axios.get(pbUrl, { responseType: 'stream' });
      res.set('Content-Type', response.headers['content-type']);
      return response.data.pipe(res);
    }
    if (Array.isArray(config?.site_logo) && config.site_logo.includes(fileName)) {
       const pbUrl = buildPbFileUrl('site_config', config.id, fileName);
       const response = await axios.get(pbUrl, { responseType: 'stream' });
       res.set('Content-Type', response.headers['content-type']);
       return response.data.pipe(res);
    }

    return res.status(404).json({ error: 'Asset not found' });
  } catch (err) {
    res.status(404).json({ error: 'Asset not found' });
  }
});

app.get('/api/site-config', async (req, res) => {
  try {
    const token = await adminAuth();
    const config = await getSiteConfigRecord(token);
    
    // PocketBase v0.20+ might return string for maxSelect:1 instead of array
    const qr = Array.isArray(config?.wechat_qr) ? config.wechat_qr[0] : config?.wechat_qr;
    const logo = Array.isArray(config?.site_logo) ? config.site_logo[0] : config?.site_logo;

    res.json({
      phone: config?.phone || '',
      email: config?.email || '',
      address: config?.address || '',
      wechatTitle: config?.wechat_title || 'WeChat Inquiry',
      wechatHint: config?.wechat_hint || '',
      wechatQrUrl: qr ? `${hostOrigin(req)}/site-assets/${encodeURIComponent(qr)}` : '',
      siteLogoUrl: logo ? `${hostOrigin(req)}/site-assets/${encodeURIComponent(logo)}` : '',
      updatedAt: config?.updated || null
    });
  } catch (error) {
    res.status(500).json({ error: error.response?.data?.message || 'Failed to load site config' });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const token = await adminAuth();
    const dbCategories = await getAllDbCategories(token);
    const fsCategories = getFsCategories();
    const categories = [...new Set([...dbCategories, ...fsCategories])].sort((a, b) => a.localeCompare(b));
    res.json(categories.map((category) => ({ category })));
  } catch {
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const token = await adminAuth();
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 200);
    const keyword = String(req.query.keyword || '').trim();
    const category = String(req.query.category || '').trim();
    const filters = [];
    if (keyword) {
      const safe = escapeFilter(keyword);
      filters.push(`(title~"${safe}" || category~"${safe}")`);
    }
    if (!keyword && category) {
      filters.push(`category="${escapeFilter(category)}"`);
    }
    const data = await listRecords('products', {
      page,
      perPage: limit,
      sort: '-updated',
      filter: filters.join(' && ')
    }, token);
    res.json({
      items: (data.items || []).map((item) => toProduct(item, req)),
      totalItems: data.totalItems || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.response?.data?.message || 'Failed to load products' });
  }
});

app.get('/api/product/:id', async (req, res) => {
  try {
    const token = await adminAuth();
    const record = await getRecord('products', req.params.id, token);
    res.json(toProduct(record, req));
  } catch {
    res.status(404).json({ error: 'Product not found' });
  }
});

app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const { name, email, message } = req.body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email and message are required.' });
    }
    const token = await adminAuth();
    await createRecord('contact_messages', {
      name: String(name).trim(),
      email: String(email).trim(),
      message: String(message).trim(),
      ip: req.ip,
      user_agent: req.headers['user-agent'] || ''
    }, token);
    res.json({ success: true, message: 'Message sent successfully!' });
  } catch {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Chat Rate Limiting & IP Ban Middleware
const chatRequests = new Map(); // ip -> array of timestamps

const chatLimiterMiddleware = async (req, res, next) => {
  try {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const threeHoursAgo = now - 3 * 60 * 60 * 1000;
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

    const token = await adminAuth();

    // 1. Check if IP is in banned_ips collection
    try {
      const banned = await listRecords('banned_ips', {
        filter: `ip="${escapeFilter(ip)}"`,
        perPage: 1
      }, token);

      if (banned.items && banned.items.length > 0) {
        return res.status(403).json({ error: 'Your IP has been banned due to policy violations.' });
      }
    } catch (e) {
      console.warn('banned_ips collection might not exist yet:', e.response?.data || e.message);
    }

    // 2. Track requests
    if (!chatRequests.has(ip)) {
      chatRequests.set(ip, []);
    }
    const timestamps = chatRequests.get(ip);
    
    // Clean up old timestamps
    const validTimestamps = timestamps.filter(t => t > twentyFourHoursAgo);
    
    // Check limits
    const reqsLast3Hours = validTimestamps.filter(t => t > threeHoursAgo).length;
    const reqsLast24Hours = validTimestamps.length;

    // 3. If 24 hours limit is exceeded, insert IP into banned_ips and reject
    if (reqsLast24Hours >= 60) {
      try {
        await createRecord('banned_ips', { ip: ip, reason: 'Exceeded 24h limit (60 reqs)' }, token);
      } catch (e) {
        console.error('Failed to add IP to banned_ips:', e.response?.data || e.message);
      }
      return res.status(403).json({ error: 'Rate limit exceeded. Your IP has been banned.' });
    }

    if (reqsLast3Hours >= 30) {
      return res.status(429).json({ error: 'Too many requests in the last 3 hours. Please try again later.' });
    }

    // Add current request timestamp
    validTimestamps.push(now);
    chatRequests.set(ip, validTimestamps);

    next();
  } catch (error) {
    console.error('Chat limiter error:', error);
    res.status(500).json({ error: 'Internal server error during rate limiting' });
  }
};

app.post('/api/chat', chatLimiterMiddleware, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return res.status(400).json({ error: 'Last message must be from user' });
    }

    const token = await adminAuth();
    const config = await getSiteConfigRecord(token);
    const apiKey = config?.dashscope_api_key;
    const ai_embedding_model = config?.ai_embedding_model || 'text-embedding-v3';
    const ai_chat_model = config?.ai_chat_model || 'qwen3.5-flash';
    const systemPromptConfig = config?.ai_system_prompt;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'AI is not configured (missing API key)' });
    }

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    // 1. Vectorize user message
    const embedResponse = await openai.embeddings.create({
      model: ai_embedding_model,
      input: lastMessage.content,
      dimensions: ai_embedding_model.includes('text-embedding-v3') ? 1024 : undefined,
      encoding_format: 'float'
    });
    const userVector = embedResponse.data[0].embedding;

    // 2. Read embeddings.json and calculate cosine similarity
    const dataDir = path.join(__dirname, 'data');
    const embeddingsPath = path.join(dataDir, 'embeddings.json');
    let embeddingsData = [];
    if (fs.existsSync(embeddingsPath)) {
      try {
        embeddingsData = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8'));
      } catch (e) {
        console.error('Failed to parse embeddings.json', e);
      }
    }

    const cosineSimilarity = (vecA, vecB) => {
      if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) {
        return 0;
      }
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
      }
      if (normA === 0 || normB === 0) return 0;
      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    // 添加日志方便排查问题
    // console.log(`User query embedding dimension: ${userVector?.length}`);
    // if (embeddingsData.length > 0) {
    //   console.log(`First KB item embedding dimension: ${embeddingsData[0].embedding?.length}`);
    // }

    const similarities = embeddingsData
      .map(item => ({
        id: item.id,
        score: cosineSimilarity(userVector, item.embedding)
      }))
      .filter(item => !Number.isNaN(item.score));

    similarities.sort((a, b) => b.score - a.score);
    const top5Ids = similarities.slice(0, 5).map(item => item.id);

    // 3. Fetch product details for top 5
    const top5Products = [];
    for (const id of top5Ids) {
      try {
        const record = await getRecord('products', id, token);
        top5Products.push(toProduct(record, req));
      } catch (e) {
        console.error(`Failed to fetch product ${id}`, e);
      }
    }

    // 4. Prepare system prompt and context
    let systemPrompt = config?.ai_system_prompt || 'You are a helpful assistant.';
    
    let contextText = '以下是一些可能相关的产品信息：\n';
    if (top5Products.length > 0) {
      contextText += top5Products.map(p => 
        `产品ID: ${p.id}\n名称: ${p.title}\n分类: ${p.category}\n描述: ${p.description}\n`
      ).join('---\n');
    } else {
      contextText += '未找到相关产品。\n';
    }

    const fullSystemPrompt = `${systemPrompt}\n\n${contextText}`;

    const apiMessages = [
      { role: 'system', content: fullSystemPrompt },
      ...messages
    ];

    // 5. Call qwen3.5-flash via openai synchronously (no stream)
    const completion = await openai.chat.completions.create({
      model: ai_chat_model,
      messages: apiMessages,
      stream: false
    });

    const content = completion.choices[0]?.message?.content || '';
    res.json({ content });

  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({ error: error.message || 'Failed to process chat request' });
  }
});


app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (username !== ADMIN_USER || password !== ADMIN_PASS) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = await adminAuth();
    res.cookie(ADMIN_COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 12 * 60 * 60 * 1000 });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/admin/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE);
  res.json({ success: true });
});

app.get('/admin/api/products', requireAdmin, async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const perPage = Math.min(500, Math.max(1, Number(req.query.perPage || 50)));
  const keyword = String(req.query.keyword || '').trim();
  const category = String(req.query.category || '').trim();
  const filters = [];
  if (keyword) {
    const safe = escapeFilter(keyword);
    filters.push(`(title~"${safe}" || description~"${safe}" || category~"${safe}")`);
  }
  if (category) {
    filters.push(`category="${escapeFilter(category)}"`);
  }
  const data = await listRecords('products', {
    page,
    perPage,
    sort: '-updated',
    filter: filters.join(' && ')
  }, req.pbToken);
  res.json({
    page: data.page,
    perPage: data.perPage,
    totalPages: data.totalPages,
    totalItems: data.totalItems,
    items: data.items || []
  });
});

app.get('/admin/api/categories', requireAdmin, async (req, res) => {
  const dbCategories = await getAllDbCategories(req.pbToken);
  const fsCategories = getFsCategories();
  const categories = [...new Set([...dbCategories, ...fsCategories])].sort((a, b) => a.localeCompare(b));
  res.json(categories.map((category) => ({ category })));
});

app.post('/admin/api/products', requireAdmin, upload.array('images', 20), async (req, res) => {
  try {
    const files = (req.files || []).map((item) => item.path);
    const form = createFileForm({
      title: req.body.title || '',
      category: req.body.category || '',
      description: req.body.description || '',
      source_path: req.body.source_path || `manual_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    }, files);
    const created = await createRecord('products', form, req.pbToken);
    files.forEach((item) => fs.existsSync(item) && fs.unlinkSync(item));
    res.json(created);
  } catch (error) {
    console.error("Create product error:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.message || 'Create product failed' });
  }
});

app.post('/admin/api/bulk-import', requireAdmin, upload.fields([{ name: 'csv', maxCount: 1 }, { name: 'archive', maxCount: 1 }]), async (req, res) => {
  try {
    if (!req.files || !req.files['csv'] || !req.files['archive']) {
      return res.status(400).json({ error: 'Please upload both CSV and ZIP files' });
    }

    const extractDir = path.join(__dirname, '.tmp_extract', Date.now().toString());
    fs.mkdirSync(extractDir, { recursive: true });

    // Extract ZIP
    try {
        const zip = new AdmZip(req.files['archive'][0].path);
        zip.extractAllTo(extractDir, true);
    } catch (zipErr) {
        fs.unlinkSync(req.files['csv'][0].path);
        fs.unlinkSync(req.files['archive'][0].path);
        return res.status(400).json({ error: 'Failed to extract ZIP. Please ensure it is a valid .zip file.' });
    }

    // Build file map to find images regardless of zip folder structure
    const fileMap = {};
    const walkSync = (dir) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filepath = path.join(dir, file);
        if (fs.statSync(filepath).isDirectory()) {
          walkSync(filepath);
        } else {
          fileMap[file] = filepath; // Store by filename
        }
      }
    };
    walkSync(extractDir);

    // Parse CSV
    const csvContent = fs.readFileSync(req.files['csv'][0].path, 'utf-8');
    const records = parse(csvContent, { columns: false, skip_empty_lines: true });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      // Skip header row if it looks like one (e.g., contains 'title' or 'category' in the first 2 cols)
      if (i === 0 && record[0] && record[0].toLowerCase().includes('title')) {
        continue;
      }

      const title = record[0]?.trim();
      const category = record[1]?.trim();
      const description = record[2]?.trim();
      const imageNames = record.slice(3).map(n => n?.trim()).filter(Boolean);

      if (!title || !category) {
        failCount++;
        continue;
      }

      // Match image filenames from the CSV with extracted files
      const matchedImages = imageNames.map(img => fileMap[img]).filter(Boolean);

      try {
        const form = createFileForm({ 
            title, 
            category, 
            description,
            source_path: `bulk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
        }, matchedImages);
        await createRecord('products', form, req.pbToken);
        successCount++;
      } catch (e) {
        console.error('Failed to import record:', title, e.response?.data || e.message);
        failCount++;
      }
    }

    // Cleanup
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.unlinkSync(req.files['csv'][0].path);
    fs.unlinkSync(req.files['archive'][0].path);

    res.json({ success: true, successCount, failCount });
  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json({ error: error.message || 'Bulk import failed' });
  }
});

app.patch('/admin/api/products/:id', requireAdmin, upload.array('images', 20), async (req, res) => {
  try {
    const files = (req.files || []).map((item) => item.path);
    const fields = {
      title: req.body.title || '',
      category: req.body.category || '',
      description: req.body.description || ''
    };
    if (req.body.source_path) {
      fields.source_path = req.body.source_path;
    }
    const form = createFileForm(fields, files);
    const updated = await updateRecord('products', req.params.id, form, req.pbToken);
    files.forEach((item) => fs.existsSync(item) && fs.unlinkSync(item));
    res.json(updated);
  } catch (error) {
    console.error("Update product error:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.message || 'Update product failed' });
  }
});

app.delete('/admin/api/products/:id', requireAdmin, async (req, res) => {
  await deleteRecord('products', req.params.id, req.pbToken);
  res.json({ success: true });
});

app.get('/admin/api/site-config', requireAdmin, async (req, res) => {
  const config = await getSiteConfigRecord(req.pbToken);
  res.json(config || {});
});

app.patch('/admin/api/site-config', requireAdmin, upload.fields([{ name: 'wechat_qr', maxCount: 1 }, { name: 'site_logo', maxCount: 1 }]), async (req, res) => {
  try {
    const config = await getSiteConfigRecord(req.pbToken);
    const fields = {
      phone: req.body.phone || '',
      email: req.body.email || '',
      address: req.body.address || '',
      wechat_title: req.body.wechat_title || 'WeChat Inquiry',
      wechat_hint: req.body.wechat_hint || '',
      dashscope_api_key: req.body.dashscope_api_key || '',
      ai_system_prompt: req.body.ai_system_prompt || ''
    };
    if (req.files && (req.files['wechat_qr'] || req.files['site_logo'])) {
      const form = createFileForm(fields, []);
      if (req.files['wechat_qr']?.[0]) {
        form.append('wechat_qr', fs.createReadStream(req.files['wechat_qr'][0].path));
      }
      if (req.files['site_logo']?.[0]) {
        form.append('site_logo', fs.createReadStream(req.files['site_logo'][0].path));
      }
      const updated = await updateRecord('site_config', config.id, form, req.pbToken);
      if (req.files['wechat_qr']?.[0]) fs.unlinkSync(req.files['wechat_qr'][0].path);
      if (req.files['site_logo']?.[0]) fs.unlinkSync(req.files['site_logo'][0].path);
      return res.json(updated);
    }
    const updated = await updateRecord('site_config', config.id, fields, req.pbToken);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.response?.data?.message || 'Update site config failed' });
  }
});

app.get('/admin/api/messages', requireAdmin, async (req, res) => {
  const data = await listRecords('contact_messages', { page: 1, perPage: 200, sort: '-created' }, req.pbToken);
  res.json(data.items || []);
});

app.patch('/admin/api/messages/:id/read', requireAdmin, async (req, res) => {
  const updated = await updateRecord('contact_messages', req.params.id, {
    readAt: new Date().toISOString()
  }, req.pbToken);
  res.json(updated);
});

app.delete('/admin/api/messages/:id', requireAdmin, async (req, res) => {
  await deleteRecord('contact_messages', req.params.id, req.pbToken);
  res.json({ success: true });
});

// 使用 SSE (Server-Sent Events) 返回知识库更新进度
app.get('/admin/api/kb/update', requireAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // flush the headers to establish SSE with client

  const sendProgress = (msg, error = false, done = false) => {
    res.write(`data: ${JSON.stringify({ message: msg, error, done })}\n\n`);
  };

  try {
    sendProgress('开始读取站点配置...');
    // 获取网站配置以获取API Key和模型配置
    const config = await getSiteConfigRecord(req.pbToken);
    const dashscopeApiKey = config?.dashscope_api_key;
    const ai_embedding_model = config?.ai_embedding_model || 'text-embedding-v3';

    if (!dashscopeApiKey) {
      sendProgress('错误：DashScope API Key 未配置，请在站点配置中保存。', true, true);
      return res.end();
    }

    const openai = new OpenAI({
      apiKey: dashscopeApiKey,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const embeddingsPath = path.join(dataDir, 'embeddings.json');
    let embeddingsData = [];
    if (fs.existsSync(embeddingsPath)) {
      try {
        embeddingsData = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8'));
      } catch (e) {
        console.error('Failed to parse embeddings.json', e);
        embeddingsData = [];
      }
    }
    const embeddingsMap = new Map(embeddingsData.map(item => [item.id, item]));

    sendProgress('正在从数据库读取所有产品列表...');
      const allProducts = [];
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages) {
        const data = await listRecords('products', {
          page,
          perPage: 500, // Increased for speed
          fields: 'id,title,description,updated'
        }, req.pbToken);
        totalPages = Number(data.totalPages || 1);
        if (data.items) {
          allProducts.push(...data.items);
        }
        page++;
      }

      sendProgress(`共读取到 ${allProducts.length} 个产品。开始比对并向量化新增/修改的产品...`);

    let newCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    
    // 我们为了防止速率限制，增加一个小延迟，同时每处理一个发送一次进度
    for (let i = 0; i < allProducts.length; i++) {
      const product = allProducts[i];
      const existing = embeddingsMap.get(product.id);
      
      if (!existing || existing.updated !== product.updated) {
        const textToEmbed = `Title: ${product.title}\nDescription: ${product.description || ''}`.trim();
        try {
          // Send progress message
          sendProgress(`正在处理 (${i+1}/${allProducts.length}): ${product.title.substring(0, 20)}...`);
          
          const response = await openai.embeddings.create({
            model: ai_embedding_model,
            input: textToEmbed,
            dimensions: ai_embedding_model.includes('text-embedding-v3') ? 1024 : undefined,
            encoding_format: 'float'
          });
          const embedding = response.data[0].embedding;
          
          embeddingsMap.set(product.id, {
            id: product.id,
            title: product.title,
            description: product.description || '',
            updated: product.updated,
            embedding: embedding
          });
          
          if (!existing) newCount++;
          else updatedCount++;
          
          // 增加 50ms 延迟，避免打爆免费并发额度
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (err) {
          failedCount++;
          sendProgress(`产品 ${product.title} 处理失败: ${err.message}`, true, false);
        }
      }
    }

    sendProgress('正在清理已删除的产品向量...');
    const currentProductIds = new Set(allProducts.map(p => p.id));
    let deletedCount = 0;
    for (const id of embeddingsMap.keys()) {
      if (!currentProductIds.has(id)) {
        embeddingsMap.delete(id);
        deletedCount++;
      }
    }

    sendProgress('正在将向量数据保存到本地...');
    fs.writeFileSync(embeddingsPath, JSON.stringify(Array.from(embeddingsMap.values()), null, 2));

    sendProgress(`更新完成！新增: ${newCount}, 更新: ${updatedCount}, 删除: ${deletedCount}, 失败: ${failedCount}, 知识库总数: ${embeddingsMap.size}`, false, true);
    res.end();
  } catch (error) {
    console.error('KB Update Error:', error);
    sendProgress(`知识库更新失败: ${error.message}`, true, true);
    res.end();
  }
});

app.get('/admin/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-mobile.html'));
});

app.get('/admin/pocketbase', (req, res) => {
  res.redirect(`${PB_URL}/_/`);
});

app.listen(PORT, () => {
  console.log(`BFF running on http://localhost:${PORT}`);
});
