import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  file: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  FirebaseProject: { storageBucket: 'test-bucket' },
  throwValidationError: (errs: Record<string, string[]>) => {
    throw new Error(`Validation failed: ${Object.keys(errs).join(',')}`);
  },
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: (name: string) => ({ name, file: mocks.file }),
  }),
}));

import { uploadInstructorImage } from './upload-instructor-image';

// A 1x1 PNG.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('uploadInstructorImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    mocks.file.mockReturnValue({ save: mocks.save });
  });

  it("stores the photo under the instructor's folder and returns its public URL", async () => {
    const result = await uploadInstructorImage({
      instructorId: 'instructor-1',
      imageBase64: PNG,
      contentType: 'image/png',
    });

    const path = 'instructors/instructor-1/photo_1700000000000.png';
    expect(mocks.file).toHaveBeenCalledWith(path);
    expect(mocks.save).toHaveBeenCalledWith(expect.any(Buffer), {
      metadata: { contentType: 'image/png' },
    });
    expect(result).toEqual({
      success: true,
      url: `https://firebasestorage.googleapis.com/v0/b/test-bucket/o/${encodeURIComponent(path)}?alt=media`,
    });
  });

  it('uses a temp folder for an instructor not yet created', async () => {
    await uploadInstructorImage({ imageBase64: PNG, contentType: 'image/png' });

    expect(mocks.file).toHaveBeenCalledWith(
      'instructors/temp/photo_1700000000000.png'
    );
  });

  it('refuses a non-image before writing anything', async () => {
    await expect(
      uploadInstructorImage({ imageBase64: PNG, contentType: 'text/plain' })
    ).rejects.toThrow(/Validation failed/);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
