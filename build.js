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
      html.push(
        `<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      html.push(
        `<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ol>`,
      );
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

function renderFooter(site, depth = 0) {
  return `
      <footer class="site-footer">
        <p>${escapeHtml(site.author)} / ${escapeHtml(site.affiliation)}</p>
        <div class="footer-links">
          <a href="${escapeHtml(toRelativePath("index.html", depth))}">首页</a>
          <a href="${escapeHtml(site.github)}" target="_blank" rel="noreferrer">GitHub</a>
          <a href="mailto:${escapeHtml(site.email)}">邮箱</a>
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

function renderPageIntro(label, title, summary, actions = []) {
  return `
        <section class="page-intro">
          <p class="section-label">${escapeHtml(label)}</p>
          <h1>${escapeHtml(title)}</h1>
          <p class="page-intro-copy">${escapeHtml(summary)}</p>
          ${
            actions.length
              ? `<div class="hero-actions">${actions
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

function renderHighlightCards(items) {
  return `
        <section class="highlight-grid" aria-label="站点概览">
          ${items
            .map(
              (item) => `
          <article class="highlight-card">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
          </article>
          `,
            )
            .join("")}
        </section>
  `;
}

function renderResearchCards(items) {
  return `
          <div class="card-grid card-grid-3">
            ${items
              .map(
                (item) => `
            <article class="card">
              <p class="card-index">${escapeHtml(item.kicker || "Theme")}</p>
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
          <div class="card-grid card-grid-3">
            ${items
              .map(
                (item) => `
            <${item.href ? "a" : "article"} class="card feature-card"${
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
          <div class="link-grid">
            ${items
              .map(
                (item) => `
            <a class="link-card" href="${escapeHtml(item.href)}"${
                  /^[a-z]+:/i.test(item.href) ? ' target="_blank" rel="noreferrer"' : ""
                }>
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.meta)}</span>
            </a>
            `,
              )
              .join("")}
          </div>
  `;
}

function renderPostCards(posts, options = {}) {
  const { allPostsHref = "./writing.html", depth = 0 } = options;

  if (!posts.length) {
    return `
          <div class="post-grid">
            <article class="post-card post-card-featured">
              <p class="post-meta">还没有文章</p>
              <h3>从第一篇文章开始</h3>
              <p>在 <code>content/posts</code> 下新增 Markdown 文件，然后运行 <code>node build.js</code>。</p>
            </article>
          </div>
    `;
  }

  return `
          <div class="post-grid">
            ${posts
              .map((post, index) => {
                const featuredClass = index === 0 || post.featured ? " post-card-featured" : "";
                const tagMarkup = post.tags.length
                  ? `<div class="tag-row">${post.tags
                      .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
                      .join("")}</div>`
                  : "";

                return `
            <article class="post-card${featuredClass}">
              <p class="post-meta">${escapeHtml(post.category)} / ${escapeHtml(
                formatDate(post.date, "short"),
              )}</p>
              <h3>${escapeHtml(post.title)}</h3>
              <p>${escapeHtml(post.summary || "补充 front matter 后，这里会显示文章摘要。")}</p>
              ${tagMarkup}
              <div class="post-actions">
                <a class="text-link" href="${escapeHtml(toRelativePath(`posts/${post.slug}.html`, depth))}">阅读全文</a>
                <a class="text-link text-link-muted" href="${escapeHtml(allPostsHref)}">全部文章</a>
              </div>
            </article>
                `;
              })
              .join("")}
          </div>
  `;
}

function renderAboutContent(config) {
  const { site, about, highlights } = config;
  return `
${renderPageIntro(
  "关于",
  about.title,
  about.copy,
  [
    { label: "查看研究方向", href: "./research.html" },
    { label: "打开 GitHub", href: site.github },
  ],
)}
${renderHighlightCards(highlights)}
        <section class="section">
${renderSectionHeading("简介", "我是谁", "这一页应该让访问者快速理解我的背景，以及我正在关注什么。")}
          <div class="about-grid">
            <article class="card card-wide">
              <p class="card-index">介绍</p>
              <p class="lead">${escapeHtml(about.lead)}</p>
              <p>${escapeHtml(about.body)}</p>
            </article>

            <article class="card">
              <p class="card-index">关键词</p>
              <div class="tag-row">
                ${about.keywords.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}
              </div>
            </article>

            <article class="card">
              <p class="card-index">联系方式</p>
              <dl class="meta-list">
                <div>
                  <dt>邮箱</dt>
                  <dd><a href="mailto:${escapeHtml(site.email)}">${escapeHtml(site.email)}</a></dd>
                </div>
                <div>
                  <dt>GitHub</dt>
                  <dd><a href="${escapeHtml(site.github)}" target="_blank" rel="noreferrer">${escapeHtml(
                    site.github.replace(/^https?:\/\//, ""),
                  )}</a></dd>
                </div>
                <div>
                  <dt>主页</dt>
                  <dd><a href="${escapeHtml(site.homepage)}" target="_blank" rel="noreferrer">${escapeHtml(
                    site.homepage.replace(/^https?:\/\//, ""),
                  )}</a></dd>
                </div>
              </dl>
            </article>
          </div>
        </section>
  `;
}

function renderResearchContent(config) {
  const { research } = config;
  return `
${renderPageIntro(
  "研究",
  research.title,
  research.copy,
  [
    { label: "查看项目", href: "./projects.html" },
    { label: "阅读文章", href: "./writing.html" },
  ],
)}
        <section class="section">
${renderSectionHeading("方向", "当前关注", "这些主题都可以继续扩展成文章、项目页面，或未来更正式的成果展示。")}
${renderResearchCards(research.items)}
        </section>
  `;
}

function renderProjectsContent(config) {
  const { building, links } = config;
  return `
${renderPageIntro(
  "项目",
  building.title,
  building.copy,
  [
    { label: "阅读文章", href: "./writing.html" },
    { label: "主页仓库", href: links[1] ? links[1].href : "./index.html" },
  ],
)}
        <section class="section">
${renderSectionHeading("内容", "这个页面准备承载什么", "后续这里可以放精选仓库、实验记录、实现说明和阶段性成果。")}
${renderFeatureCards(building.items)}
        </section>
  `;
}

function renderWritingContent(posts) {
  return `
${renderPageIntro(
  "文章",
  "文章与随笔",
  "这一页汇总所有已发布内容，每篇文章都可以跳转到独立详情页。",
  [
    { label: "返回首页", href: "./index.html" },
  ],
)}
        <section class="section">
${renderSectionHeading("归档", "全部文章", "较长的思考和笔记适合放在这里，而不是散落在各个仓库 README 里。")}
${renderPostCards(posts, { allPostsHref: "./writing.html" })}
        </section>
  `;
}

function renderContactContent(config) {
  const { contact, site, links } = config;
  return `
${renderPageIntro(
  "联系",
  contact.title,
  contact.copy,
  [
    { label: "发送邮件", href: `mailto:${site.email}` },
    { label: "打开 GitHub", href: site.github },
  ],
)}
        <section class="section">
${renderSectionHeading("方式", "常用链接", "如果有人先落到这个页面，也应该能方便地继续浏览整站内容。")}
${renderLinkCards(links)}
        </section>
  `;
}

function renderHomePage(config, posts) {
  const { site, hero, highlights, about, research, building } = config;
  const featuredPosts = posts.slice(0, 3);

  return renderStandardPage({
    site,
    currentPage: "home",
    title: site.title,
    description: site.description,
    content: `
        <section class="hero">
          <div class="hero-copy">
            <p class="section-label">${escapeHtml(hero.eyebrow)}</p>
            <h1>${escapeHtml(hero.headline)}</h1>
            <p class="hero-summary">${escapeHtml(hero.summary)}</p>

            <div class="hero-actions">
              <a class="button button-primary" href="./writing.html">${escapeHtml(hero.primaryLabel)}</a>
              <a class="button button-secondary" href="./about.html">浏览页面</a>
            </div>
          </div>

          <aside class="hero-panel">
            <p class="panel-label">${escapeHtml(hero.panelLabel)}</p>
            <h2>${escapeHtml(hero.panelTitle)}</h2>
            <ul class="signal-list">
              ${hero.panelItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </aside>
        </section>

${renderHighlightCards(highlights)}

        <section class="section">
${renderSectionHeading("主页", "从这里开始", "首页现在是整站入口，会把访客引导到其他独立页面。")}
          <div class="card-grid card-grid-3">
            <a class="card feature-card" href="./about.html">
              <p class="card-index">关于</p>
              <h3>${escapeHtml(about.title)}</h3>
              <p>${escapeHtml(about.lead)}</p>
            </a>
            <a class="card feature-card" href="./research.html">
              <p class="card-index">研究</p>
              <h3>${escapeHtml(research.title)}</h3>
              <p>${escapeHtml(research.copy)}</p>
            </a>
            <a class="card feature-card" href="./projects.html">
              <p class="card-index">项目</p>
              <h3>${escapeHtml(building.title)}</h3>
              <p>${escapeHtml(building.copy)}</p>
            </a>
          </div>
        </section>

        <section class="section">
${renderSectionHeading("文章", "精选内容", "最新文章会展示在首页，同时每篇文章仍然保留独立详情页。")}
${renderPostCards(featuredPosts, { allPostsHref: "./writing.html" })}
        </section>
    `,
  });
}

function renderStandardPage({ site, currentPage, title, description, content }) {
  return renderLayout({
    title,
    description,
    stylesheetPath: "./styles.css?v=20260419-multipage",
    bodyClass: "site-page",
    content: `
    <div class="page-shell">
${renderHeader(site, currentPage)}
      <main>
${content}
      </main>
${renderFooter(site)}
    </div>
    `,
  });
}

function renderPostPage(config, post) {
  const { site } = config;
  const tagMarkup = post.tags.length
    ? `<div class="tag-row">${post.tags
        .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
        .join("")}</div>`
    : "";

  return renderLayout({
    title: `${post.title} | ${site.author}`,
    description: post.summary || site.description,
    stylesheetPath: "../styles.css?v=20260419-multipage",
    bodyClass: "article-page",
    content: `
    <div class="page-shell page-shell-article">
${renderHeader(site, "writing", 1)}
      <main class="article-main">
        <div class="article-shell">
          <a class="article-back" href="../writing.html">&larr; 返回文章列表</a>

          <article class="article">
            <header class="article-header">
              <p class="section-label">${escapeHtml(post.category)}</p>
              <h1>${escapeHtml(post.title)}</h1>
              <p class="article-summary">${escapeHtml(post.summary)}</p>
              ${tagMarkup}
              <p class="article-meta">${escapeHtml(site.author)} / ${escapeHtml(
                formatDate(post.date, "long"),
              )} / ${post.readingMinutes} 分钟阅读</p>
            </header>

            <section class="article-body">
              ${post.renderedBody}
            </section>
          </article>
        </div>
      </main>
${renderFooter(site, 1)}
    </div>
    `,
  });
}

function renderNotFoundPage(config) {
  const { site } = config;
  return renderLayout({
    title: `页面不存在 | ${site.author}`,
    description: site.description,
    stylesheetPath: "./styles.css?v=20260419-multipage",
    bodyClass: "article-page",
    content: `
    <div class="page-shell">
${renderHeader(site, "")}
      <main class="article-main">
        <div class="article-shell">
          <article class="article article-centered">
            <p class="section-label">404</p>
            <h1>页面不存在</h1>
            <p class="article-summary">你访问的页面不存在，或者已经被移动。</p>
            <p><a class="button button-primary" href="./index.html">返回首页</a></p>
          </article>
        </div>
      </main>
${renderFooter(site)}
    </div>
    `,
  });
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
    {
      file: "index.html",
      content: renderHomePage(config, posts),
    },
    {
      file: "about.html",
      content: renderStandardPage({
        site: config.site,
        currentPage: "about",
        title: `关于 | ${config.site.author}`,
        description: config.about.copy,
        content: renderAboutContent(config),
      }),
    },
    {
      file: "research.html",
      content: renderStandardPage({
        site: config.site,
        currentPage: "research",
        title: `研究 | ${config.site.author}`,
        description: config.research.copy,
        content: renderResearchContent(config),
      }),
    },
    {
      file: "projects.html",
      content: renderStandardPage({
        site: config.site,
        currentPage: "projects",
        title: `项目 | ${config.site.author}`,
        description: config.building.copy,
        content: renderProjectsContent(config),
      }),
    },
    {
      file: "writing.html",
      content: renderStandardPage({
        site: config.site,
        currentPage: "writing",
        title: `文章 | ${config.site.author}`,
        description: "文章归档与写作页面。",
        content: renderWritingContent(posts),
      }),
    },
    {
      file: "contact.html",
      content: renderStandardPage({
        site: config.site,
        currentPage: "contact",
        title: `联系 | ${config.site.author}`,
        description: config.contact.copy,
        content: renderContactContent(config),
      }),
    },
    {
      file: "404.html",
      content: renderNotFoundPage(config),
    },
  ];

  for (const page of rootPages) {
    fs.writeFileSync(path.join(ROOT, page.file), page.content, "utf8");
  }

  for (const post of posts) {
    const outputPath = path.join(OUTPUT_POSTS_DIR, `${post.slug}.html`);
    fs.writeFileSync(outputPath, renderPostPage(config, post), "utf8");
  }
}

function build() {
  const config = readJson(SITE_CONFIG_PATH);
  const posts = readPosts();
  writeGeneratedFiles(config, posts);
  console.log(`Built ${GENERATED_ROOT_FILES.length} pages and ${posts.length} post(s) into ${ROOT}.`);
}

build();
