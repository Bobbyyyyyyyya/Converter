const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const PDFDocument = require('pdfkit');
const mammoth = require('mammoth');

const ffmpegPath = process.env.FFMPEG_PATH || findSystemFfmpeg() || resolveInstallerPath();
ffmpeg.setFfmpegPath(ffmpegPath);

function resolveInstallerPath() {
  let p = require('@ffmpeg-installer/ffmpeg').path;
  if (p.includes('.asar' + path.sep)) {
    const unpacked = p.replace('.asar' + path.sep, '.asar.unpacked' + path.sep);
    try { if (fs.statSync(unpacked).isFile()) p = unpacked; } catch {}
  }
  return p;
}

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
    'heic', 'heif', 'jp2', 'svg', 'apng', 'jxl', 'psd', 'ico', 'hdr', 'exr',
    'tga', 'dds', 'ppm', 'pgm', 'pbm', 'pnm', 'qoi',
    // RAW photo formats (via sharp/ffmpeg fallback)
    'cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2', 'rwl', 'pef', 'srw', '3fr', 'ari',
  ],
  audio: [
    'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'm4b', 'wma',
    'opus', 'aiff', 'aif', 'alac', 'ac3', 'amr', 'mp2', 'wv', 'mka', 'caf', 'dts', 'au', 'tta',
  ],
  video: [
    'mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv',
    '3gp', 'm4v', 'mpg', 'mpeg', 'ogv', 'ts', 'mts', 'm2ts', 'm2v', 'mxf', 'roq', 'nut', 'dv', 'rm', 'rmvb',
    'hevc', 'h264', 'h265', 'av1', 'vp9', 'gif', 'webp', 'apng',
  ],
  document: [
    'pdf', 'txt', 'docx', 'doc', 'rtf', 'html', 'htm', 'md', 'markdown', 'csv', 'json', 'xml', 'yaml', 'yml',
    'epub', 'odt', 'ods', 'odp', 'xls', 'xlsx', 'ppt', 'pptx', 'tex', 'rst', 'log', 'ini', 'conf',
  ],
  model3d: [
    // Classic assimp + CAD + SketchUp + USD + BIM
    '3ds', '3mf', 'ac', 'amf', 'ase', 'assbin', 'b3d', 'blend', 'bvh', 'cob', 'csm', 'dae', 'dxf', 'dwg', 'dwf', 'dwfx',
    'fbx', 'gltf', 'glb', 'hmp', 'ifc', 'irr', 'irrmesh', 'lwo', 'lxo', 'lws', 'md2', 'md3', 'md5mesh', 'mdc', 'mdl',
    'ms3d', 'ndo', 'nff', 'obj', 'off', 'ogex', 'ply', 'pmx', 'prj', 'q3d', 'q3o', 'q3s', 'raw', 'sib', 'smd', 'stl',
    'stp', 'step', 'ter', 'usd', 'usda', 'usdc', 'usdz', 'vrm', 'x', 'x3d', 'xgl', 'zgl', '3dm', 'brep', 'c4d',
    // SketchUp
    'skp', 'skb',
  ],
  archive: [
    'zip', 'jar', 'war', 'ear', 'apk', 'aab', 'tar', 'tgz', 'gz', 'bz2', 'xz', '7z', 'rar', 'cab', 'iso', 'lz', 'lzma', 'z',
  ],
  animation: [
    'lottie',
  ],
};

const TYPE_MAP = {};
const TARGETS_CACHE = {};
for (const [type, exts] of Object.entries(SUPPORTED)) {
  for (const ext of exts) TYPE_MAP[ext] = type;
}

function getFormatInfo(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const type = TYPE_MAP[ext] || 'unknown';
  // Special case: GIF can convert to both image and video targets (animated support)
  if (ext === 'gif') {
    const cacheKey = 'gif';
    if (!TARGETS_CACHE[cacheKey]) {
      const imageTargets = getTargetsForType('image');
      const videoTargets = getTargetsForType('video');
      // Combined unique, keep image targets first then video extras, plus apng/webp
      const combined = [...new Set([...imageTargets, ...videoTargets, 'apng', 'webp', 'avif'])];
      TARGETS_CACHE[cacheKey] = combined;
    }
    return { ext, type, validTargets: TARGETS_CACHE[cacheKey] };
  }
  // DWF/DWFX: geen 3D-geometrie via assimp, maar wel converteerbaar naar
  // beeld/PDF via de ingebedde raster-previews per sheet (cad-preview).
  if (ext === 'dwf' || ext === 'dwfx') {
    const cacheKey = 'dwf';
    if (!TARGETS_CACHE[cacheKey]) {
      TARGETS_CACHE[cacheKey] = ['png', 'jpg', 'jpeg', 'pdf'];
    }
    return { ext, type, validTargets: TARGETS_CACHE[cacheKey] };
  }
  const validTargets = TARGETS_CACHE[type] || (TARGETS_CACHE[type] = getTargetsForType(type));
  return { ext, type, validTargets };
}

function getTargetsForType(type) {
  switch (type) {
    case 'image':
      return ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'avif', 'heic', 'heif', 'jp2', 'jxl', 'apng', 'pdf', 'ico', 'hdr'];
    case 'audio':
      return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'm4b', 'opus', 'aiff', 'ac3', 'mp2', 'wv', 'mka', 'caf'];
    case 'video':
      return ['mp4', 'avi', 'mov', 'mkv', 'webm', 'gif', 'webp', 'apng', '3gp', 'm4v', 'mpg', 'ogv', 'ts', 'hevc', 'mxf'];
    case 'document':
      return ['pdf', 'txt', 'html', 'md', 'csv', 'json', 'rtf'];
    case 'model3d':
      return ['gltf', 'glb', 'stl', 'obj', 'ply', 'fbx', 'dae', 'dxf', 'usd', 'usda', 'ifc'];
    case 'archive':
      return ['zip', 'tar', 'tgz', 'gz', 'bz2', 'xz', '7z', 'jar'];
    case 'animation':
      return ['mp4', 'gif', 'webp'];
    default:
      return [];
  }
}

