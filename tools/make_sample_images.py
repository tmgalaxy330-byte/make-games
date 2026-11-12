"""ミスターポストマン 見た目サンプル画像の生成スクリプト（v2：現代風ドット絵）

使い方: python3 tools/make_sample_images.py docs/images
"""
import math
import random
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else "docs/images"
JP = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"
NUM = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"

# ---------------------------------------------------------------- palette
P = {
    'K': (40, 28, 52),                                   # outline (dark purple, not pure black)
    'W': (255, 255, 255), 'w': (214, 226, 240),
    'T': (0, 140, 146), 't': (70, 200, 190), 'U': (0, 88, 104),          # uniform teal
    'Y': (255, 210, 60), 'y': (220, 150, 30), 'G': (255, 244, 170),      # gold / glow
    'S': (255, 204, 164), 's': (228, 150, 118),                          # skin
    'H': (120, 66, 36), 'h': (170, 100, 50),                             # hair
    'E': (34, 30, 56),                                                   # eyes
    'm': (210, 90, 90),                                                  # mouth
    'b': (96, 156, 244), 'v': (58, 100, 200),                            # shirt
    'N': (150, 88, 40), 'n': (204, 134, 62),                             # bag
    'k': (70, 44, 40),                                                   # shoes
    'L': (206, 208, 220), 'l': (160, 162, 182), 'D': (110, 112, 134),    # grey cloud
    'P': (150, 64, 200), 'p': (204, 130, 244), 'Q': (96, 34, 140),       # purple
    'O': (252, 164, 76), 'o': (220, 110, 44),                            # orange
    'R': (226, 48, 52), 'r': (255, 120, 104), 'q': (150, 24, 40),        # red
    'B': (70, 132, 234), 'C': (40, 90, 190),                             # stamp blue
    'A': (86, 220, 240), 'a': (30, 150, 200),                            # gem
    'Z': (150, 150, 162), 'z': (100, 100, 116),                          # metal pole
}


