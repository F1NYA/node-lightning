import { Logger, manager } from "@lntools/logger";
import * as noise from "@lntools/noise";
import { NoiseSocket } from "@lntools/noise";
import assert from "assert";
import { EventEmitter } from "events";
import * as MessageFactory from "./message-factory";
import { InitMessage } from "./messages/init-message";
import { IWireMessage } from "./messages/wire-message";
import { PeerConnectOptions } from "./peer-connect-options";
import { PeerState } from "./peer-state";
import { PingPongState } from "./pingpong-state";

export declare interface IPeerMessageSender {
  sendMessage(msg: IWireMessage): void;
}

export declare interface IPeerMessageReceiver {
  on(event: "message", listener: (msg: IWireMessage) => void): this;
}

// tslint:disable-next-line: interface-name
export declare interface Peer {
  addListener(event: "close", listener: () => void): this;
  addListener(event: "end", listener: () => void): this;
  addListener(event: "error", listener: (err: Error) => void): this;
  addListener(event: "message", listener: (msg: any) => void): this;
  addListener(event: "open", listener: () => void): this;
  addListener(event: "rawmessage", listener: (msg: Buffer) => void): this;
  addListener(event: "ready", listener: () => void): this;
  addListener(event: "sending", listener: (buf: Buffer) => void): this;

  listenerCount(
    event: "close" | "end" | "error" | "message" | "open" | "rawmessage" | "ready" | "sending",
  ): number;

  off(event: "close", listener: () => void): this;
  off(event: "end", listener: () => void): this;
  off(event: "error", listener: (err: Error) => void): this;
  off(event: "message", listener: (msg: IWireMessage) => void): this;
  off(event: "open", listener: () => void): this;
  off(event: "rawmessage", listener: (msg: Buffer) => void): this;
  off(event: "ready", listener: () => void): this;
  off(event: "sending", listener: (buf: Buffer) => void): this;

  on(event: "close", listener: () => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: "message", listener: (msg: IWireMessage) => void): this;
  on(event: "open", listener: () => void): this;
  on(event: "rawmessage", listener: (msg: Buffer) => void): this;
  on(event: "ready", listener: () => void): this;
  on(event: "sending", listener: (buf: Buffer) => void): this;

  once(event: "close", listener: () => void): this;
  once(event: "end", listener: () => void): this;
  once(event: "error", listener: (err: Error) => void): this;
  once(event: "message", listener: (msg: IWireMessage) => void): this;
  once(event: "open", listener: () => void): this;
  once(event: "rawmessage", listener: (msg: Buffer) => void): this;
  once(event: "ready", listener: () => void): this;
  once(event: "sending", listener: (buf: Buffer) => void): this;

  prependListener(event: "close", listener: () => void): this;
  prependListener(event: "end", listener: () => void): this;
  prependListener(event: "error", listener: (err: Error) => void): this;
  prependListener(event: "message", listener: (msg: IWireMessage) => void): this;
  prependListener(event: "open", listener: () => void): this;
  prependListener(event: "rawmessage", listener: (msg: Buffer) => void): this;
  prependListener(event: "ready", listener: () => void): this;
  prependListener(event: "sending", listener: (buf: Buffer) => void): this;

  prependOnceListener(event: "close", listener: () => void): this;
  prependOnceListener(event: "end", listener: () => void): this;
  prependOnceListener(event: "error", listener: (err: Error) => void): this;
  prependOnceListener(event: "message", listener: (msg: IWireMessage) => void): this;
  prependOnceListener(event: "open", listener: () => void): this;
  prependOnceListener(event: "rawmessage", listener: (msg: Buffer) => void): this;
  prependOnceListener(event: "ready", listener: () => void): this;
  prependOnceListener(event: "sending", listener: (buf: Buffer) => void): this;

  removeAllListeners(
    event?: "close" | "end" | "error" | "message" | "open" | "rawmessage" | "ready" | "sending",
  ): this;

