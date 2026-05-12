---
name: weread-dl
description: 微信读书 AI 阅读助手 - 扫码登录、阅读进度跟踪、章节内容存档、AI 对话
allowed-tools: Bash(node:*)
---

# 微信读书 AI 阅读助手 (weread-dl)

基于 [weread-dl](https://github.com/ColorlessBoy/weread-dl) 插件的 API 拦截原理，通过 Playwright 实现扫码登录 → 获取阅读进度 → 截获加密章节数据 → 存档和 AI 对话。

## 文件结构

```
weread-dl/
├── SKILL.md                      # 本文档
├── scripts/
│   ├── login.js                  # 扫码登录
│   └── read-chapter.js           # 打开书籍，获取章节/进度，保存到文件夹
├── profile/
│   └── weread-cookies.json       # 持久化 cookies（自动生成）
└── books/
    └── <书名>/
        ├── metadata.json         # 书籍信息 + 目录 + 阅读进度 + 阅读历史
        ├── current-chapter.md    # 当前章节标记（从 DOM 提取，参考用）
        ├── chapters/
        │   ├── chapter_e0.enc    # 加密章节数据（可去 ebook-exporter 解密）
        │   ├── chapter_e1.enc
        │   ├── ...
        │   └── toc.json          # 目录结构数据
        ├── screenshots/
        │   └── YYYY-MM-DD.png    # 每次阅读的页面截图
        └── chat.md               # 和彭总的聊天记录
```

## 工作原理

### 章节加密
微信读书网页版使用 canvas 渲染正文（版权保护），章节数据通过 API `/web/book/chapter/e_N` 以 **AES 加密** 形式传输：
```
32位hex校验码 + base64(AES加密数据)
```
本工具拦截原始加密数据，保存为 `.enc` 文件。解密可前往：
https://ebook-exporter.deno.dev

### 阅读进度
从页面目录元素自动提取当前章节和百分比进度，记录在 metadata.json 中。

## 使用

### 登录
```bash
cd ~/.openclaw/workspace/skills/weread-dl
NODE_PATH=/home/peng/.npm-global/lib/node_modules node scripts/login.js
```
生成二维码 → 微信扫一扫 → 自动保存 cookies

### 读一本书
```bash
NODE_PATH=/home/peng/.npm-global/lib/node_modules node scripts/read-chapter.js <bookId>
```
可选 --chat 参数记录聊天：
```bash
node scripts/read-chapter.js <bookId> --chat "讨论内容"
```

## AI 对话功能

1. 运行 `read-chapter.js` 打开指定书籍
2. 获取当前章节（第X章，进度Y%）和相关上下文
3. 基于目录结构和历史阅读记录与用户讨论
4. 聊天记录自动保存到 books/<书名>/chat.md

## 注意事项
- ⚠️ 使用工具有封号风险，建议小号
- 加密章节数据需配合解密端使用
