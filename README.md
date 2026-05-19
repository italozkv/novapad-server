# NovaPad

<p align="center">
  A modern desktop notes app built to make writing, organizing, and managing ideas more practical.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows">
  <img src="https://img.shields.io/badge/Electron-29.x-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/Node.js-Backend-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/SQLite-Local%20Database-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite">
</p>

<p align="center">
  <a href="https://github.com/italozkv">
    <img src="https://img.shields.io/badge/GitHub-italozkv-181717?style=for-the-badge&logo=github" alt="GitHub">
  </a>
  <a href="mailto:ithalovinicius019@gmail.com">
    <img src="https://img.shields.io/badge/Email-Contact-D14836?style=for-the-badge&logo=gmail&logoColor=white" alt="Email">
  </a>
  <a href="https://www.linkedin.com/in/ithalo-zk/">
    <img src="https://img.shields.io/badge/LinkedIn-Ithalo%20ZK-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn">
  </a>
</p>

<p align="center">
  <img width="1000" alt="NovaPad preview" src="https://github.com/user-attachments/assets/64a7e396-1ac2-45be-ad29-e866ba5aa394" />
</p>

## About NovaPad

NovaPad is an advanced notes application for Windows built with Electron. The project was designed to go beyond a basic notepad by combining note writing, project organization, plugins, reminders, import/export tools, and account-based features in a single desktop experience.

It is a practical app focused on real use: keeping ideas organized, managing notes by workspace, improving writing flow, and giving the user more control over how content is stored and accessed.

## Main Features

- Workspace-based organization for grouping notes by project or subject
- Pinned notes, favorites, and trash management
- Markdown editing with live preview
- Templates for faster writing workflows
- Inline image support inside notes
- Simple table insertion for Markdown content
- Reminder system with desktop notifications
- Focus and presentation modes
- Minimap for long notes
- Import support for `.txt`, `.md`, `.json`, `.csv`, `.html`, `.docx`, `.xlsx`, and `.pdf`
- Export tools built into the editor flow
- Internal plugin system with local plugin loading
- Discord Rich Presence plugin support
- Local authentication, session handling, and license-aware features
- Sync structure prepared for local-to-remote note synchronization

## Project Structure

- `src/` main NovaPad desktop application
- `server/` backend and license/sync-related server logic
- `admin/` desktop admin panel
- `plugins/` local plugin system and plugin examples
- `scripts/` utility scripts such as license key generation

## Tech Stack

<p>
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Electron-20232A?style=for-the-badge&logo=electron&logoColor=61DAFB" alt="Electron">
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/Ace%20Editor-1F6FEB?style=for-the-badge" alt="Ace Editor">
  <img src="https://img.shields.io/badge/CodeMirror-D30707?style=for-the-badge" alt="CodeMirror">
</p>

## Running Locally

```bash
npm install
npm start
```

Useful scripts:

- `npm run admin` opens the NovaPad admin app
- `npm run server` starts the server
- `npm run build` creates the Windows portable build
- `npm run build-installer` creates the Windows installer
- `npm run build-admin` builds the admin app
- `npm run build-admin-installer` builds the admin installer

## Shortcuts

- `Ctrl+N` create a new note
- `Ctrl+S` save the current note
- `Ctrl+E` open export
- `Ctrl+B` show or hide the sidebar
- `Ctrl+P` open presentation mode
- `F11` toggle focus mode

## Notes

- The app includes automatic migration support for older notes into the default workspace
- Local data handling includes fallback protection for corrupted stored content
- Inline images are embedded directly into note content, so very large images can grow data size quickly
- Some licensing and sync features depend on server configuration

## Roadmap Direction

NovaPad is being shaped as more than a simple notes app. The codebase already includes the foundation for:

- account and session handling
- feature licensing and entitlement control
- remote sync support
- plugin-based extensibility
- admin tooling for management workflows

## About Me

### Hi, I'm Ithalo

<p align="center">
  Developer focused on building practical projects, polished interfaces, and tools that solve real problems.
</p>

## What I build

I like learning by building. I have created Discord bots, websites, Roblox games, and desktop applications focused on real everyday use.

My focus is turning ideas into functional projects with clean code, strong presentation, and attention to detail.

## Highlights

- [`novapad-server`](https://github.com/italozkv/novapad-server) - backend and server-side work related to NovaPad
- [`tower-deep-bot`](https://github.com/italozkv/tower-deep-bot) - Discord bot project with custom automation and server features
- [`Superman_toggle_addon`](https://github.com/italozkv/Superman_toggle_addon) - addon created for the Superman: Son of Krypton mod
- [`snapdesk`](https://github.com/italozkv/snapdesk) - website project connected to the SnapDesk idea
- [`snapdesk_website`](https://github.com/italozkv/snapdesk_website) - official website for SnapDesk, a lightweight screenshot tool for Windows

## Featured Stack

<p align="center">
  <img src="https://img.shields.io/badge/Focus-Web%20Development-0A66C2?style=for-the-badge" alt="Web Development">
  <img src="https://img.shields.io/badge/Focus-Desktop%20Apps-1F883D?style=for-the-badge" alt="Desktop Apps">
  <img src="https://img.shields.io/badge/Focus-Discord%20Bots-5865F2?style=for-the-badge" alt="Discord Bots">
  <img src="https://img.shields.io/badge/Focus-Roblox%20Projects-EA4335?style=for-the-badge" alt="Roblox Projects">
</p>

## Contact

- GitHub: `https://github.com/italozkv`
- Email: `ithalovinicius019@gmail.com`
- LinkedIn: `https://www.linkedin.com/in/ithalo-zk/`
