from PIL import Image, ImageDraw, ImageFont
import sys
OUT = sys.argv[1]
P = {
 'K':(0,0,0),'W':(252,252,252),'B':(0,64,168),'b':(60,120,248),'S':(252,188,140),
 'R':(216,40,0),'r':(248,120,88),'Y':(248,216,0),'y':(200,140,0),'N':(136,80,0),'n':(200,120,40),
 'G':(0,168,0),'g':(128,208,16),'L':(188,188,188),'D':(116,116,116),'C':(92,148,252),'O':(248,152,56),
 'P':(160,32,200),'p':(248,120,248),'E':(40,40,40),'T':(0,120,120),
}
def spr(rows):
    h=len(rows); w=max(len(r) for r in rows)
    im=Image.new('RGBA',(w,h),(0,0,0,0))
    for y,r in enumerate(rows):
        for x,c in enumerate(r):
            if c!='.': im.putpixel((x,y),P[c]+(255,))
    return im
POSTMAN = [
"......TTTTT.....",
".....TTTTTTT....",
".....TTYYTTT....",
".....TTTTTTTTT..",
".....NNSSSS.....",
"....NNSSSKS.....",
"....NSSSSKSS....",
".....SSSSSSS....",
".....SSSKKS.....",
"......SSSS......",
"....TbbbbbbT....",
"...TbNbbbbbTT...",
"...SbbNbbbbbS...",
"..NNNNNNbbbbS...",
"..NWWWWNbbb.....",
"..NNNNNNTTTT....",
"....TTTT.TTT....",
"....TTT..TTT....",
"...KKKK..KKKK...",
]
POSTMAN_JUMP = [
"......TTTTT...SS",
".....TTTTTTT..Sb",
".....TTYYTTT..b.",
".....TTTTTTTTTb.",
".....NNSSSS..b..",
"....NNSSSKS.b...",
"....NSSSSKSSb...",
".....SSSSSSSb...",
".....SSSKKSb....",
"......SSSSb.....",
"....TbbbbbbT....",
"...TbNbbbbbT....",
"...SbbNbbbbb....",
"..NNNNNNbbbb....",
"..NWWWWNbbbTT...",
"..NNNNNNTTTTTT..",
"...TTT.....TTT..",
"..KKKK......KKK.",
"..KKK.......KK..",
]
MOYAN = [
"................",
"................",
"......DDDD......",
"....DDLLLLDD....",
"...DLLLLLLLLD...",
"..DLLLLLLLLLLD..",
".DLLKKLLLLKKLLD.",
".DLLLKWLLWKLLLD.",
"DLLLLKKLLKKLLLLD",
"DLLLLLLLLLLLLLLD",
"DLLLLKKKKKKLLLLD",
".DLLKLLLLLLKLLD.",
"..DLLLLLLLLLLD..",
"...DDLDDLDDLD...",
"....D..D..D.....",
"................",
]
TOGE = [
"....W..W..W.....",
"...WLW.WLW.WL...",
"..DDDDDDDDDDDD..",
".DPPPPPPPPPPPPD.",
"DPPPPPPPPPPPPPPD",
"DPpPPPPPPPPPPpPD",
".KKKKKKKKKKKKKK.",
".OOOOOOOOOOOOOO.",
".OOKWOOOOOOKWOO.",
".OOKKOOOOOOKKOO.",
".OOOOOOOOOOOOOO.",
"..OOOKKKKKKOOO..",
"...OOOOOOOOOO...",
"....KK....KK....",
"...KKK....KKK...",
"................",
]
STAR = [
"................",
".......YY.......",
"......YYYY......",
"......YWYY......",
".YYYYYYWYYYYYYY.",
"..yYYYYYYYYYYy..",
"...yYYKYYKYYy...",
"....yYKYYKYy....",
"....yYYYYYYy....",
"...yYYYYYYYYy...",
"...yYYYyyYYYy...",
"..yYYyy..yyYYy..",
"..yyy......yyy..",
"................",
"................",
"................",
]
LETTERBLK = [
"KKKKKKKKKKKKKKKK",
"KOOOOOOOOOOOOOOK",
"KOyOOOOOOOOOOyOK",
"KOOOOOOOOOOOOOOK",
"KOOWWWWWWWWWWOOK",
"KOOWKWWWWWWKWOOK",
"KOOWWKWWWWKWWOOK",
"KOOWWWKWWKWWWOOK",
"KOOWWWWKKWWWWOOK",
"KOOWWWWWWWWWWOOK",
"KOOWWWWWWWWWWOOK",
"KOOOOOOOOOOOOOOK",
"KOOOOOOOOOOOOOOK",
"KOyOOOOOOOOOOyOK",
"KOOOOOOOOOOOOOOK",
"KKKKKKKKKKKKKKKK",
]
GROUND = [
"nnnnnnnnnnnnnnnn",
"nnnnNnnnnnnnnnnn",
"nnnnnnnnnnLnnnnn",
"nnnnnnnnnnnnnNnn",
"nnNnnnnnnnnnnnnn",
"nnnnnnnLnnnnnnnn",
"nnnnnnnnnnnnnnnn",
"nnnnnnnnnnnnNnnn",
"nLnnnnnnnnnnnnnn",
"nnnnnNnnnnnnnnnn",
"nnnnnnnnnnnnnnLn",
"nnnnnnnnnnnnnnnn",
"nnnnnnnnNnnnnnnn",
"nnnNnnnnnnnnnnnn",
"nnnnnnnnnnnLnnnn",
"nnnnnnnnnnnnnnnn",
]
GRASSTOP = [
"gGggggGggggggGgg",
"gggggggggGgggggg",
"GgGGgGGgGGGgGGgG",
"nGnnGnnGnnnGnnGn",
"nnnnnnnnnnnnnnnn",
"nnnnNnnnnnnnnnnn",
"nnnnnnnnnnLnnnnn",
"nnnnnnnnnnnnnNnn",
"nnNnnnnnnnnnnnnn",
"nnnnnnnLnnnnnnnn",
"nnnnnnnnnnnnnnnn",
"nnnnnnnnnnnnNnnn",
"nLnnnnnnnnnnnnnn",
"nnnnnNnnnnnnnnnn",
"nnnnnnnnnnnnnnLn",
"nnnnnnnnnnnnnnnn",
]
POST = [
"....KKKKKKKK....",
"...KRRRRRRRRK...",
"..KRRrrrrrrRRK..",
"..KRrRRRRRRRRK..",
"..KRRRRRRRRRRK..",
"..KRKKKKKKKKRK..",
"..KRKWWWWWWKRK..",
"..KRKKKKKKKKRK..",
"..KRRRRRRRRRRK..",
"..KRRWRRRRWRRK..",
"..KRRRWWWWRRRK..",
"..KRRRRRRRRRRK..",
"..KRRRRRRRRRRK..",
"..KRRRRRRRRRRK..",
"..KKKKKKKKKKKK..",
"......KDDK......",
"......KDDK......",
"......KDDK......",
"......KDDK......",
"......KDDK......",
"......KDDK......",
"......KDDK......",
"....KKKKKKKK....",
"...KDDDDDDDDK...",
]
POCCHI = [
"................",
"......YWWY......",
"....YWWWWWWY....",
"...YWWWWWWWWY...",
"..YWWKWWWWKWWY..",
"..YWWKWWWWKWWY..",
"..YWpWWWWWWpWY..",
"..YWWWWKKWWWWY..",
"...YWWWWWWWWY...",
"....YWWWWWWY....",
".....YYWWYY.....",
"......Y..Y......",
"................",
]
BARON = [
".....KKKKKK.....",
"....KEEEEEEK....",
"....KEEEEEEK....",
"...KKKKKKKKKK...",
"..KDDDDDDDDDDK..",
"...LLLLLLLLLL...",
"...LKKLLLLKKL...",
"...LLWKLLKWLL...",
"...LLLLLLLLLL...",
"....LKKKKKKL....",
"...DLLLLLLLLD...",
"..DDDPPPPPPDDD..",
".DDDPPPYPPPPDDD.",
".DDDPPPPPPPPDDD.",
"..DDPPPYPPPPDD..",
"...DPPPPPPPPD...",
"....DD....DD....",
"...KKK....KKK...",
]
CLOUD = [
"..........WWWW..........",
"........WWWWWWWW........",
"...WWW.WWWWWWWWWW.......",
"..WWWWWWWWWWWWWWWWWWW...",
".WWWWWWWWWWWWWWWWWWWWWW.",
"WWWWWWWWWWWWWWWWWWWWWWWW",
".CWWWWWWCWWWWWWWCWWWWWC.",
"..CCCCCCCCCCCCCCCCCCCC..",
]
HILL = [
"........gggggggg........",
".....gggggGgggggggg.....",
"...ggggGggggggggGgggg...",
"..gggggggggGgggggggggg..",
"..ggGgggggggggggggGggg..",
"...gggggggggGgggggggg...",
".....ggggggggggggggg....",
"..........NNNN..........",
"..........NnNN..........",
"..........NNnN..........",
"..........NNNN..........",
]
PLANK=['NNNNNNNNNNNNNNNN','nOOOOOOnnOOOOOOn','nOOOOOOnnOOOOOOn','NNNNNNNNNNNNNNNN']
S = {k:spr(v) for k,v in dict(POSTMAN=POSTMAN,POSTMAN_JUMP=POSTMAN_JUMP,MOYAN=MOYAN,TOGE=TOGE,STAR=STAR,
      LETTERBLK=LETTERBLK,GROUND=GROUND,GRASSTOP=GRASSTOP,POST=POST,POCCHI=POCCHI,BARON=BARON,CLOUD=CLOUD,HILL=HILL,PLANK=PLANK).items()}

