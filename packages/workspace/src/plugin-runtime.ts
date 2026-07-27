/**
 * PluginRuntime — Manages plugin lifecycle and hook execution.
 *
 * Plugins are first-class enterprise-governed capabilities.
 * Each plugin has identity, permissions, hooks, and generates audit events.
 *
 * Architecture Traceability:
 *   PCS: PCS-014 — Plugin Ecosystem
 */

import type { PluginRegistry } from './plugin-registry';
import type { PluginDefinition, PluginExecution } from './types';
import type { WorkspaceSession } from './workspace-session';

export class PluginRuntime {
  private registry: PluginRegistry;

  constructor(opts: { registry: PluginRegistry }) {
    this.registry = opts.registry;
  }

  /**
   * Execute all active plugins that subscribe to a given hook.
   */
  async executeHook(hook: string, session: WorkspaceSession): Promise<PluginExecution[]> {
    const plugins = await this.registry.list();
    const activePlugins = plugins.filter((p) => p.status === 'active' && p.hooks.includes(hook));
    const results: PluginExecution[] = [];

    for (const plugin of activePlugins) {
      const exec = await this.executePlugin(plugin, hook, session);
      results.push(exec);
    }

    return results;
  }

  /**
   * Execute a single plugin hook.
   */
  private async executePlugin(
    plugin: PluginDefinition,
    hook: string,
    _session: WorkspaceSession,
  ): Promise<PluginExecution> {
    const startTime = performance.now();
    const execution: PluginExecution = {
      id: `pexec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pluginId: plugin.id,
      hook,
      status: 'success',
      duration: 0,
      message: '',
      timestamp: new Date().toISOString(),
    };

    try {
      // Simulate plugin execution based on plugin type
      switch (plugin.id) {
        case 'vestara/github':
          execution.message = `[GitHub] Hook "${hook}" processed. Would create issue/PR based on artifacts.`;
          break;
        case 'vestara/jira':
          execution.message = `[Jira] Hook "${hook}" processed. Would create/update ticket.`;
          break;
        case 'vestara/slack':
          execution.message = `[Slack] Hook "${hook}" processed. Would send notification.`;
          break;
        case 'vestara/logs':
          execution.message = `[Logs] Hook "${hook}" processed. Would export structured logs.`;
          break;
        default:
          execution.message = `[${plugin.id}] Hook "${hook}" executed.`;
      }
      execution.duration = Math.round(performance.now() - startTime);
    } catch (err) {
      execution.status = 'failed';
      execution.message = `[${plugin.id}] Hook "${hook}" failed: ${(err as Error).message}`;
      execution.duration = Math.round(performance.now() - startTime);
    }

    await this.registry.addExecution(execution);
    return execution;
  }

  /**
   * List all registered plugins.
   */
  async listPlugins(): Promise<PluginDefinition[]> {
    return this.registry.list();
  }

  /**
   * Get a specific plugin.
   */
  async getPlugin(id: string): Promise<PluginDefinition | null> {
    return this.registry.get(id);
  }

  /**
   * Toggle a plugin's active status.
   */
  async togglePlugin(id: string): Promise<PluginDefinition | null> {
    const plugin = await this.registry.get(id);
    if (!plugin) return null;
    const newStatus = plugin.status === 'active' ? 'disabled' : 'active';
    await this.registry.setStatus(id, newStatus);
    return this.registry.get(id);
  }

  /**
   * Get execution history for a plugin.
   */
  async getExecutions(pluginId: string): Promise<PluginExecution[]> {
    return this.registry.getExecutions(pluginId);
  }

  // --- Rendering ---

  renderPluginList(plugins: PluginDefinition[]): string {
    if (plugins.length === 0) return 'No plugins installed.';
    const lines: string[] = ['Plugins:'];
    for (const p of plugins) {
      const icon = p.status === 'active' ? '✓' : '✗';
      lines.push(`  ${icon} ${p.id.padEnd(20)} ${p.name.padEnd(25)} ${p.status}`);
      lines.push(`     ${p.description}`);
      lines.push(`     Hooks: ${p.hooks.join(', ')}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  renderPluginDetail(plugin: PluginDefinition): string {
    const lines: string[] = [];
    lines.push(`Plugin: ${plugin.name} (${plugin.id})`);
    lines.push(`Version: ${plugin.version}`);
    lines.push(`Publisher: ${plugin.publisher}`);
    lines.push(`Status: ${plugin.status}`);
    lines.push(`Description: ${plugin.description}`);
    lines.push('');
    lines.push('Permissions:');
    for (const perm of plugin.permissions) {
      lines.push(`  • ${perm.action} ${perm.resource}`);
    }
    lines.push('');
    lines.push('Hooks:');
    for (const hook of plugin.hooks) {
      lines.push(`  • ${hook}`);
    }
    return lines.join('\n');
  }
}
