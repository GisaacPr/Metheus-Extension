# Contributing to Metheus Extension

Thank you for your interest in contributing to Metheus Extension! We welcome contributions from the community to help make language learning accessible to everyone.

## Getting Started

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
    ```bash
    git clone https://github.com/YOUR_USERNAME/metheus-extension.git
    cd metheus-extension
    ```
3. **Install dependencies**:
    ```bash
    yarn install
    ```
4. **Create a branch** for your feature or fix:
    ```bash
    git checkout -b feature/amazing-feature
    ```

## Development Environment

- **Node.js**: v22+
- **Yarn**: v3.2.0 (We use Yarn Berry with workspaces)
- **Editor**: VS Code (recommended) with ESLint and Prettier extensions.

## Running Tests

Please ensure all tests pass before submitting a PR:

```bash
# Run all tests
yarn workspace @metheus/common run test
yarn workspace @metheus/client run test
yarn workspace @metheus/extension run test

# Run verified tests (skipping common tests and bash scripts on Windows)
yarn verify

# Run full verification (requires Bash environment and fixing common tests)
yarn run verify:full
```

> **Note**: `yarn verify` currently skips `@metheus/common` tests and localization scripts due to Windows compatibility issues and pending refactors. Use `yarn run verify:full` in a suitable environment to run everything.

## Code Style

We use **Prettier** and **ESLint** to enforce code style.

- **Lint**: `yarn run eslint common extension/src`
- **Format**: `yarn run pretty`

## Pull Request Process

1. Ensure your code compiles and passes tests (`yarn verify`).
2. Update documentation if you changed any behavior.
3. Submit a Pull Request to the `main` branch.
4. Provide a clear description of the problem and your solution.
5. Include screenshots or GIFs for UI changes.

## License

By contributing, you agree that your contributions will be licensed under the AGPLv3 License.
