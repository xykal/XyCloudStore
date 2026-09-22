/**
 * Turnstile + hCaptcha verification — XyCloudStore Admin Dashboard
 * Built-in XyVerse — anti bot login
 * Secret via env: TURNSTILE_SECRET, HCAPTCHA_SECRET (Worker Secrets)
 */

export async function verifyTurnstile(env, token, ip) {
  const secret = env.TURNSTILE_SECRET;
  if (!secret) {
    // Jika secret belum di-set, skip verification di dev, tapi log warning
    console.warn('[turnstile] TURNSTILE_SECRET belum di-set — skip verify (dev mode)');
    return { success: true, devBypass: true };
  }
  if (!token) return { success: false, error: 'Token Turnstile kosong' };
  try {
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const data = await r.json();
    if (!data.success) {
      return { success: false, error: data['error-codes']?.join(', ') || 'Turnstile gagal', details: data };
    }
    return { success: true, data };
  } catch (e) {
    return { success: false, error: 'Gagal verifikasi Turnstile: ' + (e.message || e) };
  }
}

export async function verifyHCaptcha(env, token, ip) {
  const secret = env.HCAPTCHA_SECRET;
  if (!secret) {
    console.warn('[hcaptcha] HCAPTCHA_SECRET belum di-set — skip verify (dev mode)');
    return { success: true, devBypass: true };
  }
  if (!token) return { success: false, error: 'Token hCaptcha kosong' };
  try {
    const form = new URLSearchParams();
    form.append('secret', secret);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const r = await fetch('https://api.hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await r.json();
    if (!data.success) {
      return { success: false, error: data['error-codes']?.join(', ') || 'hCaptcha gagal', details: data };
    }
    return { success: true, data };
  } catch (e) {
    return { success: false, error: 'Gagal verifikasi hCaptcha: ' + (e.message || e) };
  }
}

export async function handleTurnstileVerify(req, env) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = body.token || body.response || '';
    const type = (body.type || 'turnstile').toLowerCase();
    const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || '';
    let result;
    if (type === 'hcaptcha') {
      result = await verifyHCaptcha(env, token, ip);
    } else {
      result = await verifyTurnstile(env, token, ip);
    }
    if (!result.success) {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    return new Response(JSON.stringify({ success: true, devBypass: result.devBypass || false }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message || 'Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
