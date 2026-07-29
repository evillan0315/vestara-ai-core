export type CommandHandler = (args: string[]) => Promise<void>;

export class CommandRegistry {
  private handlers = new Map<string, CommandHandler>();

  register(name: string, handler: CommandHandler): void {
    this.handlers.set(name, handler);
  }

  get(name: string): CommandHandler | undefined {
    return this.handlers.get(name);
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  names(): string[] {
    return Array.from(this.handlers.keys());
  }
}
