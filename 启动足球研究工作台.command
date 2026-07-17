#!/bin/zsh
cd "$(dirname "$0")"
PORT=8766
URL="http://127.0.0.1:${PORT}/"
if curl -fsS "$URL" >/dev/null 2>&1; then
  open "$URL"
  exit 0
fi
(sleep 1; open "$URL") &
echo "足球研究工作台已启动：$URL"
echo "请保持此窗口开启；关闭窗口即停止本地服务。"
exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$(pwd)"
