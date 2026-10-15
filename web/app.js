/* 主页编辑器 · 前端逻辑（Bootstrap 5 dashboard） */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    n.append(c.nodeType ? c : document.createTextNode(c));
  }
  return n;
}

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error((await r.text()).slice(0, 300) || r.statusText);
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

const enc = s => encodeURIComponent(s);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ================= 全局状态 ================= */

const state = {
  tab: 'dashboard',
  profile: null, content: null, site: null,
  posts: [], currentSlug: null,
  buildStamp: Date.now(),
  lastBuildKey: '',
  buildLog: '', buildState: 'idle',
};

const TITLES = {
  dashboard: '概览', profile: '资料', papers: '论文', blog: '博客', site: '站点内容', preview: '站点预览',
};

/* ================= 构建状态轮询 ================= */

function setPill(pillId, dotId, textId, kind, text) {
  const cls = { idle: 'text-bg-light border', dirty: 'text-bg-warning', err: 'text-bg-danger', ok: 'text-bg-success' }[kind] || 'text-bg-light border';
  $('#' + pillId).className = 'badge rounded-pill ' + cls;
  if (dotId) $('#' + dotId).className = 'status-dot' + (kind === 'dirty' ? ' spin' : '');
  $('#' + textId).textContent = text;
}

async function pollBuild() {
  try {
    const s = await api('/api/build/status');
    const key = s.state + '|' + s.finished + '|' + s.triggered;
    if (key !== state.lastBuildKey) {
      state.lastBuildKey = key;
      state.buildLog = s.log || '';
      state.buildState = s.state;
      state.buildFinished = s.finished;
      if (s.state === 'done') {
        state.buildStamp = Date.now();
        refreshFrames();
        setPill('build-pill', 'build-dot', 'build-text', 'ok', '构建完成 ' + s.finished);
      } else if (s.state === 'error') {
        setPill('build-pill', 'build-dot', 'build-text', 'err', '构建失败 ' + s.finished);
      } else if (s.state === 'running') {
        setPill('build-pill', 'build-dot', 'build-text', 'dirty', '构建中…');
      } else {
        setPill('build-pill', 'build-dot', 'build-text', 'idle', '空闲');
      }
      if (state.tab === 'dashboard') renderDashboardStats();
    }
  } catch (e) { /* 静默 */ }
}

function refreshFrames() {
  $$('iframe[data-frame]').forEach(f => {
    const base = f.dataset.frame;
    if (!base) return;
    f.src = base + (base.includes('?') ? '&' : '?') + 'ts=' + state.buildStamp;
  });
}

setInterval(pollBuild, 1200);

$('#btn-build').onclick = async () => { await api('/api/build', { method: 'POST' }); pollBuild(); };

$('#btn-open-preview').onclick = () => {
  const f = $('iframe[data-frame]');
  if (f && f.src) window.open(f.src, '_blank');
};

function setSave(text, kind) { setPill('save-pill', null, 'save-text', kind || 'idle', text); }

/* ================= 数据存取 ================= */

function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? '' : o[k]), obj); }
function setPath(obj, path, v) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    if (o[ks[i]] == null) o[ks[i]] = {};
    o = o[ks[i]];
  }
  o[ks[ks.length - 1]] = v;
}

async function loadAll() {
  const [profile, content, site, posts] = await Promise.all([
    api('/api/profile'), api('/api/content'), api('/api/site'), api('/api/posts'),
  ]);
  Object.assign(state, { profile, content, site, posts });
}

async function putJSON(path, obj) {
  setSave('保存中…', 'dirty');
  try {
    await api(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj, null, 2),
    });
    setSave('已保存 ' + new Date().toTimeString().slice(0, 8), 'ok');
  } catch (e) {
    setSave('保存失败', 'err');
    alert('保存失败：' + e.message);
  }
}

const field = (labelText, input, col) =>
  el('div', { class: 'col-' + (col || 'md-6') },
    el('label', { class: 'form-label' }, labelText), input);

const mkInput = (attrs = {}) => el('input', { class: 'form-control', ...attrs });
const mkTA = (attrs = {}) => el('textarea', { class: 'form-control', ...attrs });

