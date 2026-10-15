# Folio · 学术主页与实验室网站编辑器

Folio 是一个本地运行的学术网站编辑器：用 Dashboard 界面编辑你的个人学术主页和实验室网站，所见即所得地预览真实构建产物，写博客、改论文列表、更新研究方向，保存即自动重新构建。

内置一套示例数据（霍格沃兹魔药学实验室 · 斯内普教授），开箱即可体验；换成自己的数据后，即可用它搭建并维护**任何**实验室的网站。

## 功能

- **资料编辑**：姓名、单位、职称、邮箱、ORCID、GitHub 等
- **论文管理**：发表列表、代表性论文（自动高亮）
- **博客写作**：Markdown 撰写 + front matter，自动渲染
- **站点内容**：研究方向、团队成员、基金项目、专利、教学、开源工具……全部可视化编辑
- **真实预览**：iframe 直接加载构建产物，看到的就是发布后的效果
- **自动构建**：保存后防抖 0.7s 自动重建，无需手动操作

## 快速开始（macOS）

1. 在 [Releases](../../releases) 下载最新的 `Folio-x.y.z.dmg`（Apple Silicon / arm64），双击挂载后把 **Folio** 拖进 Applications
2. 启动 Folio：
   - 没有数据目录时自动使用内置的**演示数据**（斯内普教授示例站），体验全部功能
   - 把自己的数据目录放到 `/Applications/academic-web/`，或用命令行 `-data` 参数指定，即可编辑自己的网站
3. 界面内修改自动保存并重建，在「站点预览」页查看效果

## 换成自己的数据

数据目录结构（即本仓库 `demo/` 的样子）：

```
academic-web/
├── profile.json      # 个人信息：姓名、单位、邮箱、ORCID、GitHub……
├── content.json      # 论文列表、代表性论文
├── site.json         # 站点内容：研究方向、团队、基金、教学……（中英双语）
├── content/posts/    # 博客 Markdown 文件（含 front matter）
├── assets/           # 图标等静态资源
├── build.py          # 构建脚本（把数据编译成 dist/ 下的静态网站）
└── dist/             # 构建产物（个人站 + 实验室站，双语）
```

最简单的方式：直接打开 Folio，在界面里逐项填写保存。也可以在界面里熟悉字段含义后，整体替换 JSON 文件。

## 从源码构建

需要 Go 1.22+。

```bash
# 命令行版（浏览器访问 http://localhost:7100）
go build -o home-editor .
./home-editor -data /path/to/academic-web

# macOS 原生窗口版（系统 WebKit，无需 Chrome）
CGO_ENABLED=1 go build -tags webview -o folio .
./folio -data /path/to/academic-web
```

打包 dmg（仅限 macOS）：

```bash
./build-app.sh   # 产物：dist/Folio.app + Folio-2.0.0.dmg
```

## Windows 编译

CGO 不能跨平台编译，Windows 版需要在 Windows 上构建：

1. 安装 [Go](https://go.dev/dl/) 和 [MSYS2](https://www.msys2.org/)（`pacman -S mingw-w64-ucrt-x86_64-gcc`）
2. `set CGO_ENABLED=1 && go build -tags webview -ldflags "-H windowsgui" -o folio.exe .`

## 构建网站的其他依赖

`build.py` 用 pandoc 渲染 Markdown，需要 [pandoc](https://pandoc.org/installing.html)（`brew install pandoc` 或官网下载）。Python 3 即可，无第三方依赖。

## 发布上线

编辑器只负责**修改与本地构建**。发布到线上：

- **GitHub Pages**：把数据目录 push 到仓库，用 Actions 或本地构建后把 `dist/` 推到 `gh-pages` 分支
- **自己的服务器**：把 `dist/` 里的静态文件上传到 Web 目录（nginx/apache 均可）

## 主题

Folio 内置 4 套主题（松林绿 / 海洋蓝 / 绛红 / 墨色），在「主题」页一键切换；也可以上传自定义 YAML 主题文件，或直接编辑 YAML 文本 DIY。更多主题与格式说明见 [folio-themes](https://github.com/XiaoWang-SXAU-Lab/folio-themes)。

```yaml
name: 我的主题
colors:
  bg: "#f5f8fa"        # 页面背景
  paper: "#ffffff"     # 卡片/纸张底色
  ink: "#1c2b36"       # 正文文字
  muted: "#5d707c"     # 次要文字
  line: "#d8e2ea"      # 边框分隔线
  primary: "#2a5d8f"   # 主色（按钮、链接、强调）
  primary_dark: "#1f4769"  # 主色悬停
  accent: "#c07a3a"    # 点缀色（引用、图标）
  wash: "#e8f0f6"      # 浅色块背景
font_heading: "'Libre Caslon Display', Georgia, serif"  # 可选：标题字体
```

所有字段可选；主题保存在数据目录的 `theme.yaml` / `theme.json`，删除即恢复默认。

## 数据放在哪里

推荐把数据目录放到私有 Git 仓库托管（网站内容是公开信息，但方便多机同步与版本历史）。Folio 按以下顺序查找数据目录：

1. `-data` 命令行参数
2. 程序旁的 `academic-web/`（含 App Bundle 的 `Resources/`、`/Applications/academic-web/`）
3. 当前目录及上一级的 `academic-web/`
4. 都找不到 → 自动拷贝内置演示数据到 `~/Folio/demo` 使用

## 许可

MIT（Bootstrap Icons 等第三方资源遵循其原有许可）
