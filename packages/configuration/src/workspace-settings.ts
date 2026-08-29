import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type ConfigurationSource = 'default' | 'user' | 'workspace' | 'session' | 'command';
export type SettingsSectionId =
  | 'general'
  | 'appearance'
  | 'runtime'
  | 'providers'
  | 'agents'
  | 'filesystem'
  | 'verification'
  | 'cli'
  | 'history'
  | 'notifications'
  | 'telemetry'
  | 'advanced';

export interface ResolvedSetting {
  readonly key: string;
  readonly section: SettingsSectionId;
  readonly value: string | number | boolean | readonly string[];
  readonly source: ConfigurationSource;
  readonly sourcePath?: string;
  readonly inherited: boolean;
  readonly sensitive: boolean;
}

export interface ResolvedConfiguration {
  readonly workspaceId: string;
  readonly revision: string;
  readonly generatedAt: string;
  readonly userConfigPath: string;
  readonly workspaceConfigPath: string;
  readonly overrideCount: number;
  readonly settings: readonly ResolvedSetting[];
}

export interface SettingsPatch {
  readonly section: SettingsSectionId;
  readonly overrides: Readonly<Record<string, unknown>>;
  readonly expectedRevision?: string;
}

export type WorkspaceCommandSource = 'cli' | 'workspace-ui' | 'agent' | 'api';

export interface EngineeringEventContext {
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly commandId?: string;
  readonly executionId?: string;
  readonly sessionId?: string;
  readonly agentId?: string;
  readonly workspaceId: string;
  readonly source: WorkspaceCommandSource | 'runtime' | 'system';
}

export interface WorkspaceCommand<TType extends string = string, TPayload = unknown> {
  readonly commandId: string;
  readonly workspaceId: string;
  readonly source: WorkspaceCommandSource;
  readonly type: TType;
  readonly payload: TPayload;
  readonly requestedAt: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly sessionId?: string;
}

export type WorkspaceCommandType =
  | 'settings.update'
  | 'settings.reset'
  | 'runtime.health-check'
  | 'graph.rebuild'
  | 'routing.catalog.get'
  | 'routing.selection.get'
  | 'routing.selection.update'
  | 'routing.preview'
  | 'routing.assignment.list'
  | 'routing.assignment.create'
  | 'routing.assignment.status'
  | 'routing.assignment.side-effect'
  | 'routing.assignment.reassign';

export type SettingsWorkspaceCommand = WorkspaceCommand<WorkspaceCommandType, Readonly<Record<string, unknown>>>;

export function createWorkspaceCommand<TType extends SettingsWorkspaceCommand['type']>(input: {
  workspaceId: string;
  source: WorkspaceCommandSource;
  type: TType;
  payload?: Readonly<Record<string, unknown>>;
  causationId?: string;
  sessionId?: string;
}): SettingsWorkspaceCommand {
  const commandId = `cmd-${randomUUID()}`;
  return {
    commandId,
    workspaceId: input.workspaceId,
    source: input.source,
    type: input.type,
    payload: input.payload ?? {},
    requestedAt: new Date().toISOString(),
    correlationId: commandId,
    causationId: input.causationId,
    sessionId: input.sessionId,
  };
}

export function isSettingsWorkspaceCommand(value: unknown): value is SettingsWorkspaceCommand {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SettingsWorkspaceCommand>;
  return (
    typeof candidate.commandId === 'string' &&
    typeof candidate.workspaceId === 'string' &&
    typeof candidate.source === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.requestedAt === 'string' &&
    typeof candidate.correlationId === 'string' &&
    candidate.payload !== null &&
    typeof candidate.payload === 'object'
  );
}

export function serializeWorkspaceCommand(command: SettingsWorkspaceCommand): string {
  const workspace = JSON.stringify(command.workspaceId);
  if (command.type === 'runtime.health-check') return `vestara runtime health --workspace ${workspace}`;
  if (command.type === 'graph.rebuild') return `vestara graph rebuild --workspace ${workspace}`;
  if (command.type === 'routing.catalog.get') return `vestara routing catalog --workspace ${workspace}`;
  if (command.type === 'routing.selection.get') return `vestara routing show --workspace ${workspace}`;
  if (command.type === 'routing.selection.update') return `vestara routing update --workspace ${workspace}`;
  if (command.type === 'routing.preview') return `vestara routing preview --workspace ${workspace}`;
  if (command.type === 'routing.assignment.list') return `vestara routing assignments --workspace ${workspace}`;
  if (command.type === 'routing.assignment.create') return `vestara routing assign --workspace ${workspace}`;
  if (command.type === 'routing.assignment.reassign') return `vestara routing reassign --workspace ${workspace}`;
  if (command.type === 'routing.assignment.status') return `vestara routing assignment-status --workspace ${workspace}`;
  if (command.type === 'routing.assignment.side-effect')
    return `vestara routing record-side-effect --workspace ${workspace}`;
  if (command.type === 'settings.reset') {
    const section = String(command.payload.section ?? 'general');
    return `vestara config reset-section ${section} --workspace ${workspace}`;
  }
  return `vestara config sync --workspace ${workspace}`;
}

