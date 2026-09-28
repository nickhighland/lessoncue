import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityDefinition, ActivityTheme } from './types';
import { ActivityApi } from './api';
import { ACTIVITY_REGISTRY, getActivityDescriptor } from './activityRegistry';
import { ACTIVITY_PRESET_CATALOG, ACTIVITY_THEME_PRESETS, type ActivityPresetCatalogEntry, type ActivityThemePreset } from './activityPresetRegistry';
import {
  ACTIVITY_CATALOG_CATEGORIES,
  categoryForActivityType,
  compareActivityCatalogCategories,
  getActivityCatalogCategory,
  type ActivityCatalogCategoryId,
} from './activityCatalog';
import { ActivityPreview, type ActivityPreviewMode } from './ActivityPreview';
import { PageHead, Modal, Field, Empty } from '../admin/ui';
import './activity.css';
import { ActivityAutoAdvanceEditor, supportsAutoAdvance, supportsPacing } from './ActivityAutoAdvanceEditor';

const stableDraftValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableDraftValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stableDraftValue(item)]));
};

const activityDraftSnapshot = (name: string, description: string, config: Record<string, unknown>, theme?: ActivityTheme | null) => JSON.stringify(stableDraftValue({ name, description, config, theme: theme || null }));

const activityUsageLabel = (activity: ActivityDefinition): string => {
  const usage = activity.usage;
  if (!usage?.isInUse) return 'Not used in lessons';
  const lessonText = usage.lessonCount === 1 ? '1 lesson' : `${usage.lessonCount} lessons`;
  const templateText = usage.templateCount === 1 ? '1 template' : `${usage.templateCount} templates`;
  const references = [usage.lessonCount ? lessonText : '', usage.templateCount ? templateText : ''].filter(Boolean);
  const runText = usage.activeRunCount > 0 ? ` · ${usage.activeRunCount} live run${usage.activeRunCount === 1 ? '' : 's'}` : '';
  return `Used in ${references.join(' and ')}${runText}`;
};

const activityUsageNames = (activity: ActivityDefinition): string[] => [
  ...(activity.usage?.lessonNames || []).map(name => `Lesson: ${name}`),
  ...(activity.usage?.templateNames || []).map(name => `Template: ${name}`)
];

type ActivityChooserMode = 'templates' | 'blank';
type ActivityChooserParticipation = 'all' | 'phones' | 'room';

type ActivityChooserOption = {
  key: string;
  kind: ActivityChooserMode;
  label: string;
  description: string;
  icon: string;
  category: ActivityCatalogCategoryId;
  requiresPhones: boolean;
  supportsTeams: boolean;
  activityType: string;
  preset?: ActivityPresetCatalogEntry;
};

