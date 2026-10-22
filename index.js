export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/api/diagnose") {
      return new Response(JSON.stringify({ error: "Not found" }), { 
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    try {
      const body = await request.json();
      const { vehicle, category, answers, customText } = body;

      const systemPrompt = `You are an expert UK automotive diagnostic assistant for CarExplain. 
Your job is to help ordinary drivers understand what might be wrong with their car based on their symptoms.
You MUST follow these rules:
1. Never claim certainty without physical evidence. Use phrases like "possible causes" or "likely issues".
2. Clearly separate likely possibilities from confirmed findings.
3. If symptoms mention severe braking loss, steering failure, fuel leaks, or heavy smoke, escalate safety immediately.
4. Do not instruct users to perform dangerous mechanical work.
5. Use UK terminology (bonnet, boot, windscreen) and GBP (£).
6. Never invent MOT information or repair-cost statistics.

You must respond in STRICT JSON format with exactly these keys:
{
  "safetyLevel": "green" | "amber" | "red",
  "safetyMessage": "String (leave empty if green)",
  "likelyPossibility": "String (the most likely cause)",
  "otherPossibilities": "String (other plausible causes)",
  "whySuggested": "String (explain why based on their answers)",
  "whatToAsk": "String (what the driver should ask the garage)",
  "whatGarageMayInspect": "String (what parts the garage will check)",
  "urgency": "String (Routine / Inspection soon / Urgent)",
  "confidence": "String (Low / Moderate / High)"
}`;

      const userPrompt = `
Vehicle: ${vehicle || "Unknown UK car"}
Category: ${category}
User's Answers: ${JSON.stringify(answers, null, 2)}
Additional Details: ${customText || "None provided"}

Please generate the diagnostic report based on these symptoms.`;

      const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.2
        })
      });

      if (!aiResponse.ok) {
        const errorData = await aiResponse.text();
        throw new Error(`OpenAI API error: ${aiResponse.status} - ${errorData}`);
      }

      const aiData = await aiResponse.json();
      const reportJson = JSON.parse(aiData.choices[0].message.content);

      return new Response(JSON.stringify(reportJson), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (error) {
      return new Response(JSON.stringify({ 
        error: "Failed to generate diagnosis", 
        details: error.message 
      }), { 
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
  }
};