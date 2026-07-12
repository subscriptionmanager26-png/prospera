import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405)
    }

    const body = await req.json()
    const email = String(body?.email || "").trim().toLowerCase()
    const password = String(body?.password || "")

    if (!email || !password) {
      return json({ error: "Email and password are required" }, 400)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: cfg, error: cfgErr } = await admin
      .from("community_passcode")
      .select("passcode")
      .eq("id", 1)
      .maybeSingle()

    if (cfgErr || !cfg?.passcode) {
      return json({ error: "Passcode is not configured" }, 500)
    }

    if (password !== cfg.passcode) {
      return json({ error: "Invalid email or password" }, 401)
    }

    const { data: allowed, error: allowErr } = await admin
      .from("allowed_emails")
      .select("email")
      .eq("email", email)
      .eq("active", true)
      .maybeSingle()

    if (allowErr) {
      return json({ error: allowErr.message }, 500)
    }
    if (!allowed) {
      return json({ error: "This email is not on the access list" }, 403)
    }

    // Ensure Auth user exists and uses the shared community passcode
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createErr) {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      })
      if (linkErr || !linkData?.user?.id) {
        return json({ error: createErr.message }, 400)
      }
      const { error: updateErr } = await admin.auth.admin.updateUserById(linkData.user.id, {
        password,
        email_confirm: true,
      })
      if (updateErr) {
        return json({ error: updateErr.message }, 400)
      }
    } else if (!created?.user) {
      return json({ error: "Could not create user" }, 500)
    }

    const authClient = createClient(supabaseUrl, anonKey)
    const { data: sessionData, error: signErr } = await authClient.auth.signInWithPassword({
      email,
      password,
    })

    if (signErr || !sessionData.session) {
      return json({ error: signErr?.message || "Sign-in failed" }, 401)
    }

    return json({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in,
      expires_at: sessionData.session.expires_at,
      token_type: sessionData.session.token_type,
      user: sessionData.user,
    })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