  removeListener(event: "close", listener: () => void): this;
  removeListener(event: "end", listener: () => void): this;
  removeListener(event: "error", listener: (err: Error) => void): this;
  removeListener(event: "message", listener: (msg: IWireMessage) => void): this;
  removeListener(event: "open", listener: () => void): this;
  removeListener(event: "rawmessage", listener: (msg: Buffer) => void): this;
  removeListener(event: "ready", listener: () => void): this;
  removeListener(event: "sending", listener: (buf: Buffer) => void): this;

  rawListeners(event: "close"): Array<() => void>;
  rawListeners(event: "end"): Array<() => void>;
  rawListeners(event: "error"): Array<(err: Error) => void>;
  rawListeners(event: "message"): Array<(msg: IWireMessage) => void>;
  rawListeners(event: "open"): Array<() => void>;
  rawListeners(event: "rawmessage"): Array<(msg: Buffer) => void>;
  rawListeners(event: "ready"): Array<() => void>;
  rawListeners(event: "sending"): Array<(buf: Buffer) => void>;
}

/**
 * Peer is an EventEmitter that layers the Lightning Network wire
 * protocol ontop of an @lntools/noise NoiseSocket.
 *
 * Peer itself is a state-machine with three states:
 * 1. pending
 * 2. awaiting_peer_init
 * 3. ready
 *
 * The Peer instance starts in `pending` until the underlying NoiseSocket
 * has connected.
 *
 * It then immediately sends the InitMessage as specified in the Peer
 * constructor.
 *
 * At this point, the Peer transitions to `awaiting_peer_init`.
 *
 * Once the remote peer has sent its InitMessage, the state is
 * transitioned to `ready` and the Peer can be begin sending and
 * receiving messages.
 *
 * Once the peer is in the `ready` state it will begin emitting `message`
 * events when it receives new messages from the peer.
 *
 * The Peer will also start a PingPong state machine to manage sending
 * and receiving Pings and Pongs as defined in BOLT01
 *
 * A choice (probably wrongly) was made to make Peer an EventEmitter
 * instead of a DuplexStream operating in object mode. We need to keep
 * the noise socket in flowing mode (instead of paused) because we will
 * not know the length of messages until after we have deserialized the
 * message. This makes it a challenge to implement a DuplexStream that
 * emits objects (such as messages).
 *
 * @emits ready the underlying socket has performed its handshake and
 * initialization message swap has occurred.
 *
 * @emits message a new message has been received. Only sent after the
 * `ready` event has fired.
 *
 * @emits rawmessage outputs the message as a raw buffer instead of
 * a deserialized message.
 *
 * @emits error emitted when there is an error processing a message.
 * The underlying socket will be closed after this event is emitted.
 *
 * @emits close emitted when the connection to the peer has completedly
 * closed.
 *
 * @emits open emmited when the connection to the peer has been established
 * after the handshake has been performed
 *
 * @emits end emitted when the connection to the peer is ending.
 */
export class Peer extends EventEmitter implements IPeerMessageSender, IPeerMessageReceiver {
  public static states = PeerState;

  public state: PeerState = PeerState.pending;
  public socket: NoiseSocket;
  public messageCounter: number = 0;
  public pingPongState: PingPongState;
  public logger: Logger;
  public remoteInit: InitMessage;
  public localInit: InitMessage;
  public initMessageFactory: () => InitMessage;

  constructor(initMessageFactory: () => InitMessage) {
    super();
    this.pingPongState = new PingPongState(this);
    this.initMessageFactory = initMessageFactory;
  }

