const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONTENT_DIR = path.join(ROOT, "content");
const POSTS_DIR = path.join(CONTENT_DIR, "posts");
const OUTPUT_POSTS_DIR = path.join(ROOT, "posts");
const SITE_CONFIG_PATH = path.join(CONTENT_DIR, "site.json");

const GENERATED_ROOT_FILES = [
  "index.html",
  "about.html",
  "research.html",
  "projects.html",
  "writing.html",
  "contact.html",
  "404.html",
];

const NAV_ITEMS = [
  { key: "home", label: "首页", file: "index.html" },
  { key: "about", label: "关于", file: "about.html" },
  { key: "research", label: "研究", file: "research.html" },
  { key: "projects", label: "项目", file: "projects.html" },
  { key: "writing", label: "文章", file: "writing.html" },
  { key: "contact", label: "联系", file: "contact.html" },
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseScalarValue(value) {
  const trimmed = stripWrappingQuotes(String(value || "").trim());
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (/^\[(.*)\]$/.test(trimmed)) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => stripWrappingQuotes(item.trim()))
      .filter(Boolean);
  }
  return trimmed;
}

function parseFrontMatter(raw) {
  const matched = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!matched) {
    return { attributes: {}, body: String(raw || "").trim() };
  }

  const attributes = {};
  for (const rawLine of matched[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    attributes[key] = parseScalarValue(value);
  }

  return { attributes, body: matched[2].trim() };
}

function parseDateValue(dateInput) {
  const raw = String(dateInput || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00Z`);
  }
  return new Date(raw);
}

function formatDate(dateInput, format) {
  const date = parseDateValue(dateInput);
  if (Number.isNaN(date.getTime())) return String(dateInput);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    year: "numeric",
    month: format === "long" ? "long" : "numeric",
    day: "numeric",
  }).format(date);
}

function estimateReadingMinutes(text) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 220) || 1);
}

function renderInline(text) {
  const parts = String(text || "").split(/(`[^`]+`)/g);

  return parts
    .map((part) => {
      if (!part) return "";

      if (/^`[^`]+`$/.test(part)) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }

      let rendered = escapeHtml(part);
      rendered = rendered.replace(
        /\[([^\]]+)\]\(([^)\s]+)\)/g,
        (_match, label, href) =>
          `<a href="${escapeHtml(href)}"${
            /^[a-z]+:/i.test(href) ? ' target="_blank" rel="noreferrer"' : ""
          }>${escapeHtml(label)}</a>`,
      );
      rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      rendered = rendered.replace(/\*([^*]+)\*/g, "<em>$1</em>");
      return rendered;
    })
    .join("");
}

function isBlockStarter(line) {
  const trimmed = line.trim();
  return (
    /^#{1,6}\s/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^[-*]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    /^```/.test(trimmed)
  );
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r/g, "").split("\n");
  const html = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const language = trimmed.slice(3).trim();
      const codeLines = [];
      index += 1;

      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) index += 1;

      html.push(
        `<pre class="code-block"><code${
          language ? ` class="language-${escapeHtml(language)}"` : ""
        }>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
      );
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${renderMarkdown(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      html.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      html.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index];
      if (!nextLine.trim()) {
        index += 1;
        break;
      }
      if (isBlockStarter(nextLine)) break;
      paragraphLines.push(nextLine.trim());
      index += 1;
    }

    html.push(`<p>${renderInline(paragraphLines.join(" "))}</p>`);
  }

  return html.join("\n");
}

function readPosts() {
  ensureDir(POSTS_DIR);

  const posts = fs
    .readdirSync(POSTS_DIR)
    .filter((fileName) => fileName.endsWith(".md") && !fileName.startsWith("_"))
    .map((fileName) => {
      const sourcePath = path.join(POSTS_DIR, fileName);
      const raw = fs.readFileSync(sourcePath, "utf8");
      const { attributes, body } = parseFrontMatter(raw);
      const slug = String(attributes.slug || path.basename(fileName, ".md")).trim();

      if (!slug) throw new Error(`Missing slug in ${fileName}`);
      if (!attributes.title) throw new Error(`Missing title in ${fileName}`);
      if (!attributes.date) throw new Error(`Missing date in ${fileName}`);

      return {
        slug,
        title: String(attributes.title).trim(),
        date: String(attributes.date).trim(),
        category: String(attributes.category || "笔记").trim(),
        summary: String(attributes.summary || "").trim(),
        featured: Boolean(attributes.featured),
        tags: Array.isArray(attributes.tags)
          ? attributes.tags.map((tag) => String(tag).trim()).filter(Boolean)
          : [],
        body,
        renderedBody: renderMarkdown(body),
        readingMinutes: estimateReadingMinutes(body),
      };
    })
    .sort((left, right) => parseDateValue(right.date) - parseDateValue(left.date));

  const slugs = new Set();
  for (const post of posts) {
    if (slugs.has(post.slug)) {
      throw new Error(`Duplicate slug "${post.slug}"`);
    }
    slugs.add(post.slug);
  }

  return posts;
}

function toRelativePath(fileName, depth) {
  const prefix = depth > 0 ? "../".repeat(depth) : "./";
  return `${prefix}${fileName}`;
}

function renderLayout({ title, description, stylesheetPath, bodyClass = "", content }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="data:," />
    <link rel="stylesheet" href="${escapeHtml(stylesheetPath)}" />
  </head>
  <body class="${escapeHtml(bodyClass)}">
${content}
  </body>
</html>
`;
}