def flip(im): return im.transpose(Image.FLIP_LEFT_RIGHT)

# ---------- 1. gameplay mock (phone landscape) ----------
W,H=320,180
scene=Image.new('RGBA',(W,H),P['C']+(255,))
d=ImageDraw.Draw(scene)
# grey (not yet restored) right side band to show "color returning"
for x,y in [(20,22),(130,14),(250,30)]:
    scene.alpha_composite(S['CLOUD'],(x,y))
for x in [0,150]:
    scene.alpha_composite(S['HILL'],(x+10,H-32-11))
gy=H-32
for x in range(0,W,16):
    if 176<=x<208: continue  # gap (pit)
    scene.alpha_composite(S['GRASSTOP'],(x,gy))
    scene.alpha_composite(S['GROUND'],(x,gy+16))
# floating platform & letter blocks
for x in range(96,160,16):
    scene.alpha_composite(S['PLANK'],(x,gy-52))
scene.alpha_composite(S['LETTERBLK'],(120,gy-100))
for x in [96,144]:
    scene.alpha_composite(S['STAR'],(x,gy-72))
for x in [190,206]:
    scene.alpha_composite(S['STAR'],(x-6,gy-44))
scene.alpha_composite(S['POSTMAN_JUMP'],(60,gy-46))
scene.alpha_composite(flip(S['MOYAN']),(150,gy-16))
scene.alpha_composite(S['TOGE'],(214,gy-16))
scene.alpha_composite(S['POCCHI'],(40,gy-58))
scene.alpha_composite(S['POST'],(248,gy-24))
# grey overlay on far right portion -> world not yet restored
grey=scene.crop((256,0,W,gy)).convert('L').convert('RGBA')
# HUD
f=ImageFont.truetype('/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',10)
def txt(x,y,s,c='W'):
    d.text((x+1,y+1),s,font=f,fill=P['K']); d.text((x,y),s,font=f,fill=P[c])
