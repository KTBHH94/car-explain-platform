import { createClient } from '@supabase/supabase-js';

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);
    
    // Initialize Supabase client using secrets
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // --- AUTH ROUTES ---
    if (url.pathname === "/api/auth/signup" && request.method === "POST") {
      const { email, password } = await request.json();
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
      return new Response(JSON.stringify({ user: data.user }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const { email, password } = await request.json();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 401, headers: corsHeaders });
      // Return the session token so the frontend can store it
      return new Response(JSON.stringify({ session: data.session }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- PROTECTED ROUTES (require a valid session token) ---
    // For these routes, the frontend must send: Authorization: Bearer <access_token>
    const authHeader = request.headers.get("Authorization");
    if (url.pathname.startsWith("/api/user/") && !authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    if (url.pathname === "/api/user/vehicles" && request.method === "GET") {
      const token = authHeader.replace("Bearer ", "");
      // Verify the user's token with Supabase
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });

      const { data: vehicles, error: dbError } = await supabase
        .from('vehicles')
        .select('*')
        .eq('user_id', user.id);
      if (dbError) return new Response(JSON.stringify({ error: dbError.message }), { status: 500, headers: corsHeaders });
      
      return new Response(JSON.stringify({ vehicles }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- AI ROUTE (your existing code) ---
    if (url.pathname === "/api/diagnose" && request.method === "POST") {
        // ... [Keep your existing AI code here] ...
        // Note: You may want to add authentication to this route later to track usage.
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });
  }
};