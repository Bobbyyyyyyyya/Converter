const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const PDFDocument = require('pdfkit');
const mammoth = require('mammoth');

const ffmpegPath = process.env.FFMPEG_PATH || findSystemFfmpeg() || require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

function findSystemFfmpeg() {
  const candidates = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
  ];
  for (const p of candidates) {
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {}
  }
  try {
    const out = require('child_process').execSync('which ffmpeg', { encoding: 'utf8' }).trim();
    if (out) return out;
  } catch {}
  return null;
}

const SUPPORTED = {
  image: [
    'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'avif',
    'heic', 'heif', 'jp2', 'svg',
  ],
  audio: [
    'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma',
    'opus', 'aiff', 'alac', 'ac3', 'amr', 'mp2',
  ],
  video: [
    'mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv',
    '3gp', 'm4v', 'mpg', 'mpeg', 'ogv', 'ts', 'mts', 'm2ts',
  ],
  document: [
    'pdf', 'txt', 'docx', 'doc',
  ],
  model3d: [
    '3ds', '3mf', 'ac', 'amf', 'ase', 'b3d', 'blend', 'bvh', 'cob',
    'dae', 'dxf', 'fbx', 'gltf', 'glb', 'lwo', 'lxo', 'md2', 'md5mesh',
    'mdc', 'mdl', 'ms3d', 'nff', 'obj', 'off', 'ogex', 'ply',
    'q3o', 'q3s', 'sib', 'smd', 'stl', 'x', 'xgl', 'zgl',
  ],
  animation: [
    'lottie',
  ],
};

const TYPE_MAP = {};
for (const [type, exts] of Object.entries(SUPPORTED)) {
  for (const ext of exts) TYPE_MAP[ext] = type;
}

function getFormatInfo(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const type = TYPE_MAP[ext] || 'unknown';
  const validTargets = getTargetsForType(type);
  return { ext, type, validTargets };
}

function getTargetsForType(type) {
  switch (type) {
    case 'image':
      return ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'avif', 'heic', 'jp2', 'pdf'];
    case 'audio':
      return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus', 'aiff', 'ac3', 'mp2'];
    case 'video':
      return ['mp4', 'avi', 'mov', 'mkv', 'webm', 'gif', '3gp', 'm4v', 'mpg', 'ogv', 'ts'];
    case 'document':
      return ['pdf', 'txt'];
    case 'model3d':
      return ['gltf', 'glb', 'stl'];
    case 'animation':
      return ['mp4', 'gif', 'webp'];
    default:
      return [];
  }
}

async function convertFile(inputPath, outputPath, targetFormat, onProgress) {
  const ext = path.extname(inputPath).toLowerCase().replace('.', '');
  const type = TYPE_MAP[ext];

  if (type === 'image') {
    if (targetFormat === 'pdf') {
      await convertImageToPdf(inputPath, outputPath, onProgress);
    } else {
      await convertImage(inputPath, outputPath, targetFormat, onProgress);
    }
  } else if (type === 'audio' || type === 'video') {
    await convertFFmpeg(inputPath, outputPath, targetFormat, onProgress);
  } else if (type === 'document') {
    if (targetFormat === 'pdf') {
      await convertDocumentToPdf(inputPath, outputPath, onProgress);
    } else if (targetFormat === 'txt') {
      await convertDocumentToTxt(inputPath, outputPath, onProgress);
    } else {
      throw new Error(`Unsupported target format for document: ${targetFormat}`);
    }
  } else if (type === 'model3d') {
    if (targetFormat === 'gltf' || targetFormat === 'glb') {
      await convertModel3dToGltf(inputPath, outputPath, targetFormat, onProgress);
    } else if (targetFormat === 'stl') {
      await convertModel3dToStl(inputPath, outputPath, onProgress);
    } else {
      throw new Error(`Unsupported target format for model3d: ${targetFormat}`);
    }
  } else if (type === 'animation') {
    await convertAnimation(inputPath, outputPath, targetFormat, onProgress);
  } else {
    throw new Error(`Unsupported file type: .${ext}`);
  }
}

