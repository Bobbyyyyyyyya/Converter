// ---- State ----
let currentPath = '';
let currentEntries = [];
let playlist = [];
let playlistIndex = -1;
let isPlaying = false;
let isSeeking = false;
let viewMode = 'home'; // home | browse | recent

// ---- DOM refs ----
const fileList = document.getElementById('fileList');
const fileBrowser = document.getElementById('fileBrowser');
const recentView = document.getElementById('recentView');
const recentGrid = document.getElementById('recentGrid');
const emptyState = document.getElementById('emptyState');
const loading = document.getElementById('loading');
const breadcrumb = document.getElementById('breadcrumb');
const sidebarDirList = document.getElementById('sidebarDirList');

const playerControls = document.getElementById('playerControls');
const playerVideo = document.getElementById('playerVideo');
const playerAudioArt = document.getElementById('playerAudioArt');
const playerVideoWrap = document.getElementById('playerVideoWrap');
const playerFilename = document.getElementById('playerFilename');
const playerDetails = document.getElementById('playerDetails');

const playerPlayBtn = document.getElementById('playerPlayBtn');
const playerPrevBtn = document.getElementById('playerPrevBtn');
const playerNextBtn = document.getElementById('playerNextBtn');
const playerTime = document.getElementById('playerTime');
const playerProgressBg = document.getElementById('playerProgressBg');
const playerProgressFill = document.getElementById('playerProgressFill');
const playerProgressLoaded = document.getElementById('playerProgressLoaded');
const playerProgressThumb = document.getElementById('playerProgressThumb');
const playerVolumeBtn = document.getElementById('playerVolumeBtn');
const playerVolumeRange = document.getElementById('playerVolumeRange');
const playerVolumeSlider = document.getElementById('playerVolumeSlider');
const playerLoopBtn = document.getElementById('playerLoopBtn');
const playerPiPBtn = document.getElementById('playerPiPBtn');
const playerFullscreenBtn = document.getElementById('playerFullscreenBtn');
const playerCloseBtn = document.getElementById('playerCloseBtn');

const sidebarHome = document.getElementById('sidebarHome');
const sidebarRecent = document.getElementById('sidebarRecent');
const sidebarMusic = document.getElementById('sidebarMusic');
const sidebarVideo = document.getElementById('sidebarVideo');
const sidebarOpenFile = document.getElementById('sidebarOpenFile');
const clearRecentBtn = document.getElementById('clearRecentBtn');

// ---- Init ----
(async function init() {
  const home = await window.player.getHomeDir();
  currentPath = home;
  const platform = await window.player.getPlatform();
  loadDirectory(home);
  loadRecent();
  loadSidebarDirs(platform);
})();

// ---- Sidebar ----
sidebarHome.addEventListener('click', () => {
  setActiveSidebar(sidebarHome);
  viewMode = 'home';
  window.player.getHomeDir().then((home) => {
    currentPath = home;
    loadDirectory(home);
  });
});

sidebarRecent.addEventListener('click', () => {
  setActiveSidebar(sidebarRecent);
  viewMode = 'recent';
  fileBrowser.style.display = 'none';
  recentView.style.display = '';
  emptyState.style.display = 'none';
  loadRecent();
});

sidebarMusic.addEventListener('click', () => {
  setActiveSidebar(sidebarMusic);
  viewMode = 'browse';
  filterFiles('audio');
});

sidebarVideo.addEventListener('click', () => {
  setActiveSidebar(sidebarVideo);
  viewMode = 'browse';
  filterFiles('video');
});

sidebarOpenFile.addEventListener('click', async () => {
  const files = await window.player.selectFiles();
  if (files.length) {
    playlist = files;
    playlistIndex = 0;
    loadMedia(files[0]);
  }
});

function setActiveSidebar(el) {
  document.querySelectorAll('.sidebar-item').forEach((e) => e.classList.remove('active'));
  if (el) el.classList.add('active');
}

