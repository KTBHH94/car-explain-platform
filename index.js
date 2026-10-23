import { createClient } from '@supabase/supabase-js';

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // --- HEALTH CHECK (To test if Worker and Supabase are connected) ---
    if (url.pathname === "/api/health") {
      try {
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
           throw new Error("Missing Supabase Secrets");
        }
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        return new Response(JSON.stringify({ 
          status: "OK", 
          supabase_url: env.SUPABASE_URL.substring(0, 15) + "...", 
          has_key: !!env.SUPABASE_SERVICE_ROLE_KEY 
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    try {
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

      // --- AUTH ROUTES ---
      if (url.pathname === "/api/auth/signup" && request.method === "POST") {
        const { email, password } = await request.json();
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ user: data.user }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        const { email, password } = await request.json();
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ session: data.session }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // --- AI DIAGNOSE ROUTE ---
      if (url.pathname === "/api/diagnose" && request.method === "POST") {
        const body = await request.json();
        const { vehicle, category, answers, customText } = body;

        const systemInstruction = `You are an expert UK automotive diagnostic assistant for CarExplain. 
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
  "likelyPossibility": "String",
  "otherPossibilities": "String",
  "whySuggested": "String",
  "whatToAsk": "String",
  "whatGarageMayInspect": "String",
  "urgency": "String",
  "confidence": "String"
}`;

        const userPrompt = `
Vehicle: ${vehicle || "Unknown UK car"}
Category: ${category}
User's Answers: ${JSON.stringify(answers, null, 2)}
Additional Details: ${customText || "None provided"}

Please generate the diagnostic report based on these symptoms.`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${env.GEMINI_API_KEY}`;

        const aiResponse = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: { response_mime_type: "application/json", temperature: 0.2 }
          })
        });

        if (!aiResponse.ok) throw new Error(`Gemini API error: ${aiResponse.status}`);
        const aiData = await aiResponse.json();
        const reportJson = JSON.parse(aiData.candidates[0].content.parts[0].text);

        return new Response(JSON.stringify(reportJson), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });

    } catch (globalError) {
      return new Response(JSON.stringify({ error: "Server Error: " + globalError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
};