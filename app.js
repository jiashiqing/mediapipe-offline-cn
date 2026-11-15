/* MediaPipe 视觉实验室 · 离线版
 * 六个模型全部本地加载，画面不出本机。
 */

/* 模型与 WASM 一律用绝对 URL，避免不同浏览器对相对路径 base 解析不一致 */
const BASE = new URL('./', location.href).href;

/* ---------------- 常量与映射 ---------------- */

const MODES = {
  face: {
    title: '面部网格',
    desc: '478 个 3D 面部地标连成三角网格，红绿分别标出左右眼与眉毛，虹膜单独描线。可用来做表情捕捉、视线分析、虚拟形象驱动。',
  },
  hands: {
    title: '手部追踪',
    desc: '每只手 21 个关节点，绿线连成骨架、红点标出关节，最多同时识别两只手。适合手势控制与手部动作分析。',
  },
  pose: {
    title: '姿态检测',
    desc: '33 个全身关键点的火柴人骨架，离镜头越近的关节点越大。右侧实时算出左右肘、膝的弯曲角度，可用于体育动作纠正。',
  },
  gesture: {
    title: '手势识别',
    desc: '在手部骨架基础上再判语义：先跑 MediaPipe 原生手势分类器，置信度不足时用关节点几何规则补判，共支持十余种手势。',
  },
  object: {
    title: '物体检测',
    desc: 'EfficientDet-Lite0 模型，可识别 COCO 80 类常见物体。绿框圈出位置并标注名称与置信度，置信度低于 50% 的自动丢弃。',
  },
  segment: {
    title: '人像去背',
    desc: '自拍分割模型逐像素区分人与背景，人像保持原样、背景被填充为半透明紫色。这就是视频会议虚拟背景的原理。',
  },
  raise: {
    title: '举手计数',
    desc: '统计课堂上的「举手」与「起立」次数。举手判定为手腕高过肩膀，起立判定为膝关节由屈变直，均带连续帧去抖，手抖一下不会多算。',
  },
  posture: {
    title: '坐姿检测',
    desc: '用肩线角度、头部左右偏移、头部下沉量和肩宽（估距屏远近）四项指标，跟开始时的正常坐姿基线比对，算出一个 0-100 的坐姿分。',
  },
};

const GESTURE_CN = {
  Closed_Fist: '握拳', Open_Palm: '张开手掌', Pointing_Up: '食指上指',
  Thumb_Down: '拇指向下', Thumb_Up: '竖大拇指', Victory: '胜利 V',
  ILoveYou: '我爱你手势', OK: 'OK 手势', Pinch: '捏合',
  Rock: '摇滚手势', Call_Me: '打电话', One: '数字 1', Two: '数字 2',
  Three: '数字 3', Four: '数字 4', Eight: '数字 8',
};

const BLENDSHAPE_CN = {
  jawOpen: '张嘴', mouthSmileLeft: '微笑(左)', mouthSmileRight: '微笑(右)',
  eyeBlinkLeft: '眨眼(左)', eyeBlinkRight: '眨眼(右)', browInnerUp: '抬内眉',
  browDownLeft: '压眉(左)', browDownRight: '压眉(右)', mouthPucker: '噘嘴',
  mouthFunnel: '嘟嘴', tongueOut: '伸舌', cheekPuff: '鼓腮',
  eyeLookUpLeft: '上看(左)', eyeLookUpRight: '上看(右)',
  eyeLookDownLeft: '下看(左)', eyeLookDownRight: '下看(右)',
  mouthFrownLeft: '撇嘴(左)', mouthFrownRight: '撇嘴(右)',
  noseSneerLeft: '皱鼻(左)', noseSneerRight: '皱鼻(右)',
};

const COCO_CN = {
  person: '人', bicycle: '自行车', car: '汽车', motorcycle: '摩托车', airplane: '飞机',
  bus: '公交车', train: '火车', truck: '卡车', boat: '船', 'traffic light': '红绿灯',
  'fire hydrant': '消防栓', 'stop sign': '停车标志', bench: '长椅', bird: '鸟', cat: '猫',
  dog: '狗', horse: '马', sheep: '羊', cow: '牛', elephant: '大象', bear: '熊',
  zebra: '斑马', giraffe: '长颈鹿', backpack: '背包', umbrella: '雨伞', handbag: '手提包',
  tie: '领带', suitcase: '行李箱', frisbee: '飞盘', skis: '滑雪板', snowboard: '单板',
  'sports ball': '球', kite: '风筝', 'baseball bat': '棒球棒', skateboard: '滑板',
  surfboard: '冲浪板', 'tennis racket': '网球拍', bottle: '瓶子', 'wine glass': '酒杯',
  cup: '杯子', fork: '叉子', knife: '刀', spoon: '勺子', bowl: '碗', banana: '香蕉',
  apple: '苹果', sandwich: '三明治', orange: '橙子', broccoli: '西兰花', carrot: '胡萝卜',
  'hot dog': '热狗', pizza: '披萨', donut: '甜甜圈', cake: '蛋糕', chair: '椅子',
  couch: '沙发', 'potted plant': '盆栽', bed: '床', 'dining table': '餐桌', toilet: '马桶',
  tv: '电视', laptop: '笔记本电脑', mouse: '鼠标', remote: '遥控器', keyboard: '键盘',
  'cell phone': '手机', microwave: '微波炉', oven: '烤箱', toaster: '烤面包机',
  sink: '水槽', refrigerator: '冰箱', book: '书', clock: '时钟', vase: '花瓶',
  scissors: '剪刀', 'teddy bear': '泰迪熊', 'hair drier': '吹风机', toothbrush: '牙刷',
};

/* ---------------- DOM ---------------- */

const $ = (id) => document.getElementById(id);
const video = $('video');
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const overlay = $('overlay');
const statusEl = $('status');
const startBtn = $('startBtn');
const snapBtn = $('snapBtn');
const mirrorChk = $('mirrorChk');
const camSelect = $('cameraSelect');
const statsEl = $('stats');
const panelTitle = $('panelTitle');
const panelDesc = $('panelDesc');
const modeBar = $('modeBar');

