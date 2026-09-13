/**
 * @vestara/terminal-runtime — secret redaction for session transcripts.
 *
 * Transcripts are bounded in-memory rings for reconnect replay and audit
 * summaries — never a secret store. Output is redacted at append time so a
 * stray `env` dump or token echo can never persist verbatim.
 *
 * Patterns cover high-signal secret shapes; anything unrecognized passes
 * through (redaction is best-effort defense in depth, not a guarantee).
 */

export function redactSecrets(text: string): string {
  return text
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[redacted]')
    .replace(/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, '[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/=]{12,}/g, 'Bearer [redacted]')
    .replace(
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
      '[redacted-private-key]',
    )
    .replace(
      /\b([A-Za-z_][A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)[A-Za-z0-9_]*)=([^\s'"]\S*)/gi,
      '$1=[redacted]',
    )
    .replace(/("password"\s*:\s*"|"(?:secret|token|api[_-]?key)"\s*:\s*")[^"]+(")/gi, '$1[redacted]$2');
}