// ---- Sidebar dirs ----
async function loadSidebarDirs(platform) {
  const home = await window.player.getHomeDir();
  const common = [];
  if (platform === 'darwin') {
    common.push(
      { name: 'Downloads', path: `${home}/Downloads` },
      { name: 'Desktop', path: `${home}/Desktop` },
      { name: 'Music', path: `${home}/Music` },
      { name: 'Movies', path: `${home}/Movies` },
      { name: 'Documents', path: `${home}/Documents` },
    );
  }
  for (const d of common) {
    const btn = document.createElement('button');
    btn.className = 'sidebar-dir-item';
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 4h5l2 2h5v7H1V4z" fill="currentColor" opacity="0.3"/></svg>${d.name}`;
    btn.addEventListener('click', () => {
      currentPath = d.path;
      setActiveSidebar(null);
      viewMode = 'browse';
      loadDirectory(d.path);
    });
    sidebarDirList.appendChild(btn);
  }
}

// ---- Directory loading ----
async function loadDirectory(dirPath) {
  fileBrowser.style.display = '';
  recentView.style.display = 'none';
  emptyState.style.display = 'none';
  loading.style.display = 'flex';

  const result = await window.player.readDirectory(dirPath);
  loading.style.display = 'none';

  if (!result.success) {
    emptyState.style.display = 'flex';
    emptyState.querySelector('p').textContent = result.error;
    return;
  }

  currentPath = result.path;
  currentEntries = result.entries;
  renderBreadcrumb(result.path);
  renderFileList(result.entries);
}

function renderBreadcrumb(dirPath) {
  breadcrumb.innerHTML = '';
  const parts = dirPath.split('/').filter(Boolean);
  let accum = '';

  const homeItem = document.createElement('span');
  homeItem.className = 'breadcrumb-item';
  homeItem.textContent = 'Home';
  homeItem.addEventListener('click', () => {
    window.player.getHomeDir().then((h) => {
      currentPath = h;
      loadDirectory(h);
    });
  });
  breadcrumb.appendChild(homeItem);

  for (const part of parts) {
    accum += '/' + part;
    const sep = document.createElement('span');
    sep.className = 'breadcrumb-sep';
    sep.textContent = '/';
    breadcrumb.appendChild(sep);

    const item = document.createElement('span');
    item.className = 'breadcrumb-item';
    item.textContent = part;
    item.addEventListener('click', () => {
      currentPath = accum;
      loadDirectory(accum);
    });
    breadcrumb.appendChild(item);
  }
}

function renderFileList(entries) {
  fileList.innerHTML = '';
  if (entries.length === 0) {
    emptyState.style.display = 'flex';
    emptyState.querySelector('p').textContent = 'Folder is empty';
    return;
  }

  for (const entry of entries) {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.dataset.path = entry.path;

    const icon = document.createElement('span');
    icon.className = 'file-item-icon';
    if (entry.isDirectory) {
      icon.textContent = '📁';
    } else {
      icon.textContent = getFileEmoji(entry.type);
    }

    const name = document.createElement('span');
    name.className = 'file-item-name';
    name.textContent = entry.name;

    const size = document.createElement('span');
    size.className = 'file-item-size';
    size.textContent = entry.isDirectory ? '—' : formatSize(entry.size || 0);

    div.appendChild(icon);
    div.appendChild(name);
    div.appendChild(size);

    div.addEventListener('click', () => {
      if (entry.isDirectory) {
        currentPath = entry.path;
        loadDirectory(entry.path);
      } else if (entry.type === 'audio' || entry.type === 'video') {
        const dir = currentPath;
        const allMedia = currentEntries.filter((e) => !e.isDirectory && (e.type === 'audio' || e.type === 'video'));
        const idx = allMedia.findIndex((e) => e.path === entry.path);
        if (idx >= 0) {
          playlist = allMedia.map((e) => e.path);
          playlistIndex = idx;
          loadMedia(entry.path);
        }
      }
    });

    fileList.appendChild(div);
  }
}

function filterFiles(type) {
  fileBrowser.style.display = '';
  recentView.style.display = 'none';
  emptyState.style.display = 'none';

  // If already browsing, filter current entries
  if (currentEntries.length > 0) {
    const filtered = currentEntries.filter((e) => e.isDirectory || e.type === type);
    renderFileList(filtered);
  } else {
    loadDirectory(currentPath);
  }
}

