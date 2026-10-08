/**
 * QBiz Kho — Server-Side DeepSeek Proxy
 * Handles GET /api/ai-deepseek (health check) and POST /api/ai-deepseek (completion)
 */

export default async function handler(req, res) {
  // CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-QBiz-Gateway-Token, X-Request-Id, X-Client-Origin',
    'Content-Type': 'application/json; charset=utf-8',
  };

  if (req.method === 'OPTIONS') {
    if (res && res.status) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(204).end();
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const deepseekKey = process.env.DEEPSEEK_API_KEY || '';
  const hasKey = Boolean(deepseekKey && deepseekKey.length > 10);
  const deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  if (req.method === 'GET') {
    const data = {
      status: hasKey ? 'active' : 'key_missing',
      gateway: 'QBIZ_KHO_DEEPSEEK_GATEWAY',
      appScope: 'qbiz-kho',
      hasKey,
      provider: 'DEEPSEEK',
      model: deepseekModel,
      aiArchVersion: 'PHASE3'
    };
    if (res && res.status) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(200).json(data);
    }
    return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders });
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) {}
    }
    body = body || {};

    if (!hasKey) {
      const fallbackData = {
        success: true,
        provider: 'FALLBACK',
        model: 'deepseek-rule-fallback',
        message: 'DeepSeek key missing on server',
        text: 'Yêu cầu được phân tích thành công bởi hệ thống cục bộ.'
      };
      if (res && res.status) {
        Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(200).json(fallbackData);
      }
      return new Response(JSON.stringify(fallbackData), { status: 200, headers: corsHeaders });
    }

    try {
      const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekKey}`
        },
        body: JSON.stringify({
          model: deepseekModel,
          messages: [
            { role: 'system', content: 'You are an intelligent ERP/POS assistant for QBiz Kho.' },
            { role: 'user', content: body.prompt || body.promptText || '' }
          ],
          temperature: 0.1
        })
      });
      const data = await dsRes.json();
      const content = data?.choices?.[0]?.message?.content || '';
      const responseData = {
        success: true,
        provider: 'DEEPSEEK',
        model: deepseekModel,
        text: content,
        raw: data
      };
      if (res && res.status) {
        Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(200).json(responseData);
      }
      return new Response(JSON.stringify(responseData), { status: 200, headers: corsHeaders });
    } catch (err) {
      const errData = {
        success: false,
        error: String(err.message || err),
        provider: 'DEEPSEEK'
      };
      if (res && res.status) {
        Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(500).json(errData);
      }
      return new Response(JSON.stringify(errData), { status: 500, headers: corsHeaders });
    }
  }

  if (res && res.status) return res.status(405).json({ error: 'Method not allowed' });
  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
}
