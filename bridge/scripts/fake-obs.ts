// A fake obs-websocket v5 server for the checks: Hello with an authentication challenge, Identify, the requests TCG Bridge makes and
// pushed events, over the JSON subprotocol. State is plain data the checks change, then they push the matching event.
import { createHash } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';

export interface FakeItem { sceneItemId: number; sourceName: string; sceneItemEnabled: boolean; isGroup: boolean }
export interface FakeInput { inputName: string; inputKind: string; url: string }

const sha = (s: string) => createHash('sha256').update(s).digest('base64');

export class FakeObs {
  password = '';
  streaming = false;
  scene = 'Gameplay';
  scenes: Record<string, FakeItem[]> = {};
  groups: Record<string, FakeItem[]> = {};
  inputs: FakeInput[] = [];
  pressed: { inputName: string; propertyName: string }[] = [];
  requests: string[] = [];
  identified = 0;
  subscriptions: number[] = [];
  private server: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  port = 0;

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const server = new WebSocketServer({ host: '127.0.0.1', port: this.port, handleProtocols: p => (p.has('obswebsocket.json') ? 'obswebsocket.json' : false) }, resolve);
      server.on('error', reject);
      server.on('connection', ws => this.onConnection(ws));
      this.server = server;
    });
    this.port = (this.server!.address() as { port: number }).port;
  }

  /** Drops every client and stops listening, like OBS being closed. */
  async close(): Promise<void> {
    for (const c of this.clients) c.terminate();
    this.clients.clear();
    const s = this.server;
    this.server = null;
    if (s) await new Promise<void>(r => s.close(() => r()));
  }

  /** Pushes an event to every identified client. */
  emit(eventType: string, eventData: Record<string, unknown> = {}): void {
    for (const c of this.clients) c.send(JSON.stringify({ op: 5, d: { eventType, eventIntent: 1, eventData } }));
  }

  private onConnection(ws: WebSocket): void {
    const challenge = 'challenge-abc';
    const salt = 'salt-xyz';
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
    ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.0', rpcVersion: 1, ...(this.password ? { authentication: { challenge, salt } } : {}) } }));
    ws.on('message', raw => {
      const msg = JSON.parse(String(raw)) as { op: number; d: Record<string, unknown> };
      if (msg.op === 1) {
        if (this.password && msg.d.authentication !== sha(sha(this.password + salt) + challenge)) return void ws.close(4009, 'Authentication failed.');
        this.identified++;
        this.subscriptions.push(Number(msg.d.eventSubscriptions));
        ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      } else if (msg.op === 6) {
        const { requestType, requestId, requestData } = msg.d as { requestType: string; requestId: string; requestData?: Record<string, string> };
        this.requests.push(requestType);
        const answer = this.answer(requestType, requestData ?? {});
        const status = answer ? { result: true, code: 100 } : { result: false, code: 600, comment: 'No such thing' };
        ws.send(JSON.stringify({ op: 7, d: { requestType, requestId, requestStatus: status, responseData: answer ?? undefined } }));
      }
    });
  }

  private answer(type: string, data: Record<string, string>): Record<string, unknown> | null {
    switch (type) {
      case 'GetStreamStatus': return { outputActive: this.streaming, outputPaused: false };
      case 'GetCurrentProgramScene': return { currentProgramSceneName: this.scene, sceneName: this.scene };
      case 'GetInputList': return { inputs: this.inputs.filter(i => !data.inputKind || i.inputKind === data.inputKind).map(i => ({ inputName: i.inputName, inputKind: i.inputKind })) };
      case 'GetInputSettings': {
        const i = this.inputs.find(x => x.inputName === data.inputName);
        return i ? { inputKind: i.inputKind, inputSettings: { url: i.url } } : null;
      }
      case 'GetSceneItemList': return this.scenes[data.sceneName] ? { sceneItems: this.scenes[data.sceneName] } : null;
      case 'GetGroupSceneItemList': return this.groups[data.sceneName] ? { sceneItems: this.groups[data.sceneName] } : null;
      case 'PressInputPropertiesButton':
        if (!this.inputs.some(x => x.inputName === data.inputName)) return null;
        this.pressed.push({ inputName: data.inputName, propertyName: data.propertyName });
        return {};
      default: return null;
    }
  }
}
