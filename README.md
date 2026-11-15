# MediaPipe 视觉实验室 · 离线版

把 [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/vision_task) 的六个视觉模型 + 两个教学化衍生模式，做成一个**完全离线、不联网、不装依赖**的本地网页。

面向的场景很具体：**中小学机房没有外网**，但课上要演示人脸网格、手部追踪、姿态检测。原版在线 demo 一断网就白屏，这个不会——模型、wasm 运行时全部在仓库里。

## 为什么需要离线版

| 障碍 | 在线 demo | 本项目 |
| --- | --- | --- |
| 机房断外网 | 页面加载不出来 | 全部本地文件，零请求外发 |
| CDN 被墙 / 限速 | wasm 卡在 60% | 无 CDN 依赖 |
| 学生摄像头画面上传 | 走云端推理 | 数据不出本机 |
| 安装 Python / pip | 要求环境 | 只要有浏览器 + Node（或任意静态服务器） |

## 快速开始

**Windows**：双击 `start.bat`，浏览器自动打开 `http://127.0.0.1:8777`，点右上角「开启摄像头」。

**其他平台**：

```bash
node server.js          # 默认 127.0.0.1:8777
# 或者任意静态服务器，例如
python -m http.server 8777
```

> 必须用 HTTP 打开，不能双击 `index.html`。浏览器只允许 `https` 或 `localhost` 下访问摄像头，`file://` 会被拒。

首次进入某个模式需要下载模型到内存（手势识别 8.4MB 最大），本机读盘约 0.5 秒；之后切换模式即时。

## 八个模式

| 模式 | 底层模型 | 输出 | 课堂看点 |
| --- | --- | --- | --- |
| 面部网格 Face | FaceLandmarker | 478 个关键点 + 52 组表情系数 | 眨眼、张嘴被量化成数值 |
| 手部追踪 Hands | HandLandmarker | 每只手 21 个关键点 | 关节编号与骨骼连线 |
| 姿态检测 Pose | PoseLandmarker (lite) | 33 个人体关键点 | 肩、肘、腕、髋、膝的坐标 |
| 手势识别 Gesture | GestureRecognizer | 内置手势 + 8 种自定义手势 | 置信度是什么 |
| 物体检测 Object | EfficientDet-Lite0 | COCO 80 类，带框与分数 | 「识别」= 分类 + 定位 |
| 人像去背 Segment | SelfieSegmenter | 256×256 前景掩膜 | 像素级分割与边缘处理 |
| **举手计数 Raise** | Pose 派生 | 左右手分别计数 | 判定阈值怎么定 |
| **坐姿检测 Posture** | Pose 派生 | 0–100 分 + 四项扣分 | 标准姿态由谁定义 |

后两个是本项目在原始 demo 上新增的，专门为教学准备——它们把「模型输出坐标」到「系统下结论」中间那一步（**判定规则**）显式暴露出来。

### 举手计数怎么判的

取姿态模型给出的肩、腕关键点，比较**纵向位置**：

```js
const dL = lm[11].y - lm[15].y;   // 左肩 y − 左腕 y
const dR = lm[12].y - lm[16].y;   // 右肩 y − 右腕 y
const d  = Math.max(dL, dR);      // 世界坐标 y 向下为正，故 d > 0 表示腕高于肩
const rawUp = d > P.thresh;       // P.thresh 默认 0.04
```

两条防抖设计：

- **确认帧数** `P.frames`（默认 4）：连续 N 帧都满足才算举手，避免手抖跳数。
- **计数器爬升上限** `CAP = max(P.frames, 10)`：手一直举着时计数器有上限，不会无限堆积，手放下后才清零。

### 坐姿检测怎么算的

启动后先用 **70 帧**采集基准（学生坐正时按提示标定），之后按四项指标扣分：

| 指标 | 判定 | 扣分 |
| --- | --- | --- |
| 肩线倾斜 | 左右肩连线与水平夹角 | 越大扣越多 |
| 头部横偏 | 鼻尖 x 相对双肩中点 | 偏离中线扣分 |
| 头部下沉 | 鼻尖 y 相对基线 | 低头/趴桌扣分 |
| 距离过近 | 双肩像素宽度相对基线 | 离屏幕太近扣分 |

总分 `100 − 四项扣分`，再做 0.85/0.15 的指数平滑，避免数字乱跳。

**注意**：这四项的阈值是经验值，不是医学标准。它的教学价值恰好在于——学生可以质疑「凭什么这么定」，而这正是人工智能课上该问的问题。

## 目录结构