/* ---------------- 状态 ---------------- */

let MP = null;                 // MediaPipe 模块
let vision = null;             // WASM Fileset
let drawingUtils = null;
let currentMode = 'face';
let running = false;
let stream = null;
let lastVideoTime = -1;
let lastTs = 0;
let panelTimer = 0;
let fpsTimer = 0;
let statsHtml = '';
let fatal = null;
let segTmp = null;             // 分割遮罩离屏画布（复用，避免每帧新建）

/* 举手 / 起立计数状态 */
const raiseState = {
  handUp: false,
  handFrames: 0,
  sitFrames: 0,
  standFrames: 0,
  sitState: null,              // null | 'sit' | 'stand'
  raiseCount: 0,
  standCount: 0,
  which: '',
};

/* 坐姿基线状态 */
const postureState = {
  base: null,                  // 校准结果
  calibBuf: [],
  CALIB_FRAMES: 70,
  score: 100,
  badMs: 0,
  lastTick: 0,
  metrics: null,
};

const tasks = {};              // mode -> 已创建的 task 实例
const loading = {};            // mode -> Promise（避免重复创建）
const taskErrors = {};         // mode -> 失败原因
const fpsBuf = [];

/* ---------------- 工具函数 ---------------- */

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

let overlayMsg = '';

function showOverlay(html) {
  if (html === overlayMsg && !overlay.hidden) return;   // 幂等，避免每帧重建 DOM
  overlayMsg = html;
  overlay.innerHTML = html;
  overlay.hidden = false;
}

function hideOverlay() {
  overlay.hidden = true;
  overlayMsg = '';
}

function barRow(label, ratio, numText) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return `<div class="bar-row"><span class="label">${label}</span>` +
    `<span class="track"><span class="fill" style="width:${pct.toFixed(1)}%"></span></span>` +
    `<span class="num">${numText}</span></div>`;
}

function statRow(k, v) {
  return `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span></div>`;
}

function vecAngle(a, b, c) {
  if (!a || !b || !c) return null;
  const ax = a.x - b.x, ay = a.y - b.y, az = (a.z || 0) - (b.z || 0);
  const cx = c.x - b.x, cy = c.y - b.y, cz = (c.z || 0) - (b.z || 0);
  const m1 = Math.hypot(ax, ay, az), m2 = Math.hypot(cx, cy, cz);
  if (!m1 || !m2) return null;
  const dot = (ax * cx + ay * cy + az * cz) / (m1 * m2);
  return Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
}

/* MediaPipe 的 Left/Right 基于原始画面，镜像后容易说反。
   直接按"在画面哪一侧"标注，零歧义。 */
function sideOf(lm) {
  const x = mirrorChk.checked ? 1 - lm[0].x : lm[0].x;
  return x < 0.5 ? '画面左侧' : '画面右侧';
}

/* 画文字：镜像时需反向翻转，否则字是反的 */
function drawLabel(text, x, y, color, font) {
  ctx.save();
  ctx.translate(x, y);
  if (mirrorChk.checked) ctx.scale(-1, 1);
  ctx.font = font || '600 15px "Microsoft YaHei", sans-serif';
  ctx.textBaseline = 'bottom';
  const w = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(0,0,0,.62)';
  ctx.fillRect(-4, -20, w + 9, 22);
  ctx.fillStyle = color || '#2dd4bf';
  ctx.fillText(text, 0, -2);
  ctx.restore();
}

/* ---------------- 模型加载 ---------------- */

async function initRuntime() {
  MP = await import('./vendor/vision_bundle.js');
  vision = await MP.FilesetResolver.forVisionTasks(BASE + 'vendor/wasm');
  drawingUtils = new MP.DrawingUtils(ctx);
}

/* GPU 失败自动退回 CPU —— 机房老机器常见 */
async function createTask(name, build) {
  try {
    return await build('GPU');
  } catch (e) {
    console.warn(`[${name}] GPU 委托失败，改用 CPU：`, e);
    setStatus('GPU 不可用，已切 CPU', 'warn');
    return await build('CPU');
  }
}

function buildFace(delegate) {
  return MP.FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: BASE + 'models/face_landmarker.task', delegate },
    outputFaceBlendshapes: true,
    runningMode: 'VIDEO',
    numFaces: 1,
  });
}

function buildHands(delegate) {
  return MP.HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: BASE + 'models/hand_landmarker.task', delegate },
    runningMode: 'VIDEO',
    numHands: 2,
  });
}

function buildPose(delegate) {
  return MP.PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: BASE + 'models/pose_landmarker_lite.task', delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

function buildObject(delegate) {
  return MP.ObjectDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: BASE + 'models/efficientdet_lite0.tflite', delegate },
    scoreThreshold: 0.5,
    runningMode: 'VIDEO',
  });
}

function buildGesture(delegate) {
  return MP.GestureRecognizer.createFromOptions(vision, {
    baseOptions: { modelAssetPath: BASE + 'models/gesture_recognizer.task', delegate },
    runningMode: 'VIDEO',
    numHands: 2,
  });
}

function buildSegment(delegate) {
  return MP.ImageSegmenter.createFromOptions(vision, {
    baseOptions: { modelAssetPath: BASE + 'models/selfie_segmenter.tflite', delegate },
    runningMode: 'VIDEO',
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  });
}

const BUILDERS = {
  face: ['面部网格', buildFace],
  hands: ['手部追踪', buildHands],
  pose: ['姿态检测', buildPose],
  gesture: ['手势识别', buildGesture],
  object: ['物体检测', buildObject],
  segment: ['人像去背', buildSegment],
  raise: ['举手计数', buildPose],
  posture: ['坐姿检测', buildPose],
};

/* 举手 / 坐姿都跑同一个 Pose 模型，共用一个实例，不重复占显存 */
const MODEL_ALIAS = { raise: 'pose', posture: 'pose' };
const keyOf = (mode) => MODEL_ALIAS[mode] || mode;