/* ================= Tab 0 · 概览 ================= */

function renderDashboardStats() {
  const box = $('#dash-stats');
  if (!box) return;
  box.innerHTML = '';
  const stats = [
    ['bi-journal-bookmark-fill', '#286449', state.content?.publications?.length ?? '–', '论文'],
    ['bi-pen-fill', '#3c6e91', state.posts?.length ?? '–', '博客文章'],
    ['bi-hammer', '#9a6b16', state.buildState === 'running' ? '构建中' : (state.buildState === 'error' ? '失败' : '正常'), '构建状态'],
    ['bi-clock-history', '#6b4fa1', state.buildFinished || '—', '最近构建'],
  ];
  stats.forEach(([icon, color, val, label]) => {
    box.append(el('div', { class: 'col-6 col-xl-3' },
      el('div', { class: 'card stat-card' },
        el('div', { class: 'stat-icon', style: 'background:' + color }, el('i', { class: 'bi ' + icon })),
        el('div', {},
          el('div', { class: 'stat-value' }, String(val)),
          el('div', { class: 'stat-label' }, label)),
      )));
  });
}

function renderDashboard(view) {
  const ghUser = (state.profile?.github || '').trim();
  const ghOrg = (state.profile?.lab_org || '').trim();
  const quick = el('div', { class: 'card-body d-flex flex-wrap gap-2' },
    el('button', { class: 'btn btn-success', onclick: async () => { await api('/api/build', { method: 'POST' }); pollBuild(); } },
      el('i', { class: 'bi bi-arrow-clockwise' }), ' 立即构建'),
    el('button', { class: 'btn btn-outline-primary', onclick: () => switchTab('blog') }, el('i', { class: 'bi bi-pen' }), ' 去写博客'),
    el('button', { class: 'btn btn-outline-primary', onclick: () => switchTab('preview') }, el('i', { class: 'bi bi-display' }), ' 站点预览'),
  );
  if (ghUser) quick.append(
    el('button', { class: 'btn btn-outline-secondary', onclick: () => window.open('https://' + ghUser + '.github.io/', '_blank') },
      el('i', { class: 'bi bi-github' }), ' GitHub 个人站'));
  if (ghOrg && ghOrg !== ghUser) quick.append(
    el('button', { class: 'btn btn-outline-secondary', onclick: () => window.open('https://' + ghOrg + '.github.io/', '_blank') },
      el('i', { class: 'bi bi-github' }), ' GitHub 实验室站'));
  view.append(
    el('div', { class: 'row g-3 mb-3', id: 'dash-stats' }),
    el('div', { class: 'card mb-3' },
      el('div', { class: 'card-header' }, '快捷操作'),
      quick),
    el('div', { class: 'card' },
      el('div', { class: 'card-header' }, '发布说明'),
      el('div', { class: 'card-body' },
        el('p', { class: 'hint mb-1', html: '在这里的修改会实时重建到数据目录的 <code>dist/</code> 并可在「站点预览」查看，但<b>不会自动上线</b>。' }),
        el('p', { class: 'hint mb-0' }, '发布上线：把 dist/ 目录上传到你的服务器，或 push 到 GitHub 仓库开启 GitHub Pages 即可。'))),
  );
  renderDashboardStats();
}

/* ================= Tab 1 · 资料 ================= */

const PROFILE_FIELDS = [
  ['name_zh', '姓名（中文）'], ['name_en', '姓名（English）'],
  ['email', '邮箱'], ['github', 'GitHub 用户名'], ['orcid', 'ORCID'],
  ['lab_name_zh', '实验室名称（中文）'], ['lab_name_en', 'Lab name (English)'],
  ['lab_org', 'GitHub 组织账号'], ['affiliation_zh', '单位（中文）'],
  ['affiliation_en', '单位（English）'], ['role_zh', '职称（中文）'],
  ['role_en', '职称（English）'], ['appointment_start', '入职时间'],
  ['updated', '资料更新日期'],
];

