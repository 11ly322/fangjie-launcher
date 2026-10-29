from PIL import Image, ImageDraw, ImageFilter
import os

SIZE = 512
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "resources")
os.makedirs(OUT, exist_ok=True)

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
sd.rounded_rectangle((28, 28, SIZE - 28, SIZE - 28), radius=112, fill=(0, 0, 0, 180))
shadow = shadow.filter(ImageFilter.GaussianBlur(22))
img.alpha_composite(shadow)

card = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
cd = ImageDraw.Draw(card)
cd.rounded_rectangle((30, 30, SIZE - 30, SIZE - 30), radius=110, fill=(13, 18, 12, 255))
cd.rounded_rectangle((31, 31, SIZE - 31, SIZE - 31), radius=109, outline=(196, 240, 106, 30), width=2)
img.alpha_composite(card)

glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse((100, 70, 430, 400), fill=(150, 205, 55, 40))
glow = glow.filter(ImageFilter.GaussianBlur(54))
img.alpha_composite(glow)

# Isometric cube
cx, cy = 256, 252
top = [(cx, cy - 126), (cx + 128, cy - 54), (cx, cy + 18), (cx - 128, cy - 54)]
left = [(cx - 128, cy - 54), (cx, cy + 18), (cx, cy + 158), (cx - 128, cy + 86)]
right = [(cx + 128, cy - 54), (cx, cy + 18), (cx, cy + 158), (cx + 128, cy + 86)]

layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
ld = ImageDraw.Draw(layer)
ld.polygon(top, fill=(199, 245, 111, 255))
ld.polygon(left, fill=(92, 130, 42, 255))
ld.polygon(right, fill=(128, 174, 55, 255))
ld.line(top + [top[0]], fill=(235, 255, 195, 150), width=4)
img.alpha_composite(layer)

# Inner bevel highlights
detail = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
dd = ImageDraw.Draw(detail)
dd.polygon([(cx, cy - 108), (cx + 90, cy - 61), (cx, cy - 14), (cx - 90, cy - 61)], fill=(255, 255, 255, 24))
dd.line([(cx - 128, cy - 54), (cx - 128, cy + 86)], fill=(0, 0, 0, 50), width=3)
dd.line([(cx, cy + 18), (cx, cy + 158)], fill=(0, 0, 0, 45), width=3)
img.alpha_composite(detail)

# Small floating cube
fl = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
fd = ImageDraw.Draw(fl)
fx, fy, s = 382, 146, 34
fd.polygon([(fx, fy - s), (fx + s, fy), (fx, fy + s), (fx - s, fy)], fill=(216, 250, 146, 235))
fd.polygon([(fx - s, fy), (fx, fy + s), (fx, fy + 2 * s), (fx - s, fy + s)], fill=(106, 147, 48, 235))
fd.polygon([(fx + s, fy), (fx, fy + s), (fx, fy + 2 * s), (fx + s, fy + s)], fill=(147, 192, 66, 235))
img.alpha_composite(fl)

img.save(os.path.join(OUT, "icon.png"))
img.save(
    os.path.join(OUT, "icon.ico"),
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print(os.path.join(OUT, "icon.png"))
