// 主页编辑器（Go 版）：编辑学术主页 + 实验室网站，真实 HTML 预览。
// 数据源：academic-web/（profile.json / content.json / site.json / content/posts/*.md）
package main

import (
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"reflect"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

//go:embed web
var webFS embed.FS

var dataDir string

// ---------- 构建调度 ----------

type buildStatus struct {
	State     string `json:"state"` // idle | running | done | error
	Log       string `json:"log"`
	Finished  string `json:"finished"`  // HH:MM:SS
	Triggered string `json:"triggered"` // 触发原因：manual / auto
	DataDir   string `json:"data_dir,omitempty"`
}

var (
	buildMu      sync.Mutex
	status       = buildStatus{State: "idle", Log: "尚未构建"}
	running      bool
	wantRebuild  bool
	rebuildTimer *time.Timer
	pythonBin    string
)

func findPython() string {
	if p, err := exec.LookPath("python3"); err == nil {
		return p
	}
	if _, err := os.Stat("/usr/bin/python3"); err == nil {
		return "/usr/bin/python3"
	}
	return "python3"
}

func runBuild(reason string) {
	buildMu.Lock()
	if running {
		wantRebuild = true
		buildMu.Unlock()
		return
	}
	running = true
	status = buildStatus{State: "running", Triggered: reason}
	buildMu.Unlock()

	cmd := exec.Command(pythonBin, "build.py")
	cmd.Dir = dataDir
	// 防御性补充 PATH，确保找得到 pandoc
	env := os.Environ()
	for i, e := range env {
		if strings.HasPrefix(e, "PATH=") {
			env[i] = "PATH=/opt/homebrew/bin:/usr/local/bin:" + e[5:]
			break
		}
	}
	cmd.Env = env
	out, err := cmd.CombinedOutput()

	buildMu.Lock()
	logText := strings.TrimSpace(string(out))
	if len(logText) > 4000 {
		logText = logText[len(logText)-4000:]
	}
	if err != nil {
		status = buildStatus{State: "error", Log: logText + "\n" + err.Error(), Finished: now(), Triggered: reason}
	} else {
		status = buildStatus{State: "done", Log: logText, Finished: now(), Triggered: reason}
	}
	running = false
	again := wantRebuild
	wantRebuild = false
	buildMu.Unlock()

	if again {
		time.Sleep(200 * time.Millisecond)
		runBuild("auto")
	}
}

func now() string { return time.Now().Format("15:04:05") }

// 内容变更后防抖自动构建
func scheduleBuild() {
	buildMu.Lock()
	if rebuildTimer != nil {
		rebuildTimer.Stop()
	}
	rebuildTimer = time.AfterFunc(700*time.Millisecond, func() { runBuild("auto") })
	buildMu.Unlock()
}

func buildHandler(w http.ResponseWriter, r *http.Request) {
	go runBuild("manual")
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprint(w, `{"ok":true}`)
}

func buildStatusHandler(w http.ResponseWriter, r *http.Request) {
	buildMu.Lock()
	s := status
	buildMu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s)
}

// ---------- JSON 文件读写 ----------

func readJSONFile(w http.ResponseWriter, name string) {
	b, err := os.ReadFile(filepath.Join(dataDir, name))
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Write(b)
}

// 校验是 JSON 对象后写入（保留 .bak 备份）
func writeJSONFile(w http.ResponseWriter, r *http.Request, name string) {
	body := make([]byte, 0, 1<<20)
	buf := make([]byte, 64<<10)
	for {
		n, err := r.Body.Read(buf)
		body = append(body, buf[:n]...)
		if err != nil {
			break
		}
		if len(body) > 1<<20 {
			http.Error(w, "payload too large", 413)
			return
		}
	}
	var v map[string]any
	if err := json.Unmarshal(body, &v); err != nil {
		http.Error(w, "不是合法的 JSON 对象: "+err.Error(), 400)
		return
	}
	p := filepath.Join(dataDir, name)
	if old, err := os.ReadFile(p); err == nil {
		os.WriteFile(p+".bak", old, 0644)
	}
	if err := os.WriteFile(p, body, 0644); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	scheduleBuild()
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprint(w, `{"ok":true}`)
}

// ---------- 博客文章 ----------

type post struct {
	Slug  string `json:"slug"`
	Title string `json:"title"`
	Date  string `json:"date"`
	Body  string `json:"body,omitempty"`
}

var fmRe = regexp.MustCompile(`(?s)\A---\n(.*?)\n---\n(.*)\z`)

