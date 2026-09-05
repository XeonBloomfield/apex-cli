import { BASE_URL, MODEL } from './assistants.js';

export const TRANSPORTS = ['chat-completions', 'responses', 'anthropic'];

async function hasCompletion(response, transport) {
  if (!response.body) return false;
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 65_536) return false;
    chunks.push(chunk);
  }
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (payload.error) return false;
    const text = transport === 'chat-completions' ? payload.choices?.[0]?.message?.content
      : transport === 'anthropic' ? payload.content?.find(block => block.type === 'text')?.text
        : payload.output?.find(item => item.type === 'message')?.content?.find(block => block.type === 'output_text')?.text;
    return typeof text === 'string' && Boolean(text.trim());
  } catch { return false; }
}

export async function checkGateway(token, transport = 'chat-completions', fetchRequest = fetch) {
  if (!TRANSPORTS.includes(transport)) throw new Error(`Choose a transport: ${TRANSPORTS.join(', ')}`);
  if (!token?.trim()) return { ok: false, category: 'credentials-missing', message: 'Set CALLSTACK_AUTH_TOKEN first. Run apex auth for instructions.' };
  const paths = { 'chat-completions': 'chat/completions', responses: 'responses', anthropic: 'messages' };
  const body = transport === 'responses'
    ? { model: MODEL, input: 'Reply OK.', max_output_tokens: 16 }
    : { model: MODEL, messages: [{ role: 'user', content: 'Reply OK.' }], max_tokens: 16 };
  const headers = transport === 'anthropic'
    ? { 'x-api-key': token, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }
    : { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  try {
    const response = await fetchRequest(`${BASE_URL}/${paths[transport]}`, {
      method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) {
      const completed = await hasCompletion(response, transport);
      return completed
        ? { ok: true, category: 'reachable', message: `${MODEL}: ${transport} returned a text completion (HTTP ${response.status}). This does not verify all assistant features.` }
        : { ok: false, category: 'invalid-response', message: 'The gateway returned HTTP success without a recognized text completion. Check transport compatibility; response content was not logged.' };
    }
    await response.body?.cancel();
    const failures = {
      400: ['request-rejected', 'The gateway rejected this transport/model request. Check model availability and compatibility.'],
      401: ['authentication', 'The key was rejected. Replace an invalid, expired, or rotated key.'],
      402: ['credit', 'Payment or credit is required. Check your Console balance.'],
      403: ['access-denied', 'Access was denied. Check key/model permissions and gateway access; this may also be an edge-policy restriction.'],
      404: ['not-found', 'The model or endpoint was not found. Check model availability and transport support.'],
      429: ['limit', 'A rate, quota, or budget limit was reached. Check the Console before retrying.'],
    };
    const [category, message] = failures[response.status] ?? [response.status >= 500 ? 'gateway' : 'http-error', 'The gateway could not complete the request. Retry later or contact support.'];
    return { ok: false, category, message: `HTTP ${response.status}: ${message}` };
  } catch {
    return { ok: false, category: 'network', message: 'The request failed, timed out, or was redirected. Check connectivity and gateway status. No response body or credentials were logged.' };
  }
}
