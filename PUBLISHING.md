# Publishing Guide for Win-CLI MCP Server Enhanced

This guide outlines the steps needed to publish this enhanced version of the Windows CLI MCP Server to npm.

## Prerequisites

1. **NPM Account**: Ensure you have an npm account and are logged in

   ```bash
   npm login
   ```

2. **Package Name Availability**: Check if your chosen package name is available

   ```bash
   npm view wcli0
   ```

## Pre-Publication Checklist

### 1. Update Package Information

The following have been updated in `package.json`, but you should customize them:

- [ ] **Package name**: Currently set to `wcli0`
- [ ] **Version**: Reset to `1.0.0` for initial publication
- [ ] **Author**: Replace with your name and email
- [ ] **Repository URLs**: Update with your GitHub repository
- [ ] **Homepage**: Update with your repository URL
- [ ] **Description**: Verify it accurately describes your enhanced version

### 2. Update README References

The following have been updated in `README.md`:

- [ ] **Title**: Updated to include "(Enhanced)"
- [ ] **Badge URLs**: Updated to point to new package name
- [ ] **Installation instructions**: Updated with new package name
- [ ] **Acknowledgments section**: Added crediting SimonB97's original work

### 3. Repository Setup

Before publishing, ensure:

- [ ] Create your own GitHub repository
- [ ] Push your code to the new repository
- [ ] Update package.json URLs to match your repository

### 4. Build and Test

```bash
# Clean and build
npm run clean
npm run build

# Run tests to ensure everything works
npm test

# Test the package locally
npm pack
# This creates a .tgz file you can test with: npm install ./wcli0-1.0.0.tgz
```

### 5. Version Management

For future updates, use semantic versioning:

```bash
# Patch version (bug fixes)
npm version patch

# Minor version (new features)
npm version minor

# Major version (breaking changes)
npm version major
```

## Publishing Steps

### 1. Final Verification

```bash
# Check what will be published
npm publish --dry-run

# Review the files that will be included
npm pack --dry-run
```

### 2. Publish to NPM

```bash
# Publish the package
npm publish

# For scoped packages (if you want to use @yourusername/win-cli-mcp-server)
npm publish --access public
```

### 3. Verify Publication

```bash
# Check your package on npm
npm view wcli0

# Test installation
npx wcli0 --help
```

## Post-Publication Tasks

1. **Update Documentation**: Ensure all references point to the new package
2. **GitHub Release**: Create a release tag on GitHub
3. **Announce**: Share your enhanced version with the community

## Scoped Package Alternative

If you prefer a scoped package name (recommended to avoid conflicts):

1. Update package.json:

   ```json
   {
     "name": "@yourusername/win-cli-mcp-server",
     "version": "1.0.0"
   }
   ```

2. Update all README references to use the scoped name
3. Publish with: `npm publish --access public`

## Example Customization

Here's what you need to replace in `package.json`:

```json
{
  "name": "your-preferred-package-name",
  "version": "1.0.0",
  "author": "Your Name <your.email@example.com>",
  "homepage": "https://github.com/yourusername/your-repo-name",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/yourusername/your-repo-name.git"
  },
  "bugs": {
    "url": "https://github.com/yourusername/your-repo-name/issues"
  }
}
```

## Notes

- The enhanced version includes significant improvements over the original SimonB97 version
- All attribution to the original work has been properly added
- The package is ready for publication once you customize the metadata
- Consider using a scoped package name to avoid potential conflicts
