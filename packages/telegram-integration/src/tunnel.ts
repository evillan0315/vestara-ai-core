/**
 * VES-TG-030: Telegram Webhook Tunnel
 *
 * Telegram delivers updates to a public HTTPS webhook, but the Vestara API
 * binds to loopback. This module owns the lifecycle of an outbound tunnel
 * (cloudflared, ngrok, or a manually provisioned reverse proxy) that exposes
 * the local webhook endpoint, and registers the resulting public URL with the
 * Telegram Bot API.
 *
 * Tunnel state is runtime state: only the configuration persists. A process
 * is never spawned by configuration alone — enabling is always an explicit
 * action, and disabling stops whatever this service started.
 *
 * The service performs no I/O itself; it delegates to an injected
 * `TunnelProvider` and `TelegramWebhookRegistrar`, so it is fully testable
 * without processes or network access.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-023, TG-026 extension)
 */

// ─── Types ─────────────────────────────────────────────────────

export type TunnelProviderKind = 'manual' | 'cloudflared' | 'ngrok';

export type TunnelStatus = 'disabled' | 'starting' | 'active' | 'error';

export interface TunnelConfig {
  /** Tunnel provider */
  readonly provider: TunnelProviderKind;

  /** Public URL for the `manual` provider (provisioned externally) */
  readonly publicUrl?: string;

  /** Local API port the tunnel targets */
  readonly localPort: number;
}

export interface TunnelState {
  /** Current lifecycle status */
  readonly status: TunnelStatus;

  /** Configured provider */
  readonly provider: TunnelProviderKind;

  /** Resolved public base URL when active */
  readonly publicUrl?: string;

  /** Webhook URL presented to Telegram when active */
  readonly webhookUrl?: string;

  /** Whether the webhook was registered with Telegram */
  readonly webhookRegistered: boolean;

  /** Last failure detail */
  readonly lastError?: string;

  /** ISO-8601 timestamp of the last state transition */
  readonly changedAt: string;
}

export interface TunnelStartResult {
  readonly publicUrl: string;
}

export interface TunnelProvider {
  readonly kind: TunnelProviderKind;
  /** Start the tunnel toward `localUrl` and resolve with the public base URL. */
  start(localUrl: string): Promise<TunnelStartResult>;
  /** Stop the tunnel and release its process/connection. */
  stop(): Promise<void>;
}

export interface WebhookRegistrationResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Thrown when a process-backed tunnel command cannot be executed because it is
 * not installed or not on PATH. The message is actionable on purpose: the raw
 * Node `spawn ENOENT` error tells an operator nothing.
 */
export class TunnelProviderUnavailableError extends Error {
  readonly command: string;

  constructor(command: string, message?: string) {
    super(
      message ??
        `"${command}" was not found on PATH. Install it, set VESTARA_TELEGRAM_TUNNEL_COMMAND, or use the manual provider with your own HTTPS URL.`,
    );
    this.name = 'TunnelProviderUnavailableError';
    this.command = command;
  }
}

export interface TelegramWebhookRegistrar {
  register(url: string, secret?: string): Promise<WebhookRegistrationResult>;
  unregister(): Promise<WebhookRegistrationResult>;
}

export interface TelegramTunnelConfig {
  /** Initial configuration */
  readonly config?: Partial<TunnelConfig>;

  /** Provider factory; `null` means no process-backed provider is available */
  readonly providerFactory?: (kind: TunnelProviderKind) => TunnelProvider | null;

  /** Webhook registrar; `null`/omitted disables registration */
  readonly registrar?: TelegramWebhookRegistrar | null;

  /**
   * Readiness gate run before webhook registration. Resolving the tunnel host
   * before calling setWebhook prevents Telegram from negative-caching an
   * NXDOMAIN it saw during DNS propagation — a poisoned name is not
   * recoverable. Defaults to always-ready for hermetic tests.
   */
  readonly readinessProbe?: (publicUrl: string) => Promise<boolean>;

  /** Clock injection for deterministic tests */
  readonly now?: () => Date;
}

export type TunnelConfigPatch = Partial<TunnelConfig>;

// ─── Defaults ──────────────────────────────────────────────────

export const DEFAULT_TUNNEL_CONFIG: TunnelConfig = {
  provider: 'manual',
  localPort: 3001,
};

const DEFAULT_START_TIMEOUT_MS = 30_000;

// ─── Pure Helpers ──────────────────────────────────────────────

