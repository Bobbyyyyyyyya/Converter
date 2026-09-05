const dropZone = document.getElementById('dropZone');
const uploadError = document.getElementById('uploadError');
const controls = document.getElementById('controls');
const fileList = document.getElementById('fileList');
const fileCount = document.getElementById('fileCount');
const targetFormat = document.getElementById('targetFormat');
const outputDir = document.getElementById('outputDir');
const selectOutputDirBtn = document.getElementById('selectOutputDir');
const convertBtn = document.getElementById('convertBtn');
const clearFilesBtn = document.getElementById('clearFiles');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const results = document.getElementById('results');
const resultsList = document.getElementById('resultsList');
const resultsSummary = document.getElementById('resultsSummary');
const newConversionBtn = document.getElementById('newConversion');
const updateBanner = document.getElementById('updateBanner');
const updateIcon = document.getElementById('updateIcon');
const updateTitle = document.getElementById('updateTitle');
const updateDesc = document.getElementById('updateDesc');
const updateActions = document.getElementById('updateActions');
const updateBtn = document.getElementById('updateBtn');
const updateDismiss = document.getElementById('updateDismiss');
const updateProgress = document.getElementById('updateProgress');
const updateProgressFill = document.getElementById('updateProgressFill');
const checkUpdateBtn = document.getElementById('checkUpdateBtn');
const versionDisplay = document.getElementById('versionDisplay');

let selectedFiles = [];
let currentOutputDir = '';

// ---- Version & Updates ----

const modalVersion = document.getElementById('modalVersion');
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const helpClose = document.getElementById('helpClose');

window.converter.getAppVersion().then((v) => {
  versionDisplay.textContent = v;
  modalVersion.textContent = v;
});

helpBtn.addEventListener('click', () => { helpModal.style.display = 'flex'; });
helpClose.addEventListener('click', () => { helpModal.style.display = 'none'; });
helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) helpModal.style.display = 'none';
});

let updateState = null;
let updateHideTimer = null;
let updateCheckManual = false;

// SVG iconen voor update banner — professioneel, geen emojis
const UPDATE_ICONS = {
  checking: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 2.5A6.5 6.5 0 105.5 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9 5v4l2.5 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  available: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 3.5v9M5.5 8.5l3.5 3.5 3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 12.5H14.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  success: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M6 9l2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  error: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 6.5l5 5M11.5 6.5l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  downloading: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 2.5A6.5 6.5 0 105.5 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.3"/><path d="M9 2.5A6.5 6.5 0 0115.5 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
};

window.converter.onUpdateStatus((data) => {
  switch (data.status) {
    case 'checking':
      showUpdate('checking', UPDATE_ICONS.checking, 'Checking for updates...', updateCheckManual ? '' : 'Even geduld');
      updateBtn.style.display = 'none';
      updateDismiss.style.display = 'flex';
      updateActions.style.display = 'flex';
      // Fallback: als updater hangt (geen netwerk), verberg na 7s automatisch
      scheduleHide(7000);
      break;
    case 'available':
      showUpdate('available', UPDATE_ICONS.available, `Update v${data.version} beschikbaar`, 'Klik om te downloaden');
      updateBtn.style.display = '';
      updateDismiss.style.display = 'flex';
      updateBtn.textContent = 'Download';
      updateBtn.disabled = false;
      updateBtn.onclick = () => window.converter.downloadUpdate();
      updateActions.style.display = 'flex';
      if (updateHideTimer) { clearTimeout(updateHideTimer); updateHideTimer = null; }
      break;
    case 'not-available':
      // Alleen tonen bij handmatige check; auto-check op start blijft stil
      if (!updateCheckManual) {
        hideUpdate();
        updateCheckManual = false;
        break;
      }
      showUpdate('not-available', UPDATE_ICONS.success, 'Je bent up-to-date', `v${versionDisplay.textContent} is de nieuwste versie`);
      updateBtn.style.display = 'none';
      updateDismiss.style.display = 'flex';
      updateActions.style.display = 'flex';
      scheduleHide(2500);
      break;
    case 'downloading':
      // Toon progress balk vloeiend
      if (updateProgress) {
        updateProgress.style.display = 'block';
        requestAnimationFrame(() => { updateProgressFill.style.width = `${Math.max(2, data.percent)}%`; });
      }
      updateIcon.innerHTML = UPDATE_ICONS.downloading;
      updateIcon.className = 'update-icon downloading';
      updateTitle.textContent = 'Update downloaden...';
      updateDesc.textContent = `${data.percent}% • Even geduld`;
      updateBtn.style.display = '';
      updateDismiss.style.display = 'flex';
      updateBtn.textContent = `${data.percent}%`;
      updateBtn.disabled = true;
      updateActions.style.display = 'flex';
      // Niet auto-hiden tijdens download
      if (updateHideTimer) { clearTimeout(updateHideTimer); updateHideTimer = null; }
      break;
    case 'downloaded':
      showUpdate('downloaded', UPDATE_ICONS.available, 'Update klaar', 'Herstart om te installeren');
      updateBtn.style.display = '';
      updateDismiss.style.display = 'flex';
      updateBtn.textContent = 'Installeer';
      updateBtn.disabled = false;
      updateBtn.onclick = () => window.converter.installUpdate();
      updateActions.style.display = 'flex';
      if (updateHideTimer) { clearTimeout(updateHideTimer); updateHideTimer = null; }
      break;
    case 'error':
      showUpdate('error', UPDATE_ICONS.error, 'Update check mislukt', data.message || 'Probeer later opnieuw');
      updateBtn.style.display = 'none';
      updateDismiss.style.display = 'flex';
      updateActions.style.display = 'flex';
      scheduleHide(4000);
      break;
  }
  // Reset manual flag na not-available/error
  if (data.status === 'not-available' || data.status === 'error') {
    setTimeout(() => { updateCheckManual = false; }, 100);
  }
});