function ensureTask(mode) {
  const k = keyOf(mode);
  if (tasks[k]) return Promise.resolve(tasks[k]);
  if (loading[k]) return loading[k];
  const [label, build] = BUILDERS[k];
  loading[k] = createTask(label, build).then((t) => {
    tasks[k] = t;
    delete taskErrors[k];
    return t;
  }).catch((e) => {
    delete loading[k];
    taskErrors[k] = e.message || String(e);
    throw e;
  });
  return loading[k];
}

/* ---------------- 摄像头 ---------------- */

async function listCameras() {
  try {
    const prev = camSelect.value;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === 'videoinput');
    camSelect.innerHTML = '';
    if (!cams.length) {
      camSelect.innerHTML = '<option value="">无摄像头</option>';
      camSelect.disabled = true;
      return;
    }
    camSelect.disabled = false;
    cams.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `摄像头 ${i + 1}`;
      camSelect.appendChild(opt);
    });
    if (prev && cams.some((d) => d.deviceId === prev)) camSelect.value = prev;
  } catch (e) {
    camSelect.innerHTML = '<option value="">无法枚举设备</option>';
  }
}

async function startCamera() {
  if (!MP) {
    showOverlay('<div class="big">运行时尚未就绪</div><div>请稍候再试</div>');
    return;
  }
  showOverlay('<div class="spinner"></div><div>正在请求摄像头权限…</div>');

  const constraints = {
    audio: false,
    video: camSelect.value
      ? { deviceId: { exact: camSelect.value }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    const tips = {
      NotAllowedError: '摄像头权限被拒绝。请点地址栏左侧的图标，把「摄像头」改为允许后刷新页面。',
      PermissionDeniedError: '摄像头权限被拒绝。请在浏览器设置中允许本页面使用摄像头。',
      NotFoundError: '没有找到可用摄像头，请检查设备是否连接。',
      NotReadableError: '摄像头被其他程序占用（如钉钉、腾讯会议、相机应用），请先关闭它们。',
      OverconstrainedError: '所选摄像头不支持要求的分辨率，请换一个设备。',
      SecurityError: '必须通过 http://localhost 或 https 访问，直接双击打开 HTML 文件不行。',
    };
    showOverlay(`<div class="big">无法开启摄像头</div><div style="max-width:520px;line-height:1.7">${tips[e.name] || e.message}</div>`);
    setStatus('摄像头失败', 'warn');
    return;
  }

  video.srcObject = stream;
  await video.play().catch(() => {});

  running = true;
  startBtn.textContent = '停止';
  startBtn.classList.add('running');
  snapBtn.disabled = false;
  hideOverlay();
  setStatus('就绪', 'ok');

  await listCameras();

  requestAnimationFrame(renderLoop);
}

function stopCamera() {
  running = false;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  startBtn.textContent = '开启摄像头';
  startBtn.classList.remove('running');
  snapBtn.disabled = true;
  showOverlay('<div class="big">已停止</div><div>点击「开启摄像头」重新开始</div>');
  setStatus('已停止');
}

/* ---------------- 绘制与检测 ---------------- */

function syncCanvasSize() {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return false;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return true;
}

function renderLoop() {
  if (!running) return;

  if (!syncCanvasSize()) {
    requestAnimationFrame(renderLoop);
    return;
  }

  const mode = currentMode;
  const task = tasks[keyOf(mode)];

  if (!task) {
    // 模型未就绪且没人负责加载时，自己补一次（防止卡在加载中不动）
    if (!loading[keyOf(mode)] && !taskErrors[keyOf(mode)]) ensureTask(mode).catch(() => {});
    // 模型还没好，先把画面显示出来
    ctx.save();
    if (mirrorChk.checked) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    const err = taskErrors[keyOf(mode)];
    if (err) {
      showOverlay(`<div class="big" style="color:#f59e0b">「${MODES[mode].title}」模型加载失败</div>` +
        `<div style="max-width:520px;line-height:1.7">${err}<br>请确认 models 目录下的模型文件完整，或重新运行 _fetch_assets.py。</div>`);
      setStatus('模型加载失败', 'warn');
    } else {
      showOverlay(`<div class="spinner"></div><div>正在加载「${MODES[mode].title}」模型…</div>`);
      setStatus('加载模型…', 'warn');
    }
  } else if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const ts = Math.max(performance.now(), lastTs + 1);
    lastTs = ts;
    hideOverlay();

    try {
      detectAndDraw(mode, task, ts);
    } catch (e) {
      console.error('检测出错：', e);
      setStatus('检测异常', 'warn');
    }
    updateFps();
  }

  requestAnimationFrame(renderLoop);
}

function updateFps() {
  const now = performance.now();
  fpsBuf.push(now);
  while (fpsBuf.length > 20) fpsBuf.shift();
  if (fpsBuf.length >= 2 && now - fpsTimer > 400) {
    fpsTimer = now;
    const fps = (fpsBuf.length - 1) * 1000 / (fpsBuf[fpsBuf.length - 1] - fpsBuf[0]);
    if (running) setStatus(fps.toFixed(0) + ' FPS', 'ok');
  }
}

function detectAndDraw(mode, task, ts) {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (mirrorChk.checked) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  // 先用视频打底
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  let panelHtml = '';

  if (mode === 'face') {
    panelHtml = drawFace(task, ts);
  } else if (mode === 'hands') {
    panelHtml = drawHands(task, ts);
  } else if (mode === 'pose') {
    panelHtml = drawPose(task, ts);
  } else if (mode === 'object') {
    panelHtml = drawObject(task, ts);
  } else if (mode === 'gesture') {
    panelHtml = drawGesture(task, ts);
  } else if (mode === 'segment') {
    panelHtml = drawSegment(task, ts);
  } else if (mode === 'raise') {
    panelHtml = drawRaise(task, ts);
  } else if (mode === 'posture') {
    panelHtml = drawPosture(task, ts);
  }

  ctx.restore();

  // 面板节流刷新（每 110ms 一次，避免每帧重建 DOM）
  const now = performance.now();
  if (now - panelTimer > 110 && panelHtml && panelHtml !== statsHtml) {
    statsHtml = panelHtml;
    statsEl.innerHTML = panelHtml;
    panelTimer = now;
  }
}