/**
 * Build the Telegram webhook URL for a public base URL. The canonical route
 * is `/api/telegram/webhook`; trailing slashes are normalized.
 */
export function buildTelegramWebhookUrl(publicUrl: string): string {
  return `${publicUrl.replace(/\/+$/, '')}/api/telegram/webhook`;
}

export interface PublicUrlValidation {
  readonly valid: boolean;
  readonly reason?: string;
}

/**
 * Telegram only accepts HTTPS webhook URLs with a public host. Loopback and
 * private hosts are rejected because Telegram cannot reach them.
 */
export function validatePublicUrl(value: string | undefined): PublicUrlValidation {
  if (!value || value.trim().length === 0) {
    return { valid: false, reason: 'Public URL is required' };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { valid: false, reason: 'Public URL is not a valid URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Telegram requires an HTTPS webhook URL' };
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost')) {
    return { valid: false, reason: 'Public URL must be reachable from the internet' };
  }
  if (/^(10|127)\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    return { valid: false, reason: 'Public URL must not be a private address' };
  }

  return { valid: true };
}

/**
 * Host suffixes published by supported tunnel providers. Output parsing only
 * accepts these hosts: a provider banner contains unrelated links (licence,
 * terms of service) that must never be mistaken for the tunnel URL.
 */
const TUNNEL_HOST_SUFFIXES: readonly string[] = [
  '.trycloudflare.com',
  '.ngrok-free.app',
  '.ngrok-free.dev',
  '.ngrok.app',
  '.ngrok.io',
];

/** True when a URL belongs to a known tunnel provider host. */
export function isTunnelHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return TUNNEL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

/**
 * Extract the tunnel URL from provider output.
 *
 * Only known tunnel hosts are accepted, and trailing sentence punctuation is
 * stripped, so banner text such as `(https://www.cloudflare.com/website-terms/)`
 * can never be selected. Returns null when no tunnel URL is present.
 */
export function extractTunnelUrl(output: string): string | null {
  const matches = output.match(/https:\/\/[^\s'"`<>()[\]{},;|\\]+/g);
  if (!matches) return null;

  for (const match of matches) {
    const candidate = match.replace(/[.,;:]+$/, '');
    if (isTunnelHost(candidate) && validatePublicUrl(candidate).valid) {
      return candidate;
    }
  }
  return null;
}

// ─── Providers ─────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface HostResolutionOptions {
  /** Total time to keep polling before giving up */
  readonly timeoutMs?: number;

  /** Delay between polls */
  readonly intervalMs?: number;
}

/**
 * Wait until a hostname resolves via the system resolver.
 *
 * A tunnel provider prints its public URL when the connection is established,
 * but the `*.trycloudflare.com` DNS record is published asynchronously. Calling
 * Telegram's `setWebhook` before the record exists makes Telegram cache an
 * NXDOMAIN for that hostname, which is not recoverable — a new hostname is
 * required. Gating registration on resolution avoids poisoning fresh tunnels.
 */
export async function waitForHostResolution(hostname: string, options?: HostResolutionOptions): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const intervalMs = options?.intervalMs ?? 1_000;
  const { lookup } = await import('node:dns/promises');
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      await lookup(hostname);
      return true;
    } catch {
      if (Date.now() >= deadline) return false;
      await delay(intervalMs);
    }
  }
}

/**
 * Probe whether a command can be spawned. Resolution is best-effort and never
 * rejects: an unavailable command simply reports `false`. Probing spawns the
 * command with `--version`, which is side-effect free for supported tunnel
 * CLIs; a command that spawns but exits non-zero still counts as available.
 */
export async function isCommandAvailable(command: string): Promise<boolean> {
  if (!command || command.trim().length === 0) return false;
  const { spawn } = await import('node:child_process');
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (value: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const child = spawn(command, ['--version'], { stdio: 'ignore' });
      child.on('error', () => done(false));
      child.on('spawn', () => {
        child.kill();
        done(true);
      });
      child.on('exit', () => done(true));
    } catch {
      done(false);
    }
  });
}

/**
 * Provider for an externally provisioned tunnel (reverse proxy, manual
 * cloudflared run). It validates the supplied URL and performs no I/O.
 */
export class StaticTunnelProvider implements TunnelProvider {
  constructor(
    readonly kind: TunnelProviderKind,
    private readonly publicUrl: string,
  ) {}