func parsePostFile(path string) (post, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return post{}, err
	}
	var p post
	if m := fmRe.FindStringSubmatch(string(b)); m != nil {
		for _, line := range strings.Split(m[1], "\n") {
			if i := strings.Index(line, ":"); i > 0 {
				k := strings.TrimSpace(line[:i])
				v := strings.Trim(strings.TrimSpace(line[i+1:]), `"`)
				switch k {
				case "title":
					p.Title = v
				case "date":
					p.Date = v
				case "slug":
					p.Slug = v
				}
			}
		}
		p.Body = m[2]
	} else {
		p.Body = string(b)
	}
	if p.Slug == "" {
		p.Slug = strings.TrimSuffix(filepath.Base(path), ".md")
	}
	return p, nil
}

func postsDir() string { return filepath.Join(dataDir, "content", "posts") }

func listPosts(w http.ResponseWriter, r *http.Request) {
	entries, err := os.ReadDir(postsDir())
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	posts := []post{}
	for _, en := range entries {
		if en.IsDir() || !strings.HasSuffix(en.Name(), ".md") {
			continue
		}
		p, err := parsePostFile(filepath.Join(postsDir(), en.Name()))
		if err != nil {
			continue
		}
		posts = append(posts, p)
	}
	sort.Slice(posts, func(i, j int) bool { return posts[i].Date > posts[j].Date })
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(posts)
}

