export class RealtimeGateway {
  constructor({ io, emitContractEvent, emitContractRoomEvent }) {
    this.io = io;
    this.emitContractEvent = emitContractEvent;
    this.emitContractRoomEvent = emitContractRoomEvent;
  }

  emitToViewers(event, payload) {
    this.emitContractRoomEvent(this.io, 'viewers', event, payload);
  }

  emitGlobal(event, payload) {
    this.emitContractEvent(this.io, event, payload);
  }
}
