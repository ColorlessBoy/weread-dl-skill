/**
 * 微信读书阅读脚本
 *
 * 用法：
 *   node scripts/read-chapter.js <bookId>
 *   node scripts/read-chapter.js <bookId> --chat "聊天内容"
 *
 * 功能：
 * 1. 打开书籍阅读页
 * 2. 使用 DOM 树遍历提取渲染后的章节文本
 * 3. 截图当前页面
 * 4. 提取目录结构和阅读进度
 * 5. 在 books/<书名>/ 下保存：
 *    - metadata.json             书籍信息+目录
 *    - chapters/chapter_text.md  渲染后的章节全文
 *    - screenshots/              阅读截图
 *    - chat.md                   聊天记录
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const COOKIES_FILE = path.join(__dirname, '..', 'profile', 'weread-cookies.json');
const BOOKS_DIR = path.join(__dirname, '..', 'books');

[path.dirname(COOKIES_FILE), BOOKS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

function bookId(arg) {
  const m = (arg || '').match(/\/web\/reader\/([a-zA-Z0-9]+)/);
  return m ? m[1] : (arg || '').replace(/[^a-zA-Z0-9]/g, '');
}

function chatArg(argv) {
  const i = argv.indexOf('--chat');
  return i !== -1 && argv[i+1] ? argv[i+1] : null;
}

function safeName(s) { return s.replace(/[<>:"/\\|?*]/g, '_').replace(/_+/g,'_').replace(/^_|_$/g,''); }

async function loadCookies(ctx) {
  if (!fs.existsSync(COOKIES_FILE)) return false;
  await ctx.addCookies(JSON.parse(fs.readFileSync(COOKIES_FILE,'utf-8')));
  return true;
}

async function saveCookies(ctx) {
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(await ctx.cookies(), null, 2), 'utf-8');
}

function appendChat(bookDir, role, msg) {
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  fs.appendFileSync(path.join(bookDir, 'chat.md'), `\n## ${ts}\n\n**${role}：** ${msg}\n`, 'utf-8');
}

async function run() {
  const bid = bookId(process.argv[2]);
  const chat = chatArg(process.argv);
  if (!bid) { console.error('Need bookId'); process.exit(1); }
  if (!fs.existsSync(COOKIES_FILE)) { console.error('Not logged in, run login.js'); process.exit(1); }

  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-CN' });
    const page = await ctx.newPage();
    await loadCookies(ctx);

    await page.goto(`https://weread.qq.com/web/reader/${bid}`, { waitUntil: 'networkidle', timeout: 25000 });
    if (!page.url().includes('/web/reader/')) { console.error('Session expired'); process.exit(1); }
    await page.waitForTimeout(10000);

    // 提取渲染后的章节文本 — 遍历 DOM 中的 absolute 定位元素并按视觉顺序拼接
    const chapterResult = await page.evaluate(() => {
      const container = document.querySelector('#renderTargetContent');
      if (!container) return null;

      const items = [];
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_ELEMENT,
        null,
        false
      );

      while (walker.nextNode()) {
        const el = walker.currentNode;
        const tag = el.tagName.toLowerCase();
        if (tag === 'style' || tag === 'script' || tag === 'textarea') continue;

        const text = el.textContent.trim();
        if (!text) continue;

        const style = window.getComputedStyle(el);
        if (style.position !== 'absolute') continue;

        const rect = el.getBoundingClientRect();

        items.push({
          text,
          top: Math.round(rect.top),
          left: Math.round(rect.left),
        });
      }

      items.sort((a, b) => a.top - b.top || a.left - b.left);
      return { text: items.map(i => i.text).join(''), count: items.length };
    });

    const pg = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      hasReader: !!document.querySelector('.app_content, [class*=reader_content], .wr_horizontalReader_app_content'),
      catalogText: Array.from(document.querySelectorAll('.readerCatalog_list_item, .readerCatalog li, [class*=catalogItem]'))
        .slice(0, 60).map(i => i.textContent?.trim() || ''),
    }));

    const m = pg.title.match(/^(.+?)\s*-\s*(.+?)\s*-\s*微信读书/);
    const bookName = m ? m[1].trim() : '未知';
    const author = m ? m[2].trim() : '';
    const slug = safeName(bookName);
    const bookDir = path.join(BOOKS_DIR, slug);

    [bookDir, path.join(bookDir, 'chapters'), path.join(bookDir, 'screenshots')]
      .forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

    const today = new Date().toISOString().split('T')[0];
    const screenshotFile = path.join(bookDir, 'screenshots', `${today}.png`);
    await page.screenshot({ path: screenshotFile, fullPage: false });

    let curChapter = '', curProgress = '';
    for (const c of pg.catalogText) {
      if (c.includes('当前读到')) {
        curChapter = c.replace(/当前读到.*$/, '').trim();
        const pm = c.match(/(\d+%)/);
        curProgress = pm ? pm[1] : '';
        break;
      }
    }

    const chapterSaveDir = path.join(bookDir, 'chapters');
    let hasTarget = false;
    if (chapterResult) {
      const cleanedText = chapterResult.text.replace(/JS复制代码/g, '').replace(/复制代码/g, '');
      fs.writeFileSync(path.join(chapterSaveDir, 'chapter_text.md'), cleanedText, 'utf-8');
      hasTarget = chapterResult.text.includes('进一步');
    }

    const metaFile = path.join(bookDir, 'metadata.json');
    let meta = {};
    if (fs.existsSync(metaFile)) try { meta = JSON.parse(fs.readFileSync(metaFile,'utf-8')); } catch(e) {}
    Object.assign(meta, {
      bookId: bid, title: bookName, author, url: pg.url,
      currentChapter: curChapter, progress: curProgress,
      catalog: pg.catalogText,
      chapterCount: pg.catalogText.filter(c => !c.includes('上册') && !c.includes('下册') && !c.includes('版权') && !c.includes('图集')).length,
      extractionMethod: chapterResult ? 'dom' : 'none',
      elementCount: chapterResult ? chapterResult.count : 0,
      verificationTarget: hasTarget,
      lastRead: new Date().toISOString(),
      readHistory: [...(meta.readHistory || []), { date: today, chapter: curChapter, progress: curProgress }],
    });
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8');

    if (chat) appendChat(bookDir, '彭总', chat);

    console.log(`\n[书籍] ${bookName}`);
    console.log(`  作者: ${author}`);
    console.log(`  文件夹: ${bookDir}`);
    if (chapterResult) {
      console.log(`  提取模式: DOM 渲染文本 (${chapterResult.count} 个元素)`);
      console.log(`  验证关键词"进一步": ${hasTarget ? 'YES' : 'NO'}`);
    } else {
      console.log(`  提取模式: 未找到 #renderTargetContent`);
    }
    console.log(`  当前: ${curChapter || '未知'} ${curProgress ? '(' + curProgress + ')' : ''}`);
    console.log(`  章节数: ${meta.chapterCount}`);
    console.log(`  截图: ${screenshotFile}`);
    if (chat) console.log(`  聊天已保存`);

    if (pg.catalogText.length > 0) {
      console.log(`\n[目录]:`);
      pg.catalogText.forEach((c, i) => {
        const mark = c.includes('当前') ? '>' : ' ';
        console.log(`  ${mark} ${c}`);
      });
    }

    await saveCookies(ctx);
  } finally {
    await browser.close();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