function renderHeader(site, currentPage, depth = 0) {
  return `
      <header class="site-header">
        <a class="brand" href="${escapeHtml(toRelativePath("index.html", depth))}" aria-label="返回首页">
          <span class="brand-mark">WH</span>
          <span class="brand-copy">
            <strong>${escapeHtml(site.author)}</strong>
            <span>${escapeHtml(site.affiliation)}</span>
          </span>
        </a>

        <nav class="site-nav" aria-label="主导航">
          ${NAV_ITEMS.map((item) => {
            const isCurrent = item.key === currentPage;
            return `<a class="site-nav-link${isCurrent ? " is-current" : ""}" href="${escapeHtml(
              toRelativePath(item.file, depth),
            )}">${escapeHtml(item.label)}</a>`;
          }).join("")}
        </nav>
      </header>
  `;
}

function renderSidebar(site, config, depth = 0) {
  const facts = config.highlights
    .map(
      (item) => `
            <div class="sidebar-fact">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.value)}</strong>
            </div>
      `,
    )
    .join("");

  return `
        <aside class="sidebar">
          <section class="sidebar-card profile-card">
            <p class="sidebar-eyebrow">个人信息</p>
            <h2>${escapeHtml(site.author)}</h2>
            <p class="profile-affiliation">${escapeHtml(site.affiliation)}</p>
            <p class="profile-summary">${escapeHtml(config.about.lead)}</p>

            <div class="sidebar-actions">
              <a class="button button-primary" href="mailto:${escapeHtml(site.email)}">邮箱联系</a>
              <a class="button button-secondary" href="${escapeHtml(site.github)}" target="_blank" rel="noreferrer">GitHub</a>
            </div>
          </section>

          <section class="sidebar-card">
            <p class="sidebar-eyebrow">站点概览</p>
            <div class="sidebar-facts">
