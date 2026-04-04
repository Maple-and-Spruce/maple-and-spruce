export const EMULATOR_CONFIG = {
  projectId: 'maple-and-spruce-dev',
  functionsHost: 'http://localhost:5001',
  firestoreHost: 'localhost:8080',
  authHost: 'localhost:9099',
  region: 'us-east4',
  origin: 'http://localhost:3000',
} as const;

export function getFunctionUrl(functionName: string): string {
  const { functionsHost, projectId, region } = EMULATOR_CONFIG;
  return `${functionsHost}/${projectId}/${region}/${functionName}`;
}
