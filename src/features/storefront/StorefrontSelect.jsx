import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { catalogText } from './catalogDiscovery.js';

// Select-only combobox: DOM focus stays on the trigger; active option is virtual focus.
export default function StorefrontSelect({ label, value, options, onChange, open, onOpenChange, disabled }) {
  const id = useId();
  const trigger = useRef(null);
  const menu = useRef(null);
  const reposition = useRef(null);
  const scrollActive = useRef(false);
  const touchTap = useRef(null);
  const ignoreCompatibilityClick = useRef(false);
  const typeahead = useRef({ text: '', time: 0 });
  const selected = Math.max(0, options.findIndex((option) => option.value === value));
  const [active, setActive] = useState(selected);
  const [position, setPosition] = useState(null);
  const expanded = open && !disabled;

  useLayoutEffect(() => {
    if (!expanded) { setPosition(null); return; }
    const place = () => {
    const rect = trigger.current.getBoundingClientRect();
    const viewport = window.visualViewport;
    const leftEdge = viewport?.offsetLeft || 0;
    const topEdge = viewport?.offsetTop || 0;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    const below = topEdge + height - rect.bottom - 12;
    const above = rect.top - topEdge - 12;
    const useAbove = below < Math.min(260, options.length * 44 + 12) && above > below;
    const maxHeight = Math.max(44, Math.min(320, useAbove ? above : below, height - 16));
    const panelWidth = Math.min(Math.max(rect.width, 220), width - 16);
    setPosition({
      left: Math.max(leftEdge + 8, Math.min(rect.left, leftEdge + width - panelWidth - 8)),
      width: panelWidth, maxHeight,
      ...(useAbove ? { bottom: window.innerHeight - rect.top + 6 } : { top: Math.max(topEdge + 8, rect.bottom + 6) })
    });
    };
    reposition.current = place;
    place();
    return () => { reposition.current = null; };
  }, [expanded, selected, options.length]);

  useEffect(() => {
    if (!expanded) return;
    const close = () => onOpenChange(false);
    const resize = () => reposition.current?.();
    const outside = (event) => {
      if (!trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) close();
    };
    const scroll = (event) => { if (!menu.current?.contains(event.target)) close(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('scroll', close);
    };
  }, [expanded, onOpenChange]);

  useLayoutEffect(() => {
    if (!scrollActive.current || !expanded || !position) return;
    scrollActive.current = false;
    menu.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, expanded, position]);

  function commit(index, keepFocus = true) {
    onOpenChange(false);
    if (options[index]?.value !== value) onChange(options[index].value);
    if (keepFocus) trigger.current?.focus({ preventScroll: true });
  }

  function onKeyDown(event) {
    const key = event.key;
    if (key !== 'Tab' && key !== 'Escape') scrollActive.current = true;
    if (key === 'Tab') { if (expanded) commit(active, false); return; }
    if (key === 'Escape') { if (expanded) { event.preventDefault(); onOpenChange(false); } return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
      event.preventDefault();
      if ((key === 'Enter' || key === ' ' || (key === 'ArrowUp' && event.altKey)) && expanded) {
        commit(active); return;
      }
      if (!expanded) { setActive(selected); typeahead.current = { text: '', time: 0 }; onOpenChange(true); }
      const current = expanded ? active : selected;
      if (key === 'Home') setActive(0);
      else if (key === 'End') setActive(options.length - 1);
      else if (expanded && key === 'ArrowDown') setActive(Math.min(options.length - 1, current + 1));
      else if (expanded && key === 'ArrowUp') setActive(Math.max(0, current - 1));
      return;
    }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      let text = now - typeahead.current.time < 700 ? typeahead.current.text + catalogText(key) : catalogText(key);
      // Repeated characters cycle rather than looking for e.g. "rrr".
      const repeated = [...text].every((char) => char === text[0]);
      const prefix = repeated ? text[0] : text;
      const start = expanded ? active : selected;
      const candidates = options.map((_, index) => (start + 1 + index) % options.length);
      const found = candidates.find((index) => catalogText(options[index].label).startsWith(prefix));
      if (!expanded) onOpenChange(true);
      setActive(found === undefined ? (expanded ? active : selected) : found);
      typeahead.current = { text, time: now };
    }
  }

  return (
    <div className="pipo-discovery-select">
      <span id={id + '-label'}>{label}</span>
      <button ref={trigger} type="button" role="combobox" disabled={disabled}
        aria-labelledby={id + '-label'} aria-expanded={expanded} aria-haspopup="listbox"
        aria-controls={expanded ? id + '-list' : undefined}
        aria-activedescendant={expanded && position ? id + '-option-' + active : undefined}
        className="pipo-discovery-trigger"
        onClick={() => { if (!expanded) { scrollActive.current = true; setActive(selected); typeahead.current = { text: '', time: 0 }; } onOpenChange(!expanded); }} onKeyDown={onKeyDown}>
        <span>{options[selected]?.label}</span><ChevronDown size={16} aria-hidden="true" />
      </button>
      {expanded && position && createPortal(
        <div ref={menu} id={id + '-list'} role="listbox" aria-labelledby={id + '-label'}
          className="pipo-discovery-menu" style={position}>
          {options.map((option, index) => (
            <div key={option.value} id={id + '-option-' + index} role="option"
              aria-selected={option.value === value} data-active={index === active}
              className="pipo-discovery-option"
              onPointerMove={(event) => {
                if (event.pointerType !== 'touch') setActive(index);
                else if (touchTap.current && Math.hypot(event.clientX - touchTap.current.x, event.clientY - touchTap.current.y) > 10) touchTap.current = null;
              }}
              onPointerDown={(event) => {
                ignoreCompatibilityClick.current = false;
                if (event.pointerType === 'touch') touchTap.current = { id: event.pointerId, index, x: event.clientX, y: event.clientY, scrollTop: menu.current?.scrollTop };
                else event.preventDefault();
              }}
              onPointerCancel={() => { touchTap.current = null; }}
              onPointerUp={(event) => {
                const tap = touchTap.current;
                touchTap.current = null;
                // A stationary touch confirms without depending on a compatibility click.
                // Panning cancels the candidate above or via pointercancel.
                if (event.pointerType === 'touch' && tap?.id === event.pointerId && tap.index === index
                  && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= 10 && menu.current?.scrollTop === tap.scrollTop) {
                  event.preventDefault();
                  ignoreCompatibilityClick.current = true;
                  commit(index);
                }
              }}
              onClick={() => { if (ignoreCompatibilityClick.current) { ignoreCompatibilityClick.current = false; return; } commit(index); }}>
              <span>{option.label}</span>{option.value === value && <Check size={17} aria-hidden="true" />}
            </div>
          ))}
        </div>, document.body)}
    </div>
  );
}