${facts}
            </div>
          </section>

          <section class="sidebar-card">
            <p class="sidebar-eyebrow">快速入口</p>
            <div class="sidebar-links">
              <a href="${escapeHtml(toRelativePath("writing.html", depth))}">查看文章</a>
              <a href="${escapeHtml(toRelativePath("research.html", depth))}">研究方向</a>
              <a href="${escapeHtml(toRelativePath("projects.html", depth))}">项目内容</a>
              <a href="${escapeHtml(toRelativePath("contact.html", depth))}">联系方式</a>
            </div>
          </section>
        </aside>
  `;
}

function renderFooter(site, depth = 0) {
  return `
      <footer class="site-footer">
        <p>${escapeHtml(site.author)} / ${escapeHtml(site.affiliation)}</p>
        <div class="footer-links">
          <a href="${escapeHtml(toRelativePath("index.html", depth))}">首页</a>
          <a href="${escapeHtml(site.github)}" target="_blank" rel="noreferrer">GitHub</a>
          <a href="mailto:${escapeHtml(site.email)}">${escapeHtml(site.email)}</a>
        </div>
      </footer>
  `;
}

function renderSectionHeading(label, title, copy = "") {
  return `
          <div class="section-heading">
            <p class="section-label">${escapeHtml(label)}</p>
            <h2>${escapeHtml(title)}</h2>
            ${copy ? `<p class="section-copy">${escapeHtml(copy)}</p>` : ""}
          </div>
  `;
}

function renderPageHeader(label, title, summary, actions = []) {
  return `
        <section class="page-header-card">
          <p class="section-label">${escapeHtml(label)}</p>
          <h1>${escapeHtml(title)}</h1>
          <p class="page-header-copy">${escapeHtml(summary)}</p>
          ${
            actions.length
              ? `<div class="section-actions">${actions
                  .map(
                    (action, index) =>
                      `<a class="button ${index === 0 ? "button-primary" : "button-secondary"}" href="${escapeHtml(
                        action.href,
                      )}"${/^[a-z]+:/i.test(action.href) ? ' target="_blank" rel="noreferrer"' : ""}>${escapeHtml(
                        action.label,
                      )}</a>`,
                  )
                  .join("")}</div>`
              : ""
          }
        </section>
  `;
}

function renderInfoGrid(items) {
  return `
          <div class="info-grid">
            ${items
              .map(
                (item) => `
            <article class="info-card">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.value)}</strong>
            </article>
            `,
              )
              .join("")}
          </div>
  `;
}

function renderTopicCards(items) {
  return `
          <div class="card-grid card-grid-2">
            ${items
              .map(
                (item) => `
            <article class="content-card">
              <p class="card-index">${escapeHtml(item.kicker || "主题")}</p>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.body)}</p>
            </article>
            `,
              )
              .join("")}
          </div>
  `;
}

function renderFeatureCards(items) {
  return `
          <div class="card-grid card-grid-2">
            ${items
              .map(
                (item) => `
            <${item.href ? "a" : "article"} class="content-card feature-card"${
                  item.href
                    ? ` href="${escapeHtml(item.href)}"${
                        /^[a-z]+:/i.test(item.href)
                          ? ' target="_blank" rel="noreferrer"'
                          : ""
                      }`
                    : ""
                }>
              <p class="card-index">${escapeHtml(item.label)}</p>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.body)}</p>
            </${item.href ? "a" : "article"}>
            `,
              )
              .join("")}
          </div>
  `;
}

function renderLinkCards(items) {
  return `
          <div class="card-grid card-grid-2">
            ${items
              .map(
                (item) => `
            <a class="content-card link-card" href="${escapeHtml(item.href)}"${
                  /^[a-z]+:/i.test(item.href) ? ' target="_blank" rel="noreferrer"' : ""
                }>
              <h3>${escapeHtml(item.label)}</h3>
              <p>${escapeHtml(item.meta)}</p>
            </a>
            `,
              )
              .join("")}
          </div>
  `;
}

function renderPostCards(posts, depth = 0) {
  if (!posts.length) {
    return `
          <div class="card-grid">
            <article class="content-card">
              <p class="card-index">文章</p>
              <h3>还没有文章</h3>
              <p>在 <code>content/posts</code> 下新增 Markdown 文件后运行 <code>node build.js</code> 即可生成。</p>
            </article>
          </div>
    `;
  }

  return `
          <div class="card-grid">
            ${posts
              .map((post) => {
                const tags = post.tags.length
                  ? `<div class="tag-row">${post.tags
                      .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
                      .join("")}</div>`
                  : "";

                return `
            <article class="content-card post-card">
              <p class="card-index">${escapeHtml(post.category)} / ${escapeHtml(formatDate(post.date, "short"))}</p>
              <h3>${escapeHtml(post.title)}</h3>
              <p>${escapeHtml(post.summary || "补充摘要后，这里会显示更完整的简介。")}</p>
              ${tags}
              <div class="section-actions compact-actions">
                <a class="text-link" href="${escapeHtml(toRelativePath(`posts/${post.slug}.html`, depth))}">阅读全文</a>
                <span class="muted-text">${post.readingMinutes} 分钟阅读</span>
              </div>
            </article>
                `;
              })
              .join("")}
          </div>
  `;
}

function renderHomeContent(config, posts) {
  const homeCards = [
    { label: "关于", title: config.about.title, body: config.about.copy, href: "./about.html" },
    { label: "研究", title: config.research.title, body: config.research.copy, href: "./research.html" },
    { label: "项目", title: config.building.title, body: config.building.copy, href: "./projects.html" },
  ];

  return `