// ---- File helpers ----
function getFileEmoji(type) {
  switch (type) {
    case 'audio': return '🎵';
    case 'video': return '🎬';
    case 'image': return '🖼';
    case 'document': return '📄';
    default: return '📄';
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ---- Recent files ----
async function loadRecent() {
  const files = await window.player.getRecentFiles();
  recentGrid.innerHTML = '';

  if (files.length === 0) {
    recentGrid.innerHTML = '<p style="color:var(--text-muted);padding:20px">No recent files</p>';
    return;
  }

  for (const f of files) {
    const card = document.createElement('div');
    card.className = 'recent-card';
    const name = f.split('/').pop();
    const ext = name.split('.').pop().toLowerCase();
    const emoji = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus'].includes(ext) ? '🎵' : '🎬';
    card.innerHTML = `
      <div class="recent-card-icon">${emoji}</div>
      <div class="recent-card-name">${name}</div>
      <div class="recent-card-meta">${ext.toUpperCase()}</div>
    `;
    card.addEventListener('click', () => {
      playlist = [f];
      playlistIndex = 0;
      loadMedia(f);
    });
    recentGrid.appendChild(card);
  }
}

clearRecentBtn.addEventListener('click', async () => {
  await window.player.clearRecent();
  loadRecent();
});

// ---- Media playback ----
function onLoadedMetadata() {
  const v = playerVideo;
  const dur = v.duration;
  const min = Math.floor(dur / 60);
  const sec = Math.floor(dur % 60);
  playerTime.textContent = `0:00 / ${min}:${sec.toString().padStart(2, '0')}`;
  const ext = playerFilename.textContent.split('.').pop().toUpperCase();
  const details = [];
  if (v.videoWidth) details.push(`${v.videoWidth}×${v.videoHeight}`);
  else details.push('Audio');
  details.push(ext);
  if (dur) details.push(`${min}:${sec.toString().padStart(2, '0')}`);
  playerDetails.textContent = details.join(' · ');
}

function onTimeUpdate() {
  if (!isSeeking) updateProgress();
}

function onProgress() {
  const v = playerVideo;
  if (v.buffered.length > 0 && v.duration > 0) {
    const end = v.buffered.end(v.buffered.length - 1);
    playerProgressLoaded.style.width = `${(end / v.duration) * 100}%`;
  }
}

function onPlay() {
  isPlaying = true;
  updatePlayBtn();
}

function onPause() {
  isPlaying = false;
  updatePlayBtn();
}

function onEnded() {
  if (playerLoopBtn.classList.contains('active')) {
    playerVideo.play();
  } else {
    nextTrack();
  }
}

playerVideo.addEventListener('loadedmetadata', onLoadedMetadata);
playerVideo.addEventListener('timeupdate', onTimeUpdate);
playerVideo.addEventListener('progress', onProgress);
playerVideo.addEventListener('play', onPlay);
playerVideo.addEventListener('pause', onPause);
playerVideo.addEventListener('ended', onEnded);

async function loadMedia(filePath) {
  const info = await window.player.getFormatInfo(filePath);
  const isAudio = info.type === 'audio';
  const isVideo = info.type === 'video';

  if (info.type === 'unknown') return;

  playerVideo.src = `file://${filePath}`;
  playerVideo.style.display = isAudio ? 'none' : '';
  playerAudioArt.style.display = isAudio ? 'flex' : 'none';
  playerFilename.textContent = filePath.split('/').pop();
  playerVideoWrap.querySelector('video')?.load();

  const ext = filePath.split('.').pop().toUpperCase();
  playerDetails.textContent = `${ext} file`;
  playerControls.style.display = 'flex';

  window.player.addToRecent(filePath);

  // If recent view is open, refresh it
  if (viewMode === 'recent') loadRecent();

  isPlaying = false;
  updatePlayBtn();
  playerVideo.play().catch(() => {});
}

function updateProgress() {
  const v = playerVideo;
  if (!v.duration) return;
  const pct = (v.currentTime / v.duration) * 100;
  playerProgressFill.style.width = `${pct}%`;
  playerProgressThumb.style.left = `${pct}%`;

  const curMin = Math.floor(v.currentTime / 60);
  const curSec = Math.floor(v.currentTime % 60);
  const durMin = Math.floor(v.duration / 60);
  const durSec = Math.floor(v.duration % 60);
  playerTime.textContent = `${curMin}:${curSec.toString().padStart(2, '0')} / ${durMin}:${durSec.toString().padStart(2, '0')}`;
}

function updatePlayBtn() {
  playerPlayBtn.innerHTML = isPlaying
    ? `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="5" y="4" width="3" height="12" rx="1" fill="currentColor"/><rect x="12" y="4" width="3" height="12" rx="1" fill="currentColor"/></svg>`
    : `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7 4v12l10-6L7 4z" fill="currentColor"/></svg>`;
}

function togglePlay() {
  if (playerVideo.paused) {
    playerVideo.play().catch(() => {});
  } else {
    playerVideo.pause();
  }
}

function prevTrack() {
  if (playlist.length === 0) return;
  playlistIndex = (playlistIndex - 1 + playlist.length) % playlist.length;
  loadMedia(playlist[playlistIndex]);
}

function nextTrack() {
  if (playlist.length === 0) return;
  playlistIndex = (playlistIndex + 1) % playlist.length;
  loadMedia(playlist[playlistIndex]);
}

// ---- Player event listeners ----
playerPlayBtn.addEventListener('click', togglePlay);
playerPrevBtn.addEventListener('click', prevTrack);
playerNextBtn.addEventListener('click', nextTrack);

playerProgressBg.addEventListener('mousedown', (e) => {
  isSeeking = true;
  seek(e);
  document.addEventListener('mousemove', seek);
  document.addEventListener('mouseup', onSeekEnd);
});

function onSeekEnd() {
  isSeeking = false;
  document.removeEventListener('mousemove', seek);
  document.removeEventListener('mouseup', onSeekEnd);
}

function seek(e) {
  const rect = playerProgressBg.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  if (playerVideo.duration) {
    playerVideo.currentTime = pct * playerVideo.duration;
    updateProgress();
  }
}

playerVolumeBtn.addEventListener('click', () => {
  playerVolumeSlider.classList.toggle('open');
});

playerVolumeRange.addEventListener('input', () => {
  playerVideo.volume = playerVolumeRange.value;
  playerVolumeBtn.innerHTML = playerVolumeRange.value === '0'
    ? `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M8 7H5v6h3l4 4V3L8 7z" fill="currentColor"/><path d="M14 8l-3 3m0-3l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
    : `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M8 7H5v6h3l4 4V3L8 7z" fill="currentColor"/><path d="M14 8a3 3 0 010 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
});

playerLoopBtn.addEventListener('click', () => {
  playerLoopBtn.classList.toggle('active');
});

playerPiPBtn.addEventListener('click', async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await playerVideo.requestPictureInPicture();
    }
  } catch {}
});

