---
name: weread-dl
description: 微信读书 AI 阅读助手 - 扫码登录、阅读进度跟踪、章节内容存档、AI 对话
allowed-tools: Bash(node:*)
---

# 微信读书 AI 阅读助手 (weread-dl)

通过 Playwright 实现扫码登录 → 获取阅读进度 → 从浏览器渲染 DOM 提取章节全文 → 存档和 AI 对话。

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
        ├── chapters/
        │   └── chapter_text.md   # 渲染后的章节全文（从 DOM 提取）
        ├── screenshots/
        │   └── YYYY-MM-DD.png    # 每次阅读的页面截图
        └── chat.md               # 聊天记录
```

## 工作原理

### 章节提取
微信读书网页版使用 CSS 绝对定位打散字符进行版权保护。本工具通过 Playwright 打开书籍阅读页，从渲染后的 DOM 中获取所有 `position: absolute` 的文本元素，按视觉坐标（top/left）排序重组，重建完整章节文本。

**不涉及翻页操作**，不影响用户阅读进度。

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
