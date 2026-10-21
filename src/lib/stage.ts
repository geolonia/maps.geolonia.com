export type Stage = 'v1' | 'dev';

const isStage = (value: string | null): value is Stage => value === 'v1' || value === 'dev';

// ハッシュの stage を優先し、なければ保存済みの値、どちらもなければ v1 を使う
export const resolveStage = (fromHash: string | null, fromStorage: string | null): Stage => {
  if (isStage(fromHash)) {
    return fromHash;
  }
  if (isStage(fromStorage)) {
    return fromStorage;
  }
  return 'v1';
};

export const nextStage = (stage: Stage): Stage => (stage === 'dev' ? 'v1' : 'dev');