export function workspaceDeepLink(
  workspaceId: string,
  target: { executionId?: string; entityId?: string; settingsSection?: SettingsSectionId },
): string {
  const root = `vestara://workspace/${encodeURIComponent(workspaceId)}`;
  if (target.executionId) return `${root}/executions/${encodeURIComponent(target.executionId)}`;
  if (target.entityId) return `${root}/entities/${encodeURIComponent(target.entityId)}`;
  return `${root}/settings/${encodeURIComponent(target.settingsSection ?? 'general')}`;
}

interface SettingDefinition {
  section: SettingsSectionId;
  defaultValue: ResolvedSetting['value'];
  validate(value: unknown): value is ResolvedSetting['value'];
  sensitive?: boolean;
}

const oneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && values.includes(value as T);
const booleanValue = (value: unknown): value is boolean => typeof value === 'boolean';
const positiveInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0;
const stringValue = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const stringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

export const WORKSPACE_SETTING_DEFINITIONS: Readonly<Record<string, SettingDefinition>> = {
  'general.workspaceName': { section: 'general', defaultValue: 'Vestara Workspace', validate: stringValue },
  'general.defaultBranch': { section: 'general', defaultValue: 'main', validate: stringValue },
  'general.startupBehavior': {
    section: 'general',
    defaultValue: 'restore-session',
    validate: oneOf(['restore-session', 'overview', 'dashboard']),
  },
  'general.theme': { section: 'general', defaultValue: 'system', validate: oneOf(['system', 'dark', 'light']) },
  'appearance.theme': { section: 'appearance', defaultValue: '', validate: stringValue },
  'general.density': { section: 'general', defaultValue: 'comfortable', validate: oneOf(['compact', 'comfortable']) },
  'general.dateTimeFormat': { section: 'general', defaultValue: 'locale', validate: oneOf(['locale', 'iso']) },
  'general.logFormat': { section: 'general', defaultValue: 'structured', validate: oneOf(['structured', 'compact']) },
  'general.defaultLandingPage': { section: 'general', defaultValue: '/overview', validate: stringValue },
  'runtime.autoRefresh': { section: 'runtime', defaultValue: true, validate: booleanValue },
  'providers.defaultProvider': { section: 'providers', defaultValue: 'opencode', validate: stringValue },
  'providers.defaultModel': { section: 'providers', defaultValue: 'auto', validate: stringValue },
  'agents.autoAssign': { section: 'agents', defaultValue: false, validate: booleanValue },
  'agents.maxConcurrent': { section: 'agents', defaultValue: 3, validate: positiveInteger },
  'filesystem.readablePaths': { section: 'filesystem', defaultValue: ['.'], validate: stringArray },
  'filesystem.writablePaths': {
    section: 'filesystem',
    defaultValue: ['apps', 'packages', 'docs'],
    validate: stringArray,
  },
  'filesystem.protectedFiles': {
    section: 'filesystem',
    defaultValue: ['.env', 'VESTARA_CONSTITUTION.md'],
    validate: stringArray,
  },
  'filesystem.dryRun': { section: 'filesystem', defaultValue: true, validate: booleanValue },
  'verification.required': { section: 'verification', defaultValue: true, validate: booleanValue },
  'verification.profile': {
    section: 'verification',
    defaultValue: 'standard',
    validate: oneOf(['fast', 'standard', 'strict']),
  },
  'verification.build': { section: 'verification', defaultValue: true, validate: booleanValue },
  'verification.typecheck': { section: 'verification', defaultValue: true, validate: booleanValue },
  'verification.tests': { section: 'verification', defaultValue: true, validate: booleanValue },
  'verification.visual': { section: 'verification', defaultValue: false, validate: booleanValue },
  'notifications.enabled': { section: 'notifications', defaultValue: true, validate: booleanValue },
  'telemetry.level': {
    section: 'telemetry',
    defaultValue: 'detailed',
    validate: oneOf(['minimal', 'standard', 'detailed']),
  },
  'advanced.experimentalFeatures': { section: 'advanced', defaultValue: false, validate: booleanValue },
};

