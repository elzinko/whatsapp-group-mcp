# Contributing Guidelines

Thank you for your interest in contributing to this project! Please follow these guidelines to ensure smooth collaboration.

## Before You Start

1. Review the [Security Policy](SECURITY.md)
2. Read the [Code of Conduct](CODE_OF_CONDUCT.md)
3. Check existing issues and PRs to avoid duplicates

## Development Setup

```bash
# Clone the repository
git clone https://github.com/elzinko/whatsapp-group-mcp.git
cd whatsapp-group-mcp

# Install dependencies
npm install

# Run tests
npm test
```

## Making Changes

1. Create a new branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Ensure tests pass: `npm test`
4. Commit with clear messages: `git commit -m 'feat: description'`
5. Push to your branch: `git push origin feature/your-feature`
6. Create a Pull Request

## Commit Message Format

Use conventional commits:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Pull Request Process

1. Update documentation if needed
2. Add tests for new features
3. Ensure all tests pass
4. Get at least one approval
5. All conversations must be resolved
6. Squash commits before merging

## Security Considerations

- **Never** commit secrets or credentials
- Use environment variables for sensitive data
- Follow principle of least privilege
- Review security implications of changes

## Testing

Run all tests:
```bash
npm test
```

Run specific test:
```bash
npm run test:allowlist
```

## Code Quality

- Keep code readable and maintainable
- Add comments for complex logic
- Follow existing code style
- No console.log (use pino logger)

## Questions?

Feel free to open an issue or discussion if you have questions!