d=ImageDraw.Draw(scene)
txt(8,6,"MR.POSTMAN"); txt(8,17,"♥♥♥",'R')
scene.alpha_composite(S['STAR'].resize((10,10),Image.NEAREST),(96,15)); txt(108,17,"×12",'Y')
txt(150,6,"WORLD"); txt(150,17," 1-1")
txt(206,6,"かけら"); txt(206,17,"◆◇◇",'Y')
txt(250,6,"TIME"); txt(250,17," 182")
# touch buttons (semi-transparent)
ov=Image.new('RGBA',(W,H),(0,0,0,0)); od=ImageDraw.Draw(ov)
for cx,lab in [(26,'◀'),(62,'▶')]:
    od.ellipse((cx-15,H-38,cx+15,H-8),fill=(255,255,255,90),outline=(255,255,255,180))
    od.text((cx-5,H-29),lab,font=f,fill=(255,255,255,230))
od.ellipse((W-46,H-46,W-8,H-8),fill=(255,255,255,90),outline=(255,255,255,180)); od.text((W-36,H-32),"JUMP",font=ImageFont.truetype('/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',8),fill=(255,255,255,230))
od.ellipse((W-82,H-34,W-56,H-8),fill=(255,255,255,90),outline=(255,255,255,180)); od.text((W-74,H-25),"ACT",font=ImageFont.truetype('/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',8),fill=(255,255,255,230))
od.rectangle((W-24,4,W-6,16),fill=(255,255,255,90)); od.text((W-20,4),"II",font=f,fill=(255,255,255,230))
scene=Image.alpha_composite(scene,ov)
# move pause icon from overlapping TIME: fine at scale
scene.convert('RGB').resize((W*4,H*4),Image.NEAREST).save(f"{OUT}/sample_gameplay.png")

