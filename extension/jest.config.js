export default {
    verbose: true,
    transform: {
        '^.+\\.ts?$': 'ts-jest',
    },
    moduleNameMapper: {
        '^@metheus/common/(.*)$': '<rootDir>/../common/$1',
        '^@metheus/common$': '<rootDir>/../common/index.ts',
    },
    testEnvironment: 'jsdom',
};
