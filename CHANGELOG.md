# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-03-28

### Added
- **Secure Storage System**: AES-256 encrypted API key storage with master password protection
- **AI Agent System**: Customizable AI agents with 4 built-in presets (General, Code Expert, Creative Writer, Data Analyst)
- **Unlock Modal**: Session-based security with master password requirement
- **Agent Management**: Add, edit, and delete custom agents with personalized system prompts

### Security
- API keys are now encrypted at rest using AES-256-GCM encryption
- Master password required to unlock storage each session
- Secure key derivation using PBKDF2 with 100,000 iterations

### Changed
- Updated store to support agent selection and management
- Enhanced settings component with agent configuration UI
- Improved API key handling with encryption/decryption flow

## [1.0.1] - 2025-03-25

### Initial Release
- Basic sidebar integration for browser
- Google Gemini API integration
- Chat functionality with AI
- Markdown rendering support
- Code syntax highlighting
- Dark/Light theme support
