// ---- State ----
let currentPath = '';
let currentEntries = [];
let playlist = [];
let playlistIndex = -1;
let isPlaying = false;
let isSeeking = false;
let viewMode = 'home'; // home | browse | recent
let currentFilter = 'all';
let searchQuery = '';
let viewType = 'list'; // list | grid
let isShuffle = false;

// ---- DOM refs ----
const fileList = document.getElementById('fileList');
const fileGrid = document.getElementById('fileGrid');
const fileBrowser = document.getElementById('fileBrowser');
const recentView = document.getElementById('recentView');
const recentGrid = document.getElementById('recentGrid');
const emptyState = document.getElementById('emptyState');
const loading = document.getElementById('loading');
const breadcrumb = document.getElementById('breadcrumb');
const sidebarDirList = document.getElementById('sidebarDirList');

const playerStage = document.getElementById('playerStage');
const playerStageArt = document.getElementById('playerStageArt');
const artTitle = document.getElementById('artTitle');
const artDetail = document.getElementById('artDetail');
const playerControls = document.getElementById('playerControls');
const playerVideo = document.getElementById('playerVideo');
const playerImage = document.getElementById('playerImage');
const playerFilename = document.getElementById('playerFilename');
const playerDetails = document.getElementById('playerDetails');
const playerThumb = document.getElementById('playerThumb');
const stageBg = document.getElementById('stageBg');

const playerPlayBtn = document.getElementById('playerPlayBtn');
const playerPrevBtn = document.getElementById('playerPrevBtn');
const playerNextBtn = document.getElementById('playerNextBtn');
const playerShuffleBtn = document.getElementById('playerShuffleBtn');
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
const stageClose = document.getElementById('stageClose');

const sidebarHome = document.getElementById('sidebarHome');
const sidebarRecent = document.getElementById('sidebarRecent');
const sidebarMusic = document.getElementById('sidebarMusic');
const sidebarVideo = document.getElementById('sidebarVideo');
const sidebarImage = document.getElementById('sidebarImage');
const sidebarOpenFile = document.getElementById('sidebarOpenFile');
const clearRecentBtn = document.getElementById('clearRecentBtn');

const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const filterBar = document.getElementById('filterBar');
const filterCount = document.getElementById('filterCount');
const viewToggle = document.getElementById('viewToggle');

// ---- Init ----
(async function init() {
  const home = await window.player.getHomeDir();
  currentPath = home;
  const platform = await window.player.getPlatform();
  loadDirectory(home);
  loadRecent();
  loadSidebarDirs(platform);
})();

window.player.onOpenMediaFiles((files) => {
  if (files.length > 0) {
    playlist = files;
    playlistIndex = 0;
    loadMedia(files[0]);
  }
});

// ---- Player minimize/restore ----
function minimizePlayer() {
  playerStage.style.display = 'none';
  fileBrowser.style.display = '';
  emptyState.style.display = 'none';
  if (viewMode === 'recent') recentView.style.display = '';
}

function restorePlayer() {
  if (playerControls.style.display === 'flex') {
    playerStage.style.display = 'flex';
    fileBrowser.style.display = 'none';
    recentView.style.display = 'none';
    emptyState.style.display = 'none';
  }
}

playerFilename.addEventListener('click', restorePlayer);

// ---- Sidebar ----
sidebarHome.addEventListener('click', () => {
  setActiveSidebar(sidebarHome);
  viewMode = 'home';
  currentFilter = 'all';
  updateFilterBar();
  minimizePlayer();
  window.player.getHomeDir().then((home) => {
    currentPath = home;
    loadDirectory(home);
  });
});

sidebarRecent.addEventListener('click', () => {
  setActiveSidebar(sidebarRecent);
  viewMode = 'recent';
  minimizePlayer();
  fileBrowser.style.display = 'none';
  emptyState.style.display = 'none';
  recentView.style.display = '';
  loadRecent();
});

sidebarMusic.addEventListener('click', () => {
  setActiveSidebar(sidebarMusic);
  viewMode = 'browse';
  currentFilter = 'audio';
  updateFilterBar();
  minimizePlayer();
  applyFilters();
});

sidebarVideo.addEventListener('click', () => {
  setActiveSidebar(sidebarVideo);
  viewMode = 'browse';
  currentFilter = 'video';
  updateFilterBar();
  minimizePlayer();
  applyFilters();
});

