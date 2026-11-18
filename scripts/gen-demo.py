# Gera as ilustrações "Exemplo de simulação" (antes/depois) da página de vendas.
W, H = 1200, 800
def common_bg():
    return f'''
<defs>
 <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd9e0"/><stop offset="1" stop-color="#e9ecec"/></linearGradient>
 <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5d7381"/><stop offset=".55" stop-color="#2f4049"/><stop offset="1" stop-color="#43555f"/></linearGradient>
 <linearGradient id="refl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
 <linearGradient id="walk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9b5ae"/><stop offset="1" stop-color="#9f9a92"/></linearGradient>
 <filter id="glow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
 <filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
 <pattern id="slats" width="22" height="10" patternUnits="userSpaceOnUse"><rect width="22" height="10" fill="#8a5a36"/><rect width="18" height="10" fill="#a06d45"/><rect x="0" width="2" height="10" fill="#6e4528"/></pattern>
 <pattern id="tiles" width="60" height="30" patternUnits="userSpaceOnUse"><rect width="60" height="30" fill="url(#walk)"/><path d="M0 29.5H60M30 0V30" stroke="#8d887f" stroke-width="1.2"/></pattern>
</defs>
<rect width="{W}" height="{H}" fill="url(#sky)"/>
<!-- prédios vizinhos -->
<rect x="0" y="40" width="150" height="640" fill="#b7aea3"/><rect x="20" y="90" width="80" height="110" fill="#6f7b82"/><rect x="20" y="260" width="80" height="110" fill="#6f7b82"/>
<rect x="0" y="470" width="150" height="210" fill="#9e958a"/><rect x="18" y="500" width="110" height="180" fill="#5b5550"/>
<rect x="1050" y="60" width="150" height="620" fill="#c4bdb2"/><rect x="1090" y="110" width="80" height="110" fill="#6f7b82"/><rect x="1090" y="280" width="80" height="110" fill="#6f7b82"/>
<rect x="1050" y="470" width="150" height="210" fill="#a79f94"/><rect x="1072" y="505" width="110" height="175" fill="#6a645e"/>
'''
def openings(frame="#2b2b2b"):
    # janelas superiores, vitrine e porta — idênticas nas duas versões
    return f'''
<!-- janelas do 1º andar -->
<g><rect x="300" y="120" width="190" height="170" fill="{frame}"/><rect x="310" y="130" width="170" height="150" fill="url(#glass)"/><rect x="310" y="130" width="170" height="150" fill="url(#refl)"/><rect x="392" y="130" width="6" height="150" fill="{frame}"/>
<rect x="710" y="120" width="190" height="170" fill="{frame}"/><rect x="720" y="130" width="170" height="150" fill="url(#glass)"/><rect x="720" y="130" width="170" height="150" fill="url(#refl)"/><rect x="802" y="130" width="6" height="150" fill="{frame}"/></g>
<!-- vitrine -->
<rect x="215" y="455" width="440" height="225" fill="{frame}"/><rect x="225" y="465" width="420" height="205" fill="url(#glass)"/><rect x="225" y="465" width="420" height="205" fill="url(#refl)"/>
<rect x="432" y="465" width="6" height="205" fill="{frame}"/>
<!-- porta -->
<rect x="730" y="440" width="230" height="240" fill="{frame}"/><rect x="742" y="452" width="100" height="228" fill="url(#glass)"/><rect x="848" y="452" width="100" height="228" fill="url(#glass)"/>
<rect x="742" y="452" width="206" height="228" fill="url(#refl)"/><rect x="826" y="540" width="6" height="60" rx="3" fill="#cfcfcf"/><rect x="858" y="540" width="6" height="60" rx="3" fill="#cfcfcf"/>
'''
def street():
    return f'''<rect x="0" y="680" width="{W}" height="120" fill="url(#tiles)"/><rect x="0" y="680" width="{W}" height="6" fill="#7d786f"/>
<rect x="0" y="785" width="{W}" height="15" fill="#6b6760"/>'''

before = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{common_bg()}
<rect x="150" y="30" width="900" height="650" fill="#d9cdb8"/>
<path d="M150 30h900v650H150z" fill="none"/>
<path d="M210 330c40 10 60 60 30 90M960 60c-10 50 30 80 10 140" stroke="#bfae92" stroke-width="10" fill="none" opacity=".6"/>
<rect x="150" y="300" width="900" height="40" fill="#c9bba3"/>
<ellipse cx="560" cy="250" rx="140" ry="60" fill="#c2b296" opacity=".55" filter="url(#soft)"/>
<ellipse cx="1000" cy="560" rx="60" ry="110" fill="#b8a78b" opacity=".6" filter="url(#soft)"/>
{openings("#3a3a3a")}
<!-- placa antiga, desbotada e torta -->
<g transform="rotate(-1.8 600 395)"><rect x="380" y="352" width="440" height="82" fill="#e8e1d2" stroke="#9e9480" stroke-width="5"/>
<text x="600" y="410" text-anchor="middle" font-family="Georgia, serif" font-size="46" fill="#9a8f7c" letter-spacing="4">CAFÉ AURORA</text></g>
<rect x="210" y="440" width="460" height="14" fill="#8e8574"/>
<path d="M300 440v-6M560 440v-6" stroke="#666" stroke-width="3"/>
<!-- fios soltos -->
<path d="M820 360c30 30 40 60 90 70" stroke="#333" stroke-width="3" fill="none"/>
<rect x="985" y="380" width="34" height="46" fill="#9c9c9c"/>
{street()}
</svg>'''

after = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{common_bg()}
<rect x="150" y="30" width="900" height="650" fill="#34383b"/>
<rect x="150" y="30" width="900" height="650" fill="#000" opacity=".04"/>
<!-- revestimento ripado em madeira -->
<rect x="150" y="30" width="110" height="650" fill="url(#slats)"/><rect x="990" y="30" width="60" height="650" fill="url(#slats)"/>
<rect x="150" y="320" width="900" height="8" fill="#2a2d2f"/>
{openings("#1b1b1b")}
<!-- letreiro iluminado -->
<rect x="330" y="345" width="540" height="96" rx="6" fill="#1f2224"/>
<ellipse cx="600" cy="393" rx="270" ry="58" fill="#ffcf7a" opacity=".18" filter="url(#soft)"/>
<text x="600" y="414" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="60" fill="#ffe3a3" letter-spacing="10" filter="url(#glow)">CAFÉ AURORA</text>
<!-- arandelas -->
<g fill="#151515"><path d="M265 455h18v-20h-18z"/><path d="M917 455h18v-20h-18z"/></g>
<path d="M240 470c20-30 60-30 70 0z" fill="#ffd894" opacity=".55" filter="url(#soft)"/>
<path d="M890 470c20-30 60-30 70 0z" fill="#ffd894" opacity=".55" filter="url(#soft)"/>
<!-- vasos -->
<g><rect x="668" y="620" width="48" height="60" fill="#c5c0b8"/><circle cx="692" cy="600" r="30" fill="#3f6b3a"/><circle cx="680" cy="588" r="18" fill="#4f7f47"/>
<rect x="975" y="620" width="48" height="60" fill="#c5c0b8"/><circle cx="999" cy="600" r="30" fill="#3f6b3a"/><circle cx="1010" cy="586" r="18" fill="#4f7f47"/></g>
<text x="335" y="560" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#f2e6cc" opacity=".85" letter-spacing="3">CAFÉS ESPECIAIS</text>
{street()}
</svg>'''
open('public/demo/antes.svg','w').write(before)
open('public/demo/depois.svg','w').write(after)
print('ok')
