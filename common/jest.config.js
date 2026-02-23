module.exports = {
    verbose: true,
    transform: {
        '^.+\\.ts?$': 'ts-jest',
    },
    testEnvironment: 'jsdom',
    moduleNameMapper: {
        '^@metheus/common/(.*)$': '<rootDir>/$1',
        '^@metheus/common$': '<rootDir>',
        '\\.(css|less)$': '<rootDir>/__mocks__/styleMock.js',
    },
};
