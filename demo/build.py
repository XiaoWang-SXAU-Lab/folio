"""Build two bilingual static websites (personal + lab) with Markdown blog posts."""
import json, html, shutil, subprocess, re
from pathlib import Path
from urllib.parse import quote

R = Path(__file__).parent
P = json.loads((R / 'profile.json').read_text(encoding='utf-8'))
D = json.loads((R / 'content.json').read_text(encoding='utf-8'))
S = json.loads((R / 'site.json').read_text(encoding='utf-8'))
OUT = R / 'dist'

def e(v):
    return html.escape(str(v), quote=True)

def t(zh, en, lang):
    return zh if lang == 'zh' else en

# ---------------- Markdown 博客 ----------------
def load_posts():
    posts = []
    for f in sorted((R / 'content' / 'posts').glob('*.md')):
        text = f.read_text(encoding='utf-8')
        m = re.match(r'^---\n(.*?)\n---\n(.*)$', text, re.S)
        if not m:
            continue
        fm = {}
        for line in m.group(1).splitlines():
            if ':' in line:
                k, v = line.split(':', 1)
                fm[k.strip()] = v.strip().strip('"')
        posts.append({
            'title': fm.get('title', f.stem),
            'date': fm.get('date', ''),
            'slug': fm.get('slug', f.stem),
            'body': m.group(2).strip(),
        })
    posts.sort(key=lambda p: p['date'], reverse=True)
    return posts

POSTS = load_posts()

def md_to_html(md):
    p = subprocess.run(
        ['pandoc', '-f', 'gfm', '-t', 'html5', '--highlight-style=pygments', '--wrap=none'],
        input=md.encode('utf-8'), capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.decode('utf-8'))
    return p.stdout.decode('utf-8')

def art():
    return '<div class="science"><svg viewBox="0 0 480 490" role="img" aria-label="An abstract botanical illustration connecting a plant with a molecular network"><defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#9cae97" opacity=".28"/></pattern></defs><rect width="480" height="490" fill="url(#dots)"/><g fill="none" stroke="#bcccb7"><circle cx="249" cy="251" r="158"/><circle cx="249" cy="251" r="114"/><path d="M50 251H440M249 60V429" stroke-dasharray="3 7"/></g><g stroke="#416e4c" stroke-width="2" fill="none"><path d="M235 423C222 322 249 242 263 121"/><path d="M241 322C176 296 157 253 138 213M252 247C305 210 332 178 340 141M257 199C210 169 203 126 207 95"/></g><g fill="#4b7952"><path d="M244 339C152 334 152 280 143 264C197 270 238 288 244 339Z"/><path d="M249 288C269 223 325 226 350 215C333 271 301 293 249 288Z"/><path d="M253 232C189 226 187 191 177 166C224 175 250 194 253 232Z"/><path d="M263 175C274 119 309 104 330 95C326 136 306 167 263 175Z"/><path d="M263 135C230 104 250 63 262 42C284 83 280 115 263 135Z"/></g><g fill="none" stroke="#9baf92" stroke-width="1.3"><path d="M68 347L108 368L135 343L108 316Z M108 316L102 276M135 343L172 356M329 348L369 326L405 351L399 390L358 403L329 378Z M369 326L367 285M405 351L442 335M358 403L358 435"/></g><g fill="#b98646"><circle cx="68" cy="347" r="5"/><circle cx="108" cy="316" r="6"/><circle cx="135" cy="343" r="5"/><circle cx="367" cy="285" r="6"/><circle cx="405" cy="351" r="5"/><circle cx="358" cy="403" r="5"/></g></svg><div class="caption"><span>PLANTS · METABOLITES · DATA</span><span>01 / RESEARCH</span></div></div>'

