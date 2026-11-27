# Writes brand/qr-portfolio.svg: a QR code to the portfolio for the LinkedIn cover, near-black
# modules on a transparent background (the cover's green tile shows through, so it reads as
# normal dark-on-light and every phone scanner can read it). Needs segno: pip install segno
#   python brand/qr.py
from pathlib import Path
import segno

URL = 'https://kenpatrickranis.vercel.app'
here = Path(__file__).parent
qr = segno.make(URL, error='q', micro=False)  # at least level Q; segno boosts it (to H) when it fits
qr.save(here / 'qr-portfolio.svg', scale=10, border=0, dark='#040804', light=None, xmldecl=False, svgns=True)
print('wrote qr-portfolio.svg', f'version {qr.version}, {qr.error} error correction, for {URL}')