async function convertFile(inputPath, outputPath, targetFormat, onProgress) {
  const resolvedInput = path.resolve(inputPath);
  const resolvedOutput = path.resolve(outputPath);
  let useTmpOutput = false;
  if (resolvedInput === resolvedOutput) {
    outputPath = outputPath + '.tmp_convert';
    useTmpOutput = true;
  }

  const ext = path.extname(inputPath).toLowerCase().replace('.', '');
  const type = TYPE_MAP[ext];

  // Special handling for GIF: preserve animation via FFmpeg when target is video/animated
  if (ext === 'gif') {
    const videoLikeTargets = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv', '3gp', 'm4v', 'mpg', 'mpeg', 'ogv', 'ts', 'mts', 'm2ts', 'webp', 'apng', 'gif'];
    const imageOnlyTargets = ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'avif', 'heic', 'heif', 'jp2', 'pdf', 'svg'];
    if (targetFormat === 'pdf') {
      await convertImageToPdf(inputPath, outputPath, onProgress);
    } else if (videoLikeTargets.includes(targetFormat)) {
      // GIF -> video/animated: use FFmpeg to preserve animation and handle palette correctly
      // For gif -> gif (optimize) or gif -> webp/apng, FFmpeg preserves animation
      // For gif -> mp4/webm, FFmpeg decodes gif correctly
      const isSameGif = targetFormat === 'gif';
      if (isSameGif) {
        // Check if animated: if so use FFmpeg palette path, otherwise sharp is fine but use FFmpeg for consistency
        try {
          const meta = await sharp(inputPath, { animated: true }).metadata();
          const isAnimated = meta.pages && meta.pages > 1;
          if (isAnimated) {
            await convertGifAnimated(inputPath, outputPath, targetFormat, onProgress);
            return;
          }
        } catch {}
      }
      // For gif->video/webp/apng/gif(optim) use FFmpeg
      if (['gif', 'webp', 'apng'].includes(targetFormat) || videoLikeTargets.includes(targetFormat)) {
        // Use FFmpeg for animated handling; for gif->gif with single frame sharp would also work but FFmpeg handles both
        const needsFfmpeg = targetFormat !== 'jpg' && targetFormat !== 'jpeg' && targetFormat !== 'png' && targetFormat !== 'bmp' && targetFormat !== 'tiff';
        if (needsFfmpeg) {
          await convertFFmpeg(inputPath, outputPath, targetFormat, onProgress);
          return;
        }
      }
      await convertImage(inputPath, outputPath, targetFormat, onProgress);
    } else if (imageOnlyTargets.includes(targetFormat)) {
      await convertImage(inputPath, outputPath, targetFormat, onProgress);
    } else {
      throw new Error(`Unsupported target format for GIF: ${targetFormat}`);
    }
    return;
  }

  if (type === 'image') {
    if (targetFormat === 'pdf') {
      await convertImageToPdf(inputPath, outputPath, onProgress);
    } else {
      await convertImage(inputPath, outputPath, targetFormat, onProgress);
    }
  } else if (type === 'audio' || type === 'video') {
    await convertFFmpeg(inputPath, outputPath, targetFormat, onProgress);
  } else if (type === 'document') {
    // Expanded document handling: pdf, txt, html, md, csv, json, rtf, etc.
    const docTargets = ['pdf', 'txt', 'html', 'md', 'csv', 'json', 'rtf'];
    if (!docTargets.includes(targetFormat)) throw new Error(`Unsupported target format for document: ${targetFormat}`);
    if (targetFormat === 'pdf') {
      await convertDocumentToPdf(inputPath, outputPath, onProgress);
    } else if (['txt', 'md', 'csv', 'json', 'html', 'rtf', 'yaml', 'yml', 'xml'].includes(targetFormat)) {
      await convertDocumentToTxt(inputPath, outputPath, onProgress, targetFormat);
    } else {
      await convertDocumentToTxt(inputPath, outputPath, onProgress);
    }
  } else if (type === 'model3d') {
    // SketchUp SKP/SKB via openskp (native, no assimp)
    if (ext === 'skp' || ext === 'skb') {
      await convertSketchup(inputPath, outputPath, targetFormat, onProgress);
      return;
    }
    // DWG -> DXF direct via LibreDWG WASM (assimp heeft geen DXF-exporter,
    // dus niet via de generieke DXF->DXF assimp-route laten lopen)
    if (ext === 'dwg' && targetFormat === 'dxf') {
      await convertDwgToDxf(inputPath, outputPath, onProgress);
      return;
    }
    // DWF/DWFX -> beeld/PDF via ingebedde sheet-previews (geen assimp)
    if (ext === 'dwf' || ext === 'dwfx') {
      await convertDwf(inputPath, outputPath, targetFormat, onProgress);
      return;
    }
    // DXF -> DXF is gewoon kopiëren
    if (ext === 'dxf' && targetFormat === 'dxf') {
      const src = path.resolve(inputPath);
      const dst = path.resolve(outputPath);
      if (src !== dst) fs.copyFileSync(inputPath, outputPath);
      onProgress?.(100);
      return;
    }
    const modelTargets = ['gltf', 'glb', 'stl', 'obj', 'ply', 'fbx', 'dae', 'dxf', 'usd', 'usda', 'ifc', '3dm', 'step', 'stp', 'iges', 'igs'];
    if (['gltf', 'glb'].includes(targetFormat)) {
      await convertModel3dToGltf(inputPath, outputPath, targetFormat, onProgress);
    } else if (targetFormat === 'stl') {
      await convertModel3dToStl(inputPath, outputPath, onProgress);
    } else if (modelTargets.includes(targetFormat)) {
      // For now use assimp generic path via gltf as intermediate where possible
      // Direct obj/ply/fbx export via assimpj's ConvertFile with that format
      await convertModel3dGeneric(inputPath, outputPath, targetFormat, onProgress);
    } else {
      throw new Error(`Unsupported target format for model3d: ${targetFormat}`);
    }
  } else if (type === 'archive') {
    await convertArchive(inputPath, outputPath, targetFormat, onProgress);
  } else if (type === 'animation') {
    await convertAnimation(inputPath, outputPath, targetFormat, onProgress);
  } else {
    throw new Error(`Unsupported file type: .${ext}`);
  }

  if (useTmpOutput) {
    fs.renameSync(outputPath, resolvedOutput);
  }
}