def pubs(lang, selected=False):
    items = sorted(D['publications'], key=lambda x: -x['year'])
    if selected:
        dois = D.get('selected') or [p['doi'] for p in items[:3]]
        by_doi = {p['doi']: p for p in items}
        items = [by_doi[d] for d in dois if d in by_doi]
    result = ''
    for p in items:
        role = {'first': t('第一作者', 'First author', lang), 'cofirst': t('共同第一作者', 'Co-first author', lang), 'collaborator': t('合作论文', 'Co-author', lang)}[p['role']]
        result += f'<article class="pub" data-role="{p["role"]}"><div class="year">{p["year"]}</div><div><h3><a href="https://doi.org/{e(p["doi"])}">{e(p["title"])} ↗</a></h3><p>{e(p["authors"])}</p><p class="journal">{e(p["journal"])} <span class="pill">{role}</span></p></div></article>'
    return result

def research_html(lang):
    return '<div class="grid">' + ''.join(f'<article class="research"><span class="num">0{i+1}</span><h3>{t(x["title_zh"], x["title_en"], lang)}</h3><p>{t(x["desc_zh"], x["desc_en"], lang)}</p></article>' for i, x in enumerate(S['research'])) + '</div>'

def software_html(lang):
    return '<div class="grid">' + ''.join(f'<a class="software" href="{x["url"]}"><span class="eyebrow">{x["tag"]}</span><span class="arrow">↗</span><h3>{x["name"]}</h3><p>{t(x["desc_zh"], x["desc_en"], lang)}</p></a>' for x in S['tools']) + '</div>'

def head(title, desc, lang='zh'):
    return f'<section class="pagehead"><div class="eyebrow">XIAO WANG / {P["updated"]}</div><h1>{title}</h1><p>{desc}</p></section>'

def edu_rows(lang):
    return ''.join(f'<div class="cv-row"><span class="small">{x["dates"]}</span><p><strong>{t(x["degree_zh"], x["degree_en"], lang)}</strong><br>{t(x["school_zh"], x["school_en"], lang)}</p></div>' for x in S['education'])

def exp_rows(lang):
    return ''.join(f'<div class="cv-row"><span class="small">{x["dates"]}</span><p><strong>{t(x["title_zh"], x["title_en"], lang)}</strong><br>{t(x["org_zh"], x["org_en"], lang)}</p></div>' for x in S['experience'])

def cv(lang):
    s = head(t('学术简历', 'Curriculum Vitae', lang), P['name_zh'] + ' · ' + P['name_en'] + ' · ' + P['email'], lang)
    s += f'<div class="actions"><a class="button primary" href="../downloads/Xiao-Wang-CV-{lang.upper()}.pdf">{t("下载中文 PDF", "Download English PDF", lang)} ↓</a><a class="button" href="../{t("en", "zh", lang)}/cv.html">{t("English CV", "中文简历", lang)} ↗</a></div><div class="reading">'
    if P['affiliation_' + lang]:
        s += f'<h2>{t("现任职务", "Current appointment", lang)}</h2><p>{P["appointment_start"]} – {t("至今", "present", lang)}<br>{e(P["role_" + lang])} · {e(P["affiliation_" + lang])}</p>'
    s += f'<h2>{t("研究领域", "Research interests", lang)}</h2><p>{t(S["research_interests"]["zh"], S["research_interests"]["en"], lang)}</p>'
    s += f'<h2>{t("教育经历", "Education", lang)}</h2>' + edu_rows(lang)
    s += f'<h2>{t("科研经历", "Research experience", lang)}</h2>' + exp_rows(lang)
    s += f'<h2>{t("项目与奖励", "Funding & awards", lang)}</h2>' + ''.join(f'<p>{t(x["zh"], x["en"], lang)}</p>' for x in S['funding'])
    s += f'<h2>{t("软件著作权", "Software copyright", lang)}</h2><p>{S["software_copyright"]["text"]}<br>{t(S["software_copyright"]["note_zh"], S["software_copyright"]["note_en"], lang)}</p>'
    s += f'<h2>{t("专利申请（共同发明人）", "Patent applications (co-inventor)", lang)}</h2><ul>' + ''.join(f'<li>{t(x["zh"], x["en"], lang)} · {x["number"]}</li>' for x in S['patents']) + '</ul>'
    s += f'<h2>{t("教学与技术能力", "Teaching areas & technical skills", lang)}</h2><p>{t(S["teaching"]["zh"], S["teaching"]["en"], lang)}</p><p>{S["teaching"]["skills"]}</p>'
    s += f'<h2>{t("论文", "Publications", lang)}</h2>' + pubs(lang) + '</div>'
    return s

