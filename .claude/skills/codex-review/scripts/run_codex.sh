#!/usr/bin/env bash
# Codex CLI でレビューを実行する。
# 使い方: run_codex.sh <作業ディレクトリ> <プロンプト> [出力ファイル]
# APIキーは環境のネットワークシークレットがプロキシで付与するため、ここでは扱わない。
set -u
workdir="$1"
prompt="$2"
out="${3:-$workdir/codex_review.txt}"

# 1. OpenAI への接続確認（ネットワークシークレットが効いていれば 200）
code=$(curl -sS -o /dev/null -w "%{http_code}" https://api.openai.com/v1/models 2>/dev/null || echo 000)
if [ "$code" != "200" ]; then
  echo "NG: api.openai.com に接続できません (HTTP $code)。環境設定の許可ドメインとネットワークシークレットを確認してください。" >&2
  exit 2
fi

# 2. Codex CLI が無ければインストール（数分かかることがある）
if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI をインストールしています..." >&2
  npm i -g @openai/codex >/dev/null 2>&1 || { echo "NG: Codex CLI のインストールに失敗しました。" >&2; exit 3; }
fi

# 3. ログイン（ダミーのキー。実際のキーはプロキシが付け替える）
printf 'sk-proxy-injected' | codex login --with-api-key >/dev/null 2>&1

# 4. 実行（読み取り専用。WebSocket はプロキシで拒否されるため HTTPS にフォールバックする）
cd "$workdir" || exit 4
timeout 900 codex exec --skip-git-repo-check --sandbox read-only \
  -c 'features.responses_websockets=false' "$prompt" < /dev/null > "$out" 2> "$out.err"
status=$?

if grep -q "Quota exceeded" "$out.err" 2>/dev/null; then
  echo "NG: OpenAI のクレジット残高がありません（Quota exceeded）。platform.openai.com の Billing で入金してください。" >&2
  exit 5
fi
if [ $status -ne 0 ] || [ ! -s "$out" ]; then
  echo "NG: Codex の実行に失敗しました (exit $status)。$out.err を確認してください。" >&2
  exit 6
fi
echo "OK: $out"
