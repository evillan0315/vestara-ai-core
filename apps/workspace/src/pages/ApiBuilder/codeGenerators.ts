export function generateCurl(method: string, url: string, headers: Record<string, string>, body?: string): string {
  const parts = [`curl -X ${method} '${url}'`];
  for (const [k, v] of Object.entries(headers)) parts.push(`  -H '${k}: ${v}'`);
  if (body && method !== 'GET') parts.push(`  -d '${body}'`);
  return parts.join(' \\\n');
}

export function generateFetch(method: string, url: string, headers: Record<string, string>, body?: string): string {
  const opts: Record<string, any> = { method };
  if (Object.keys(headers).length) opts.headers = headers;
  if (body && method !== 'GET') {
    try { opts.body = JSON.stringify(JSON.parse(body)); } catch { opts.body = body; }
  }
  return `fetch('${url}', ${JSON.stringify(opts, null, 2)})`;
}

export function generatePython(method: string, url: string, headers: Record<string, string>, body?: string): string {
  const lines = ['import requests', ''];
  const h = Object.keys(headers).length ? JSON.stringify(headers, null, 2) : '{}';
  if (body && method !== 'GET') {
    try { lines.push(`response = requests.${method.toLowerCase()}('${url}', headers=${h}, json=${JSON.stringify(JSON.parse(body))})`); }
    catch { lines.push(`response = requests.${method.toLowerCase()}('${url}', headers=${h}, data='''${body}''')`); }
  } else {
    lines.push(`response = requests.${method.toLowerCase()}('${url}', headers=${h})`);
  }
  lines.push('print(response.status_code)');
  lines.push('print(response.json())');
  return lines.join('\n');
}
