import os, re, zipfile, hashlib, shutil, subprocess, tempfile
from datetime import datetime, timedelta

SRC_DIR  = r'G:\ADMINISTRACION\INFORMES APOLO\METALMECANICA'
DEST_DIR = r'C:\Users\Patricio\Desktop\lab-informes\server\agents\informes-referencia\dureza-brinell'
TARGET   = 8
CUTOFF   = datetime.now() - timedelta(days=365*2)  # 2 años

PAT_BRINELL = re.compile(r'BRINELL|HBW|DUREZA\s+BRINELL', re.IGNORECASE)

os.makedirs(DEST_DIR, exist_ok=True)

def md5_head(path):
    h = hashlib.md5()
    with open(path, 'rb') as f:
        h.update(f.read(2*1024*1024))
    return h.hexdigest()

def texto_docx(path):
    try:
        with zipfile.ZipFile(path, 'r') as z:
            if 'word/document.xml' not in z.namelist():
                return ''
            xml = z.read('word/document.xml').decode('utf-8', errors='ignore')
            return re.sub(r'<[^>]+>', ' ', xml)
    except:
        return ''

def texto_doc(path):
    try:
        with open(path, 'rb') as f:
            raw = f.read()
        for enc in ('utf-16-le', 'latin-1'):
            try:
                return raw.decode(enc, errors='ignore')
            except:
                pass
    except:
        pass
    return ''

def convertir_doc_a_docx(doc_path, dest_dir):
    """Convierte .doc a .docx usando Word COM via PowerShell"""
    try:
        ps = f'''
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Open("{doc_path}")
$outPath = "{dest_dir}\\converted_temp.docx"
$doc.SaveAs([ref]$outPath, [ref]16)
$doc.Close()
$word.Quit()
Write-Output "OK:$outPath"
'''
        tmp = tempfile.NamedTemporaryFile(suffix='.ps1', delete=False, mode='w', encoding='utf-8')
        tmp.write(ps)
        tmp.close()
        r = subprocess.run(['powershell', '-ExecutionPolicy', 'Bypass', '-File', tmp.name],
                           capture_output=True, text=True, timeout=30)
        os.unlink(tmp.name)
        out = r.stdout.strip()
        if out.startswith('OK:'):
            return out[3:]
    except Exception as e:
        print(f'  [COM error] {e}')
    return None

encontrados = []
hashes_vistos = set()
clientes_vistos = set()

print(f'Buscando en {SRC_DIR}...')
total_revisados = 0

for root, dirs, files in os.walk(SRC_DIR):
    dirs.sort()
    for fname in sorted(files):
        ext = fname.lower()
        if not (ext.endswith('.docx') or ext.endswith('.doc')):
            continue

        fpath = os.path.join(root, fname)
        try:
            mtime = datetime.fromtimestamp(os.path.getmtime(fpath))
        except:
            continue
        if mtime < CUTOFF:
            continue

        total_revisados += 1

        # Cliente = carpeta inmediata bajo METALMECANICA
        parts = os.path.relpath(root, SRC_DIR).split(os.sep)
        cliente = parts[0] if parts else 'DESCONOCIDO'
        if cliente in clientes_vistos:
            continue

        # Leer texto
        if ext.endswith('.docx'):
            texto = texto_docx(fpath)
        else:
            texto = texto_doc(fpath)

        if not PAT_BRINELL.search(texto):
            continue

        # Dedupe por hash
        try:
            h = md5_head(fpath)
        except:
            continue
        if h in hashes_vistos:
            continue
        hashes_vistos.add(h)
        clientes_vistos.add(cliente)

        print(f'  ENCONTRADO [{len(encontrados)+1}]: {cliente} | {fname} | {mtime.strftime("%Y-%m-%d")}')

        # Copiar (convirtiendo .doc si hace falta)
        dest_name = f'{len(encontrados)+1:02d}_{cliente}_{fname}'
        if ext.endswith('.doc'):
            print(f'    Convirtiendo .doc a .docx...')
            docx_tmp = convertir_doc_a_docx(fpath, DEST_DIR)
            if docx_tmp and os.path.exists(docx_tmp):
                dest_name = dest_name.replace('.doc', '.docx')
                shutil.move(docx_tmp, os.path.join(DEST_DIR, dest_name))
            else:
                # Copiar el .doc igual para no perderlo
                shutil.copy2(fpath, os.path.join(DEST_DIR, dest_name))
                print(f'    Conversión falló, copiado como .doc')
        else:
            shutil.copy2(fpath, os.path.join(DEST_DIR, dest_name))

        encontrados.append({'cliente': cliente, 'archivo': dest_name, 'fecha': mtime})

        if len(encontrados) >= TARGET:
            break
    if len(encontrados) >= TARGET:
        break

print(f'\nTotal revisados: {total_revisados}')
print(f'Encontrados: {len(encontrados)}/{TARGET}')
for i, e in enumerate(encontrados, 1):
    print(f'  {i}. {e["cliente"]} | {e["archivo"]} | {e["fecha"].strftime("%Y-%m-%d")}')

if len(encontrados) < TARGET:
    print(f'\nATENCION: solo {len(encontrados)} encontrados. Considera ampliar el cutoff a 3 años.')
