import { vi } from "vitest";

vi.mock("@elizaos/core", () => {
  // Minimal Service base class for WpvService to extend
  class Service {
    static serviceType = "base";
    static start(_runtime: unknown): Promise<Service> {
      return Promise.resolve(new Service());
    }
    static stop(_runtime: unknown): Promise<void> {
      return Promise.resolve();
    }
    get serviceType(): string {
      return (this.constructor as typeof Service).serviceType;
    }
    async initialize(_runtime: unknown): Promise<void> {}
    async stop(): Promise<void> {}
  }

  return {
    Service,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});
