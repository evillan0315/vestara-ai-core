/**
 * AR-UI-B0: Presence Data Layer
 *
 * Provides real-time presence tracking for agents in the Activity Room.
 * Builds on the AR-UI-A team roster with heartbeat, connection status,
 * and workspace-level presence aggregation.
 *
 * Architecture Traceability:
 *   AR-UI-B: Presence Layer (phases 3-6)
 *   @see AR-UI-A: Authoritative Team Roster (phases 0-2)
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type {
  PresenceConfig,
  PresenceEntry,
  PresenceEvent,
  PresenceStateData,
  PresenceTask,
  PresenceActivity,
} from './presence-types';
import { DEFAULT_PRESENCE_CONFIG } from './presence-types';

// ─── Presence Data Layer ───────────────────────────────────────

/**
 * AR-UI-B0: Real-time presence tracking for agents.
 * Manages heartbeat monitoring, state transitions, and presence aggregation.
 */
export class PresenceDataLayer {
  private config: PresenceConfig;
  private entries: Map<string, PresenceEntry> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(state: PresenceStateData) => void> = new Set();

  constructor(config?: Partial<PresenceConfig>) {
    this.config = { ...DEFAULT_PRESENCE_CONFIG, ...config };
  }

  /**
   * AR-UI-B0: Start heartbeat monitoring.
   */
  start(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      this.checkTimeouts();
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * AR-UI-B0: Stop heartbeat monitoring.
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * AR-UI-B0: Register a presence listener.
   */
  onStateChange(listener: (state: PresenceStateData) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * AR-UI-B0: Process a presence event.
   */
  handleEvent(event: PresenceEvent): void {
    const now = new Date().toISOString();
    const existing = this.entries.get(event.agentId);

    switch (event.type) {
      case 'heartbeat':
        this.updateHeartbeat(event.agentId, now);
        break;

      case 'state-change':
        if (existing) {
          this.entries.set(event.agentId, {
            ...existing,
            state: (event.payload as { state: PresenceEntry['state'] }).state,
            lastHeartbeatAt: now,
          });
        }
        break;

      case 'task-start':
        if (existing) {
          const task = event.payload as PresenceTask;
          this.entries.set(event.agentId, {
            ...existing,
            state: 'busy',
            currentTask: task,
            lastHeartbeatAt: now,
          });
        }
        break;

      case 'task-complete':
        if (existing) {
          this.entries.set(event.agentId, {
            ...existing,
            state: 'online',
            currentTask: undefined,
            lastHeartbeatAt: now,
          });
        }
        break;

      case 'activity':
        if (existing) {
          const activity = event.payload as PresenceActivity;
          this.entries.set(event.agentId, {
            ...existing,
            lastActivity: activity,
            lastHeartbeatAt: now,
          });
        }
        break;
    }

    this.notifyListeners();
  }

  /**
   * AR-UI-B0: Update an agent's heartbeat.
   */
  updateHeartbeat(agentId: string, timestamp: string): void {
    const existing = this.entries.get(agentId);

    if (existing) {
      this.entries.set(agentId, {
        ...existing,
        state: 'online',
        lastHeartbeatAt: timestamp,
        connectionDurationMs: new Date(timestamp).getTime() - new Date(existing.connectedAt).getTime(),
      });
    } else {
      // New agent connecting
      this.entries.set(agentId, {
        agentId,
        state: 'online',
        lastHeartbeatAt: timestamp,
        connectedAt: timestamp,
        connectionDurationMs: 0,
      });
    }
  }

  /**
   * AR-UI-B0: Remove an agent from presence tracking.
   */
  removeAgent(agentId: string): void {
    this.entries.delete(agentId);
    this.notifyListeners();
  }

  /**
   * AR-UI-B0: Check for timed-out agents and update states.
   */
  private checkTimeouts(): void {
    const now = Date.now();
    let changed = false;

    for (const [agentId, entry] of this.entries) {
      const lastHeartbeat = new Date(entry.lastHeartbeatAt).getTime();
      const elapsed = now - lastHeartbeat;

      let newState = entry.state;

      if (elapsed > this.config.offlineTimeoutMs) {
        newState = 'offline';
      } else if (elapsed > this.config.awayTimeoutMs) {
        newState = 'away';
      } else if (elapsed > this.config.idleTimeoutMs) {
        newState = 'idle';
      } else if (entry.state === 'offline' || entry.state === 'away' || entry.state === 'idle') {
        // Agent came back online
        newState = 'online';
      }

      if (newState !== entry.state) {
        this.entries.set(agentId, { ...entry, state: newState });
        changed = true;
      }
    }

    if (changed) {
      this.notifyListeners();
    }
  }

  /**
   * AR-UI-B0: Build the current presence state.
   */
  getState(): PresenceStateData {
    const entries = Array.from(this.entries.values());

    const onlineCount = entries.filter((e) => e.state === 'online').length;
    const idleCount = entries.filter((e) => e.state === 'idle').length;
    const busyCount = entries.filter((e) => e.state === 'busy').length;
    const offlineCount = entries.filter((e) => e.state === 'offline' || e.state === 'away').length;

    return {
      entries,
      onlineCount,
      idleCount,
      busyCount,
      offlineCount,
      totalCount: entries.length,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  /**
   * AR-UI-B0: Notify all listeners of state change.
   */
  private notifyListeners(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('Presence listener error:', err);
      }
    }
  }
}