func slugify(s string) string {
	var b strings.Builder
	lastDash := false
	for _, r := range strings.ToLower(s) {
		ok := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r > 127 // 保留中文等非 ASCII
		if ok {
			b.WriteRune(r)
			lastDash = false
		} else if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func slugTaken(slug string) bool {
	_, err := os.Stat(filepath.Join(postsDir(), slug+".md"))
	return err == nil
}

func getPost(w http.ResponseWriter, r *http.Request, slug string) {
	p, err := parsePostFile(filepath.Join(postsDir(), slug+".md"))
	if err != nil {
		http.Error(w, "文章不存在", 404)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(p)
}

func savePost(w http.ResponseWriter, r *http.Request, oldSlug string) {
	var p post
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	if p.Title == "" {
		http.Error(w, "标题不能为空", 400)
		return
	}
	if p.Date == "" {
		p.Date = time.Now().Format("2006-01-02")
	}
	if p.Slug == "" {
		p.Slug = slugify(p.Title)
	}
	if p.Slug == "" {
		p.Slug = "post-" + time.Now().Format("20060102-150405")
	}
	newPath := filepath.Join(postsDir(), p.Slug+".md")
	if oldSlug == "" { // 新建
		if slugTaken(p.Slug) {
			http.Error(w, "slug 已存在："+p.Slug, 409)
			return
		}
	} else if p.Slug != oldSlug { // 改名
		if slugTaken(p.Slug) {
			http.Error(w, "slug 已存在："+p.Slug, 409)
			return
		}
		os.Remove(filepath.Join(postsDir(), oldSlug+".md"))
	}
	content := fmt.Sprintf("---\ntitle: %q\ndate: %q\nslug: %q\n---\n%s", p.Title, p.Date, p.Slug, p.Body)
	if err := os.WriteFile(newPath, []byte(content), 0644); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	scheduleBuild()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(p)
}

func deletePost(w http.ResponseWriter, r *http.Request, slug string) {
	if err := os.Remove(filepath.Join(postsDir(), slug+".md")); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	scheduleBuild()
	fmt.Fprint(w, `{"ok":true}`)
}

func postsHandler(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/posts")
	rest = strings.Trim(rest, "/")
	if rest == "" {
		if r.Method == "GET" {
			listPosts(w, r)
			return
		}
		if r.Method == "POST" {
			savePost(w, r, "")
			return
		}
	}
	slug := rest
	if strings.ContainsAny(slug, "/\\") || slug == "." || slug == ".." {
		http.Error(w, "bad slug", 400)
		return
	}
	switch r.Method {
	case "GET":
		getPost(w, r, slug)
	case "PUT":
		savePost(w, r, slug)
	case "DELETE":
		deletePost(w, r, slug)
	default:
		http.Error(w, "method not allowed", 405)
	}
}

// ---------- 站点预览（真实构建产物） ----------

func previewHandler(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/preview/")
	parts := strings.SplitN(rest, "/", 3)
	if len(parts) < 2 || (parts[0] != "personal" && parts[0] != "lab") {
		http.Error(w, "unknown site", 404)
		return
	}
	root := filepath.Join(dataDir, "dist", parts[0])
	res := ""
	if len(parts) > 1 {
		res = parts[1]
	}
	if len(parts) > 2 {
		res += "/" + parts[2]
	}
	if res == "" {
		res = "zh/index.html"
	}
	clean := filepath.Clean("/" + res)
	full := filepath.Join(root, clean)
	if !strings.HasPrefix(full, root) {
		http.Error(w, "forbidden", 403)
		return
	}
	if st, err := os.Stat(full); err == nil && st.IsDir() {
		full = filepath.Join(full, "index.html")
	}
	if _, err := os.Stat(full); err != nil {
		// 支持无扩展名路径，如 /preview/personal/metminer-data-import
		if _, err2 := os.Stat(full + ".html"); err2 == nil {
			full = full + ".html"
		} else if _, err3 := os.Stat(filepath.Join(full, "index.html")); err3 == nil {
			full = filepath.Join(full, "index.html")
		} else {
			http.NotFound(w, r)
			return
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	// 不用 http.ServeFile：它会把 /xxx/index.html 301 成 /xxx/ 造成循环跳转
	f, err := os.Open(full)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	switch strings.ToLower(filepath.Ext(full)) {
	case ".html":
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	case ".css":
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
	case ".js":
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	case ".json":
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
	case ".svg":
		w.Header().Set("Content-Type", "image/svg+xml")
	case ".png":
		w.Header().Set("Content-Type", "image/png")
	case ".ico":
		w.Header().Set("Content-Type", "image/x-icon")
	case ".pdf":
		w.Header().Set("Content-Type", "application/pdf")
	}
	io.Copy(w, f)
}

// ---------- 主题（YAML → theme.json） ----------

type themeColors struct {
	Bg          string `json:"bg" yaml:"bg"`
	Paper       string `json:"paper" yaml:"paper"`
	Ink         string `json:"ink" yaml:"ink"`
	Muted       string `json:"muted" yaml:"muted"`
	Line        string `json:"line" yaml:"line"`
	Primary     string `json:"primary" yaml:"primary"`
	PrimaryDark string `json:"primary_dark" yaml:"primary_dark"`
	Accent      string `json:"accent" yaml:"accent"`
	Wash        string `json:"wash" yaml:"wash"`
}

type themeFile struct {
	Name        string      `json:"name" yaml:"name"`
	Key         string      `json:"key,omitempty" yaml:"key"`
	Description string      `json:"description,omitempty" yaml:"description"`
	Colors      themeColors `json:"colors" yaml:"colors"`
	FontHeading string      `json:"font_heading,omitempty" yaml:"font_heading"`
}

var hexRe = regexp.MustCompile(`^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$`)

func validateTheme(th *themeFile) error {
	if strings.TrimSpace(th.Name) == "" {
		return errors.New("主题缺少 name 字段")
	}
	v := reflect.ValueOf(th.Colors)
	typ := v.Type()
	for i := 0; i < v.NumField(); i++ {
		c := v.Field(i).String()
		if c == "" {
			continue // 允许留空（回退默认）
		}
		if !hexRe.MatchString(c) {
			return fmt.Errorf("colors.%s 不是合法颜色: %q（应为 #rrggbb 或 #rgb）", typ.Field(i).Tag.Get("yaml"), c)
		}
	}
	return nil
}

func themeHandler(w http.ResponseWriter, r *http.Request) {
	yamlPath := filepath.Join(dataDir, "theme.yaml")
	jsonPath := filepath.Join(dataDir, "theme.json")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	switch r.Method {
	case "GET":
		yamlB, _ := os.ReadFile(yamlPath)
		resp := map[string]any{"yaml": string(yamlB)}
		if jsonB, err := os.ReadFile(jsonPath); err == nil {
			var th themeFile
			if json.Unmarshal(jsonB, &th) == nil {
				resp["current"] = th.Name
			}
		}
		json.NewEncoder(w).Encode(resp)
	case "PUT":
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		var th themeFile
		if err := yaml.Unmarshal(body, &th); err != nil {
			http.Error(w, "YAML 解析失败: "+err.Error(), 400)
			return
		}
		if err := validateTheme(&th); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		jsonB, _ := json.Marshal(th)
		if err := os.WriteFile(jsonPath, jsonB, 0644); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if err := os.WriteFile(yamlPath, body, 0644); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		scheduleBuild()
		json.NewEncoder(w).Encode(map[string]any{"ok": true, "name": th.Name})
	case "DELETE":
		os.Remove(yamlPath)
		os.Remove(jsonPath)
		scheduleBuild()
		fmt.Fprint(w, `{"ok":true}`)
	default:
		http.Error(w, "method not allowed", 405)
	}
}

// ---------- 入口 ----------

func resolveDataDir(flagDir string) (string, error) {
	candidates := []string{}
	if flagDir != "" {
		candidates = append(candidates, flagDir)
	}
	var exeDir string
	if exe, err := os.Executable(); err == nil {
		exeDir = filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, "academic-web"),
			filepath.Join(exeDir, "..", "academic-web"),
			// App 装进 /Applications 后：Contents/MacOS 上三级才是 /Applications
			filepath.Join(exeDir, "..", "..", "..", "academic-web"),
		)
	}
	candidates = append(candidates, "./academic-web", "../academic-web")
	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(c, "profile.json")); err == nil {
			abs, err := filepath.Abs(c)
			if err != nil {
				return "", err
			}
			return abs, nil
		}
	}
	// 找不到数据目录：落到内置的 demo（斯内普教授示例站），拷贝到用户目录后使用
	if dir, err := fallbackToDemo(exeDir); err == nil {
		return dir, nil
	}
	return "", errors.New("找不到数据目录（含 profile.json）。请用 -data 指定，或把数据目录放在程序旁")
}

// 在程序附近查找 demo 目录，拷贝到用户主目录（/Applications 不可写），返回拷贝后的路径
func fallbackToDemo(exeDir string) (string, error) {
	demos := []string{"./demo", "../demo"}
	if exeDir != "" {
		demos = append([]string{
			filepath.Join(exeDir, "demo"),
			filepath.Join(exeDir, "..", "demo"),
			filepath.Join(exeDir, "..", "..", "..", "demo"),
			filepath.Join(exeDir, "..", "Resources", "demo"), // macOS App Bundle
		}, demos...)
	}
	src := ""
	for _, d := range demos {
		if _, err := os.Stat(filepath.Join(d, "profile.json")); err == nil {
			src = d
			break
		}
	}
	if src == "" {
		return "", errors.New("no demo bundled")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dst := filepath.Join(home, "Folio", "demo")
	if _, err := os.Stat(filepath.Join(dst, "profile.json")); err == nil {
		abs, _ := filepath.Abs(dst)
		log.Printf("未找到数据目录，使用已有的演示数据: %s", abs)
		return abs, nil // 已经拷贝过，直接用
	}
	if err := copyDir(src, dst); err != nil {
		return "", err
	}
	abs, _ := filepath.Abs(dst)
	log.Printf("未找到数据目录，已把内置演示数据拷贝到: %s", abs)
	log.Printf("把您自己的数据目录放在程序旁，或用 -data 参数指定，即可编辑自己的网站")
	return abs, nil
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0644)
	})
}

