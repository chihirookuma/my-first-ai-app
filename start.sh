#!/bin/bash

echo "================================"
echo "  開発サーバーを起動します..."
echo "================================"
echo ""
echo "  ブラウザで以下のURLを開いてください："
echo "  http://localhost:3000"
echo ""
echo "  終了するには Ctrl+C を押してください"
echo "================================"
echo ""

cd "$(dirname "$0")"
npx serve . --listen 3000
