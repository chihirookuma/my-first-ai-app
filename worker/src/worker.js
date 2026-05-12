import Anthropic from "@anthropic-ai/sdk";

// ============================================================
// 設定（必要に応じて変更してください）
// ============================================================

// 公開後、自分のサイトのURLに変更すると、他のサイトからの不正利用を防げます
// 例: "https://yourname.github.io"
// "*" のままだとどこからでもアクセス可能（テスト時のみおすすめ）
const ALLOWED_ORIGIN = "*";

// 使用するClaudeモデル
// - "claude-opus-4-7"   : 最高品質（高コスト）
// - "claude-sonnet-4-6" : バランス型（中コスト）★おすすめ
// - "claude-haiku-4-5"  : 最も安価で高速（このタスクに十分）
const MODEL = "claude-opus-4-7";

// 1回の生成で返す投稿の個数
const POST_COUNT = 10;

// ============================================================
// Worker本体
// ============================================================

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return jsonError("POSTメソッドのみ対応しています。", 405, corsHeaders);
    }

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return jsonError(
        "リクエストが多すぎます。少し待ってからもう一度お試しください。",
        429,
        corsHeaders,
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("リクエストの形式が正しくありません。", 400, corsHeaders);
    }

    const topic = String(body?.topic ?? "").trim();
    if (!topic) {
      return jsonError("テーマを入力してください。", 400, corsHeaders);
    }
    if (topic.length > 100) {
      return jsonError("テーマは100文字以内で入力してください。", 400, corsHeaders);
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    try {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 4000,
        output_config: {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                posts: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["posts"],
              additionalProperties: false,
            },
          },
        },
        system:
          "あなたはSNS（Instagram・Threads）の投稿文を考えるプロのコピーライターです。" +
          "日本語で、親しみやすくエンゲージメントが高くなる投稿文を作ります。" +
          "各投稿は150〜300文字程度、絵文字や改行を効果的に使い、最後にハッシュタグを2〜4個つけます。" +
          "投稿のスタイルはバリエーション豊かに（質問・体験談・お役立ち情報・応援メッセージ・気づき・おすすめ・あるある・宣言など）。" +
          "テーマやキーワードを自然に含め、読み手が思わず保存したくなるような投稿にしてください。",
        messages: [
          {
            role: "user",
            content:
              `テーマ「${topic}」について、InstagramとThreadsで使える投稿文を${POST_COUNT}個作ってください。` +
              `JSON形式で、postsという配列に${POST_COUNT}個の文字列として返してください。`,
          },
        ],
      });

      const message = await stream.finalMessage();
      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock) {
        return jsonError("AIからの応答が空でした。", 500, corsHeaders);
      }

      let parsed;
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        return jsonError("AIの応答を解析できませんでした。", 500, corsHeaders);
      }

      if (!Array.isArray(parsed?.posts) || parsed.posts.length === 0) {
        return jsonError("投稿文を取得できませんでした。", 500, corsHeaders);
      }

      return new Response(JSON.stringify({ posts: parsed.posts }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("AI呼び出しエラー", err);
      return jsonError(
        "AIの呼び出しに失敗しました。しばらくしてから再度お試しください。",
        500,
        corsHeaders,
      );
    }
  },
};

function jsonError(message, status, corsHeaders) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
