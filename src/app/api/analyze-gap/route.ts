import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { concept, prompt, explanation } = await request.json();

    if (!concept || !explanation) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Groq API key not configured" }, { status: 500 });
    }

    const systemPrompt = `You are a concept-check tool. Your job is to find the EXACT moment where a learner's explanation stops being real understanding and becomes a memorized phrase or label.

You will receive:
- A concept the learner was asked to derive from first principles
- The prompt they were given
- Their explanation

Your task:
1. Find the ONE sentence (or part of a sentence) where their explanation shifts from genuine derivation to a memorized phrase, a definition they heard somewhere, or a label they are using without understanding what is underneath it. This is "the gap sentence."
2. Write ONE sharp follow-up question that exposes whether they actually understand what is underneath that gap sentence. The question should force them to derive, not define. It should be specific enough that a memorized phrase will not answer it.

Rules:
- The gap sentence must be an EXACT quote or close paraphrase from their explanation.
- If the entire explanation is memorized phrases, pick the one that matters most.
- If the entire explanation is genuinely derived (rare), pick the weakest link.
- The follow-up must be a WHY or HOW or WHAT-BREAKS question, not a WHAT-IS question.
- Keep both outputs concise. The gap sentence is one sentence. The follow-up is one question.

Respond in this exact JSON format only, no other text:
{"gap_sentence": "the exact sentence from their explanation", "follow_up_question": "your sharp follow-up question"}`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `Concept: ${concept}\n\nPrompt given to learner: ${prompt}\n\nLearner's explanation:\n${explanation}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Groq API error:", errText);
      return NextResponse.json({ error: "AI analysis failed" }, { status: 500 });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Could not parse JSON from:", text);
      return NextResponse.json({ error: "Could not parse analysis" }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]);

    if (!result.gap_sentence || !result.follow_up_question) {
      return NextResponse.json({ error: "Incomplete analysis" }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Analyze gap error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
