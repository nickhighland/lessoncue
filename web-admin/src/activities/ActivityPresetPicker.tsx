import React, { useEffect, useRef } from 'react';
import type { ActivityPresetTemplate } from './activityPresetRegistry';

export const ActivityPresetPicker: React.FC<{
  label: string;
  value?: string;
  templates: ActivityPresetTemplate[];
  onPresetChange: (preset: ActivityPresetTemplate) => void;
  onApply: (preset: ActivityPresetTemplate) => void;
}> = ({ label, value, templates, onPresetChange, onApply }) => {
  const selected = templates.find(template => template.id === value) || templates[0];
  const selectedId = selected?.id || '';
  const presetSelectRef = useRef<HTMLSelectElement>(null);
  const livePresetIdRef = useRef(selectedId);
  const lastPropPresetRef = useRef(selectedId);
  useEffect(() => {
    if (lastPropPresetRef.current === selectedId) return;
    lastPropPresetRef.current = selectedId;
    livePresetIdRef.current = selectedId;
    if (presetSelectRef.current) presetSelectRef.current.value = selectedId;
  }, [selectedId]);
  if (!selected) return null;
  const applySelectedPreset = () => {
    const liveSelectedId = livePresetIdRef.current || presetSelectRef.current?.value || selected.id;
    onApply(templates.find(template => template.id === liveSelectedId) || selected);
  };
  return <section className="activity-preset-picker" aria-label={`${label} templates`}>
    <div className="activity-editor-card-heading">
      <div><strong>{label}</strong><small>{selected.description}</small></div>
      <span className="activity-library-chip">Reusable engine</span>
    </div>
    <div className="activity-preset-picker-row">
      <select ref={presetSelectRef} aria-label={`${label} preset`} defaultValue={selected.id} onChange={event => {
        livePresetIdRef.current = event.target.value;
        const next = templates.find(template => template.id === event.target.value);
        if (next) onPresetChange(next);
      }}>
        {templates.map(template => <option value={template.id} key={template.id}>{template.label}</option>)}
      </select>
      <button type="button" className="button" onClick={applySelectedPreset}>Apply preset template</button>
    </div>
    <p className="activity-editor-help">Applying a template replaces this activity’s current content with editable starter material.</p>
  </section>;
};
