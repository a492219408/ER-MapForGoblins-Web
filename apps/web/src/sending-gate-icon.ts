/**
 * 传送门图标在地图上的统一缩放值。
 *
 * 手动微调时只改这里：数值越大，地图上的传送门越大。
 */
export const SENDING_GATE_ICON_SCALE = 0.52;

/**
 * 游戏没有独立的“传送门”地图图标。这里参考传送门模型中心的圆形旋涡
 * 重绘项目自有图标：可用状态为蓝青色发光旋涡，不可用状态保留相同
 * 轮廓并转为灰色，避免与 NPC 任务图标混淆。
 */
export function createSendingGateIcon(available: boolean): ImageData {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器不支持传送门图标绘制');
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const center = size / 2;
  const palette = available
    ? {
        outer: '#183d58', middle: '#2f82ad', bright: '#9fe9ff', core: '#071a2b',
        glow: 'rgba(71, 190, 243, 0.56)',
      }
    : {
        outer: '#35393a', middle: '#626869', bright: '#a3a8a7', core: '#181b1b',
        glow: 'rgba(115, 121, 121, 0.24)',
      };

  const halo = context.createRadialGradient(center, center, 7, center, center, 29);
  halo.addColorStop(0, palette.glow);
  halo.addColorStop(0.7, available ? 'rgba(36, 128, 177, 0.18)' : 'rgba(80, 84, 84, 0.1)');
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = halo;
  context.fillRect(1, 1, size - 2, size - 2);

  const disc = context.createRadialGradient(27, 25, 2, center, center, 24);
  disc.addColorStop(0, palette.bright);
  disc.addColorStop(0.18, palette.middle);
  disc.addColorStop(0.55, palette.core);
  disc.addColorStop(0.78, palette.middle);
  disc.addColorStop(1, palette.outer);
  context.beginPath();
  context.arc(center, center, 23.5, 0, Math.PI * 2);
  context.fillStyle = disc;
  context.fill();
  context.strokeStyle = available ? '#b9edff' : '#aeb2b0';
  context.lineWidth = 1.35;
  context.stroke();

  // 用互相错开的弧线形成向中心卷入的旋涡，而不是规整的同心圆。
  const strokes = [
    { radius: 18.5, start: -0.45, sweep: 4.15, width: 2.6 },
    { radius: 14.2, start: 2.25, sweep: 4.25, width: 2.25 },
    { radius: 10.3, start: -1.15, sweep: 4.45, width: 2 },
    { radius: 6.4, start: 1.45, sweep: 4.6, width: 1.75 },
  ];
  for (const [index, stroke] of strokes.entries()) {
    context.beginPath();
    context.ellipse(
      center + (index % 2 === 0 ? -0.8 : 0.7),
      center + (index % 2 === 0 ? 0.5 : -0.6),
      stroke.radius,
      stroke.radius * 0.78,
      -0.32,
      stroke.start,
      stroke.start + stroke.sweep,
    );
    context.strokeStyle = index % 2 === 0 ? palette.bright : palette.middle;
    context.lineWidth = stroke.width;
    context.stroke();
  }

  context.beginPath();
  context.arc(center - 1, center, 3.1, 0, Math.PI * 2);
  context.fillStyle = palette.core;
  context.fill();
  context.strokeStyle = palette.bright;
  context.lineWidth = 1.25;
  context.stroke();

  return context.getImageData(0, 0, size, size);
}
