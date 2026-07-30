#!/usr/bin/env python
"""Build the committed Dead Ground atlases from isolated OpenAI master sprites."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance


DIRECTIONS = ("n", "ne", "e", "se", "s", "sw", "w", "nw")

SPECS = {
    "player": {
        "master": "player.png",
        "pose_plate": "player-poses.png",
        "file": "player-survivor.png",
        "cell": 72,
        "directions": 8,
        "clips": {
            "idle": (4, 5, True),
            "walk": (8, 10, True),
            "sprint": (8, 14, True),
            "fire": (6, 18, False),
            "melee": (8, 14, False),
            "hurt": (4, 14, False),
            "death": (8, 10, False),
        },
    },
    "walker": {
        "master": "walker.png",
        "pose_plate": "walker-poses.png",
        "file": "infected-walker.png",
        "cell": 72,
        "directions": 8,
        "clips": {
            "idle": (4, 4, True),
            "move": (8, 8, True),
            "attack": (6, 8, False),
            "hurt": (4, 14, False),
            "death": (8, 10, False),
        },
    },
    "runner": {
        "master": "runner.png",
        "pose_plate": "runner-poses.png",
        "file": "infected-runner.png",
        "cell": 72,
        "directions": 8,
        "clips": {
            "idle": (4, 6, True),
            "move": (8, 14, True),
            "attack": (6, 12, False),
            "hurt": (4, 16, False),
            "death": (8, 12, False),
        },
    },
    "brute": {
        "master": "brute.png",
        "pose_plate": "brute-poses.png",
        "file": "infected-brute.png",
        "cell": 72,
        "directions": 8,
        "clips": {
            "idle": (4, 3, True),
            "move": (8, 6, True),
            "attack": (8, 8, False),
            "hurt": (4, 12, False),
            "death": (8, 10, False),
        },
    },
    "screamer": {
        "master": "screamer.png",
        "pose_plate": "screamer-poses.png",
        "file": "infected-screamer.png",
        "cell": 72,
        "directions": 8,
        "clips": {
            "idle": (4, 4, True),
            "move": (8, 9, True),
            "attack": (6, 10, False),
            "hurt": (4, 14, False),
            "death": (8, 10, False),
            "special": (8, 14, False),
        },
    },
    "spitter": {
        "master": "spitter.png",
        "pose_plate": "spitter-poses.png",
        "file": "infected-spitter.png",
        "cell": 72,
        "directions": 8,
        "clips": {
            "idle": (4, 4, True),
            "move": (8, 7, True),
            "attack": (6, 9, False),
            "hurt": (4, 14, False),
            "death": (8, 10, False),
            "special": (8, 14, False),
        },
    },
    "armored": {
        "master": "armored.png",
        "pose_plate": "armored-poses.png",
        "file": "infected-armored.png",
        "cell": 72,
        "directions": 8,
        "clips": {
            "idle": (4, 3, True),
            "move": (8, 5, True),
            "attack": (8, 8, False),
            "hurt": (5, 12, False),
            "death": (8, 9, False),
        },
    },
    "alpha": {
        "master": "alpha.png",
        "pose_plate": "alpha-poses.png",
        "file": "infected-alpha.png",
        "cell": 72,
        "directions": 8,
        "clips": {
            "idle": (6, 4, True),
            "move": (8, 7, True),
            "attack": (8, 10, False),
            "hurt": (5, 14, False),
            "death": (12, 10, False),
        },
    },
    "vehicle": {
        "master": "vehicle.png",
        "file": "vehicle-expedition.png",
        "cell": 96,
        "directions": 1,
        "clips": {
            "parked": (1, 1, False),
            "idle": (4, 6, True),
            "drive": (6, 12, True),
            "disabled": (1, 1, False),
        },
    },
}

PLAYER_POSE_SEQUENCES = {
    "idle": (0, 0, 0, 0),
    "walk": (0, 1, 0, 2, 0, 1, 0, 2),
    "sprint": (1, 3, 2, 3, 1, 3, 2, 3),
    "fire": (0, 4, 4, 4, 0, 0),
    "melee": (0, 5, 5, 5, 0, 0, 0, 0),
    "hurt": (0, 6, 6, 0),
    "death": (0, 7, 7, 8, 8, 8, 8, 8),
}

INFECTED_POSE_SEQUENCES = {
    "idle": (0, 0, 0, 0, 0, 0),
    "move": (0, 1, 0, 2, 0, 1, 0, 2),
    "attack": (0, 3, 4, 4, 4, 0, 0, 0),
    "hurt": (0, 5, 5, 5, 0),
    "death": (0, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8),
    "special": (0, 6, 6, 6, 6, 6, 0, 0),
}


def crop_visible(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    box = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
    if box is None:
        raise ValueError("master has no visible pixels")
    return image.crop(box)


def contain(image: Image.Image, maximum: int) -> Image.Image:
    width, height = image.size
    diagonal = math.hypot(width, height)
    ratio = min(maximum / max(width, height), maximum * 1.12 / diagonal)
    size = (max(1, round(width * ratio)), max(1, round(height * ratio)))
    return image.resize(size, Image.Resampling.LANCZOS)


def centered_cell(sprite: Image.Image, cell: int) -> Image.Image:
    canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    x = (cell - sprite.width) // 2
    y = (cell - sprite.height) // 2
    canvas.alpha_composite(sprite, (x, y))
    return canvas


def load_pose_plate(path: Path, cell: int) -> list[Image.Image]:
    plate = Image.open(path).convert("RGBA")
    poses = []
    for row in range(3):
        top = round(row * plate.height / 3)
        bottom = round((row + 1) * plate.height / 3)
        for column in range(3):
            left = round(column * plate.width / 3)
            right = round((column + 1) * plate.width / 3)
            region = plate.crop((left, top, right, bottom))
            poses.append(centered_cell(contain(crop_visible(region), round(cell * .7)), cell))
    return poses


def pose_for_frame(entity: str, clip: str, frame: int, poses: list[Image.Image]) -> Image.Image:
    sequences = PLAYER_POSE_SEQUENCES if entity == "player" else INFECTED_POSE_SEQUENCES
    sequence = sequences.get(clip, (0,))
    index = sequence[min(frame, len(sequence) - 1)]
    return poses[index]


def transform_cell(cell_image: Image.Image, scale_x: float, scale_y: float, angle: float, dx: float, dy: float) -> Image.Image:
    width = max(1, round(cell_image.width * scale_x))
    height = max(1, round(cell_image.height * scale_y))
    transformed = cell_image.resize((width, height), Image.Resampling.BICUBIC)
    if angle:
        transformed = transformed.rotate(angle, Image.Resampling.BICUBIC, expand=False)
    canvas = Image.new("RGBA", cell_image.size, (0, 0, 0, 0))
    canvas.alpha_composite(
        transformed,
        (
            round((cell_image.width - width) / 2 + dx),
            round((cell_image.height - height) / 2 + dy),
        ),
    )
    return canvas


def tint(image: Image.Image, color: tuple[int, int, int], strength: float) -> Image.Image:
    overlay = Image.new("RGBA", image.size, (*color, 0))
    overlay.putalpha(image.getchannel("A").point(lambda alpha: round(alpha * strength)))
    return Image.alpha_composite(image, overlay)


def render_pose(base: Image.Image, entity: str, clip: str, frame: int, frames: int, articulated: bool = False) -> Image.Image:
    phase = frame / max(1, frames)
    cycle = math.sin(phase * math.pi * 2)
    stride = math.cos(phase * math.pi * 2)
    dx = dy = angle = 0.0
    scale_x = scale_y = 1.0

    if clip in {"idle", "parked"}:
        scale_x = 1 - cycle * .012
        scale_y = 1 + cycle * .018
        dy = cycle * .6
        dx = stride * .8
    elif clip in {"walk", "move"}:
        dx = stride * 1.6
        dy = -abs(cycle) * 2.1
        angle = cycle * 2.6
        scale_y = 1 + abs(cycle) * .025
    elif clip in {"sprint", "drive"}:
        dx = stride * 2.2
        dy = -abs(cycle) * 3.0
        angle = cycle * (1.4 if entity == "vehicle" else 4.2)
        scale_y = 1 + abs(cycle) * .04
    elif clip == "fire":
        recoil = max(0, 1 - frame / max(1, frames - 1))
        dy = recoil * 4.2
        scale_y = 1 - recoil * .035
    elif clip == "melee":
        swing = math.sin((frame / max(1, frames - 1)) * math.pi)
        angle = (-5 + swing * 10) if articulated else (-20 + swing * 43)
        dx = cycle * 2.2
        dy = -swing * 3
    elif clip == "attack":
        strike = math.sin((frame / max(1, frames - 1)) * math.pi)
        dy = -strike * 5.5
        scale_y = 1 + strike * .09
        scale_x = 1 - strike * .035
        angle = cycle * 3.5
    elif clip == "special":
        pulse = math.sin((frame / max(1, frames - 1)) * math.pi)
        scale_x = 1 + pulse * .1
        scale_y = 1 + pulse * .08
        dy = -pulse * 3
        angle = cycle * 2.2
        dx = stride * .8
    elif clip == "hurt":
        decay = 1 - frame / max(1, frames)
        dx = cycle * 4.2 * decay
        angle = cycle * 7 * decay
        scale_x = 1 - .05 * decay
    elif clip == "death":
        progress = frame / max(1, frames - 1)
        angle = progress * 4 if articulated else progress * 82
        scale_y = 1 - progress * (.04 if articulated else .32)
        scale_x = 1 + progress * (.02 if articulated else .08)
        dy = progress * (1 if articulated else 4)
    elif clip == "disabled":
        scale_x = .99
        scale_y = .99
    elif clip == "idle" and entity == "vehicle":
        dx = cycle * .7

    pose = transform_cell(base, scale_x, scale_y, angle, dx, dy)

    if clip == "fire" and frame <= 2:
        draw = ImageDraw.Draw(pose)
        flash = max(2, round(base.height * (.11 - frame * .02)))
        center = pose.width // 2
        draw.polygon(
            [(center, 2), (center - flash, 7 + flash), (center + flash, 7 + flash)],
            fill=(255, 224, 113, 235 - frame * 45),
        )
    if clip == "special":
        draw = ImageDraw.Draw(pose)
        progress = frame / max(1, frames - 1)
        radius = round(5 + math.sin(progress * math.pi) * 8)
        color = (135, 255, 105, 170) if entity == "spitter" else (181, 104, 220, 135)
        draw.ellipse(
            (
                pose.width // 2 - radius,
                pose.height // 2 - radius - 9,
                pose.width // 2 + radius,
                pose.height // 2 + radius - 9,
            ),
            outline=color,
            width=2,
        )
    if clip == "hurt":
        pose = tint(pose, (255, 74, 83), .16)
    if clip in {"death", "disabled"}:
        pose = ImageEnhance.Color(pose).enhance(.5 if clip == "death" else .22)
        pose = ImageEnhance.Brightness(pose).enhance(.92 if clip == "death" else .62)
        if clip == "death":
            progress = frame / max(1, frames - 1)
            alpha = pose.getchannel("A").point(lambda value: round(value * (1 - progress * .34)))
            pose.putalpha(alpha)
    return pose


def clean_transparent_rgb(image: Image.Image) -> Image.Image:
    image.putalpha(image.getchannel("A").point(lambda value: 0 if value <= 2 else value))
    clean = Image.new("RGBA", image.size, (0, 0, 0, 0))
    clean.alpha_composite(image)
    return clean


def build_atlas(entity: str, spec: dict, masters: Path, destination: Path) -> dict:
    master = Image.open(masters / spec["master"]).convert("RGBA")
    visible = crop_visible(master)
    cell = spec["cell"]
    base = centered_cell(contain(visible, round(cell * .7)), cell)
    pose_plate = spec.get("pose_plate")
    poses = load_pose_plate(masters / pose_plate, cell) if pose_plate else [base]
    clips = spec["clips"]
    max_frames = max(definition[0] for definition in clips.values())
    clip_count = len(clips)
    atlas = Image.new(
        "RGBA",
        (max_frames * cell, spec["directions"] * clip_count * cell),
        (0, 0, 0, 0),
    )
    clip_manifest = {}

    for clip_row, (clip, definition) in enumerate(clips.items()):
        frames, fps, loop = definition
        clip_manifest[clip] = {
            "row": clip_row,
            "frames": frames,
            "fps": fps,
            "loop": loop,
        }
        for direction in range(spec["directions"]):
            for frame in range(frames):
                source = pose_for_frame(entity, clip, frame, poses) if pose_plate else base
                pose = render_pose(source, entity, clip, frame, frames, articulated=bool(pose_plate))
                if spec["directions"] > 1:
                    pose = pose.rotate(-direction * 45, Image.Resampling.BICUBIC, expand=False)
                atlas.alpha_composite(pose, (frame * cell, (direction * clip_count + clip_row) * cell))

    atlas = clean_transparent_rgb(atlas)
    atlas = atlas.quantize(
        colors=256,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    ).convert("RGBA")
    atlas = clean_transparent_rgb(atlas)
    output = destination / spec["file"]
    atlas.save(output, "PNG", optimize=True, compress_level=9)
    return {
        "id": entity,
        "assetPath": f"./src/assets/sprites/{spec['file']}",
        "cell": cell,
        "directions": list(DIRECTIONS[: spec["directions"]]),
        "layout": "direction-major, then clip row, then frame column",
        "animationSource": "OpenAI-generated articulated 3x3 key poses" if pose_plate else "OpenAI-generated rigid orthographic master",
        "width": atlas.width,
        "height": atlas.height,
        "clips": clip_manifest,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--masters-dir", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "format": "dead-ground-sprite-atlas-v1",
        "source": "Original OpenAI-generated masters, locally normalized and animated",
        "directions": list(DIRECTIONS),
        "atlases": {},
    }
    for entity, spec in SPECS.items():
        manifest["atlases"][entity] = build_atlas(entity, spec, args.masters_dir, args.out_dir)
        print(f"Built {entity}: {spec['file']}")

    manifest_path = args.out_dir / "atlas-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {manifest_path}")


if __name__ == "__main__":
    main()
