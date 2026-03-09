const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const faceapi = require('face-api.js');

const MODEL_DIR = path.join(__dirname, '../models');
const MANIFEST_FILE = 'tiny_face_detector_model-weights_manifest.json';
const SHARD_FILE = 'tiny_face_detector_model-shard1';

const MIN_WIDTH = 400;
const MIN_HEIGHT = 400;
const MIN_VARIANCE = 260; // blank/flat image threshold
const MIN_BRIGHTNESS = 55; // dark image threshold
const MIN_LAPLACIAN_VARIANCE = 120; // blur threshold
const SELFIE_FACE_RATIO = 0.4; // >40% face area is treated as selfie

let modelLoadPromise = null;
let tfModule = null;
let tfInitAttempted = false;
let tfInitError = null;

function getTensorflowModule() {
  if (tfInitAttempted) return tfModule;
  tfInitAttempted = true;
  try {
    tfModule = require('@tensorflow/tfjs-node');
  } catch (error) {
    tfInitError = error;
    tfModule = null;
  }
  return tfModule;
}

async function ensureModelFile(fileName) {
  const filePath = path.join(MODEL_DIR, fileName);
  if (fs.existsSync(filePath)) return;

  fs.mkdirSync(MODEL_DIR, { recursive: true });
  const urls = [
    `https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/${fileName}`,
    `https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js/weights/${fileName}`,
  ];

  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const arr = await response.arrayBuffer();
      fs.writeFileSync(filePath, Buffer.from(arr));
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Unable to download face model file: ${fileName}. ${lastError ? lastError.message : ''}`);
}

async function ensureFaceDetectorLoaded() {
  if (modelLoadPromise) return modelLoadPromise;

  modelLoadPromise = (async () => {
    const tf = getTensorflowModule();
    if (!tf) {
      throw new Error(
        `TensorFlow backend unavailable (${tfInitError ? tfInitError.message : 'unknown error'}). ` +
        'Install a compatible @tensorflow/tfjs-node build and use Node 18/20.'
      );
    }
    await ensureModelFile(MANIFEST_FILE);
    await ensureModelFile(SHARD_FILE);
    await tf.setBackend('tensorflow');
    await tf.ready();
    await faceapi.nets.tinyFaceDetector.loadFromDisk(MODEL_DIR);
  })();

  return modelLoadPromise;
}

function getMeanAndVariance(values) {
  if (!values.length) return { mean: 0, variance: 0 };
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let sq = 0;
  for (const v of values) sq += Math.pow(v - mean, 2);
  return { mean, variance: sq / values.length };
}

async function getGrayStats(buffer) {
  const { data } = await sharp(buffer)
    .greyscale()
    .resize(160, 160, { fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return getMeanAndVariance(data);
}

async function getLaplacianVariance(buffer) {
  const { data } = await sharp(buffer)
    .greyscale()
    .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
    .convolve({
      width: 3,
      height: 3,
      kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return getMeanAndVariance(data).variance;
}

async function detectSelfieRatio(buffer, imageArea) {
  const tf = getTensorflowModule();
  if (!tf) {
    throw new Error(
      `TensorFlow backend unavailable (${tfInitError ? tfInitError.message : 'unknown error'}).`
    );
  }

  await ensureFaceDetectorLoaded();

  const imageTensor = tf.node.decodeImage(buffer, 3);
  try {
    const detections = await faceapi.detectAllFaces(
      imageTensor,
      new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.5,
      })
    );

    if (!detections.length) return { hasFace: false, maxFaceRatio: 0 };

    const maxFaceArea = detections.reduce((max, det) => {
      const area = det.box.width * det.box.height;
      return area > max ? area : max;
    }, 0);

    return { hasFace: true, maxFaceRatio: maxFaceArea / imageArea };
  } finally {
    imageTensor.dispose();
  }
}

async function validateImageForSpot(buffer) {
  const checks = [];
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const imageArea = width * height;

  checks.push({
    rule: 'dimension_min_400x400',
    passed: width >= MIN_WIDTH && height >= MIN_HEIGHT,
    details: { width, height, minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT },
    rejectMessage: 'Image too small. Minimum required size is 400x400.',
  });

  const grayStats = await getGrayStats(buffer);
  checks.push({
    rule: 'blank_pixel_variance',
    passed: grayStats.variance >= MIN_VARIANCE,
    details: { variance: Number(grayStats.variance.toFixed(2)), minVariance: MIN_VARIANCE },
    rejectMessage: 'Image appears blank or too flat.',
  });

  checks.push({
    rule: 'brightness_not_too_dark',
    passed: grayStats.mean >= MIN_BRIGHTNESS,
    details: { brightness: Number(grayStats.mean.toFixed(2)), minBrightness: MIN_BRIGHTNESS },
    rejectMessage: 'Image is too dark. Capture in better light.',
  });

  const laplacianVariance = await getLaplacianVariance(buffer);
  checks.push({
    rule: 'blur_laplacian_sharpness',
    passed: laplacianVariance >= MIN_LAPLACIAN_VARIANCE,
    details: { laplacianVariance: Number(laplacianVariance.toFixed(2)), minLaplacianVariance: MIN_LAPLACIAN_VARIANCE },
    rejectMessage: 'Image is blurry. Please capture a sharper photo.',
  });

  try {
    const faceInfo = await detectSelfieRatio(buffer, imageArea);
    checks.push({
      rule: 'selfie_face_ratio',
      passed: !faceInfo.hasFace || faceInfo.maxFaceRatio <= SELFIE_FACE_RATIO,
      details: {
        hasFace: faceInfo.hasFace,
        maxFaceRatio: Number(faceInfo.maxFaceRatio.toFixed(3)),
        maxAllowedFaceRatio: SELFIE_FACE_RATIO,
      },
      rejectMessage: 'Selfie detected. Capture spot scenery, not close-up faces.',
    });
  } catch (error) {
    checks.push({
      rule: 'selfie_detector_ready',
      passed: false,
      details: { error: error.message },
      rejectMessage: 'Selfie detector unavailable on server. Upload blocked for safety.',
    });
  }

  const failed = checks.find(c => !c.passed);
  if (failed) {
    return {
      accepted: false,
      reason: failed.rejectMessage,
      failedRule: failed.rule,
      checks,
    };
  }

  return {
    accepted: true,
    reason: 'Image passed all spot validation rules.',
    checks,
  };
}

module.exports = { validateImageForSpot };
