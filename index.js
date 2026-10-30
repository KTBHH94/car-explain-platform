import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

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

      // --- GET AUTH HEADER FOR PROTECTED ROUTES ---
      const authHeader = request.headers.get("Authorization");
      
      // --- PROTECTED USER ROUTES ---
      if (url.pathname.startsWith("/api/user/")) {
        if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        
        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        // Vehicles
        if (url.pathname === "/api/user/vehicles" && request.method === "GET") {
          const { data: vehicles, error: dbError } = await supabase.from('vehicles').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
          if (dbError) return new Response(JSON.stringify({ error: dbError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          return new Response(JSON.stringify({ vehicles }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (url.pathname === "/api/user/vehicles" && request.method === "POST") {
          // --- FREE VS PREMIUM VEHICLE LIMIT CHECK ---
          const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
          if (profile && profile.plan === 'free') {
            const { count } = await supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
            if (count >= 1) {
              return new Response(JSON.stringify({ 
                error: "Free accounts are limited to 1 vehicle. Upgrade to Premium for unlimited vehicles." 
              }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }

          const vehicleData = await request.json();
          const { data, error: dbError } = await supabase.from('vehicles').insert([{ ...vehicleData, user_id: user.id }]).select();
          if (dbError) return new Response(JSON.stringify({ error: dbError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          return new Response(JSON.stringify({ vehicle: data[0] }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Problems
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

        // Repairs
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

      // --- COMMUNITY ROUTES ---
      if (url.pathname === "/api/community/posts" && request.method === "GET") {
        const { data: posts, error: dbError } = await supabase
          .from('community_posts')
          .select(`id, title, content, category, created_at, profiles ( email )`)
          .order('created_at', { ascending: false });
          
        if (dbError) return new Response(JSON.stringify({ error: dbError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ posts }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (url.pathname === "/api/community/posts" && request.method === "POST") {
        if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        
        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const postData = await request.json();
        const { data, error: dbError } = await supabase
          .from('community_posts')
          .insert([{ ...postData, user_id: user.id }])
          .select();
          
        if (dbError) return new Response(JSON.stringify({ error: dbError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ post: data[0] }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (url.pathname.startsWith("/api/community/replies/") && request.method === "GET") {
        const postId = url.pathname.split("/").pop();
        const { data: replies, error: dbError } = await supabase
          .from('community_replies')
          .select(`id, content, created_at, profiles ( email )`)
          .eq('post_id', postId)
          .order('created_at', { ascending: true });
          
        if (dbError) return new Response(JSON.stringify({ error: dbError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ replies }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (url.pathname === "/api/community/replies" && request.method === "POST") {
        if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        
        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const replyData = await request.json();
        const { data, error: dbError } = await supabase
          .from('community_replies')
          .insert([{ ...replyData, user_id: user.id }])
          .select();
          
        if (dbError) return new Response(JSON.stringify({ error: dbError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ reply: data[0] }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // --- AI DIAGNOSE ROUTE ---
      if (url.pathname === "/api/diagnose" && request.method === "POST") {
        
        // --- STRICT AUTHENTICATION CHECK ---
        if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer undefined") {
           return new Response(JSON.stringify({ 
             error: "Unauthorized", 
             message: "You must be logged in to use the AI diagnostic tool. Please create a free account." 
           }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !user) {
           return new Response(JSON.stringify({ 
             error: "Unauthorized", 
             message: "Your session has expired. Please log in again." 
           }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // --- FREE VS PREMIUM CHECK ---
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        
        if (!profile) {
           return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        let userPlan = profile.plan;
        let usageCount = profile.ai_usage_count;
        
        const lastReset = new Date(profile.ai_usage_reset_date);
        const now = new Date();
        if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
          await supabase.from('profiles').update({ ai_usage_count: 0, ai_usage_reset_date: now.toISOString().split('T')[0] }).eq('id', user.id);
          usageCount = 0;
        }

        // LIMIT TO 1 FREE REPORT
        if (userPlan === 'free' && usageCount >= 1) {
          return new Response(JSON.stringify({ 
            error: "limit_reached",
            message: "You have used your 1 free AI report this month. Upgrade to Premium for unlimited reports."
          }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await supabase.from('profiles').update({ ai_usage_count: usageCount + 1 }).eq('id', user.id);

        // --- AI LOGIC ---
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
              maxOutputTokens: 4000
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

      // --- QUOTE EXPLAINER ROUTE ---
      if (url.pathname === "/api/quote-explain" && request.method === "POST") {
        // Require authentication
        if (!authHeader || authHeader === "Bearer null") {
           return new Response(JSON.stringify({ error: "You must be logged in to use the Quote Explainer." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
           return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        
        // PREMIUM ONLY CHECK
        const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
        if (!profile || profile.plan !== 'premium') {
           return new Response(JSON.stringify({ 
             error: "Premium Required", 
             message: "The Quote Checker is a Premium feature. Please upgrade to unlock it." 
           }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const body = await request.json();
        const { vehicle, quoteText, totalPrice } = body;

        const systemInstruction = `You are an expert UK automotive mechanic and pricing analyst for CarExplain.
Your job is to analyse a garage quote for an ordinary driver.
You must follow these rules:
1. Explain jargon in plain English.
2. Break down what is likely parts and what is likely labour.
3. Provide a realistic UK price range based on independent garages.
4. NEVER accuse the garage of ripping the user off. Use neutral language like "within typical range", "higher than typical range", or "significantly higher than typical".
5. Provide a list of intelligent questions the driver should ask the garage to verify the quote.
6. Use UK terminology (bonnet, boot, £).

You must respond in STRICT JSON format with exactly these keys:
{
  "verdict": "String (e.g., 'Within typical range', 'Higher than typical range')",
  "explanation": "String (1-2 sentences explaining the verdict neutrally)",
  "partsBreakdown": "String (explain what parts are likely included and their typical cost)",
  "labourBreakdown": "String (explain the likely labour hours and typical regional cost)",
  "jargonExplained": "String (explain any complex terms in the quote)",
  "questionsToAsk": ["String (question 1)", "String (question 2)", "String (question 3)"]
}`;

        const userPrompt = `
Vehicle: ${vehicle || "Unknown UK car"}
Garage Quote: "${quoteText}"
Total Quoted Price: £${totalPrice}

Please analyse this quote and generate the JSON report.`;

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
              maxOutputTokens: 1500
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
        
        const reportJson = JSON.parse(rawText);
        return new Response(JSON.stringify(reportJson), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // --- STRIPE CHECKOUT ROUTE ---
      if (url.pathname === "/api/stripe/create-checkout" && request.method === "POST") {
        if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        
        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
          apiVersion: '2023-10-16',
          httpClient: Stripe.createFetchHttpClient(),
        });

        try {
          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
              {
                price: env.STRIPE_PRICE_ID,
                quantity: 1,
              },
            ],
            mode: 'subscription',
            customer_email: user.email,
            client_reference_id: user.id, // This links the payment to the user in Supabase
            success_url: `https://carexplain.co.uk/garage.html?payment=success`,
            cancel_url: `https://carexplain.co.uk/garage.html?payment=cancelled`,
          });

          return new Response(JSON.stringify({ url: session.url }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (stripeError) {
          return new Response(JSON.stringify({ error: stripeError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // --- STRIPE WEBHOOK ROUTE ---
      if (url.pathname === "/api/stripe/webhook" && request.method === "POST") {
        const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
          apiVersion: '2023-10-16',
          httpClient: Stripe.createFetchHttpClient(),
        });

        const signature = request.headers.get('stripe-signature');
        const body = await request.text();

        let event;
        try {
          event = await stripe.webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET);
        } catch (err) {
          return new Response(`Webhook Error: ${err.message}`, { status: 400 });
        }

        // Handle the checkout.session.completed event
        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          const userId = session.client_reference_id;
          
          if (userId) {
            // Update the user's plan to 'premium' in Supabase
            await supabase.from('profiles').update({ plan: 'premium' }).eq('id', userId);
          }
        }

        return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (globalError) {
      return new Response(JSON.stringify({ error: "Server Error: " + globalError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
};