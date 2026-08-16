import React from 'react';

interface ShuffleImage {
  id: string;
  imageUrl: string;
  label?: string;
}

interface ImageShuffleConfig {
  title?: string;
  images?: ShuffleImage[];
}

export const ImageShuffleEditor: React.FC<{
  config: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}> = ({ config, onChange }) => {
  const isConfig = (config as ImageShuffleConfig) || {};
  const images: ShuffleImage[] = isConfig.images || [];

  const updateImages = (newImages: ShuffleImage[]) => {
    onChange({ ...isConfig, images: newImages });
  };

  const handleAddImage = () => {
    const nextIdx = images.length + 1;
    const newImg: ShuffleImage = {
      id: Math.random().toString(36).substring(2, 9),
      imageUrl: '',
      label: `Image ${nextIdx}`
    };
    updateImages([...images, newImg]);
  };

  const handleRemoveImage = (idx: number) => {
    updateImages(images.filter((_, i) => i !== idx));
  };

  const handleImageChange = (idx: number, field: keyof ShuffleImage, val: unknown) => {
    const next = [...images];
    next[idx] = { ...next[idx], [field]: val };
    updateImages(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--ink)' }}>
          Activity Title
        </label>
        <input
          type="text"
          value={isConfig.title || ''}
          onChange={e => onChange({ ...isConfig, title: e.target.value })}
          placeholder="e.g. Visual Randomizer"
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
        />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <label style={{ fontWeight: 700, color: 'var(--ink)' }}>Images Pool ({images.length})</label>
          <button
            type="button"
            onClick={handleAddImage}
            className="button"
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', margin: 0 }}
          >
            + Add Image
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {images.map((img, idx) => (
            <div
              key={img.id || idx}
              style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--mint)', border: '1px solid var(--line)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}
            >
              <input
                type="text"
                value={img.label || ''}
                onChange={e => handleImageChange(idx, 'label', e.target.value)}
                placeholder="Label"
                style={{ width: '120px', padding: '0.4rem 0.6rem', borderRadius: '6px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
              />
              <input
                type="text"
                value={img.imageUrl}
                onChange={e => handleImageChange(idx, 'imageUrl', e.target.value)}
                placeholder="Image URL..."
                style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '6px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
              />
              <button
                type="button"
                onClick={() => handleRemoveImage(idx)}
                className="button danger"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.9rem', margin: 0 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