/* ---- 面部 ---- */
function drawFace(task, ts) {
  const r = task.detectForVideo(video, ts);
  const L = r.faceLandmarks;

  if (!L || !L.length) {
    drawLabel('未检测到人脸', 24, canvas.height - 24, '#f59e0b');
    return statRow('状态', '未检测到人脸');
  }

  const lm = L[0];
  const F = MP.FaceLandmarker;
  drawingUtils.drawConnectors(lm, F.FACE_LANDMARKS_TESSELATION, { color: '#C0C0C030', lineWidth: 1 });
  drawingUtils.drawConnectors(lm, F.FACE_LANDMARKS_RIGHT_EYE, { color: '#FF4040' });
  drawingUtils.drawConnectors(lm, F.FACE_LANDMARKS_RIGHT_EYEBROW, { color: '#FF4040' });
  drawingUtils.drawConnectors(lm, F.FACE_LANDMARKS_RIGHT_IRIS, { color: '#FF4040' });
  drawingUtils.drawConnectors(lm, F.FACE_LANDMARKS_LEFT_EYE, { color: '#40FF40' });
  drawingUtils.drawConnectors(lm, F.FACE_LANDMARKS_LEFT_EYEBROW, { color: '#40FF40' });
  drawingUtils.drawConnectors(lm, F.FACE_LANDMARKS_LEFT_IRIS, { color: '#40FF40' });
  drawingUtils.drawConnectors(lm, F.FACE_LANDMARKS_FACE_OVAL, { color: '#E0E0E0A0' });
  drawingUtils.drawConnectors(lm, F.FACE_LANDMARKS_LIPS, { color: '#E0E0E0A0' });

  drawLabel(`面部地标 ${lm.length} 点`, 20, canvas.height - 18);

  let html = statRow('地标点数', lm.length) + statRow('检测人脸', L.length);

  const bs = r.faceBlendshapes && r.faceBlendshapes[0];
  if (bs && bs.categories) {
    const top = bs.categories
      .filter((c) => c.score > 0.12)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    if (top.length) {
      html += `<div class="divider"></div><div class="empty" style="padding:2px 0">表情系数（前 4）</div>`;
      html += top.map((c) => barRow(
        BLENDSHAPE_CN[c.categoryName] || c.categoryName,
        c.score, (c.score * 100).toFixed(0)
      )).join('');
    }
  }
  return html;
}

/* ---- 手部 ---- */
function drawHands(task, ts) {
  const r = task.detectForVideo(video, ts);
  const L = r.landmarks;

  if (!L || !L.length) {
    drawLabel('未检测到手', 24, canvas.height - 24, '#f59e0b');
    return statRow('状态', '未检测到手') + statRow('提示', '把手放进画面');
  }

  L.forEach((lm, i) => {
    drawingUtils.drawConnectors(lm, MP.HandLandmarker.HAND_CONNECTIONS, { color: '#2dd4bf', lineWidth: 4 });
    drawingUtils.drawLandmarks(lm, { color: '#ff5c5c', lineWidth: 1, radius: 4 });
    const tip = lm[12];
    drawLabel(sideOf(lm), tip.x * canvas.width + 10, tip.y * canvas.height - 6);
  });

  drawLabel(`检测到手：${L.length} 只`, 20, canvas.height - 18);

  let html = statRow('检测到手', L.length + ' 只');
  L.forEach((lm, i) => {
    html += statRow(`第 ${i + 1} 只（${sideOf(lm)}）`, '21 个关节点');
  });
  return html;
}

/* ---- 姿态 ---- */
function drawPose(task, ts) {
  const r = task.detectForVideo(video, ts);
  const L = r.landmarks;

  if (!L || !L.length) {
    drawLabel('未检测到人体', 24, canvas.height - 24, '#f59e0b');
    return statRow('状态', '未检测到人体');
  }

  const lm = L[0];
  drawingUtils.drawLandmarks(lm, {
    radius: (d) => MP.DrawingUtils.lerp(d.from.z, -0.15, 0.1, 6, 1),
    color: '#2dd4bf',
    fillColor: '#2dd4bf',
  });
  drawingUtils.drawConnectors(lm, MP.PoseLandmarker.POSE_CONNECTIONS, { color: '#5eead4', lineWidth: 3 });

  // 角度用世界坐标算，更准（不受透视影响）
  const W = (r.worldLandmarks && r.worldLandmarks[0]) || lm;
  const J = {
    lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16,
    lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28,
  };
  const lElbow = vecAngle(W[J.lSh], W[J.lEl], W[J.lWr]);
  const rElbow = vecAngle(W[J.rSh], W[J.rEl], W[J.rWr]);
  const lKnee = vecAngle(W[J.lHip], W[J.lKn], W[J.lAn]);
  const rKnee = vecAngle(W[J.rHip], W[J.rKn], W[J.rAn]);

  const fmt = (v) => (v === null || isNaN(v)) ? '—' : v.toFixed(0) + '°';
  drawLabel(`关节点 33　肘 ${fmt(lElbow)}/${fmt(rElbow)}`, 20, canvas.height - 18);

  let html = statRow('关节点', '33 个');
  html += `<div class="divider"></div><div class="empty" style="padding:2px 0">关节角度（画面左 / 画面右）</div>`;
  html += statRow('左肘', fmt(lElbow)) + statRow('右肘', fmt(rElbow));
  html += statRow('左膝', fmt(lKnee)) + statRow('右膝', fmt(rKnee));

  // 伸展提示，让课堂讲解有抓手
  const tips = [];
  if (lElbow !== null && lElbow > 155) tips.push('左臂伸直');
  if (rElbow !== null && rElbow > 155) tips.push('右臂伸直');
  if (lKnee !== null && lKnee < 110) tips.push('左膝深蹲');
  if (rKnee !== null && rKnee < 110) tips.push('右膝深蹲');
  if (tips.length) html += `<div class="divider"></div>` + statRow('判定', tips.join('、'));
  return html;
}