if (sidebarImage) {
  sidebarImage.addEventListener('click', () => {
    setActiveSidebar(sidebarImage);
    viewMode = 'browse';
    currentFilter = 'image';
    updateFilterBar();
    minimizePlayer();
    applyFilters();
  });
}

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

// ---- Search & Filters ----
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    searchClear.style.display = searchQuery ? 'block' : 'none';
    applyFilters();
  });
}
if (searchClear) {
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClear.style.display = 'none';
    applyFilters();
    searchInput.focus();
  });
}

if (filterBar) {
  filterBar.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      filterBar.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      applyFilters();
    });
  });
}

function updateFilterBar() {
  if (!filterBar) return;
  filterBar.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === currentFilter);
  });
}

if (viewToggle) {
  viewToggle.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      viewToggle.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      viewType = btn.dataset.view;
      applyFilters();
    });
  });
}

function applyFilters() {
  if (!currentEntries.length) {
    renderFileList([]);
    return;
  }
  let filtered = [...currentEntries];
  
  // Filter by type
  if (currentFilter !== 'all') {
    if (currentFilter === 'gif') {
      filtered = filtered.filter(e => e.isDirectory || (e.ext && e.ext.toLowerCase() === 'gif'));
    } else if (currentFilter === 'image') {
      filtered = filtered.filter(e => e.isDirectory || e.type === 'image');
    } else {
      filtered = filtered.filter(e => e.isDirectory || e.type === currentFilter);
    }
  }
  
  // Filter by search
  if (searchQuery) {
    filtered = filtered.filter(e => e.name.toLowerCase().includes(searchQuery));
  }
  
  renderFileList(filtered, true);
  if (filterCount) {
    const count = filtered.filter(e => !e.isDirectory).length;
    const total = currentEntries.filter(e => !e.isDirectory).length;
    filterCount.textContent = searchQuery || currentFilter !== 'all' ? `${count} / ${total}` : `${total} files`;
  }
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
      { name: 'Pictures', path: `${home}/Pictures` },
    );
  } else if (platform === 'win32') {
    common.push(
      { name: 'Downloads', path: `${home}\\Downloads` },
      { name: 'Desktop', path: `${home}\\Desktop` },
      { name: 'Music', path: `${home}\\Music` },
      { name: 'Videos', path: `${home}\\Videos` },
      { name: 'Pictures', path: `${home}\\Pictures` },
      { name: 'Documents', path: `${home}\\Documents` },
    );
  }
  for (const d of common) {
    const btn = document.createElement('button');
    btn.className = 'sidebar-dir-item';
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 4h5l2 2h5v7H1V4z" fill="currentColor" opacity="0.3"/></svg>${d.name}`;
    btn.title = d.path;
    btn.addEventListener('click', () => {
      currentPath = d.path;
      setActiveSidebar(null);
      viewMode = 'browse';
      minimizePlayer();
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
    const p = document.getElementById('emptyText') || emptyState.querySelector('p');
    if (p) p.textContent = result.error;
    return;
  }

  currentPath = result.path;
  currentEntries = result.entries;
  renderBreadcrumb(result.path);
  updateSidebarCounts();
  // Reset filter view to show all with new data
  applyFilters();
}

function renderBreadcrumb(dirPath) {
  breadcrumb.innerHTML = '';
  const parts = dirPath.split(/[/\\]/).filter(Boolean);
  let accum = dirPath.startsWith('/') ? '' : '';
  if (dirPath.startsWith('/')) accum = '';

  const homeItem = document.createElement('span');
  homeItem.className = 'breadcrumb-item';
  homeItem.textContent = 'Home';
  homeItem.addEventListener('click', () => {
    minimizePlayer();
    window.player.getHomeDir().then((h) => {
      currentPath = h;
      loadDirectory(h);
    });
  });
  breadcrumb.appendChild(homeItem);

  let currentAccum = dirPath.startsWith('/') ? '' : '';
  for (const part of parts) {
    currentAccum += (dirPath.includes('\\') ? '\\' : '/') + part;
    const displayAccum = currentAccum;
    const sep = document.createElement('span');
    sep.className = 'breadcrumb-sep';
    sep.textContent = '/';
    breadcrumb.appendChild(sep);

    const item = document.createElement('span');
    item.className = 'breadcrumb-item';
    item.textContent = part;
    item.title = displayAccum;
    item.addEventListener('click', () => {
      minimizePlayer();
      currentPath = displayAccum;
      loadDirectory(displayAccum);
    });
    breadcrumb.appendChild(item);
  }
}

function updateSidebarCounts() {
  const music = currentEntries.filter(e => e.type === 'audio').length;
  const video = currentEntries.filter(e => e.type === 'video').length;
  const image = currentEntries.filter(e => e.type === 'image').length;
  const elM = document.getElementById('countMusic');
  const elV = document.getElementById('countVideo');
  const elI = document.getElementById('countImage');
  if (elM) elM.textContent = music ? music : '';
  if (elV) elV.textContent = video ? video : '';
  if (elI) elI.textContent = image ? image : '';
}

function renderFileList(entries, isFiltered = false) {
  // Show appropriate view container
  const showEntries = entries;
  fileList.innerHTML = '';
  if (fileGrid) fileGrid.innerHTML = '';

  if (showEntries.length === 0) {
    emptyState.style.display = 'flex';
    const p = document.getElementById('emptyText') || emptyState.querySelector('p');
    if (p) p.textContent = searchQuery ? `No results for "${searchQuery}"` : 'Folder is empty';
    fileList.style.display = 'none';
    if (fileGrid) fileGrid.style.display = 'none';
    document.querySelector('.file-list-header').style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  document.querySelector('.file-list-header').style.display = '';

  if (viewType === 'grid' && fileGrid) {
    fileList.style.display = 'none';
    fileGrid.style.display = 'grid';
    renderGrid(showEntries);
  } else {
    fileList.style.display = '';
    if (fileGrid) fileGrid.style.display = 'none';
    renderList(showEntries);
  }
}

function renderList(entries) {
  for (const entry of entries) {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.dataset.path = entry.path;

    const icon = document.createElement('span');
    icon.className = 'file-item-icon ' + getIconClass(entry);
    if (entry.isDirectory) {
      icon.innerHTML = getFileIconSvg('folder');
      icon.classList.add('folder');
    } else {
      icon.innerHTML = getFileIconSvg(entry.type, entry.ext);
    }

    const main = document.createElement('div');
    main.className = 'file-item-main';
    const name = document.createElement('div');
    name.className = 'file-item-name';
    name.textContent = entry.name;
    name.title = entry.name;
    const meta = document.createElement('div');
    meta.className = 'file-item-meta';
    meta.textContent = entry.isDirectory ? 'Folder' : `${(entry.ext || '').toUpperCase()} • ${entry.type || 'file'}`;
    main.appendChild(name);
    main.appendChild(meta);

    const size = document.createElement('span');
    size.className = 'file-item-size';
    size.textContent = entry.isDirectory ? '—' : formatSize(entry.size || 0);

    const typeBadge = document.createElement('span');
    typeBadge.className = 'file-item-type ' + (entry.type || '');
    if (!entry.isDirectory) {
      typeBadge.textContent = (entry.ext || entry.type || '').toUpperCase().slice(0,4);
      if (entry.ext === 'gif') typeBadge.className = 'file-item-type gif';
    } else {
      typeBadge.style.display = 'none';
    }

    div.appendChild(icon);
    div.appendChild(main);
    div.appendChild(size);
    div.appendChild(typeBadge);

    div.addEventListener('click', () => handleEntryClick(entry));
    div.addEventListener('dblclick', () => handleEntryClick(entry));

    fileList.appendChild(div);
  }
}

function renderGrid(entries) {
  for (const entry of entries) {
    const card = document.createElement('div');
    card.className = 'grid-card';
    card.dataset.path = entry.path;
    const isFolder = entry.isDirectory;
    const iconSvg = isFolder ? getFileIconSvg('folder') : getFileIconSvg(entry.type, entry.ext);
    card.innerHTML = `
      <div class="grid-card-icon">${iconSvg}</div>
      <div class="grid-card-name" title="${entry.name}">${entry.name}</div>
      <div class="grid-card-meta">
        <span>${isFolder ? 'Folder' : (entry.ext || '').toUpperCase()}</span>
        <span>${isFolder ? '' : formatSize(entry.size || 0)}</span>
      </div>
    `;
    card.addEventListener('click', () => handleEntryClick(entry));
    fileGrid.appendChild(card);
  }
}

function handleEntryClick(entry) {
  if (entry.isDirectory) {
    currentPath = entry.path;
    loadDirectory(entry.path);
  } else {
    // Support audio, video, image, gif in player
    const playableTypes = ['audio', 'video', 'image'];
    const ext = (entry.ext || '').toLowerCase();
    const isGif = ext === 'gif';
    const isImage = entry.type === 'image' || isGif;
    if (playableTypes.includes(entry.type) || isGif || isImage) {
      const allMedia = currentEntries.filter((e) => !e.isDirectory && (playableTypes.includes(e.type) || (e.ext && ['gif','jpg','jpeg','png','webp','bmp'].includes(e.ext.toLowerCase()))));
      // Prefer playlist of same type but fallback to all media
      let pool = allMedia;
      if (pool.length === 0) pool = currentEntries.filter(e => !e.isDirectory);
      const idx = pool.findIndex((e) => e.path === entry.path);
      if (idx >= 0) {
        playlist = pool.map((e) => e.path);
        playlistIndex = idx;
      } else {
        playlist = [entry.path];
        playlistIndex = 0;
      }
      loadMedia(entry.path);
    }
  }
}

function getIconClass(entry) {
  if (entry.isDirectory) return 'folder';
  if (entry.ext === 'gif') return 'gif';
  if (entry.type === 'archive') return 'archive';
  if (entry.type === 'audio') return 'audio';
  if (entry.type === 'video') return 'video';
  if (entry.type === 'image') return 'image';
  if (entry.type === 'model3d') return 'cad';
  if (entry.type === 'document') return 'doc';
  return '';
}

// ---- File helpers ----
function getFileIconSvg(type, ext) {
  const icons = {
    image: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.2" y="3" width="11.6" height="9.5" rx="1.3" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="7" r="1.3" stroke="currentColor" stroke-width="1.2"/><path d="M2.8 10.8L5 8.4l2.4 2.4 1.8-1.6 3 2.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    audio: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 11.8V4.8L12 3.6V11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4" cy="11.8" r="1.6" stroke="currentColor" stroke-width="1.3"/><circle cx="11" cy="11.2" r="1.6" stroke="currentColor" stroke-width="1.3"/></svg>',
    video: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.5" y="4" width="11" height="8" rx="1.4" stroke="currentColor" stroke-width="1.4"/><path d="M6.8 7.2L10.8 9 6.8 10.8V7.2z" fill="currentColor"/></svg>',
    document: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 2H9.2L12.4 5V13.2a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4"/><path d="M9.2 2.4V5H12" stroke="currentColor" stroke-width="1.2"/><path d="M6 8.6h4.8M6 11h4.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
    model3d: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2.6L2.8 5.9v5.2L8 14.4l5.2-3.3V5.9L8 2.6z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M2.8 5.9L8 9l5.2-3.1M8 9v5.4" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    archive: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3.5H10L13 6V13.5a1 1 0 01-1 1H3a1 1 0 01-1-1V4.5a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4"/><path d="M10 3.5V6H13" stroke="currentColor" stroke-width="1.2"/><path d="M5 9H11M5 11H11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M3 7.5h10" stroke="currentColor" stroke-width="1" opacity="0.35"/></svg>',
    folder: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 4.2H6.2l1.6 1.6H13.5V12.5a1 1 0 01-1 1H2.5a1 1 0 01-1-1V5.2a1 1 0 011-1z" stroke="currentColor" stroke-width="1.3"/><path d="M2.5 7.5h11" stroke="currentColor" stroke-width="1" opacity="0.35"/></svg>',
    gif: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.2" y="4" width="11.6" height="8" rx="1.2" stroke="currentColor" stroke-width="1.4"/><path d="M4 6.5h2.2M4 9h2.2M4 11.5h2.2M8.2 6.5v5M9.8 6.5l1.6 5M11.4 6.5v5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>'
  };
  if (ext === 'gif') return icons.gif;
  if (type === 'archive') return icons.archive;
  if (type === 'folder' || ext === 'folder') return icons.folder;
  if (type === 'document' || ext === 'pdf') return icons.document;
  return icons[type] || icons.document;
}
function getFileEmoji(type, ext) { return getFileIconSvg(type, ext); }

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
  const countEl = document.getElementById('recentCount');
  if (countEl) countEl.textContent = files.length ? `${files.length} files` : '';
  
  // Need to make recent view visible when called from sidebar
  if (viewMode === 'recent') {
    recentView.style.display = '';
    fileBrowser.style.display = 'none';
    emptyState.style.display = 'none';
  }

  if (files.length === 0) {
    recentGrid.innerHTML = '<p style="color:var(--text-muted);padding:20px; grid-column: 1/-1; text-align:center">No recent files<br><span style="font-size:11px;opacity:0.7">Played media will appear here</span></p>';
    return;
  }

  for (const f of files) {
    const card = document.createElement('div');
    card.className = 'recent-card';
    const name = f.split(/[/\\]/).pop();
    const ext = name.split('.').pop().toLowerCase();
    let iconSvg = getFileIconSvg('video');
    let bg = 'var(--surface-active)';
    if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'aiff', 'wma', 'mka', 'wv'].includes(ext)) { iconSvg = getFileIconSvg('audio'); bg = 'rgba(168,85,247,0.12)'; }
    else if (['gif','webp','apng'].includes(ext)) { iconSvg = getFileIconSvg('gif'); bg = 'rgba(236,72,153,0.12)'; }
    else if (['jpg','jpeg','png','bmp','avif','heic','heif','jp2','jxl','svg','psd','ico','hdr'].includes(ext)) { iconSvg = getFileIconSvg('image'); bg = 'rgba(34,197,94,0.12)'; }
    else if (['mp4','mov','avi','mkv','webm','wmv','flv','3gp','m2ts','mxf','hevc','h265','av1'].includes(ext)) { iconSvg = getFileIconSvg('video'); bg = 'rgba(59,130,246,0.12)'; }
    else if (['zip','jar','war','ear','apk','aab','tar','tgz','gz','bz2','xz','7z','rar','cab','iso'].includes(ext)) { iconSvg = getFileIconSvg('archive'); bg = 'rgba(251,146,60,0.12)'; }
    else if (['pdf','txt','docx','doc','html','md','csv','json','rtf','xml','yaml','yml'].includes(ext)) { iconSvg = getFileIconSvg('document'); bg = 'rgba(239,68,68,0.08)'; }
    else if (['skp','skb','dwg','dxf','step','stp','ifc','usd','stl','obj','ply','fbx','dae','gltf','glb','3dm','brep'].includes(ext)) { iconSvg = getFileIconSvg('model3d'); bg = 'rgba(14,165,233,0.12)'; }
    card.innerHTML = `
      <div class="recent-card-icon" style="background:${bg}">${iconSvg}</div>
      <div class="recent-card-name" title="${name}">${name}</div>
      <div class="recent-card-meta">${ext.toUpperCase()} • ${f.split(/[/\\]/).slice(-2,-1)[0] || ''}</div>
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
  if (dur && !isNaN(dur)) details.push(`${min}:${sec.toString().padStart(2, '0')}`);
  playerDetails.textContent = details.join(' · ');
  if (playerThumb) {
    if (v.videoWidth) { playerThumb.innerHTML = '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.8 7.2L10.8 9 6.8 10.8V7.2z" fill="white"/></svg>'; playerThumb.style.background = 'linear-gradient(135deg, #3b82f6, #6366f1)'; }
    else { playerThumb.innerHTML = '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 11.8V4.8L12 3.6V11" stroke="white" stroke-width="1.4" stroke-linecap="round"/><circle cx="4" cy="11.8" r="1.6" stroke="white" stroke-width="1.3"/><circle cx="11" cy="11.2" r="1.6" stroke="white" stroke-width="1.3"/></svg>'; playerThumb.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)'; }
  }
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
  const ext = filePath.split('.').pop().toLowerCase();
  const isAudio = info.type === 'audio';
  const isVideo = info.type === 'video';
  const isImage = info.type === 'image' || ['gif','jpg','jpeg','png','webp','bmp','avif','apng','svg'].includes(ext);
  const isGif = ext === 'gif';

  if (info.type === 'unknown' && !isImage) return;

  const name = filePath.split(/[/\\]/).pop();
  const extUpper = ext.toUpperCase();

  // Reset views
  playerVideo.style.display = 'none';
  playerImage.style.display = 'none';
  playerStageArt.style.display = 'none';

  const fileUrl = new URL('file://' + filePath).href;

  if (isImage || isGif) {
    // Image / GIF preview (no audio controls needed, but keep controls for navigation)
    playerImage.src = fileUrl;
    playerImage.style.display = 'block';
    playerStage.style.display = 'flex';
    playerStage.className = 'player-stage';
    playerStageArt.style.display = 'none';
    playerFilename.textContent = name;
    playerDetails.textContent = `${isGif ? 'GIF' : 'Image'} • ${extUpper}`;
    if (playerThumb) { playerThumb.innerHTML = isGif ? '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.2" y="4" width="11.6" height="8" rx="1.2" stroke="white" stroke-width="1.4"/><path d="M4 6.5h2.2M4 9h2.2M4 11.5h2.2M8.2 6.5v5M9.8 6.5l1.6 5M11.4 6.5v5" stroke="white" stroke-width="1.1" stroke-linecap="round"/></svg>' : '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.2" y="3" width="11.6" height="9.5" rx="1.3" stroke="white" stroke-width="1.4"/><circle cx="6" cy="7" r="1.3" stroke="white" stroke-width="1.2"/><path d="M2.8 10.8L5 8.4l2.4 2.4 1.8-1.6 3 2.3" stroke="white" stroke-width="1.2" stroke-linecap="round"/></svg>'; playerThumb.style.background = isGif ? 'linear-gradient(135deg, #ec4899, #8b5cf6)' : 'linear-gradient(135deg, #22c55e, #06b6d4)'; }
    playerControls.style.display = 'flex';
    // Hide progress for images, show only navigation
    playerProgressBg.parentElement.style.opacity = '0.3';
    playerProgressBg.parentElement.style.pointerEvents = 'none';
    playerPlayBtn.style.opacity = '0.4';
    playerPlayBtn.style.pointerEvents = 'none';
    playerTime.textContent = extUpper;
  } else if (isVideo || isAudio) {
    playerVideo.src = fileUrl;
    playerVideo.style.display = 'block';
    playerStage.style.display = 'flex';
    playerStage.className = 'player-stage' + (isAudio ? ' player-stage-audio' : '');
    playerStageArt.style.display = isAudio ? 'flex' : 'none';
    artTitle.textContent = name;
    artDetail.textContent = isAudio ? 'Audio  •  ' + extUpper : '';
    playerFilename.textContent = name;
    playerDetails.textContent = isVideo ? extUpper : 'Audio  •  ' + extUpper;
    if (playerThumb) playerThumb.innerHTML = isVideo ? '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.5" y="4" width="11" height="8" rx="1.4" stroke="white" stroke-width="1.4"/><path d="M6.8 7.2L10.8 9 6.8 10.8V7.2z" fill="white"/></svg>' : '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 11.8V4.8L12 3.6V11" stroke="white" stroke-width="1.4" stroke-linecap="round"/><circle cx="4" cy="11.8" r="1.6" stroke="white" stroke-width="1.3"/><circle cx="11" cy="11.2" r="1.6" stroke="white" stroke-width="1.3"/></svg>';
    playerProgressBg.parentElement.style.opacity = '1';
    playerProgressBg.parentElement.style.pointerEvents = 'auto';
    playerPlayBtn.style.opacity = '1';
    playerPlayBtn.style.pointerEvents = 'auto';
    playerVideo.load();
    playerVideo.play().catch(()=>{});
  }

  playerControls.style.display = 'flex';
  fileBrowser.style.display = 'none';
  recentView.style.display = 'none';
  emptyState.style.display = 'none';

  window.player.addToRecent(filePath);
  if (viewMode === 'recent') loadRecent();
  isPlaying = !isImage;
  updatePlayBtn();
}

function updateProgress() {
  const v = playerVideo;
  if (!v.duration || isNaN(v.duration)) return;
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
  // If image is showing, go next
  if (playerImage.style.display !== 'none') {
    nextTrack();
    return;
  }
  if (playerVideo.paused) {
    playerVideo.play().catch(() => {});
  } else {
    playerVideo.pause();
  }
}

function prevTrack() {
  if (playlist.length === 0) return;
  if (isShuffle) {
    playlistIndex = Math.floor(Math.random() * playlist.length);
  } else {
    playlistIndex = (playlistIndex - 1 + playlist.length) % playlist.length;
  }
  loadMedia(playlist[playlistIndex]);
}

function nextTrack() {
  if (playlist.length === 0) return;
  if (isShuffle) {
    playlistIndex = Math.floor(Math.random() * playlist.length);
  } else {
    playlistIndex = (playlistIndex + 1) % playlist.length;
  }
  loadMedia(playlist[playlistIndex]);
}

// ---- Player event listeners ----
playerPlayBtn.addEventListener('click', togglePlay);
playerPrevBtn.addEventListener('click', prevTrack);
playerNextBtn.addEventListener('click', nextTrack);
if (playerShuffleBtn) {
  playerShuffleBtn.addEventListener('click', () => {
    isShuffle = !isShuffle;
    playerShuffleBtn.classList.toggle('active', isShuffle);
  });
}

playerProgressBg.addEventListener('mousedown', (e) => {
  if (playerImage.style.display !== 'none') return;
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
  updateVolumeIcon();
});

function updateVolumeIcon() {
  const v = parseFloat(playerVolumeRange.value);
  if (v === 0 || playerVideo.muted) {
    playerVolumeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M8 7H5v6h3l4 4V3L8 7z" fill="currentColor"/><path d="M14 8l-3 3m0-3l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  } else if (v < 0.5) {
    playerVolumeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M8 7H5v6h3l4 4V3L8 7z" fill="currentColor"/><path d="M14 9a1.5 1.5 0 010 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  } else {
    playerVolumeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M8 7H5v6h3l4 4V3L8 7z" fill="currentColor"/><path d="M14 8a3 3 0 010 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  }
}

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

function closePlayer() {
  playerVideo.pause();
  playerVideo.src = '';
  if (playerImage) { playerImage.src = ''; playerImage.style.display = 'none'; }
  playerControls.style.display = 'none';
  playerStage.style.display = 'none';
  fileBrowser.style.display = '';
  if (viewMode === 'recent') recentView.style.display = '';
  playlist = [];
  playlistIndex = -1;
  // restore progress
  if (playerProgressBg) {
    playerProgressBg.parentElement.style.opacity = '1';
    playerProgressBg.parentElement.style.pointerEvents = 'auto';
  }
}

playerCloseBtn.addEventListener('click', closePlayer);
if (stageClose) stageClose.addEventListener('click', closePlayer);

// Click stage bg to close image viewer
playerStage.addEventListener('click', (e) => {
  if (e.target === playerStage || e.target === stageBg) {
    if (playerImage.style.display !== 'none') closePlayer();
  }
});

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', (e) => {
  const isPlayerOpen = playerControls.style.display !== 'none';
  if (!isPlayerOpen) {
    // Global: search focus with /
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput?.focus();
    }
    return;
  }

  // Don't trigger shortcuts when typing in search
  if (document.activeElement === searchInput) {
    if (e.code === 'Escape') { searchInput.blur(); }
    return;
  }

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      togglePlay();
      break;
    case 'ArrowLeft':
      if (playerImage.style.display !== 'none') prevTrack();
      else playerVideo.currentTime = Math.max(0, playerVideo.currentTime - 5);
      break;
    case 'ArrowRight':
      if (playerImage.style.display !== 'none') nextTrack();
      else playerVideo.currentTime = Math.min(playerVideo.duration, playerVideo.currentTime + 5);
      break;
    case 'ArrowUp':
      playerVideo.volume = Math.min(1, playerVideo.volume + 0.1);
      playerVolumeRange.value = playerVideo.volume;
      updateVolumeIcon();
      break;
    case 'ArrowDown':
      playerVideo.volume = Math.max(0, playerVideo.volume - 0.1);
      playerVolumeRange.value = playerVideo.volume;
      updateVolumeIcon();
      break;
    case 'KeyF':
      playerFullscreenBtn.click();
      break;
    case 'KeyM':
      playerVideo.muted = !playerVideo.muted;
      updateVolumeIcon();
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
    case 'KeyS':
      if (playerShuffleBtn) playerShuffleBtn.click();
      break;
    case 'Escape':
      closePlayer();
      break;
  }
});