interface ConfigurationFile {
  version?: number;
  overrides?: Record<string, unknown>;
}

export class WorkspaceConfigurationService {
  readonly userConfigPath: string;
  readonly workspaceConfigPath: string;
  private readonly sessionOverrides = new Map<string, unknown>();

  constructor(
    readonly workspaceRoot: string,
    readonly workspaceId: string,
    options?: { userConfigPath?: string; workspaceConfigPath?: string },
  ) {
    this.userConfigPath = options?.userConfigPath ?? path.join(os.homedir(), '.config', 'vestara', 'config.json');
    this.workspaceConfigPath = options?.workspaceConfigPath ?? path.join(workspaceRoot, '.vestara', 'config.json');
  }

  resolve(commandOverrides: Readonly<Record<string, unknown>> = {}): ResolvedConfiguration {
    const user = this.read(this.userConfigPath);
    const workspace = this.read(this.workspaceConfigPath);
    const settings: ResolvedSetting[] = [];
    for (const [key, definition] of Object.entries(WORKSPACE_SETTING_DEFINITIONS)) {
      let value = definition.defaultValue;
      let source: ConfigurationSource = 'default';
      let sourcePath: string | undefined;
      if (user[key] !== undefined && definition.validate(user[key])) {
        value = user[key];
        source = 'user';
        sourcePath = this.userConfigPath;
      }
      if (workspace[key] !== undefined && definition.validate(workspace[key])) {
        value = workspace[key];
        source = 'workspace';
        sourcePath = this.workspaceConfigPath;
      }
      if (this.sessionOverrides.has(key) && definition.validate(this.sessionOverrides.get(key))) {
        value = this.sessionOverrides.get(key) as ResolvedSetting['value'];
        source = 'session';
        sourcePath = undefined;
      }
      if (commandOverrides[key] !== undefined && definition.validate(commandOverrides[key])) {
        value = commandOverrides[key] as ResolvedSetting['value'];
        source = 'command';
        sourcePath = undefined;
      }
      settings.push({
        key,
        section: definition.section,
        value: definition.sensitive && source !== 'default' ? '••••••••' : value,
        source,
        sourcePath,
        inherited: source !== 'workspace',
        sensitive: definition.sensitive ?? false,
      });
    }
    return {
      workspaceId: this.workspaceId,
      revision: this.revision(workspace),
      generatedAt: new Date().toISOString(),
      userConfigPath: this.userConfigPath,
      workspaceConfigPath: this.workspaceConfigPath,
      overrideCount: Object.keys(workspace).length,
      settings,
    };
  }

  save(patch: SettingsPatch): ResolvedConfiguration {
    const current = this.resolve();
    if (patch.expectedRevision && patch.expectedRevision !== current.revision) {
      throw new Error('Configuration changed since it was loaded');
    }
    const workspace = this.read(this.workspaceConfigPath);
    for (const [key, value] of Object.entries(patch.overrides)) {
      const definition = WORKSPACE_SETTING_DEFINITIONS[key];
      if (!definition || definition.section !== patch.section)
        throw new Error(`Setting is not valid for ${patch.section}: ${key}`);
      if (!definition.validate(value)) throw new Error(`Invalid value for ${key}`);
      workspace[key] = value;
    }
    this.write(this.workspaceConfigPath, workspace);
    return this.resolve();
  }

  resetSection(section: SettingsSectionId, expectedRevision?: string): ResolvedConfiguration {
    const current = this.resolve();
    if (expectedRevision && expectedRevision !== current.revision)
      throw new Error('Configuration changed since it was loaded');
    const workspace = this.read(this.workspaceConfigPath);
    for (const [key, definition] of Object.entries(WORKSPACE_SETTING_DEFINITIONS)) {
      if (definition.section === section) delete workspace[key];
    }
    this.write(this.workspaceConfigPath, workspace);
    return this.resolve();
  }

  setSessionOverrides(overrides: Readonly<Record<string, unknown>>): void {
    for (const [key, value] of Object.entries(overrides)) {
      const definition = WORKSPACE_SETTING_DEFINITIONS[key];
      if (!definition?.validate(value)) throw new Error(`Invalid session override: ${key}`);
      this.sessionOverrides.set(key, value);
    }
  }

  private read(filePath: string): Record<string, unknown> {
    if (!fs.existsSync(filePath)) return {};
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ConfigurationFile;
    return parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {};
  }

  private write(filePath: string, overrides: Record<string, unknown>): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify({ version: 1, overrides }, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, filePath);
  }

  private revision(overrides: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(overrides)).digest('hex').slice(0, 16);
  }
}