async function convertImage(inputPath, outputPath, targetFormat, onProgress) {
  onProgress?.(10);

  let pipeline = sharp(inputPath);

  const metadata = await pipeline.metadata();
  const hasAlpha = metadata.channels === 4;

  if (targetFormat === 'jpeg' || targetFormat === 'jpg') {
    if (hasAlpha) pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } });
    pipeline = pipeline.jpeg({ quality: 92 });
  } else if (targetFormat === 'png') {
    pipeline = pipeline.png({ compressionLevel: 6 });
  } else if (targetFormat === 'webp') {
    pipeline = pipeline.webp({ quality: 85 });
  } else if (targetFormat === 'bmp') {
    pipeline = pipeline.bmp();
  } else if (targetFormat === 'tiff') {
    pipeline = pipeline.tiff({ quality: 85 });
  } else if (targetFormat === 'gif') {
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    const processed = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
    await processed.gif().toFile(outputPath);
    onProgress?.(100);
    return;
  } else if (targetFormat === 'avif') {
    pipeline = pipeline.avif({ quality: 80 });
  } else if (targetFormat === 'heic' || targetFormat === 'heif') {
    pipeline = pipeline.heif({ compression: 'hevc', quality: 85 });
  } else if (targetFormat === 'jp2') {
    pipeline = pipeline.jp2({ quality: 85 });
  } else {
    throw new Error(`Unsupported image format: ${targetFormat}`);
  }

  onProgress?.(50);
  await pipeline.toFile(outputPath);
  onProgress?.(100);
}

async function convertImageToPdf(inputPath, outputPath, onProgress) {
  onProgress?.(10);
  const imgBuf = await sharp(inputPath).png().toBuffer();
  onProgress?.(50);

  const doc = new PDFDocument({ autoFirstPage: false });
  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);
  doc.addPage();
  doc.image(imgBuf, 0, 0, { fit: [doc.page.width, doc.page.height], align: 'center', valign: 'center' });
  doc.end();
  await new Promise((resolve) => writeStream.on('finish', resolve));
  onProgress?.(100);
}

function convertFFmpeg(inputPath, outputPath, targetFormat, onProgress) {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath);

    const audioCodecMap = {
      'mp3': 'libmp3lame',
      'aac': 'aac',
      'ogg': 'vorbis',
      'flac': 'flac',
      'm4a': 'aac',
      'wav': 'pcm_s16le',
      'opus': 'libopus',
      'aiff': 'pcm_s16be',
      'ac3': 'ac3',
      'mp2': 'mp2',
      'alac': 'alac',
    };

    const videoCodecMap = {
      'mp4': 'libx264',
      'mov': 'libx264',
      'mkv': 'libx264',
      'm4v': 'libx264',
      '3gp': 'libx264',
      'ts': 'libx264',
      'avi': 'mpeg4',
      'webm': 'libvpx-vp9',
      'flv': 'libx264',
      'mpg': 'mpeg2video',
      'mpeg': 'mpeg2video',
      'hevc': 'libx265',
    };

    const videoFormats = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv', '3gp', 'm4v', 'mpg', 'mpeg', 'ogv', 'ts', 'mts', 'm2ts'];

    if (targetFormat === 'gif') {
      command.outputOptions([
        '-vf', 'fps=10,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
      ]);
    }

    const audioCodec = audioCodecMap[targetFormat];
    const videoCodec = videoCodecMap[targetFormat];

    if (videoFormats.includes(targetFormat)) {
      command.toFormat(targetFormat);
    }

    if (audioCodec) command.audioCodec(audioCodec);
    if (videoCodec) command.videoCodec(videoCodec);

    command
      .on('start', () => onProgress?.(5))
      .on('progress', (info) => {
        if (info.percent) onProgress?.(Math.round(info.percent));
      })
      .on('end', () => {
        onProgress?.(100);
        resolve();
      })
      .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
      .save(outputPath);
  });
}

async function convertDocumentToPdf(inputPath, outputPath, onProgress) {
  const ext = path.extname(inputPath).toLowerCase().replace('.', '');
  onProgress?.(10);

  if (ext === 'pdf') {
    fs.copyFileSync(inputPath, outputPath);
    onProgress?.(100);
    return;
  }

  const doc = new PDFDocument({ autoFirstPage: false });
  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);

  if (ext === 'txt') {
    const content = fs.readFileSync(inputPath, 'utf-8');
    const lines = content.split('\n');
    doc.addPage();
    doc.fontSize(11);
    for (const line of lines) {
      doc.text(line);
    }
  } else if (ext === 'docx' || ext === 'doc') {
    const result = await mammoth.convertToHtml({ path: inputPath });
    const html = result.value;
    const lines = html.replace(/<[^>]+>/g, '').split('\n');
    doc.addPage();
    doc.fontSize(11);
    for (const line of lines) {
      if (line.trim()) doc.text(line.trim());
    }
  }

  doc.end();
  await new Promise((resolve) => writeStream.on('finish', resolve));
  onProgress?.(100);
}

