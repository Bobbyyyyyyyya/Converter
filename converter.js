const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

const SUPPORTED = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'avif'],
  audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'],
  video: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv'],
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
      return SUPPORTED.image.filter((e) => e !== 'gif' && e !== 'avif').concat(['gif', 'avif']);
    case 'audio':
      return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
    case 'video':
      return ['mp4', 'avi', 'mov', 'mkv', 'webm', 'gif'];
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
    throw new Error(`Onbekend bestandstype: .${ext}`);
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
  } else {
    throw new Error(`Onbekend afbeeldingformaat: ${targetFormat}`);
  }

  onProgress?.(50);

  await pipeline.toFile(outputPath);

  onProgress?.(100);
}

function convertFFmpeg(inputPath, outputPath, targetFormat, onProgress) {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath);

    if (targetFormat === 'gif') {
      command.outputOptions([
        '-vf', 'fps=10,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
      ]);
    }

    command
      .toFormat(targetFormat === 'mp3' || targetFormat === 'wav' || targetFormat === 'ogg' || targetFormat === 'flac' || targetFormat === 'aac' || targetFormat === 'm4a' ? undefined : targetFormat)
      .audioCodec(targetFormat === 'mp3' ? 'libmp3lame' : undefined)
      .audioCodec(targetFormat === 'aac' ? 'aac' : undefined)
      .audioCodec(targetFormat === 'ogg' ? 'libvorbis' : undefined)
      .audioCodec(targetFormat === 'flac' ? 'flac' : undefined)
      .audioCodec(targetFormat === 'm4a' ? 'aac' : undefined)
      .audioCodec(targetFormat === 'wav' ? 'pcm_s16le' : undefined)
      .on('start', () => onProgress?.(5))
      .on('progress', (info) => {
        if (info.percent) onProgress?.(Math.round(info.percent));
      })
      .on('end', () => {
        onProgress?.(100);
        resolve();
      })
      .on('error', (err) => reject(new Error(`FFmpeg fout: ${err.message}`)))
      .save(outputPath);
  });
}

module.exports = { convertFile, getFormatInfo };