# ---------- 2. character sheet ----------
SC=6
items=[('POSTMAN','ミスターポストマン','主人公'),('POCCHI','ポッチ','相棒'),('BARON','クモリ男爵','ラスボス'),
       ('MOYAN','モヤン','ザコ敵（踏める）'),('TOGE','トゲボウシ','踏めない敵'),('STAR','星のつぶ','100個で1UP'),
       ('LETTERBLK','手紙ブロック','たたくとアイテム'),('POST','ゴールのポスト','ここで配達完了')]
cw,ch=200,230
sheet=Image.new('RGB',(cw*4,ch*2+60),(24,24,40))
sd=ImageDraw.Draw(sheet)
F=ImageFont.truetype('/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',20)
Fs=ImageFont.truetype('/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',15)
sd.text((20,16),"ミスターポストマン　キャラクター見本（ファミコン風ドット絵・仮）",font=F,fill=(255,255,255))
for i,(k,n,desc) in enumerate(items):
    cx=(i%4)*cw; cy=60+(i//4)*ch
    sd.rectangle((cx+8,cy+4,cx+cw-8,cy+ch-8),fill=(92,148,252) if k not in('BARON',) else (70,70,90))
    im=S[k]; sc=SC if im.size[1]<=18 else 5
    big=im.resize((im.size[0]*sc,im.size[1]*sc),Image.NEAREST)
    sheet.paste(big,(cx+cw//2-big.size[0]//2,cy+20),big)
    sd.text((cx+16,cy+ch-62),n,font=F,fill=(255,255,255))
    sd.text((cx+16,cy+ch-34),desc,font=Fs,fill=(255,240,160))
sheet.save(f"{OUT}/sample_characters.png")

# ---------- 3. color returning (before/after) ----------
base=Image.open(f"{OUT}/sample_gameplay.png").resize((W*2,H*2),Image.NEAREST)
g=base.convert('L').convert('RGB')
ba=Image.new('RGB',(W*4+20,H*2+50),(24,24,40))
ba.paste(g,(0,50)); ba.paste(base,(W*2+20,50))
bd=ImageDraw.Draw(ba)
bd.text((10,12),"クリア前：色をうばわれた世界",font=F,fill=(200,200,200))
bd.text((W*2+30,12),"クリア後：色がもどる！",font=F,fill=(255,230,120))
ba.save(f"{OUT}/sample_color_return.png")
print("ok")
