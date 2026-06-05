const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';

const screens = {
  start: document.getElementById('start-screen'),
  camera: document.getElementById('camera-screen'),
  wig: document.getElementById('wig-screen'),
};

const video = document.getElementById('video');
const resultCanvas = document.getElementById('result-canvas');
const loading = document.getElementById('loading');
const scaleSlider = document.getElementById('scale-slider');
const offsetSlider = document.getElementById('offset-slider');

let stream = null;
let facingMode = 'user';
let capturedImage = null;
let faceData = null;
let currentWig = 'none';
let wigScale = 1;
let wigOffsetY = 0;
let wigImages = {};
let modelsLoaded = false;

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

async function loadModels() {
  if (modelsLoaded) return;
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

async function loadWigImages() {
  const wigs = ['short-bob', 'long-straight', 'wavy', 'curly', 'ponytail', 'pixie', 'bangs'];
  await Promise.all(wigs.map(async (name) => {
    const img = new Image();
    img.src = `assets/wigs/${name}.svg`;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    wigImages[name] = img;
  }));
}

async function startCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
  }

  const constraints = {
    video: {
      facingMode,
      width: { ideal: 1280 },
      height: { ideal: 1920 },
    },
    audio: false,
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    alert('카메라 접근이 거부되었습니다.\n브라우저 설정에서 카메라 권한을 허용해주세요.');
    showScreen('start');
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

function capturePhoto() {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);
  capturedImage = canvas;
  return canvas;
}

async function detectFace(imageSource) {
  const detection = await faceapi
    .detectSingleFace(imageSource, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks(true);

  if (!detection) return null;

  const box = detection.detection.box;
  const landmarks = detection.landmarks.positions;

  const foreheadLeft = landmarks[17];
  const foreheadRight = landmarks[26];
  const chin = landmarks[8];
  const nose = landmarks[30];

  const faceWidth = Math.abs(foreheadRight.x - foreheadLeft.x) * 2.2;
  const faceCenterX = (foreheadLeft.x + foreheadRight.x) / 2;
  const topY = Math.min(foreheadLeft.y, foreheadRight.y) - faceWidth * 0.35;
  const centerY = (topY + chin.y) / 2;

  return {
    box,
    landmarks,
    faceWidth,
    faceCenterX,
    topY,
    centerY,
    nose,
  };
}

function renderResult() {
  if (!capturedImage) return;

  const ctx = resultCanvas.getContext('2d');
  const img = capturedImage;

  const maxW = window.innerWidth;
  const maxH = window.innerHeight * 0.55;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);

  resultCanvas.width = img.width * scale;
  resultCanvas.height = img.height * scale;

  ctx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
  ctx.drawImage(img, 0, 0, resultCanvas.width, resultCanvas.height);

  if (currentWig !== 'none' && faceData && wigImages[currentWig]) {
    drawWig(ctx, scale);
  }
}

function drawWig(ctx, canvasScale) {
  const wig = wigImages[currentWig];
  const { faceWidth, faceCenterX, topY } = faceData;

  const wigWidth = faceWidth * wigScale * canvasScale;
  const wigHeight = (wig.height / wig.width) * wigWidth;
  const x = faceCenterX * canvasScale - wigWidth / 2;
  const y = (topY + wigOffsetY) * canvasScale;

  ctx.drawImage(wig, x, y, wigWidth, wigHeight);
}

async function processCapture() {
  stopCamera();
  showScreen('wig');
  loading.classList.remove('hidden');

  scaleSlider.value = 1;
  offsetSlider.value = 0;
  wigScale = 1;
  wigOffsetY = 0;
  currentWig = 'none';

  document.querySelectorAll('.wig-item').forEach(el => {
    el.classList.toggle('active', el.dataset.wig === 'none');
  });

  try {
    await loadModels();
    faceData = await detectFace(capturedImage);

    if (!faceData) {
      alert('얼굴을 인식하지 못했습니다.\n밝은 곳에서 정면을 바라보고 다시 촬영해주세요.');
      showScreen('camera');
      await startCamera();
      return;
    }
  } catch (err) {
    console.error(err);
    alert('얼굴 인식 중 오류가 발생했습니다. 다시 시도해주세요.');
    showScreen('camera');
    await startCamera();
    return;
  } finally {
    loading.classList.add('hidden');
  }

  renderResult();
}

function saveImage() {
  renderResult();
  const link = document.createElement('a');
  link.download = `wig-studio-${Date.now()}.png`;
  link.href = resultCanvas.toDataURL('image/png');
  link.click();
}

document.getElementById('btn-start').addEventListener('click', async () => {
  showScreen('camera');
  await startCamera();
});

document.getElementById('btn-back').addEventListener('click', () => {
  stopCamera();
  showScreen('start');
});

document.getElementById('btn-switch-camera').addEventListener('click', async () => {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  await startCamera();
});

document.getElementById('btn-capture').addEventListener('click', async () => {
  capturePhoto();
  await processCapture();
});

document.getElementById('btn-retake').addEventListener('click', async () => {
  showScreen('camera');
  await startCamera();
});

document.getElementById('btn-save').addEventListener('click', saveImage);

document.querySelectorAll('.wig-item').forEach(btn => {
  btn.addEventListener('click', () => {
    currentWig = btn.dataset.wig;
    document.querySelectorAll('.wig-item').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    renderResult();
  });
});

scaleSlider.addEventListener('input', () => {
  wigScale = parseFloat(scaleSlider.value);
  renderResult();
});

offsetSlider.addEventListener('input', () => {
  wigOffsetY = parseInt(offsetSlider.value, 10);
  renderResult();
});

loadWigImages().catch(console.error);
