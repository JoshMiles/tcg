'use client';
import { useRef } from 'react';
import { Dialog } from './Dialog';
import { ImageUploadField } from './image-upload';
import { AudioUploadField } from './audio-upload';
import { addCard } from '../actions/cards';
import { RARITIES } from '@/lib/rarity';

export function AddCardDialog({
  open,
  onClose,
  packId,
}: {
  open: boolean;
  onClose: () => void;
  packId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  const action = addCard.bind(null, packId);

  async function handleSubmit(formData: FormData) {
    await action(formData);
    formRef.current?.reset();
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add Card" size="md">
      <form ref={formRef} action={handleSubmit}>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <fieldset className="fieldset col-span-2">
              <legend className="fieldset-legend">
                <label htmlFor="add-card-name">Card Name <span className="text-red-400">*</span></label>
              </legend>
              <input
                id="add-card-name"
                name="name"
                required
                autoFocus
                placeholder="e.g. Golden Cheese Wedge"
                className="input w-full"
              />
            </fieldset>

            <fieldset className="fieldset">
              <legend className="fieldset-legend"><label htmlFor="add-card-stars">Rarity</label></legend>
              <select
                id="add-card-stars"
                name="stars"
                defaultValue="1"
                className="select w-full"
              >
                {RARITIES.map(r => (
                  <option key={r.stars} value={r.stars}>
                    {'★'.repeat(r.stars)} {r.label}
                  </option>
                ))}
              </select>
            </fieldset>

            <fieldset className="fieldset">
              <legend className="fieldset-legend">
                <label htmlFor="add-card-probability">Probability <span className="text-red-400">*</span></label>
              </legend>
              <input
                id="add-card-probability"
                name="probability"
                type="number"
                min="1"
                required
                placeholder="e.g. 100"
                className="input w-full"
              />
              <p className="fieldset-label">Higher = more common</p>
            </fieldset>
          </div>

          <ImageUploadField name="imageUrl" />
          <AudioUploadField name="soundUrl" />
          <ImageUploadField name="fullArtImageUrl" label="Full Art Image URL (optional, Full Art &amp; Shiny variants)" />
        </div>

        <div className="px-6 pb-6 flex items-center justify-between border-t border-gray-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2.5 tcg-btn rounded-xl text-sm transition-colors"
          >
            Add Card
          </button>
        </div>
      </form>
    </Dialog>
  );
}