function renderProfile(view) {
  const grid = el('div', { class: 'row g-3' });
  PROFILE_FIELDS.forEach(([k, label]) => {
    grid.append(field(label, mkInput({ 'data-k': k, value: state.profile[k] ?? '' })));
  });
  view.append(
    el('div', { class: 'card' },
      el('div', { class: 'card-header' }, '基本信息'),
      el('div', { class: 'card-body' },
        grid,
        el('p', { class: 'hint mt-3 mb-0' }, '保存后自动重新构建站点，「站点预览」页可查看效果。'))),
  );
  view.addEventListener('input', () => setSave('有未保存更改', 'dirty'));
}

async function saveProfile() {
  $$('#view input[data-k]').forEach(i => { state.profile[i.dataset.k] = i.value; });
  await putJSON('/api/profile', state.profile);
}

/* ================= Tab 2 · 论文 ================= */

const ROLES = { first: '第一作者', cofirst: '共同第一作者', collaborator: '合作论文' };
const PAPER_FIELDS = [
  ['title', '标题', 12], ['authors', '作者', 12],
  ['journal', '期刊 · 卷期', 5], ['year', '年份', 2], ['doi', 'DOI', 3], ['role', '作者角色', 2],
];

function paperCard(p, idx, arr) {
  const grid = el('div', { class: 'row g-3' });
  PAPER_FIELDS.forEach(([k, label, col]) => {
    let input;
    if (k === 'role') {
      input = el('select', { class: 'form-select' },
        ...Object.entries(ROLES).map(([v, t]) => el('option', { value: v, selected: p[k] === v ? '' : null }, t)));
    } else if (k === 'year') {
      input = mkInput({ type: 'number', value: p[k] ?? '' });
    } else {
      input = mkInput({ value: p[k] ?? '' });
    }
    input.dataset.k = k;
    grid.append(field(label, input, col >= 12 ? '12' : 'md-' + col));
  });
  return el('div', { class: 'item-card' },
    el('div', { class: 'item-head' },
      el('span', { class: 'no' }, '#' + (idx + 1)),
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn-sm btn-outline-secondary', onclick: () => { swap(arr, idx, -1); renderPapersList(papersListBox); } }, '↑'),
      el('button', { class: 'btn btn-sm btn-outline-secondary', onclick: () => { swap(arr, idx, 1); renderPapersList(papersListBox); } }, '↓'),
      el('button', { class: 'btn btn-sm btn-outline-danger', onclick: () => { if (confirm('删除这篇论文？')) { arr.splice(idx, 1); renderPapersList(papersListBox); setSave('有未保存更改', 'dirty'); } } }, '删除')),
    grid,
  );
}

function swap(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  setSave('有未保存更改', 'dirty');
}

let papersListBox = null;

function renderPapersList(box) {
  box.innerHTML = '';
  const pubs = state.content.publications;
  pubs.forEach((p, i) => box.append(paperCard(p, i, pubs)));
  box.append(el('p', { class: 'hint mt-2 mb-0' }, `共 ${pubs.length} 篇 · 页面上按年份倒序展示`));
}

function renderPapers(view) {
  view.append(
    el('div', { class: 'card' },
      el('div', { class: 'card-header d-flex align-items-center gap-2' },
        '论文列表',
        el('span', { class: 'spacer', style: 'flex:1' }),
        el('button', {
          class: 'btn btn-sm btn-success', onclick: () => {
            state.content.publications.push({ authors: '', year: new Date().getFullYear(), title: '', journal: '', doi: '', role: 'first' });
            renderPapersList(papersListBox);
            setSave('有未保存更改', 'dirty');
          }
        }, '＋ 添加论文')),
      el('div', { class: 'card-body' },
        papersListBox = el('div', {}),
      )),
  );
  renderPapersList(papersListBox);
  view.addEventListener('input', () => setSave('有未保存更改', 'dirty'));
}

async function savePapers() {
  const pubs = [];
  $$('#view .item-card').forEach(card => {
    const p = {};
    $$('input[data-k], select[data-k]', card).forEach(i => {
      p[i.dataset.k] = i.dataset.k === 'year' ? Number(i.value) || 0 : i.value;
    });
    pubs.push(p);
  });
  state.content.publications = pubs;
  await putJSON('/api/content', state.content);
}

/* ================= Tab 3 · 博客 ================= */

let blogTextarea = null, blogMeta = {}, blogFrame = null, blogListBox = null;