function showUpdate(state, iconSvg, title, desc) {
  if (updateHideTimer) { clearTimeout(updateHideTimer); updateHideTimer = null; }
  updateState = state;
  // Vloeiende tekst wissel
  updateBanner.style.display = 'block';
  updateBanner.classList.remove('hiding');
  // Icon morph
  updateIcon.innerHTML = iconSvg;
  updateIcon.className = 'update-icon ' + state;
  // Tekst met subtiele fade
  updateTitle.style.opacity = '0';
  updateDesc.style.opacity = '0';
  setTimeout(() => {
    updateTitle.textContent = title;
    updateDesc.textContent = desc;
    updateTitle.style.opacity = '1';
    updateDesc.style.opacity = '1';
  }, 80);
  updateTitle.style.transition = 'opacity 0.2s ease';
  updateDesc.style.transition = 'opacity 0.2s ease';
  // Verberg progress default
  if (updateProgress) {
    updateProgress.style.display = 'none';
    updateProgressFill.style.width = '0%';
  }
  updateBanner.setAttribute('aria-live', 'polite');
}

function hideUpdate() {
  if (updateHideTimer) { clearTimeout(updateHideTimer); updateHideTimer = null; }
  if (updateBanner.style.display === 'none') return;
  updateBanner.classList.add('hiding');
  setTimeout(() => {
    updateBanner.style.display = 'none';
    updateBanner.classList.remove('hiding');
    updateState = null;
    if (updateProgress) {
      updateProgress.style.display = 'none';
      updateProgressFill.style.width = '0%';
    }
  }, 220);
}

function scheduleHide(ms) {
  if (updateHideTimer) clearTimeout(updateHideTimer);
  updateHideTimer = setTimeout(hideUpdate, ms);
}

updateDismiss.addEventListener('click', hideUpdate);

checkUpdateBtn.addEventListener('click', () => {
  updateCheckManual = true;
  window.converter.checkUpdate();
});

// ---- Drop Zone ----

dropZone.addEventListener('click', async () => {
  const files = await window.converter.selectFiles();
  if (files.length) addFiles(files);
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  // Pad ophalen via preload (webUtils.getPathForFile); File.path bestaat niet meer in nieuwe Electron-versies
  const files = Array.from(e.dataTransfer.files);
  const paths = [];
  const noPathNames = [];
  for (const f of files) {
    let p = '';
    try {
      p = window.converter?.getPathForFile?.(f) || f.path || '';
    } catch {
      p = f.path || '';
    }
    if (p && (p.includes('/') || p.includes('\\'))) {
      paths.push(p);
    } else {
      noPathNames.push(f.name || 'onbekend bestand');
    }
  }
  if (noPathNames.length > 0) {
    showUploadError(`<strong>Kon pad niet bepalen voor:</strong> ${noPathNames.slice(0, 3).join(', ')} — klik op de drop-zone om via de bestandsdialoog te kiezen.`);
    if (paths.length === 0) return;
  }
  // If single directory dropped, inform user
  if (paths.length === 1) {
    const info = await window.converter.getFormatInfo(paths[0]);
    if (info.type === 'unknown' && !paths[0].includes('.')) {
      showUploadError(`<strong>Map gedropt:</strong> Sleep bestanden direct, geen mappen. Tip: open de map en selecteer GIF/RAW/Audio bestanden tegelijk (Ctrl/Cmd).`);
      return;
    }
  }
  if (paths.length) addFiles(paths);
});