playerFullscreenBtn.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
  }
});

playerCloseBtn.addEventListener('click', () => {
  playerVideo.pause();
  playerVideo.src = '';
  playerControls.style.display = 'none';
  playlist = [];
  playlistIndex = -1;
});

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', (e) => {
  if (playerControls.style.display === 'none') return;

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      togglePlay();
      break;
    case 'ArrowLeft':
      playerVideo.currentTime = Math.max(0, playerVideo.currentTime - 5);
      break;
    case 'ArrowRight':
      playerVideo.currentTime = Math.min(playerVideo.duration, playerVideo.currentTime + 5);
      break;
    case 'ArrowUp':
      playerVideo.volume = Math.min(1, playerVideo.volume + 0.1);
      playerVolumeRange.value = playerVideo.volume;
      break;
    case 'ArrowDown':
      playerVideo.volume = Math.max(0, playerVideo.volume - 0.1);
      playerVolumeRange.value = playerVideo.volume;
      break;
    case 'KeyF':
      playerFullscreenBtn.click();
      break;
    case 'KeyM':
      playerVideo.muted = !playerVideo.muted;
      break;
    case 'KeyL':
      playerLoopBtn.click();
      break;
    case 'KeyN':
      nextTrack();
      break;
    case 'KeyP':
      prevTrack();
      break;
    case 'Escape':
      playerCloseBtn.click();
      break;
  }
});
