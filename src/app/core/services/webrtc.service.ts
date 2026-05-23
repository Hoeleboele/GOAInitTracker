import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Observable } from 'rxjs';

export interface PeerMessage {
  type:
    | 'player_joined'
    | 'player_initiative_updated'
    | 'initiative_locked'
    | 'state_sync'
    | 'game_started'
    | 'turns_revealed'
    | 'turn_started'
    | 'turn_ended'
    | 'round_ended'
    | 'player_disconnected'
    | 'session_closed';
  payload: unknown;
}

declare const Peer: new (id?: string, options?: object) => PeerInstance;

interface PeerInstance {
  id: string;
  on(event: string, cb: (...args: unknown[]) => void): void;
  connect(peerId: string, options?: object): DataConnectionInstance;
  destroy(): void;
}

interface DataConnectionInstance {
  peer: string;
  open: boolean;
  on(event: string, cb: (...args: unknown[]) => void): void;
  send(data: unknown): void;
  close(): void;
}

@Injectable({ providedIn: 'root' })
export class WebRtcService implements OnDestroy {
  private peer: PeerInstance | null = null;
  private hostConnection: DataConnectionInstance | null = null;
  private playerConnections: Map<string, DataConnectionInstance> = new Map();
  private _messages$ = new Subject<PeerMessage>();
  private _connectionEvents$ = new Subject<{ type: 'open' | 'close' | 'error'; peerId: string }>();

  get messages$(): Observable<PeerMessage> {
    return this._messages$.asObservable();
  }

  get connectionEvents$(): Observable<{ type: 'open' | 'close' | 'error'; peerId: string }> {
    return this._connectionEvents$.asObservable();
  }

  createHostPeer(peerId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        this.peer = peerId ? new Peer(peerId) : new Peer();

        this.peer.on('open', (id: unknown) => {
          resolve(id as string);
        });

        this.peer.on('error', (err: unknown) => {
          const peerErr = err as { type?: string };
          if (peerErr?.type === 'unavailable-id' && peerId) {
            // Code already taken — destroy and retry with a new random code
            this.peer?.destroy();
            this.peer = null;
            this.createHostPeer().then(resolve).catch(reject);
          } else {
            reject(err);
          }
        });

        this.peer.on('connection', (conn: unknown) => {
          const connection = conn as DataConnectionInstance;
          this.setupConnectionListeners(connection);
          this.playerConnections.set(connection.peer, connection);
          this._connectionEvents$.next({ type: 'open', peerId: connection.peer });
        });

        this.peer.on('disconnected', () => {
          this._connectionEvents$.next({ type: 'close', peerId: 'host' });
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  joinSession(hostPeerId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (msg: string) => {
        if (settled) return;
        settled = true;
        this.peer?.destroy();
        this.peer = null;
        reject(new Error(msg));
      };

      // 10-second timeout in case the peer ID doesn't exist
      const timeout = setTimeout(
        () => fail('Connection timed out — check the code and try again.'),
        10000
      );

      try {
        this.peer = new Peer();

        this.peer.on('open', () => {
          const conn = this.peer!.connect(hostPeerId, { reliable: true });
          this.hostConnection = conn;

          conn.on('open', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            this._connectionEvents$.next({ type: 'open', peerId: hostPeerId });
            resolve();
          });

          conn.on('error', () => {
            clearTimeout(timeout);
            fail('Could not connect — check the code and try again.');
          });

          conn.on('close', () => {
            this._connectionEvents$.next({ type: 'close', peerId: hostPeerId });
          });

          conn.on('data', (data: unknown) => {
            this._messages$.next(data as PeerMessage);
          });
        });

        this.peer.on('error', (err: unknown) => {
          clearTimeout(timeout);
          const msg = (err as { message?: string })?.message ?? 'Network error';
          fail(msg);
        });
      } catch (e) {
        clearTimeout(timeout);
        reject(e);
      }
    });
  }

  broadcastToPlayers(message: PeerMessage): void {
    this.playerConnections.forEach((conn) => {
      if (conn.open) {
        conn.send(message);
      }
    });
  }

  sendToHost(message: PeerMessage): void {
    if (this.hostConnection?.open) {
      this.hostConnection.send(message);
    }
  }

  getMyPeerId(): string {
    return this.peer?.id ?? '';
  }

  close(): void {
    this.playerConnections.forEach((conn) => conn.close());
    this.playerConnections.clear();
    this.hostConnection?.close();
    this.hostConnection = null;
    this.peer?.destroy();
    this.peer = null;
  }

  ngOnDestroy(): void {
    this.close();
  }

  private setupConnectionListeners(conn: DataConnectionInstance): void {
    conn.on('data', (data: unknown) => {
      this._messages$.next(data as PeerMessage);
    });

    conn.on('close', () => {
      this.playerConnections.delete(conn.peer);
      this._connectionEvents$.next({ type: 'close', peerId: conn.peer });
    });

    conn.on('error', () => {
      this._connectionEvents$.next({ type: 'error', peerId: conn.peer });
    });
  }
}
