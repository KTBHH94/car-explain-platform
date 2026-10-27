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

    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ status: "OK" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    try {
      const cleanSupabaseUrl = (env.SUPABASE_URL || "").trim().replace(/\/$/, "");
      const supabase = createClient(cleanSupabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY);

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

      // --- PROTECTED ROUTES ---
      const authHeader = request.headers.get("Authorization");
      
      if (url.pathname.startsWith("/api/user/")) {
        if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        
        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        if (url.pathname === "/api/user/vehicles" && request.method === "GET") {
          const { data: vehicles, error: dbError } = await supabase.from('vehicles').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
          if (dbError) return new Response(JSON.stringify({ error: dbError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          return new Response(JSON.stringify({ vehicles }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (url.pathname === "/api/user/vehicles" && request.method === "POST") {
          const vehicleData = await request.json();
          const { data, error: dbError } = await supabase.from('vehicles').insert([{ ...vehicleData, user_id: user.id }]).select();
          if (dbError) return new Response(JSON.stringify({ error: dbError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          return new Response(JSON.stringify({ vehicle: data[0] }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (url.pathname === "/api/user/problems" && request.method === "GET") {
          const vehicleId = url.searchParams.get("vehicleId");
          if (!vehicleId) return new Response(JSON.stringify({ error: "Missing vehicleId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          const { data: problems, error: dbError } = await supabase.from('problems').select('*').eq('vehicle_id', vehicleId).eq('user_id', user.id).order('created_at', { ascending: false });
          if (dbError) return new Response(JSON.stringify({ error: dbError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          return new Response(JSON.stringify({ problems }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (url.pathname === "/api/user/problems" && request.method === "POST") {
          const problemData = await request.json();
          const { data, error: dbError } = await supabase.from('problems').insert([{ ...problemData, user_id: user.id }]).select();
          if (dbError) return new Response(JSON.stringify({ error: dbError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          return new Response(JSON.stringify({ problem: data[0] }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (url.pathname === "/api/user/repairs" && request.method === "GET") {
          const vehicleId = url.searchParams.get("vehicleId");
          if (!vehicleId) return new Response(JSON.stringify({ error: "Missing vehicleId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          const { data: repairs, error: dbError } = await supabase.from('repairs').select('*').eq('vehicle_id', vehicleId).eq('user_id', user.id).order('created_at', { ascending: false });
          if (dbError) return new Response(JSON.stringify({ error: dbError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          return new Response(JSON.stringify({ repairs }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (url.pathname === "/api/user/repairs" && request.method === "POST") {
          const repairData = await request.json();
          const { data, error: dbError } = await supabase.from('repairs').insert([{ ...repairData, user_id: user.id }]).select();
          if (dbError) return new Response(JSON.stringify({ error: dbError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          return new Response(JSON.stringify({ repair: data[0] }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // --- AI DIAGNOSE ROUTE ---
      if (url.pathname === "/api/diagnose" && request.method === "POST") {
        const body = await request.json();
        const { vehicle, category, answers, customText } = body;

        // Free vs Premium Check
        const authHeader = request.headers.get("Authorization");
        let userPlan = "free";
        let usageCount = 0;
        
        if (authHeader) {
          const token = authHeader.replace("Bearer ", "");
          const { data: { user } } = await supabase.auth.getUser(token);
          if (user) {
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            if (profile) {
              userPlan = profile.plan;
              usageCount = profile.ai_usage_count;
              
              const lastReset = new Date(profile.ai_usage_reset_date);
              const now = new Date();
              if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
                await supabase.from('profiles').update({ ai_usage_count: 0, ai_usage_reset_date: now.toISOString().split('T')[0] }).eq('id', user.id);
                usageCount = 0;
              }

              if (userPlan === 'free' && usageCount >= 3) {
                return new Response(JSON.stringify({ 
                  error: "limit_reached",
                  message: "You have used your 3 free AI reports this month. Upgrade to Premium for unlimited reports."
                }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
              }

              await supabase.from('profiles').update({ ai_usage_count: usageCount + 1 }).eq('id', user.id);
            }
          }
        }

        const systemInstruction = `You are an expert UK automotive diagnostic assistant for CarExplain. 
Your job is to help ordinary drivers understand what might be wrong with their car based on their symptoms.
You MUST follow these rules:
1. Never claim certainty without physical evidence. Use phrases like "possible causes" or "likely issues".
2. Clearly separate likely possibilities from confirmed findings.
3. If symptoms mention severe braking loss, steering failure, fuel leaks, or heavy smoke, escalate safety immediately.
4. Do not instruct users to perform dangerous mechanical work.
5. Use UK terminology (bonnet, boot, windscreen) and GBP (£).
6. Never invent MOT information or repair-cost statistics.
7. Be highly detailed and comprehensive in your answers. Explain the mechanics behind the symptoms clearly so the driver understands exactly what the garage will be looking for.

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

        // The paid API is fast, so we can use the highly capable 3.8-flash model
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${env.GEMINI_API_KEY}`;

        const aiResponse = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: { 
              response_mime_type: "application/json", 
              temperature: 0.2,
              maxOutputTokens: 4000 // Huge token limit because we have no timeout issues now
            }
          })
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          throw new Error(`Gemini API error: ${aiResponse.status} - ${errorText}`);
        }
        
        const aiData = await aiResponse.json();
        let rawText = aiData.candidates[0].content.parts[0].text;
        rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        
        let reportJson;
        try {
          reportJson = JSON.parse(rawText);
        } catch (e) {
          // Super rare now that we use paid API, but good to have as a fallback
          reportJson = {
            safetyLevel: "amber",
            safetyMessage: "The AI response was slightly malformed. Please try again.",
            likelyPossibility: "Analysis incomplete.",
            otherPossibilities: "Please try again.",
            whySuggested: "N/A",
            whatToAsk: "N/A",
            whatGarageMayInspect: "N/A",
            urgency: "Unknown",
            confidence: "Low"
          };
        }

        return new Response(JSON.stringify(reportJson), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (globalError) {
      return new Response(JSON.stringify({ error: "Server Error: " + globalError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
};