function renderBlogList() {
  blogListBox.innerHTML = '';
  const kw = ($('#blog-search')?.value || '').toLowerCase();
  state.posts
    .filter(p => !kw || p.title.toLowerCase().includes(kw))
    .forEach(p => {
      blogListBox.append(el('button', {
        class: 'blog-item' + (p.slug === state.currentSlug ? ' active' : ''),
        onclick: () => selectPost(p.slug),
      },
        el('span', { class: 't' }, p.title || '（无标题）'),
        el('span', { class: 'd' }, p.date + ' · ' + p.slug),
      ));
    });
}

async function selectPost(slug) {
  if (slug == null) {
    state.currentSlug = null;
    renderBlogList();
    $('#blog-editor-pane').style.display = 'none';
    $('#blog-empty').style.display = '';
    return;
  }
  const p = await api('/api/posts/' + enc(slug));
  state.currentSlug = p.slug;
  blogMeta.title.value = p.title;
  blogMeta.date.value = p.date;
  blogMeta.slug.value = p.slug;
  blogTextarea.value = p.body;
  $('#blog-editor-pane').style.display = '';
  $('#blog-empty').style.display = 'none';
  updateBlogFrame();
  renderBlogList();
}

function updateBlogFrame() {
  if (!blogFrame) return;
  const slug = state.currentSlug;
  blogFrame.dataset.frame = '/preview/personal/' + enc(slug) + '/';
  blogFrame.src = blogFrame.dataset.frame + '?ts=' + state.buildStamp;
  blogFrame.style.display = '';
  const empty = $('#blog-empty');
  if (empty) empty.style.display = 'none';
}

const autosave = debounce(async () => {
  if (state.currentSlug == null) return;
  const body = {
    title: blogMeta.title.value,
    date: blogMeta.date.value,
    slug: blogMeta.slug.value,
    body: blogTextarea.value,
  };
  try {
    if (state.currentSlug === '') {
      const p = await api('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      state.currentSlug = p.slug;
      blogMeta.slug.value = p.slug;
      state.posts = await api('/api/posts');
      renderBlogList();
    } else {
      const p = await api('/api/posts/' + enc(state.currentSlug), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (p.slug !== state.currentSlug) {
        state.currentSlug = p.slug;
        state.posts = await api('/api/posts');
        renderBlogList();
      }
    }
    setSave('已自动保存 ' + new Date().toTimeString().slice(0, 8), 'ok');
  } catch (e) {
    setSave('保存失败', 'err');
  }
}, 1200);

function onBlogInput() { setSave('有未保存更改', 'dirty'); autosave(); }

function renderBlog(view) {
  blogMeta = {
    title: mkInput({ placeholder: '标题', oninput: onBlogInput }),
    date: mkInput({ type: 'date', oninput: onBlogInput }),
    slug: mkInput({ placeholder: 'slug（留空自动根据标题生成）', oninput: onBlogInput }),
  };
  blogTextarea = el('textarea', {
    class: 'form-control', placeholder: '# Markdown 正文\n\n支持 GFM 语法：代码块、表格、图片……',
    oninput: onBlogInput, spellcheck: 'false',
  });
  blogListBox = el('div', { class: 'blog-items' });
  blogFrame = el('iframe', { 'data-frame': '', style: 'display:none' });

  const search = mkInput({ id: 'blog-search', placeholder: '搜索文章…', oninput: renderBlogList });
  const newBtn = el('button', {
    class: 'btn btn-success w-100', onclick: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const p = await api('/api/posts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '未命名文章', date: today, slug: '', body: '# 未命名文章\n\n在这里开始写作…\n' }),
      });
      state.posts = await api('/api/posts');
      await selectPost(p.slug);
    }
  }, '＋ 新建文章');

  const delBtn = el('button', {
    class: 'btn btn-sm btn-outline-danger', onclick: async () => {
      if (!state.currentSlug) return;
      if (!confirm('删除这篇文章？不可恢复。')) return;
      await api('/api/posts/' + enc(state.currentSlug), { method: 'DELETE' });
      state.posts = await api('/api/posts');
      await selectPost(state.posts[0]?.slug ?? null);
    }
  }, '删除文章');

  const listCard = el('div', { class: 'card blog-list' },
    el('div', { class: 'card-body' },
      search, newBtn, blogListBox));

  const editorPane = el('div', { class: 'card blog-editor', id: 'blog-editor-pane', style: 'display:none' },
    el('div', { class: 'card-body' },
      el('div', { class: 'row g-2' },
        field('标题', blogMeta.title, 12), field('日期', blogMeta.date, 'md-3'), field('Slug（文章 URL）', blogMeta.slug, 'md-9')),
      blogTextarea,
      el('div', { class: 'd-flex justify-content-end' }, delBtn)));

  const previewCard = el('div', { class: 'card blog-preview' },
    el('div', { class: 'frame-head' },
      el('i', { class: 'bi bi-eye' }), ' 渲染效果（与发布后一致）', el('span', { class: 'spacer' }),
      el('button', { class: 'btn btn-sm btn-link', onclick: () => window.open(blogFrame.src, '_blank') }, '↗ 放大')),
    el('div', { class: 'frame-box' },
      blogFrame,
      el('div', { class: 'empty-tip', id: 'blog-empty' }, '选择或新建一篇文章<br>这里显示<b>构建后的真实网页</b>')));

  view.append(el('div', { class: 'blog-wrap' }, listCard, editorPane, previewCard));

  if (state.posts.length) selectPost(state.currentSlug ?? state.posts[0].slug);
  else renderBlogList();
}