async function convertGifAnimated(inputPath, outputPath, targetFormat, onProgress) {
  // Dedicated handler for animated GIF optimization/re-encode
  if (targetFormat === 'gif') {
    // Optimize animated GIF via FFmpeg with palettegen
    return convertFFmpeg(inputPath, outputPath, 'gif', onProgress);
  }
  return convertFFmpeg(inputPath, outputPath, targetFormat, onProgress);
}

async function convertImage(inputPath, outputPath, targetFormat, onProgress) {
  onProgress?.(10);

  // Handle APNG/WebP animated via FFmpeg if input is GIF (sharp can't write APNG)
  if (targetFormat === 'apng') {
    // Use FFmpeg for APNG (animated PNG) - treat as video
    await convertFFmpeg(inputPath, outputPath, 'apng', onProgress);
    return;
  }

  // For RAW, PSD, HDR, etc. sharp may not support input -> fallback to FFmpeg
  const rawInputs = ['cr2','cr3','nef','arw','dng','raf','orf','rw2','rwl','pef','srw','psd','hdr','exr','dds'];
  const extInRaw = path.extname(inputPath).toLowerCase().replace('.','');
  if (rawInputs.includes(extInRaw)) {
    try {
      // Try sharp first, if fails will catch below
      const test = sharp(inputPath);
      await test.metadata();
    } catch {
      // Fallback via FFmpeg for RAW -> image: ffmpeg can decode many raw via libraw? Try ffmpeg path
      const ffmpegImageTargets = ['jpg','jpeg','png','webp','tiff','bmp','avif','heic','jp2','jxl'];
      if (ffmpegImageTargets.includes(targetFormat)) {
        await convertFFmpeg(inputPath, outputPath, targetFormat, onProgress);
        return;
      }
      // If ffmpeg target not suitable, still try ffmpeg generic
      throw new Error(`RAW image .${extInRaw} conversie mislukt: sharp ondersteunt dit RAW niet, probeer via externe tool (RawTherapee) naar JPG/PNG te exporteren`);
    }
  }

  let pipeline = sharp(inputPath, { animated: false });

  // Handle SVG input: sharp can rasterize, need density
  const extIn = path.extname(inputPath).toLowerCase();
  if (extIn === '.svg') {
    pipeline = sharp(inputPath, { density: 300 });
  }

  let metadata;
  try {
    metadata = await pipeline.metadata();
  } catch (e) {
    // Fallback to ffmpeg for unsupported input types (e.g., JXL if libvips lacks, ICO)
    const fallbackTargets = ['jpg','jpeg','png','webp','tiff','bmp','gif','avif','jp2','jxl'];
    if (fallbackTargets.includes(targetFormat)) {
      await convertFFmpeg(inputPath, outputPath, targetFormat, onProgress);
      return;
    }
    throw e;
  }
  const hasAlpha = metadata.channels === 4 || metadata.hasAlpha;

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
    // Single-frame GIF via sharp (animated GIF handled via FFmpeg path above)
    try {
      const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
      const processed = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
      await processed.gif({ loop: 0 }).toFile(outputPath);
    } catch (e) {
      // Fallback: use FFmpeg for any sharp failure (e.g., palette issues)
      await convertFFmpeg(inputPath, outputPath, 'gif', onProgress);
      return;
    }
    onProgress?.(100);
    return;
  } else if (targetFormat === 'avif') {
    pipeline = pipeline.avif({ quality: 80 });
  } else if (targetFormat === 'heic' || targetFormat === 'heif') {
    pipeline = pipeline.heif({ compression: 'hevc', quality: 85 });
  } else if (targetFormat === 'jp2') {
    pipeline = pipeline.jp2({ quality: 85 });
  } else if (targetFormat === 'jxl') {
    if (typeof pipeline.jxl === 'function') pipeline = pipeline.jxl({ quality: 85 });
    else if (typeof pipeline.jpegxl === 'function') pipeline = pipeline.jpegxl({ quality: 85 });
    else {
      // Fallback via FFmpeg for JXL
      await convertFFmpeg(inputPath, outputPath, 'jxl', onProgress);
      return;
    }
  } else if (targetFormat === 'ico') {
    // ICO via sharp not fully supported, use PNG intermediate then fallback; for now use ffmpeg or sharp resize to png and use sharp's ico? sharp can output ico via? fallback to png with ico ext warning
    pipeline = pipeline.png();
  } else if (targetFormat === 'hdr') {
    throw new Error('HDR output niet ondersteund voor raster images - gebruik EXR of PNG');
  } else if (targetFormat === 'svg') {
    throw new Error('SVG output not supported for raster images - use PNG or PDF instead');
  } else {
    throw new Error(`Unsupported image format: ${targetFormat}`);
  }

  onProgress?.(50);
  try {
    await pipeline.toFile(outputPath);
  } catch (e) {
    // Last resort fallback via FFmpeg for image->image if sharp fails (e.g., unsupported RAW input)
    const ffmpegFallbackTargets = ['jpg','jpeg','png','webp','tiff','bmp','gif','avif','jp2','jxl'];
    if (ffmpegFallbackTargets.includes(targetFormat)) {
      await convertFFmpeg(inputPath, outputPath, targetFormat, onProgress);
      return;
    }
    throw e;
  }
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
      'webp': 'libwebp',
      'apng': 'apng',
      'flv': 'libx264',
      'mpg': 'mpeg2video',
      'mpeg': 'mpeg2video',
      'hevc': 'libx265',
    };

    const videoFormats = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv', '3gp', 'm4v', 'mpg', 'mpeg', 'ogv', 'ts', 'mts', 'm2ts', 'webp', 'apng'];

    if (targetFormat === 'gif') {
      // Detect if input is GIF: keep original fps if possible, higher quality palette
      const isGifInput = path.extname(inputPath).toLowerCase() === '.gif';
      if (isGifInput) {
        command.outputOptions([
          '-vf', 'split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5',
        ]);
      } else {
        command.outputOptions([
          '-vf', 'fps=15,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer',
        ]);
      }
    } else if (targetFormat === 'webp') {
      // Animated webp support - keep as much as possible
      command.outputOptions(['-loop', '0']);
      if (!videoCodecMap[targetFormat]) command.videoCodec('libwebp');
    } else if (targetFormat === 'apng') {
      command.outputOptions(['-plays', '0']);
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

  const addTextToPdf = (text) => {
    doc.addPage();
    doc.fontSize(11);
    const lines = text.split('\n');
    for (const line of lines) {
      // Simple pagination: if near bottom, add new page
      if (doc.y > doc.page.height - 50) doc.addPage();
      doc.text(line || ' ', { width: doc.page.width - 40 });
    }
  };

  if (ext === 'txt' || ext === 'log' || ext === 'ini' || ext === 'conf' || ext === 'csv' || ext === 'json' || ext === 'xml' || ext === 'yaml' || ext === 'yml' || ext === 'tex' || ext === 'rst') {
    const content = fs.readFileSync(inputPath, 'utf-8');
    addTextToPdf(content);
  } else if (ext === 'md' || ext === 'markdown') {
    let content = fs.readFileSync(inputPath, 'utf-8');
    // Basic markdown stripping for PDF: remove # headers, * bold, etc. but keep text
    content = content.replace(/^#+\s/gm, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/`([^`]+)`/g, '$1');
    addTextToPdf(content);
  } else if (ext === 'html' || ext === 'htm') {
    const html = fs.readFileSync(inputPath, 'utf-8');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    addTextToPdf(text);
  } else if (ext === 'rtf') {
    // Basic RTF to text: strip {\rtf, \par -> newline, remove \ commands
    const rtf = fs.readFileSync(inputPath, 'utf-8');
    const text = rtf.replace(/\\par\b/g, '\n').replace(/\\[a-z]+\d*\s?/gi, '').replace(/[{}]/g, '').trim();
    addTextToPdf(text);
  } else if (ext === 'docx' || ext === 'doc') {
    const result = await mammoth.convertToHtml({ path: inputPath });
    const html = result.value;
    const lines = html.replace(/<[^>]+>/g, '').split('\n');
    doc.addPage();
    doc.fontSize(11);
    for (const line of lines) {
      if (line.trim()) {
        if (doc.y > doc.page.height - 50) doc.addPage();
        doc.text(line.trim());
      }
    }
  } else if (['odt', 'ods', 'odp', 'xls', 'xlsx', 'ppt', 'pptx', 'epub'].includes(ext)) {
    throw new Error(`.${ext} direct naar PDF conversie vereist LibreOffice (niet gebundeld). Tip: open in LibreOffice en exporteer als PDF, of converteer eerst naar DOCX/TXT.`);
  } else {
    // Fallback: try to read as utf8
    try {
      const content = fs.readFileSync(inputPath, 'utf-8');
      addTextToPdf(content);
    } catch {
      throw new Error(`Onbekend document type .${ext} voor PDF export`);
    }
  }

  doc.end();
  await new Promise((resolve) => writeStream.on('finish', resolve));
  onProgress?.(100);
}

async function convertDocumentToTxt(inputPath, outputPath, onProgress, targetExt = 'txt') {
  const ext = path.extname(inputPath).toLowerCase().replace('.', '');
  onProgress?.(10);

  if (ext === 'txt' || ext === targetExt) {
    // Same or plain text -> copy or re-encode
    if (ext === targetExt) {
      fs.copyFileSync(inputPath, outputPath);
    } else {
      const content = fs.readFileSync(inputPath, 'utf-8');
      fs.writeFileSync(outputPath, content, 'utf-8');
    }
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
    const text = pages.join('\n');
    // Format output based on target
    if (targetExt === 'html') {
      const html = `<!DOCTYPE html><html><body><pre>${text.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</pre></body></html>`;
      fs.writeFileSync(outputPath, html, 'utf-8');
    } else if (targetExt === 'json') {
      fs.writeFileSync(outputPath, JSON.stringify({ text }, null, 2), 'utf-8');
    } else if (targetExt === 'csv') {
      // Simple: each line as quoted CSV row
      const csv = text.split('\n').map(l => `"${l.replace(/"/g,'""')}"`).join('\n');
      fs.writeFileSync(outputPath, csv, 'utf-8');
    } else {
      fs.writeFileSync(outputPath, text, 'utf-8');
    }
  } else if (ext === 'docx' || ext === 'doc') {
    const result = await mammoth.extractRawText({ path: inputPath });
    const text = result.value;
    if (targetExt === 'html') {
      const htmlRes = await mammoth.convertToHtml({ path: inputPath });
      fs.writeFileSync(outputPath, htmlRes.value, 'utf-8');
    } else if (targetExt === 'json') {
      fs.writeFileSync(outputPath, JSON.stringify({ text }, null, 2), 'utf-8');
    } else {
      fs.writeFileSync(outputPath, text, 'utf-8');
    }
  } else if (['html', 'htm', 'md', 'markdown', 'csv', 'json', 'xml', 'yaml', 'yml', 'rtf', 'txt', 'log', 'ini', 'conf', 'tex', 'rst'].includes(ext)) {
    let content = fs.readFileSync(inputPath, 'utf-8');
    // Normalize conversions
    if (ext === 'html' || ext === 'htm') {
      if (targetExt === 'txt' || targetExt === 'md') {
        content = content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
      }
    } else if (ext === 'md' || ext === 'markdown') {
      if (targetExt === 'html') {
        // Very basic md -> html
        content = content.replace(/^### (.*$)/gm, '<h3>$1</h3>').replace(/^## (.*$)/gm, '<h2>$1</h2>').replace(/^# (.*$)/gm, '<h1>$1</h1>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>').replace(/\n/g, '<br>');
        content = `<!DOCTYPE html><html><body>${content}</body></html>`;
      }
    } else if (ext === 'rtf') {
      content = content.replace(/\\par\b/g, '\n').replace(/\\[a-z]+\d*\s?/gi, '').replace(/[{}]/g, '').trim();
    } else if (ext === 'json' && targetExt === 'csv') {
      try {
        const obj = JSON.parse(content);
        const arr = Array.isArray(obj) ? obj : [obj];
        const keys = Object.keys(arr[0] || {});
        let csv = keys.join(',') + '\n';
        for (const row of arr) csv += keys.map(k => `"${String(row[k] ?? '').replace(/"/g,'""')}"`).join(',') + '\n';
        content = csv;
      } catch {}
    } else if (ext === 'csv' && targetExt === 'json') {
      // csv -> json
      const lines = content.split('\n').filter(Boolean);
      const headers = lines[0]?.split(',').map(h=>h.trim().replace(/^"|"$/g,'')) || [];
      const rows = lines.slice(1).map(l=>{
        const cols = l.split(',').map(c=>c.trim().replace(/^"|"$/g,''));
        const o={};
        headers.forEach((h,i)=> o[h]=cols[i]);
        return o;
      });
      content = JSON.stringify(rows, null, 2);
    }
    // Ensure target formatting
    if (targetExt === 'json' && ext !== 'json') {
      // Wrap plain text as json if target json and not already handled
      if (!content.trim().startsWith('{') && !content.trim().startsWith('[')) {
        content = JSON.stringify({ text: content }, null, 2);
      }
    }
    fs.writeFileSync(outputPath, content, 'utf-8');
  } else if (['odt', 'ods', 'odp', 'xls', 'xlsx', 'ppt', 'pptx', 'epub'].includes(ext)) {
    throw new Error(`.${ext} naar ${targetExt} conversie vereist LibreOffice (niet gebundeld). Open in LibreOffice en exporteer als PDF/TXT.`);
  } else {
    // Fallback binary -> try utf8
    try {
      const content = fs.readFileSync(inputPath, 'utf-8');
      fs.writeFileSync(outputPath, content, 'utf-8');
    } catch (e) {
      throw new Error(`Onbekend document type .${ext} voor ${targetExt} export`);
    }
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

// ---- AutoCAD / CAD helpers ----
async function prepareCadInput(inputPath, onProgress) {
  const ext = path.extname(inputPath).toLowerCase().replace('.', '');
  const baseName = path.basename(inputPath, path.extname(inputPath));

  if (ext === 'dwg') {
    onProgress?.(15);
    // Use dwg2dxf-converter (WASM LibreDWG) to convert DWG -> DXF in tmp
    let converter;
    try {
      converter = require('dwg2dxf-converter');
    } catch (e) {
      throw new Error('DWG support requires dwg2dxf-converter. Run npm install. Als fallback: open in AutoCAD en sla op als DXF (versie 2000/2018).');
    }
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cad-dwg-'));
    const dxfPath = path.join(tmpDir, baseName + '.dxf');
    onProgress?.(20);
    const result = await converter.convertDwgToDxf(inputPath, dxfPath, { timeout: 30000 });
    if (!result.success) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      throw new Error(`DWG conversie mislukt: ${result.error || 'onbekende fout'} - probeer DWG in AutoCAD als DXF op te slaan`);
    }
    onProgress?.(45);
    const dxfData = fs.readFileSync(dxfPath);
    // Cleanup after reading, but keep data
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    return { buffer: new Uint8Array(dxfData), fileName: baseName + '.dxf', originalPath: inputPath };
  }

  if (ext === 'dwf' || ext === 'dwfx') {
    // DWF/DWFX are Autodesk Design Web Format - not directly supported by assimp
    // Provide helpful error with workaround
    throw new Error(`.${ext} is een Autodesk Design Web Format. Sla het bestand in AutoCAD op als DWG of DXF, dan kan het geconverteerd worden naar GLTF/GLB/STL/OBJ/PLY. Directe ${ext.toUpperCase()} -> 3D conversie wordt niet ondersteund door assimp.`);
  }

  // For other CAD (dxf, etc) just return original buffer
  return { buffer: new Uint8Array(fs.readFileSync(inputPath)), fileName: path.basename(inputPath), originalPath: inputPath };
}

// ---- DWG -> DXF direct (LibreDWG WASM, zonder assimp) ----
async function convertDwgToDxf(inputPath, outputPath, onProgress) {
  onProgress?.(10);
  let converter;
  try {
    converter = require('dwg2dxf-converter');
  } catch (e) {
    throw new Error('DWG support requires dwg2dxf-converter. Run npm install. Als fallback: open in AutoCAD en sla op als DXF (versie 2000/2018).');
  }
  onProgress?.(30);
  const result = await converter.convertDwgToDxf(inputPath, outputPath, { timeout: 60000 });
  if (!result.success) {
    throw new Error(`DWG naar DXF mislukt: ${result.error || 'onbekende fout'} - probeer DWG in AutoCAD als DXF op te slaan`);
  }
  onProgress?.(100);
}

// ---- DWF/DWFX -> PNG/JPG/PDF via ingebedde sheet-previews ----
// NB: DWF met 3D-inhoud (W3D-streams) kan niet naar 3D geconverteerd worden:
// geen enkele gratis library (assimp incl.) leest W3D. Daarvoor blijft gelden:
// in AutoCAD exporteren als DWG/DXF (DWG/DXF -> GLTF/GLB/STL/OBJ werkt wel).
function dwfHas3DSections(buffer) {
  try {
    return buffer.indexOf('W3D') !== -1;
  } catch {
    return false;
  }
}

async function convertDwf(inputPath, outputPath, targetFormat, onProgress) {
  onProgress?.(10);
  const fmt = targetFormat.toLowerCase();
  let raw;
  try {
    raw = fs.readFileSync(inputPath);
  } catch (e) {
    throw new Error(`DWF lezen mislukt: ${e.message}`);
  }
  const has3D = dwfHas3DSections(raw);
  if (!['png', 'jpg', 'jpeg', 'pdf'].includes(fmt)) {
    throw new Error(
      has3D
        ? `Dit DWF bevat 3D-inhoud, maar DWF-3D (W3D) kan niet geconverteerd worden. Exporteer in AutoCAD als DWG en converteer daarna naar ${targetFormat.toUpperCase()}.`
        : `DWF ondersteunt alleen PNG, JPG en PDF als doel (gevraagd: ${targetFormat}). Voor 3D (GLTF/STL/OBJ): sla in AutoCAD op als DWG of DXF.`
    );
  }

  let previews;
  try {
    const { extractPreviews } = require('cad-preview');
    previews = extractPreviews(new Uint8Array(raw), { filename: path.basename(inputPath) }) || [];
  } catch (e) {
    throw new Error(`DWF lezen mislukt: ${e.message}`);
  }
  onProgress?.(40);

  if (previews.length === 0) {
    throw new Error(
      has3D
        ? 'Dit DWF bevat wel 3D-inhoud maar geen bruikbare previews. Exporteer in AutoCAD als DWG en converteer daarna verder.'
        : 'Geen previews gevonden in dit DWF-bestand. Sla het in AutoCAD op als DWG of DXF en converteer daarna verder.'
    );
  }

  const sheets = previews.map((p) => Buffer.from(p.data));
  onProgress?.(50);

  if (fmt === 'pdf') {
    // Eén PDF-pagina per sheet
    const doc = new PDFDocument({ autoFirstPage: false });
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);
    let i = 0;
    for (const buf of sheets) {
      i++;
      onProgress?.(50 + Math.round((i / sheets.length) * 45));
      const imgBuf = await sharp(buf).png().toBuffer();
      doc.addPage();
      doc.image(imgBuf, 0, 0, { fit: [doc.page.width, doc.page.height], align: 'center', valign: 'center' });
    }
    doc.end();
    await new Promise((resolve) => writeStream.on('finish', resolve));
    onProgress?.(100);
    return;
  }

  // Beeld-doel: 1 sheet direct, meerdere sheets verticaal aan elkaar plakken
  let srcBuf = sheets[0];
  if (sheets.length > 1) {
    const metas = await Promise.all(sheets.map((b) => sharp(b).metadata()));
    const maxW = Math.max(...metas.map((m) => m.width));
    const sumH = metas.reduce((s, m) => s + Math.round((m.height * maxW) / m.width), 0);
    const resized = await Promise.all(
      sheets.map((b) => sharp(b).resize({ width: maxW }).png().toBuffer())
    );
    let top = 0;
    const composite = resized.map((b, idx) => {
      const h = Math.round((metas[idx].height * maxW) / metas[idx].width);
      const item = { input: b, left: 0, top };
      top += h;
      return item;
    });
    srcBuf = await sharp({
      create: { width: maxW, height: sumH, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite(composite)
      .png()
      .toBuffer();
  }

  // Hergebruik de bestaande image-pipeline (jpg/webp-kwaliteit etc.)
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'dwf-'));
  const tmpPng = path.join(tmpDir, 'sheet.png');
  try {
    fs.writeFileSync(tmpPng, srcBuf);
    onProgress?.(70);
    await convertImage(tmpPng, outputPath, fmt === 'jpeg' ? 'jpg' : fmt, onProgress);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

// ---- SketchUp SKP/SKB via openskp ----
async function convertSketchup(inputPath, outputPath, targetFormat, onProgress) {
  onProgress?.(10);
  const ext = path.extname(inputPath).toLowerCase();
  const isSkb = ext === '.skb';
  const baseName = path.basename(inputPath, path.extname(inputPath));
  let skpPath = inputPath;
  let tmpSkp = null;

  if (isSkb) {
    // SKB is SketchUp backup - same format but different ext, copy to temp .skp
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'skp-skb-'));
    tmpSkp = path.join(tmpDir, baseName + '.skp');
    fs.copyFileSync(inputPath, tmpSkp);
    skpPath = tmpSkp;
    onProgress?.(15);
  }

  let openskp;
  try {
    openskp = require('openskp');
  } catch (e) {
    if (tmpSkp) try { fs.rmSync(path.dirname(tmpSkp), { recursive: true, force: true }); } catch {}
    throw new Error('SketchUp support requires openskp. Run npm install openskp. Als fallback: exporteer in SketchUp als DAE/OBJ/GLB.');
  }

  try {
    onProgress?.(20);
    // Build scene (triangulated, world-space)
    const scene = openskp.SkpFile.open(skpPath).buildScene();
    onProgress?.(50);

    const fmt = targetFormat.toLowerCase();
    // Direct exports via openskp
    if (fmt === 'glb') {
      const glb = openskp.toGLB(scene);
      fs.writeFileSync(outputPath, Buffer.from(glb));
    } else if (fmt === 'gltf') {
      // No direct glTF JSON export, write GLB and rename conceptually to glTF via JSON wrapper
      // We export GLB and also provide a JSON .gltf that references embedded buffer as base64
      const glb = openskp.toGLB(scene);
      // For .gltf we create a minimal glTF JSON with embedded base64 GLB binary as fallback -> just write GLB bytes with .gltf ext and warn
      // Better: write GLB bytes but with .gltf extension is still readable by many viewers as GLB
      // Instead we use GLB data as is; user requested glTF will get valid GLB (compatible)
      fs.writeFileSync(outputPath, Buffer.from(glb));
    } else if (fmt === 'stl') {
      const stlText = openskp.toSTLAscii(scene);
      fs.writeFileSync(outputPath, stlText, 'utf-8');
    } else if (fmt === 'obj') {
      const objText = openskp.toOBJ(scene, path.basename(outputPath, '.obj') + '.mtl');
      const mtlText = openskp.toMTL(scene);
      fs.writeFileSync(outputPath, objText, 'utf-8');
      // Write MTL sidecar
      const mtlPath = path.join(path.dirname(outputPath), path.basename(outputPath, path.extname(outputPath)) + '.mtl');
      fs.writeFileSync(mtlPath, mtlText, 'utf-8');
    } else if (fmt === 'ply') {
      const plyText = openskp.toPLYAscii(scene);
      fs.writeFileSync(outputPath, plyText, 'utf-8');
    } else if (fmt === 'dxf') {
      const dxfText = openskp.toDXF(scene);
      fs.writeFileSync(outputPath, dxfText, 'utf-8');
    } else if (fmt === 'ifc') {
      const ifcText = openskp.toIFC(scene);
      fs.writeFileSync(outputPath, ifcText, 'utf-8');
    } else if (fmt === 'json') {
      const jsonText = openskp.toJSON(scene);
      fs.writeFileSync(outputPath, typeof jsonText === 'string' ? jsonText : JSON.stringify(jsonText, null, 2), 'utf-8');
    } else if (['dae', 'fbx', 'usd', 'usda', '3dm', 'step', 'stp', 'iges', 'igs'].includes(fmt)) {
      // For other CAD formats, export GLB intermediate then use assimp generic path
      onProgress?.(60);
      const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'skp-assimp-'));
      const tmpGlb = path.join(tmpDir, baseName + '.glb');
      const glb = openskp.toGLB(scene);
      fs.writeFileSync(tmpGlb, Buffer.from(glb));
      onProgress?.(70);
      // Use assimp to convert GLB intermediate to target
      await convertModel3dGeneric(tmpGlb, outputPath, fmt, (p) => onProgress?.(70 + Math.round(p * 0.3)));
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    } else {
      throw new Error(`Unsupported SketchUp export format: ${targetFormat}. Ondersteund: glb, gltf, stl, obj, ply, dxf, ifc, json, dae, fbx`);
    }

    onProgress?.(100);
  } catch (err) {
    throw new Error(`SketchUp conversie mislukt: ${err.message} - probeer in SketchUp te exporteren als DAE/KMZ/OBJ`);
  } finally {
    if (tmpSkp) try { fs.rmSync(path.dirname(tmpSkp), { recursive: true, force: true }); } catch {}
  }
}

// ---- Archive (ZIP/JAR/TAR/GZ/7Z/RAR etc) ----
function checkCommand(cmd) {
  try { require('child_process').execSync(`which ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
}

async function extractArchive(inputPath, ext, tmpDir) {
  const normalized = ext.toLowerCase();
  const zipFamily = ['zip', 'jar', 'war', 'ear', 'apk', 'aab'];
  if (zipFamily.includes(normalized)) {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(inputPath);
    zip.extractAllTo(tmpDir, true);
    return;
  }
  if (normalized === 'tar') {
    const tar = require('tar');
    await tar.x({ file: inputPath, cwd: tmpDir });
    return;
  }
  if (normalized === 'tgz' || normalized === 'tar.gz') {
    const tar = require('tar');
    await tar.x({ file: inputPath, cwd: tmpDir });
    return;
  }
  if (normalized === 'gz') {
    // Single file gzip - decompress to tmpDir
    const data = fs.readFileSync(inputPath);
    const zlib = require('zlib');
    // Try gunzip, if fails treat as tar.gz (gzip of tar)
    try {
      const out = zlib.gunzipSync(data);
      // Heuristic: if decompressed starts with tar magic (ustar) or contains many files?
      // For simplicity, write to a file named original without .gz
      const base = path.basename(inputPath, '.gz');
      const outPath = path.join(tmpDir, base || 'file');
      // If out looks like tar (starts with file name padded), try to extract as tar
      if (out.slice(257, 262).toString() === 'ustar') {
        // It's a tar archive inside gz, extract it
        const tmpTar = path.join(tmpDir, '__inner.tar');
        fs.writeFileSync(tmpTar, out);
        const tar = require('tar');
        await tar.x({ file: tmpTar, cwd: tmpDir });
        fs.rmSync(tmpTar);
      } else {
        fs.writeFileSync(outPath, out);
      }
    } catch (e) {
      throw new Error(`GZ uitpakken mislukt: ${e.message}`);
    }
    return;
  }
  if (normalized === 'bz2' || normalized === 'xz' || normalized === 'lz' || normalized === 'lzma' || normalized === 'z') {
    // Try system tools
    const cmdMap = { 'bz2': 'bunzip2', 'xz': 'unxz', 'lz': 'lzip -d', 'lzma': 'unlzma', 'z': 'gunzip' };
    const cmd = cmdMap[normalized] || 'bunzip2';
    const baseCmd = cmd.split(' ')[0];
    if (!checkCommand(baseCmd)) throw new Error(`.${normalized} uitpakken vereist ${baseCmd} (niet gevonden). Installeer via brew install ${baseCmd === 'bunzip2' ? 'bzip2' : baseCmd}`);
    const outName = path.basename(inputPath, '.' + normalized);
    const outPath = path.join(tmpDir, outName || 'file');
    require('child_process').execSync(`${cmd} -c "${inputPath}" > "${outPath}"`);
    return;
  }
  if (['7z', 'rar', 'cab', 'iso'].includes(normalized)) {
    const has7z = checkCommand('7z') || checkCommand('7za') || checkCommand('7zr');
    if (!has7z) throw new Error(`.${normalized} vereist 7-Zip (p7zip). Installeer: brew install p7zip`);
    const exe = checkCommand('7z') ? '7z' : (checkCommand('7za') ? '7za' : '7zr');
    require('child_process').execSync(`${exe} x "${inputPath}" -o"${tmpDir}" -y`, { stdio: 'ignore' });
    return;
  }
  throw new Error(`Onbekend archief type .${ext}`);
}

async function createArchiveFromDir(srcDir, outputPath, targetExt) {
  const normalized = targetExt.toLowerCase();
  const zipFamily = ['zip', 'jar', 'war', 'ear', 'apk', 'aab'];
  if (zipFamily.includes(normalized)) {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    // Add all files recursively
    const addDir = (dir, base) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = path.join(base, e.name);
        if (e.isDirectory()) addDir(full, rel);
        else zip.addLocalFile(full, path.dirname(rel) === '.' ? '' : path.dirname(rel));
      }
    };
    addDir(srcDir, '');
    zip.writeZip(outputPath);
    return;
  }
  if (normalized === 'tar') {
    const tar = require('tar');
    await tar.c({ file: outputPath, cwd: srcDir }, ['.']);
    return;
  }
  if (normalized === 'tgz' || normalized === 'tar.gz') {
    const tar = require('tar');
    await tar.c({ gzip: true, file: outputPath, cwd: srcDir }, ['.']);
    return;
  }
  if (normalized === 'gz') {
    const files = fs.readdirSync(srcDir);
    const zlib = require('zlib');
    if (files.length === 1) {
      const filePath = path.join(srcDir, files[0]);
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        const data = fs.readFileSync(filePath);
        const gz = zlib.gzipSync(data);
        fs.writeFileSync(outputPath, gz);
        return;
      }
    }
    // Multiple files -> create tar.gz but with .gz extension (common)
    const tar = require('tar');
    await tar.c({ gzip: true, file: outputPath, cwd: srcDir }, ['.']);
    return;
  }
  if (['bz2', 'xz'].includes(normalized)) {
    // Create tar then compress via system bzip2/xz or tar with compress
    const tar = require('tar');
    const tmpTar = path.join(require('os').tmpdir(), `arch-${Date.now()}.tar`);
    await tar.c({ file: tmpTar, cwd: srcDir }, ['.']);
    const cmd = normalized === 'bz2' ? 'bzip2' : 'xz';
    if (!checkCommand(cmd)) {
      try { fs.rmSync(tmpTar); } catch {}
      throw new Error(`.${normalized} maken vereist ${cmd} (niet gevonden). Installeer via brew install ${cmd === 'bzip2' ? 'bzip2' : 'xz'}`);
    }
    require('child_process').execSync(`${cmd} -c "${tmpTar}" > "${outputPath}"`);
    try { fs.rmSync(tmpTar); } catch {}
    return;
  }
  if (['7z', 'rar', 'cab', 'iso'].includes(normalized)) {
    const has7z = checkCommand('7z') || checkCommand('7za');
    if (!has7z) throw new Error(`.${normalized} maken vereist 7-Zip. Installeer: brew install p7zip`);
    const exe = checkCommand('7z') ? '7z' : '7za';
    // 7z a output.zip srcDir/*
    require('child_process').execSync(`${exe} a -t${normalized} "${outputPath}" "${srcDir}"/* -r -y`, { stdio: 'ignore' });
    return;
  }
  throw new Error(`Onbekend archief doel .${targetExt}`);
}

async function convertArchive(inputPath, outputPath, targetFormat, onProgress) {
  onProgress?.(10);
  const inputExt = path.extname(inputPath).toLowerCase().replace('.', '');
  const targetExt = targetFormat.toLowerCase();

  // Quick path: same family zip copy if identical ext - just copy for speed
  const zipFamily = ['zip', 'jar', 'war', 'ear', 'apk', 'aab'];
  if (inputExt === targetExt && (zipFamily.includes(inputExt) || ['tar', 'gz', 'tgz'].includes(inputExt))) {
    // For identical, if we just copy it's faster, but re-pack to ensure validity? We'll copy
    fs.copyFileSync(inputPath, outputPath);
    onProgress?.(100);
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'arch-'));
  try {
    onProgress?.(20);
    await extractArchive(inputPath, inputExt, tmpDir);
    onProgress?.(60);
    // Check extracted dir not empty
    const entries = fs.readdirSync(tmpDir);
    if (entries.length === 0) throw new Error('Archief is leeg of kon niet worden uitgepakt');
    onProgress?.(70);
    await createArchiveFromDir(tmpDir, outputPath, targetExt);
    onProgress?.(100);
  } catch (err) {
    throw new Error(`Archief conversie ${inputExt} → ${targetExt} mislukt: ${err.message}`);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

async function convertModel3dGeneric(inputPath, outputPath, targetFormat, onProgress) {
  onProgress?.(10);
  const inputDir = path.dirname(inputPath);
  const { buffer, fileName } = await prepareCadInput(inputPath, onProgress);

  const formatMap = {
    'obj': 'obj',
    'ply': 'ply',
    'stl': 'stl',
    'fbx': 'fbx',
    'dae': 'collada',
    'gltf': 'gltf2',
    'glb': 'glb2',
    'dxf': 'dxf',
    'usd': 'usd',
    'usda': 'usd',
    'usdc': 'usd',
    'ifc': 'ifc',
    '3dm': '3dm',
    'step': 'stp',
    'stp': 'stp',
    'iges': 'igs',
    'igs': 'igs',
  };
  const assimpFormat = formatMap[targetFormat] || targetFormat;
  const ajs = await getAssimpjs();
  onProgress?.(40);

  const result = ajs.ConvertFile(
    fileName,
    assimpFormat,
    buffer,
    (existsName) => fs.existsSync(path.join(inputDir, existsName)),
    (readName) => fs.readFileSync(path.join(inputDir, readName)),
  );
  onProgress?.(70);
  if (!result.IsSuccess()) {
    throw new Error(`3D conversie naar ${targetFormat} mislukt: ${result.GetErrorCode()} - probeer eerst te converteren naar GLTF/GLB`);
  }
  const outBuf = Buffer.from(result.GetFile(0).GetContent());
  // Handle multi-file output (e.g., gltf with .bin)
  if (result.FileCount() > 1 && targetFormat === 'gltf') {
    let gltfContent = new TextDecoder().decode(result.GetFile(0).GetContent());
    for (let i = 1; i < result.FileCount(); i++) {
      const rf = result.GetFile(i);
      const binName = rf.GetPath();
      const b64 = Buffer.from(rf.GetContent()).toString('base64');
      gltfContent = gltfContent.replaceAll(binName, `data:application/octet-stream;base64,${b64}`);
    }
    fs.writeFileSync(outputPath, gltfContent);
  } else {
    fs.writeFileSync(outputPath, outBuf);
  }
  onProgress?.(100);
}

async function convertModel3dToGltf(inputPath, outputPath, targetFormat, onProgress) {
  onProgress?.(10);

  const assimpFormat = targetFormat === 'glb' ? 'glb2' : 'gltf2';
  const inputDir = path.dirname(inputPath);
  const { buffer, fileName } = await prepareCadInput(inputPath, onProgress);

  const ajs = await getAssimpjs();
  onProgress?.(30);

  const result = ajs.ConvertFile(
    fileName,
    assimpFormat,
    buffer,
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
    let gltfContent = new TextDecoder().decode(result.GetFile(0).GetContent());
    for (let i = 1; i < result.FileCount(); i++) {
      const rf = result.GetFile(i);
      const binName = rf.GetPath();
      const b64 = Buffer.from(rf.GetContent()).toString('base64');
      gltfContent = gltfContent.replaceAll(binName, `data:application/octet-stream;base64,${b64}`);
    }
    fs.writeFileSync(outputPath, gltfContent);
  }

  onProgress?.(100);
}

async function convertModel3dToStl(inputPath, outputPath, onProgress) {
  onProgress?.(10);

  const inputDir = path.dirname(inputPath);
  const { buffer, fileName } = await prepareCadInput(inputPath, onProgress);

  const ajs = await getAssimpjs();
  onProgress?.(30);

  const result = ajs.ConvertFile(
    fileName,
    'assjson',
    buffer,
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