```
.
├── index.html          界面骨架，八个模式按钮
├── app.js            核心逻辑：模型加载、推理、八种绘制、两套状态机
├── style.css
├── server.js         静态服务器（含 .wasm/.task/.tflite 的 MIME）
├── start.bat         Windows 一键启动
├── models/           六个模型文件，32MB
│   ├── face_landmarker.task
│   ├── hand_landmarker.task
│   ├── pose_landmarker_lite.task
│   ├── gesture_recognizer.task
│   ├── efficientdet_lite0.tflite
│   └── selfie_segmenter.tflite
├── vendor/           运行时，18MB
│   ├── vision_bundle.js
│   └── wasm/         SIMD 与 no-SIMD 两套，按浏览器能力自动选
├── _selftest.html    六模型自检页
└── _fetch_assets.py  资源下载与校验脚本
```

## 离线是怎么做到的

MediaPipe 默认从 Google CDN 拉 wasm 与模型。改成离线只需要两步：

```js
const BASE = new URL('./', location.href).href;   // 转成绝对路径，避免子路径下解析错

const fileset = await FilesetResolver.forVisionTasks(BASE + 'vendor/wasm');
const model   = await HandLandmarker.createFromOptions(fileset, {
  baseOptions: { modelAssetPath: BASE + 'models/hand_landmarker.task', delegate: 'GPU' },
  runningMode: 'VIDEO',
  numHands: 2,
});
```

`BASE` 必须是绝对 URL——`forVisionTasks` 内部会用它拼 wasm 路径，相对路径在嵌套路由下会解析错。

GPU 初始化失败时自动回退 CPU：

```js
try { return await create('GPU'); }
catch { return await create('CPU'); }
```

视频帧时间戳必须严格递增，否则模型会抛错。用 `Math.max(performance.now(), lastTs + 1)` 兜底，避免同一毫秒内多次调用。

## 两个容易踩的坑

**人像去背的掩膜要对齐。** `selfie_segmenter` 输出的是 256×256 正方形掩膜，直接拉伸到 16:9 画面会错位。要按 letterbox 比例反算：

```js
const s  = Math.min(w / vw, h / vh);
const dw = vw * s, dh = vh * s;
const dx = (w - dw) / 2, dy = (h - dh) / 2;
ctx.drawImage(segTmp, dx, dy, dw, dh, 0, 0, vw, vh);
```

**镜像画面里的文字会反。** 画布整体 `ctx.scale(-1, 1)` 后，标签文字也会镜像。所以每段文字前先 `ctx.save()` + 复位变换，写完再 `restore()`。

## 浏览器要求

| 浏览器 | 状态 |
| --- | --- |
| Chrome / Edge 90+ | 推荐，走 GPU delegate |
| Firefox | 可用，部分模型回退 CPU，帧率下降 |
| Safari 16+ | 可用，首次授权较慢 |
| IE / 旧版国产双核 | 不支持（需要 WebAssembly + WebGL） |

## 隐私

摄像头画面**只在本机内存中处理**，不做任何网络请求，不写磁盘。截图功能是主动保存到你本地的 PNG。断网也能完整运行——这本身就是隐私性最好的证明。

## 模型来源与许可

模型与运行时均来自 Google MediaPipe 官方发行，遵循 **Apache License 2.0**：

- 运行时：`@mediapipe/tasks-vision@0.10.0`
- 模型：MediaPipe Solutions 官方 `.task` / `.tflite` 发行包

`models/` 与 `vendor/` 是按 Apache 2.0 再分发的原始文件，未做修改。

## 自检

想确认六个模型在本机都能跑：打开 `http://127.0.0.1:8777/_selftest.html`，它会依次创建六个模型并各跑一次真实推理，最后汇总 `ALL PASS` 或列出失败项。

重新拉取资源（例如模型文件损坏时）：

```bash
python _fetch_assets.py
```

脚本按 `Content-Length` 校验完整性，不靠猜的文件大小阈值。

## 已知限制

- **只支持单摄像头画面**，没有多路输入。
- **姿态/手势在弱光下会掉帧**，机房光线不足时建议补一盏灯。
- **坐姿检测需要先标定**，换人换座位要重新标定，否则分数没意义。
- **不做人脸身份识别**，478 个关键点只描述几何形状，不指向任何具体个人。

## 相关项目

同一作者的高中信息技术优质课配套材料：`AI优质课-机器如何看见手`——把本项目的举手计数模式改造成「可调阈值」的学生实验台，配教学设计、任务单与技术说明。