async function saveBlog() { /* 博客是自动保存，无需手动 */ }

/* ================= Tab 4 · 站点内容 ================= */

const SITE_SECTIONS = [
  {
    label: '首页标题与简介', type: 'flat', fields: [
      ['hero.personal.intro_zh', '个人站 · 简介（中文）', 'ta'],
      ['hero.personal.intro_en', '个人站 · 简介（English）', 'ta'],
      ['hero.personal.label_zh', '个人站 · 标签（中文）', 'in'],
      ['hero.personal.label_en', '个人站 · 标签（English）', 'in'],
      ['hero.lab.title_zh', '实验室 · 标题（中文）', 'in'],
      ['hero.lab.title_en', '实验室 · 标题（English）', 'in'],
      ['hero.lab.intro_zh', '实验室 · 简介（中文）', 'ta'],
      ['hero.lab.intro_en', '实验室 · 简介（English）', 'ta'],
    ]
  },
  { label: '研究兴趣（一句话）', type: 'flat', fields: [['research_interests.zh', '中文', 'ta'], ['research_interests.en', 'English', 'ta']] },
  {
    label: '研究方向', type: 'list', key: 'research', item: '方向', fields: [
      ['title_zh', '标题（中文）'], ['title_en', 'Title (English)'],
      ['desc_zh', '简介（中文）', 'ta'], ['desc_en', 'Description (English)', 'ta']]
  },
  {
    label: '教育经历', type: 'list', key: 'education', item: '经历', fields: [
      ['dates', '时间'], ['degree_zh', '学位（中文）'], ['degree_en', 'Degree (English)'],
      ['school_zh', '学校（中文）'], ['school_en', 'School (English)']]
  },
  {
    label: '科研经历', type: 'list', key: 'experience', item: '经历', fields: [
      ['dates', '时间'], ['title_zh', '职位（中文）'], ['title_en', 'Title (English)'],
      ['org_zh', '单位（中文）'], ['org_en', 'Organization (English)']]
  },
  {
    label: '软件与工具', type: 'list', key: 'tools', item: '工具', fields: [
      ['name', '名称'], ['tag', '标签'], ['url', '链接'],
      ['desc_zh', '简介（中文）', 'ta'], ['desc_en', 'Description (English)', 'ta']]
  },
  { label: '项目与奖励', type: 'list', key: 'funding', item: '条目', fields: [['zh', '中文', 'ta'], ['en', 'English', 'ta']] },
  {
    label: '软件著作权', type: 'flat', fields: [
      ['software_copyright.text', '登记信息', 'in'],
      ['software_copyright.note_zh', '备注（中文）', 'in'],
      ['software_copyright.note_en', 'Note (English)', 'in']]
  },
  { label: '专利', type: 'list', key: 'patents', item: '专利', fields: [['zh', '名称（中文）'], ['en', 'Name (English)'], ['number', '申请号']] },
  {
    label: '教学与技术能力', type: 'flat', fields: [
      ['teaching.zh', '可承担课程（中文）', 'ta'], ['teaching.en', 'Teaching areas (English)', 'ta'], ['teaching.skills', '技术技能', 'in']]
  },
  {
    label: '联系区块', type: 'flat', fields: [
      ['contact.heading_zh', '标题（中文）', 'in'], ['contact.heading_en', 'Heading (English)', 'in'],
      ['contact.blurb_zh', '简介（中文）', 'ta'], ['contact.blurb_en', 'Blurb (English)', 'ta']]
  },
];

