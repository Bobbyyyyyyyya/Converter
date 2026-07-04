const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');

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
    'heic', 'heif', 'jp2',
  ],
  audio: [
    'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma',
    'opus', 'aiff', 'alac', 'ac3', 'amr', 'mp2',
  ],
  video: [
    'mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv',
    '3gp', 'm4v', 'mpg', 'mpeg', 'ogv', 'ts', 'mts', 'm2ts',
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
      return ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'avif', 'heic', 'jp2'];
    case 'audio':
      return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus', 'aiff', 'ac3', 'mp2'];
    case 'video':
      return ['mp4', 'avi', 'mov', 'mkv', 'webm', 'gif', '3gp', 'm4v', 'mpg', 'ogv', 'ts'];
    default:
      return [];
  }
}

async function convertFile(inputPath, outputPath, targetFormat, onProgress) {
  const ext = path.extname(inputPath).toLowerCase().replace('.', '');
  const type = TYPE_MAP[ext];

  if (type === 'image') {
    await convertImage(inputPath, outputPath, targetFormat, onProgress);
  } else if (type === 'audio' || type === 'video') {
    await convertFFmpeg(inputPath, outputPath, targetFormat, onProgress);
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

module.exports = { convertFile, getFormatInfo };
