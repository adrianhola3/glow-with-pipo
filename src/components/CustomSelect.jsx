import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Seleccionar...',
  icon: LeadingIcon = null,
  style = {},
  triggerStyle = {},
  className = '',
  disabled = false,
  ariaLabel
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();

  // Normalize options to { value, label, badge, hint }
  const normalizedOptions = useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === 'object' && opt !== null) {
        return {
          value: opt.value !== undefined ? opt.value : opt.id,
          label: opt.label || opt.name || String(opt.value),
          badge: opt.badge || null,
          hint: opt.hint || null
        };
      }
      return {
        value: opt,
        label: String(opt),
        badge: null,
        hint: null
      };
    });
  }, [options]);

  const selectedOption = useMemo(() => {
    return normalizedOptions.find((o) => String(o.value) === String(value)) || null;
  }, [normalizedOptions, value]);

  // Close on outside pointer click
  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function handleSelect(val) {
    onChange?.(val);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div
      ref={containerRef}
      className={`pipo-select-container ${className} ${isOpen ? 'is-open' : ''}`}
      style={{ position: 'relative', minWidth: 0, ...style }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={ariaLabel || placeholder}
        className={`pipo-select-trigger ${isOpen ? 'active' : ''}`}
        style={triggerStyle}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="pipo-select-trigger-content">
          {LeadingIcon && <LeadingIcon size={16} className="pipo-select-leading-icon" />}
          <span className="pipo-select-trigger-label">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span className="badge badge-brand" style={{ fontSize: '0.72rem', padding: '2px 7px' }}>
              {selectedOption.badge}
            </span>
          )}
        </span>
        <ChevronDown size={17} className={`pipo-select-chevron ${isOpen ? 'rotated' : ''}`} />
      </button>

      {isOpen && (
        <div id={menuId} role="listbox" className="pipo-select-menu" tabIndex={-1}>
          {normalizedOptions.length === 0 ? (
            <div className="pipo-select-empty">No hay opciones disponibles</div>
          ) : (
            normalizedOptions.map((opt) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`pipo-select-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelect(opt.value)}
                >
                  <span className="pipo-select-option-label">
                    {opt.label}
                    {opt.hint && <small className="pipo-select-option-hint">{opt.hint}</small>}
                  </span>
                  <span className="pipo-select-option-right">
                    {opt.badge && (
                      <span className="badge badge-brand" style={{ fontSize: '0.7rem' }}>
                        {opt.badge}
                      </span>
                    )}
                    {isSelected && <Check size={16} className="pipo-select-check" />}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