let siteHost = null;

function siteListItem(sec, item, idx) {
  const grid = el('div', { class: 'row g-3' });
  sec.fields.forEach(([k, label, kind]) => {
    const input = kind === 'ta' ? mkTA({}) : mkInput({});
    input.value = item[k] ?? '';
    input.dataset.k = k;
    grid.append(field(label, input, kind === 'ta' ? 12 : 'md-6'));
  });
  return el('div', { class: 'item-card' },
    el('div', { class: 'item-head' },
      el('span', { class: 'no' }, sec.item + ' #' + (idx + 1)),
      el('span', { class: 'spacer' }),
      el('button', {
        class: 'btn btn-sm btn-outline-danger', onclick: e => {
          if (confirm('删除这一条？')) { e.target.closest('.item-card').remove(); setSave('有未保存更改', 'dirty'); }
        }
      }, '删除')),
    grid);
}

function renderSite(view) {
  siteHost = el('div', { class: 'accordion', id: 'siteAccordion' });
  SITE_SECTIONS.forEach((sec, i) => {
    const open = i === 0;
    const bodyId = 'sec-body-' + i;
    const body = el('div', { class: 'accordion-body' });

    if (sec.type === 'flat') {
      const grid = el('div', { class: 'row g-3' });
      sec.fields.forEach(([path, label, kind]) => {
        const input = kind === 'ta' ? mkTA({}) : mkInput({});
        input.value = getPath(state.site, path) ?? '';
        input.dataset.path = path;
        grid.append(field(label, input, kind === 'ta' ? 12 : 'md-6'));
      });
      body.append(grid);
    } else {
      const box = el('div', { class: 'list-box', 'data-list': sec.key });
      (state.site[sec.key] || []).forEach((item, idx) => box.append(siteListItem(sec, item, idx)));
      body.append(box,
        el('button', {
          class: 'btn btn-outline-success btn-sm mt-2', onclick: () => {
            const obj = {};
            sec.fields.forEach(([k]) => { obj[k] = ''; });
            box.append(siteListItem(sec, obj, box.children.length));
            setSave('有未保存更改', 'dirty');
          }
        }, '＋ 添加' + sec.item));
    }

    siteHost.append(el('div', { class: 'accordion-item' },
      el('h2', { class: 'accordion-header' },
        el('button', {
          class: 'accordion-button' + (open ? '' : ' collapsed'),
          type: 'button', 'data-bs-toggle': 'collapse', 'data-bs-target': '#' + bodyId,
          'aria-expanded': open ? 'true' : 'false',
        }, el('span', { class: 'fw-semibold' }, sec.label))),
      el('div', { id: bodyId, class: 'accordion-collapse collapse' + (open ? ' show' : ''), 'data-bs-parent': '#siteAccordion' }, body)));
  });
  siteHost.addEventListener('input', () => setSave('有未保存更改', 'dirty'));
  view.append(siteHost);
}

async function saveSite() {
  $$('input[data-path], textarea[data-path]', siteHost).forEach(i => setPath(state.site, i.dataset.path, i.value));
  $$('.list-box', siteHost).forEach(box => {
    const arr = [];
    $$('.item-card', box).forEach(card => {
      const obj = {};
      $$('input[data-k], textarea[data-k]', card).forEach(i => { obj[i.dataset.k] = i.value; });
      arr.push(obj);
    });
    state.site[box.dataset.list] = arr;
  });
  await putJSON('/api/site', state.site);
}