/* ---- 物体 ---- */
function drawObject(task, ts) {
  const r = task.detectForVideo(video, ts);
  const D = r.detections;

  if (!D || !D.length) {
    drawLabel('未检测到物体', 24, canvas.height - 24, '#f59e0b');
    return statRow('状态', '未检测到物体') + statRow('提示', '试试杯子、手机、书本');
  }

  const rows = [];
  D.forEach((d) => {
    const b = d.boundingBox;
    const c = d.categories && d.categories[0];
    const en = c ? c.categoryName : '?';
    const cn = COCO_CN[en] || en;
    const pct = c ? Math.round(c.score * 100) : 0;

    ctx.strokeStyle = '#2dd4bf';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(b.originX, b.originY, b.width, b.height);
    ctx.fillStyle = 'rgba(45,212,191,.10)';
    ctx.fillRect(b.originX, b.originY, b.width, b.height);
    drawLabel(`${cn} ${pct}%`, b.originX, b.originY - 2, '#7dfff0');
    rows.push({ cn, pct });
  });

  drawLabel(`检测到 ${D.length} 个物体`, 20, canvas.height - 18);

  let html = statRow('检测到', D.length + ' 个');
  html += `<div class="divider"></div>`;
  html += rows
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6)
    .map((r) => barRow(r.cn, r.pct / 100, r.pct))
    .join('');
  return html;
}

/* ---- 手势 ---- */
function detectCustomGesture(lm) {
  if (!lm || lm.length < 21) return null;
  const dist = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
  const extended = (tip, pip, mcp) => dist(tip, mcp) > dist(pip, mcp) * 1.5;
  const iE = extended(8, 6, 5), mE = extended(12, 10, 9);
  const rE = extended(16, 14, 13), pE = extended(20, 18, 17);
  const thumbOut = dist(4, 5) > 0.1;
  const pinchDist = dist(4, 8);

  if (pinchDist < 0.08 && mE && rE && pE) return 'OK';
  if (pinchDist < 0.08 && !mE && !rE && !pE) return 'Pinch';
  if (iE && !mE && !rE && pE) return 'Rock';
  if (thumbOut && !iE && !mE && !rE && pE) return 'Call_Me';
  if (iE && mE && !rE && !pE && !thumbOut) return 'Two';
  if (iE && !mE && !rE && !pE && !thumbOut) return 'One';
  if (iE && mE && rE && !pE && !thumbOut) return 'Three';
  if (iE && mE && rE && pE && !thumbOut) return 'Four';
  if (thumbOut && iE && !mE && !rE && !pE) return 'Eight';
  return null;
}

function drawGesture(task, ts) {
  const r = task.recognizeForVideo(video, ts);
  const L = r.landmarks;

  if (!L || !L.length) {
    drawLabel('未检测到手', 24, canvas.height - 24, '#f59e0b');
    return statRow('状态', '未检测到手');
  }

  const items = [];
  L.forEach((lm, i) => {
    drawingUtils.drawConnectors(lm, MP.HandLandmarker.HAND_CONNECTIONS, { color: '#2dd4bf', lineWidth: 4 });
    drawingUtils.drawLandmarks(lm, { color: '#ff5c5c', radius: 3 });

    let name = null, score = 0, source = '原生';
    const g = r.gestures && r.gestures[i] && r.gestures[i][0];
    if (g && g.categoryName !== 'None' && g.score > 0.5) {
      name = g.categoryName; score = g.score;
    } else {
      const cg = detectCustomGesture(lm);
      if (cg) { name = cg; score = 0.85; source = '规则'; }
    }

    const tip = lm[12];
    const label = name ? `${GESTURE_CN[name] || name}` : '未识别';
    drawLabel(label, tip.x * canvas.width + 10, tip.y * canvas.height - 6,
      name ? '#2dd4bf' : '#f59e0b');
    if (name) items.push({ label, score, source });
  });

  drawLabel(`检测到手：${L.length} 只`, 20, canvas.height - 18);

  let html = statRow('检测到手', L.length + ' 只');
  if (!items.length) {
    html += statRow('手势', '未识别');
  } else {
    items.forEach((it, i) => {
      html += statRow(`第 ${i + 1} 只`, GESTURE_CN[it.label] || it.label);
      html += statRow('　置信度', `${(it.score * 100).toFixed(0)} · ${it.source}`);
    });
  }
  return html;
}

/* ---- 人像去背 ---- */
function drawSegment(task, ts) {
  const r = task.segmentForVideo(video, ts);
  const mask = r.categoryMask;
  if (!mask) return statRow('状态', '分割失败');

  const data = mask.getAsUint8Array();
  const w = mask.width, h = mask.height;

  // 模型输入是正方形（保持比例 + 留白），先算出视频真正的有效区，
  // 否则 256×256 的遮罩直接拉伸到 1280×720 会整体错位。
  const vw = canvas.width, vh = canvas.height;
  const s = Math.min(w / vw, h / vh);
  const dw = vw * s, dh = vh * s;
  const dx = (w - dw) / 2, dy = (h - dh) / 2;

  const img = ctx.createImageData(w, h);
  let person = 0;
  const x0 = Math.floor(dx), x1 = Math.ceil(dx + dw);
  const y0 = Math.floor(dy), y1 = Math.ceil(dy + dh);
  const inner = Math.max(1, (x1 - x0) * (y1 - y0));

  for (let y = 0; y < h; y++) {
    const inRow = (y >= y0 && y < y1);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = i * 4;
      if (data[i] > 0) {
        if (inRow && x >= x0 && x < x1) person++;
        img.data[p + 3] = 0;                  // 人像：透明，露出底层视频
      } else {
        img.data[p] = 118;                    // 背景：紫
        img.data[p + 1] = 26;
        img.data[p + 2] = 138;
        img.data[p + 3] = 190;
      }
    }
  }

  if (!segTmp) segTmp = document.createElement('canvas');
  if (segTmp.width !== w || segTmp.height !== h) {
    segTmp.width = w;
    segTmp.height = h;
  }
  segTmp.getContext('2d').putImageData(img, 0, 0);
  ctx.drawImage(segTmp, dx, dy, dw, dh, 0, 0, vw, vh);
  mask.close();

  const ratio = person / inner;
  drawLabel(`人像占比 ${(ratio * 100).toFixed(0)}%`, 20, canvas.height - 18);

  let html = statRow('人像像素占比', (ratio * 100).toFixed(1) + '%');
  html += barRow('人像', ratio, (ratio * 100).toFixed(0));
  html += barRow('背景', 1 - ratio, ((1 - ratio) * 100).toFixed(0));
  html += `<div class="divider"></div><div class="empty" style="padding:2px 0">紫色区域即被判定为「背景」，视频会议换背景就是这一步</div>`;
  return html;
}

