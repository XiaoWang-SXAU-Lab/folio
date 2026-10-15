//go:build webview

package main

import (
	"log"
	"net"
	"net/http"

	webview "github.com/webview/webview_go"
)

// webview 构建（封装成 .app）：系统 WebKit 原生窗口，不打开浏览器
func run(ln net.Listener, mux *http.ServeMux, url string, noOpen bool) error {
	go func() {
		if err := http.Serve(ln, mux); err != nil {
			log.Printf("HTTP 服务停止: %v", err)
		}
	}()

	w := webview.New(false)
	defer w.Destroy()
	w.SetTitle("Folio · 学术主页编辑器")
	w.SetSize(1280, 820, webview.HintNone)
	w.Navigate(url)
	w.Run() // 阻塞，直到用户关闭窗口
	log.Println("窗口已关闭")
	return nil
}
