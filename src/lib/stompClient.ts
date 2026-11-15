import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export type SocketConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'OFFLINE';

export class AstroStompService {
  private client: Client | null = null;
  private subscriptions = new Map<string, StompSubscription>();
  private handlers = new Map<string, Set<(data: unknown) => void>>();
  private statusListeners = new Set<(status: SocketConnectionStatus) => void>();
  private currentStatus: SocketConnectionStatus = 'DISCONNECTED';
  private forceOffline = false;

  public getStatus(): SocketConnectionStatus {
    return this.currentStatus;
  }

  public onStatusChange(cb: (status: SocketConnectionStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.currentStatus);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private setStatus(status: SocketConnectionStatus) {
    this.currentStatus = status;
    for (const cb of this.statusListeners) {
      cb(status);
    }
  }

  public connect(): void {
    if (this.forceOffline || !navigator.onLine) {
      this.setStatus('OFFLINE');
      return;
    }
    if (this.client?.active) return;

    this.setStatus('CONNECTING');
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws-telemetry') as unknown as WebSocket,
      reconnectDelay: 2500,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      debug: () => {},
      onConnect: () => {
        this.setStatus('CONNECTED');
        this.resubscribeAll();
      },
      onDisconnect: () => {
        this.setStatus(this.forceOffline || !navigator.onLine ? 'OFFLINE' : 'DISCONNECTED');
      },
      onWebSocketClose: () => {
        this.setStatus(this.forceOffline || !navigator.onLine ? 'OFFLINE' : 'DISCONNECTED');
      },
      onStompError: () => {
        this.setStatus('DISCONNECTED');
      },
    });

    this.client = client;
    client.activate();
  }

  public async disconnect(asOffline = false): Promise<void> {
    this.forceOffline = asOffline;
    for (const sub of this.subscriptions.values()) {
      try {
        sub.unsubscribe();
      } catch {
        // Ignore
      }
    }
    this.subscriptions.clear();
    if (this.client) {
      try {
        await this.client.deactivate();
      } catch {
        // Ignore
      }
      this.client = null;
    }
    this.setStatus(asOffline ? 'OFFLINE' : 'DISCONNECTED');
  }

  public async setSimulatedOffline(offline: boolean): Promise<void> {
    if (offline) {
      await this.disconnect(true);
    } else {
      this.forceOffline = false;
      this.connect();
    }
  }

  public subscribe<T = unknown>(destination: string, cb: (payload: T) => void): () => void {
    let set = this.handlers.get(destination);
    if (!set) {
      set = new Set();
      this.handlers.set(destination, set);
    }
    set.add(cb as (data: unknown) => void);

    if (this.client?.connected && !this.subscriptions.has(destination)) {
      const sub = this.client.subscribe(destination, (msg: IMessage) => {
        try {
          const parsed = JSON.parse(msg.body);
          const callbacks = this.handlers.get(destination);
          if (callbacks) {
            for (const fn of callbacks) {
              fn(parsed);
            }
          }
        } catch {
          // Ignore invalid JSON
        }
      });
      this.subscriptions.set(destination, sub);
    }

    return () => {
      const callbacks = this.handlers.get(destination);
      if (callbacks) {
        callbacks.delete(cb as (data: unknown) => void);
        if (callbacks.size === 0) {
          this.handlers.delete(destination);
          const sub = this.subscriptions.get(destination);
          if (sub) {
            try {
              sub.unsubscribe();
            } catch {
              // Ignore
            }
            this.subscriptions.delete(destination);
          }
        }
      }
    };
  }

  public publish(destination: string, body: unknown): boolean {
    if (!this.client?.connected || this.forceOffline || !navigator.onLine) {
      return false;
    }
    this.client.publish({
      destination,
      body: JSON.stringify(body),
    });
    return true;
  }

  private resubscribeAll() {
    if (!this.client?.connected) return;
    this.subscriptions.clear();
    for (const destination of this.handlers.keys()) {
      const sub = this.client.subscribe(destination, (msg: IMessage) => {
        try {
          const parsed = JSON.parse(msg.body);
          const callbacks = this.handlers.get(destination);
          if (callbacks) {
            for (const fn of callbacks) {
              fn(parsed);
            }
          }
        } catch {
          // Ignore
        }
      });
      this.subscriptions.set(destination, sub);
    }
  }
}

export const stompService = new AstroStompService();
