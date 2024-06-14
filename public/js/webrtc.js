'use strict';

class Webrtc extends EventTarget {
  constructor(socket, pcConfig = null, logging = {}) {
    super();
    this.socket = socket;
    this.pcConfig = pcConfig;
    this.logging = logging;

    this.localStream = null;
    this.pcs = {};
    this.roomId = null;
    this.userName = ''; // Add a property to store the user's name

    this.socket.on('created', (room) => {
      this.isAdmin = true;
      this.dispatchEvent(new CustomEvent('createdRoom', { detail: { roomId: room } }));
    });

    this.socket.on('joined', (room) => {
      this.isAdmin = false;
      this.dispatchEvent(new CustomEvent('joinedRoom', { detail: { roomId: room } }));
    });

    this.socket.on('full', (room) => {
      this.dispatchEvent(new CustomEvent('notification', { detail: { notification: `Room ${room} is full` } }));
    });

    this.socket.on('ready', () => {
      this.createPeerConnections();
    });

    this.socket.on('offer', (socketId, description, userName) => {
      this.receiveOffer(socketId, description, userName);
    });

    this.socket.on('answer', (socketId, description) => {
      this.receiveAnswer(socketId, description);
    });

    this.socket.on('candidate', (socketId, candidate) => {
      this.receiveCandidate(socketId, candidate);
    });

    this.socket.on('user-left', (socketId) => {
      this.removeUser(socketId);
      this.dispatchEvent(new CustomEvent('userLeave', { detail: { socketId: socketId } }));
    });

    this.socket.on('kicked', () => {
      this.dispatchEvent(new CustomEvent('kicked'));
    });

    this.socket.on('new-user', (socketId, userName) => {
      this.dispatchEvent(new CustomEvent('newUser', { detail: { socketId: socketId, stream: this.localStream, userName: userName } }));
    });
  }

  setUserName(name) {
    this.userName = name;
  }

  joinRoom(room) {
    this.roomId = room;
    this.socket.emit('join', room, this.userName);
  }

  leaveRoom() {
    this.socket.emit('leave', this.roomId);
    this.roomId = null;
    this.isAdmin = false;
    this.localStream.getTracks().forEach(track => track.stop());
    this.localStream = null;
    Object.keys(this.pcs).forEach(socketId => this.pcs[socketId].close());
    this.pcs = {};
    this.dispatchEvent(new CustomEvent('leftRoom', { detail: { roomId: this.roomId } }));
  }

  createPeerConnections() {
    this.socket.emit('ready');
  }

  async getLocalStream(audio = true, video = true) {
    const constraints = {
      audio: audio,
      video: video
    };
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      return this.localStream;
    } catch (error) {
      console.error('Error getting local stream', error);
      throw error;
    }
  }

  async startScreenShare() {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrack.onended = () => {
        this.stopScreenShare();
      };
      return screenStream;
    } catch (error) {
      console.error('Error starting screen share', error);
      throw error;
    }
  }

  stopScreenShare() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    this.getLocalStream(true, true).then((stream) => {
      this.localStream = stream;
      Object.keys(this.pcs).forEach(socketId => {
        this.pcs[socketId].getSenders().forEach(sender => {
          if (sender.track.kind === 'video') {
            sender.replaceTrack(stream.getVideoTracks()[0]);
          }
        });
      });
    });
  }

  async createPeerConnection(socketId) {
    const pc = new RTCPeerConnection(this.pcConfig);
    this.pcs[socketId] = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('candidate', socketId, event.candidate);
      }
    };

    pc.ontrack = (event) => {
      this.dispatchEvent(new CustomEvent('newUser', { detail: { socketId: socketId, stream: event.streams[0], userName: '' } }));
    };

    this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));
  }

  async createOffer(socketId) {
    const pc = this.pcs[socketId];
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.socket.emit('offer', socketId, offer, this.userName);
  }

  async receiveOffer(socketId, description, userName) {
    await this.createPeerConnection(socketId);
    const pc = this.pcs[socketId];
    await pc.setRemoteDescription(new RTCSessionDescription(description));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.socket.emit('answer', socketId, answer);
    this.dispatchEvent(new CustomEvent('newUser', { detail: { socketId: socketId, stream: this.localStream, userName: userName } }));
  }

  async receiveAnswer(socketId, description) {
    const pc = this.pcs[socketId];
    await pc.setRemoteDescription(new RTCSessionDescription(description));
  }

  async receiveCandidate(socketId, candidate) {
    const pc = this.pcs[socketId];
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  removeUser(socketId) {
    if (this.pcs[socketId]) {
      this.pcs[socketId].close();
      delete this.pcs[socketId];
    }
  }

  kickUser(socketId) {
    this.socket.emit('kick', socketId);
  }
}
