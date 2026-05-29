import type { Transport } from '@modelcontextprotocol/sdk/dist/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/dist/types.js';

export class InMemoryTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  private _other: InMemoryTransport | null = null;

  private constructor() {}

  static createConnectedPair(): [InMemoryTransport, InMemoryTransport] {
    const client = new InMemoryTransport();
    const server = new InMemoryTransport();
    client._other = server;
    server._other = client;
    return [client, server];
  }

  async start(): Promise<void> {
    // no-op for in-memory
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._other) {
      throw new Error('Not connected');
    }
    this._other.onmessage?.(message);
  }

  async close(): Promise<void> {
    const other = this._other;
    this._other = null;
    other?.onclose?.();
    this.onclose?.();
  }
}