${renderPageHeader("首页", config.hero.headline, config.hero.summary, [
  { label: "阅读文章", href: "./writing.html" },
  { label: "研究方向", href: "./research.html" },
])}

        <section class="section-block">
${renderSectionHeading("概览", "我希望这个主页长期承载什么", "它不只是入口页，更是一个会持续积累内容的公开工作空间。")}
${renderInfoGrid(config.highlights)}
        </section>

        <section class="section-block">
${renderSectionHeading("导航", "站内主要页面", "每个页面都使用统一全局布局，不再单独做一块巨大的头图。")}
${renderFeatureCards(homeCards)}
        </section>

        <section class="section-block">
${renderSectionHeading("文章", "最近更新", "最新写作会保留在首页，但完整归档放在文章页。")}
${renderPostCards(posts.slice(0, 4))}
        </section>
  `;
}

function renderAboutContent(config) {
  const { site, about } = config;
  return `
${renderPageHeader("关于", about.title, about.copy, [
  { label: "查看研究方向", href: "./research.html" },
  { label: "发送邮件", href: `mailto:${site.email}` },
])}

        <section class="section-block">
${renderSectionHeading("简介", "我是谁", "这部分用来稳定地介绍个人背景、兴趣和这个站点的定位。")}
          <div class="card-grid card-grid-2">
            <article class="content-card">
              <p class="card-index">介绍</p>
              <h3>基本说明</h3>
              <p class="lead-text">${escapeHtml(about.lead)}</p>
              <p>${escapeHtml(about.body)}</p>
            </article>

            <article class="content-card">
              <p class="card-index">关键词</p>
              <h3>我正在关注的内容</h3>
              <div class="tag-row">
                ${about.keywords.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}
              </div>
            </article>
          </div>
        </section>
  `;
}

function renderResearchContent(config) {
  return `
${renderPageHeader("研究", config.research.title, config.research.copy, [
  { label: "查看项目", href: "./projects.html" },
  { label: "阅读文章", href: "./writing.html" },
])}

        <section class="section-block">
${renderSectionHeading("方向", "当前重点", "研究页只讲方向，不再用夸张的大标题占满首屏。")}
${renderTopicCards(config.research.items)}
        </section>
  `;
}

function renderProjectsContent(config) {
  return `
${renderPageHeader("项目", config.building.title, config.building.copy, [
  { label: "主页仓库", href: "https://github.com/Wenhao-Hua/Wenhao-Hua.github.io" },
  { label: "阅读文章", href: "./writing.html" },
])}

        <section class="section-block">
${renderSectionHeading("组织", "项目页准备放什么", "这里更适合放精选项目、实验记录、实现说明和阶段成果。")}
${renderFeatureCards(config.building.items)}
        </section>
  `;
}

function renderWritingContent(posts) {
  return `
${renderPageHeader("文章", "文章与随笔", "所有文章在这里集中展示，每篇文章都可以进入独立详情页。")}

        <section class="section-block">
${renderSectionHeading("归档", "全部文章", "如果以后文章变多，这里就是主要入口。")}
${renderPostCards(posts)}
        </section>
  `;
}

function renderContactContent(config) {
  return `
${renderPageHeader("联系", config.contact.title, config.contact.copy, [
  { label: "发送邮件", href: `mailto:${config.site.email}` },
  { label: "打开 GitHub", href: config.site.github },
])}

        <section class="section-block">
${renderSectionHeading("渠道", "常用链接", "联系页保留最直接的对外入口。")}
${renderLinkCards(config.links)}
        </section>
  `;
}

function renderShell({ site, config, currentPage, title, description, content, depth = 0, bodyClass = "site-page" }) {
  return renderLayout({
    title,
    description,
    stylesheetPath: `${depth > 0 ? "../" : "./"}styles.css?v=20260419-global`,
    bodyClass,
    content: `
    <div class="app-shell">
${renderHeader(site, currentPage, depth)}
      <div class="site-main">
${renderSidebar(site, config, depth)}
        <main class="content-column">
${content}
        </main>
      </div>
