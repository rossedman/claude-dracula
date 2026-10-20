#!/usr/bin/env python3
"""Synthesize the mod's extra sound cues into sounds/ (stdlib only).

sounds/toll.wav    a low minor organ chord, for a tool that errors
sounds/flap.wav    a few soft wing beats, for a long shell command that finishes
sounds/rise.wav    a rising organ arpeggio, for an approved plan

Usage: python3 scripts/sounds.py [out-dir]
"""
import math
import random
import struct
import sys
import wave
from pathlib import Path

RATE = 22050


def organ(freq, t):
    """A drawbar-style organ voice: the fundamental plus a few octaves and a fifth."""
    return (
        math.sin(2 * math.pi * freq * t)
        + 0.5 * math.sin(2 * math.pi * freq * 2 * t)
        + 0.3 * math.sin(2 * math.pi * freq * 3 * t)
        + 0.2 * math.sin(2 * math.pi * freq * 4 * t)
    ) / 2.0


def envelope(t, length, attack=0.04, release=0.5):
    if t < attack:
        return t / attack
    if t > length - release:
        return max(0.0, (length - t) / release)
    return 1.0


def toll():
    length = 1.6
    notes = [65.41, 77.78, 98.0]  # C2, E-flat 2, G2: C minor
    out = []
    for i in range(int(RATE * length)):
        t = i / RATE
        vibrato = 1 + 0.004 * math.sin(2 * math.pi * 5.5 * t)
        sample = sum(organ(f * vibrato, t) for f in notes) / len(notes)
        out.append(sample * envelope(t, length, 0.06, 0.9) * 0.8)
    return out


def flap():
    random.seed(13)
    length = 0.55
    beats = [0.0, 0.16, 0.3]
    out = []
    low = 0.0
    for i in range(int(RATE * length)):
        t = i / RATE
        noise = random.uniform(-1, 1)
        low += 0.08 * (noise - low)  # a soft, papery low-pass
        level = 0.0
        for start in beats:
            dt = t - start
            if 0 <= dt < 0.12:
                level += math.sin(math.pi * dt / 0.12) ** 2
        out.append(low * level * 2.2)
    return out


def rise():
    notes = [261.63, 311.13, 392.0, 523.25]  # C4, E-flat 4, G4, C5
    step = 0.16
    length = step * len(notes) + 0.9
    out = []
    for i in range(int(RATE * length)):
        t = i / RATE
        sample = 0.0
        for n, freq in enumerate(notes):
            start = n * step
            if t >= start:
                sample += organ(freq, t - start) * envelope(t - start, length - start, 0.03, 0.7)
        out.append(sample / len(notes) * 0.9)
    return out


def write(path, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    scale = 0.85 / peak
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(s * scale * 32767)) for s in samples))
    print("wrote", path)


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "sounds")
    out.mkdir(parents=True, exist_ok=True)
    write(out / "toll.wav", toll())
    write(out / "flap.wav", flap())
    write(out / "rise.wav", rise())


if __name__ == "__main__":
    main()
