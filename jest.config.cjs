// jest.config.cjs
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    clearMocks: true,
    coverageProvider: 'v8',
    moduleNameMapper: {
      '^@/(.*)$': '<rootDir>/src/$1',
    },
    rootDir: '.',
    roots: ['<rootDir>/src'],
    testMatch: [
      '**/__tests__/**/*.[jt]s?(x)',
      '**/?(*.)+(spec|test).[tj]s?(x)',
    ],
    transform: {
      // This tells Jest to use ts-jest for .ts and .tsx files
      // ts-jest will then use your tsconfig.app.json and babel.config.json (due to babelConfig: true)
      '^.+\\.tsx?$': [
        'ts-jest',
        {
          tsconfig: 'tsconfig.app.json',
          babelConfig: true, // Ensure this is here and your babel.config.json is set up
        },
      ],
    },
    verbose: true,
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    // No 'globals' needed for 'import.meta.env' if Babel correctly transforms it to process.env
    // If Babel only makes the syntax parsable but doesn't replace `import.meta.env`
    // with `process.env`, then this becomes harder.
};