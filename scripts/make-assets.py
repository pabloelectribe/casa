"""Genera los sonidos (WAV) y los íconos de pantalla de inicio. Ejecutar: python3 scripts/make-assets.py"""
import math, struct, wave
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RATE = 22050


def write_wav(path, samples):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s)) * 32000)) for s in samples))


def bell(freq, start, dur, total):
    """Campana: fundamental + armónicos inarmónicos con caída exponencial."""
    out = [0.0] * total
    for i in range(int(dur * RATE)):
        t = i / RATE
        env = math.exp(-t * 4.5) * min(1, t * 200)
        v = (math.sin(2 * math.pi * freq * t)
             + 0.45 * math.sin(2 * math.pi * freq * 2.76 * t) * math.exp(-t * 3)
             + 0.25 * math.sin(2 * math.pi * freq * 5.4 * t) * math.exp(-t * 6))
        j = int(start * RATE) + i
        if j < total:
            out[j] += v * env
    return out


# Alarma: "ding-dong-ding" de 1.8 s que se repite en loop.
total = int(1.8 * RATE)
mix = [0.0] * total
for f, s in ((1318.5, 0.0), (1046.5, 0.22), (1318.5, 0.44)):
    for i, v in enumerate(bell(f, s, 1.3, total)):
        mix[i] += v
peak = max(abs(v) for v in mix)
write_wav(ROOT / 'sounds' / 'alarm.wav', [v / peak * 0.9 for v in mix])

# Silencio corto: se reproduce en el primer toque para "desbloquear" el audio en iOS.
write_wav(ROOT / 'sounds' / 'silence.wav', [0.0] * int(0.2 * RATE))


def icon(size):
    s = size * 4  # supersampling
    img = Image.new('RGB', (s, s))
    d = ImageDraw.Draw(img)
    top, bottom = (255, 150, 70), (226, 80, 50)
    for y in range(s):
        k = y / s
        d.line([(0, y), (s, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * k) for i in range(3)))
    # casa
    w = s * 0.56
    x0, x1 = (s - w) / 2, (s + w) / 2
    roof_y, eave_y, base_y = s * 0.2, s * 0.47, s * 0.78
    d.polygon([(s / 2, roof_y), (x1 + s * 0.06, eave_y), (x0 - s * 0.06, eave_y)], fill='white')
    d.rectangle([x0 + s * 0.03, eave_y - 1, x1 - s * 0.03, base_y], fill='white')
    # puerta
    dw = s * 0.12
    d.rounded_rectangle([s / 2 - dw / 2, base_y - s * 0.19, s / 2 + dw / 2, base_y], radius=s * 0.03, fill=(235, 105, 55))
    img = img.resize((size, size), Image.LANCZOS)
    img.save(ROOT / 'icons' / f'icon-{size}.png', optimize=True)


for n in (152, 180):
    icon(n)
print('ok')