dropZone.addEventListener('mousemove', (e) => {
  const rect = dropZone.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  dropZone.style.setProperty('--mouse-x', x + '%');
  dropZone.style.setProperty('--mouse-y', y + '%');
});

window.converter.onOpenFile((files) => {
  if (files.length) addFiles(files, true);
});

// ---- File Management ----

function showUploadError(msg) {
  if (!uploadError) return;
  uploadError.innerHTML = msg;
  uploadError.style.display = 'block';
  setTimeout(() => { uploadError.style.display = 'none'; }, 6000);
}
function hideUploadError() {
  if (uploadError) uploadError.style.display = 'none';
}

async function addFiles(paths, silent = false) {
  // Filter out directories / non-files silently - main process already does, but double-check
  const infos = await Promise.all(paths.map(p => window.converter.getFormatInfo(p)));
  const newFiles = [];
  const unknownFiles = [];
  for (let i = 0; i < paths.length; i++) {
    if (infos[i].type !== 'unknown') {
      newFiles.push({ path: paths[i], ...infos[i] });
    } else {
      unknownFiles.push(paths[i]);
    }
  }

  if (newFiles.length === 0) {
    // Only show error if user explicitly picked files (not silent open-file on startup)
    if (!silent) {
      const hasInterestingExt = unknownFiles.some(p => {
        const ext = p.split('.').pop().toLowerCase();
        return ext.length <= 5 && ext.length >= 2;
      });
      if (hasInterestingExt) {
        const names = unknownFiles.slice(0,3).map(p => p.split(/[\\/]/).pop()).join(', ');
        const more = unknownFiles.length > 3 ? ` +${unknownFiles.length-3} meer` : '';
        showUploadError(`<strong>Geen ondersteunde bestanden:</strong> ${names}${more} — check of het bestand niet corrupt is. Ondersteund: GIF, RAW (CR2/NEF/ARW/DNG), Audio (MP3/WAV/FLAC/WV), Video, SKP etc.`);
      }
    }
    return;
  }
  // If some files were unknown but others were OK, inform user but still add the good ones
  if (unknownFiles.length > 0 && !silent) {
    const names = unknownFiles.slice(0,2).map(p => p.split(/[\\/]/).pop()).join(', ');
    showUploadError(`<strong>${unknownFiles.length} bestand(en) overgeslagen:</strong> ${names} — niet ondersteund of corrupt. ${newFiles.length} bestand(en) toegevoegd.`);
  } else {
    hideUploadError();
  }

  selectedFiles = [...selectedFiles, ...newFiles];
  controls.style.display = 'block';
  dropZone.style.display = 'none';
  renderFileList();
  updateTargetFormatOptions();
  updateConvertButton();
}

function renderFileList() {
  fileList.innerHTML = '';
  fileCount.textContent = selectedFiles.length;

  selectedFiles.forEach((f, i) => {
    const li = document.createElement('li');
    const typeClass = getFileTypeClass(f.type, f.ext);
    const displayName = f.path.split(/[\\/]/).pop();
    li.innerHTML = `
      <span class="file-icon ${typeClass}">${getFileIcon(f.type, f.ext)}</span>
      <span class="file-name" title="${f.path}">${displayName}</span>
      <span class="file-ext">${f.ext}</span>
      <button class="file-remove" data-index="${i}">×</button>
    `;
    li.querySelector('.file-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFiles.splice(i, 1);
      renderFileList();
      updateTargetFormatOptions();
      updateConvertButton();
      if (selectedFiles.length === 0) resetUI();
    });
    fileList.appendChild(li);
  });
}

