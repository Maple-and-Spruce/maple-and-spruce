const OFFSET = parseInt(process.env['EMULATOR_PORT_OFFSET'] ?? '0', 10);

const FUNCTIONS_PORT = 5001 + OFFSET;
const FIRESTORE_PORT = 8080 + OFFSET;
const AUTH_PORT = 9099 + OFFSET;
const ORIGIN_PORT = 3000 + OFFSET;
const MOCK_SERVER_PORT = 9999 + OFFSET;
const ETSY_MOCK_SERVER_PORT = 9998 + OFFSET;

export const EMULATOR_CONFIG = {
  projectId: 'maple-and-spruce-dev',
  functionsHost: `http://localhost:${FUNCTIONS_PORT}`,
  firestoreHost: `localhost:${FIRESTORE_PORT}`,
  authHost: `localhost:${AUTH_PORT}`,
  region: 'us-east4',
  origin: `http://localhost:${ORIGIN_PORT}`,
  /** Monolithic mock server (Square + Webflow routes) */
  mockServerUrl: `http://localhost:${MOCK_SERVER_PORT}`,
  /** Dedicated Etsy mock server */
  etsyMockServerUrl: `http://localhost:${ETSY_MOCK_SERVER_PORT}`,
  portOffset: OFFSET,
} as const;

export function getFunctionUrl(functionName: string): string {
  const { functionsHost, projectId, region } = EMULATOR_CONFIG;
  return `${functionsHost}/${projectId}/${region}/${functionName}`;
}
