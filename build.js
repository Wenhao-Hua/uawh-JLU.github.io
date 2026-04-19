const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONTENT_DIR = path.join(ROOT, "content");
const POSTS_DIR = path.join(CONTENT_DIR, "posts");
const OUTPUT_POSTS_DIR = path.join(ROOT, "posts");
const SITE_CONFIG_PATH = path.join(CONTENT_DIR, "site.json");

const ROOT_PAGES = [
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00Z`);
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
      const raw = fs.readFileSync(path.join(POSTS_DIR, fileName), "utf8");
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
        renderedBody: renderMarkdown(body),
        readingMinutes: estimateReadingMinutes(body),
      };
    })
    .sort((left, right) => parseDateValue(right.date) - parseDateValue(left.date));

  const slugs = new Set();
  for (const post of posts) {
    if (slugs.has(post.slug)) throw new Error(`Duplicate slug "${post.slug}"`);
    slugs.add(post.slug);
  }

  return posts;
}

function toRelativePath(fileName, depth) {
  return `${depth > 0 ? "../".repeat(depth) : "./"}${fileName}`;
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
          <span class="brand-avatar">WH</span>
          <span class="brand-text">
            <strong>${escapeHtml(site.author)}</strong>
            <span>${escapeHtml(site.affiliation)}</span>
          </span>
        </a>

        <nav class="site-nav" aria-label="主导航">
          ${NAV_ITEMS.map((item) => {
            const active = item.key === currentPage ? " is-current" : "";
            return `<a class="site-nav-link${active}" href="${escapeHtml(toRelativePath(item.file, depth))}">${escapeHtml(
              item.label,
            )}</a>`;
          }).join("")}
        </nav>
      </header>
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

function renderActionButtons(items) {
  return `
          <div class="action-row">
            ${items
              .map(
                (item, index) =>
                  `<a class="button ${index === 0 ? "button-primary" : "button-secondary"}" href="${escapeHtml(
                    item.href,
                  )}"${/^[a-z]+:/i.test(item.href) ? ' target="_blank" rel="noreferrer"' : ""}>${escapeHtml(
                    item.label,
                  )}</a>`,
              )
              .join("")}
          </div>
  `;
}

function renderSocialLinks(items) {
  return `
          <div class="social-row">
            ${items
              .map(
                (item) =>
                  `<a class="social-link" href="${escapeHtml(item.href)}"${
                    /^[a-z]+:/i.test(item.href) ? ' target="_blank" rel="noreferrer"' : ""
                  }>${escapeHtml(item.label)}</a>`,
              )
              .join("")}
          </div>
  `;
}

function renderEntryCards(items) {
  return `
          <div class="entry-grid">
            ${items
              .map(
                (item) => `
            <a class="entry-card" href="${escapeHtml(item.href)}"${
                  /^[a-z]+:/i.test(item.href) ? ' target="_blank" rel="noreferrer"' : ""
                }>
              <p class="entry-label">${escapeHtml(item.label)}</p>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.body)}</p>
            </a>
            `,
              )
              .join("")}
          </div>
  `;
}

function renderFactCards(items) {
  return `
          <div class="fact-grid">
            ${items
              .map(
                (item) => `
            <article class="fact-card">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.value)}</strong>
            </article>
            `,
              )
              .join("")}
          </div>
  `;
}

function renderContentCards(items) {
  return `
          <div class="content-grid two-up">
            ${items
              .map(
                (item) => `
            <article class="content-card">
              <p class="content-eyebrow">${escapeHtml(item.kicker || item.label || "内容")}</p>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.body)}</p>
            </article>
            `,
              )
              .join("")}
          </div>
  `;
}

function renderLinkCards(items) {
  return `
          <div class="content-grid two-up">
            ${items
              .map(
                (item) => `
            <a class="content-card link-card" href="${escapeHtml(item.href)}"${
                  /^[a-z]+:/i.test(item.href) ? ' target="_blank" rel="noreferrer"' : ""
                }>
              <p class="content-eyebrow">${escapeHtml(item.label)}</p>
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
          <div class="content-grid">
            <article class="content-card">
              <p class="content-eyebrow">文章</p>
              <h3>还没有文章</h3>
              <p>在 <code>content/posts</code> 里新增 Markdown 文件后，运行 <code>node build.js</code> 就能生成。</p>
            </article>
          </div>
    `;
  }

  return `
          <div class="content-grid">
            ${posts
              .map((post) => {
                const tagRow = post.tags.length
                  ? `<div class="tag-row">${post.tags
                      .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
                      .join("")}</div>`
                  : "";

                return `
            <article class="content-card post-card">
              <p class="content-eyebrow">${escapeHtml(post.category)} / ${escapeHtml(formatDate(post.date, "short"))}</p>
              <h3>${escapeHtml(post.title)}</h3>
              <p>${escapeHtml(post.summary)}</p>
              ${tagRow}
              <div class="content-meta">
                <a class="text-link" href="${escapeHtml(toRelativePath(`posts/${post.slug}.html`, depth))}">阅读全文</a>
                <span>${post.readingMinutes} 分钟阅读</span>
              </div>
            </article>
                `;
              })
              .join("")}
          </div>
  `;
}

function renderPageHero(label, title, subtitle) {
  return `
        <section class="page-hero">
          <p class="section-label">${escapeHtml(label)}</p>
          <h1>${escapeHtml(title)}</h1>
          <p class="page-subtitle">${escapeHtml(subtitle)}</p>
        </section>
  `;
}

function renderShell({ site, currentPage, title, description, stylesheetPath, content, depth = 0, bodyClass = "" }) {
  return renderLayout({
    title,
    description,
    stylesheetPath,
    bodyClass,
    content: `
    <div class="shell">
${renderHeader(site, currentPage, depth)}
      <main class="page-main">
${content}
      </main>
${renderFooter(site, depth)}
    </div>
    `,
  });
}

function renderHomePage(config, posts) {
  const featuredPosts = posts.slice(0, 3);
  const homeEntries = [
    { label: "关于", title: config.about.title, body: config.about.copy, href: "./about.html" },
    { label: "研究", title: config.research.title, body: config.research.copy, href: "./research.html" },
    { label: "项目", title: config.building.title, body: config.building.copy, href: "./projects.html" },
    { label: "文章", title: "文章与随笔", body: "查看研究笔记、项目记录和较长篇幅的写作内容。", href: "./writing.html" },
  ];

  return renderShell({
    site: config.site,
    currentPage: "home",
    title: config.site.title,
    description: config.site.description,
    stylesheetPath: "./styles.css?v=20260419-ref-home",
    content: `
        <section class="cover-shell">
          <div class="cover-panel">
            <div class="cover-avatar">WH</div>
            <p class="cover-kicker">${escapeHtml(config.home.kicker)}</p>
            <h1>${escapeHtml(config.home.title)}</h1>
            <p class="cover-subtitle">${escapeHtml(config.home.subtitle)}</p>
            <p class="cover-summary">${escapeHtml(config.home.summary)}</p>
            <p class="cover-quote">${escapeHtml(config.home.quote)}</p>
${renderActionButtons([
  { label: config.home.primaryLabel, href: config.home.primaryHref },
  { label: config.home.secondaryLabel, href: config.home.secondaryHref },
])}
${renderSocialLinks(config.links)}
          </div>
        </section>

        <section class="content-section">
${renderSectionHeading("导航", "站内入口", "参考这两个主页的思路：首屏只负责建立第一印象，详细内容交给下面的入口页。")}
${renderEntryCards(homeEntries)}
        </section>

        <section class="content-section">
${renderSectionHeading("概览", "主页当前聚焦", "保持信息简洁，不在首屏堆太多说明。")}
${renderFactCards(config.highlights)}
        </section>

        <section class="content-section">
${renderSectionHeading("文章", "最近更新", "最近的写作保留在主页，但完整归档仍然在文章页。")}
${renderPostCards(featuredPosts)}
        </section>
    `,
  });
}

function renderAboutPage(config) {
  const cards = [
    { kicker: "简介", title: "我是谁", body: config.about.lead },
    { kicker: "定位", title: "为什么做这个站点", body: config.about.body },
    { kicker: "关键词", title: "研究兴趣", body: config.about.keywords.join(" / ") },
  ];

  return renderShell({
    site: config.site,
    currentPage: "about",
    title: `关于 | ${config.site.author}`,
    description: config.about.copy,
    stylesheetPath: "./styles.css?v=20260419-ref-home",
    content: `
${renderPageHero("关于", config.about.title, config.about.copy)}
        <section class="content-section">
${renderContentCards(cards)}
        </section>
    `,
  });
}

function renderResearchPage(config) {
  return renderShell({
    site: config.site,
    currentPage: "research",
    title: `研究 | ${config.site.author}`,
    description: config.research.copy,
    stylesheetPath: "./styles.css?v=20260419-ref-home",
    content: `
${renderPageHero("研究", config.research.title, config.research.copy)}
        <section class="content-section">
${renderContentCards(config.research.items)}
        </section>
    `,
  });
}

function renderProjectsPage(config) {
  return renderShell({
    site: config.site,
    currentPage: "projects",
    title: `项目 | ${config.site.author}`,
    description: config.building.copy,
    stylesheetPath: "./styles.css?v=20260419-ref-home",
    content: `
${renderPageHero("项目", config.building.title, config.building.copy)}
        <section class="content-section">
${renderEntryCards(config.building.items)}
        </section>
    `,
  });
}

function renderWritingPage(config, posts) {
  return renderShell({
    site: config.site,
    currentPage: "writing",
    title: `文章 | ${config.site.author}`,
    description: "文章归档与写作页面。",
    stylesheetPath: "./styles.css?v=20260419-ref-home",
    content: `
${renderPageHero("文章", "文章与随笔", "这里集中展示所有已发布的内容，每篇文章都保留独立详情页。")}
        <section class="content-section">
${renderPostCards(posts)}
        </section>
    `,
  });
}

function renderContactPage(config) {
  return renderShell({
    site: config.site,
    currentPage: "contact",
    title: `联系 | ${config.site.author}`,
    description: config.contact.copy,
    stylesheetPath: "./styles.css?v=20260419-ref-home",
    content: `
${renderPageHero("联系", config.contact.title, config.contact.copy)}
        <section class="content-section">
${renderLinkCards(config.links)}
        </section>
    `,
  });
}

function renderPostPage(config, post) {
  const tags = post.tags.length
    ? `<div class="tag-row">${post.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`
    : "";

  return renderShell({
    site: config.site,
    currentPage: "writing",
    title: `${post.title} | ${config.site.author}`,
    description: post.summary || config.site.description,
    stylesheetPath: "../styles.css?v=20260419-ref-home",
    depth: 1,
    bodyClass: "article-page",
    content: `
${renderPageHero(post.category, post.title, post.summary)}
        <section class="content-section article-section">
          <div class="content-meta article-top-meta">
            <span>${escapeHtml(config.site.author)}</span>
            <span>${escapeHtml(formatDate(post.date, "long"))}</span>
            <span>${post.readingMinutes} 分钟阅读</span>
          </div>
          ${tags}
          <a class="text-link article-back" href="../writing.html">返回文章列表</a>
          <article class="article-card">
            <section class="article-body">
              ${post.renderedBody}
            </section>
          </article>
        </section>
    `,
  });
}

function renderNotFoundPage(config) {
  return renderShell({
    site: config.site,
    currentPage: "",
    title: `页面不存在 | ${config.site.author}`,
    description: config.site.description,
    stylesheetPath: "./styles.css?v=20260419-ref-home",
    content: `
${renderPageHero("404", "页面不存在", "你访问的页面不存在，或者已经被移动。")}
        <section class="content-section">
${renderActionButtons([{ label: "返回首页", href: "./index.html" }])}
        </section>
    `,
  });
}

function cleanRootPages() {
  for (const fileName of ROOT_PAGES) {
    const fullPath = path.join(ROOT, fileName);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }
}

function cleanPostPages() {
  ensureDir(OUTPUT_POSTS_DIR);
  for (const fileName of fs.readdirSync(OUTPUT_POSTS_DIR)) {
    if (fileName.endsWith(".html")) fs.unlinkSync(path.join(OUTPUT_POSTS_DIR, fileName));
  }
}

function writePages(config, posts) {
  cleanRootPages();
  cleanPostPages();

  const pages = [
    { file: "index.html", content: renderHomePage(config, posts) },
    { file: "about.html", content: renderAboutPage(config) },
    { file: "research.html", content: renderResearchPage(config) },
    { file: "projects.html", content: renderProjectsPage(config) },
    { file: "writing.html", content: renderWritingPage(config, posts) },
    { file: "contact.html", content: renderContactPage(config) },
    { file: "404.html", content: renderNotFoundPage(config) },
  ];

  for (const page of pages) {
    fs.writeFileSync(path.join(ROOT, page.file), page.content, "utf8");
  }

  for (const post of posts) {
    fs.writeFileSync(path.join(OUTPUT_POSTS_DIR, `${post.slug}.html`), renderPostPage(config, post), "utf8");
  }
}

function build() {
  const config = readJson(SITE_CONFIG_PATH);
  const posts = readPosts();
  writePages(config, posts);
  console.log(`Built ${ROOT_PAGES.length} pages and ${posts.length} post(s) into ${ROOT}.`);
}

build();