def body(site, page, lang):
    islab = site == 'lab'
    if page == 'cv':
        return cv(lang)
    if page == 'publications':
        s = head(t('研究论文', 'Publications', lang), t(P['name_zh'] + '的第一作者、共同第一作者及合作研究成果，包含加入本实验室之前的工作。', 'Research by ' + P['name_en'] + ' as first author, co-first author and collaborator, including work preceding this lab.', lang) if islab else t('第一作者、共同第一作者及合作研究成果。', 'First-author, co-first-author and collaborative research.', lang))
        s += '<div class="filter">' + ''.join(f'<button data-filter="{role}" class="{"active" if role == "all" else ""}" aria-pressed="{str(role == "all").lower()}">{label}</button>' for role, label in [('all', t('全部', 'All', lang)), ('first', t('第一作者', 'First author', lang)), ('cofirst', t('共同第一作者', 'Co-first author', lang)), ('collaborator', t('合作论文', 'Collaborations', lang))]) + f'<input id="search" type="search" aria-label="{t("搜索论文", "Search publications", lang)}" placeholder="{t("搜索标题、作者、期刊…", "Search title, author, journal…", lang)}"></div>'
        return s + f'<p class="small" aria-live="polite"><span id="result-count">{len(D["publications"])}</span> {t("篇论文", "publications", lang)}</p>' + pubs(lang) + f'<p id="empty" class="empty" hidden>{t("没有匹配的论文。", "No matching publications.", lang)}</p>'
    if page == 'research':
        return head(t('研究方向', 'Research', lang), t('从代谢物到分子机制，从组学数据到可用工具。', 'From metabolites to mechanisms. From omics data to accessible tools.', lang)) + research_html(lang) + f'<section class="section"><h2>{t("开放科研软件", "Open research software", lang)}</h2>' + software_html(lang) + '</section>'
    if page == 'blog':
        s = head(t('研究笔记与博客', 'Notes & Blog', lang), t('生物信息学、R / Shiny 与代谢组学分析实践。', 'Practical notes on bioinformatics, R / Shiny and metabolomics. Archived articles are in Chinese.', lang))
        for p in POSTS:
            s += f'<a class="post" href="../{quote(p["slug"])}/"><time>{e(p["date"])}</time><h3>{e(p["title"])}</h3><span>↗</span></a>'
        return s
    if page == 'people':
        return head(t('研究组成员', 'People', lang), t('植物科学与计算方法的交汇。', 'At the intersection of plant science and computational methods.', lang)) + f'<section class="section contact"><div><h2>{e(P["name_zh"])} / {e(P["name_en"])}</h2><p>{e(P["role_" + lang])} · {e(P["affiliation_" + lang])}<br>{P["appointment_start"]} – {t("至今", "present", lang)}</p><p>{t(S["research_interests"]["zh"], S["research_interests"]["en"], lang)}</p></div><a class="button" href="https://{e(P["github"])}.github.io/{lang}/cv.html">{t("个人学术简历", "Academic CV", lang)} ↗</a></section>'
    # ---- index ----
    h = S['hero']
    if islab:
        title = t(h['lab']['title_zh'], h['lab']['title_en'], lang)
        intro = t(h['lab']['intro_zh'], h['lab']['intro_en'], lang)
        label = P['lab_name_' + lang]
    else:
        title = P['name_en'] + '<br><span class="cn">' + e(P['name_zh']) + '</span>'
        intro = t(h['personal']['intro_zh'], h['personal']['intro_en'], lang)
        label = t(h['personal']['label_zh'], h['personal']['label_en'], lang)
    s = f'<section class="hero"><div><div class="eyebrow">{e(label)}</div><h1>{title}</h1><p>{intro}</p>'
    if P['affiliation_' + lang]:
        s += f'<p class="small">{e(P["role_" + lang])} · {e(P["affiliation_" + lang])}</p>'
    s += f'<div class="actions"><a class="button primary" href="{("research" if islab else "publications")}.html">{t("探索研究", "Explore research", lang)} ↗</a><a class="button" href="{("people" if islab else "cv")}.html">{t("研究组成员" if islab else "学术简历", "People" if islab else "Curriculum vitae", lang)}</a></div></div>{art()}</section>'
    s += f'<section class="section"><div class="sectionhead"><h2>{t("研究方向", "Research interests", lang)}</h2><span class="eyebrow">01 / FOCUS</span></div>{research_html(lang)}</section>'
    s += f'<section class="section"><div class="sectionhead"><h2>{t("代表性论文", "Selected publications", lang)}</h2><a href="publications.html">{t("查看全部论文", "All publications", lang)} ↗</a></div>{pubs(lang, True)}</section>'
    s += f'<section class="section"><div class="sectionhead"><h2>{t("软件与开源", "Software & open science", lang)}</h2><span class="eyebrow">03 / TOOLS</span></div>{software_html(lang)}</section>'
    s += f'<section class="section contact"><div><div class="eyebrow">LET’S CONNECT</div><h2>{t(S["contact"]["heading_zh"], S["contact"]["heading_en"], lang)}</h2><p>{t(S["contact"]["blurb_zh"], S["contact"]["blurb_en"], lang)}</p></div><a class="button" href="mailto:{e(P["email"])}">{e(P["email"])} ↗</a></section>'
    return s

