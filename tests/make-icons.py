from PIL import Image,ImageDraw
from pathlib import Path
folder=Path(__file__).resolve().parent.parent/'assets'
for size in (192,512):
    img=Image.new('RGBA',(size,size),(15,53,91,255))
    d=ImageDraw.Draw(img)
    def P(a):return int(a*size/512)
    d.rounded_rectangle((P(204),P(92),P(308),P(324)),radius=P(50),fill=(255,255,255,255))
    d.arc((P(150),P(140),P(362),P(370)),0,180,fill=(90,211,176,255),width=P(24))
    d.line((P(256),P(370),P(256),P(418)),fill=(90,211,176,255),width=P(25))
    d.line((P(205),P(418),P(307),P(418)),fill=(90,211,176,255),width=P(25))
    img.save(folder/f'icon-{size}.png')
