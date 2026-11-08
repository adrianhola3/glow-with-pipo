import React, { useEffect, useRef, useState } from 'react';
import { Palette, X } from 'lucide-react';
import { SHADE_COLOR_PRESETS } from '../domain/constants.js';

export default function ShadeColorPicker({
  value = null,
  onChange,
  align = 'left',
  title = 'Elegir color referencial (opcional)'
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const colorInputRef = useRef(null);

  const activeHex = value && String(value).trim() ? String(value).trim() : null;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function handleSelectPreset(hex) {
    onChange?.(hex);
    setOpen(false);
  }

  return (
    <div
      ref={containerRef}
      className="shade-color-picker-wrap"
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
    >
      <button
        type="button"
        title={activeHex ? `Color: ${activeHex} (clic para cambiar o quitar)` : title}
        aria-label={title}
        aria-expanded={open}
        className={`shade-swatch-trigger ${activeHex ? 'has-color' : 'no-color'}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span
          className={`shade-swatch-dot ${activeHex ? '' : 'empty'}`}
          style={activeHex ? { backgroundColor: activeHex } : undefined}
        />
      </button>

      {open && (
        <div
          className={`shade-palette-popover align-${align}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shade-palette-head">
            <span>Color del tono (opcional)</span>
            <button
              type="button"
              className="shade-palette-close"
              onClick={() => setOpen(false)}
              aria-label="Cerrar paleta"
            >
              <X size={13} />
            </button>
          </div>

          <div className="shade-palette-grid">
            {SHADE_COLOR_PRESETS.map((preset) => {
              const isSelected =
                activeHex && activeHex.toUpperCase() === preset.hex.toUpperCase();
              return (
                <button
                  key={preset.hex}
                  type="button"
                  title={`${preset.label} (${preset.hex})`}
                  className={`shade-preset-btn ${isSelected ? 'selected' : ''}`}
                  style={{ backgroundColor: preset.hex }}
                  onClick={() => handleSelectPreset(preset.hex)}
                />
              );
            })}
          </div>

          <div className="shade-palette-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm shade-custom-wheel-btn"
              onClick={() => colorInputRef.current?.click()}
            >
              <Palette size={13} /> Rueda libre
            </button>
            <input
              ref={colorInputRef}
              type="color"
              value={activeHex || '#EC407A'}
              onChange={(e) => onChange?.(e.target.value.toUpperCase())}
              style={{
                position: 'absolute',
                opacity: 0,
                width: 1,
                height: 1,
                pointerEvents: 'none'
              }}
              tabIndex={-1}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm shade-clear-color-btn"
              onClick={() => handleSelectPreset(null)}
            >
              Sin color
            </button>
          </div>

          {activeHex && (
            <div className="shade-palette-hex-foot">
              Seleccionado: <strong>{activeHex.toUpperCase()}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