  /**
   * Connect to the remote peer and binds socket events into the Peer.
   */
  public connect({ ls, rpk, host, port = 9735 }: PeerConnectOptions) {
    // construct a logger before connecting
    this.logger = manager.create(
      "PEER",
      rpk && rpk.toString("hex").substring(0, 4) + ".." + rpk.toString("hex").substring(60, 64),
    );

    this.socket = noise.connect({ ls, rpk, host, port });
    this.socket.on("ready", this._onSocketReady.bind(this));
    this.socket.on("end", this._onSocketEnd.bind(this));
    this.socket.on("close", this._onSocketClose.bind(this));
    this.socket.on("error", this._onSocketError.bind(this));
    this.socket.on("data", this._onSocketData.bind(this));
  }

  /**
   * Writes the message on the NoiseSocket
   */
  public sendMessage(m: any): boolean {
    assert.ok(this.state === PeerState.ready, new Error("Peer is not ready"));
    const buf = m.serialize() as Buffer;
    this.emit("sending", buf);
    return this.socket.write(buf);
  }

  /**
   * Closes the socket
   */
  public disconnect() {
    this.socket.end();
  }

  /////////////////////////////////////////////////////////

  private _onSocketReady() {
    // now that we're connected, we need to wait for the remote reply
    // before any other messages can be receieved or sent
    this.state = PeerState.awaiting_peer_init;

    // blast off our init message
    this.emit("open");
    this._sendInitMessage();
  }

  private _onSocketEnd() {
    this.emit("end");
  }

  private _onSocketClose() {
    if (this.pingPongState) this.pingPongState.onDisconnecting();
    this.emit("close");
  }

  private _onSocketError(err) {
    // emit what error we recieved
    this.emit("error", err);
  }

  private _onSocketData(raw) {
    try {
      if (this.state === PeerState.awaiting_peer_init) {
        this._processPeerInitMessage(raw);
      } else {
        this._processMessage(raw);
      }
    } catch (err) {
      // we have a problem, kill connectinon with the client
      this.socket.end();

      // emit the error event
      this.emit("error", err);
    }
  }

  /**
   * Sends the initialization message to the peer. This message
   * does not matter if it is sent before or after the peer sends
   * there message.
   */
  private _sendInitMessage() {
    // construct the init message
    const msg = this.initMessageFactory();

    // capture local init message for future use
    this.localInit = msg;

    // fire off the init message to the peer
    const payload = msg.serialize();
    this.emit("sending", payload);
    this.socket.write(payload);
  }

  /**
   * Processes the initialization message sent by the remote peer.
   * Once this is successfully completed, the state is transitioned
   * to `active`
   */
  private _processPeerInitMessage(raw: Buffer) {
    // deserialize message
    const m = MessageFactory.deserialize(raw) as InitMessage;
    if (this.logger) {
      this.logger.info(
        "peer initialized",
        `init_routing_sync: ${m.localInitialRoutingSync}`,
        `data_loss_protection: ${m.localDataLossProtect}`,
        `gossip_queries: ${m.localGossipQueries}`,
        `gossip_queries_ex: ${m.localGossipQueriesEx}`,
        `upfront_shutdown_script: ${m.localUpfrontShutdownScript}`,
      );
    }

    // ensure we got an InitMessagee
    assert.ok(m instanceof InitMessage, new Error("Expecting InitMessage"));

    // store the init messagee in case we need to refer to it
    this.remoteInit = m;

    // start other state now that peer is initialized
    this.pingPongState.start();

    // transition state to ready
    this.state = PeerState.ready;

    // emit ready event
    this.emit("ready");
  }

  /**
   * Process the raw message sent by the peer. These messages are
   * processed after the initialization message has been received.
   */
  private _processMessage(raw: Buffer) {
    // increment counter first so we know exactly how many messages
    // have been received by the peer regardless of whether they
    // could be processed
    this.messageCounter += 1;

    // emit the rawmessage event first so that if there is a
    // deserialization problem there is a chance that we were
    // able to capture the raw message for further testing
    this.emit("rawmessage", raw);

    // deserialize the message
    const m = MessageFactory.deserialize(raw);

    // ensure pingpong state is updated
    if (m) {
      this.pingPongState.onMessage(m);

      // emit the message
      this.emit("message", m);
    }
  }
}
