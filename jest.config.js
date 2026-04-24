/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
    // Use babel-jest for plain .js files (handles uuid ESM → CJS)
    '^.+\\.js$': 'babel-jest',
  },
  // Allow uuid (and other ESM-only node_modules) to be transformed
  transformIgnorePatterns: [
    '/node_modules/(?!(uuid)/)',
  ],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  },
  collectCoverageFrom: [
    'src/main/**/*.ts',
    '!src/main/index.ts',
    '!src/main/preload.ts',
  ],
  coverageReporters: ['text', 'lcov'],
}
