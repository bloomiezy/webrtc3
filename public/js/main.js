'use strict';

const socket = io.connect();

const localVideo = document.querySelector('#localVideo-container video');
const videoGrid = document.querySelector('#videoGrid');
const notification = document.querySelector('#notification');
const nameInput = document.querySelector('#nameInput');
const roomInput = document.querySelector('#roomId');
const joinBtn = document.querySelector('#joinBtn');
const leaveBtn = document.querySelector('#leaveBtn');
const shareScreenBtn = document.querySelector('#shareScreenBtn');

const notify = (message) => {
  notification.innerHTML = message;
  notification.classList.add('show');
  setTimeout(() => {
    notification.classList.remove('show');
  }, 5000);
};

const pcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    {
      urls: 'turn:numb.viagenie.ca',
      credential: 'muazkh',
      username: 'webrtc@live.com',
    },
    {
      urls: 'turn:192.158.29.39:3478?transport=udp',
      credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
      username: '28224511:1379330808',
    },
  ],
};

const webrtc = new Webrtc(socket, pcConfig, {
  log: true,
  warn: true,
  error: true,
});

const setTitle = (status, e) => {
  const room = e.detail.roomId;
  console.log(`Room ${room} was ${status}`);
  notify(`Room ${room} was ${status}`);
  document.querySelector('h1').textContent = `Room: ${room}`;
  webrtc.gotStream();
};
webrtc.addEventListener('createdRoom', setTitle.bind(this, 'created'));
webrtc.addEventListener('joinedRoom', setTitle.bind(this, 'joined'));

joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  const room = roomInput.value.trim();
  if (!name) {
    notify('Please enter your name');
    return;
  }
  if (!room) {
    notify('Room ID not provided');
    return;
  }
  webrtc.setUserName(name); // New method to set user name
  webrtc.joinRoom(room);
});

leaveBtn.addEventListener('click', () => {
  webrtc.leaveRoom();
});
webrtc.addEventListener('leftRoom', (e) => {
  const room = e.detail.roomId;
  document.querySelector('h1').textContent = '';
  notify(`Left the room ${room}`);
});

webrtc.getLocalStream(true, { width: 640, height: 480 }).then((stream) => {
  localVideo.srcObject = stream;
});

webrtc.addEventListener('kicked', () => {
  document.querySelector('h1').textContent = 'You were kicked out';
  videoGrid.innerHTML = '';
});

webrtc.addEventListener('userLeave', (e) => {
  console.log(`user ${e.detail.socketId} left room`);
});

webrtc.addEventListener('newUser', (e) => {
  const socketId = e.detail.socketId;
  const stream = e.detail.stream;
  const userName = e.detail.userName; // New property to get user's name

  const videoContainer = document.createElement('div');
  videoContainer.setAttribute('class', 'grid-item');
  videoContainer.setAttribute('id', socketId);

  const video = document.createElement('video');
  video.setAttribute('autoplay', true);
  video.setAttribute('muted', true);
  video.setAttribute('playsinline', true);
  video.srcObject = stream;

  const p = document.createElement('p');
  p.textContent = userName || socketId; // Display user's name if available

  videoContainer.append(p);
  videoContainer.append(video);

  if (webrtc.isAdmin) {
    const kickBtn = document.createElement('button');
    kickBtn.setAttribute('class', 'kick_btn');
    kickBtn.textContent = 'Kick';
    kickBtn.addEventListener('click', () => {
      webrtc.kickUser(socketId);
    });
    videoContainer.append(kickBtn);
  }
  videoGrid.append(videoContainer);
});

webrtc.addEventListener('removeUser', (e) => {
  const socketId = e.detail.socketId;
  if (!socketId) {
    videoGrid.innerHTML = '';
    return;
  }
  document.getElementById(socketId).remove();
});

webrtc.addEventListener('error', (e) => {
  const error = e.detail.error;
  console.error(error);
  notify(error);
});

webrtc.addEventListener('notification', (e) => {
  const notif = e.detail.notification;
  console.log(notif);
  notify(notif);
});

shareScreenBtn.addEventListener('click', () => {
  webrtc.startScreenShare().then((stream) => {
    const screenVideoContainer = document.createElement('div');
    screenVideoContainer.setAttribute('class', 'grid-item');
    screenVideoContainer.setAttribute('id', 'screen-share');

    const screenVideo = document.createElement('video');
    screenVideo.setAttribute('autoplay', true);
    screenVideo.setAttribute('muted', true);
    screenVideo.setAttribute('playsinline', true);
    screenVideo.srcObject = stream;

    const p = document.createElement('p');
    p.textContent = 'Screen Share';

    screenVideoContainer.append(p);
    screenVideoContainer.append(screenVideo);
    videoGrid.append(screenVideoContainer);

    stream.getVideoTracks()[0].addEventListener('ended', () => {
      screenVideoContainer.remove();
      webrtc.getLocalStream({ audio: true }, { video: true }).then((localStream) => {
        const localVideoTrack = localStream.getVideoTracks()[0];
        webrtc.localStream.addTrack(localVideoTrack);
        Object.keys(webrtc.pcs).forEach(socketId => {
          webrtc.pcs[socketId].getSenders().forEach(sender => {
            if (sender.track.kind === 'video') {
              sender.replaceTrack(localVideoTrack);
            }
          });
        });
      });
    });
  }).catch((error) => {
    console.error('Failed to start screen sharing: ', error);
  });
});
