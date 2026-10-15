#!/bin/bash
# 主页编辑器 · Windows 打包脚本：编译 exe（带图标）→ 组装 zip 发行包
# 依赖：Go 1.27+、MinGW gcc/windres（MSYS2 或 w64devkit），CGO 无法跨平台编译，须在 Windows 上运行
set -e
cd "$(dirname "$0")"

VERSION="2.1.0"
APP_NAME="Folio"
PKG_NAME="$APP_NAME-$VERSION-windows-x64"
DIST="dist"

echo "==> 编译 Windows 资源（图标 + 版本信息）"
windres -i folio.rc -O coff -o folio.syso

echo "==> 编译 Go 二进制（WebView2 原生窗口版）"
CGO_ENABLED=1 go build -tags webview -trimpath -ldflags "-s -w -H windowsgui" -o "$DIST/$APP_NAME.exe" .

echo "==> 组装 $PKG_NAME"
rm -rf "$DIST/$PKG_NAME" "$DIST/$PKG_NAME.zip"
mkdir -p "$DIST/$PKG_NAME"
cp "$DIST/$APP_NAME.exe" "$DIST/$PKG_NAME/"
# 打包内置演示数据（斯内普教授示例站），放在 exe 旁；无数据目录时自动拷贝到 ~/Folio/demo 使用
cp -R demo "$DIST/$PKG_NAME/demo"

echo "==> 生成 ZIP（需要 Python 3）"
python3 - <<PYEOF
import os, zipfile
root = os.path.join("$DIST", "$PKG_NAME")
zpath = root + ".zip"
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for base, _, files in os.walk(root):
        for f in files:
            p = os.path.join(base, f)
            z.write(p, os.path.relpath(p, "$DIST"))
print("zip:", zpath)
PYEOF

rm -rf "$DIST/$PKG_NAME"

echo ""
echo "完成 ✅"
echo "  exe: $DIST/$APP_NAME.exe"
echo "  ZIP: $(pwd)/$DIST/$PKG_NAME.zip"
