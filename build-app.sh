#!/bin/bash
# 主页编辑器 · App 打包脚本：编译 → 封装 .app → 生成 .dmg
set -e
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

VERSION="2.0.0"
APP_NAME="Folio"
DIST="dist"
APP_DIR="$DIST/$APP_NAME.app"
ICON_SRC="app/AppIcon.icns"

echo "==> 编译 Go 二进制（webview 原生窗口版）"
CGO_ENABLED=1 go build -tags webview -trimpath -ldflags "-s -w" -o "$DIST/HomeEditor" .

echo "==> 组装 $APP_NAME.app"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"
cp "$DIST/HomeEditor" "$APP_DIR/Contents/MacOS/HomeEditor"
chmod +x "$APP_DIR/Contents/MacOS/HomeEditor"
[ -f "$ICON_SRC" ] && cp "$ICON_SRC" "$APP_DIR/Contents/Resources/AppIcon.icns"
# 打包内置演示数据（斯内普教授示例站），无数据目录时自动落到 demo
cp -R demo "$APP_DIR/Contents/Resources/demo"

cat > "$APP_DIR/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>Folio</string>
    <key>CFBundleDisplayName</key>
    <string>Folio</string>
    <key>CFBundleIdentifier</key>
    <string>com.folio.editor</string>
    <key>CFBundleVersion</key>
    <string>2.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>2.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleExecutable</key>
    <string>HomeEditor</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

echo "==>  ad-hoc 签名"
codesign --force --sign - "$APP_DIR"

echo "==> 生成 DMG"
DMG_ROOT="$DIST/dmg-root"
rm -rf "$DMG_ROOT"
mkdir -p "$DMG_ROOT"
cp -R "$APP_DIR" "$DMG_ROOT/"
ln -s /Applications "$DMG_ROOT/Applications"
rm -f "$APP_NAME-$VERSION.dmg"
hdiutil create -volname "$APP_NAME" -srcfolder "$DMG_ROOT" -ov -format UDZO "$APP_NAME-$VERSION.dmg" > /dev/null
rm -rf "$DMG_ROOT" "$DIST/HomeEditor"

echo ""
echo "完成 ✅"
echo "  App: $APP_DIR"
echo "  DMG: $(pwd)/$APP_NAME-$VERSION.dmg"
