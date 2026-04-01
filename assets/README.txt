把你制作好的图片按下面命名放到 `assets/` 目录即可自动加载。

- `cat-run-1.png`：主角行驶动画第 1 帧（可选）
- `cat-run-2.png`：主角行驶动画第 2 帧（可选）
- `cat-run-3.png`：主角行驶动画第 3 帧（可选）
- `cat-jump.png`：跳跃（可选）
- `cat-dead.png`：撞击倒地（可选）
- `egg.png`：白色鸵鸟蛋（可选）
- `seagull-1.png`：海鸥扇翼动画第 1 帧（可选）
- `seagull-2.png`：海鸥扇翼动画第 2 帧（可选）
- `seagull-3.png`：海鸥扇翼动画第 3 帧（可选）
- `mountain.png`、`ground-tile.png`、`sky-tile.png`：背景图（可选；当前版本即使没有也能用程序化背景）

UI（游戏外文字按钮，用图替换会更“完整专业”；缺失则自动回退为文字）
- `ui-title.png`：游戏大标题（可选）
- `ui-hint.png`：菜单提示文案（可选）
- `ui-start-btn.png`：开始游戏按钮（可选）
- `ui-gameover.png`：GAME OVER 大字（可选）
- `ui-retry-btn.png`：再来一次按钮（可选）

如果图片缺失，游戏会自动回退到 Canvas 占位绘制，保证你能先把手感跑起来。

切图尺寸建议（像素 px）
说明：代码会根据窗口高度动态缩放绘制。为避免你做多套分辨率，下面给“推荐基准尺寸”，按这个尺寸切图最省事；在其他分辨率下会按比例缩放。

假设窗口高度 `H = 800px`（常见手机/PC 预览都接近这个量级）：
- 主角（骑车）三帧：`cat-run-1/2/3.png` 建议 `80 x 112`
- 主角跳跃：`cat-jump.png` 建议 `80 x 112`
- 主角撞击倒地：`cat-dead.png` 建议 `80 x 112`
- 海鸥三帧：`seagull-1/2/3.png` 建议 `64 x 36`
- 鸵鸟蛋：`egg.png` 建议 `44 x 70`（代码中蛋宽约 `H*0.055`，并按比例换算高度；你也可以让透明边留白用于更好观看）

UI（不随游戏缩放，按 CSS 宽度/高度上限做轻微适配；仍建议按下面尺寸切图）
- `ui-title.png`：`440 x 120`
- `ui-hint.png`：`360 x 36`
- `ui-start-btn.png`：`320 x 54`
- `ui-gameover.png`：`420 x 100`
- `ui-retry-btn.png`：`320 x 54`