async function convertDocumentToTxt(inputPath, outputPath, onProgress) {
  const ext = path.extname(inputPath).toLowerCase().replace('.', '');
  onProgress?.(10);

  if (ext === 'txt') {
    fs.copyFileSync(inputPath, outputPath);
  } else if (ext === 'pdf') {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(fs.readFileSync(inputPath));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => item.str).join(' '));
    }
    fs.writeFileSync(outputPath, pages.join('\n'), 'utf-8');
  } else if (ext === 'docx' || ext === 'doc') {
    const result = await mammoth.extractRawText({ path: inputPath });
    fs.writeFileSync(outputPath, result.value, 'utf-8');
  }

  onProgress?.(100);
}

function getAssimpjs() {
  if (!getAssimpjs.instance) {
    getAssimpjs.instance = require('assimpjs')().then(mod => {
      getAssimpjs.instance = mod;
      return mod;
    });
  }
  return Promise.resolve(getAssimpjs.instance);
}

async function convertModel3dToGltf(inputPath, outputPath, targetFormat, onProgress) {
  onProgress?.(10);

  const assimpFormat = targetFormat === 'glb' ? 'glb2' : 'gltf2';
  const fileName = path.basename(inputPath);
  const inputDir = path.dirname(inputPath);

  const ajs = await getAssimpjs();
  onProgress?.(30);

  const result = ajs.ConvertFile(
    fileName,
    assimpFormat,
    new Uint8Array(fs.readFileSync(inputPath)),
    (existsName) => fs.existsSync(path.join(inputDir, existsName)),
    (readName) => fs.readFileSync(path.join(inputDir, readName)),
  );
  onProgress?.(70);

  if (!result.IsSuccess()) {
    throw new Error(`3D conversion failed: ${result.GetErrorCode()}`);
  }

  if (targetFormat === 'glb') {
    const buf = Buffer.from(result.GetFile(0).GetContent());
    fs.writeFileSync(outputPath, buf);
  } else {
    for (let i = 0; i < result.FileCount(); i++) {
      const rf = result.GetFile(i);
      const outFile = i === 0 ? outputPath : path.join(path.dirname(outputPath), rf.GetPath());
      fs.writeFileSync(outFile, Buffer.from(rf.GetContent()));
    }
  }

  onProgress?.(100);
}

async function convertModel3dToStl(inputPath, outputPath, onProgress) {
  onProgress?.(10);

  const fileName = path.basename(inputPath);
  const inputDir = path.dirname(inputPath);

  const ajs = await getAssimpjs();
  onProgress?.(30);

  const result = ajs.ConvertFile(
    fileName,
    'assjson',
    new Uint8Array(fs.readFileSync(inputPath)),
    (existsName) => fs.existsSync(path.join(inputDir, existsName)),
    (readName) => fs.readFileSync(path.join(inputDir, readName)),
  );
  onProgress?.(60);

  if (!result.IsSuccess()) {
    throw new Error(`3D conversion failed: ${result.GetErrorCode()}`);
  }

  const jsonStr = new TextDecoder().decode(result.GetFile(0).GetContent());
  const scene = JSON.parse(jsonStr);
  onProgress?.(70);

  let stlContent = '';
  for (const mesh of scene.meshes) {
    const verts = mesh.vertices;
    const faces = mesh.faces;

    for (const face of faces) {
      const i0 = face[0] * 3, i1 = face[1] * 3, i2 = face[2] * 3;
      const v0 = [verts[i0], verts[i0 + 1], verts[i0 + 2]];
      const v1 = [verts[i1], verts[i1 + 1], verts[i1 + 2]];
      const v2 = [verts[i2], verts[i2 + 1], verts[i2 + 2]];

      const ax = v1[0] - v0[0], ay = v1[1] - v0[1], az = v1[2] - v0[2];
      const bx = v2[0] - v0[0], by = v2[1] - v0[1], bz = v2[2] - v0[2];
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 0) { nx /= len; ny /= len; nz /= len; }

      stlContent += `  facet normal ${nx.toFixed(6)} ${ny.toFixed(6)} ${nz.toFixed(6)}\n`;
      stlContent += `    outer loop\n`;
      stlContent += `      vertex ${v0[0].toFixed(6)} ${v0[1].toFixed(6)} ${v0[2].toFixed(6)}\n`;
      stlContent += `      vertex ${v1[0].toFixed(6)} ${v1[1].toFixed(6)} ${v1[2].toFixed(6)}\n`;
      stlContent += `      vertex ${v2[0].toFixed(6)} ${v2[1].toFixed(6)} ${v2[2].toFixed(6)}\n`;
      stlContent += `    endloop\n`;
      stlContent += `  endfacet\n`;
    }
  }

  const solidName = path.basename(inputPath, path.extname(inputPath));
  const stl = `solid ${solidName}\n${stlContent}endsolid ${solidName}\n`;
  fs.writeFileSync(outputPath, stl);
  onProgress?.(100);
}

