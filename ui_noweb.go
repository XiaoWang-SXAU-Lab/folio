//go:build !webview

package main

import (
	"log"
	"net"
	"net/http"
	"os/exec"
	"time"
)

// 无 webview 构建（终端/脚本使用）：启动服务后用默认浏览器打开
func run(ln net.Listener, mux *http.ServeMux, url string, noOpen bool) error {
	if !noOpen {
		go func() { time.Sleep(400 * time.Millisecond); exec.Command("open", url).Start() }()
	}
	return http.Serve(ln, mux)
}

var _ = log.Println