def render(site, page, lang):
    lab = site == 'lab'
    other = 'en' if lang == 'zh' else 'zh'
    pages = [('index', t('主页', 'Home', lang)), ('research', t('研究', 'Research', lang)), ('publications', t('论文', 'Publications', lang))] + ([('people', t('成员', 'People', lang))] if lab else [('blog', t('博客', 'Blog', lang)), ('cv', 'CV')])
    brand = P['lab_name_' + lang] if lab else P['name_en'] + ' / ' + P['name_zh']
    nav = ''.join(f'<a href="{p}.html"' + (' aria-current="page"' if page == p else '') + f'>{label}</a>' for p, label in pages)
    if not lab and P['lab_org']:
        nav += f'<a href="https://{P["lab_org"].lower()}.github.io/{lang}/index.html">{t("实验室", "Lab", lang)} ↗</a>'
    title = dict(pages).get(page, 'CV') + ' · ' + brand
    return f'<!doctype html><html lang="{t("zh-CN", "en", lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(title)}</title><meta name="description" content="{e(brand)}"><meta name="theme-color" content="#286449"><link rel="icon" href="../favicon.ico" sizes="16x16 32x32 48x48"><link rel="apple-touch-icon" href="../assets/lab-icon-180.png"><link rel="stylesheet" href="../assets/style.css"><link rel="alternate" hreflang="{other}" href="../{other}/{page}.html"><script src="../assets/site.js" defer></script></head><body><a class="skip" href="#main">{t("跳至正文", "Skip to content", lang)}</a><header><div class="wrap nav"><a class="brand" href="index.html"><img class="mark" src="../assets/lab-icon-512.png" alt="{e(brand)}" width="40" height="40">{e(brand)}</a><nav aria-label="{t("主导航", "Main navigation", lang)}">{nav}<a class="lang" href="../{other}/{page}.html" lang="{other}">{t("EN", "中文", lang)}</a></nav></div></header><main class="wrap" id="main">{body(site, page, lang)}</main><footer><div class="wrap foot"><span>© 2026 {e(brand)}</span><span><a href="https://github.com/{e(P["lab_org"] if lab and P["lab_org"] else P["github"])}">GitHub ↗</a> &nbsp; / &nbsp; <a href="https://orcid.org/{P["orcid"]}">ORCID ↗</a></span></div></footer></body></html>'

