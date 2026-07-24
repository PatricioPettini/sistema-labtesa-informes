# -*- coding: utf-8 -*-
"""
Selecciona 8 informes reales con ENSAYO DE PLEGADO de 8 clientes distintos.
Filtro: archivos modificados en el ultimo año (no la carpeta).
"""

import os, time, zipfile, re, shutil
from pathlib import Path
from datetime import datetime

ROOT_SRC  = Path(r"G:\ADMINISTRACION\INFORMES APOLO\METALMECANICA")
ROOT_DEST = Path(r"C:\Users\Patricio\Desktop\lab-informes\server\agents\informes-referencia\plegado")
ROOT_DEST.mkdir(parents=True, exist_ok=True)

DAYS_BACK = 365
CUTOFF    = time.time() - DAYS_BACK * 86400
TARGET    = 8
TOP_CLIENTS = 80   # mas amplio
SUBS_PER_CLIENT = 8

PLEGADO_RE = [
    r'ENSAYO\s+DE\s+PLEGADO',
    r'PLEGADO\s+DE\s+CARA',
    r'PLEGADO\s+DE\s+RA[IÍ]Z',
    r'DI[AÁ]METRO\s+MANDRIL',
    r'TIPO\s+DE\s+PLEGADO',
]

def mt(p):
    try: return os.path.getmtime(p)
    except: return 0

def text_from_docx(path):
    try:
        with zipfile.ZipFile(path, 'r') as z:
            xml = z.read('word/document.xml').decode('utf-8', errors='ignore')
        return ' '.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', xml))
    except: return ''

def tiene_plegado(text):
    up = text.upper()
    return any(re.search(p, up) for p in PLEGADO_RE)

def extraer_info(text):
    info = {}
    patrones = [
        ('norma',    r'(ASTM\s+[A-Z]\s*[\d\-]+[^\n<]{0,30})'),
        ('mandril',  r'[Dd]i[aá]metro\s+[Mm]andril[:\s]+([^\n<]{1,25})'),
        ('angulo',   r'[AÁ]ngulo[:\s]+([^\n<]{1,20})'),
        ('espesor',  r'[Ee]spesor\s+[Dd]e\s+[Pp]robeta[:\s]+([^\n<]{1,20})'),
        ('ancho',    r'[Aa]ncho\s+[Dd]e\s+[Pp]robeta[:\s]+([^\n<]{1,20})'),
        ('zona',     r'[Zz]ona\s+[Dd]e\s+[Pp]legado[:\s]+([^\n<]{1,30})'),
        ('op',       r'(OP\s*\d+[^\n<]{0,80})'),
    ]
    for label, pat in patrones:
        m = re.search(pat, text)
        if m: info[label] = m.group(1).strip()[:80]

    tipos = []
    if re.search(r'\bCARA\b',     text.upper()): tipos.append('Cara')
    if re.search(r'RA[IÍ]Z',       text.upper()): tipos.append('Raiz')
    if re.search(r'LATERAL',       text.upper()): tipos.append('Lateral')
    if tipos: info['tipos'] = tipos

    sin = len(re.findall(r'[Ss]in\s+[Ii]ndicaciones', text))
    con = len(re.findall(r'[Cc]on\s+[Ii]ndicaciones', text))
    if sin or con: info['resultados'] = f"Sin={sin} Con={con}"
    return info

# 1. Clientes con actividad reciente
print(f"Buscando clientes con actividad desde {datetime.fromtimestamp(CUTOFF).strftime('%Y-%m-%d')}...\n")
clientes = []
for e in os.scandir(ROOT_SRC):
    if not e.is_dir() or e.name.startswith('.'): continue
    m = mt(e.path)
    if m >= CUTOFF:
        clientes.append((m, e.name, e.path))
clientes.sort(reverse=True)
top = clientes[:TOP_CLIENTS]
print(f"Buscando entre los {len(top)} clientes mas recientes\n")

# 2. Buscar plegado — un informe por cliente
encontrados = []
revisados = 0
for cmt, cname, cpath in top:
    if len(encontrados) >= TARGET: break

    # Listar TODAS las subcarpetas (no filtramos la carpeta, filtramos los archivos)
    subs = []
    try:
        for e in os.scandir(cpath):
            if e.is_dir():
                subs.append((mt(e.path), e.path))
    except: continue
    subs.sort(reverse=True)
    top_subs = subs[:SUBS_PER_CLIENT]
    if not top_subs: continue

    hallado = False
    for _, spath in top_subs:
        if hallado: break
        try:
            files = os.listdir(spath)
        except: continue

        # Filtrar archivos por fecha del ARCHIVO (no de la carpeta)
        docx_files = []
        for fn in files:
            if not fn.lower().endswith('.docx') or fn.startswith('~$'): continue
            full = os.path.join(spath, fn)
            fm = mt(full)
            if fm >= CUTOFF:
                docx_files.append((fm, fn, full))
        docx_files.sort(reverse=True)

        for fm, fn, full in docx_files:
            revisados += 1
            text = text_from_docx(full)
            if len(text) < 100 or not tiene_plegado(text):
                continue
            info = extraer_info(text)
            encontrados.append({
                'cliente': cname, 'archivo': fn, 'path': full,
                'info': info, 'fecha': datetime.fromtimestamp(fm).strftime('%Y-%m-%d')
            })
            hallado = True
            print(f"[{len(encontrados)}/{TARGET}] {cname[:30]:30s} ({datetime.fromtimestamp(fm).strftime('%Y-%m-%d')}) {fn[:50]}")
            for k, v in info.items():
                print(f"    {k:12s}: {v}")
            print()
            break

print(f"\nRevisados {revisados} archivos. Encontrados {len(encontrados)} de {TARGET}\n")

# 3. Limpiar destino y copiar
print(f"Limpiando: {ROOT_DEST}")
for f in ROOT_DEST.glob('*.docx'):
    try: f.unlink()
    except: pass

print(f"\nCopiando...")
for i, r in enumerate(encontrados, 1):
    cclean = re.sub(r'[^A-Za-z0-9_-]', '_', r['cliente'])[:30]
    dest = ROOT_DEST / f"{i:02d}_{r['fecha']}_{cclean}_{r['archivo']}"
    try:
        shutil.copy2(r['path'], dest)
        print(f"  OK: {dest.name}")
    except Exception as ex:
        print(f"  ERR: {ex}")

print(f"\nLISTO en: {ROOT_DEST}")