def spr(rows, outline=True):
    w = max(len(r) for r in rows)
    rows = [r.ljust(w, '.') for r in rows]
    h = len(rows)
    pad = 1 if outline else 0
    im = Image.new('RGBA', (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c != '.':
                im.putpixel((x + pad, y + pad), P[c] + (255,))
    if outline:
        src = im.copy()
        for y in range(im.size[1]):
            for x in range(im.size[0]):
                if src.getpixel((x, y))[3]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < im.size[0] and 0 <= ny < im.size[1] and src.getpixel((nx, ny))[3]:
                        im.putpixel((x, y), P['K'] + (255,))
                        break
    return im


POSTMAN = [
    "......tttTT.....",
    ".....tTTTTTTU...",
    ".....TTTYTTTU...",
    ".....UUUUUUUUUU.",
    ".....HHSSSSs....",
    "....HhSSSESs....",
    "....HSSSSESSs...",
    ".....SSSSSSSs...",
    ".....sSSSmms....",
    "......ssss......",
    "....TbbbbbbT....",
    "...TbNbbbbvTT...",
    "...SbbNbbbbvS...",
    "..NnnnnnNbbvs...",
    "..NWWWWnNbbv....",
    "..NNNNNNNUUU....",
    "....UUUU.UUU....",
    "....UUU..UUU....",
    "...kkkk..kkkk...",
]
POSTMAN_JUMP = [
    "......tttTT...S.",
    ".....tTTTTTTU.S.",
    ".....TTTYTTTUbb.",
    ".....UUUUUUUUbv.",
    ".....HHSSSSs.b..",
    "....HhSSSESs.b..",
    "....HSSSSESSsb..",
    ".....SSSSSSSb...",
    ".....sSSSmmb....",
    "......ssssb.....",
    "....TbbbbbbT....",
    "...TbNbbbbvT....",
    "...SbbNbbbbv....",
    "..NnnnnnNbbv....",
    "..NWWWWnNbbvUU..",
    "..NNNNNNNUUUUUU.",
    "...UUU......UUU.",
    "..kkkk.......kk.",
    "..kkk........k..",
]
MOYAN = [
    "......wwww......",
    "....wwLLLLww....",
    "...wLLLLLLLLl...",
    "..wLLLLLLLLLLl..",
    ".wLLEELLLLEELLl.",
    ".LLLLEWLLWELLLl.",
    "wLLLLEELLEELLLLl",
    "LLLLLLLLLLLLLLLl",
    "LLLLLEEEEEELLLll",
    ".lLLELLLLLLELlll",
    "..llllllllllll..",
    "...DDlDDlDDlD...",
    "....D..D..D.....",
]
TOGE = [
    "...W...W...W....",
    "..WwW.WwW.WwW...",
    ".QQQQQQQQQQQQQ..",
    "QPpppPPPPPPPPPQ.",
    "QpPPPPPPPPPPPPQ.",
    "QPPPPPPPPPPPPPQ.",
    ".QQQQQQQQQQQQQ..",
    ".OOOOOOOOOOOOOo.",
    ".OOEWOOOOOOEWOo.",
    ".OOEEOOOOOOEEOo.",
    ".OOOOOOOOOOOOoo.",
    "..OOOmmmmmmOoo..",
    "...oooooooooo...",
    "....kk....kk....",
    "...kkk....kkk...",
]
STAMP = [  # v3: 12x13 -> 11x11 (少し小さく)
    "W.WW.W.WW.W",
    "WWWWWWWWWWW",
    ".WBBBBBBBW.",
    "WWBRRBRRBWW",
    ".WRrRRRRRW.",
    "WWRRRRRRRWW",
    ".WBRRRRRBW.",
    "WWBBRRRBBWW",
    ".WBBBRBBBW.",
    "WWWWWWWWWWW",
    "W.WW.W.WW.W",
]
GEM = [
    "...AA...",
    "..AWAa..",
    ".AWAAAa.",
    "AAAAAaaa",
    ".aAAAaa.",
    "..aAaa..",
    "...aa...",
]
HEART = [
    ".RR.RR.",
    "RrRRRRR",
    "RRRRRRR",
    ".RRRRR.",
    "..RRR..",
    "...R...",
]
POCCHI = [
    "......GWWG......",
    "....GWWWWWWG....",
    "...GWWWWWWWWG...",
    "..GWWEWWWWEWWG..",
    "..GWWEWWWWEWWG..",
    "..GWrWWWWWWrWG..",
    "..GWWWWmmWWWwG..",
    "...GWWWWWWWwG...",
    "....GWWWWwwG....",
    ".....GGwwGG.....",
    "......G..G......",
]
BARON = [
    ".....EEEEEE.....",
    "....EEEEEEEE....",
    "....EEEEEEEE....",
    "....PPPPPPPP....",
    "..EEEEEEEEEEEE..",
    "...LLLLLLLLLl...",
    "...LEELLLLEEl...",
    "...LLWELLEWLl...",
    "...LLLLLLLLll...",
    "....LEEEEEEl....",
    "...DLLLLLLllD...",
    "..DDDPPPPPPDDD..",
    ".DDDPpPYPPPQDDD.",
    ".DDDPPPPPPPQDDD.",
    "..DDPPPYPPPQDD..",
    "...DPPPPPPQQD...",
    "....DD....DD....",
    "...kkk....kkk...",
]
POST = [
    "...rrrrrrrrr....",
    "..rRRRRRRRRRq...",
    ".rRRRRRRRRRRRq..",
    ".rRKKKKKKKKKRq..",
    ".rRKEEEEEEEKRq..",
    ".rRKKKKKKKKKRq..",
    ".rRRRRRRRRRRRq..",
    ".rRRWRRRRWRRRq..",
    ".rRRRWWWWRRRRq..",
    ".rRRRRRRRRRRRq..",
    ".rRRRRRRRRRRqq..",
    ".rRRRRRRRRRRqq..",
    ".qqqqqqqqqqqqq..",
    "......ZZz.......",
    "......ZZz.......",
    "......ZZz.......",
    "......ZZz.......",
    "......ZZz.......",
    "......ZZz.......",
    "....ZZZZZzz.....",
]
LETTERBLK = [
    "nnnnnnnnnnnnnnnN",
    "nOOOOOOOOOOOOOoN",
    "nOyOOOOOOOOOOyoN",
    "nOOWWWWWWWWWWOoN",
    "nOOWwWWWWWWwWOoN",
    "nOOWWwWWWWwWWOoN",
    "nOOWWWwWWwWWWOoN",
    "nOOWWWWRRWWWWOoN",
    "nOOWWWWRRWWWWOoN",
    "nOOWWWWWWWWWWOoN",
    "nOOwwwwwwwwwwOoN",
    "nOOOOOOOOOOOOOoN",
    "nOyOOOOOOOOOOyoN",
    "nOoooooooooooooN",
    "NNNNNNNNNNNNNNNN",
    "NNNNNNNNNNNNNNNN",
]

S = {k: spr(v) for k, v in dict(POSTMAN=POSTMAN, POSTMAN_JUMP=POSTMAN_JUMP, MOYAN=MOYAN, TOGE=TOGE,
                                  STAMP=STAMP, GEM=GEM, HEART=HEART, POCCHI=POCCHI, BARON=BARON,
                                  POST=POST).items()}
S['LETTERBLK'] = spr(LETTERBLK, outline=False)


def flip(im):
    return im.transpose(Image.FLIP_LEFT_RIGHT)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


# ---------------------------------------------------------------- tiles (procedural, shaded)
rnd = random.Random(7)


def ground_tile(top):
    im = Image.new('RGBA', (16, 16))
    for y in range(16):
        for x in range(16):
            depth = y / 15
            c = lerp((196, 124, 64), (140, 80, 42), depth)
            if rnd.random() < 0.08:
                c = lerp(c, (110, 60, 30), 0.6)
            im.putpixel((x, y), c + (255,))
    # pebbles with highlight
    for _ in range(2):
        px, py = rnd.randrange(1, 13), rnd.randrange(6 if top else 1, 13)
        for dx, dy, col in ((0, 0, (176, 160, 150)), (1, 0, (150, 134, 126)), (0, 1, (150, 134, 126)),
                            (1, 1, (120, 104, 98)), (0, -1, (220, 210, 200))):
            im.putpixel((px + dx, py + dy), col + (255,))
    if top:
        g1, g2, g3, g4 = (70, 170, 60), (110, 210, 70), (170, 240, 110), (40, 120, 50)
        for x in range(16):
            h = 4 + (1 if (x * 7) % 5 == 0 else 0)
            for y in range(h):
                c = g3 if y == 0 else (g2 if y < 2 else g1)
                im.putpixel((x, y), c + (255,))
            im.putpixel((x, h), g4 + (255,))
            if x % 4 == 1:
                im.putpixel((x, h + 1), g4 + (255,))
    return im


GTOP = [ground_tile(True) for _ in range(3)]
GMID = [ground_tile(False) for _ in range(3)]


def plank():
    im = Image.new('RGBA', (16, 6))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 15, 5), fill=(170, 104, 52))
    d.line((0, 0, 15, 0), fill=(226, 160, 92))
    d.line((0, 1, 15, 1), fill=(200, 132, 70))
    d.line((0, 5, 15, 5), fill=(112, 64, 34))
    d.line((15, 0, 15, 5), fill=(112, 64, 34))
    im.putpixel((3, 3), (112, 64, 34)); im.putpixel((12, 3), (112, 64, 34))
    return im


