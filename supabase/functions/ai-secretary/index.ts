const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const adviceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "nextAction", "reason", "timeEstimate", "skip", "tomorrow", "tone", "encouragement"],
  properties: {
    summary: { type: "string" },
    nextAction: { type: "string" },
    reason: { type: "string" },
    timeEstimate: { type: "string" },
    skip: { type: "string" },
    tomorrow: { type: "string" },
    tone: { type: "string", enum: ["light", "normal", "push"] },
    encouragement: { type: "string" },
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function extractOutputText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "OPENAI_API_KEY is not configured" }, 503);

  try {
    const body = await request.json();
    const mode = ["advice", "review", "tomorrow"].includes(body?.mode) ? body.mode : "advice";
    const summary = body?.summary && typeof body.summary === "object" ? body.summary : null;
    if (!summary) return json({ error: "summary is required" }, 400);

    const compactSummary = JSON.stringify(summary).slice(0, 24000);
    const instructions = `あなたは集中ダッシュボードのAI書記です。
ユーザーの記録から、今すぐ実行できる現実的な提案を日本語で返してください。
優しいが甘やかしすぎず、否定しすぎず、各項目は短く具体的にします。
summaryのuserEnergyがtiredなら軽く、energeticなら夜間を除いて少し負荷を上げます。
締切日、優先度、今日対象のタスクを根拠にし、危険な締切を先に扱います。
存在しない締切、予定、実績を作らないでください。
モードは ${mode} です。adviceは今から、reviewは今日の振り返り、tomorrowは明日の作戦を重視します。`;

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini",
        instructions,
        input: `次のsummary JSONだけを根拠に提案してください。\n${compactSummary}`,
        max_output_tokens: 500,
        text: {
          format: {
            type: "json_schema",
            name: "ai_secretary_advice",
            strict: true,
            schema: adviceSchema,
          },
        },
      }),
    });

    if (!openAiResponse.ok) {
      const detail = await openAiResponse.text();
      console.error("OpenAI API error", openAiResponse.status, detail);
      return json({ error: "OpenAI request failed" }, 502);
    }

    const payload = await openAiResponse.json();
    const text = extractOutputText(payload);
    if (!text) return json({ error: "OpenAI returned no text" }, 502);

    let advice;
    try {
      advice = JSON.parse(text);
    } catch (error) {
      console.error("OpenAI JSON parse error", error, text);
      return json({ error: "OpenAI returned invalid JSON" }, 502);
    }
    return json({ advice });
  } catch (error) {
    console.error("ai-secretary error", error);
    return json({ error: "Unexpected server error" }, 500);
  }
});
