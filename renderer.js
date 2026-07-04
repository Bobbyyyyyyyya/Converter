const dropZone = document.getElementById('dropZone');
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

window.converter.onUpdateStatus((data) => {
  switch (data.status) {
    case 'checking':
      showUpdate('checking', '⟳', 'Checking for updates...', '');
      break;
    case 'available':
      showUpdate('available', '⬇', `Update v${data.version} available`, 'Click to download');
      updateBtn.textContent = 'Download';
      updateBtn.onclick = () => window.converter.downloadUpdate();
      updateActions.style.display = 'flex';
      break;
    case 'not-available':
      showUpdate('not-available', '✓', 'You\'re up to date', `v${versionDisplay.textContent} is the latest version`);
      updateActions.style.display = 'none';
      setTimeout(hideUpdate, 3000);
      break;
    case 'downloading':
      updateIcon.className = 'update-icon downloading';
      updateTitle.textContent = 'Downloading update...';
      updateDesc.textContent = `${data.percent}%`;
      updateBtn.textContent = `${data.percent}%`;
      updateBtn.disabled = true;
      break;
    case 'downloaded':
      showUpdate('downloaded', '⬇', 'Update ready to install', 'Restart to apply');
      updateBtn.textContent = 'Install';
      updateBtn.disabled = false;
      updateBtn.onclick = () => window.converter.installUpdate();
      updateActions.style.display = 'flex';
      break;
    case 'error':
      showUpdate('error', '✗', 'Update check failed', data.message);
      updateActions.style.display = 'none';
      setTimeout(hideUpdate, 4000);
      break;
  }
});

function showUpdate(state, icon, title, desc) {
  updateIcon.textContent = icon;
  updateIcon.className = 'update-icon';
  updateTitle.textContent = title;
  updateDesc.textContent = desc;
  updateBanner.style.display = 'block';
}

function hideUpdate() {
  updateBanner.style.display = 'none';
}

updateDismiss.addEventListener('click', hideUpdate);

checkUpdateBtn.addEventListener('click', () => {
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
  const paths = Array.from(e.dataTransfer.files).map((f) => f.path);
  if (paths.length) addFiles(paths);
});

dropZone.addEventListener('mousemove', (e) => {
  const rect = dropZone.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  dropZone.style.setProperty('--mouse-x', x + '%');
  dropZone.style.setProperty('--mouse-y', y + '%');
});

// ---- File Management ----

async function addFiles(paths) {
  const newFiles = [];
  for (const p of paths) {
    const info = await window.converter.getFormatInfo(p);
    if (info.type !== 'unknown') {
      newFiles.push({ path: p, ...info });
    }
  }

  if (newFiles.length === 0) {
    alert('No supported files found.');
    return;
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
    const typeClass = getFileTypeClass(f.type);
    li.innerHTML = `
      <span class="file-icon ${typeClass}">${getFileEmoji(f.type)}</span>
      <span class="file-name">${f.path.split('/').pop()}</span>
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

function getFileEmoji(type) {
  switch (type) {
    case 'image': return '🖼';
    case 'audio': return '🎵';
    case 'video': return '🎬';
    default: return '📄';
  }
}

function getFileTypeClass(type) {
  switch (type) {
    case 'image': return 'image';
    case 'audio': return 'audio';
    case 'video': return 'video';
    default: return '';
  }
}

function updateTargetFormatOptions() {
  targetFormat.innerHTML = '';
  if (selectedFiles.length === 0) return;

  const commonTypes = new Set(selectedFiles.map((f) => f.type));
  const commonTargets = commonTypes.size === 1
    ? getTargetsForType(selectedFiles[0].type)
    : ['mp4', 'mp3', 'png', 'jpg', 'webp', 'gif', 'wav', 'ogg', 'flac', 'aac', 'opus', 'avi', 'mov', 'mkv', 'webm', 'heic', 'jp2', '3gp', 'mpg'];

  const seen = new Set();
  for (const fmt of commonTargets) {
    if (!seen.has(fmt)) {
      seen.add(fmt);
      const opt = document.createElement('option');
      opt.value = fmt;
      opt.textContent = fmt.toUpperCase();
      targetFormat.appendChild(opt);
    }
  }
}

function getTargetsForType(type) {
  switch (type) {
    case 'image': return ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'avif', 'heic', 'jp2'];
    case 'audio': return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus', 'aiff', 'ac3', 'mp2'];
    case 'video': return ['mp4', 'avi', 'mov', 'mkv', 'webm', 'gif', '3gp', 'm4v', 'mpg', 'ogv', 'ts'];
    default: return [];
  }
}

function updateConvertButton() {
  convertBtn.disabled = selectedFiles.length === 0 || !currentOutputDir;
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
    const name = file.split('/').pop();
    progressText.textContent = `Converting ${name}... ${progress}%`;
  });

  const convertResults = await window.converter.convert({
    files,
    targetFormat: format,
    outputDir: currentOutputDir,
  });

  progressFill.style.width = '100%';
  progressText.textContent = 'Conversion complete!';

  showResults(convertResults);
});

function showResults(convertResults) {
  results.style.display = 'block';
  resultsList.innerHTML = '';

  let successCount = 0;
  for (const r of convertResults) {
    const li = document.createElement('li');
    const name = r.file.split('/').pop();
    if (r.success) {
      successCount++;
      li.innerHTML = `
        <span class="success">✓</span>
        ${name}
        <span class="file-path">→ ${r.outputPath.split('/').pop()}</span>
      `;
    } else {
      li.innerHTML = `
        <span class="error">✗</span>
        ${name}: ${r.error}
      `;
    }
    resultsList.appendChild(li);
  }

  resultsSummary.textContent = `${successCount} / ${convertResults.length} files converted successfully`;
}

newConversionBtn.addEventListener('click', resetUI);