  async start(): Promise<TunnelStartResult> {
    const validation = validatePublicUrl(this.publicUrl);
    if (!validation.valid) throw new Error(validation.reason ?? 'Invalid public URL');
    return { publicUrl: this.publicUrl.replace(/\/+$/, '') };
  }

  async stop(): Promise<void> {
    // Externally owned — nothing to stop.
  }
}

// ─── Tunnel Service ────────────────────────────────────────────

/**
 * Owns tunnel configuration and lifecycle. Never spawns a process unless a
 * provider is explicitly selected and `enable()` is called.
 */
export class TelegramTunnelService {
  private config: TunnelConfig;
  private state: TunnelState;
  private readonly providerFactory: (kind: TunnelProviderKind) => TunnelProvider | null;
  private readonly registrar: TelegramWebhookRegistrar | null;
  private readonly readinessProbe: (publicUrl: string) => Promise<boolean>;
  private readonly now: () => Date;
  private activeProvider: TunnelProvider | null = null;

  constructor(options?: TelegramTunnelConfig) {
    this.config = { ...DEFAULT_TUNNEL_CONFIG, ...options?.config };
    this.providerFactory = options?.providerFactory ?? (() => null);
    this.registrar = options?.registrar ?? null;
    this.readinessProbe = options?.readinessProbe ?? (async () => true);
    this.now = options?.now ?? (() => new Date());
    this.state = this.makeState('disabled');
  }

  getConfig(): TunnelConfig {
    return { ...this.config };
  }

  getState(): TunnelState {
    return { ...this.state };
  }

  /** Local URL the tunnel should target. */
  buildLocalUrl(): string {
    return `http://127.0.0.1:${this.config.localPort}`;
  }

  /**
   * Apply configuration. Changing the provider or port while active stops the
   * current tunnel; the caller must `enable()` again to restart it.
   */
  async configure(patch: TunnelConfigPatch): Promise<TunnelState> {
    const providerChanged = patch.provider !== undefined && patch.provider !== this.config.provider;
    const portChanged = patch.localPort !== undefined && patch.localPort !== this.config.localPort;

    this.config = { ...this.config, ...patch };

    if (this.state.status === 'active' && (providerChanged || portChanged)) {
      await this.stopActive();
      this.state = this.makeState('disabled');
    }

    return this.getState();
  }

  /**
   * Enable the tunnel. Resolves the public URL from the provider and registers
   * the webhook when a registrar is configured. Registration failure does not
   * invalidate the tunnel — the state records `webhookRegistered: false`.
   */
  async enable(): Promise<TunnelState> {
    if (this.state.status === 'active') {
      // The tunnel is already up — only a pending registration can remain.
      return this.registerWebhook();
    }

    this.state = this.makeState('starting');

    try {
      let result: TunnelStartResult;
      if (this.config.provider === 'manual') {
        // Externally provisioned: validate the supplied URL, no process.
        result = await new StaticTunnelProvider('manual', this.config.publicUrl ?? '').start();
      } else {
        const provider = this.providerFactory(this.config.provider);
        if (!provider) {
          throw new Error(`No tunnel provider is configured for "${this.config.provider}"`);
        }
        result = await provider.start(this.buildLocalUrl());
        this.activeProvider = provider;
      }

      const validation = validatePublicUrl(result.publicUrl);
      if (!validation.valid) throw new Error(validation.reason ?? 'Tunnel returned an invalid URL');

      const publicUrl = result.publicUrl.replace(/\/+$/, '');
      this.state = this.makeState('active', publicUrl);
      return this.registerWebhook();
    } catch (error) {
      await this.stopActive();
      this.state = {
        ...this.makeState('error'),
        lastError: error instanceof Error ? error.message : 'Tunnel failed to start',
      };
      return this.getState();
    }
  }

  /**
   * Register the active tunnel's webhook once its host resolves.
   *
   * Idempotent: a no-op when there is nothing to register. Registration is
   * deliberately gated on DNS resolution — calling `setWebhook` for a host
   * Telegram cannot yet resolve makes Telegram cache an NXDOMAIN for that
   * hostname, and the name never recovers.
   */
  private async registerWebhook(): Promise<TunnelState> {
    if (!this.registrar || this.state.webhookRegistered || !this.state.publicUrl || !this.state.webhookUrl) {
      return this.getState();
    }

    const ready = await this.readinessProbe(this.state.publicUrl);
    if (!ready) {
      let hostname = this.state.publicUrl;
      try {
        hostname = new URL(this.state.publicUrl).hostname;
      } catch {
        // Keep the raw URL for the message.
      }
      this.state = {
        ...this.state,
        webhookRegistered: false,
        lastError: `Tunnel host "${hostname}" is not yet resolvable; webhook not registered. Retry once DNS has propagated.`,
        changedAt: this.now().toISOString(),
      };
      return this.getState();
    }

    const registration = await this.registrar.register(this.state.webhookUrl);
    this.state = {
      ...this.state,
      webhookRegistered: registration.ok,
      lastError: registration.ok ? undefined : registration.error,
      changedAt: this.now().toISOString(),
    };
    return this.getState();
  }

