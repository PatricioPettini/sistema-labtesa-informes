# -*- coding: utf-8 -*-
"""
Extrae la seccion de PLEGADO de cada informe de referencia
y la muestra para analisis comparativo.
"""

import os, zipfile, re
from pathlib import Path

ROOT = Path(r"C:\Users\Patricio\Desktop\lab-informes\server\agents\informes-referencia\plegado")

def text_from_docx(path):
    try:
        with zipfile.ZipFile(path, 'r') as z:
            xml = z.read('word/document.xml').decode('utf-8', errors='ignore')
        # Reconstruir parrafos respetando saltos de linea
        # Cada <w:p> = parrafo. Dentro juntamos los <w:t>.
        paras = []
        for p_match in re.finditer(r'<w:p\b[^>]*>(.*?)</w:p>', xml, re.DOTALL):
            content = p_match.group(1)
            texts = re.findall(r'<w:t[^>]*>([^<]*)</w:t>', content)
            paras.append(''.join(texts))
        return paras
    except Exception as e:
        return [f"ERROR: {e}"]

def extraer_seccion_plegado(paras):
    """Extrae desde 'ENSAYO DE PLEGADO' hasta el siguiente ensayo o FIN."""
    inicio = -1
    fin = -1
    for i, p in enumerate(paras):
        up = p.upper().strip()
        if inicio < 0:
            if re.search(r'ENSAYO\s+DE\s+PLEGADO', up):
                inicio = i
                continue
        else:
            # Buscar otro ensayo o FIN DE INFORME
            if re.match(r'^\d*\.?\s*ENSAYO\s+DE\s+', up) and not re.search(r'PLEGADO', up):
                fin = i; break
            if re.match(r'^\d*\.?\s*AN[AÁ]LISIS', up):
                fin = i; break
            if re.match(r'^\d*\.?\s*DUREZA', up):
                fin = i; break
            if 'FIN DE INFORME' in up:
                fin = i; break
    if inicio < 0: return []
    if fin < 0: fin = len(paras)
    return paras[inicio:fin]

files = sorted(ROOT.glob('*.docx'))
for f in files:
    print('=' * 90)
    print(f"ARCHIVO: {f.name}")
    print('=' * 90)
    paras = text_from_docx(f)
    seccion = extraer_seccion_plegado(paras)
    for line in seccion:
        if line.strip():
            print(f"  {line}")
    print()