${renderFooter(site, depth)}
    </div>
    `,
  });
}

function renderHomePage(config, posts) {
  return renderShell({
    site: config.site,
    config,
    currentPage: "home",
    title: config.site.title,
    description: config.site.description,
    content: renderHomeContent(config, posts),
  });
}

function renderStandardPage(config, currentPage, title, description, content) {
  return renderShell({
    site: config.site,
    config,
    currentPage,
    title,
    description,
    content,
  });
}

function renderPostPage(config, post) {
  const tags = post.tags.length
    ? `<div class="tag-row">${post.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`
    : "";

  return renderShell({
    site: config.site,
    config,
    currentPage: "writing",
    title: `${post.title} | ${config.site.author}`,
    description: post.summary || config.site.description,
    depth: 1,
    bodyClass: "article-page",
    content: `
        <section class="page-header-card">
          <p class="section-label">${escapeHtml(post.category)}</p>
          <h1>${escapeHtml(post.title)}</h1>
          <p class="page-header-copy">${escapeHtml(post.summary)}</p>
          ${tags}
          <div class="meta-row">
            <span>${escapeHtml(config.site.author)}</span>
            <span>${escapeHtml(formatDate(post.date, "long"))}</span>
            <span>${post.readingMinutes} 分钟阅读</span>
          </div>
        </section>

        <article class="article-card">
          <a class="text-link back-link" href="../writing.html">返回文章列表</a>
          <section class="article-body">
            ${post.renderedBody}
          </section>
        </article>
    `,
  });
}

function renderNotFoundPage(config) {
  return renderShell({
    site: config.site,
    config,
    currentPage: "",
    title: `页面不存在 | ${config.site.author}`,
    description: config.site.description,
    content: `
        <section class="page-header-card">
          <p class="section-label">404</p>
          <h1>页面不存在</h1>
          <p class="page-header-copy">你访问的页面不存在，或者已经被移动。</p>
          <div class="section-actions">
            <a class="button button-primary" href="./index.html">返回首页</a>
          </div>
        </section>
    `,
  });
}

function cleanGeneratedRootFiles() {
  for (const fileName of GENERATED_ROOT_FILES) {
    const fullPath = path.join(ROOT, fileName);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
}

function cleanGeneratedPostFiles() {
  ensureDir(OUTPUT_POSTS_DIR);
  for (const fileName of fs.readdirSync(OUTPUT_POSTS_DIR)) {
    if (fileName.endsWith(".html")) {
      fs.unlinkSync(path.join(OUTPUT_POSTS_DIR, fileName));
    }
  }
}

function writeGeneratedFiles(config, posts) {
  cleanGeneratedRootFiles();
  cleanGeneratedPostFiles();

  const rootPages = [
    { file: "index.html", content: renderHomePage(config, posts) },
    {
      file: "about.html",
      content: renderStandardPage(config, "about", `关于 | ${config.site.author}`, config.about.copy, renderAboutContent(config)),
    },
    {
      file: "research.html",
      content: renderStandardPage(
        config,
        "research",
        `研究 | ${config.site.author}`,
        config.research.copy,
        renderResearchContent(config),
      ),
    },
    {
      file: "projects.html",
      content: renderStandardPage(
        config,
        "projects",
        `项目 | ${config.site.author}`,
        config.building.copy,
        renderProjectsContent(config),
      ),
    },
    {
      file: "writing.html",
      content: renderStandardPage(config, "writing", `文章 | ${config.site.author}`, "文章归档与写作页面。", renderWritingContent(posts)),
    },
    {
      file: "contact.html",
      content: renderStandardPage(config, "contact", `联系 | ${config.site.author}`, config.contact.copy, renderContactContent(config)),
    },
    { file: "404.html", content: renderNotFoundPage(config) },
  ];

  for (const page of rootPages) {
    fs.writeFileSync(path.join(ROOT, page.file), page.content, "utf8");
  }

  for (const post of posts) {
    fs.writeFileSync(path.join(OUTPUT_POSTS_DIR, `${post.slug}.html`), renderPostPage(config, post), "utf8");
  }
}

function build() {
  const config = readJson(SITE_CONFIG_PATH);
  const posts = readPosts();
  writeGeneratedFiles(config, posts);
  console.log(`Built ${GENERATED_ROOT_FILES.length} pages and ${posts.length} post(s) into ${ROOT}.`);
}

build();