/* ================= Tab 5 · 站点预览 ================= */

const PAGES = {
  personal: [['index', '主页'], ['research', '研究'], ['publications', '论文'], ['blog', '博客'], ['cv', 'CV']],
  lab: [['index', '主页'], ['research', '研究'], ['publications', '论文'], ['people', '成员']],
};
let siteFrame = null, previewSel = {};

function renderPreview(view) {
  previewSel = { site: previewSel.site || 'personal', lang: previewSel.lang || 'zh', page: 'index' };
  const siteSel = el('select', {
    class: 'form-select w-auto', onchange: e => { previewSel.site = e.target.value; previewSel.page = 'index'; rebuildPageSel(); updateSiteFrame(); }
  },
    el('option', { value: 'personal', selected: previewSel.site === 'personal' ? '' : null }, '个人站'),
    el('option', { value: 'lab', selected: previewSel.site === 'lab' ? '' : null }, '实验室站'));
  const langSel = el('select', {
    class: 'form-select w-auto', onchange: e => { previewSel.lang = e.target.value; updateSiteFrame(); }
  },
    el('option', { value: 'zh', selected: previewSel.lang === 'zh' ? '' : null }, '中文版'),
    el('option', { value: 'en', selected: previewSel.lang === 'en' ? '' : null }, 'English'));
  const pageSel = el('select', { class: 'form-select w-auto', onchange: e => { previewSel.page = e.target.value; updateSiteFrame(); } });
  const rebuildPageSel = () => {
    pageSel.innerHTML = '';
    PAGES[previewSel.site].forEach(([v, t]) => pageSel.append(el('option', { value: v }, t)));
    pageSel.value = previewSel.page;
  };
  rebuildPageSel();

  siteFrame = el('iframe', { 'data-frame': '' });
  view.append(el('div', { class: 'card site-frame-wrap' },
    el('div', { class: 'card-header d-flex align-items-center gap-3 flex-wrap' },
      el('label', { class: 'd-flex align-items-center gap-2 mb-0' }, '站点', siteSel),
      el('label', { class: 'd-flex align-items-center gap-2 mb-0' }, '语言', langSel),
      el('label', { class: 'd-flex align-items-center gap-2 mb-0' }, '页面', pageSel),
      el('span', { class: 'hint ms-auto mb-0' }, '预览即构建产物，保存后自动刷新')),
    el('div', { class: 'card-body' }, el('div', { class: 'frame-box' }, siteFrame))));
  updateSiteFrame();

  function updateSiteFrame() {
    const base = `/preview/${previewSel.site}/${previewSel.lang}/${previewSel.page}.html`;
    siteFrame.dataset.frame = base;
    siteFrame.src = base + '?ts=' + state.buildStamp;
  }
}

/* ================= Tab 框架 ================= */

const TABS = {
  dashboard: { render: renderDashboard, save: async () => {} },
  profile: { render: renderProfile, save: saveProfile },
  papers: { render: renderPapers, save: savePapers },
  blog: { render: renderBlog, save: saveBlog },
  site: { render: renderSite, save: saveSite },
  preview: { render: renderPreview, save: async () => {} },
};

async function switchTab(name) {
  if (!TABS[name]) return;
  await TABS[state.tab].save?.();
  state.tab = name;
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $('#sidebar').classList.remove('show');
  $('#page-title').textContent = TITLES[name];
  const view = $('#view');
  view.innerHTML = '';
  TABS[name].render(view);
}

$('#nav').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (b) switchTab(b.dataset.tab);
});

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    TABS[state.tab].save?.();
  }
});

/* ================= 启动 ================= */

(async function init() {
  try {
    await loadAll();
    const st = await api('/api/build/status');
    $('#foot').innerHTML =
      '<span class="k">数据目录</span><br>' + (st.data_dir || '') +
      '<br><br><span class="k">快捷键</span> ⌘S 保存';
    await pollBuild();
    switchTab('dashboard');
  } catch (e) {
    $('#view').append(el('div', { class: 'card' },
      el('div', { class: 'card-header text-danger' }, '加载失败'),
      el('div', { class: 'card-body hint' }, String(e.message || e))));
  }
})();