function getFileIcon(type, ext) {
  // Professionele SVG iconen — geen emojis
  const svg = {
    image: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.2" y="3" width="11.6" height="9.5" rx="1.3" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="7" r="1.3" stroke="currentColor" stroke-width="1.2"/><path d="M2.8 10.8L5 8.4l2.4 2.4 1.8-1.6 3 2.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    audio: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 11.8V4.8L12 3.6V11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4" cy="11.8" r="1.6" stroke="currentColor" stroke-width="1.3"/><circle cx="11" cy="11.2" r="1.6" stroke="currentColor" stroke-width="1.3"/></svg>',
    video: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.5" y="4" width="11" height="8" rx="1.4" stroke="currentColor" stroke-width="1.4"/><path d="M6.8 7.2L10.8 9 6.8 10.8V7.2z" fill="currentColor"/></svg>',
    document: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 2H9.2L12.4 5V13.2a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4"/><path d="M9.2 2.4V5H12" stroke="currentColor" stroke-width="1.2"/><path d="M6 8.6h4.8M6 11h4.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
    model3d: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2.6L2.8 5.9v5.2L8 14.4l5.2-3.3V5.9L8 2.6z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M2.8 5.9L8 9l5.2-3.1M8 9v5.4" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    archive: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3.5H10L13 6V13.5a1 1 0 01-1 1H3a1 1 0 01-1-1V4.5a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4"/><path d="M10 3.5V6H13" stroke="currentColor" stroke-width="1.2"/><path d="M5 9H11M5 11H11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M3 7.5h10" stroke="currentColor" stroke-width="1" opacity="0.35"/></svg>',
    animation: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2.7l1 3H12.2l-2.6 1.9 1 3-2.6-1.9-2.6 1.9 1-3L4 5.7h3.1L8 2.7z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    folder: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 4.2H6.2l1.6 1.6H13.5V12.5a1 1 0 01-1 1H2.5a1 1 0 01-1-1V5.2a1 1 0 011-1z" stroke="currentColor" stroke-width="1.3"/><path d="M2.5 7.5h11" stroke="currentColor" stroke-width="1" opacity="0.35"/></svg>'
  };
  if (ext === 'folder' || type === 'folder') return svg.folder;
  if (type === 'archive') return svg.archive;
  if (type === 'document' || ext === 'pdf') return svg.document;
  return svg[type] || svg.document;
}

function getFileTypeClass(type, ext) {
  if (type === 'document' || ext === 'pdf') return 'document';
  if (type === 'archive') return 'archive';
  switch (type) {
    case 'image': return 'image';
    case 'audio': return 'audio';
    case 'video': return 'video';
    case 'model3d': return 'model3d';
    case 'animation': return 'animation';
    default: return '';
  }
}

function updateTargetFormatOptions() {
  if (selectedFiles.length === 0) {
    targetFormat.innerHTML = '';
    return;
  }

  // Per-extension targets: use validTargets from getFormatInfo so e.g. DWF/DWFX
  // (niet direct converteerbaar) geen onmogelijke opties toont. Neem de intersectie
  // zodat alleen formaten overblijven die voor ALLE geselecteerde bestanden werken.
  let commonTargets = null;
  for (const f of selectedFiles) {
    const targets = Array.isArray(f.validTargets) ? f.validTargets : getTargetsForType(f.type);
    if (commonTargets === null) {
      commonTargets = [...targets];
    } else {
      const set = new Set(targets);
      commonTargets = commonTargets.filter((t) => set.has(t));
    }
  }
  commonTargets = commonTargets || [];

  if (commonTargets.length === 0) {
    targetFormat.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '—';
    targetFormat.appendChild(opt);
    // Specifieke uitleg voor DWF/DWFX, anders generieke melding
    const hasDwf = selectedFiles.some((f) => f.ext === 'dwf' || f.ext === 'dwfx');
    if (hasDwf) {
      const reason = selectedFiles.find((f) => f.unsupportedReason)?.unsupportedReason
        || 'DWF/DWFX kan niet direct geconverteerd worden. Sla het bestand in AutoCAD op als DWG of DXF en converteer daarna naar GLTF/GLB/STL/OBJ/PLY.';
      showUploadError(`<strong>Dit bestand kan niet direct geconverteerd worden:</strong> ${reason}`);
    } else {
      showUploadError('<strong>Geen gemeenschappelijk doelformaat:</strong> selecteer bestanden van hetzelfde type (bijv. alleen DWG/DXF, of alleen images).');
    }
    updateConvertButton();
    return;
  }

  const fragment = document.createDocumentFragment();
  const seen = new Set();
  for (const fmt of commonTargets) {
    if (!seen.has(fmt)) {
      seen.add(fmt);
      const opt = document.createElement('option');
      opt.value = fmt;
      opt.textContent = fmt.toUpperCase();
      fragment.appendChild(opt);
    }
  }
  targetFormat.innerHTML = '';
  targetFormat.appendChild(fragment);
  updateConvertButton();
}