/* ---- 公用：骨架 + HUD ---- */
function drawPoseSkeleton(lm) {
  drawingUtils.drawLandmarks(lm, {
    radius: (d) => MP.DrawingUtils.lerp(d.from.z, -0.15, 0.1, 5, 1),
    color: '#2dd4bf', fillColor: '#2dd4bf',
  });
  drawingUtils.drawConnectors(lm, MP.PoseLandmarker.POSE_CONNECTIONS, {
    color: '#5eead4', lineWidth: 3,
  });
}

/* 左上角信息块：先恢复镜像，保证文字正着显示 */
function drawHud(rows, boxW, boxH) {
  ctx.save();
  if (mirrorChk.checked) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(16, 16, boxW, boxH, 10);
  else ctx.rect(16, 16, boxW, boxH);
  ctx.fillStyle = 'rgba(6,12,18,.8)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(45,212,191,.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textBaseline = 'top';
  let y = 28;
  rows.forEach((r) => {
    ctx.font = r.font;
    ctx.fillStyle = r.color;
    ctx.fillText(r.text, 32, y);
    y += r.gap;
  });
  ctx.restore();
}

/* ---- 举手 / 起立计数 ---- */
function drawRaise(task, ts) {
  const S = raiseState;
  const r = task.detectForVideo(video, ts);
  const L = r.landmarks;

  const hud = () => drawHud([
    { text: `举手　${S.raiseCount} 次`, font: '700 26px "Microsoft YaHei", sans-serif', color: '#2dd4bf', gap: 40 },
    { text: `起立　${S.standCount} 次`, font: '700 26px "Microsoft YaHei", sans-serif', color: '#5eead4', gap: 34 },
    {
      text: S.handUp ? `● 举手（${S.which}）` : '○ 放下',
      font: '600 15px "Microsoft YaHei", sans-serif',
      color: S.handUp ? '#fde047' : '#8ba0b5', gap: 0,
    },
  ], 236, 116);

  if (!L || !L.length) {
    hud();
    drawLabel('未检测到人体', 24, canvas.height - 24, '#f59e0b');
    return panelRaise('—');
  }

  const lm = L[0];
  drawPoseSkeleton(lm);

  /* 举手：手腕明显高过同侧肩 */
  const vis = (i) => (lm[i].visibility === undefined ? 1 : lm[i].visibility);
  const lUp = lm[15].y < lm[11].y - 0.04 && vis(15) > 0.5;
  const rUp = lm[16].y < lm[12].y - 0.04 && vis(16) > 0.5;
  const anyUp = lUp || rUp;

  if (anyUp) S.handFrames = Math.min(S.handFrames + 1, 8);
  else S.handFrames = Math.max(S.handFrames - 1, 0);

  if (!S.handUp && S.handFrames >= 4) {
    S.handUp = true;
    S.raiseCount++;
    const sideOfWrist = (i) => ((mirrorChk.checked ? 1 - lm[i].x : lm[i].x) < 0.5 ? '画面左' : '画面右');
    S.which = (lUp && rUp) ? '双手' : (lUp ? sideOfWrist(15) : sideOfWrist(16));
  } else if (S.handUp && S.handFrames === 0) {
    S.handUp = false;
  }

  /* 起立：膝关节由屈变直，用世界坐标算角度更稳 */
  const W = (r.worldLandmarks && r.worldLandmarks[0]) || lm;
  const legVis = Math.min(vis(25), vis(26), vis(27), vis(28));
  const kneeL = vecAngle(W[23], W[25], W[27]);
  const kneeR = vecAngle(W[24], W[26], W[28]);
  const knee = (kneeL != null && kneeR != null) ? (kneeL + kneeR) / 2 : (kneeL != null ? kneeL : kneeR);
  const legOk = legVis > 0.5 && knee != null;

  let kneeText = '腿部未入镜';
  if (legOk) {
    kneeText = knee.toFixed(0) + '°';
    if (knee > 155) {
      S.standFrames = Math.min(S.standFrames + 1, 12);
      S.sitFrames = Math.max(S.sitFrames - 1, 0);
    } else if (knee < 125) {
      S.sitFrames = Math.min(S.sitFrames + 1, 12);
      S.standFrames = Math.max(S.standFrames - 1, 0);
    }
    if (S.standFrames >= 6) {
      if (S.sitState === 'sit') S.standCount++;
      S.sitState = 'stand';
    } else if (S.sitFrames >= 6) {
      S.sitState = 'sit';
    }
  }

  hud();
  if (S.handUp) {
    // 高亮举起的那只手
    const idx = lUp ? 15 : 16;
    ctx.beginPath();
    ctx.arc(lm[idx].x * canvas.width, lm[idx].y * canvas.height, 26, 0, Math.PI * 2);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  return panelRaise(legOk ? kneeText : '腿部未入镜');
}

function panelRaise(kneeText) {
  const S = raiseState;
  let html = statRow('当前', S.handUp ? `举手 · ${S.which}` : '放下');
  html += statRow('举手次数', S.raiseCount + ' 次');
  html += statRow('起立次数', S.standCount + ' 次');
  html += statRow('体位', S.sitState === 'stand' ? '站立' : (S.sitState === 'sit' ? '坐姿' : '未判定'));
  html += statRow('膝关节', kneeText);
  html += '<div class="divider"></div>';
  html += '<div class="empty" style="padding:2px 0">手腕高过同侧肩＝举手；膝角 &gt;155° 为站立、&lt;125° 为坐姿。都需连续多帧确认，避免抖动多算。</div>';
  html += '<button class="mini" data-act="reset-raise">清零计数</button>';
  return html;
}

/* ---- 坐姿检测 ---- */
function drawPosture(task, ts) {
  const P = postureState;
  const r = task.detectForVideo(video, ts);
  const L = r.landmarks;

  if (!L || !L.length) {
    P.lastTick = 0;
    drawLabel('未检测到人体', 24, canvas.height - 24, '#f59e0b');
    return statRow('状态', '未检测到人体') + statRow('提示', '请坐到画面中，露出上半身');
  }

  const lm = L[0];
  drawPoseSkeleton(lm);

  const nose = lm[0], lSh = lm[11], rSh = lm[12];
  const shMidX = (lSh.x + rSh.x) / 2;
  const shMidY = (lSh.y + rSh.y) / 2;
  const sw = Math.hypot(rSh.x - lSh.x, rSh.y - lSh.y) || 0.001;

  /* 肩线倾角归一到 -90~90，避免左右肩对调时跳到 180 */
  let shAngle = Math.atan2(rSh.y - lSh.y, rSh.x - lSh.x) * 180 / Math.PI;
  if (shAngle > 90) shAngle -= 180;
  if (shAngle < -90) shAngle += 180;

  const headDx = (nose.x - shMidX) / sw;      // 头相对肩中点的横向偏移（以肩宽为单位）
  const headDrop = (shMidY - nose.y) / sw;    // 头到肩的距离（变小＝低头/含胸）
  const cur = { shAngle, headDx, headDrop, sw };

  /* 校准阶段：记录正常坐姿基线 */
  if (!P.base) {
    P.calibBuf.push(cur);
    const n = P.calibBuf.length;
    const pct = Math.min(1, n / P.CALIB_FRAMES);

    ctx.save();
    if (mirrorChk.checked) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.fillStyle = 'rgba(245,158,11,.18)';
    ctx.fillRect(0, canvas.height - 8, canvas.width * pct, 8);
    ctx.restore();
    drawLabel(`校准中 ${Math.round(pct * 100)}%`, 20, canvas.height - 18, '#f59e0b');

    if (n >= P.CALIB_FRAMES) {
      const avg = (k) => P.calibBuf.reduce((a, b) => a + b[k], 0) / n;
      P.base = { shAngle: avg('shAngle'), headDx: avg('headDx'), headDrop: avg('headDrop'), sw: avg('sw') };
      P.calibBuf = [];
      P.score = 100;
      P.badMs = 0;
    }
    let h = statRow('状态', '正在校准基线');
    h += statRow('进度', `${n} / ${P.CALIB_FRAMES} 帧`);
    h += '<div class="empty" style="padding:6px 0">保持你认为正常的坐姿约 2 秒，这段时间会作为基准。</div>';
    return h;
  }

  /* 四项偏离量 */
  const dAngle = Math.abs(shAngle - P.base.shAngle);
  const dHeadDx = Math.abs(headDx - P.base.headDx);
  const dDrop = P.base.headDrop - headDrop;      // >0 表示头比基线更低
  const dNear = sw / P.base.sw;                  // >1 表示离镜头更近

  const penLean = dAngle > 6 ? Math.min(25, (dAngle - 6) * 2.2) : 0;
  const penHead = dHeadDx > 0.12 ? Math.min(30, (dHeadDx - 0.12) * 80) : 0;
  const penDrop = dDrop > 0.05 ? Math.min(30, (dDrop - 0.05) * 200) : 0;
  const penNear = dNear > 1.3 ? Math.min(20, (dNear - 1.3) * 50) : 0;

  const raw = 100 - penLean - penHead - penDrop - penNear;
  P.score = P.score * 0.85 + raw * 0.15;         // 平滑，避免分数乱跳

  const now = performance.now();
  if (P.score < 65) {
    if (P.lastTick) P.badMs += now - P.lastTick;
    P.lastTick = now;
  } else {
    P.lastTick = now;
    P.badMs = Math.max(0, P.badMs - 400);
  }

  /* 两条参考竖线：偏离看得见 */
  ctx.save();
  ctx.setLineDash([6, 7]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(45,212,191,.55)';
  ctx.beginPath();
  ctx.moveTo(shMidX * canvas.width, shMidY * canvas.height);
  ctx.lineTo(shMidX * canvas.width, 0);
  ctx.stroke();
  ctx.strokeStyle = P.score < 65 ? 'rgba(239,68,68,.8)' : 'rgba(250,204,21,.75)';
  ctx.beginPath();
  ctx.moveTo(nose.x * canvas.width, nose.y * canvas.height);
  ctx.lineTo(nose.x * canvas.width, 0);
  ctx.stroke();
  ctx.restore();

  const good = P.score >= 85, bad = P.score < 65;
  const color = good ? '#2dd4bf' : (bad ? '#ef4444' : '#f59e0b');
  const verdict = good ? '坐姿良好' : (bad ? '坐姿不良，请调整' : '略有偏差');

  drawHud([
    { text: `坐姿分 ${Math.round(P.score)}`, font: '700 30px "Microsoft YaHei", sans-serif', color, gap: 40 },
    { text: verdict, font: '600 16px "Microsoft YaHei", sans-serif', color, gap: 26 },
    {
      text: P.badMs > 10000 ? `已持续 ${(P.badMs / 1000).toFixed(0)} 秒` : `已持续不良 ${(P.badMs / 1000).toFixed(0)} 秒`,
      font: '600 14px "Microsoft YaHei", sans-serif',
      color: '#8ba0b5', gap: 0,
    },
  ], 300, 118);

  let html = barRow('综合评分', P.score / 100, Math.round(P.score));
  html += '<div class="divider"></div>';
  html += barRow('肩线倾斜', Math.min(1, dAngle / 30), dAngle.toFixed(0) + '°');
  html += barRow('头部偏移', Math.min(1, dHeadDx / 0.6), (dHeadDx * 100).toFixed(0) + '%');
  html += barRow('低头程度', Math.min(1, Math.max(0, dDrop) / 0.4), (Math.max(0, dDrop) * 100).toFixed(0) + '%');
  html += barRow('距屏远近', Math.min(1, Math.max(0, dNear - 1) / 0.8), Math.round(dNear * 100) + '%');
  html += '<div class="divider"></div>';
  html += `<div class="empty" style="padding:2px 0">四项偏离都以校准基线为零点：头部两项按肩宽折算成百分比，距屏远近 100% 表示与基线一致、越大越近。</div>`;
  html += '<button class="mini" data-act="reset-posture">重新校准</button>';
  return html;
}

/* ---------------- 交互 ---------------- */

function switchMode(mode) {
  if (mode === currentMode) return;
  currentMode = mode;
  lastVideoTime = -1;
  statsHtml = '';
  // 换到坐姿模式时重新校准基线（位置可能已经变了）
  if (mode === 'posture') {
    postureState.base = null;
    postureState.calibBuf = [];
    postureState.score = 100;
    postureState.badMs = 0;
    postureState.lastTick = 0;
  }
  document.querySelectorAll('.mode-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  panelTitle.textContent = MODES[mode].title;
  panelDesc.textContent = MODES[mode].desc;
  statsEl.innerHTML = '<div class="empty">加载模型…</div>';

  if (running) setStatus('加载模型…', 'warn');

  ensureTask(mode).then(() => {
    if (running) setStatus('就绪', 'ok');
  }).catch((e) => {
    console.error(e);
    statsEl.innerHTML = `<div class="empty" style="color:#f59e0b">模型加载失败：${e.message || e}</div>`;
    setStatus('模型加载失败', 'warn');
  });
}

modeBar.addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-btn');
  if (btn) switchMode(btn.dataset.mode);
});

startBtn.addEventListener('click', () => {
  if (running) stopCamera();
  else startCamera();
});

snapBtn.addEventListener('click', () => {
  canvas.toBlob((blob) => {
    const a = document.createElement('a');
    const t = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    a.download = `mediapipe-${currentMode}-${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}.png`;
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
});

mirrorChk.addEventListener('change', () => {
  statsHtml = '';
});

/* 面板内的按钮（面板 HTML 会周期性重建，所以用事件委托） */
statsEl.addEventListener('click', (e) => {
  const act = e.target.dataset && e.target.dataset.act;
  if (!act) return;
  if (act === 'reset-raise') {
    raiseState.raiseCount = 0;
    raiseState.standCount = 0;
    raiseState.handUp = false;
    raiseState.handFrames = 0;
    raiseState.sitFrames = 0;
    raiseState.standFrames = 0;
    raiseState.sitState = null;
  } else if (act === 'reset-posture') {
    postureState.base = null;
    postureState.calibBuf = [];
    postureState.score = 100;
    postureState.badMs = 0;
    postureState.lastTick = 0;
  }
  statsHtml = '';
});

camSelect.addEventListener('change', () => {
  if (running) {
    stopCamera();
    setTimeout(startCamera, 180);
  }
});

/* 课堂演示快捷键：1-8 切模式，空格启停，F 全屏 */
const MODE_ORDER = ['face', 'hands', 'pose', 'gesture', 'object', 'segment', 'raise', 'posture'];
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;

  if (e.key >= '1' && e.key <= '8') {
    switchMode(MODE_ORDER[Number(e.key) - 1]);
    e.preventDefault();
  } else if (e.code === 'Space') {
    if (running) stopCamera(); else startCamera();
    e.preventDefault();
  } else if (e.key === 'f' || e.key === 'F') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
    e.preventDefault();
  }
});