func main() {
	port := flag.Int("port", 7100, "监听端口")
	flagDir := flag.String("data", "", "academic-web 数据目录")
	noOpen := flag.Bool("no-open", false, "启动后不自动打开浏览器")
	flag.Parse()

	dir, err := resolveDataDir(*flagDir)
	if err != nil {
		log.Fatal(err)
	}
	dataDir = dir
	pythonBin = findPython()
	status.DataDir = dir
	log.Printf("数据目录: %s", dataDir)
	log.Printf("python:   %s", pythonBin)
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			// 编辑器静态资源
			clean := path.Clean("/" + strings.TrimPrefix(r.URL.Path, "/"))
			full := path.Join("web", clean)
			if b, err := fs.ReadFile(webFS, full); err == nil {
				ct := "application/octet-stream"
				switch filepath.Ext(full) {
				case ".html":
					ct = "text/html; charset=utf-8"
				case ".js":
					ct = "text/javascript; charset=utf-8"
				case ".css":
					ct = "text/css; charset=utf-8"
				}
				w.Header().Set("Content-Type", ct)
				w.Write(b)
				return
			}
			http.NotFound(w, r)
			return
		}
		b, _ := fs.ReadFile(webFS, "web/index.html")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(b)
	})
	mux.HandleFunc("/api/profile", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			readJSONFile(w, "profile.json")
		} else if r.Method == "PUT" {
			writeJSONFile(w, r, "profile.json")
		}
	})
	mux.HandleFunc("/api/content", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			readJSONFile(w, "content.json")
		} else if r.Method == "PUT" {
			writeJSONFile(w, r, "content.json")
		}
	})
	mux.HandleFunc("/api/site", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			readJSONFile(w, "site.json")
		} else if r.Method == "PUT" {
			writeJSONFile(w, r, "site.json")
		}
	})
	mux.HandleFunc("/api/posts", postsHandler)
	mux.HandleFunc("/api/posts/", postsHandler)
	mux.HandleFunc("/api/build", buildHandler)
	mux.HandleFunc("/api/build/status", buildStatusHandler)
	mux.HandleFunc("/api/theme", themeHandler)
	mux.HandleFunc("/preview/", previewHandler)

	addr := ":" + strconv.Itoa(*port)
	url := "http://localhost" + addr + "/"
	openBrowser := func() {
		if runtime.GOOS == "darwin" && !*noOpen {
			exec.Command("open", url).Start()
		}
	}

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		// 端口被占用：大概率是已有实例在运行，打开浏览器后退出
		log.Printf("端口 %d 已被占用：%v", *port, err)
		openBrowser()
		log.Printf("已尝试在浏览器中打开 %s（若未打开，请检查是否已有实例在运行）", url)
		return
	}
	log.Printf("编辑器: %s", url)
	log.Fatal(run(ln, mux, url, *noOpen))
}
