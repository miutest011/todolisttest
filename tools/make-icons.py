#!/usr/bin/env python3
"""生成 PWA 需要的应用图标（蓝底 + 白色对勾）。

不依赖任何第三方库，PNG 是手写编码的。想换颜色或图案，改下面的参数再重跑：

    python3 tools/make-icons.py
"""

import math
import struct
import zlib
from pathlib import Path

# 想换配色改这两行就行
BACKGROUND = (74, 144, 226)      # #4a90e2，和网页里的主色一致
FOREGROUND = (255, 255, 255)     # 白色对勾

# 对勾的三个折点，用 0~1 的比例表示，方便按尺寸缩放。
# 画在中间区域，这样安卓把图标裁成圆形时也不会切到
CHECK_POINTS = [(0.30, 0.52), (0.44, 0.66), (0.71, 0.36)]
STROKE_WIDTH = 0.09              # 线条粗细，同样是比例

OUTPUT_DIR = Path(__file__).resolve().parent.parent / 'icons'
SIZES = {
    'icon-192.png': 192,
    'icon-512.png': 512,
    'apple-touch-icon.png': 180,  # iPhone 添加到主屏幕时用这个
}

# 装成 iOS 应用时的图标（ios/ 那层壳用）。
# 这里不走 Xcode 的"图标目录"（Assets.xcassets），而是直接把几张 PNG 放进应用里、
# 在 Info.plist 的 CFBundleIconFiles 里列出来，系统按尺寸自己挑。
# 原因：图标目录要由 Xcode 的 actool 编译，而 actool 在"只装了 Xcode、没装模拟器运行环境"的机器上
# 会直接报错（真踩过：本机和 Xcode 里按 ▶️ 都过不去，而那是个 7GB 的下载）。这个老办法不需要它
IOS_DIR = Path(__file__).resolve().parent.parent / 'ios' / 'TodoList' / 'AppIcons'
IOS_ICONS = [40, 58, 60, 80, 87, 120, 180]


def distance_to_segment(px, py, x1, y1, x2, y2):
    """点到线段的最短距离，用来判断某个像素在不在线条上。"""
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(px - x1, py - y1)
    t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def draw_icon(size):
    """画一张图标，返回 RGBA 像素数据。"""
    radius = STROKE_WIDTH * size / 2
    points = [(x * size, y * size) for x, y in CHECK_POINTS]
    segments = list(zip(points, points[1:]))

    rows = bytearray()
    for y in range(size):
        for x in range(size):
            # 像素中心
            px, py = x + 0.5, y + 0.5
            nearest = min(
                distance_to_segment(px, py, p1[0], p1[1], p2[0], p2[1])
                for p1, p2 in segments
            )
            # 距离线条中心越近越不透明；边缘留 1 像素做平滑，否则会有锯齿
            alpha = max(0.0, min(1.0, radius + 0.5 - nearest))
            pixel = tuple(
                round(background * (1 - alpha) + foreground * alpha)
                for background, foreground in zip(BACKGROUND, FOREGROUND)
            )
            rows.extend(pixel)
            rows.append(255)      # 不透明
    return bytes(rows)


def write_png(path, size, pixels):
    """手写一个最简单的 PNG 文件。"""
    def chunk(tag, data):
        return (
            struct.pack('>I', len(data))
            + tag + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    # PNG 要求每行数据前面加一个字节表示"过滤方式"，0 表示不过滤
    raw = b''.join(
        b'\x00' + pixels[y * size * 4:(y + 1) * size * 4]
        for y in range(size)
    )

    header = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)  # 8 位 RGBA
    path.write_bytes(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', header)
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )


def write_ios_icons():
    """给 iOS 外壳写几张图标。文件名里的数字就是像素，系统按尺寸自己挑。"""
    if not IOS_DIR.parent.parent.exists():
        return            # 没有 ios/ 目录（只想要网页图标）就跳过
    IOS_DIR.mkdir(parents=True, exist_ok=True)

    for size in IOS_ICONS:
        write_png(IOS_DIR / f'Icon-{size}.png', size, draw_icon(size))
    print(f'ios/TodoList/AppIcons/  （{len(IOS_ICONS)} 张：{", ".join(str(s) for s in IOS_ICONS)}）')


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)
    for name, size in SIZES.items():
        path = OUTPUT_DIR / name
        write_png(path, size, draw_icon(size))
        print(f'{path.relative_to(OUTPUT_DIR.parent)}  ({size}x{size}, {path.stat().st_size} 字节)')
    write_ios_icons()


if __name__ == '__main__':
    main()