async function convertAnimation(inputPath, outputPath, targetFormat, onProgress) {
  onProgress?.(10);

  let json;
  let width = 512;
  let height = 512;
  let fps = 30;

  if (path.extname(inputPath).toLowerCase() === '.lottie') {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(inputPath);
    const entries = zip.getEntries();
    const jsonEntry = entries.find(e => e.entryName.match(/\.json$/));
    if (!jsonEntry) throw new Error('No JSON found in .lottie file');
    json = JSON.parse(jsonEntry.getData().toString('utf-8'));
  } else {
    json = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  }

  if (json.w) width = json.w;
  if (json.h) height = json.h;
  if (json.fr) fps = json.fr;

  onProgress?.(20);

  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lottie-'));
  try {
    let BrowserWindow, ipcMain;
    try {
      ({ BrowserWindow, ipcMain } = require('electron'));
    } catch {
      throw new Error('Lottie conversion requires Electron (not available in Node.js only mode)');
    }
    const win = new BrowserWindow({
      show: false,
      width: Math.min(width, 1920),
      height: Math.min(height, 1080),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false,
      },
    });

    await win.loadFile(path.join(__dirname, 'anim-renderer.html'));

    const progCb = onProgress;
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        ipcMain.removeAllListeners('lottie-progress');
        ipcMain.removeAllListeners('lottie-render-done');
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Lottie render timed out'));
      }, 300000);

      ipcMain.on('lottie-progress', (_e, data) => {
        const pct = 20 + Math.round((data.frame / data.total) * 70);
        progCb?.(Math.min(pct, 90));
      });
      ipcMain.once('lottie-render-done', () => {
        clearTimeout(timeout);
        cleanup();
        setTimeout(() => win.close(), 100);
        resolve();
      });

      win.webContents.send('render-lottie', { json, width, height, fps, outputDir: tmpDir });
    });

    onProgress?.(90);

    await new Promise((resolve, reject) => {
      const cmd = ffmpeg(path.join(tmpDir, 'frame_%06d.png'))
        .inputFPS(fps);

      if (targetFormat === 'gif') {
        cmd.outputOptions(['-vf', 'fps=10,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse']);
      }

      const audioCodecMap = {
        'mp4': 'aac',
        'webm': 'libopus',
      };
      const videoCodecMap = {
        'mp4': 'libx264',
        'gif': null,
        'webm': 'libvpx-vp9',
      };

      if (videoCodecMap[targetFormat]) cmd.videoCodec(videoCodecMap[targetFormat]);
      if (audioCodecMap[targetFormat]) cmd.audioCodec(audioCodecMap[targetFormat]);

      if (targetFormat === 'mp4' || targetFormat === 'webm') {
        cmd.toFormat(targetFormat);
      }

      cmd
        .on('start', () => onProgress?.(92))
        .on('progress', (info) => {
          if (info.percent) onProgress?.(92 + Math.round(info.percent * 0.08));
        })
        .on('end', () => { onProgress?.(100); resolve(); })
        .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
        .save(outputPath);
    });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { convertFile, getFormatInfo };
