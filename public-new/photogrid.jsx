/* LABTESA — PhotoGrid: subida, reorden, borrado y editor de recorte/rotación */

function PhotoGrid(props) {
  var photos = props.photos || [];
  var fileRef = React.useRef(null);
  var _e = React.useState(null); var editing = _e[0], setEditing = _e[1]; // {index, photo}
  var _drag = React.useState(null); var dragIdx = _drag[0], setDragIdx = _drag[1];

  function onFiles(fileList) {
    var files = Array.prototype.slice.call(fileList).filter(function (f) { return /^image\//.test(f.type); });
    var loaded = [];
    var pending = files.length;
    if (!pending) return;
    files.forEach(function (file, i) {
      var reader = new FileReader();
      reader.onload = function (e) {
        loaded[i] = { dataUrl: e.target.result, name: file.name };
        pending--;
        if (pending === 0) props.onChange(photos.concat(loaded.filter(Boolean)));
      };
      reader.readAsDataURL(file);
    });
  }

  function del(i) { props.onChange(photos.filter(function (_, idx) { return idx !== i; })); }
  function move(from, to) {
    if (to < 0 || to >= photos.length) return;
    var next = photos.slice(); var it = next.splice(from, 1)[0]; next.splice(to, 0, it);
    props.onChange(next);
  }
  function applyEdit(newUrl) {
    var next = photos.map(function (p, i) { return i === editing.index ? Object.assign({}, p, { dataUrl: newUrl }) : p; });
    props.onChange(next); setEditing(null);
  }

  return React.createElement('div', { className: 'photogrid' },
    React.createElement('div', {
      className: 'photo-dropzone',
      onDragOver: function (e) { e.preventDefault(); e.currentTarget.classList.add('over'); },
      onDragLeave: function (e) { e.currentTarget.classList.remove('over'); },
      onDrop: function (e) { e.preventDefault(); e.currentTarget.classList.remove('over'); onFiles(e.dataTransfer.files); },
      onClick: function () { fileRef.current && fileRef.current.click(); },
    },
      React.createElement(Icon, { name: 'upload', size: 20 }),
      React.createElement('div', null,
        React.createElement('span', { className: 'dz-strong' }, 'Arrastrá fotos de recepción'),
        React.createElement('span', { className: 'dz-soft' }, ' o hacé clic para seleccionar')
      ),
      React.createElement('input', { ref: fileRef, type: 'file', accept: 'image/*', multiple: true, hidden: true,
        onChange: function (e) { onFiles(e.target.files); e.target.value = ''; } })
    ),
    photos.length ? React.createElement('div', { className: 'photo-thumbs' },
      photos.map(function (p, i) {
        return React.createElement('div', {
          key: i, className: 'photo-thumb' + (dragIdx === i ? ' dragging' : ''), draggable: true,
          onDragStart: function () { setDragIdx(i); },
          onDragEnd: function () { setDragIdx(null); },
          onDragOver: function (e) { e.preventDefault(); },
          onDrop: function () { if (dragIdx != null && dragIdx !== i) move(dragIdx, i); setDragIdx(null); },
        },
          React.createElement('img', { src: p.dataUrl, alt: p.name }),
          React.createElement('div', { className: 'photo-ord' }, i + 1),
          React.createElement('div', { className: 'photo-overlay' },
            React.createElement('button', { className: 'photo-act', title: 'Editar', onClick: function () { setEditing({ index: i, photo: p }); } }, React.createElement(Icon, { name: 'crop', size: 15 })),
            React.createElement('button', { className: 'photo-act danger', title: 'Eliminar', onClick: function () { del(i); } }, React.createElement(Icon, { name: 'trash', size: 15 }))
          ),
          React.createElement('div', { className: 'photo-name' }, p.name)
        );
      })
    ) : React.createElement('p', { className: 'photo-hint' }, 'Las fotos forman la carátula del informe. Arrastrá para reordenar.'),
    editing ? React.createElement(PhotoEditor, { photo: editing.photo, onCancel: function () { setEditing(null); }, onApply: applyEdit }) : null
  );
}

/* ---- Editor: recorte libre con handles + rotación 90° + espejo ---- */
function PhotoEditor(props) {
  // Tope del visor: ahora usa la ventana disponible para mostrar la imagen
  // lo más grande posible (con un máximo razonable para mantenerlo usable).
  var winW = Math.min(window.innerWidth || 1200, 1400);
  var winH = Math.min(window.innerHeight || 800, 1000);
  var MAX_W = Math.max(640, Math.round(winW * 0.78));   // ~78% del ancho
  var MAX_H = Math.max(420, Math.round(winH * 0.62));   // ~62% del alto
  var MIN_CROP = 30;                 // tamaño mínimo del recorte (px del visor)

  var _src  = React.useState(props.photo.dataUrl); var src = _src[0], setSrc = _src[1];
  var _nat  = React.useState(null);                var nat = _nat[0], setNat = _nat[1];
  var _crop = React.useState(null);                var crop = _crop[0], setCrop = _crop[1];
  var drag  = React.useRef(null);

  // Cuando cambia la fuente, recargo dimensiones naturales y reset del recorte
  React.useEffect(function () {
    var im = new Image();
    im.onload = function () { setNat({ w: im.naturalWidth, h: im.naturalHeight }); };
    im.src = src;
  }, [src]);

  // Calcular tamaño del visor manteniendo aspect ratio dentro de MAX_W x MAX_H
  var view = React.useMemo(function () {
    if (!nat) return { w: MAX_W, h: MAX_H };
    var s = Math.min(MAX_W / nat.w, MAX_H / nat.h);
    return { w: Math.round(nat.w * s), h: Math.round(nat.h * s) };
  }, [nat]);

  // Al cambiar visor, resetear crop a "imagen completa"
  React.useEffect(function () {
    if (view.w && view.h) setCrop({ x: 0, y: 0, w: view.w, h: view.h });
  }, [view.w, view.h]);

  function clampRect(r) {
    var x = Math.max(0, Math.min(view.w - MIN_CROP, r.x));
    var y = Math.max(0, Math.min(view.h - MIN_CROP, r.y));
    var w = Math.max(MIN_CROP, Math.min(view.w - x, r.w));
    var h = Math.max(MIN_CROP, Math.min(view.h - y, r.h));
    return { x: x, y: y, w: w, h: h };
  }

  function onDown(mode) {
    return function (e) {
      e.stopPropagation();
      e.preventDefault();
      drag.current = { mode: mode, sx: e.clientX, sy: e.clientY, start: crop };
    };
  }

  function onMove(e) {
    if (!drag.current || !crop) return;
    var dx = e.clientX - drag.current.sx;
    var dy = e.clientY - drag.current.sy;
    var s  = drag.current.start;
    var r  = { x: s.x, y: s.y, w: s.w, h: s.h };
    switch (drag.current.mode) {
      case 'move':
        r.x = s.x + dx; r.y = s.y + dy; break;
      case 'tl':
        r.x = s.x + dx; r.y = s.y + dy; r.w = s.w - dx; r.h = s.h - dy; break;
      case 'tr':
        r.y = s.y + dy; r.w = s.w + dx; r.h = s.h - dy; break;
      case 'bl':
        r.x = s.x + dx; r.w = s.w - dx; r.h = s.h + dy; break;
      case 'br':
        r.w = s.w + dx; r.h = s.h + dy; break;
      case 't':
        r.y = s.y + dy; r.h = s.h - dy; break;
      case 'b':
        r.h = s.h + dy; break;
      case 'l':
        r.x = s.x + dx; r.w = s.w - dx; break;
      case 'r':
        r.w = s.w + dx; break;
    }
    // Si por arrastrar un handle el rect quedaría con w o h negativo, evitar
    if (r.w < MIN_CROP) { r.x = s.x + s.w - MIN_CROP; r.w = MIN_CROP; }
    if (r.h < MIN_CROP) { r.y = s.y + s.h - MIN_CROP; r.h = MIN_CROP; }
    setCrop(clampRect(r));
  }
  function onUp() { drag.current = null; }
  React.useEffect(function () {
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return function () {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  });

  // Rotar / espejar: aplica al src y reset crop
  function transform(deg, flip) {
    var im = new Image();
    im.onload = function () {
      var c = document.createElement('canvas');
      var ctx = c.getContext('2d');
      if (deg === 90 || deg === 270) { c.width = im.naturalHeight; c.height = im.naturalWidth; }
      else { c.width = im.naturalWidth; c.height = im.naturalHeight; }
      ctx.translate(c.width / 2, c.height / 2);
      if (deg) ctx.rotate(deg * Math.PI / 180);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(im, -im.naturalWidth / 2, -im.naturalHeight / 2);
      setSrc(c.toDataURL('image/jpeg', 0.92));
    };
    im.src = src;
  }

  // Aplicar: convierte crop (coords del visor) a coords naturales y renderiza
  function apply() {
    if (!nat || !crop) return;
    var scale = nat.w / view.w; // mismo en x e y porque mantenemos aspect ratio
    var sx = Math.round(crop.x * scale);
    var sy = Math.round(crop.y * scale);
    var sw = Math.round(crop.w * scale);
    var sh = Math.round(crop.h * scale);
    var im = new Image();
    im.onload = function () {
      var c = document.createElement('canvas');
      c.width = sw; c.height = sh;
      var ctx = c.getContext('2d');
      ctx.drawImage(im, sx, sy, sw, sh, 0, 0, sw, sh);
      props.onApply(c.toDataURL('image/jpeg', 0.92));
    };
    im.src = src;
  }

  // Render: imagen + overlay con crop window
  var cropEls = crop ? [
    // Overlay oscuro alrededor del crop (4 rectángulos)
    React.createElement('div', { key: 'ov-t', className: 'crop-overlay', style: { left: 0, top: 0, width: view.w, height: crop.y } }),
    React.createElement('div', { key: 'ov-b', className: 'crop-overlay', style: { left: 0, top: crop.y + crop.h, width: view.w, height: view.h - (crop.y + crop.h) } }),
    React.createElement('div', { key: 'ov-l', className: 'crop-overlay', style: { left: 0, top: crop.y, width: crop.x, height: crop.h } }),
    React.createElement('div', { key: 'ov-r', className: 'crop-overlay', style: { left: crop.x + crop.w, top: crop.y, width: view.w - (crop.x + crop.w), height: crop.h } }),
    // Marco del crop con grilla
    React.createElement('div', {
      key: 'frame', className: 'crop-frame',
      style: { left: crop.x, top: crop.y, width: crop.w, height: crop.h },
      onMouseDown: onDown('move'),
    },
      // 8 handles
      ['tl','tr','bl','br','t','b','l','r'].map(function (h) {
        return React.createElement('div', {
          key: h, className: 'crop-handle crop-h-' + h,
          onMouseDown: onDown(h),
        });
      })
    ),
  ] : [];

  return React.createElement(Modal, { onClose: props.onCancel, wide: true },
    React.createElement('div', { className: 'modal-head' },
      React.createElement('h3', null, 'Recortar foto de recepción'),
      React.createElement('button', { className: 'modal-x', onClick: props.onCancel }, React.createElement(Icon, { name: 'x', size: 18 }))
    ),
    React.createElement('div', { className: 'editor-body' },
      React.createElement('div', { className: 'editor-stage', style: { width: view.w, height: view.h } },
        React.createElement('img', { src: src, draggable: false, className: 'editor-img',
          style: { left: 0, top: 0, width: view.w, height: view.h } }),
        cropEls
      ),
      React.createElement('div', { className: 'editor-controls' },
        React.createElement('div', { className: 'editor-btns' },
          React.createElement(Button, { variant: 'soft', size: 'sm', icon: 'rotate', onClick: function () { transform(270, false); } }, 'Girar izq.'),
          React.createElement(Button, { variant: 'soft', size: 'sm', icon: 'rotate', onClick: function () { transform(90, false); } }, 'Girar der.'),
          React.createElement(Button, { variant: 'soft', size: 'sm', icon: 'copy', onClick: function () { transform(0, true); } }, 'Espejar'),
          React.createElement(Button, { variant: 'ghost', size: 'sm', onClick: function () { setCrop({ x: 0, y: 0, w: view.w, h: view.h }); } }, 'Toda la imagen')
        ),
        React.createElement('p', { className: 'editor-tip' }, 'Arrastrá las esquinas o los lados para recortar. El interior del marco se conserva.')
      )
    ),
    React.createElement('div', { className: 'modal-actions' },
      React.createElement(Button, { variant: 'ghost', onClick: props.onCancel }, 'Cancelar'),
      React.createElement(Button, { variant: 'primary', icon: 'check', onClick: apply }, 'Aplicar recorte')
    )
  );
}

Object.assign(window, { PhotoGrid: PhotoGrid, PhotoEditor: PhotoEditor });
