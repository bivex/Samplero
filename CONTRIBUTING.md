# 🤝 Contributing to Samplero

Thank you for contributing to Samplero License Server! This document defines the engineering standards, code conventions, and verification workflows required for all contributions.

---

## 1. Code Standards & Philosophy

We follow Google Engineering Practices:
- **Zero Warnings**: Code must compile and pass all linters with zero errors and zero warnings (`eslint`, `tsc`, `go vet`, `flutter analyze`, `cargo check`).
- **Comprehensive Testing**: All new features and bug fixes must include unit and integration tests.
- **Strict Typing**: TypeScript `strict: true` must be maintained; avoid `any` wherever possible.
- **Defensive Security**: Validate all inputs at API boundaries using Zod or typed schemas; never log sensitive cryptographic material or cleartext passwords.

---

## 2. Commit Message Conventions

We adhere to **Conventional Commits**:

```
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

### Types
- `feat`: New feature or capability
- `fix`: Bug fix
- `security`: Cryptographic or security hardening
- `perf`: Performance optimization
- `refactor`: Code refactoring without behavior change
- `test`: Adding or correcting tests
- `docs`: Documentation updates
- `ops`: Infrastructure, Docker, or PKI script changes

---

## 3. Pull Request Checklist

Before submitting a pull request, ensure:
1. `npm test` or `bun test` passes all tests.
2. `go test -v ./...` in `services/cert-signer` passes.
3. `cargo check` in `apps/customer-tauri/src-tauri` completes without errors.
4. `flutter analyze` in `apps/customer_mobile` returns 0 issues.
5. All environment variable changes are documented in `.env.example`.
