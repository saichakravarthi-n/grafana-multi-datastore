// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const base = require('./.config/jest.config');

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...base,
  testMatch: [...base.testMatch, '<rootDir>/tests/unit/**/*.{spec,test}.{ts,tsx}'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.{spec,test}.{ts,tsx}'],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  // React's scheduler opens a MessageChannel that Jest will not close.
  forceExit: true,
};