function getTargetsForType(type) {
  switch (type) {
    case 'image': return ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'avif', 'heic', 'heif', 'jp2', 'jxl', 'apng', 'pdf', 'ico'];
    case 'audio': return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'm4b', 'opus', 'aiff', 'ac3', 'mp2', 'wv', 'mka'];
    case 'video': return ['mp4', 'avi', 'mov', 'mkv', 'webm', 'gif', 'webp', 'apng', '3gp', 'm4v', 'mpg', 'ogv', 'ts', 'hevc', 'mxf'];
    case 'document': return ['pdf', 'txt', 'html', 'md', 'csv', 'json', 'rtf'];
    case 'model3d': return ['gltf', 'glb', 'stl', 'obj', 'ply', 'fbx', 'dae', 'dxf', 'usd', 'ifc', '3dm', 'step'];
    case 'archive': return ['zip', 'tar', 'tgz', 'gz', 'bz2', 'xz', '7z', 'jar'];
    case 'animation': return ['mp4', 'gif', 'webp'];
    default: return [];
  }
}

function updateConvertButton() {
  const hasValidTarget = targetFormat.value && targetFormat.value !== '' && targetFormat.value !== '—';
  convertBtn.disabled = selectedFiles.length === 0 || !currentOutputDir || !hasValidTarget;
}

// ---- Output Directory ----

selectOutputDirBtn.addEventListener('click', async () => {
  const dir = await window.converter.selectOutputDir();
  if (dir) {
    currentOutputDir = dir;
    outputDir.value = dir;
    updateConvertButton();
  }
});

clearFilesBtn.addEventListener('click', () => {
  selectedFiles = [];
  resetUI();
});

function resetUI() {
  controls.style.display = 'none';
  dropZone.style.display = 'block';
  progressContainer.style.display = 'none';
  results.style.display = 'none';
  currentOutputDir = '';
  outputDir.value = '';
  convertBtn.disabled = true;
}

// ---- Conversion ----

convertBtn.addEventListener('click', async () => {
  const format = targetFormat.value;
  if (!format || !currentOutputDir) return;

  convertBtn.disabled = true;
  progressContainer.style.display = 'block';
  progressFill.style.width = '0%';
  progressText.textContent = 'Converting...';
  results.style.display = 'none';

  const files = selectedFiles.map((f) => f.path);

  window.converter.onProgress(({ file, progress }) => {
    progressFill.style.width = progress + '%';
    const name = file.split(/[\\/]/).pop();
    progressText.textContent = `Converting ${name}... ${progress}%`;
  });

  const convertResults = await window.converter.convert({
    files,
    targetFormat: format,
    outputDir: currentOutputDir,
  });

  progressFill.style.width = '100%';
  progressText.textContent = 'Conversion complete!';
  progressContainer.style.display = 'none';

  showResults(convertResults);
});

function showResults(convertResults) {
  results.style.display = 'block';
  resultsList.innerHTML = '';

  const fragment = document.createDocumentFragment();
  let successCount = 0;
  for (const r of convertResults) {
    const li = document.createElement('li');
    const name = r.file.split(/[\\/]/).pop();
    if (r.success) {
      successCount++;
      li.innerHTML = `
        <span class="success"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 7l2.5 2.5L11 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span>${name}</span>
        <span class="file-path">→ ${r.outputPath.split(/[\\/]/).pop()}</span>
      `;
    } else {
      li.innerHTML = `
        <span class="error"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M4 4l6 6M10 4L4 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>
        <span>${name}: ${r.error}</span>
      `;
    }
    fragment.appendChild(li);
  }
  resultsList.appendChild(fragment);

  resultsSummary.textContent = `${successCount} / ${convertResults.length} files converted successfully`;
}

newConversionBtn.addEventListener('click', resetUI);

// ---- Open Player ----

document.getElementById('openPlayerBtn').addEventListener('click', () => {
  window.converter.openPlayer();
});
