import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActivityDefinition, ActivityTypeDescriptor } from './types';
import { ActivityApi } from './api';
import { ACTIVITY_REGISTRY, getActivityDescriptor } from './activityRegistry';
import { ActivityDisplay } from './ActivityDisplay';
import { ActivityController } from './ActivityController';
import { PageHead, Modal, Field, Empty } from '../admin/ui';
import './activity.css';

export const ActivityLibrary: React.FC = () => {
  const [activities, setActivities] = useState<ActivityDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<'all' | ActivityTypeDescriptor['category']>('all');
  const [engineFilter, setEngineFilter] = useState('all');
  const [capabilityFilter, setCapabilityFilter] = useState<'all' | 'phones' | 'noPhones' | 'teams' | 'media' | 'favorites'>('all');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('lessoncue.activityFavorites') || '[]');
      return new Set(Array.isArray(stored) ? stored.filter(item => typeof item === 'string') : []);
    } catch { return new Set(); }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'manual' | 'name' | 'updated' | 'created' | 'type'>('manual');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try { return localStorage.getItem('lessoncue.activityView') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  const [showArchived, setShowArchived] = useState(false);
  const [arrangeMode, setArrangeMode] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [selectedActivity, setSelectedActivity] = useState<ActivityDefinition | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [previewTab, setPreviewTab] = useState<'display' | 'controller'>('display');
  const [editingConfig, setEditingConfig] = useState<Record<string, unknown>>({});
  const [editingName, setEditingName] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true);
      const list = await ActivityApi.listActivities(undefined, undefined, showArchived);
      setActivities(list);
    } catch (err) {
      console.error('Failed to load activities:', err);
      setStatusMessage(`Could not load activities: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    void fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    try { localStorage.setItem('lessoncue.activityView', viewMode); } catch { /* private browsing */ }
  }, [viewMode]);

  useEffect(() => {
    try { localStorage.setItem('lessoncue.activityFavorites', JSON.stringify([...favoriteIds])); } catch { /* private browsing */ }
  }, [favoriteIds]);

  useEffect(() => {
    setSelectedIds(current => {
      const next = new Set([...current].filter(id => activities.some(activity => activity.id === id)));
      return next.size === current.size ? current : next;
    });
    setFavoriteIds(current => {
      const next = new Set([...current].filter(id => activities.some(activity => activity.id === id)));
      return next.size === current.size ? current : next;
    });
  }, [activities]);

  const categories = useMemo(() => {
    const values = new Set<ActivityTypeDescriptor['category']>();
    activities.forEach(activity => values.add(getActivityDescriptor(activity.type).category));
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [activities]);

  const engines = useMemo(() => {
    const values = new Set(activities.map(activity => activity.engineType || getActivityDescriptor(activity.type).engineType).filter(Boolean) as string[]);
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [activities]);

  const hasActiveFilters = Boolean(searchQuery.trim()) || categoryFilter !== 'all' || engineFilter !== 'all' || capabilityFilter !== 'all' || showArchived;

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = activities.filter(activity => {
      const descriptor = getActivityDescriptor(activity.type);
      if (categoryFilter !== 'all' && descriptor.category !== categoryFilter) return false;
      if (engineFilter !== 'all' && (activity.engineType || descriptor.engineType || '') !== engineFilter) return false;
      if (capabilityFilter === 'phones' && !descriptor.requiresPhones) return false;
      if (capabilityFilter === 'noPhones' && descriptor.requiresPhones) return false;
      if (capabilityFilter === 'teams' && !descriptor.supportsTeams) return false;
      if (capabilityFilter === 'media' && descriptor.category !== 'media' && !['imageReveal', 'imageShuffle'].includes(activity.type)) return false;
      if (capabilityFilter === 'favorites' && !favoriteIds.has(activity.id)) return false;
      if (!query) return true;
      return `${activity.name} ${activity.description} ${descriptor.name} ${descriptor.engineType || ''}`.toLowerCase().includes(query);
    });

    if (sortBy === 'manual') return matches;
    return [...matches].sort((left, right) => {
      if (sortBy === 'name') return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
      if (sortBy === 'type') return getActivityDescriptor(left.type).name.localeCompare(getActivityDescriptor(right.type).name, undefined, { sensitivity: 'base' });
      if (sortBy === 'created') return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [activities, capabilityFilter, categoryFilter, engineFilter, favoriteIds, searchQuery, sortBy]);

  const visibleIds = filtered.map(activity => activity.id);
  const selectedActivities = activities.filter(activity => selectedIds.has(activity.id));
  const activeSelected = selectedActivities.filter(activity => !activity.archivedAt);
  const archivedSelected = selectedActivities.filter(activity => Boolean(activity.archivedAt));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

  const setSelection = (id: string, selected: boolean) => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (selected) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleFavorite = (id: string) => {
    setFavoriteIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach(id => next.delete(id));
      else visibleIds.forEach(id => next.add(id));
      return next;
    });
  };

  const reorderActivities = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId || hasActiveFilters) return;
    const sourceIndex = activities.findIndex(activity => activity.id === sourceId);
    const targetIndex = activities.findIndex(activity => activity.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const previous = activities;
    const next = [...activities];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    const positioned = next.map((activity, index) => ({ ...activity, libraryPosition: index }));
    setSortBy('manual');
    setActivities(positioned);
    try {
      await ActivityApi.reorderActivities(positioned.filter(activity => !activity.archivedAt).map(activity => activity.id));
      setStatusMessage('Activity order saved.');
    } catch (err) {
      setActivities(previous);
      setStatusMessage(`Could not save the activity order: ${(err as Error).message}`);
    } finally {
      setDraggedId(null);
    }
  };

  const moveActivity = (id: string, delta: -1 | 1) => {
    if (hasActiveFilters) return;
    const index = activities.findIndex(activity => activity.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= activities.length) return;
    void reorderActivities(id, activities[target].id);
  };

  const handleSelectActivity = (item: ActivityDefinition) => {
    setSelectedActivity(item);
    setEditingName(item.name);
    setEditingDescription(item.description || '');
    setEditingConfig(item.config || {});
    setPreviewTab('display');
  };

  const handleCreateNew = async (type: string) => {
    const desc = getActivityDescriptor(type);
    setIsSaving(true);
    try {
      const created = await ActivityApi.createActivity({
        name: `New ${desc.name}`,
        type,
        description: desc.description,
        config: desc.createDefaultConfig()
      });
      await fetchActivities();
      handleSelectActivity(created);
      setIsCreating(false);
      setStatusMessage(`Created ${created.name}.`);
    } catch (err) {
      setStatusMessage(`Could not create activity: ${(err as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedActivity) return;
    setIsSaving(true);
    try {
      const updated = await ActivityApi.updateActivity(selectedActivity.id, {
        name: editingName.trim() || selectedActivity.name,
        type: selectedActivity.type,
        description: editingDescription.trim(),
        config: editingConfig
      });
      setSelectedActivity(updated);
      await fetchActivities();
      setStatusMessage('Activity saved.');
    } catch (err) {
      setStatusMessage(`Save failed: ${(err as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!selectedActivity) return;
    try {
      const copy = await ActivityApi.duplicateActivity(selectedActivity.id, `${selectedActivity.name} (Copy)`);
      await fetchActivities();
      handleSelectActivity(copy);
      setStatusMessage(`Duplicated ${selectedActivity.name}.`);
    } catch (err) {
      setStatusMessage(`Could not duplicate activity: ${(err as Error).message}`);
    }
  };

  const handleDelete = async () => {
    if (!selectedActivity) return;
    setPendingDeleteIds([selectedActivity.id]);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteIds?.length) return;
    setBulkBusy(true);
    try {
      const result = await ActivityApi.bulkDeleteActivities(pendingDeleteIds);
      if (selectedActivity && pendingDeleteIds.includes(selectedActivity.id)) setSelectedActivity(null);
      setSelectedIds(current => {
        const next = new Set(current);
        pendingDeleteIds.forEach(id => next.delete(id));
        return next;
      });
      setPendingDeleteIds(null);
      await fetchActivities();
      const details = [
        result.deletedIds.length ? `${result.deletedIds.length} deleted` : '',
        result.archivedIds.length ? `${result.archivedIds.length} archived because they are in use` : '',
        result.missingIds.length ? `${result.missingIds.length} no longer existed` : ''
      ].filter(Boolean).join('; ');
      setStatusMessage(details || 'No activities changed.');
    } catch (err) {
      setStatusMessage(`Delete failed: ${(err as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleRestoreSelected = async () => {
    if (!archivedSelected.length) return;
    setBulkBusy(true);
    try {
      await Promise.all(archivedSelected.map(activity => ActivityApi.restoreActivity(activity.id)));
      setSelectedIds(current => {
        const next = new Set(current);
        archivedSelected.forEach(activity => next.delete(activity.id));
        return next;
      });
      await fetchActivities();
      setStatusMessage(`${archivedSelected.length} ${archivedSelected.length === 1 ? 'activity' : 'activities'} restored.`);
    } catch (err) {
      setStatusMessage(`Restore failed: ${(err as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleExport = () => {
    if (!selectedActivity) return;
    const blob = new Blob([JSON.stringify(selectedActivity, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedActivity.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.lcactivity`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);
        if (!data.name || !data.type) throw new Error('Invalid activity package file format');
        const created = await ActivityApi.createActivity({
          name: data.name,
          type: data.type,
          description: data.description || '',
          config: data.config || {}
        });
        await fetchActivities();
        handleSelectActivity(created);
        setStatusMessage(`Imported ${created.name}.`);
      } catch (err) {
        setStatusMessage(`Import failed: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ padding: '0 0 3rem' }}>
      {/* LessonCue Native PageHead */}
      <PageHead
        eyebrow="INTERACTIVE ACTIVITIES"
        title="Activities Studio"
        detail="Exciting high-energy games, spin wheels, scoreboards, and crowd activities for TV displays and remotes."
        action={
          <div className="page-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <label className="button" style={{ cursor: 'pointer', margin: 0 }}>
              Import .lcactivity
              <input type="file" accept=".lcactivity,.json" onChange={handleImportFile} style={{ display: 'none' }} />
            </label>
            <button
              type="button"
              className="button primary"
              onClick={() => setIsCreating(true)}
            >
              + Create activity
            </button>
          </div>
        }
      />

      <section className="activity-library-toolbar" aria-label="Activity library controls">
        <div className="activity-library-toolbar-row">
          <label className="activity-library-search">
            <span>Search activities</span>
            <input
              type="search"
              placeholder="Name, description, or game type"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
            />
          </label>
          <label>
            <span>Category</span>
            <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value as typeof categoryFilter)}>
              <option value="all">All categories</option>
              {categories.map(category => <option key={category} value={category}>{category.replace(/([a-z])([A-Z])/g, '$1 $2')}</option>)}
            </select>
          </label>
          <label>
            <span>Participation</span>
            <select value={capabilityFilter} onChange={event => setCapabilityFilter(event.target.value as typeof capabilityFilter)}>
              <option value="all">All participation</option>
              <option value="phones">Phones required</option>
              <option value="noPhones">Phones optional / not required</option>
              <option value="teams">Supports teams</option>
              <option value="media">Uses media</option>
              <option value="favorites">Favorites</option>
            </select>
          </label>
          <label>
            <span>Game family</span>
            <select value={engineFilter} onChange={event => setEngineFilter(event.target.value)}>
              <option value="all">All game families</option>
              {engines.map(engine => <option key={engine} value={engine}>{engine.replace(/([a-z])([A-Z])/g, '$1 $2')}</option>)}
            </select>
          </label>
        </div>
        <div className="activity-library-toolbar-row activity-library-toolbar-secondary">
          <div className="activity-library-count" aria-live="polite">
            Showing <strong>{filtered.length}</strong> of <strong>{activities.length}</strong> activities
            {showArchived && <span className="activity-library-chip">Including archived</span>}
          </div>
          <label className="activity-library-check-row">
            <input type="checkbox" checked={showArchived} onChange={event => { setShowArchived(event.target.checked); setSelectedIds(new Set()); }} />
            Show archived
          </label>
          <label>
            <span>Sort</span>
            <select value={sortBy} onChange={event => { setSortBy(event.target.value as typeof sortBy); setArrangeMode(false); }}>
              <option value="manual">My order</option>
              <option value="updated">Recently updated</option>
              <option value="created">Recently created</option>
              <option value="name">Name A–Z</option>
              <option value="type">Game type</option>
            </select>
          </label>
          <div className="activity-library-view-toggle" aria-label="Activity view">
            <button type="button" className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')} aria-label="Grid view" aria-pressed={viewMode === 'grid'}>⊞</button>
            <button type="button" className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')} aria-label="List view" aria-pressed={viewMode === 'list'}>☰</button>
          </div>
          <button
            type="button"
            className={`button ${arrangeMode ? 'primary' : ''}`}
            onClick={() => {
              if (!arrangeMode && hasActiveFilters) {
                setStatusMessage('Clear search and filters before arranging the full library.');
                return;
              }
              setSortBy('manual');
              setArrangeMode(current => !current);
            }}
          >
            {arrangeMode ? 'Done arranging' : 'Arrange'}
          </button>
        </div>
        {arrangeMode && <p className="activity-library-hint">Drag activities into your preferred order, or use the keyboard arrows on each item. Clear filters to arrange the entire library.</p>}
      </section>

      {statusMessage && <div className="activity-library-status" role="status">{statusMessage}<button type="button" onClick={() => setStatusMessage('')} aria-label="Dismiss status">×</button></div>}

      {selectedActivities.length > 0 && (
        <section className="activity-library-bulk-bar" aria-label="Bulk activity actions">
          <label className="activity-library-check-row">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all visible activities" />
            <strong>{selectedActivities.length} selected</strong>
          </label>
          <span>{activeSelected.length ? 'Delete removes unused activities or archives activities still used by lessons.' : 'Archived activities can be restored.'}</span>
          <div>
            {archivedSelected.length > 0 && <button type="button" className="button" onClick={() => void handleRestoreSelected()} disabled={bulkBusy}>Restore selected</button>}
            {activeSelected.length > 0 && <button type="button" className="button danger" onClick={() => setPendingDeleteIds(activeSelected.map(activity => activity.id))} disabled={bulkBusy}>Delete selected</button>}
            <button type="button" className="button" onClick={() => setSelectedIds(new Set())} disabled={bulkBusy}>Clear selection</button>
          </div>
        </section>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted)' }}>Loading activities...</div>
      ) : filtered.length === 0 ? (
        <Empty
          title="No activities found"
          body="Create your first spin wheel, scoreboard, or trivia quiz to get started."
          action={
            <button
              type="button"
              className="button primary"
              onClick={() => setIsCreating(true)}
            >
              Create activity
            </button>
          }
        />
      ) : (
        <div className={viewMode === 'grid' ? 'activity-library-grid' : 'activity-library-list'}>
          {filtered.map((act, index) => {
            const desc = getActivityDescriptor(act.type);
            const selected = selectedIds.has(act.id);
            const archived = Boolean(act.archivedAt);
            return viewMode === 'grid' ? (
              <article
                key={act.id}
                className={`activity-library-card panel ${selected ? 'selected' : ''} ${archived ? 'archived' : ''} ${draggedId === act.id ? 'dragging' : ''}`}
                draggable={arrangeMode && !archived && !hasActiveFilters}
                onDragStart={() => setDraggedId(act.id)}
                onDragOver={event => { if (arrangeMode && !hasActiveFilters) event.preventDefault(); }}
                onDrop={event => { event.preventDefault(); if (draggedId) void reorderActivities(draggedId, act.id); }}
                onDragEnd={() => setDraggedId(null)}
              >
                <div className="activity-library-card-top">
                  <label className="activity-library-select" onClick={event => event.stopPropagation()}>
                    <input type="checkbox" checked={selected} onChange={event => setSelection(act.id, event.target.checked)} aria-label={`Select ${act.name}`} />
                  </label>
                  {arrangeMode && !archived && <span className="activity-library-drag-handle" aria-hidden="true">⋮⋮</span>}
                  <span className="activity-library-icon" aria-hidden="true">{desc.icon}</span>
                  {act.thumbnailUrl ? <img className="activity-library-thumbnail" src={act.thumbnailUrl} alt="" /> : null}
                  <button type="button" className={`activity-library-favorite ${favoriteIds.has(act.id) ? 'active' : ''}`} onClick={event => { event.stopPropagation(); toggleFavorite(act.id); }} aria-label={`${favoriteIds.has(act.id) ? 'Remove' : 'Add'} ${act.name} ${favoriteIds.has(act.id) ? 'from' : 'to'} favorites`} aria-pressed={favoriteIds.has(act.id)}>★</button>
                  <div className="activity-library-card-badges">
                    {archived && <span className="activity-library-chip archived-chip">Archived</span>}
                    {desc.badge && <span className="activity-library-chip">{desc.badge}</span>}
                  </div>
                </div>
                <button type="button" className="activity-library-card-open" onClick={() => handleSelectActivity(act)}>
                  <strong>{act.name}</strong>
                  <span>{act.description || desc.description}</span>
                </button>
                <div className="activity-library-card-tags">
                  {desc.requiresPhones && <span className="activity-library-chip">📱 Phones</span>}
                  {!desc.requiresPhones && <span className="activity-library-chip">📺 No phones needed</span>}
                  {desc.supportsTeams && <span className="activity-library-chip">👥 Teams</span>}
                  {desc.engineType && <span className="activity-library-chip">{desc.engineType}</span>}
                </div>
                <div className="activity-library-card-footer">
                  <span>{desc.name}</span>
                  {arrangeMode && !archived && <span className="activity-library-arrow-actions"><button type="button" onClick={() => moveActivity(act.id, -1)} disabled={index === 0} aria-label={`Move ${act.name} earlier`}>↑</button><button type="button" onClick={() => moveActivity(act.id, 1)} disabled={index === filtered.length - 1} aria-label={`Move ${act.name} later`}>↓</button></span>}
                  <button type="button" className="activity-library-open-link" onClick={() => handleSelectActivity(act)}>Open & edit →</button>
                </div>
              </article>
            ) : (
              <article
                key={act.id}
                className={`activity-library-list-row ${selected ? 'selected' : ''} ${archived ? 'archived' : ''} ${draggedId === act.id ? 'dragging' : ''}`}
                draggable={arrangeMode && !archived && !hasActiveFilters}
                onDragStart={() => setDraggedId(act.id)}
                onDragOver={event => { if (arrangeMode && !hasActiveFilters) event.preventDefault(); }}
                onDrop={event => { event.preventDefault(); if (draggedId) void reorderActivities(draggedId, act.id); }}
                onDragEnd={() => setDraggedId(null)}
              >
                <label className="activity-library-select">
                  <input type="checkbox" checked={selected} onChange={event => setSelection(act.id, event.target.checked)} aria-label={`Select ${act.name}`} />
                </label>
                {arrangeMode && !archived && <span className="activity-library-drag-handle" aria-hidden="true">⋮⋮</span>}
                <span className="activity-library-list-icon" aria-hidden="true">{desc.icon}</span>
                {act.thumbnailUrl ? <img className="activity-library-list-thumbnail" src={act.thumbnailUrl} alt="" /> : null}
                <button type="button" className={`activity-library-favorite ${favoriteIds.has(act.id) ? 'active' : ''}`} onClick={event => { event.stopPropagation(); toggleFavorite(act.id); }} aria-label={`${favoriteIds.has(act.id) ? 'Remove' : 'Add'} ${act.name} ${favoriteIds.has(act.id) ? 'from' : 'to'} favorites`} aria-pressed={favoriteIds.has(act.id)}>★</button>
                <button type="button" className="activity-library-list-name" onClick={() => handleSelectActivity(act)}><strong>{act.name}</strong><small>{act.description || desc.description}</small></button>
                <span className="activity-library-list-type">{desc.name}</span>
                <span className="activity-library-list-tags">{desc.requiresPhones ? '📱 Phones' : '📺 No phones'}{desc.supportsTeams ? ' · 👥 Teams' : ''}</span>
                <span className="activity-library-list-date">{archived ? 'Archived' : `Updated ${new Date(act.updatedAt).toLocaleDateString()}`}</span>
                {arrangeMode && !archived && <span className="activity-library-arrow-actions"><button type="button" onClick={() => moveActivity(act.id, -1)} disabled={index === 0} aria-label={`Move ${act.name} earlier`}>↑</button><button type="button" onClick={() => moveActivity(act.id, 1)} disabled={index === filtered.length - 1} aria-label={`Move ${act.name} later`}>↓</button></span>}
                <button type="button" className="button" onClick={() => handleSelectActivity(act)}>Open</button>
              </article>
            );
          })}
        </div>
      )}

      {/* Create Activity Modal */}
      {isCreating && (
        <Modal
          title="Choose an Activity Type"
          onClose={() => setIsCreating(false)}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            {Object.values(ACTIVITY_REGISTRY).map(entry => (
              <div
                key={entry.type}
                onClick={() => handleCreateNew(entry.type)}
                className="panel"
                style={{
                  padding: '1.25rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--line)',
                  background: '#ffffff'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--gold)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--line)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>{entry.icon}</div>
                <h4 style={{ margin: '0 0 0.3rem', fontSize: '1.1rem', fontWeight: 800, color: 'var(--ink)' }}>{entry.name}</h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>{entry.description}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {pendingDeleteIds && (
        <Modal
          title={pendingDeleteIds.length === 1 ? 'Delete activity?' : `Delete ${pendingDeleteIds.length} activities?`}
          onClose={() => !bulkBusy && setPendingDeleteIds(null)}
        >
          <div className="activity-library-confirmation">
            <p>
              {pendingDeleteIds.length === 1
                ? `Remove “${activities.find(activity => activity.id === pendingDeleteIds[0])?.name || 'this activity'}” from the library?`
                : `Remove these ${pendingDeleteIds.length} activities from the library?`}
            </p>
            <p className="muted">Activities still used by a lesson or live run will be archived so existing lessons keep working. Unused activities will be permanently deleted.</p>
            <div className="activity-library-confirmation-actions">
              <button type="button" className="button" onClick={() => setPendingDeleteIds(null)} disabled={bulkBusy}>Cancel</button>
              <button type="button" className="button danger" onClick={() => void confirmDelete()} disabled={bulkBusy}>{bulkBusy ? 'Deleting…' : 'Delete selected'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Activity Detail & Live Simulator Drawer */}
      {selectedActivity && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 9999 }}
          onMouseDown={e => e.currentTarget === e.target && setSelectedActivity(null)}
        >
          <div
            className="modal"
            style={{
              maxWidth: '1350px',
              width: '95vw',
              height: '90vh',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem 1.5rem',
                borderBottom: '1px solid var(--line)',
                background: '#ffffff',
                flexWrap: 'wrap',
                gap: '0.75rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.8rem' }}>{getActivityDescriptor(selectedActivity.type).icon}</span>
                <div>
                  <input
                    type="text"
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 800,
                      background: 'transparent',
                      border: '1px solid #d1d4ce',
                      borderRadius: '6px',
                      color: 'var(--ink)',
                      padding: '0.2rem 0.5rem'
                    }}
                  />
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '2px' }}>
                    Type: {getActivityDescriptor(selectedActivity.type).name}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="button"
                  onClick={handleExport}
                  title="Export as .lcactivity"
                >
                  Export
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={handleDuplicate}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="button danger"
                  onClick={handleDelete}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save activity'}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => setSelectedActivity(null)}
                  style={{ marginLeft: '0.5rem' }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Modal Body: Split Editor on Left, Live Stage Simulator on Right */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 420px) 1fr', flex: 1, overflow: 'hidden' }}>
              {/* Left Config Editor Panel */}
              <div style={{ padding: '1.5rem', overflowY: 'auto', borderRight: '1px solid var(--line)', background: '#f9f8f5' }}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <Field label="Description">
                    <textarea
                      value={editingDescription}
                      onChange={e => setEditingDescription(e.target.value)}
                      rows={2}
                      placeholder="Optional notes or instructions"
                    />
                  </Field>
                </div>

                {(() => {
                  const desc = getActivityDescriptor(selectedActivity.type);
                  const EditorComponent = desc.editorComponent;
                  return (
                    <EditorComponent
                      config={editingConfig}
                      onChange={setEditingConfig}
                    />
                  );
                })()}
              </div>

              {/* Right Live Stage & Controller Simulator */}
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#091c1d' }}>
                {/* Simulator Mode Tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', padding: '0.6rem 1.25rem', background: '#1c2b27', borderBottom: '1px solid #2e3d38' }}>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('display')}
                    style={{
                      background: previewTab === 'display' ? 'var(--gold)' : 'transparent',
                      color: previewTab === 'display' ? '#000000' : '#c0d1cb',
                      fontWeight: 700,
                      border: 'none',
                      padding: '0.35rem 0.9rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.88rem'
                    }}
                  >
                    TV Stage Display
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('controller')}
                    style={{
                      background: previewTab === 'controller' ? 'var(--gold)' : 'transparent',
                      color: previewTab === 'controller' ? '#000000' : '#c0d1cb',
                      fontWeight: 700,
                      border: 'none',
                      padding: '0.35rem 0.9rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.88rem'
                    }}
                  >
                    Remote Controller
                  </button>
                </div>

                {/* Simulator Canvas View */}
                <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                  {previewTab === 'display' ? (
                    <ActivityDisplay definitionId={selectedActivity.id} interactive />
                  ) : (
                    <div style={{ padding: '1.5rem', maxWidth: '500px', margin: '0 auto', overflowY: 'auto', height: '100%', background: '#f9f8f5' }}>
                      <ActivityController definitionId={selectedActivity.id} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