export const ActivityLibrary: React.FC = () => {
  const [activities, setActivities] = useState<ActivityDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryTotalCount, setLibraryTotalCount] = useState(0);
  const libraryPageSize = 100;
  const [categoryFilter, setCategoryFilter] = useState<'all' | ActivityCatalogCategoryId>('all');
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
  const [groupByCategory, setGroupByCategory] = useState(() => {
    try { return localStorage.getItem('lessoncue.activityGroupByCategory') !== 'false'; } catch { return true; }
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
  const [chooserSearch, setChooserSearch] = useState('');
  const [chooserMode, setChooserMode] = useState<ActivityChooserMode>('templates');
  const [chooserCategory, setChooserCategory] = useState<'all' | ActivityCatalogCategoryId>('all');
  const [chooserParticipation, setChooserParticipation] = useState<ActivityChooserParticipation>('all');
  const [chooserSelectionKey, setChooserSelectionKey] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<ActivityPreviewMode>('display');
  const [editingConfig, setEditingConfig] = useState<Record<string, unknown>>({});
  const [editingName, setEditingName] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [editingTheme, setEditingTheme] = useState<ActivityTheme | null>(null);
  const [savedDraftSnapshot, setSavedDraftSnapshot] = useState('');
  const [pendingEditorClose, setPendingEditorClose] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fetchRequestRef = useRef(0);

  const draftDefinition = useMemo<ActivityDefinition | null>(() => selectedActivity ? {
    ...selectedActivity,
    name: editingName.trim() || selectedActivity.name,
    description: editingDescription,
    config: editingConfig,
    theme: editingTheme || undefined
  } : null, [editingConfig, editingDescription, editingName, editingTheme, selectedActivity]);

  // What the editor is showing right now, for callers that must not depend on
  // when their closure was created.
  //
  // Every write goes through the commits below, which set the ref in the same
  // handler as the state. The ref is authoritative for save: synchronizing it
  // from an effect is unsafe because an older pending effect can run after a
  // newer input event and put the previous draft back just before Save is
  // pressed.
  const draftRef = useRef({ name: editingName, description: editingDescription, config: editingConfig, theme: editingTheme });

  const commitName = useCallback((value: string) => {
    draftRef.current = { ...draftRef.current, name: value };
    setEditingName(value);
  }, []);
  const commitDescription = useCallback((value: string) => {
    draftRef.current = { ...draftRef.current, description: value };
    setEditingDescription(value);
  }, []);
  const commitConfig = useCallback((value: Record<string, unknown>) => {
    draftRef.current = { ...draftRef.current, config: value };
    setEditingConfig(value);
  }, []);
  const commitTheme = useCallback((value: ActivityTheme | null) => {
    draftRef.current = { ...draftRef.current, theme: value };
    setEditingTheme(value);
  }, []);
  const commitDraft = useCallback((draft: {
    name: string; description: string; config: Record<string, unknown>; theme: ActivityTheme | null;
  }) => {
    draftRef.current = draft;
    setEditingName(draft.name);
    setEditingDescription(draft.description);
    setEditingConfig(draft.config);
    setEditingTheme(draft.theme);
  }, []);

  const isEditorDirty = Boolean(draftDefinition && activityDraftSnapshot(
    draftDefinition.name,
    draftDefinition.description,
    draftDefinition.config,
    draftDefinition.theme
  ) !== savedDraftSnapshot);

  const fetchActivities = useCallback(async () => {
    const requestId = ++fetchRequestRef.current;
    try {
      setLoading(true);
      const result = await ActivityApi.listActivityPage(undefined, searchQuery.trim() || undefined, showArchived, libraryPage, libraryPageSize);
      if (requestId !== fetchRequestRef.current) return;
      setActivities(result.items);
      setLibraryTotalCount(result.totalCount);
    } catch (err) {
      if (requestId !== fetchRequestRef.current) return;
      console.error('Failed to load activities:', err);
      setStatusMessage(`Could not load activities: ${(err as Error).message}`);
    } finally {
      if (requestId === fetchRequestRef.current) setLoading(false);
    }
  }, [libraryPage, searchQuery, showArchived]);

  useEffect(() => {
    void fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    setLibraryPage(1);
  }, [searchQuery, showArchived]);

  useEffect(() => {
    try { localStorage.setItem('lessoncue.activityView', viewMode); } catch { /* private browsing */ }
  }, [viewMode]);

  useEffect(() => {
    try { localStorage.setItem('lessoncue.activityGroupByCategory', String(groupByCategory)); } catch { /* private browsing */ }
  }, [groupByCategory]);

  useEffect(() => {
    if (!isEditorDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isEditorDirty]);

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

  const categoryCounts = useMemo(() => {
    const counts = new Map<ActivityCatalogCategoryId, number>();
    activities.forEach(activity => {
      const descriptor = getActivityDescriptor(activity.type);
      const category = categoryForActivityType(activity.type, descriptor.category);
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    return counts;
  }, [activities]);

  const engines = useMemo(() => {
    const values = new Set(activities.map(activity => activity.engineType || getActivityDescriptor(activity.type).engineType).filter(Boolean) as string[]);
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [activities]);

  const hasActiveFilters = Boolean(searchQuery.trim()) || categoryFilter !== 'all' || engineFilter !== 'all' || capabilityFilter !== 'all' || showArchived;
  const totalPages = Math.max(1, Math.ceil(libraryTotalCount / libraryPageSize));

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = activities.filter(activity => {
      const descriptor = getActivityDescriptor(activity.type);
      const catalogCategory = categoryForActivityType(activity.type, descriptor.category);
      if (categoryFilter !== 'all' && catalogCategory !== categoryFilter) return false;
      if (engineFilter !== 'all' && (activity.engineType || descriptor.engineType || '') !== engineFilter) return false;
      if (capabilityFilter === 'phones' && !descriptor.requiresPhones) return false;
      if (capabilityFilter === 'noPhones' && descriptor.requiresPhones) return false;
      if (capabilityFilter === 'teams' && !descriptor.supportsTeams) return false;
      if (capabilityFilter === 'media' && descriptor.category !== 'media' && !['imageReveal', 'imageShuffle'].includes(activity.type)) return false;
      if (capabilityFilter === 'favorites' && !favoriteIds.has(activity.id)) return false;
      if (!query) return true;
      const category = getActivityCatalogCategory(catalogCategory);
      return `${activity.name} ${activity.description} ${descriptor.name} ${descriptor.engineType || ''} ${category.label} ${category.description}`.toLowerCase().includes(query);
    });

    if (sortBy === 'manual') return matches;
    return [...matches].sort((left, right) => {
      if (sortBy === 'name') return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
      if (sortBy === 'type') return getActivityDescriptor(left.type).name.localeCompare(getActivityDescriptor(right.type).name, undefined, { sensitivity: 'base' });
      if (sortBy === 'created') return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [activities, capabilityFilter, categoryFilter, engineFilter, favoriteIds, searchQuery, sortBy]);

  const libraryGroups = useMemo(() => {
    if (!groupByCategory || arrangeMode) return [{ key: 'all', category: null, activities: filtered }];
    const grouped = new Map<ActivityCatalogCategoryId, ActivityDefinition[]>();
    filtered.forEach(activity => {
      const descriptor = getActivityDescriptor(activity.type);
      const category = categoryForActivityType(activity.type, descriptor.category);
      grouped.set(category, [...(grouped.get(category) || []), activity]);
    });
    return [...grouped.entries()]
      .sort(([left], [right]) => compareActivityCatalogCategories(left, right))
      .map(([category, groupedActivities]) => ({ key: category, category, activities: groupedActivities }));
  }, [arrangeMode, filtered, groupByCategory]);

  const visibleIds = filtered.map(activity => activity.id);
  const selectedActivities = activities.filter(activity => selectedIds.has(activity.id));
  const activeSelected = selectedActivities.filter(activity => !activity.archivedAt);
  const archivedSelected = selectedActivities.filter(activity => Boolean(activity.archivedAt));
  const activeSelectedInUse = activeSelected.filter(activity => activity.usage?.isInUse);
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
    if (sourceId === targetId || hasActiveFilters || totalPages > 1) return;
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
    if (hasActiveFilters || totalPages > 1) return;
    const index = activities.findIndex(activity => activity.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= activities.length) return;
    void reorderActivities(id, activities[target].id);
  };

  const handleSelectActivity = (item: ActivityDefinition) => {
    setSelectedActivity(item);
    commitDraft({
      name: item.name, description: item.description || '',
      config: item.config || {}, theme: item.theme || null,
    });
    setSavedDraftSnapshot(activityDraftSnapshot(item.name, item.description || '', item.config || {}, item.theme));
    setPendingEditorClose(false);
    setPreviewTab('display');
  };

  const resetChooser = () => {
    setChooserSearch('');
    setChooserMode('templates');
    setChooserCategory('all');
    setChooserParticipation('all');
    setChooserSelectionKey(null);
  };

  const openChooser = () => {
    resetChooser();
    setIsCreating(true);
  };

  const closeChooser = () => {
    if (isSaving) return;
    setIsCreating(false);
    resetChooser();
  };

  const handleCreateNew = async (type: string) => {
    const desc = getActivityDescriptor(type);
    setIsSaving(true);
    try {
      const created = await ActivityApi.createActivity({
        name: `New ${desc.name}`,
        type,
        presetType: desc.presetType,
        description: desc.description,
        config: desc.createDefaultConfig()
      });
      await fetchActivities();
      handleSelectActivity(created);
      setIsCreating(false);
      resetChooser();
      setStatusMessage(`Created ${created.name}.`);
    } catch (err) {
      setStatusMessage(`Could not create activity: ${(err as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreatePreset = async (preset: ActivityPresetCatalogEntry) => {
    setIsSaving(true);
    try {
      const created = await ActivityApi.createActivity({
        name: preset.label,
        type: preset.type,
        presetType: preset.id,
        description: preset.description,
        config: JSON.parse(JSON.stringify(preset.config)) as Record<string, unknown>,
        theme: preset.theme
      });
      await fetchActivities();
      handleSelectActivity(created);
      setIsCreating(false);
      resetChooser();
      setStatusMessage(`Created ${created.name}.`);
    } catch (err) {
      setStatusMessage(`Could not create ${preset.label}: ${(err as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const chooserOptions = useMemo<ActivityChooserOption[]>(() => {
    if (chooserMode === 'templates') {
      return ACTIVITY_PRESET_CATALOG.map(preset => ({
        key: `preset:${preset.type}:${preset.id}`,
        kind: 'templates',
        label: preset.label,
        description: preset.description,
        icon: preset.icon,
        category: categoryForActivityType(preset.type, preset.category),
        requiresPhones: preset.requiresPhones,
        supportsTeams: preset.supportsTeams,
        activityType: preset.type,
        preset,
      }));
    }
    return Object.values(ACTIVITY_REGISTRY).map(blank => ({
      key: `blank:${blank.type}`,
      kind: 'blank',
      label: blank.name,
      description: blank.description,
      icon: blank.icon,
      category: categoryForActivityType(blank.type, blank.category),
      requiresPhones: Boolean(blank.requiresPhones),
      supportsTeams: Boolean(blank.supportsTeams),
      activityType: blank.type,
    }));
  }, [chooserMode]);

  const chooserSearchResults = useMemo(() => {
    const query = chooserSearch.trim().toLowerCase();
    return chooserOptions.filter(option => {
      if (chooserParticipation === 'phones' && !option.requiresPhones) return false;
      if (chooserParticipation === 'room' && option.requiresPhones) return false;
      if (!query) return true;
      const category = getActivityCatalogCategory(option.category);
      const engine = getActivityDescriptor(option.activityType);
      return `${option.label} ${option.description} ${category.label} ${category.description} ${engine.name} ${engine.description}`
        .toLowerCase()
        .includes(query);
    });
  }, [chooserOptions, chooserParticipation, chooserSearch]);

  const chooserCategoryCounts = useMemo(() => {
    const counts = new Map<ActivityCatalogCategoryId, number>();
    chooserSearchResults.forEach(option => counts.set(option.category, (counts.get(option.category) || 0) + 1));
    return counts;
  }, [chooserSearchResults]);

  const visibleChooserOptions = useMemo(() => chooserSearchResults.filter(option =>
    chooserCategory === 'all' || option.category === chooserCategory
  ), [chooserCategory, chooserSearchResults]);

  const chooserGroups = useMemo(() => {
    const grouped = new Map<ActivityCatalogCategoryId, ActivityChooserOption[]>();
    visibleChooserOptions.forEach(option => grouped.set(option.category, [...(grouped.get(option.category) || []), option]));
    return [...grouped.entries()]
      .sort(([left], [right]) => compareActivityCatalogCategories(left, right))
      .map(([category, options]) => ({ category: getActivityCatalogCategory(category), options }));
  }, [visibleChooserOptions]);

  const selectedChooserOption = chooserOptions.find(option => option.key === chooserSelectionKey) || null;
  const selectedChooserCategory = selectedChooserOption ? getActivityCatalogCategory(selectedChooserOption.category) : null;
  const selectedChooserDescriptor = selectedChooserOption ? getActivityDescriptor(selectedChooserOption.activityType) : null;

  const handleSaveEdit = async (closeAfterSave = false): Promise<boolean> => {
    if (!selectedActivity) return false;
    setIsSaving(true);
    // Read through a ref rather than the values this closure captured. Saving
    // right after applying a preset intermittently stored the previous preset,
    // which is a teacher choosing a format, pressing save, and quietly not
    // getting it. Whatever the editor is showing now is what gets sent.
    const draft = draftRef.current;
    try {
      const updated = await ActivityApi.updateActivity(selectedActivity.id, {
        name: draft.name.trim() || selectedActivity.name,
        type: selectedActivity.type,
        presetType: typeof draft.config.preset === 'string' ? draft.config.preset : selectedActivity.presetType || getActivityDescriptor(selectedActivity.type).presetType,
        description: draft.description.trim(),
        config: draft.config,
        theme: draft.theme || undefined
      });
      setSelectedActivity(updated);
      commitDraft({
        name: updated.name, description: updated.description || '',
        config: updated.config || {}, theme: updated.theme || null,
      });
      setSavedDraftSnapshot(activityDraftSnapshot(updated.name, updated.description || '', updated.config || {}, updated.theme));
      await fetchActivities();
      setStatusMessage('Activity saved.');
      if (closeAfterSave) {
        setPendingEditorClose(false);
        setSelectedActivity(null);
      }
      return true;
    } catch (err) {
      setStatusMessage(`Save failed: ${(err as Error).message}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const closeEditor = () => {
    if (isEditorDirty) {
      setPendingEditorClose(true);
      return;
    }
    setSelectedActivity(null);
  };

  const discardEditorChanges = () => {
    if (selectedActivity) {
      commitDraft({
        name: selectedActivity.name, description: selectedActivity.description || '',
        config: selectedActivity.config || {}, theme: selectedActivity.theme || null,
      });
      setSavedDraftSnapshot(activityDraftSnapshot(selectedActivity.name, selectedActivity.description || '', selectedActivity.config || {}, selectedActivity.theme));
    }
    setPendingEditorClose(false);
    setSelectedActivity(null);
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

  const handleArchiveSelected = async () => {
    if (!activeSelected.length) return;
    setBulkBusy(true);
    try {
      const ids = activeSelected.map(activity => activity.id);
      const result = await ActivityApi.bulkArchiveActivities(ids);
      if (selectedActivity && ids.includes(selectedActivity.id)) setSelectedActivity(null);
      setSelectedIds(current => {
        const next = new Set(current);
        ids.forEach(id => next.delete(id));
        return next;
      });
      await fetchActivities();
      setStatusMessage(`${result.archivedIds.length} ${result.archivedIds.length === 1 ? 'activity' : 'activities'} archived. Lesson links were preserved.`);
    } catch (err) {
      setStatusMessage(`Archive failed: ${(err as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleRestoreSelected = async () => {
    if (!archivedSelected.length) return;
    setBulkBusy(true);
    try {
      const result = await ActivityApi.bulkRestoreActivities(archivedSelected.map(activity => activity.id));
      setSelectedIds(current => {
        const next = new Set(current);
        result.restoredIds.forEach(id => next.delete(id));
        return next;
      });
      await fetchActivities();
      setStatusMessage(`${result.restoredIds.length} ${result.restoredIds.length === 1 ? 'activity' : 'activities'} restored.`);
    } catch (err) {
      setStatusMessage(`Restore failed: ${(err as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleDuplicateSelected = async () => {
    if (!selectedActivities.length) return;
    setBulkBusy(true);
    try {
      const copies = await ActivityApi.bulkDuplicateActivities(selectedActivities.map(activity => activity.id));
      setSelectedIds(new Set());
      await fetchActivities();
      setStatusMessage(`${copies.length} ${copies.length === 1 ? 'activity' : 'activities'} duplicated.`);
    } catch (err) {
      setStatusMessage(`Duplicate failed: ${(err as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleExport = () => {
    if (!draftDefinition) return;
    const blob = new Blob([JSON.stringify(draftDefinition, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${draftDefinition.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.lcactivity`;
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
          config: data.config || {},
          theme: data.theme || undefined
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
        detail="Browse by category, compare clearly described formats, and build games and classroom activities for displays and remotes."
        action={
          <div className="page-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <label className="button" style={{ cursor: 'pointer', margin: 0 }}>
              Import .lcactivity
              <input type="file" accept=".lcactivity,.json" onChange={handleImportFile} style={{ display: 'none' }} />
            </label>
            <button
              type="button"
              className="button primary"
              onClick={openChooser}
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
        <div className="activity-library-category-strip" role="group" aria-label="Filter activities by category">
          <button
            type="button"
            className={categoryFilter === 'all' ? 'active' : ''}
            aria-pressed={categoryFilter === 'all'}
            onClick={() => setCategoryFilter('all')}
          >
            <span aria-hidden="true">✨</span>
            <strong>All activities</strong>
            <small>{activities.length}</small>
          </button>
          {ACTIVITY_CATALOG_CATEGORIES.filter(category => (categoryCounts.get(category.id) || 0) > 0).map(category => (
            <button
              type="button"
              key={category.id}
              className={categoryFilter === category.id ? 'active' : ''}
              aria-pressed={categoryFilter === category.id}
              title={category.description}
              onClick={() => setCategoryFilter(category.id)}
            >
              <span aria-hidden="true">{category.icon}</span>
              <strong>{category.shortLabel}</strong>
              <small>{categoryCounts.get(category.id) || 0}</small>
            </button>
          ))}
        </div>
        <div className="activity-library-toolbar-row activity-library-toolbar-secondary">
          <div className="activity-library-count" aria-live="polite">
            Showing <strong>{filtered.length}</strong> of <strong>{libraryTotalCount}</strong> activities · Page {libraryPage} of {totalPages}
            {showArchived && <span className="activity-library-chip">Including archived</span>}
          </div>
          <label className="activity-library-check-row">
            <input type="checkbox" checked={showArchived} onChange={event => { setShowArchived(event.target.checked); setSelectedIds(new Set()); }} />
            Show archived
          </label>
          <label className="activity-library-check-row">
            <input type="checkbox" checked={groupByCategory} onChange={event => setGroupByCategory(event.target.checked)} />
            Group by category
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
              if (!arrangeMode && totalPages > 1) {
                setStatusMessage('Arrange is available when the full library fits on one page. Use search or filters to narrow it first.');
                return;
              }
              setSortBy('manual');
              setArrangeMode(current => !current);
            }}
          >
            {arrangeMode ? 'Done arranging' : 'Arrange'}
          </button>
          {hasActiveFilters && !arrangeMode && <button
            type="button"
            className="button"
            onClick={() => {
              setSearchQuery('');
              setCategoryFilter('all');
              setCapabilityFilter('all');
              setEngineFilter('all');
              setShowArchived(false);
            }}
          >Clear filters</button>}
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
          <span>
            {activeSelected.length
              ? `${activeSelectedInUse.length} in-use · Archive preserves every lesson link; delete removes unused activities.`
              : 'Archived activities can be restored.'}
          </span>
          <div>
            {archivedSelected.length > 0 && <button type="button" className="button" onClick={() => void handleRestoreSelected()} disabled={bulkBusy}>Restore selected</button>}
            {activeSelected.length > 0 && <button type="button" className="button" onClick={() => void handleArchiveSelected()} disabled={bulkBusy}>Archive selected</button>}
            {activeSelected.length > 0 && <button type="button" className="button danger" onClick={() => setPendingDeleteIds(activeSelected.map(activity => activity.id))} disabled={bulkBusy}>Delete selected</button>}
            <button type="button" className="button" onClick={() => void handleDuplicateSelected()} disabled={bulkBusy}>Duplicate selected</button>
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
              onClick={openChooser}
            >
              Create activity
            </button>
          }
        />
      ) : (
        <div className="activity-library-groups">
          {libraryGroups.map(group => {
            const groupCategory = group.category ? getActivityCatalogCategory(group.category) : null;
            return <section className="activity-library-group" key={group.key}>
              {groupCategory && <header className="activity-library-group-heading">
                <span aria-hidden="true">{groupCategory.icon}</span>
                <div>
                  <h2>{groupCategory.label}</h2>
                  <p>{groupCategory.description}</p>
                </div>
                <strong>{group.activities.length}</strong>
              </header>}
              <div className={viewMode === 'grid' ? 'activity-library-grid' : 'activity-library-list'}>
          {group.activities.map(act => {
            const index = filtered.findIndex(item => item.id === act.id);
            const desc = getActivityDescriptor(act.type);
            const catalogCategory = getActivityCatalogCategory(categoryForActivityType(act.type, desc.category));
            const selected = selectedIds.has(act.id);
            const archived = Boolean(act.archivedAt);
            return viewMode === 'grid' ? (
              <article
                key={act.id}
                className={`activity-library-card panel ${selected ? 'selected' : ''} ${archived ? 'archived' : ''} ${draggedId === act.id ? 'dragging' : ''}`}
                draggable={arrangeMode && !archived && !hasActiveFilters && totalPages === 1}
                onDragStart={() => setDraggedId(act.id)}
                onDragOver={event => { if (arrangeMode && !hasActiveFilters && totalPages === 1) event.preventDefault(); }}
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
                    <span className="activity-library-chip activity-library-category-chip">{catalogCategory.shortLabel}</span>
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
                  <span className={`activity-library-chip ${act.usage?.isInUse ? 'activity-library-usage-chip' : ''}`}>{activityUsageLabel(act)}</span>
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
                draggable={arrangeMode && !archived && !hasActiveFilters && totalPages === 1}
                onDragStart={() => setDraggedId(act.id)}
                onDragOver={event => { if (arrangeMode && !hasActiveFilters && totalPages === 1) event.preventDefault(); }}
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
                <span className="activity-library-list-type">{catalogCategory.shortLabel} · {desc.name}</span>
                <span className="activity-library-list-tags">{desc.requiresPhones ? '📱 Phones' : '📺 No phones'}{desc.supportsTeams ? ' · 👥 Teams' : ''} · {activityUsageLabel(act)}</span>
                <span className="activity-library-list-date">{archived ? 'Archived' : `Updated ${new Date(act.updatedAt).toLocaleDateString()}`}</span>
                {arrangeMode && !archived && <span className="activity-library-arrow-actions"><button type="button" onClick={() => moveActivity(act.id, -1)} disabled={index === 0} aria-label={`Move ${act.name} earlier`}>↑</button><button type="button" onClick={() => moveActivity(act.id, 1)} disabled={index === filtered.length - 1} aria-label={`Move ${act.name} later`}>↓</button></span>}
                <button type="button" className="button" onClick={() => handleSelectActivity(act)}>Open</button>
              </article>
            );
          })}
              </div>
            </section>;
          })}
        </div>
      )}

      {!loading && totalPages > 1 && <nav className="activity-library-pagination" aria-label="Activity library pages">
        <button type="button" className="button" disabled={libraryPage <= 1} onClick={() => { setLibraryPage(page => Math.max(1, page - 1)); setSelectedIds(new Set()); setArrangeMode(false); }}>Previous</button>
        <span>Page {libraryPage} of {totalPages}</span>
        <button type="button" className="button" disabled={libraryPage >= totalPages} onClick={() => { setLibraryPage(page => Math.min(totalPages, page + 1)); setSelectedIds(new Set()); setArrangeMode(false); }}>Next</button>
      </nav>}

      {/* Create Activity Modal */}
      {isCreating && (
        <Modal
          title="Create an activity"
          className="activity-chooser-modal"
          onClose={closeChooser}
        >
          <div className="activity-chooser">
            <div className="activity-chooser-intro">
              <div>
                <strong>{chooserMode === 'templates' ? 'Choose a ready-made format' : 'Choose a blank building block'}</strong>
                <p>{chooserMode === 'templates'
                  ? 'Each format starts with useful sample content and rules. Select one to read exactly how it works before creating it.'
                  : 'Choose the underlying activity style when you want to build every prompt, rule, and round yourself.'}</p>
              </div>
              <div className="activity-chooser-filters">
                <label>
                  <span>Search</span>
                  <input
                    type="search"
                    aria-label="Search activity formats"
                    placeholder="Try trivia, drawing, no phones…"
                    value={chooserSearch}
                    onChange={event => { setChooserSearch(event.target.value); setChooserSelectionKey(null); }}
                  />
                </label>
                <label>
                  <span>Participation</span>
                  <select
                    value={chooserParticipation}
                    onChange={event => { setChooserParticipation(event.target.value as ActivityChooserParticipation); setChooserSelectionKey(null); }}
                  >
                    <option value="all">Any setup</option>
                    <option value="phones">Players use phones</option>
                    <option value="room">No phones required</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="activity-chooser-mode" role="tablist" aria-label="Activity starting point">
              <button
                type="button"
                role="tab"
                aria-selected={chooserMode === 'templates'}
                className={chooserMode === 'templates' ? 'active' : ''}
                onClick={() => { setChooserMode('templates'); setChooserSelectionKey(null); }}
              >
                <strong>Ready-made formats</strong>
                <small>Sample content and rules included</small>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={chooserMode === 'blank'}
                className={chooserMode === 'blank' ? 'active' : ''}
                onClick={() => { setChooserMode('blank'); setChooserSelectionKey(null); }}
              >
                <strong>Blank building blocks</strong>
                <small>Start from an empty activity engine</small>
              </button>
            </div>

            <div className="activity-chooser-categories" role="group" aria-label="Activity categories">
              <button
                type="button"
                className={chooserCategory === 'all' ? 'active' : ''}
                aria-pressed={chooserCategory === 'all'}
                onClick={() => { setChooserCategory('all'); setChooserSelectionKey(null); }}
              >
                <span aria-hidden="true">✨</span><strong>All</strong><small>{chooserSearchResults.length}</small>
              </button>
              {ACTIVITY_CATALOG_CATEGORIES.filter(category => (chooserCategoryCounts.get(category.id) || 0) > 0).map(category => (
                <button
                  type="button"
                  key={category.id}
                  className={chooserCategory === category.id ? 'active' : ''}
                  aria-pressed={chooserCategory === category.id}
                  title={category.description}
                  onClick={() => { setChooserCategory(category.id); setChooserSelectionKey(null); }}
                >
                  <span aria-hidden="true">{category.icon}</span><strong>{category.shortLabel}</strong><small>{chooserCategoryCounts.get(category.id) || 0}</small>
                </button>
              ))}
            </div>

            <div className="activity-chooser-workspace">
              <div className="activity-chooser-results">
                <div className="activity-chooser-section-heading">
                  <h3>{chooserMode === 'templates' ? 'Formats' : 'Building blocks'}</h3>
                  <span>{visibleChooserOptions.length} {visibleChooserOptions.length === 1 ? 'choice' : 'choices'}</span>
                </div>
                {chooserGroups.map(group => <section className="activity-chooser-category" key={group.category.id} aria-labelledby={`chooser-category-${group.category.id}`}>
                  <div className="activity-chooser-category-heading">
                    <span aria-hidden="true">{group.category.icon}</span>
                    <div><h4 id={`chooser-category-${group.category.id}`}>{group.category.label}</h4><p>{group.category.description}</p></div>
                    <strong>{group.options.length}</strong>
                  </div>
                  <div className="activity-chooser-grid">
                    {group.options.map(option => {
                      const descriptor = getActivityDescriptor(option.activityType);
                      return <button
                        type="button"
                        key={option.key}
                        onClick={() => setChooserSelectionKey(option.key)}
                        className={`activity-chooser-card ${chooserSelectionKey === option.key ? 'selected' : ''}`}
                        aria-pressed={chooserSelectionKey === option.key}
                        disabled={isSaving}
                      >
                        <span className="activity-chooser-icon" aria-hidden="true">{option.icon}</span>
                        <span className="activity-chooser-card-copy">
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </span>
                        <span className="activity-chooser-meta">
                          {descriptor.name} · {option.requiresPhones ? '📱 player devices' : '📺 no phones required'}{option.supportsTeams ? ' · teams' : ''}
                        </span>
                      </button>;
                    })}
                  </div>
                </section>)}
                {!visibleChooserOptions.length && <div className="activity-chooser-empty">
                  <strong>No activities match these filters.</strong>
                  <p>Try a different search, category, or participation setup.</p>
                  <button type="button" className="button" onClick={() => {
                    setChooserSearch('');
                    setChooserCategory('all');
                    setChooserParticipation('all');
                  }}>Clear filters</button>
                </div>}
              </div>

              <aside className={`activity-chooser-detail ${selectedChooserOption ? 'has-selection' : ''}`} aria-live="polite">
                {selectedChooserOption && selectedChooserCategory && selectedChooserDescriptor ? <>
                  <div className="activity-chooser-detail-category"><span aria-hidden="true">{selectedChooserCategory.icon}</span>{selectedChooserCategory.label}</div>
                  <div className="activity-chooser-detail-title"><span aria-hidden="true">{selectedChooserOption.icon}</span><h3>{selectedChooserOption.label}</h3></div>
                  <p className="activity-chooser-detail-description">{selectedChooserOption.description}</p>
                  <div className="activity-chooser-detail-explanation">
                    <strong>How this activity works</strong>
                    <p>{selectedChooserOption.kind === 'templates'
                      ? selectedChooserDescriptor.description
                      : `This is the blank ${selectedChooserDescriptor.name} builder. Add your own content and rules in the editor after creating it.`}</p>
                  </div>
                  <div className="activity-chooser-detail-explanation">
                    <strong>Good for</strong>
                    <p>{selectedChooserCategory.description}</p>
                  </div>
                  <ul className="activity-chooser-detail-facts">
                    <li>{selectedChooserOption.requiresPhones ? 'Players participate from phones or tablets.' : 'The host can run it without player devices.'}</li>
                    <li>{selectedChooserOption.supportsTeams ? 'Can be used with teams.' : 'Designed for individual or whole-room participation.'}</li>
                    <li>You can edit all included prompts and content before adding it to a lesson.</li>
                  </ul>
                  <button
                    type="button"
                    className="button primary activity-chooser-create"
                    disabled={isSaving}
                    onClick={() => selectedChooserOption.preset
                      ? void handleCreatePreset(selectedChooserOption.preset)
                      : void handleCreateNew(selectedChooserOption.activityType)}
                  >
                    {isSaving ? 'Creating…' : selectedChooserOption.kind === 'templates' ? `Use ${selectedChooserOption.label}` : `Build a ${selectedChooserOption.label}`}
                  </button>
                </> : <div className="activity-chooser-detail-placeholder">
                  <span aria-hidden="true">☝️</span>
                  <strong>Select an activity to learn more</strong>
                  <p>Its purpose, participation setup, and a clear description will appear here before you create anything.</p>
                </div>}
              </aside>
            </div>
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
            <div className="activity-library-dependency-list">
              {pendingDeleteIds.map(id => {
                const activity = activities.find(item => item.id === id);
                if (!activity) return null;
                const names = activityUsageNames(activity);
                return <div key={id}><strong>{activity.name}</strong><span>{activityUsageLabel(activity)}{names.length ? ` · ${names.slice(0, 3).join(', ')}` : ''}</span></div>;
              })}
            </div>
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
          onMouseDown={e => e.currentTarget === e.target && closeEditor()}
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
                    onChange={e => commitName(e.target.value)}
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
                    {getActivityCatalogCategory(categoryForActivityType(selectedActivity.type, getActivityDescriptor(selectedActivity.type).category)).label}
                    {' · '}{getActivityDescriptor(selectedActivity.type).name}
                  </div>
                  <div className="activity-editor-usage-note">
                    {activityUsageLabel(selectedActivity)}
                    {selectedActivity.usage?.isInUse && <span> · Lesson links stay attached when archived.</span>}
                  </div>
                </div>
                <span className={`activity-editor-draft-status ${isEditorDirty ? 'dirty' : 'saved'}`} role="status">
                  {isEditorDirty ? 'Unsaved changes' : 'Saved'}
                </span>
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
                  onClick={() => void handleSaveEdit()}
                  disabled={isSaving || !isEditorDirty}
                >
                  {isSaving ? 'Saving...' : isEditorDirty ? 'Save activity' : 'Saved'}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={closeEditor}
                  style={{ marginLeft: '0.5rem' }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Modal Body: Split Editor on Left, client-only snapshot preview on Right */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 420px) 1fr', flex: 1, overflow: 'hidden' }}>
              {/* Left Config Editor Panel */}
              <div style={{ padding: '1.5rem', overflowY: 'auto', borderRight: '1px solid var(--line)', background: '#f9f8f5' }}>
                {(() => {
                  const desc = getActivityDescriptor(selectedActivity.type);
                  const EditorComponent = desc.editorComponent;
                  const hasFlowSettings = supportsAutoAdvance(selectedActivity.type) || supportsPacing(selectedActivity.type);
                  return (
                    <>
                      <div className="activity-editor-build-intro">
                        <span>BUILD ACTIVITY</span>
                        <strong>Set the content first, then adjust timing and presentation.</strong>
                      </div>

                      <section className="activity-editor-build-section" aria-labelledby="activity-content-heading">
                        <header className="activity-editor-build-heading">
                          <span>1</span>
                          <div><strong id="activity-content-heading">Content & rules</strong><small>Add what participants will see, answer, or do.</small></div>
                        </header>
                        <Field label="Activity description" hint="Explain the purpose or instructions in plain language so this activity is easy to recognize later.">
                          <textarea
                            value={editingDescription}
                            onChange={e => commitDescription(e.target.value)}
                            rows={3}
                            placeholder="What will players do in this activity?"
                          />
                        </Field>
                        <EditorComponent
                          config={editingConfig}
                          onChange={commitConfig}
                        />
                      </section>

                      {hasFlowSettings && <section className="activity-editor-build-section" aria-labelledby="activity-flow-heading">
                        <header className="activity-editor-build-heading">
                          <span>2</span>
                          <div><strong id="activity-flow-heading">Timing & flow</strong><small>Choose how quickly rounds move and when answers close.</small></div>
                        </header>
                        <ActivityAutoAdvanceEditor
                          type={selectedActivity.type}
                          config={editingConfig}
                          onChange={commitConfig}
                        />
                      </section>}

                      <section className="activity-editor-build-section" aria-labelledby="activity-theme-heading">
                        <header className="activity-editor-build-heading">
                          <span>{hasFlowSettings ? '3' : '2'}</span>
                          <div><strong id="activity-theme-heading">TV presentation</strong><small>Choose the color, sound, motion, and reveal style for the room display.</small></div>
                        </header>
                        <div className="activity-theme-editor activity-editor-card">
                          <div className="activity-editor-card-heading">
                            <div>
                              <strong>Look & sound</strong>
                              <small>The preview updates as you make changes.</small>
                            </div>
                            <button type="button" className="button" onClick={() => commitTheme({ ...ACTIVITY_THEME_PRESETS.stage })}>Reset</button>
                          </div>
                          <label>Theme
                            <select
                              value={editingTheme?.preset || 'stage'}
                              onChange={event => commitTheme({ ...ACTIVITY_THEME_PRESETS[event.target.value as ActivityThemePreset] })}
                            >
                              {Object.keys(ACTIVITY_THEME_PRESETS).map(value => <option key={value} value={value}>{value === 'stage' ? 'LessonCue Stage' : value.replace(/^./, character => character.toUpperCase())}</option>)}
                            </select>
                          </label>
                          <div className="two-fields">
                            <label>Sound
                              <select
                                value={editingTheme?.soundPack || 'gameshow'}
                                onChange={event => commitTheme({ ...(draftRef.current.theme || ACTIVITY_THEME_PRESETS.stage), soundPack: event.target.value as ActivityTheme['soundPack'] })}
                              >
                                <option value="gameshow">Game show</option>
                                <option value="arcade">Arcade</option>
                                <option value="minimal">Minimal</option>
                                <option value="muted">Muted</option>
                              </select>
                            </label>
                            <label className="checkbox-row" style={{ alignSelf: 'end' }}>
                              <input
                                type="checkbox"
                                checked={editingTheme?.backgroundMotion !== false}
                                onChange={event => commitTheme({ ...(draftRef.current.theme || ACTIVITY_THEME_PRESETS.stage), backgroundMotion: event.target.checked })}
                              />
                              Ambient motion
                            </label>
                          </div>
                          <label>Reveal pacing
                            <select
                              aria-label="Reveal pacing"
                              value={typeof editingConfig.revealPacing === 'string' ? editingConfig.revealPacing : 'dramatic'}
                              onChange={event => commitConfig({ ...draftRef.current.config, revealPacing: event.target.value })}
                            >
                              <option value="quick">Quick</option>
                              <option value="dramatic">Dramatic</option>
                              <option value="epic">Epic</option>
                            </select>
                          </label>
                          <small className="muted">Motion respects reduced-motion settings. Game audio stays separate from lesson media volume.</small>
                        </div>
                      </section>
                    </>
                  );
                })()}
              </div>

              {/* Right client-only snapshot preview */}
              <div className="activity-editor-preview-panel">
                <div className="activity-editor-preview-heading">
                  <div>
                    <span className="activity-preview-screen-kicker">PREVIEW SNAPSHOT</span>
                    <strong>{isEditorDirty ? 'Showing your unsaved draft' : 'Showing the saved activity'}</strong>
                  </div>
                  <span className="activity-editor-preview-note">No live session is started</span>
                </div>
                <div className="activity-editor-preview-tabs" role="tablist" aria-label="Activity preview modes">
                  {([
                    ['display', 'TV / display'],
                    ['participant', 'Participant'],
                    ['reveal', 'Reveal'],
                    ['leaderboard', 'Leaderboard'],
                    ['podium', 'Podium']
                  ] as Array<[ActivityPreviewMode, string]>).map(([mode, label]) => <button
                    type="button"
                    role="tab"
                    aria-selected={previewTab === mode}
                    className={previewTab === mode ? 'active' : ''}
                    key={mode}
                    onClick={() => setPreviewTab(mode)}
                  >{label}</button>)}
                </div>
                <div className="activity-editor-preview-canvas" data-preview-mode={previewTab}>
                  {draftDefinition && <ActivityPreview definition={draftDefinition} mode={previewTab} />}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingEditorClose && selectedActivity && (
        <Modal title="Unsaved changes" className="activity-editor-unsaved-modal" onClose={() => setPendingEditorClose(false)}>
          <div className="activity-editor-close-confirmation">
            <p>You have draft changes to <strong>{editingName.trim() || selectedActivity.name}</strong>.</p>
            <p className="muted">Save them before closing, keep editing, or discard this draft. The preview above is based on the same unsaved snapshot.</p>
            <div className="activity-library-confirmation-actions">
              <button type="button" className="button" onClick={() => setPendingEditorClose(false)} disabled={isSaving}>Keep editing</button>
              <button type="button" className="button danger" onClick={discardEditorChanges} disabled={isSaving}>Discard changes</button>
              <button type="button" className="button primary" onClick={() => void handleSaveEdit(true)} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save and close'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