  /**
   * Disable the tunnel. Always attempts to unregister the webhook and stop the
   * provider; failures are best-effort and never throw.
   */
  async disable(): Promise<TunnelState> {
    await this.stopActive();
    this.state = this.makeState('disabled');
    return this.getState();
  }

  private async stopActive(): Promise<void> {
    if (this.registrar && this.state.webhookRegistered) {
      try {
        await this.registrar.unregister();
      } catch {
        // Best-effort: a stale webhook is superseded on the next enable.
      }
    }
    if (this.activeProvider) {
      try {
        await this.activeProvider.stop();
      } catch {
        // The provider process may already be gone.
      }
      this.activeProvider = null;
    }
  }

  private makeState(status: TunnelStatus, publicUrl?: string): TunnelState {
    return {
      status,
      provider: this.config.provider,
      publicUrl,
      webhookUrl: publicUrl ? buildTelegramWebhookUrl(publicUrl) : undefined,
      webhookRegistered: false,
      changedAt: this.now().toISOString(),
    };
  }
}

// ─── Process Provider ──────────────────────────────────────────

export interface ProcessTunnelProviderConfig {
  readonly kind: TunnelProviderKind;
  /** Executable to run (never user-supplied at runtime) */
  readonly command: string;
  /** Arguments; `{{url}}` is replaced with the local target URL */
  readonly args?: readonly string[];
  /** Milliseconds to wait for the provider to print its public URL */
  readonly startTimeoutMs?: number;
}

/**
 * Spawns a CLI tunnel (cloudflared/ngrok) and resolves with the public URL it
 * prints. The command and args come from configuration/environment, never from
 * request input, so user input cannot influence process execution.
 */
export class ProcessTunnelProvider implements TunnelProvider {
  constructor(
    readonly kind: TunnelProviderKind,
    private readonly config: ProcessTunnelProviderConfig,
  ) {}

  private child: { kill: () => void } | null = null;

  async start(localUrl: string): Promise<TunnelStartResult> {
    const { spawn } = await import('node:child_process');
    const args = (this.config.args ?? []).map((arg) => arg.replace('{{url}}', localUrl));
    const timeoutMs = this.config.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;

    return new Promise<TunnelStartResult>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(this.config.command, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (error) {
        reject(toTunnelStartError(error, this.config.command));
        return;
      }
      this.child = child;

      const settle = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        fn();
      };

      const scan = (buffer: Buffer): void => {
        const url = extractTunnelUrl(buffer.toString('utf8'));
        if (url) settle(() => resolve({ publicUrl: url }));
      };

      child.stdout?.on('data', scan);
      child.stderr?.on('data', scan);
      child.on('error', (error) => settle(() => reject(toTunnelStartError(error, this.config.command))));
      child.on('exit', (code) => {
        this.child = null;
        settle(() => reject(new Error(`Tunnel process exited (code ${code ?? 'unknown'})`)));
      });

      timer = setTimeout(() => {
        settle(() => {
          child.kill();
          this.child = null;
          reject(new Error('Timed out waiting for the tunnel to publish a public URL'));
        });
      }, timeoutMs);
    });
  }

  async stop(): Promise<void> {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }
}

/**
 * Build the canonical cloudflared quick-tunnel argument list for a local URL.
 */
export function cloudflaredArgs(): readonly string[] {
  return ['tunnel', '--url', '{{url}}', '--no-autoupdate'];
}

/**
 * Build the canonical ngrok argument list for a local URL.
 */
export function ngrokArgs(): readonly string[] {
  return ['http', '{{url}}', '--log', 'stdout'];
}

/**
 * Translate a spawn failure into an actionable error. `ENOENT` specifically
 * means the configured command is not installed or not on PATH.
 */
function toTunnelStartError(error: unknown, command: string): Error {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code === 'ENOENT') return new TunnelProviderUnavailableError(command);
  return error instanceof Error ? error : new Error(String(error));
}
