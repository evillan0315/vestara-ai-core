export interface StateTransition<TState extends string, TEvent extends string> {
  readonly from: TState;
  readonly to: TState;
  readonly event: TEvent;
  readonly timestamp: string;
}

export interface StateMachineConfig<TState extends string> {
  initial: TState;
  states: Record<TState, readonly TState[]>;
}

export interface StateMachine<TState extends string, TEvent extends string = TState> {
  readonly state: TState;

  transition(event: TEvent): StateMachine<TState, TEvent>;

  canTransition(event: TEvent): boolean;

  subscribe(listener: (transition: StateTransition<TState, TEvent>) => void): () => void;

  history(): readonly StateTransition<TState, TEvent>[];

  reset(): void;
}

class StateMachineImpl<TState extends string> implements StateMachine<TState, TState> {
  private _state: TState;
  private readonly _initial: TState;
  private readonly _states: Record<TState, readonly TState[]>;
  private _history: StateTransition<TState, TState>[] = [];
  private readonly _listeners = new Set<(transition: StateTransition<TState, TState>) => void>();

  constructor(config: StateMachineConfig<TState>) {
    if (!config.states[config.initial]) {
      throw new Error(`Invalid config: initial state "${String(config.initial)}" not found in states`);
    }
    this._state = config.initial;
    this._initial = config.initial;
    this._states = config.states;
  }

  get state(): TState {
    return this._state;
  }

  transition(event: TState): this {
    const targets = this._states[this._state] ?? [];
    const targetState = event;

    if (!targets.includes(targetState)) {
      throw new Error(
        `Invalid transition: "${String(this._state)}" cannot transition to "${String(targetState)}". Valid targets: [${targets.map((s) => `"${String(s)}"`).join(', ')}]`,
      );
    }

    const transition: StateTransition<TState, TState> = {
      from: this._state,
      to: targetState,
      event,
      timestamp: new Date().toISOString(),
    };

    this._state = targetState;
    this._history = [...this._history, transition];

    for (const listener of this._listeners) {
      listener(transition);
    }

    return this;
  }

  canTransition(event: TState): boolean {
    return (this._states[this._state] ?? []).includes(event);
  }

  subscribe(listener: (transition: StateTransition<TState, TState>) => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  history(): readonly StateTransition<TState, TState>[] {
    return this._history;
  }

  reset(): void {
    this._state = this._initial;
    this._history = [];
  }
}

export function createStateMachine<TState extends string>(
  config: StateMachineConfig<TState>,
): StateMachine<TState, TState> {
  return new StateMachineImpl(config);
}
