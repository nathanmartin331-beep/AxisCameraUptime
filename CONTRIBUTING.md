# Contributing to Axis Camera Uptime Monitor

First off, thank you for considering contributing to Axis Camera Uptime Monitor! It's people like you that make this tool better for everyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Process](#development-process)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [AI-Assisted Development](#ai-assisted-development)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

### Our Standards

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on what is best for the community
- Show empathy towards other community members

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Git
- Basic understanding of TypeScript, React, and Express

### Setting Up Your Development Environment

1. **Fork the repository** on GitHub

2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/AxisCameraUptime.git
   cd AxisCameraUptime
   ```

3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/AxisCameraUptime.git
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Create environment file**:
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

6. **Initialize database**:
   ```bash
   npm run db:push
   ```

7. **Start development server**:
   ```bash
   npm run dev
   ```

## Development Process

### Finding Something to Work On

- Check the [Issues](https://github.com/yourusername/AxisCameraUptime/issues) page for open issues
- Look for issues labeled `good first issue` if you're new
- Comment on an issue to let others know you're working on it
- If you want to work on something not listed, create an issue first to discuss

### Creating a Branch

Always create a new branch for your work:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-number-description
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Adding or updating tests
- `chore/` - Maintenance tasks

### Making Changes

1. **Make your changes** in your branch
2. **Test your changes** thoroughly
3. **Write/update tests** for your changes
4. **Update documentation** if needed
5. **Commit your changes** with clear commit messages

### Commit Message Guidelines

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples**:
```
feat(camera): add support for AXIS Q-series cameras

- Add Q-series model detection
- Update camera configuration schema
- Add Q-series specific settings

Closes #123
```

```
fix(monitoring): resolve timeout issues with slow cameras

Increase default timeout from 3s to 5s for cameras with
high latency connections.

Fixes #456
```

## Pull Request Process

1. **Update your branch** with the latest upstream changes:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push your branch** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

3. **Create a Pull Request** on GitHub:
   - Use a clear, descriptive title
   - Reference related issues (e.g., "Fixes #123")
   - Describe what changes you made and why
   - Include screenshots for UI changes
   - List any breaking changes

4. **Wait for review**:
   - Respond to feedback promptly
   - Make requested changes
   - Push updates to your branch (they'll appear in the PR)

5. **After approval**:
   - Your PR will be merged by a maintainer
   - You can delete your feature branch

### Pull Request Checklist

Before submitting, ensure:

- [ ] Code follows the project's style guidelines
- [ ] Tests have been added/updated and pass
- [ ] Documentation has been updated
- [ ] Commit messages follow conventions
- [ ] No merge conflicts with main branch
- [ ] All CI checks pass
- [ ] Screenshots included for UI changes
- [ ] Breaking changes are documented

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Avoid `any` types - use proper typing
- Use interfaces for object shapes
- Use enums for fixed sets of values
- Export types that are used in multiple files

**Example**:
```typescript
// Good
interface Camera {
  id: string;
  name: string;
  ipAddress: string;
  status: CameraStatus;
}

enum CameraStatus {
  Online = "online",
  Offline = "offline",
  Error = "error"
}

// Bad
const camera: any = { ... };
```

### React Components

- Use functional components with hooks
- One component per file
- Use descriptive component names
- Extract complex logic into custom hooks
- Use TypeScript for prop types

**Example**:
```typescript
// Good
interface CameraCardProps {
  camera: Camera;
  onStatusChange: (status: CameraStatus) => void;
}

export function CameraCard({ camera, onStatusChange }: CameraCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  // Component logic

  return (
    // JSX
  );
}

// Bad
export default function Component(props: any) {
  // ...
}
```

### CSS/Styling

- Use Tailwind CSS utility classes
- Follow mobile-first responsive design
- Use design system components from `components/ui`
- Avoid inline styles unless necessary

### File Organization

- Place files in appropriate directories
- Group related files together
- Use index files for clean imports
- Keep files focused and under 300 lines

## Testing Guidelines

### Writing Tests

- Write tests for all new features
- Update tests when modifying existing code
- Aim for 80%+ code coverage
- Test edge cases and error conditions

### Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('CameraMonitor', () => {
  beforeEach(() => {
    // Setup
  });

  it('should detect camera online status', async () => {
    // Arrange
    const camera = createTestCamera();

    // Act
    const status = await checkCameraStatus(camera);

    // Assert
    expect(status).toBe('online');
  });

  it('should handle timeout errors', async () => {
    // Test timeout scenario
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test CameraMonitor.test.ts

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### Using Agentic QE Fleet

For comprehensive testing, use the QE Fleet:

```bash
# Generate tests for a module
aqe test camera-monitor --coverage 90

# Analyze coverage gaps
aqe coverage

# Run quality gate
aqe quality
```

## AI-Assisted Development

This project supports AI-assisted development with two powerful systems:

### Hive Mind System

Use for complex, multi-step development tasks:

```bash
# Initialize Hive Mind
npx claude-flow@alpha hive-mind init

# Spawn swarm for feature development
npx claude-flow@alpha hive-mind spawn "Add real-time WebSocket notifications" --auto-spawn

# Monitor swarm progress
npx claude-flow@alpha hive-mind status
```

**When to use**:
- Implementing complex features
- Large refactoring tasks
- Multi-component changes
- System-wide updates

### Agentic QE Fleet

Use for quality assurance and testing:

```bash
# Generate comprehensive tests
aqe test auth --coverage 90 --framework vitest

# Analyze test coverage
aqe coverage

# Security scanning
aqe security

# Performance testing
aqe performance
```

**When to use**:
- Writing test suites
- Security audits
- Performance optimization
- Quality gate validation

### Best Practices with AI Agents

1. **Be specific** with task descriptions
2. **Review generated code** before committing
3. **Run tests** to validate AI output
4. **Document AI-assisted changes** in commit messages
5. **Use for repetitive tasks** to save time

## Documentation

### Code Documentation

- Add JSDoc comments to public functions
- Document complex logic
- Keep comments up-to-date
- Use TypeScript types as primary documentation

### README Updates

If your changes affect:
- Installation process
- Configuration
- API endpoints
- Features

Update the README.md accordingly.

### Changelog

For significant changes, add an entry to CHANGELOG.md:

```markdown
## [Unreleased]

### Added
- Real-time WebSocket notifications for camera status changes

### Fixed
- Camera timeout issues with slow network connections

### Changed
- Increased default monitoring interval to 5 minutes
```

## Questions?

- Create an issue for bug reports or feature requests
- Start a discussion for questions and ideas
- Check existing issues and discussions first
- Be patient and respectful

## Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes for significant contributions
- GitHub contributors page

Thank you for contributing! 🎉

---

**Happy Coding!** 🚀