/* ---------------- 启动 ---------------- */

panelTitle.textContent = MODES.face.title;
panelDesc.textContent = MODES.face.desc;

(async function boot() {
  showOverlay('<div class="spinner"></div><div>正在加载本地 MediaPipe 运行时…</div>');
  setStatus('初始化…', 'warn');
  try {
    await initRuntime();
    setStatus('运行时就绪', 'ok');
    await listCameras();
    // 预加载首个模型，避免用户点开摄像头后还要再等
    showOverlay('<div class="spinner"></div><div>正在加载「' + MODES[currentMode].title + '」模型…</div>');
    await ensureTask(currentMode).catch((e) => console.warn('预加载失败', e));
    showOverlay('<div class="big">点击右上角「开启摄像头」</div><div>画面只在本机处理，不会上传任何数据</div>');
    if (running) setStatus('就绪', 'ok');

    // 可选参数：?mode=gesture 直接进某模式，&autostart=1 自动开摄像头
    const qs = new URLSearchParams(location.search);
    const wantMode = qs.get('mode');
    if (wantMode && MODES[wantMode] && wantMode !== currentMode) {
      switchMode(wantMode);
    }
    if (qs.get('autostart') === '1') {
      startCamera();
    }
  } catch (e) {
    console.error(e);
    fatal = e;
    showOverlay(
      '<div class="big" style="color:#f59e0b">运行时加载失败</div>' +
      '<div style="max-width:560px;line-height:1.7">' +
      '请确认通过 <code style="color:#2dd4bf">start.bat</code> 启动（或访问 http://localhost:8777），' +
      '不要直接双击 index.html —— 浏览器会阻止本地文件加载 WASM。<br>' +
      '错误信息：' + (e.message || e) + '</div>'
    );
    setStatus('加载失败', 'warn');
  }
})();

/* 调试钩子：浏览器控制台里可用 __mp 查看内部状态、切换模式 */
window.__mp = {
  MODES,
  tasks,
  raiseState,
  postureState,
  switchMode,
  get mode() { return currentMode; },
  get running() { return running; },
};