PLANK = plank()


def cloud(w):
    im = Image.new('RGBA', (w, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for cx, r in ((w * .3, 6), (w * .55, 8), (w * .78, 5), (w * .15, 4)):
        d.ellipse((cx - r, 14 - 2 * r + 2, cx + r, 15), fill=(214, 232, 252))
    for cx, r in ((w * .3, 6), (w * .55, 8), (w * .78, 5), (w * .15, 4)):
        d.ellipse((cx - r, 14 - 2 * r, cx + r, 12), fill=(255, 255, 255))
    return im


def tree():
    im = Image.new('RGBA', (20, 26), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((8, 16, 11, 25), fill=(120, 72, 40)); d.line((8, 16, 8, 25), fill=(160, 100, 56))
    d.ellipse((1, 2, 19, 19), fill=(40, 130, 60))
    d.ellipse((2, 1, 17, 16), fill=(70, 170, 70))
    d.ellipse((4, 2, 12, 9), fill=(130, 214, 100))
    return im


# ---------------------------------------------------------------- scene
W, H, SCALE = 320, 180, 4
GY = H - 32


def draw_world():
    sc = Image.new('RGBA', (W, H))
    top, bot = (92, 150, 250), (196, 228, 255)
    for y in range(H):                           # banded gradient sky (pixel-art style)
        t = (y // 6 * 6) / H
        ImageDraw.Draw(sc).line((0, y, W, y), fill=lerp(top, bot, t) + (255,))
    d = ImageDraw.Draw(sc)
    # sun glow
    for r, a in ((26, 40), (18, 70), (11, 255)):
        glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse((262 - r, 46 - r, 262 + r, 46 + r), fill=(255, 246, 200, a))
        sc.alpha_composite(glow)
    # far mountains (2 layers)
    for col, base, amp, f, ph in (((150, 186, 236), 108, 26, 0.022, 0.5), ((112, 166, 206), 124, 18, 0.035, 2.0)):
        for x in range(W):
            y0 = int(base - amp * (0.6 * math.sin(x * f + ph) + 0.4 * math.sin(x * f * 2.3 + ph * 3)))
            d.line((x, y0, x, GY), fill=col)
    # near hills
    for x in range(W):
        y0 = int(GY - 10 - 8 * math.sin(x * 0.03 + 1))
        d.line((x, y0, x, GY), fill=(84, 172, 96))
        d.point((x, y0), fill=(140, 214, 120))
    for x, y, w in ((16, 40, 44), (124, 30, 56), (210, 62, 36)):
        sc.alpha_composite(cloud(w), (x, y))
    for x in (6, 150):
        sc.alpha_composite(tree(), (x, GY - 25))
    for i, x in enumerate(range(0, W, 16)):
        if 176 <= x < 208:
            continue
        sc.alpha_composite(GTOP[i % 3], (x, GY))
        sc.alpha_composite(GMID[i % 3], (x, GY + 16))
    # pit shadow edges
    d.line((175, GY, 175, H), fill=(80, 46, 24)); d.line((208, GY, 208, H), fill=(80, 46, 24))
    for x in range(96, 160, 16):
        sc.alpha_composite(PLANK, (x, GY - 50))
    shadow = Image.new('RGBA', (64, 3), (0, 0, 0, 50)); sc.alpha_composite(shadow, (96, GY - 44))
    sc.alpha_composite(S['LETTERBLK'], (120, GY - 98))
    for x, y in ((99, GY - 66), (145, GY - 66), (187, GY - 44), (202, GY - 44)):
        sc.alpha_composite(S['STAMP'], (x, y))
    # ground shadows under characters
    def foot_shadow(cx, w=12):
        s = Image.new('RGBA', (w, 3), (0, 0, 0, 0))
        ImageDraw.Draw(s).ellipse((0, 0, w - 1, 2), fill=(30, 40, 20, 80))
        sc.alpha_composite(s, (cx - w // 2, GY + 1))
    foot_shadow(158); foot_shadow(222); foot_shadow(262, 10)
    sc.alpha_composite(S['POSTMAN_JUMP'], (58, GY - 50))
    sc.alpha_composite(flip(S['MOYAN']), (150, GY - 14))
    sc.alpha_composite(S['TOGE'], (214, GY - 16))
    # pocchi with glow
    g = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse((32, GY - 70, 58, GY - 44), fill=(255, 250, 200, 90))
    sc.alpha_composite(g.filter(ImageFilter.GaussianBlur(3)))
    sc.alpha_composite(S['POCCHI'], (38, GY - 63))
    sc.alpha_composite(S['POST'], (254, GY - 21))
    return sc


def font(path, size):
    return ImageFont.truetype(path, size)


# Build gameplay image with a cleaner HUD layout
def gameplay(gray=False):
    world = draw_world()
    if gray:
        world = world.convert('L').convert('RGBA')
    big = world.resize((W * SCALE, H * SCALE), Image.NEAREST)
    SS = 2
    ui = Image.new('RGBA', (big.size[0] * SS, big.size[1] * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(ui)
    Z = lambda *v: [x * SS for x in v]

    def pill(x0, x1):
        d.rounded_rectangle(Z(x0, 16, x1, 72), 28 * SS, fill=(20, 24, 48, 150))

    def text(x, y, s, f, fill=(255, 255, 255, 255), anchor='lm'):
        d.text((x * SS + 2 * SS, y * SS + 3 * SS), s, font=f, fill=(0, 0, 0, 100), anchor=anchor)
        d.text((x * SS, y * SS), s, font=f, fill=fill, anchor=anchor)
    f_lab = font(NUM, 15 * SS); f_val = font(NUM, 26 * SS); f_jp = font(JP, 15 * SS)
    pill(20, 170)                      # hearts
    pill(190, 360); text(260, 44, "× 28", f_val, (255, 236, 150, 255))        # stamps
    pill(380, 560); text(400, 44, "かけら", f_jp, (190, 210, 255, 255))         # gems
    pill(820, 990); text(845, 44, "WORLD", f_lab, (190, 210, 255, 255)); text(925, 44, "1-1", f_val)
    pill(1010, 1150); text(1032, 44, "TIME", f_lab, (190, 210, 255, 255)); text(1090, 44, "182", f_val)
    d.rounded_rectangle(Z(1172, 16, 1260, 72), 28 * SS, fill=(20, 24, 48, 150))
    d.rounded_rectangle(Z(1203, 32, 1211, 56), 3 * SS, fill=(255, 255, 255, 235))
    d.rounded_rectangle(Z(1221, 32, 1229, 56), 3 * SS, fill=(255, 255, 255, 235))

    def btn(cx, cy, r, label, f, fill):
        d.ellipse(Z(cx - r, cy - r + 6, cx + r, cy + r + 6), fill=(0, 0, 0, 55))
        d.ellipse(Z(cx - r, cy - r, cx + r, cy + r), fill=fill, outline=(255, 255, 255, 210), width=3 * SS)
        d.text((cx * SS, cy * SS), label, font=f, fill=(255, 255, 255, 245), anchor='mm')
    arrow = font("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36 * SS)
    btn(100, 620, 58, "◀", arrow, (255, 255, 255, 55))
    btn(240, 620, 58, "▶", arrow, (255, 255, 255, 55))
    btn(1170, 600, 72, "JUMP", font(NUM, 24 * SS), (255, 136, 72, 130))
    btn(1010, 644, 46, "ACT", font(NUM, 18 * SS), (70, 160, 255, 120))
    ui = ui.resize(big.size, Image.LANCZOS)
    out = Image.alpha_composite(big, ui)

    def icon(im, x, y, s=4):
        out.alpha_composite(im.resize((im.size[0] * s, im.size[1] * s), Image.NEAREST), (x, y))
    for i in range(3):
        icon(S['HEART'], 40 + i * 40, 28)
    icon(S['STAMP'], 206, 22, 3)
    for i in range(3):
        g = S['GEM'].copy()
        if i:
            g = g.convert('LA').convert('RGBA'); g.putalpha(g.getchannel('A').point(lambda a: int(a * 0.5)))
        icon(g, 470 + i * 28, 30, 3)
    return out


game = gameplay()
game.convert('RGB').save(f"{OUT}/sample_gameplay.png")

# ---------------------------------------------------------------- character sheet
items = [('POSTMAN', 'ミスターポストマン', '主人公'), ('POCCHI', 'ポッチ', '相棒'), ('BARON', 'クモリ男爵', 'ラスボス'),
         ('MOYAN', 'モヤン', 'ザコ敵（踏める）'), ('TOGE', 'トゲボウシ', '踏めない敵'),
         ('STAMP', 'ハート切手', '100枚で1UP'), ('LETTERBLK', '手紙ブロック', 'たたくとアイテム'),
         ('POST', 'ゴールのポスト', 'ここで配達完了')]
cw, ch = 220, 250
sheet = Image.new('RGB', (cw * 4 + 16, ch * 2 + 80), (22, 24, 44))
sd = ImageDraw.Draw(sheet)
F = font(JP, 22); Fs = font(JP, 16)
sd.text((24, 22), "ミスターポストマン　キャラクター見本（現代風ドット絵・仮 v3）", font=F, fill=(255, 255, 255))
for i, (k, n, desc) in enumerate(items):
    cx = 8 + (i % 4) * cw; cy = 70 + (i // 4) * ch
    card = Image.new('RGBA', (cw - 16, ch - 12))
    top, bot = ((92, 150, 250), (196, 228, 255)) if k != 'BARON' else ((70, 70, 96), (130, 130, 160))
    cd = ImageDraw.Draw(card)
    for y in range(card.size[1]):
        cd.line((0, y, card.size[0], y), fill=lerp(top, bot, y / card.size[1]) + (255,))
    mask = Image.new('L', card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, card.size[0] - 1, card.size[1] - 1), 18, fill=255)
    sheet.paste(card, (cx + 8, cy), mask)
    im = S[k]; s = 6 if k == 'STAMP' else (7 if im.size[1] <= 16 else (6 if im.size[1] <= 21 else 5))
    big = im.resize((im.size[0] * s, im.size[1] * s), Image.NEAREST)
    sheet.paste(big, (cx + cw // 2 - big.size[0] // 2, cy + 18 + (140 - big.size[1]) // 2), big)
    sd.rounded_rectangle((cx + 16, cy + ch - 84, cx + cw - 16, cy + ch - 22), 12, fill=(20, 24, 48))
    sd.text((cx + 28, cy + ch - 78), n, font=F if len(n) <= 7 else font(JP, 19), fill=(255, 255, 255))
    sd.text((cx + 28, cy + ch - 48), desc, font=Fs, fill=(255, 226, 140))
sheet.save(f"{OUT}/sample_characters.png")

# ---------------------------------------------------------------- color return
g = gameplay(gray=True).resize((W * 2, H * 2), Image.LANCZOS)
c = game.resize((W * 2, H * 2), Image.LANCZOS)
ba = Image.new('RGB', (W * 4 + 20, H * 2 + 56), (22, 24, 44))
ba.paste(g.convert('RGB'), (0, 56)); ba.paste(c.convert('RGB'), (W * 2 + 20, 56))
bd = ImageDraw.Draw(ba)
bd.text((12, 16), "クリア前：色をうばわれた世界", font=F, fill=(200, 200, 210))
bd.text((W * 2 + 32, 16), "クリア後：色がもどる！", font=F, fill=(255, 226, 120))
ba.save(f"{OUT}/sample_color_return.png")
print("ok")

# ================================================================ items (v3)
P.update({
    'f': (255, 182, 210), 'j': (230, 110, 160),                 # pink envelope
    'c': (214, 170, 110), 'x': (170, 124, 70), 'X': (240, 206, 150),  # cardboard
    'e': (60, 60, 70),                                          # nori
})
LETTER_1UP = [
    "jjjjjjjjjjjjjjjj",
    "jfjffffffffffjfj",
    "jffjffffffffjffj",
    "jfffjffffffjfffj",
    "jffffjfRRfjffffj",
    "jfffffRrRRfffffj",
    "jffffffRRffffffj",
    "jffffffffffffffj",
    "jffffffffffffffj",
    "jjjjjjjjjjjjjjjj",
]
ONIGIRI = [
    "......WW......",
    ".....WWWW.....",
    "....WWWWWW....",
    "...WWWWWWWW...",
    "..WWWWWWWWww..",
    ".WWWWWWWWWWww.",
    ".WWWeeeeeeWww.",
    "WWWWeeeeeeWwww",
    "WWWWeeeeeewwww",
    ".wwweeeeeewww.",
]
BOOTS = [
    "..TTTT.....TTTT.",
    "..TttT.....TttT.",
    "..TTTT.....TTTT.",
    "..TTTTTT...TTTTTT",
    "..kkkkkk...kkkkkk",
    "...ZzZ......ZzZ..",
    "....Z........Z...",
    "...ZzZ......ZzZ..",
    "....Z........Z...",
    "..zzzzz....zzzzz.",
]
LANTERN = [
    ".....ZZZZ.....",
    "....Z....Z....",
    "...zzzzzzzz...",
    "...zGGGGGGz...",
    "...zGYYYYGz...",
    "...zGYWWYGz...",
    "...zGYWWYGz...",
    "...zGYYYYGz...",
    "...zGGGGGGz...",
    "...zzzzzzzz...",
    "....zzzzzz....",
]
PLANE = [
    "WW..............",
    ".wWWW...........",
    "..wwWWWWW.......",
    "...wwwWWWWWWW...",
    "....wwwwWWWWWWWW",
    "....wwwwwwwWW...",
    "...wwlllww......",
    "..wll...........",
    ".ll.............",
]
PARCEL = [
    "xxxxxxxRRxxxxxxx",
    "xXXXXXXRRXXXXXXx",
    "xXccccccRccccccx",
    "xXccccccRccccccx",
    "xXccccccRccccccx",
    "xXccccccRccccccx",
    "RRRRRRRRRRRRRRRR",
    "RRRRRRRRRRRRRRRR",
    "xXccccccRccccccx",
    "xXcccccRrRcccccx",
    "xXccccccRccccccx",
    "xXccccccRccccccx",
    "xXccccccRccccccx",
    "xxxxxxxxRxxxxxxx",
    "xxxxxxxxxxxxxxxx",
]


def scarf():
    cols = [P['R'], P['O'], P['Y'], (110, 210, 70), P['B'], P['P']]
    im = Image.new('RGBA', (22, 18), (0, 0, 0, 0))
    for x in range(22):
        yo = int(round(2.5 * math.sin(x * 0.45))) + 3
        for i, c in enumerate(cols):
            im.putpixel((x, yo + i * 2), c + (255,))
            im.putpixel((x, yo + i * 2 + 1), c + (255,))
    for x in (18, 20):            # fringe
        im.putpixel((x, 17), cols[5] + (255,))
    out = Image.new('RGBA', (24, 20), (0, 0, 0, 0)); out.paste(im, (1, 1))
    src = out.copy()
    for y in range(out.size[1]):
        for x in range(out.size[0]):
            if src.getpixel((x, y))[3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < out.size[0] and 0 <= ny < out.size[1] and src.getpixel((nx, ny))[3]:
                    out.putpixel((x, y), P['K'] + (255,)); break
    return out


def hidden_block():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i in range(0, 16, 2):
        for (x, y) in ((i, 0), (i, 15), (0, i), (15, i)):
            d.point((x, y), fill=(255, 255, 255, 170))
    for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (0, 2), (0, -2), (2, 0), (-2, 0)):
        d.point((8 + dx, 8 + dy), fill=(255, 255, 255, 150))
    return im


def invincible():
    base = S['POSTMAN'].copy()
    rainbow = [(255, 90, 90), (255, 170, 60), (255, 230, 80), (110, 220, 90), (90, 160, 255), (190, 110, 255)]
    w, h = base.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = base.getpixel((x, y))
            if a and (r, g, b) != P['K']:
                c = rainbow[((x + y) // 3) % len(rainbow)]
                base.putpixel((x, y), lerp((r, g, b), c, 0.45) + (255,))
    out = Image.new('RGBA', (w + 8, h + 4), (0, 0, 0, 0)); out.paste(base, (4, 2))
    for sx, sy in ((1, 3), (w + 5, 6), (2, h - 2), (w + 6, h - 5)):
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            out.putpixel((sx + dx, sy + dy), P['G'] + (255,))
    return out


BIGBAG = [
    "....NNNNNNNN....",
    "...N........N...",
    "..N..........N..",
    "NNNNNNNNNNNNNNNN",
    "NnnnnnnnnnnnnnnN",
    "NnWWWWWnnnYYnnnN",
    "NnWwwwWnnnYYnnnN",
    "NnWWWWWnnnnnnnnN",
    "NnnnnnnnnnnnnnnN",
    "NNNNNNNNNNNNNNNN",
]
POSTMAN_BAG = POSTMAN[:10] + [
    "....TbbbbbbT....",
    "...TbNbbbbvTT...",
    ".NNNNNNNNbbvS...",
    "NnnnnnnnnNbvs...",
    "NnWWWWnYnNbv....",
    "NnWwwWnnnNUU....",
    "NnnnnnnnnNUU....",
    "NNNNNNNNNNUU....",
    "....UUU..UUU....",
    "...kkkk..kkkk...",
]
for k, v in dict(BIGBAG=BIGBAG, POSTMAN_BAG=POSTMAN_BAG, LETTER_1UP=LETTER_1UP, ONIGIRI=ONIGIRI, BOOTS=BOOTS, LANTERN=LANTERN, PLANE=PLANE).items():
    S[k] = spr(v)
S['PARCEL'] = spr(PARCEL, outline=False)
S['SCARF'] = scarf()
S['HIDDEN'] = hidden_block()
S['INVINCIBLE'] = invincible()

groups = [
    ("集めもの・回復", [('STAMP', 'ハート切手', '100枚で1UP'), ('LETTER_1UP', 'はげましの手紙', '1UP（のこり+1）'),
                   ('SCARF', 'ニジのスカーフ', '約8秒むてき'), ('ONIGIRI', 'おにぎり', 'ハート1つ回復')]),
    ("パワーアップ", [('BOOTS', 'バネぐつ', '2段ジャンプ'), ('LANTERN', 'ランタン', '光の玉を投げる'),
                 ('PLANE', '紙ひこうきマント', '長押しで滑空'), ('INVINCIBLE', 'むてき中のすがた', '虹色に光る')]),
    ("ブロック", [('LETTERBLK', '手紙ブロック', 'アイテムが1つ出る'), ('PARCEL', '小包ブロック', '何回もたたける'),
              ('HIDDEN', 'かくしブロック', '見えない・1UPなど'), ('POSTMAN', '（大きさ比較）', '主人公')]),
    ("守り（パワーアップと別に持てる）", [('BIGBAG', '大きな配達カバン', 'ダメージを1回防ぐ'),
                          ('POSTMAN_BAG', 'カバンを持つすがた', 'カバンが大きくなる')]),
]
cw, ch = 220, 230
IS = 5   # すべて同じ倍率 → 実際の大きさの比率がわかる
sheet = Image.new('RGB', (cw * 4 + 16, 70 + len(groups) * (ch + 40)), (22, 24, 44))
sd = ImageDraw.Draw(sheet)
sd.text((24, 22), "ミスターポストマン　アイテム見本（仮 v4・すべて同じ倍率）", font=F, fill=(255, 255, 255))
y0 = 70
for title, row in groups:
    sd.text((24, y0), "■ " + title, font=Fs, fill=(150, 200, 255))
    for i, (k, n, desc) in enumerate(row):
        cx = 8 + i * cw; cy = y0 + 28
        card = Image.new('RGBA', (cw - 16, ch - 12))
        cd = ImageDraw.Draw(card)
        for yy in range(card.size[1]):
            cd.line((0, yy, card.size[0], yy), fill=lerp((92, 150, 250), (196, 228, 255), yy / card.size[1]) + (255,))
        mask = Image.new('L', card.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, card.size[0] - 1, card.size[1] - 1), 18, fill=255)
        sheet.paste(card, (cx + 8, cy), mask)
        im = S[k]
        big = im.resize((im.size[0] * IS, im.size[1] * IS), Image.NEAREST)
        sheet.paste(big, (cx + cw // 2 - big.size[0] // 2, cy + 14 + (124 - big.size[1]) // 2), big)
        sd.rounded_rectangle((cx + 16, cy + ch - 84, cx + cw - 16, cy + ch - 22), 12, fill=(20, 24, 48))
        sd.text((cx + 28, cy + ch - 78), n, font=F if len(n) <= 7 else font(JP, 17), fill=(255, 255, 255))
        sd.text((cx + 28, cy + ch - 48), desc, font=Fs, fill=(255, 226, 140))
    y0 += ch + 40
sheet.save(f"{OUT}/sample_items.png")
print("items ok")