def post_page(title, date, body_html):
    brand = P['name_en'] + ' / ' + P['name_zh']
    lab_org = P['lab_org']
    pages = [('index', '主页'), ('research', '研究'), ('publications', '论文'), ('blog', '博客'), ('cv', 'CV')]
    nav = ''.join(f'<a href="../zh/{p}.html"' + (' aria-current="page"' if p == 'blog' else '') + f'>{label}</a>' for p, label in pages)
    if lab_org:
        nav += f'<a href="https://{lab_org.lower()}.github.io/zh/index.html">实验室 ↗</a>'
    return f'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(title)} · {brand}</title><meta name="description" content="{e(title)}"><meta name="theme-color" content="#286449"><link rel="icon" href="../favicon.ico" sizes="16x16 32x32 48x48"><link rel="apple-touch-icon" href="../assets/lab-icon-180.png"><link rel="stylesheet" href="../assets/style.css"><link rel="stylesheet" href="../assets/highlight.css"><script src="../assets/site.js" defer></script></head><body><a class="skip" href="#main">跳至正文</a><header><div class="wrap nav"><a class="brand" href="../zh/index.html"><img class="mark" src="../assets/lab-icon-512.png" alt="{brand}" width="40" height="40">{brand}</a><nav aria-label="主导航">{nav}<a class="lang" href="../en/blog.html" lang="en">EN</a></nav></div></header><main class="wrap" id="main"><article class="postpage"><header class="posthead"><a class="small" href="../zh/blog.html">← {e("博客")}</a><h1>{e(title)}</h1><time>{e(date)}</time></header><div class="prose">{body_html}</div></article></main><footer><div class="wrap foot"><span>© 2026 {brand}</span><span><a href="https://github.com/{e(P["github"])}">GitHub ↗</a> &nbsp; / &nbsp; <a href="https://orcid.org/{P["orcid"]}">ORCID ↗</a></span></div></footer></body></html>'

def build():
    for site in ['personal', 'lab']:
        dest = OUT / site
        if dest.exists():
            shutil.rmtree(dest)
        dest.mkdir(parents=True, exist_ok=True)
        shutil.copytree(R / 'assets', dest / 'assets', dirs_exist_ok=True)
        shutil.copy(R / 'assets' / 'favicon.ico', dest / 'favicon.ico')
        (dest / '.nojekyll').write_text('', encoding='utf-8')
        (dest / 'downloads').mkdir(exist_ok=True)
        for lang in ['zh', 'en']:
            (dest / lang).mkdir(exist_ok=True)
            for page in ['index', 'research', 'publications'] + (['people'] if site == 'lab' else ['blog', 'cv']):
                (dest / lang / (page + '.html')).write_text(render(site, page, lang), encoding='utf-8')
        if site == 'personal':
            for p in POSTS:
                d = dest / p['slug']
                d.mkdir(parents=True, exist_ok=True)
                (d / 'index.html').write_text(post_page(p['title'], p['date'], md_to_html(p['body'])), encoding='utf-8')
        (dest / 'index.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=zh/index.html"><title>' + e(P['lab_name_zh'] if site == 'lab' else P['name_zh'] + ' | ' + P['name_en']) + '</title><a href="zh/index.html">中文</a> · <a href="en/index.html">English</a></html>', encoding='utf-8')
    print('Built personal and lab websites in', OUT)

if __name__ == '__main__':
    build()
